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
      if (name.endsWith('/database')) return { getDb: async () => db };
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
