const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

// Executa os repositórios/migrações reais com SQLite em memória, sem runtime nativo Expo.
function harness() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql) => sqlite.exec(sql),
    runAsync: async (sql, ...args) => sqlite.prepare(sql).run(...(Array.isArray(args[0]) ? args[0] : args)),
    getAllAsync: async (sql, ...args) => sqlite.prepare(sql).all(...(Array.isArray(args[0]) ? args[0] : args)),
    getFirstAsync: async (sql, ...args) => sqlite.prepare(sql).get(...(Array.isArray(args[0]) ? args[0] : args)),
    withTransactionAsync: async (fn) => {
      sqlite.exec('BEGIN');
      try { await fn(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(file, module.exports);
    const localRequire = (name) => {
      if (name === 'expo-sqlite') return {};
      if (name === 'react-native-get-random-values') return {};
      if (name === 'uuid') return { v4: () => 'fixture-uuid' };
      if (name === './outbox') return {};
      if (name.endsWith('/database')) return { getDb: async () => db };
      if (name.startsWith('@/')) return load(path.join(__dirname, '../src', name.slice(2) + '.ts'));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
      return require(name);
    };
    new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
    return module.exports;
  }
  const fromSrc = (name) => load(path.join(__dirname, '../src', name));
  return { sqlite, db, fromSrc };
}

test('migração OTA aditiva, API antiga, flags 0/1 e renovação do catálogo', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    const { runMigrations, clearSyncTables } = fromSrc('db/migrations.ts');
    const { bulkInsertProdutos } = fromSrc('db/repositories/produtos.ts');
    const { bulkInsertEmpresas } = fromSrc('db/repositories/empresas.ts');
    const { getEmpresaParametros } = fromSrc('db/repositories/parametros.ts');
    const { podeSincronizarProduto } = fromSrc('sync/produtoLiberadoInternet.ts');
    await runMigrations(db);
    await runMigrations(db);
    sqlite.prepare('INSERT INTO outbox_venda (client_id, cd_cliente, cd_empresa, holding_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('venda-pendente', 1, 1, 7, '{"teste":true}', '2026-08-31');
    await bulkInsertEmpresas([{ cdEmpresa: 1 }], 7);
    assert.equal((await getEmpresaParametros(1, 7)).idVerificaTambemColunaLiberadoInternet, false);
    await bulkInsertProdutos([{ cdProduto: 1 }, { cdProduto: 2, idLiberadoInternet: false }], 7);
    assert.equal(sqlite.prepare('SELECT id_liberado_internet AS flag FROM produto WHERE cd_produto=1').get().flag, 1);
    assert.equal(sqlite.prepare('SELECT id_liberado_internet AS flag FROM produto WHERE cd_produto=2').get().flag, 0);
    // Simula banco anterior à OTA, com produtos já baixados.
    sqlite.exec('ALTER TABLE produto DROP COLUMN id_liberado_internet');
    sqlite.exec('ALTER TABLE empresa DROP COLUMN id_verifica_tambem_coluna_liberado_internet');
    await runMigrations(db);
    assert.equal(sqlite.prepare('SELECT id_liberado_internet AS flag FROM produto WHERE cd_produto=1').get().flag, 1);
    await bulkInsertEmpresas([{ cdEmpresa: 1, idVerificaTambemColunaLiberadoInternet: 1 }], 7);
    const flag = (await getEmpresaParametros(1, 7)).idVerificaTambemColunaLiberadoInternet;
    assert.equal(flag, true);
    const produtos = [{ cdProduto: 1, idSituacao: 'A', idLiberadoInternet: true }, { cdProduto: 2, idSituacao: 'A', idLiberadoInternet: false }];
    await clearSyncTables(db);
    await bulkInsertProdutos(produtos.filter((produto) => podeSincronizarProduto(produto, flag)), 7);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM produto').get().n, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM produto WHERE cd_produto=2').get().n, 0);
    assert.equal(sqlite.prepare('SELECT payload FROM outbox_venda WHERE client_id=?').get('venda-pendente').payload, '{"teste":true}');
  } finally { sqlite.close(); }
});

test('preferência do cliente sobrevive à OTA e sincronização remove preferência antiga', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    const { runMigrations } = fromSrc('db/migrations.ts');
    const { bulkInsertClientes, getClienteById } = fromSrc('db/repositories/clientes.ts');
    await runMigrations(db);
    sqlite.exec('ALTER TABLE cliente DROP COLUMN cd_tabela_preco_condicao');
    sqlite.exec('ALTER TABLE cliente DROP COLUMN cd_condicao_preco_padrao');
    await runMigrations(db);
    await runMigrations(db);
    await bulkInsertClientes([{ cdCliente: 300851, cdTabelaPrecoCondicao: 29, cdCondicaoPrecoPadrao: 13 }], 28);
    let cliente = await getClienteById(300851, 28);
    assert.equal(cliente.cd_tabela_preco_condicao, 29);
    assert.equal(cliente.cd_condicao_preco_padrao, 13);
    await bulkInsertClientes([{ cdCliente: 300851 }], 28);
    cliente = await getClienteById(300851, 28);
    assert.equal(cliente.cd_tabela_preco_condicao, null);
    assert.equal(cliente.cd_condicao_preco_padrao, null);
  } finally { sqlite.close(); }
});

test('produto sem URL continua no catálogo e recupera foto do cache quando volta a ter saldo', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    const { runMigrations, clearSyncTables } = fromSrc('db/migrations.ts');
    const { bulkInsertProdutos, listProdutosComFotoPendente, setProdutoFotoLocal } = fromSrc('db/repositories/produtos.ts');
    await runMigrations(db);
    const produto = { cdProduto: 4, fotoUrl: 'https://fixture/4.jpg' };
    await bulkInsertProdutos([produto], 28);
    assert.equal((await listProdutosComFotoPendente()).length, 1);
    await setProdutoFotoLocal(4, 28, 'file:///cache/4.jpg');
    await clearSyncTables(db);
    await bulkInsertProdutos([{ ...produto, fotoUrl: null }], 28);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM produto').get().n, 1);
    assert.equal((await listProdutosComFotoPendente()).length, 0);
    await clearSyncTables(db);
    await bulkInsertProdutos([produto], 28);
    assert.equal(sqlite.prepare('SELECT foto_local FROM produto WHERE cd_produto=4').get().foto_local, 'file:///cache/4.jpg');
    assert.equal((await listProdutosComFotoPendente()).length, 0);
  } finally { sqlite.close(); }
});

test('cliente 300851 escolhe condição resolvida 13 e motor calcula 8,03 sobre tabela 7,30', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    await fromSrc('db/migrations.ts').runMigrations(db);
    const { bulkInsertClientes, getClienteById } = fromSrc('db/repositories/clientes.ts');
    const { escolherCondicaoPrecoPadrao } = fromSrc('services/pricing/condicaoPrecoPadrao.ts');
    const { calcularPrecoUnitario } = fromSrc('services/pricing/precoUnitario.ts');
    await bulkInsertClientes([{ cdCliente: 300851, cdTabelaPreco: 6, cdTabelaPrecoCondicao: 29, cdCondicaoPrecoPadrao: 13 }], 28);
    const cliente = await getClienteById(300851, 28);
    const condicao = escolherCondicaoPrecoPadrao([
      { cdCondicaoPreco: 1, idPromocao: false, idUltimaVenda: false, prAcrescimo: 0, idTipoAcrescimo: 'V' },
      { cdCondicaoPreco: 13, idPromocao: false, idUltimaVenda: false, prAcrescimo: 10, idTipoAcrescimo: 'V' },
    ], cliente.cd_condicao_preco_padrao);
    const result = await calcularPrecoUnitario({
      contexto: { empresa: { nrCasaDecimalValorVenda: 2 }, cdTabelaPreco: 6, condicaoPreco: condicao },
      precoTabela: { vlVenda: 7.3 },
      qt: 1, cdProduto: 4, holdingId: 28,
    });
    assert.equal(result.vlUnitario, 8.03);
    assert.equal(result.trace.cdCondicaoPreco, 13);
  } finally { sqlite.close(); }
});

test('bloqueio por atraso migra via OTA, permanece offline e limpa após pagamento ou desativação', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    const { runMigrations } = fromSrc('db/migrations.ts');
    const { bulkInsertClientes, getClienteById } = fromSrc('db/repositories/clientes.ts');
    const { clienteComVendaBloqueada } = fromSrc('db/clienteAtrasado.ts');
    await runMigrations(db);
    sqlite.exec('ALTER TABLE cliente DROP COLUMN id_bloqueia_venda_cliente_atrasado_app');
    sqlite.exec('ALTER TABLE cliente DROP COLUMN dt_primeiro_titulo_aberto');
    await runMigrations(db);
    await bulkInsertClientes([{ cdCliente: 1, idBloqueiaVendaClienteAtrasadoApp: true, dtPrimeiroTituloAberto: '2000-01-01' }], 28);
    assert.equal(clienteComVendaBloqueada(await getClienteById(1, 28)), true);
    await bulkInsertClientes([{ cdCliente: 1, idBloqueiaVendaClienteAtrasadoApp: true, dtPrimeiroTituloAberto: null }], 28);
    assert.equal(clienteComVendaBloqueada(await getClienteById(1, 28)), false);
    await bulkInsertClientes([{ cdCliente: 1 }], 28);
    assert.equal((await getClienteById(1, 28)).id_bloqueia_venda_cliente_atrasado_app, 0);
  } finally { sqlite.close(); }
});

test('modelo de impressão e cadastro completo sobrevivem à migração e à sincronização offline', async () => {
  const {sqlite,db,fromSrc}=harness();
  try {
    const {runMigrations}=fromSrc('db/migrations.ts');
    const {bulkInsertEmpresas,getEmpresaById}=fromSrc('db/repositories/empresas.ts');
    const {bulkInsertClientes}=fromSrc('db/repositories/clientes.ts');
    const {bulkInsertProdutos}=fromSrc('db/repositories/produtos.ts');
    const {complementarPedidoPdf}=fromSrc('services/pdf/dados.ts');
    await runMigrations(db);
    sqlite.exec('ALTER TABLE empresa DROP COLUMN raw_json');
    await runMigrations(db);
    await bulkInsertEmpresas([{cdEmpresa:3,nmEmpresa:'Empresa',modeloImpressaoApp:'detalhado_fotos',inscEstadual:'123',cidade:{nmCidade:'Criciúma',cdEstado:'SC'}}],28);
    const empresa=await getEmpresaById(3,28);
    assert.equal(JSON.parse(empresa.raw_json).modeloImpressaoApp,'detalhado_fotos');
    assert.equal(JSON.parse(empresa.raw_json).inscEstadual,'123');
    await bulkInsertClientes([{cdCliente:1,nmCliente:'Cliente',rg:'ISENTO',cep:'88000000',fone:'123'}],28);
    await bulkInsertProdutos([{cdProduto:4,dsProduto:'Produto',cdClassificacaoFiscal:'01234567',produtoBarra:[{cdBarra:'07890000000001'}]}],28);
    await bulkInsertProdutos([{cdProduto:4,cdClassificacaoFiscal:'99999999',produtoBarra:[{cdBarra:'outra holding'}]}],99);
    const result=await complementarPedidoPdf({holdingId:28,cdCliente:1,clienteNome:'Cliente',data:'17/09/2026',vlTotal:8.03,itens:[{cdProduto:4,descricao:'Nome salvo',qt:1,vlUnitario:8.03,vlTotal:8.03},{cdProduto:5,descricao:'Fora do catálogo',qt:1,vlUnitario:2,vlTotal:2}]});
    assert.equal(result.itens[0].ncm,'01234567');
    assert.equal(result.itens[0].codigoBarras,'07890000000001');
    assert.equal(result.itens[0].descricao,'Nome salvo');
    assert.equal(result.itens[0].vlUnitario,8.03);
    assert.equal(result.itens.length,2);
    assert.equal(result.clienteIe,'ISENTO');
    await bulkInsertEmpresas([{cdEmpresa:3,nmEmpresa:'API anterior'}],28);
    assert.equal(JSON.parse((await getEmpresaById(3,28)).raw_json).modeloImpressaoApp,undefined);
  } finally {sqlite.close();}
});

test('incremento por holding persiste offline, desativa na próxima busca e API antiga permanece sem botões', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    await fromSrc('db/migrations.ts').runMigrations(db);
    const { bulkInsertEmpresas } = fromSrc('db/repositories/empresas.ts');
    const { getEmpresaParametros } = fromSrc('db/repositories/parametros.ts');
    const enabled = { cdEmpresa: 1, idMostraIncrementoValorApp: true, vlIncrementoValorApp: 0.05 };
    await bulkInsertEmpresas([enabled], 28);
    await bulkInsertEmpresas([{ cdEmpresa: 1 }], 9);
    const read = (holding) => getEmpresaParametros(1, holding);
    assert.equal((await read(28)).idMostraIncrementoValorApp, true);
    assert.equal((await read(28)).vlIncrementoValorApp, 0.05);
    assert.equal((await read(9)).idMostraIncrementoValorApp, false);
    assert.equal((await read(99)).idMostraIncrementoValorApp, false);
    await bulkInsertEmpresas([{ ...enabled, vlIncrementoValorApp: 0.10 }], 28);
    assert.equal((await read(28)).vlIncrementoValorApp, 0.10);
    await bulkInsertEmpresas([{ ...enabled, idMostraIncrementoValorApp: false }], 28);
    assert.equal((await read(28)).idMostraIncrementoValorApp, false);
    await bulkInsertEmpresas([enabled], 28);
    await bulkInsertEmpresas([{ cdEmpresa: 1 }], 28);
    assert.equal((await read(28)).idMostraIncrementoValorApp, false);
    sqlite.exec("UPDATE empresa SET raw_json='inválido' WHERE holding_id=28");
    assert.equal((await read(28)).idMostraIncrementoValorApp, false);
  } finally { sqlite.close(); }
});

test('exibição da última compra vem ativada por padrão e respeita a configuração da holding', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    await fromSrc('db/migrations.ts').runMigrations(db);
    const { bulkInsertEmpresas } = fromSrc('db/repositories/empresas.ts');
    const { getEmpresaParametros } = fromSrc('db/repositories/parametros.ts');
    await bulkInsertEmpresas([{ cdEmpresa: 1 }], 28);
    assert.equal((await getEmpresaParametros(1, 28)).idMostraUltimaCompraApp, true);
    await bulkInsertEmpresas([{ cdEmpresa: 1, idMostraUltimaCompraApp: false }], 28);
    assert.equal((await getEmpresaParametros(1, 28)).idMostraUltimaCompraApp, false);
    sqlite.exec("UPDATE empresa SET raw_json='inválido' WHERE holding_id=28");
    assert.equal((await getEmpresaParametros(1, 28)).idMostraUltimaCompraApp, true);
  } finally { sqlite.close(); }
});

test('formata CPF e CNPJ para os detalhes da venda', () => {
  const { sqlite, fromSrc } = harness();
  try {
    const { fmtCpfCnpj } = fromSrc('utils/format.ts');
    assert.equal(fmtCpfCnpj('12345678901'), '123.456.789-01');
    assert.equal(fmtCpfCnpj('12.345.678/0001-90'), '12.345.678/0001-90');
    assert.equal(fmtCpfCnpj(null), null);
  } finally { sqlite.close(); }
});

test('passo de cinco centavos preserva precisão e não produz preço negativo', () => {
  const { sqlite, fromSrc } = harness();
  try {
    const { incrementarValor, lerIncrementoValor } = fromSrc('services/pricing/incrementoValor.ts');
    assert.equal(incrementarValor(6.55, 0.05, 1), 6.60);
    assert.equal(incrementarValor(6.55, 0.05, -1), 6.50);
    assert.equal(incrementarValor(6.555, 0.05, 1), 6.605);
    let valor = 6.55;
    for (let i = 0; i < 100; i++) valor = incrementarValor(valor, 0.05, 1);
    assert.equal(valor, 11.55);
    for (let i = 0; i < 100; i++) valor = incrementarValor(valor, 0.05, -1);
    assert.equal(valor, 6.55);
    assert.equal(incrementarValor(0.03, 0.05, -1), 0);
    for (const passo of [0, -0.05, 0.005, '0.05', null, 1000000])
      assert.equal(lerIncrementoValor(JSON.stringify({ idMostraIncrementoValorApp: true, vlIncrementoValorApp: passo })).idMostraIncrementoValorApp, false);
    assert.equal(lerIncrementoValor('{"idMostraIncrementoValorApp":"true","vlIncrementoValorApp":0.05}').idMostraIncrementoValorApp, false);
  } finally { sqlite.close(); }
});
