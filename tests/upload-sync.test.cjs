const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function harness(options = {}) {
  const cache = new Map();
  const events = [];
  const posted = deferred();
  const rows = ['pedido-1', 'pedido-2'].map((client_id) => ({
    client_id,
    holding_id: 4,
    cd_empresa: 1,
    cd_cliente: 2881,
    status: 'pending',
    payload: JSON.stringify({ cdCliente: 2881, prevendaItem: [] }),
  }));
  const mocks = {
    './flex': { refreshFlex: async () => {} },
    '@/api/client': {
      UPLOAD_REQUEST_TIMEOUT_MS: 15000,
      extractApiErrorMessage: (err) => err.message,
      isUnauthorizedApiError: (err) => err?.response?.status === 401,
      getApi: () => ({
        post: async (url, payload) => {
          events.push(`post:${payload.clientId}`);
          posted.resolve();
          if (options.requestWait) await options.requestWait.promise;
          if (options.failRequest) throw new Error('Sem conexão');
          return { data: { prevenda: { nrPrevenda: 2606 } } };
        },
      }),
    },
    '@/db/repositories/outbox': {
      resetStaleSendingOutbox: async () => {
        events.push('prepare');
        if (options.prepareWait) await options.prepareWait.promise;
      },
      purgeSentOutbox: async () => {},
      listPendingClientes: async () => {
        if (options.failList) throw new Error('Falha ao ler pendências');
        return [];
      },
      listPendingVendas: async () =>
        options.empty ? [] : rows.filter((row) => row.status !== 'sent'),
      listPendingVisitas: async () => [],
      setOutboxVendaStatus: async (id, status, patch) => {
        events.push(`${status}:${id}`);
        const row = rows.find((row) => row.client_id === id);
        row.status = status;
        row.last_error = patch?.lastError ?? null;
      },
      deleteOutboxVenda: async (id) => {
        events.push(`delete:${id}`);
        rows.splice(rows.findIndex((row) => row.client_id === id), 1);
      },
    },
    '@/db/repositories/clientes': {
      reconcileClientesPendentes: async () => {},
      getClienteById: async () => ({ nome: 'CASA DO QUEIJO SPERANZA' }),
    },
    '@/db/repositories/visitas': {},
    '@/db/repositories/prevendas': { upsertPrevendaFromUpload: async () => {} },
    '@/db/repositories/parametros': { getEmpresaParametros: async () => ({}) },
    '@/stores/session': {
      useSessionStore: { getState: () => ({ isSessionExpired: () => !!options.expired }) },
    },
    './dataEmissaoVenda': { aplicarDataSincronizacaoVenda: (payload) => payload },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (name) => {
      if (mocks[name]) return mocks[name];
      if (name.startsWith('@/'))
        return load(path.join(__dirname, '../src', name.slice(2) + '.ts'));
      return require(name);
    };
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
    return module.exports;
  }
  const sync = load(path.join(__dirname, '../src/stores/sync.ts')).useSyncStore;
  return {
    sync,
    events,
    rows,
    posted,
    run: load(path.join(__dirname, '../src/sync/upload.ts')).runUploadSync,
  };
}

test('bloqueia desde a preparação e envia uma vez mesmo com chamadas simultâneas', async () => {
  const prepareWait = deferred();
  const h = harness({ prepareWait });
  const first = h.run({ skipVendaClientIds: ['pedido-2'] });
  assert.equal(h.sync.getState().uploadRunning, true);
  assert.equal(h.sync.getState().uploadFinishedAt, null);
  const second = h.run();
  assert.equal(second, first);
  assert.deepEqual(h.events, ['prepare']);
  prepareWait.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.equal(a.vendas, 1);
  assert.deepEqual(h.events.filter((event) => event.startsWith('post:')), ['post:pedido-1']);
  assert.equal(h.rows[0].client_id, 'pedido-2');
  assert.equal(h.rows[0].status, 'pending');
  assert.equal(h.sync.getState().uploadItems[0].status, 'sent');
  assert.equal(h.sync.getState().uploadError, null);
  assert.equal(h.sync.getState().uploadRunning, false);
  assert.ok(h.sync.getState().uploadFinishedAt);
  await h.run();
  assert.deepEqual(h.events.filter((event) => event.startsWith('post:')), ['post:pedido-1', 'post:pedido-2']);
});

test('chamada durante a requisição compartilha o envio e não reinicia a fila', async () => {
  const requestWait = deferred();
  const h = harness({ requestWait });
  const first = h.run({ skipVendaClientIds: ['pedido-2'] });
  await h.posted.promise;
  assert.equal(h.sync.getState().uploadRunning, true);
  assert.equal(h.sync.getState().uploadItems[0].status, 'sending');
  const second = h.run();
  assert.equal(second, first);
  assert.equal(h.events.filter((event) => event === 'prepare').length, 1);
  requestWait.resolve();
  await Promise.all([first, second]);
  assert.equal(h.events.filter((event) => event === 'post:pedido-1').length, 1);
});

test('falha no envio preserva o pedido e libera uma nova tentativa', async () => {
  const options = { failRequest: true };
  const h = harness(options);
  await h.run({ skipVendaClientIds: ['pedido-2'] });
  assert.equal(h.sync.getState().uploadRunning, false);
  assert.equal(h.sync.getState().uploadError, 'Sem conexão');
  assert.equal(h.rows[0].status, 'error');
  options.failRequest = false;
  await h.run({ skipVendaClientIds: ['pedido-2'] });
  assert.equal(h.sync.getState().uploadError, null);
  assert.equal(h.sync.getState().uploadItems[0].status, 'sent');
  assert.equal(h.events.filter((event) => event === 'post:pedido-1').length, 2);
});

test('falha na preparação libera o bloqueio e registra o erro', async () => {
  const options = { failList: true };
  const h = harness(options);
  const first = h.run();
  const second = h.run();
  assert.equal(first, second);
  await assert.rejects(first, /Falha ao ler pendências/);
  assert.equal(h.sync.getState().uploadRunning, false);
  assert.equal(h.sync.getState().uploadError, 'Falha ao ler pendências');
  options.failList = false;
  await h.run();
  assert.equal(h.sync.getState().uploadError, null);
});

test('fila vazia conclui e permite uma nova execução', async () => {
  const h = harness({ empty: true });
  assert.deepEqual(await h.run(), { clientes: 0, vendas: 0, visitas: 0 });
  assert.equal(h.sync.getState().uploadRunning, false);
  await h.run();
  assert.equal(h.events.filter((event) => event === 'prepare').length, 2);
});

test('importação ativa impede preparar a fila ou enviar pedidos', async () => {
  const h = harness();
  h.sync.setState({ downloadRunning: true });
  await assert.rejects(h.run(), /Aguarde a importação/);
  assert.deepEqual(h.events, []);
  assert.equal(h.sync.getState().uploadRunning, false);
  assert.equal(h.sync.getState().downloadRunning, true);
  h.sync.setState({ downloadRunning: false });
  await h.run();
  assert.equal(h.events.filter((event) => event.startsWith('post:')).length, 2);
});

test('sessão expirada não inicia envio; após login é possível tentar novamente', async () => {
  const options = { expired: true };
  const h = harness(options);
  const result = await h.run();
  assert.equal(result.sessionExpired, true);
  assert.equal(h.sync.getState().uploadRunning, false);
  assert.deepEqual(h.events, []);
  options.expired = false;
  await h.run();
  assert.equal(h.sync.getState().uploadError, null);
});
