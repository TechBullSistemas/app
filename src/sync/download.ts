import { getApi, extractApiErrorMessage } from '@/api/client';
import { clearSyncTables } from '@/db/migrations';
import { getDb } from '@/db/database';
import { resetSyncMeta, upsertSyncMeta } from '@/db/repositories/syncMeta';
import { SYNC_ENTITIES, SYNC_ENTITY_KEYS, SyncEntityDef } from './entities';
import { useSyncStore } from '@/stores/sync';
import { useSessionStore } from '@/stores/session';

const PAGE_SIZE = 500;

export async function runDownloadSync(opts?: { onPhotoStart?: () => void }) {
  const store = useSyncStore.getState();
  store.startDownload();

  try {
    const db = await getDb();
    await clearSyncTables(db);
    await resetSyncMeta(SYNC_ENTITY_KEYS);

    const holdingId = useSessionStore.getState().user?.holdingId;
    const cdEmpresa = useSessionStore.getState().user?.cdEmpresa;

    for (const entity of SYNC_ENTITIES) {
      await syncEntity(entity, holdingId, cdEmpresa);
    }

    store.finishDownload(true);
    if (opts?.onPhotoStart) {
      opts.onPhotoStart();
    }
  } catch (err) {
    store.finishDownload(false, extractApiErrorMessage(err));
    throw err;
  }
}

async function syncEntity(
  entity: SyncEntityDef,
  holdingIdFallback?: number,
  cdEmpresa?: number,
) {
  const store = useSyncStore.getState();
  const api = getApi();

  store.setEntityProgress(entity.key, { status: 'running', label: entity.label });
  await upsertSyncMeta(entity.key, { status: 'running', message: null, downloaded: 0 });

  try {
    let cursor: string | null = null;
    let total = 0;
    let downloaded = 0;

    do {
      const params: Record<string, any> = {};
      if (entity.paged) {
        params.take = PAGE_SIZE;
        if (cursor) params.cursor = cursor;
      }
      if (downloaded === 0) {
        params.withTotal = 1;
      }
      // Produto precisa do cdEmpresa para filtrar saldoEstoque corretamente.
      if (cdEmpresa && entity.key === 'produto') {
        params.cdEmpresa = cdEmpresa;
      }

      const { data } = await api.get<{
        data: any[];
        nextCursor?: string | null;
        total?: number;
      }>(`/sync/${entity.endpoint}`, { params });

      const items = data.data || [];
      if (typeof data.total === 'number' && total === 0) {
        total = data.total;
      } else if (!entity.paged) {
        total = items.length;
      }

      await entity.insertFn(items, holdingIdFallback);
      downloaded += items.length;

      store.setEntityProgress(entity.key, {
        status: 'running',
        label: entity.label,
        downloaded,
        total,
      });
      await upsertSyncMeta(entity.key, {
        status: 'running',
        downloaded,
        total,
      });

      cursor = data.nextCursor ?? null;
    } while (entity.paged && cursor);

    store.setEntityProgress(entity.key, {
      status: 'done',
      label: entity.label,
      downloaded,
      total: total || downloaded,
    });
    await upsertSyncMeta(entity.key, {
      status: 'done',
      downloaded,
      total: total || downloaded,
    });
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    store.setEntityProgress(entity.key, {
      status: 'error',
      label: entity.label,
      message: msg,
    });
    await upsertSyncMeta(entity.key, { status: 'error', message: msg });
    throw err;
  }
}
