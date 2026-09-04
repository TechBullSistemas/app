import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calcularAliquotaIcmsEfetiva,
  pickReducaoIcmsInterno,
} from './aliquotas';
import type { ImpostoUfEngine } from './types';

const imposto: ImpostoUfEngine = {
  cdImposto: 7,
  cdEstado: 'SC',
  prIcmsInterno: 17,
  prIcmsInternoRevenda: 0,
  prIcmsInternoIndustria: 0,
  prIcmsExterno: 0,
  prBaseSubstituicaoInterno: 0,
  prBaseSubstituicaoExterno: 0,
  prReducaoBaseSubstituicaoInterno: 0,
  prReducaoBaseSubstituicaoExterno: 0,
  prReducaoIcmsInterno: 10,
  prReducaoIcmsInternoConsumidor: 48.23,
  prReducaoIcmsInternoIndustria: 25,
  prReducaoIcmsExterno: 0,
  prPis: 0.65,
  prCofins: 3,
  prFcp: 0,
  prFcpSt: 0,
};

test('escolhe a redução interna pelo tipo do cliente', () => {
  assert.equal(pickReducaoIcmsInterno(imposto, 'C'), 48.23);
  assert.equal(pickReducaoIcmsInterno(imposto, 'R'), 10);
  assert.equal(pickReducaoIcmsInterno(imposto, 'I'), 25);
});

test('preserva zero explícito e usa legado quando campo novo está ausente', () => {
  assert.equal(
    pickReducaoIcmsInterno(
      { ...imposto, prReducaoIcmsInternoConsumidor: 0 },
      'C',
    ),
    0,
  );
  assert.equal(
    pickReducaoIcmsInterno(
      { ...imposto, prReducaoIcmsInternoConsumidor: null },
      'C',
    ),
    10,
  );
});

test('calcula a carga efetiva após redução da base', () => {
  const icmsEfetivo = calcularAliquotaIcmsEfetiva(17, 48.23);
  assert.equal(icmsEfetivo, 8.8009);
  assert.equal(calcularAliquotaIcmsEfetiva(17, 0), 17);
  assert.equal(calcularAliquotaIcmsEfetiva(17, 100), 0);

  // Caso real Santa Clara, produto 2493: a fórmula volta ao valor da tabela.
  const preco = 4391.28 / (1 - (30.1476 + 0.65 + 3 + icmsEfetivo) / 100);
  assert.equal(Math.round(preco * 100) / 100, 7650.11);
});
