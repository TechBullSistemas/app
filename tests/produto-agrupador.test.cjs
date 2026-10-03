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
    runAsync: async (sql, ...args) =>
      sqlite.prepare(sql).run(...(Array.isArray(args[0]) ? args[0] : args)),
    getAllAsync: async (sql, ...args) =>
      sqlite.prepare(sql).all(...(Array.isArray(args[0]) ? args[0] : args)),
    getFirstAsync: async (sql, ...args) =>
      sqlite.prepare(sql).get(...(Array.isArray(args[0]) ? args[0] : args)),
    withTransactionAsync: async (fn) => {
      sqlite.exec('BEGIN');
      try {
        await fn();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const module = { exports: {} };
    cache.set(file, module.exports);
    const localRequire = (name) => {
      if (name === 'expo-sqlite') return {};
      if (name === 'react-native-get-random-values') return {};
      if (name === 'uuid') return { v4: () => 'fixture-uuid' };
      if (name === './outbox') return {};
      if (name.endsWith('/database')) return { getDb: async () => db };
      if (name.startsWith('@/'))
        return load(path.join(__dirname, '../src', name.slice(2) + '.ts'));
      if (name.startsWith('.'))
        return load(path.resolve(path.dirname(file), name + '.ts'));
      return require(name);
    };
    new Function('require', 'module', 'exports', output)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }
  const fromSrc = (name) => load(path.join(__dirname, '../src', name));
  return { sqlite, db, fromSrc };
}

test('seleção pelo agrupador: migração aditiva, gravação e produtos do mesmo agrupador', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    const { runMigrations } = fromSrc('db/migrations.ts');
    const { bulkInsertProdutos, listProdutos, listProdutosDoAgrupador } =
      fromSrc('db/repositories/produtos.ts');
    const { bulkInsertTabelaPrecoItem } = fromSrc(
      'db/repositories/tabelaPrecoItem.ts',
    );
    const { caracteristicasDoProduto, temAgrupador } = fromSrc(
      'utils/produtoAgrupador.ts',
    );

    await runMigrations(db);
    // Banco anterior à OTA: produtos já baixados, sem as colunas novas.
    await bulkInsertProdutos([{ cdProduto: 500, dsProduto: 'Antigo' }], 6);
    for (const coluna of ['caracteristicas_json', 'ds_agrupador']) {
      sqlite.exec(`ALTER TABLE produto DROP COLUMN ${coluna}`);
    }
    sqlite.exec('DROP INDEX idx_produto_agrupador');
    sqlite.exec('ALTER TABLE produto DROP COLUMN cd_agrupador');
    await runMigrations(db);
    await runMigrations(db);

    const preco = [{ vlVenda: 10 }];
    const cor = (valor) => ({ dsCaracteristicaProduto: 'COR', valor });
    // Holding 31 com a opção ligada: a API envia agrupador e características.
    await bulkInsertProdutos(
      [
        {
          cdProduto: 1,
          dsProduto: 'TANGA PRETA',
          cdAgrupador: 213,
          dsAgrupador: 'TANGA PRAZER',
          caracteristicas: [
            cor('PRETO'),
            { dsCaracteristicaProduto: 'TAMANHO', valor: 'M' },
          ],
          tabelaPrecoItem: preco,
        },
        {
          cdProduto: 2,
          dsProduto: 'TANGA BRANCA',
          cdAgrupador: 213,
          dsAgrupador: 'TANGA PRAZER',
          caracteristicas: [cor('BRANCO')],
          tabelaPrecoItem: preco,
        },
        // Sem característica cadastrada no DUAPI: entra pela descrição.
        {
          cdProduto: 3,
          dsProduto: 'TANGA AZUL',
          cdAgrupador: 213,
          dsAgrupador: 'TANGA PRAZER',
          caracteristicas: [],
          tabelaPrecoItem: preco,
        },
        // Sem preço e serviço não entram na venda.
        { cdProduto: 4, dsProduto: 'TANGA SEM PRECO', cdAgrupador: 213 },
        {
          cdProduto: 5,
          dsProduto: 'SERVICO',
          cdAgrupador: 213,
          idTipoProduto: 'S',
          tabelaPrecoItem: preco,
        },
        // Agrupador 1 é "NAO AGRUPAR" e outro agrupador não se mistura.
        {
          cdProduto: 6,
          dsProduto: 'AVULSO',
          cdAgrupador: 1,
          tabelaPrecoItem: preco,
        },
        {
          cdProduto: 7,
          dsProduto: 'LIGA',
          cdAgrupador: 86,
          tabelaPrecoItem: preco,
        },
      ],
      31,
    );
    // Holding sem a opção: a API não envia os campos.
    await bulkInsertProdutos(
      [{ cdProduto: 1, dsProduto: 'Outro', tabelaPrecoItem: preco }],
      6,
    );

    const variacoes = await listProdutosDoAgrupador(213, 31, true);
    assert.deepEqual(
      variacoes.map((p) => p.descricao),
      ['TANGA AZUL', 'TANGA BRANCA', 'TANGA PRETA'],
    );
    assert.deepEqual(
      variacoes.map((p) => p.ds_agrupador),
      ['TANGA PRAZER', 'TANGA PRAZER', 'TANGA PRAZER'],
    );
    assert.deepEqual(
      variacoes.map((p) => caracteristicasDoProduto(p.caracteristicas_json)),
      [
        [],
        [{ nome: 'COR', valor: 'BRANCO' }],
        [
          { nome: 'COR', valor: 'PRETO' },
          { nome: 'TAMANHO', valor: 'M' },
        ],
      ],
    );
    // Sem o filtro de preço, só o serviço continua fora.
    assert.equal((await listProdutosDoAgrupador(213, 31)).length, 4);
    assert.deepEqual(await listProdutosDoAgrupador(213, 6, true), []);

    // O preço da tabela do cliente vale também para as variações.
    await bulkInsertTabelaPrecoItem(
      [
        { cdTabelaPreco: 2, cdProduto: 1, vlVenda: 25 },
        { cdTabelaPreco: 2, cdProduto: 4, vlVenda: 30 },
      ],
      31,
    );
    assert.deepEqual(
      (await listProdutosDoAgrupador(213, 31, true, 2)).map((p) => [
        p.cd_produto,
        p.vl_venda,
      ]),
      [
        [3, 10],
        [2, 10],
        [1, 25],
        [4, 30],
      ],
    );

    // A lista de produtos entrega o agrupador para o seletor decidir.
    const lista = await listProdutos(undefined, 100, 31, true);
    assert.deepEqual(
      lista.map((p) => [p.cd_produto, temAgrupador(p.cd_agrupador)]),
      [
        [1, true],
        [2, true],
        [3, true],
        [6, false],
        [7, true],
      ],
    );
    const outro = (await listProdutos(undefined, 100, 6, true)).find(
      (p) => p.cd_produto === 1,
    );
    assert.deepEqual(
      [outro.cd_agrupador, outro.ds_agrupador, outro.caracteristicas_json],
      [null, null, null],
    );

    // Nova carga sem a opção (desligada na web) limpa o agrupador.
    await bulkInsertProdutos(
      [{ cdProduto: 1, dsProduto: 'TANGA PRETA', tabelaPrecoItem: preco }],
      31,
    );
    assert.deepEqual(
      (await listProdutosDoAgrupador(213, 31, true)).map((p) => p.cd_produto),
      [3, 2],
    );

    for (const [valor, esperado] of [
      [null, false],
      [undefined, false],
      [0, false],
      [1, false],
      ['1', false],
      [2, true],
      ['213', true],
      [2.5, false],
      ['x', false],
    ]) {
      assert.equal(temAgrupador(valor), esperado, String(valor));
    }
    for (const invalido of [null, '', 'nao-json', '{}', '[{"valor":"X"}]']) {
      assert.deepEqual(caracteristicasDoProduto(invalido), []);
    }
  } finally {
    sqlite.close();
  }
});

test('opção de seleção pelo agrupador fica isolada por holding e vem desligada', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    await fromSrc('db/migrations.ts').runMigrations(db);
    const { bulkInsertEmpresas } = fromSrc('db/repositories/empresas.ts');
    const { getEmpresaParametros } = fromSrc('db/repositories/parametros.ts');
    await bulkInsertEmpresas(
      [{ cdEmpresa: 1, idSelecionaProdutoAgrupador: true }],
      31,
    );
    // API antiga (sem o campo) e valor não booleano mantêm a seleção atual.
    await bulkInsertEmpresas([{ cdEmpresa: 1 }], 7);
    await bulkInsertEmpresas(
      [{ cdEmpresa: 1, idSelecionaProdutoAgrupador: 'true' }],
      9,
    );
    assert.equal(
      (await getEmpresaParametros(1, 31)).idSelecionaProdutoAgrupador,
      true,
    );
    assert.equal(
      (await getEmpresaParametros(1, 7)).idSelecionaProdutoAgrupador,
      false,
    );
    assert.equal(
      (await getEmpresaParametros(1, 9)).idSelecionaProdutoAgrupador,
      false,
    );
    // Empresa ainda não baixada.
    assert.equal(
      (await getEmpresaParametros(2, 31)).idSelecionaProdutoAgrupador,
      false,
    );
  } finally {
    sqlite.close();
  }
});
