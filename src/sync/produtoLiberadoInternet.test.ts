import assert from 'node:assert/strict';
import test from 'node:test';
import { podeSincronizarProduto, produtoLiberadoInternet } from './produtoLiberadoInternet';

test('matriz ativo/inativo × liberado/bloqueado × configuração', () => {
  for (const idSituacao of ['A', 'I']) {
    for (const idLiberadoInternet of [true, false]) {
      for (const verifica of [true, false]) {
        assert.equal(
          podeSincronizarProduto({ idSituacao, idLiberadoInternet }, verifica),
          idSituacao === 'A' && (!verifica || idLiberadoInternet),
        );
      }
    }
  }
});

test('compatibilidade de booleanos e APIs anteriores', () => {
  for (const value of [true, 1, 'S', ' s ', null, undefined, '']) {
    assert.equal(produtoLiberadoInternet(value), true);
  }
  for (const value of [false, 0, 'N', ' n ', 'false']) {
    assert.equal(produtoLiberadoInternet(value), false);
  }
  assert.equal(podeSincronizarProduto({ idSituacao: 'A' }, true), true);
  assert.equal(podeSincronizarProduto({ idSituacao: 'I' }, false), false);
});
