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
  const events = [];
  const storage = options.storage || new Map();
  const cache = new Map();
  let request = 0;
  let photoStarted = deferred();
  const asyncStorage = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => {
      events.push('checkpoint');
      storage.set(key, value);
    },
    removeItem: async (key) => {
      events.push('complete');
      storage.delete(key);
    },
  };
  const entities = [
    {
      key: 'nota-fiscal-saida',
      endpoint: 'nota-fiscal-saida',
      label: 'Notas Fiscais (Vendas)',
      paged: true,
      insertFn: async (items) => {
        events.push(`insert:${items.length}`);
      },
    },
  ];
  const mocks = {
    './flex': {
      refreshFlex: async () => {
        if (options.failFlex)
          throw new Error('Falha ao conferir configuração e saldo Flex');
      },
    },
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: asyncStorage,
    },
    '@/api/client': {
      extractApiErrorMessage: (err) => err.message,
      getApi: () => ({
        get: async () => {
          request++;
          events.push('request');
          if (options.failPage === request) throw new Error('Sem conexão');
          return {
            data: {
              data: [{ nrNota: request }],
              total: 2,
              nextCursor: request === 1 && !options.incomplete ? 'page2' : null,
            },
          };
        },
      }),
    },
    '@/db/database': { getDb: async () => ({}) },
    '@/db/migrations': {
      clearSyncTables: async () => {
        events.push('clear');
      },
    },
    '@/db/repositories/syncMeta': {
      resetSyncMeta: async () => {},
      upsertSyncMeta: async () => {},
    },
    '@/stores/session': {
      useSessionStore: {
        getState: () => ({
          user: { holdingId: 4, cdEmpresa: 1 },
          token: 'test',
        }),
      },
    },
    '@/services/companyLogoCache': {
      downloadPendingCompanyLogos: async ({ onProgress }) => {
        onProgress(1, 1);
      },
    },
    '@/services/photoCache': {
      downloadPendingPhotos: async ({ onProgress }) => {
        events.push('photos');
        onProgress(0, 2);
        photoStarted.resolve();
        if (options.photoWait) await options.photoWait.promise;
        if (options.failPhotos) throw new Error('Falha ao preparar fotos');
        onProgress(2, 2);
      },
    },
    '@/db/repositories/parametros': { getEmpresaParametros: async () => ({}) },
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
      if (name === './entities')
        return {
          DOWNLOAD_STAGES: [
            { key: 'prepare', label: 'Preparação' },
            ...entities,
            { key: 'company-logos', label: 'Logo da empresa' },
            { key: 'product-photos', label: 'Fotos dos produtos' },
          ],
          SYNC_ENTITIES: entities,
          SYNC_ENTITY_KEYS: entities.map((e) => e.key),
        };
      if (mocks[name]) return mocks[name];
      if (name.startsWith('@/'))
        return load(path.join(__dirname, '../src', name.slice(2) + '.ts'));
      if (name.startsWith('.'))
        return load(path.resolve(path.dirname(file), name + '.ts'));
      return require(name);
    };
    new Function('require', 'module', 'exports', code)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }
  const fromSrc = (name) => load(path.join(__dirname, '../src', name));
  const sync = fromSrc('stores/sync.ts').useSyncStore;
  return {
    sync,
    events,
    storage,
    photoStarted,
    run: fromSrc('sync/download.ts').runDownloadSync,
    checkpoint: fromSrc('sync/downloadCheckpoint.ts'),
    percent: fromSrc('sync/downloadProgress.ts').downloadPercent,
  };
}

test('bloqueia antes da limpeza e mantém o bloqueio até terminar fotos e persistir sucesso', async () => {
  const photoWait = deferred();
  const h = harness({ photoWait });
  const run = h.run();
  assert.equal(h.sync.getState().downloadRunning, true);
  assert.deepEqual(Object.keys(h.sync.getState().entities), [
    'prepare',
    'nota-fiscal-saida',
    'company-logos',
    'product-photos',
  ]);
  assert.equal(h.sync.getState().entities['product-photos'].status, 'idle');
  await h.photoStarted.promise;
  assert.equal(h.sync.getState().entities['company-logos'].status, 'done');
  assert.equal(h.sync.getState().entities['product-photos'].status, 'running');
  assert.deepEqual(h.events.slice(0, 2), ['checkpoint', 'clear']);
  assert.equal(h.sync.getState().downloadRunning, true);
  assert.equal(h.sync.getState().downloadFinishedAt, null);
  assert.equal(await h.checkpoint.hasIncompleteDownload(), true);
  assert.equal(h.sync.getState().downloadProgress.label, 'Fotos dos produtos');
  assert.ok(h.percent(h.sync.getState().downloadProgress) < 100);
  await h.run(); // A segunda tentativa não limpa nem baixa outra vez.
  assert.equal(h.events.filter((e) => e === 'clear').length, 1);
  photoWait.resolve();
  await run;
  assert.equal(h.sync.getState().downloadRunning, false);
  assert.equal(h.sync.getState().downloadNeedsRecovery, false);
  assert.ok(h.sync.getState().downloadFinishedAt);
  assert.equal(await h.checkpoint.hasIncompleteDownload(), false);
  assert.equal(h.events.at(-1), 'complete');
  assert.ok(
    Object.values(h.sync.getState().entities).every((e) => e.status === 'done'),
  );
  assert.equal(h.sync.getState().entities['company-logos'].downloaded, 1);
  assert.equal(h.sync.getState().entities['product-photos'].downloaded, 2);
});

test('falha de página mantém a base bloqueada e o marcador após reiniciar o processo', async () => {
  const h = harness({ failPage: 2 });
  await assert.rejects(h.run(), /Sem conexão/);
  assert.equal(h.sync.getState().downloadRunning, false);
  assert.equal(h.sync.getState().downloadNeedsRecovery, true);
  assert.equal(h.sync.getState().downloadFinishedAt, null);
  assert.equal(h.events.includes('photos'), false);
  const restarted = harness({ storage: h.storage });
  assert.equal(await restarted.checkpoint.hasIncompleteDownload(), true);
  await restarted.run();
  assert.equal(await restarted.checkpoint.hasIncompleteDownload(), false);
  assert.equal(restarted.sync.getState().downloadNeedsRecovery, false);
});

test('falha na etapa de fotos não libera o app prematuramente', async () => {
  const h = harness({ failPhotos: true });
  await assert.rejects(h.run(), /Falha ao preparar fotos/);
  assert.equal(h.sync.getState().downloadNeedsRecovery, true);
  assert.equal(await h.checkpoint.hasIncompleteDownload(), true);
  assert.equal(h.sync.getState().downloadFinishedAt, null);
});

test('fim de paginação antes do total esperado é falha, não conclusão', async () => {
  const h = harness({ incomplete: true });
  await assert.rejects(h.run(), /importação incompleta \(1 de 2\)/);
  assert.equal(h.sync.getState().downloadNeedsRecovery, true);
  assert.equal(h.events.includes('photos'), false);
});

test('não inicia limpeza durante envio de pedidos', async () => {
  const h = harness();
  h.sync.setState({ uploadRunning: true });
  await assert.rejects(h.run(), /Aguarde o envio/);
  assert.deepEqual(h.events, []);
});

test('progresso inicia em zero, avança por etapas e reserva 100% para conclusão', () => {
  const { percent } = harness();
  assert.equal(percent(null), 0);
  assert.equal(percent({ step: 0, steps: 4, done: 0, total: 0 }), 0);
  assert.equal(percent({ step: 1, steps: 4, done: 250, total: 500 }), 37);
  assert.equal(percent({ step: 2, steps: 4, done: 0, total: 0 }), 50);
  assert.equal(percent({ step: 3, steps: 4, done: 10, total: 10 }), 99);
});

test('configuração Flex precisa ser confirmada mesmo quando a sessão antiga não conhece a opção', async () => {
  const h = harness({ failFlex: true });
  await assert.rejects(h.run(), /Falha ao conferir configuração e saldo Flex/);
  assert.equal(h.sync.getState().downloadNeedsRecovery, true);
  assert.equal(await h.checkpoint.hasIncompleteDownload(), true);
  assert.equal(h.sync.getState().downloadFinishedAt, null);
});
