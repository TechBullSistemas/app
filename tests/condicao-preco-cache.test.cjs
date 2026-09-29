const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '../src/services/pricing/condicaoPrecoCache.ts'),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleFixture = { exports: {} };
new Function('module', 'exports', output)(moduleFixture, moduleFixture.exports);
const { condicaoPrecoCacheKey } = moduleFixture.exports;

test('carga e seletor usam a mesma chave para todas as condições', () => {
  const params = {
    cdProduto: 123,
    qt: 2,
    cdTabelaPreco: 6,
    cdCondicaoPagto: 4,
    cdCliente: 300851,
  };

  assert.equal(
    condicaoPrecoCacheKey({ ...params, apenasPadrao: false }),
    condicaoPrecoCacheKey(params),
  );
  assert.match(condicaoPrecoCacheKey(params), /\|todas$/);
  assert.match(
    condicaoPrecoCacheKey({ ...params, apenasPadrao: true }),
    /\|padrao$/,
  );
});
