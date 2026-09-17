const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function harness() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql) => sqlite.exec(sql),
    runAsync: async (sql, args = []) => sqlite.prepare(sql).run(...args),
    getAllAsync: async (sql, args = []) => sqlite.prepare(sql).all(...args),
    getFirstAsync: async (sql, args = []) => sqlite.prepare(sql).get(...args),
    withTransactionAsync: async (fn) => {
      sqlite.exec('BEGIN');
      try {
        await fn();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  db.withExclusiveTransactionAsync = async (fn) =>
    db.withTransactionAsync(() => fn(db));
  let user = { holdingId: 7, userId: 12, idUsaSaldoFlex: true };
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const req = (name) => {
      if (name === 'expo-sqlite') return {};
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name.endsWith('/database')) return { getDb: async () => db };
      if (name.endsWith('/session'))
        return { useSessionStore: { getState: () => ({ user }) } };
      if (name.endsWith('/vendaElegibilidade'))
        return { validarElegibilidadeVenda: async () => {} };
      if (name.startsWith('.'))
        return load(path.resolve(path.dirname(file), name + '.ts'));
      return require(name);
    };
    new Function('require', 'module', 'exports', output)(
      req,
      module,
      module.exports,
    );
    return module.exports;
  }
  const src = (file) => load(path.join(__dirname, '../src', file + '.ts'));
  return {
    db,
    sqlite,
    src,
    user,
    setUser: (next) => {
      user = next;
    },
  };
}
const snapshot = (revision, saldo, pendente, conhecidos = []) => ({
  enabled: true,
  ready: true,
  revision,
  saldo,
  pendente,
  disponivel: saldo - pendente,
  syncedAt: '2026-09-17',
  conhecidos,
});
const item = (ref, sold, qty = 1) => ({
  vlPrecoOriginal: ref,
  vlUnitario: sold,
  qtProduto: qty,
});
const order = (id, items) => ({
  clientId: id,
  cdCliente: 1,
  cdEmpresa: 1,
  holdingId: 7,
  vlTotal: 0,
  payload: {
    flexVersion: 1,
    cdFuncionario: 12,
    cdCliente: 1,
    prevendaItem: items,
  },
});

test('total por quantidade, centavos, quantidade fracionária e acréscimo sem crédito antecipado', () => {
  const h = harness();
  const { calcularFlexPedido } = h.src('services/pricing/flex');
  assert.deepEqual(calcularFlexPedido([item(100, 60, 3)]), {
    valores: [120],
    total: 120,
    consumo: 120,
  });
  assert.equal(calcularFlexPedido([item(1.005, 1)]).consumo, 0.01);
  assert.equal(calcularFlexPedido([item(100, 0, 0.00005)]).consumo, 0.01);
  assert.deepEqual(calcularFlexPedido([item(100, 60), item(100, 150)]), {
    valores: [40, -50],
    total: -10,
    consumo: 40,
  });
  h.sqlite.close();
});

test('reservas sobrevivem envio, confirmação e download; desconto não é contado duas vezes', async () => {
  const h = harness();
  const { runMigrations, clearSyncTables } = h.src('db/migrations');
  const flex = h.src('db/repositories/flex');
  const outbox = h.src('db/repositories/outbox');
  await runMigrations(h.db);
  await flex.storeFlexSnapshot(h.user, snapshot(1, 100, 0));
  await assert.rejects(
    outbox.enqueueVenda(order('too-much', [item(100, 60, 3)])),
    /insuficiente/,
  );
  await outbox.enqueueVenda(order('A', [item(1100, 1000)]));
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 0);
  await assert.rejects(
    outbox.enqueueVenda(order('B', [item(100, 99)])),
    /insuficiente/,
  );
  await outbox.setOutboxVendaStatus('A', 'sending');
  await outbox.setOutboxVendaStatus('A', 'sent');
  await outbox.purgeSentOutbox();
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 0);
  await assert.rejects(outbox.deleteOutboxVenda('A'), /tentativa de envio/);
  await clearSyncTables(h.db);
  await runMigrations(h.db);
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 0);
  await flex.storeFlexSnapshot(h.user, snapshot(2, 100, 100, ['A']));
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 0);
  assert.equal(await outbox.getOutboxVenda('A'), null);
  await flex.storeFlexSnapshot(h.user, snapshot(3, 0, 0));
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 0);
  await flex.storeFlexSnapshot(h.user, snapshot(1, 100, 0));
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 0);
  await flex.storeFlexSnapshot(h.user, snapshot(4, 25, 0));
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 25);
  h.sqlite.close();
});

test('editar substitui reserva, excluir libera, saves concorrentes e isolamento por vendedor', async () => {
  const h = harness();
  await h.src('db/migrations').runMigrations(h.db);
  const flex = h.src('db/repositories/flex');
  const outbox = h.src('db/repositories/outbox');
  await flex.storeFlexSnapshot(h.user, snapshot(1, 100, 0));
  await outbox.enqueueVenda(order('A', [item(100, 60)]));
  await outbox.updateOutboxVendaPayload(
    'A',
    order('A', [item(100, 10)]).payload,
    10,
  );
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 10);
  await outbox.deleteOutboxVenda('A');
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 100);
  const saves = await Promise.allSettled(
    ['A', 'B'].map((id) => outbox.enqueueVenda(order(id, [item(100, 40)]))),
  );
  assert.equal(saves.filter((s) => s.status === 'fulfilled').length, 1);
  assert.equal((await flex.getFlexLocal(h.user)).disponivel, 40);
  const other = { ...h.user, userId: 13 };
  await flex.storeFlexSnapshot(other, snapshot(1, 80, 0));
  assert.equal((await flex.getFlexLocal(other)).disponivel, 80);
  h.sqlite.close();
});

test('desligado não restringe, primeira sincronização exige saldo e upload incerto não libera', async () => {
  const h = harness();
  await h.src('db/migrations').runMigrations(h.db);
  const flex = h.src('db/repositories/flex');
  const outbox = h.src('db/repositories/outbox');
  await assert.rejects(
    outbox.enqueueVenda(order('A', [item(100, 0)])),
    /ainda não sincronizado/,
  );
  await flex.storeFlexSnapshot(h.user, {
    ...snapshot(1, 0, 0),
    enabled: false,
  });
  await outbox.enqueueVenda(order('A', [item(100, 0)]));
  await flex.storeFlexSnapshot(h.user, snapshot(2, 100, 0));
  await outbox.setOutboxVendaStatus('A', 'sending');
  await outbox.resetStaleSendingOutbox();
  await assert.rejects(outbox.deleteOutboxVenda('A'), /tentativa de envio/);
  await outbox.setOutboxVendaStatus('A', 'error', { rejected: true });
  await outbox.deleteOutboxVenda('A');
  h.sqlite.close();
});
