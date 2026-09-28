import assert from 'node:assert/strict';
import test from 'node:test';

import { deveSalvarRascunhoAutomaticamente } from './rascunhoPedido';

test('mantém salvamento automático ao reabrir um rascunho', () => {
  assert.equal(
    deveSalvarRascunhoAutomaticamente({
      habilitado: true,
      emEdicao: true,
      status: 'draft',
    }),
    true,
  );
});

test('não salva automaticamente pedidos que já entraram na fila de envio', () => {
  for (const status of ['pending', 'error', 'sending', 'sent'] as const) {
    assert.equal(
      deveSalvarRascunhoAutomaticamente({
        habilitado: true,
        emEdicao: true,
        status,
      }),
      false,
    );
  }
});

test('respeita configuração desligada e mantém autosave em pedido novo', () => {
  assert.equal(
    deveSalvarRascunhoAutomaticamente({
      habilitado: false,
      emEdicao: false,
      status: null,
    }),
    false,
  );
  assert.equal(
    deveSalvarRascunhoAutomaticamente({
      habilitado: true,
      emEdicao: false,
      status: null,
    }),
    true,
  );
});
