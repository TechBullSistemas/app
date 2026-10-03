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

test('código do DUAPI: migração aditiva, gravação, busca e exibição', async () => {
  const { sqlite, db, fromSrc } = harness();
  try {
    const { runMigrations } = fromSrc('db/migrations.ts');
    const {
      bulkInsertProdutos,
      listProdutos,
      listProdutosVendidos,
      getProdutoById,
      getProdutoCodigosDuapi,
    } = fromSrc('db/repositories/produtos.ts');
    const { codigoProduto } = fromSrc('utils/codigoProduto.ts');
    const { buildHtmlPadrao } = fromSrc('services/pdf/padrao.ts');

    await runMigrations(db);
    // Banco anterior à OTA: produtos já baixados, sem a coluna nova.
    await bulkInsertProdutos([{ cdProduto: 500, dsProduto: 'Antigo' }], 6);
    sqlite.exec('ALTER TABLE produto DROP COLUMN cd_produto_duapi');
    await runMigrations(db);
    await runMigrations(db);
    assert.equal((await getProdutoById(500, 6)).cd_produto_duapi, null);

    // Holding 31 usa código texto: cd_produto é sequencial interno.
    await bulkInsertProdutos(
      [
        { cdProduto: 1, cdProdutoDuapi: '0500-AZ', dsProduto: 'Camisa' },
        { cdProduto: 2, cdProdutoDuapi: ' 37 ', dsProduto: 'Calça' },
        { cdProduto: 37, cdProdutoDuapi: 'XYZ', dsProduto: 'Meia' },
      ],
      31,
    );
    // Holding 6 (API sem o campo) continua com o código interno.
    await bulkInsertProdutos([{ cdProduto: 37, dsProduto: 'Numérico' }], 6);

    const codigos = async (search, holdingId) =>
      (await listProdutos(search, 100, holdingId)).map((p) =>
        codigoProduto(p.cd_produto, p.cd_produto_duapi),
      );
    assert.deepEqual(await codigos(undefined, 31), ['0500-AZ', '37', 'XYZ']);
    // "37" encontra o código do DUAPI 37, não o produto de código interno 37.
    assert.deepEqual(await codigos('37', 31), ['37']);
    assert.deepEqual(await codigos('500-az', 31), ['0500-AZ']);
    assert.deepEqual(await codigos('xyz', 31), ['XYZ']);
    assert.deepEqual(await codigos('camisa', 31), ['0500-AZ']);
    // Sem código do DUAPI, a busca pelo código interno é a de sempre.
    assert.deepEqual(await codigos('37', 6), ['37']);
    assert.deepEqual(await codigos('50', 6), ['500']);
    assert.deepEqual(
      (await listProdutosVendidos([1, 2, 37], 31, '37')).map(
        (p) => p.cd_produto,
      ),
      [2],
    );

    assert.deepEqual(
      [...(await getProdutoCodigosDuapi([1, 2, 37, 999], 31))],
      [
        [1, '0500-AZ'],
        [2, '37'],
        [37, 'XYZ'],
      ],
    );
    assert.equal((await getProdutoCodigosDuapi([37, 500], 6)).size, 0);

    assert.equal(codigoProduto(37, null), '37');
    assert.equal(codigoProduto(37, '  '), '37');
    assert.equal(codigoProduto(1, '0500-AZ'), '0500-AZ');

    const item = { descricao: 'Camisa', qt: 1, vlUnitario: 10, vlTotal: 10 };
    const html = buildHtmlPadrao(
      {
        numero: 1,
        clienteNome: 'Cliente',
        data: '01/10/2026',
        vlTotal: 20,
        itens: [
          { ...item, cdProduto: 1, codigo: '0500-AZ<' },
          { ...item, cdProduto: 987654 },
        ],
      },
      null,
    );
    assert.match(html, /<td>0500-AZ&lt;<\/td>/);
    assert.match(html, /<td>987654<\/td>/);
    assert.doesNotMatch(html, /<td>1<\/td>/);
  } finally {
    sqlite.close();
  }
});
