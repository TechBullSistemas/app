import assert from 'node:assert/strict';
import test from 'node:test';
import { escolherCondicaoPrecoPadrao } from './condicaoPrecoPadrao';

const opcoes = [
  { cdCondicaoPreco: 1, idPromocao: false, idUltimaVenda: false, vlValor: 7.3 },
  { cdCondicaoPreco: 2, idPromocao: true, idUltimaVenda: false, vlValor: 7 },
  { cdCondicaoPreco: 13, idPromocao: false, idUltimaVenda: false, vlValor: 8.03 },
];

test('preferência do cliente usa LUCRO REAL em vez da primeira condição NORMAL', () => {
  const escolhida = escolherCondicaoPrecoPadrao(opcoes, 13);
  assert.equal(escolhida?.cdCondicaoPreco, 13);
  assert.equal(escolhida?.vlValor, 8.03);
  assert.equal(escolherCondicaoPrecoPadrao(opcoes, 2)?.cdCondicaoPreco, 2);
});

test('sem preferência ou vínculo indisponível mantém o padrão anterior', () => {
  for (const codigo of [undefined, null, 999]) {
    assert.equal(escolherCondicaoPrecoPadrao(opcoes, codigo)?.cdCondicaoPreco, 1);
  }
  assert.equal(escolherCondicaoPrecoPadrao([opcoes[1]], null)?.cdCondicaoPreco, 2);
  assert.equal(escolherCondicaoPrecoPadrao([], 13), undefined);
});
