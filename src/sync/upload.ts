import { getApi, extractApiErrorMessage } from '@/api/client';
import {
  listPendingClientes,
  listPendingVendas,
  listPendingVisitas,
  setOutboxClienteStatus,
  setOutboxVendaStatus,
  setOutboxVisitaStatus,
} from '@/db/repositories/outbox';
import {
  remapClienteLocalToRemoto,
  markClienteSincronizado,
  reconcileClientesPendentes,
  ensureClienteOutbox,
} from '@/db/repositories/clientes';
import { markVisitaUploaded } from '@/db/repositories/visitas';
import { useSyncStore, UploadItemProgress } from '@/stores/sync';

export async function runUploadSync() {
  const store = useSyncStore.getState();

  // Reconcilia clientes locais que já foram sincronizados em uma execução anterior
  // mas ficaram marcados como pendentes (estado inconsistente herdado).
  try {
    await reconcileClientesPendentes();
  } catch {
    // best-effort
  }

  // Vendas/visitas pendentes podem referenciar clientes locais (cd_cliente negativo)
  // que ainda não foram enfileirados (ex.: cadastros feitos em versão antiga do app).
  // Garantimos que esses clientes entrem na fila ANTES de listar pendências.
  try {
    const vendasPrelim = await listPendingVendas();
    const visitasPrelim = await listPendingVisitas();
    for (const v of vendasPrelim) {
      if (v.cd_cliente < 0) await ensureClienteOutbox(v.cd_cliente, v.holding_id);
    }
    for (const v of visitasPrelim) {
      if (v.cd_cliente < 0) await ensureClienteOutbox(v.cd_cliente, v.holding_id);
    }
  } catch {
    // best-effort
  }

  const [clientes, vendas, visitas] = await Promise.all([
    listPendingClientes(),
    listPendingVendas(),
    listPendingVisitas(),
  ]);

  const items: UploadItemProgress[] = [
    ...clientes.map<UploadItemProgress>((c) => ({
      clientId: c.client_id,
      kind: 'cliente',
      label: `Cliente novo • ${c.cd_cliente_local}`,
      status: 'pending',
    })),
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
    return { clientes: 0, vendas: 0, visitas: 0 };
  }

  let firstError: string | null = null;

  const api = getApi();

  // 1. Clientes novos primeiro — para que vendas/visitas apontem para o cd_cliente real
  for (const c of clientes) {
    store.setUploadItem(c.client_id, { status: 'sending' });
    await setOutboxClienteStatus(c.client_id, 'sending');
    try {
      const payload = JSON.parse(c.payload);
      const { data } = await api.post('/upload/cliente', {
        clientId: c.client_id,
        ...payload,
      });
      const cdReal: number | null =
        data?.cliente?.cdCliente ?? data?.cdCliente ?? null;
      if (!cdReal) throw new Error('Servidor não retornou cdCliente.');
      try {
        await remapClienteLocalToRemoto(c.client_id, cdReal);
      } catch (remapErr) {
        // Mesmo se o remap falhar, garantimos que o cliente local não fique
        // marcado como pendente (o servidor já criou o registro).
        await markClienteSincronizado(c.client_id);
        throw remapErr;
      }
      await setOutboxClienteStatus(c.client_id, 'sent', { cdClienteRemoto: cdReal });
      store.setUploadItem(c.client_id, { status: 'sent' });
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      firstError = firstError || msg;
      await setOutboxClienteStatus(c.client_id, 'error', { lastError: msg });
      store.setUploadItem(c.client_id, { status: 'error', message: msg });
    }
  }

  // 2. Recarrega vendas/visitas pois remap pode ter alterado cd_cliente nos payloads
  const vendasParaEnviar = await listPendingVendas();
  const visitasParaEnviar = await listPendingVisitas();

  for (const v of vendasParaEnviar) {
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

  for (const v of visitasParaEnviar) {
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
  return {
    clientes: clientes.length,
    vendas: vendasParaEnviar.length,
    visitas: visitasParaEnviar.length,
  };
}
