import assert from 'node:assert/strict';
import test from 'node:test';
import { clienteComVendaBloqueada } from './clienteAtrasado';

test('bloqueia apenas após vencimento em Brasília, incluindo passagem do dia offline', () => {
  const cliente = { id_bloqueia_venda_cliente_atrasado_app: 1, dt_primeiro_titulo_aberto: '2026-09-17' };
  assert.equal(clienteComVendaBloqueada(cliente, new Date('2026-09-18T02:59:59Z')), false);
  assert.equal(clienteComVendaBloqueada(cliente, new Date('2026-09-18T03:00:00Z')), true);
  assert.equal(clienteComVendaBloqueada({ ...cliente, id_bloqueia_venda_cliente_atrasado_app: 0 }, new Date('2026-09-20')), false);
  assert.equal(clienteComVendaBloqueada({ ...cliente, dt_primeiro_titulo_aberto: null }), false);
  assert.equal(clienteComVendaBloqueada({}), false);
});
