import { getApi, extractApiErrorMessage } from '@/api/client';
import {
  listPendingVendas,
  listPendingVisitas,
  setOutboxVendaStatus,
  setOutboxVisitaStatus,
} from '@/db/repositories/outbox';
import { markVisitaUploaded } from '@/db/repositories/visitas';
import { useSyncStore, UploadItemProgress } from '@/stores/sync';

export async function runUploadSync() {
  const store = useSyncStore.getState();

  const [vendas, visitas] = await Promise.all([listPendingVendas(), listPendingVisitas()]);

  const items: UploadItemProgress[] = [
    ...vendas.map<UploadItemProgress>((v) => ({
      clientId: v.client_id,
      kind: 'venda',
      label: `Venda • Cliente ${v.cd_cliente}`,
      status: 'pending',
    })),
    ...visitas.map<UploadItemProgress>((v) => ({
      clientId: v.client_id,
      kind: 'visita',
      label: `Visita • Cliente ${v.cd_cliente}`,
      status: 'pending',
    })),
  ];

  store.startUpload(items);

  if (items.length === 0) {
    store.finishUpload(true);
    return { vendas: 0, visitas: 0 };
  }

  let firstError: string | null = null;

  const api = getApi();

  for (const v of vendas) {
    store.setUploadItem(v.client_id, { status: 'sending' });
    await setOutboxVendaStatus(v.client_id, 'sending');
    try {
      const fullPayload = JSON.parse(v.payload);
      const { __display: _ignore, ...payload } = fullPayload;
      const { data } = await api.post('/upload/venda', {
        clientId: v.client_id,
        ...payload,
      });
      const nrPrevenda = data?.prevenda?.nrPrevenda ?? data?.cdPrevenda ?? null;
      await setOutboxVendaStatus(v.client_id, 'sent', { cdPrevenda: nrPrevenda });
      store.setUploadItem(v.client_id, { status: 'sent' });
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      firstError = firstError || msg;
      await setOutboxVendaStatus(v.client_id, 'error', { lastError: msg });
      store.setUploadItem(v.client_id, { status: 'error', message: msg });
    }
  }

  for (const v of visitas) {
    store.setUploadItem(v.client_id, { status: 'sending' });
    await setOutboxVisitaStatus(v.client_id, 'sending');
    try {
      const payload = JSON.parse(v.payload);
      const { data } = await api.post('/upload/visita', {
        clientId: v.client_id,
        ...payload,
      });
      const cdVisita = data?.visita?.cdVisita ?? null;
      const cdEmpresa = data?.visita?.cdEmpresa ?? payload?.cdEmpresa ?? null;
      await markVisitaUploaded(v.client_id, cdVisita, cdEmpresa);
      await setOutboxVisitaStatus(v.client_id, 'sent');
      store.setUploadItem(v.client_id, { status: 'sent' });
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      firstError = firstError || msg;
      await setOutboxVisitaStatus(v.client_id, 'error', { lastError: msg });
      store.setUploadItem(v.client_id, { status: 'error', message: msg });
    }
  }

  store.finishUpload(!firstError, firstError);
  return { vendas: vendas.length, visitas: visitas.length };
}
