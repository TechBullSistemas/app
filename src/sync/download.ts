import { refreshFlex } from './flex';
import { getApi, extractApiErrorMessage } from '@/api/client';
import { clearSyncTables } from '@/db/migrations';
import { getDb } from '@/db/database';
import { resetSyncMeta, upsertSyncMeta } from '@/db/repositories/syncMeta';
import {
  DOWNLOAD_STAGES,
  SYNC_ENTITIES,
  SYNC_ENTITY_KEYS,
  SyncEntityDef,
} from './entities';
import { useSyncStore } from '@/stores/sync';
import { useSessionStore } from '@/stores/session';
import { downloadPendingCompanyLogos } from '@/services/companyLogoCache';
import { getEmpresaParametros } from '@/db/repositories/parametros';
import { podeSincronizarProduto } from './produtoLiberadoInternet';
import { downloadPendingPhotos } from '@/services/photoCache';
import {
  clearIncompleteDownload,
  markDownloadIncomplete,
} from './downloadCheckpoint';

const PAGE_SIZE = 500;

export async function runDownloadSync() {
  const store = useSyncStore.getState();
  if (store.downloadRunning) return;
  if (store.uploadRunning)
    throw new Error('Aguarde o envio de informações terminar.');
  const { user, token } = useSessionStore.getState();
  if (!user || !token) throw new Error('Faça login novamente para importar.');
  store.startDownload(DOWNLOAD_STAGES);

  const steps = DOWNLOAD_STAGES.length;
  let activeStep = -1;
  const progress = (label: string, step: number, done = 0, total = 0) => {
    if (activeStep >= 0 && activeStep !== step) {
      store.setEntityProgress(DOWNLOAD_STAGES[activeStep].key, {
        status: 'done',
      });
    }
    activeStep = step;
    store.setDownloadProgress({ label, step, steps, done, total });
    store.setEntityProgress(DOWNLOAD_STAGES[step].key, {
      status: 'running',
      downloaded: done,
      total,
    });
  };
  progress('Preparando importação', 0);

  try {
    await markDownloadIncomplete();
    const db = await getDb();
    await clearSyncTables(db);
    await resetSyncMeta(SYNC_ENTITY_KEYS);

    const { holdingId, cdEmpresa } = user;

    for (const [index, entity] of SYNC_ENTITIES.entries()) {
      progress(entity.label, index + 1);
      await syncEntity(entity, holdingId, cdEmpresa, (done, total) =>
        progress(entity.label, index + 1, done, total),
      );
    }

    progress('Logo da empresa', steps - 2);
    try {
      await downloadPendingCompanyLogos({
        onProgress: (done, total) =>
          progress('Logo da empresa', steps - 2, done, total),
      });
    } catch (error) {
      // A logo é opcional: uma falha de arquivo não invalida os dados
      // operacionais que já foram sincronizados.
      console.warn('[sync] não foi possível armazenar a logo offline:', error);
    }

    progress('Fotos dos produtos', steps - 1);
    await downloadPendingPhotos({
      onProgress: (done, total) =>
        progress('Fotos dos produtos', steps - 1, done, total),
    });
    await refreshFlex();
    await clearIncompleteDownload();
    store.setEntityProgress(DOWNLOAD_STAGES[activeStep].key, {
      status: 'done',
    });
    store.finishDownload(true);
  } catch (err) {
    store.setEntityProgress(DOWNLOAD_STAGES[activeStep].key, {
      status: 'error',
      message: extractApiErrorMessage(err),
    });
    store.finishDownload(false, extractApiErrorMessage(err));
    throw err;
  }
}

async function syncEntity(
  entity: SyncEntityDef,
  holdingIdFallback?: number,
  cdEmpresa?: number,
  onProgress?: (done: number, total: number) => void,
) {
  const store = useSyncStore.getState();
  const api = getApi();

  store.setEntityProgress(entity.key, {
    status: 'running',
    label: entity.label,
  });
  await upsertSyncMeta(entity.key, {
    status: 'running',
    message: null,
    downloaded: 0,
  });

  try {
    let cursor: string | null = null;
    let total = 0;
    let downloaded = 0;
    // Empresas são baixadas antes do catálogo. A API aplica o mesmo filtro;
    // a checagem local protege a gravação durante atualizações desencontradas.
    const verificaLiberadoInternet =
      entity.key === 'produto' && cdEmpresa != null && holdingIdFallback != null
        ? (await getEmpresaParametros(cdEmpresa, holdingIdFallback))
            .idVerificaTambemColunaLiberadoInternet
        : false;

    do {
      const params: Record<string, any> = {};
      if (entity.paged) {
        params.take = PAGE_SIZE;
        if (cursor) params.cursor = cursor;
      }
      if (downloaded === 0) {
        params.withTotal = 1;
      }
      // Produto usa a empresa para filtrar saldo e liberação para internet;
      // promoções também são cadastradas por empresa no DUAPI.
      if (
        cdEmpresa &&
        (entity.key === 'produto' || entity.key === 'tabela-preco-promocao')
      ) {
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

      const itemsParaGravar =
        entity.key === 'produto'
          ? items.filter((item) =>
              podeSincronizarProduto(item, verificaLiberadoInternet),
            )
          : items;
      await entity.insertFn(itemsParaGravar, holdingIdFallback);
      downloaded += items.length;
      onProgress?.(downloaded, total);

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

    if (downloaded < total) {
      throw new Error(
        `${entity.label}: importação incompleta (${downloaded} de ${total}). Tente novamente.`,
      );
    }

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
