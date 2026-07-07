import { getApi, extractApiErrorMessage, isUnauthorizedApiError } from '@/api/client';
import {
  deleteOutboxCliente,
  deleteOutboxVenda,
  deleteOutboxVisita,
  listPendingClientes,
  listPendingVendas,
  listPendingVisitas,
  purgeSentOutbox,
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
import { deleteVisitaLocal } from '@/db/repositories/visitas';
import { useSyncStore, UploadItemProgress } from '@/stores/sync';
import { useSessionStore } from '@/stores/session';

export interface UploadSyncResult {
  clientes: number;
  vendas: number;
  visitas: number;
  sessionExpired?: boolean;
}

export async function runUploadSync(): Promise<UploadSyncResult> {
  const store = useSyncStore.getState();

  if (useSessionStore.getState().isSessionExpired()) {
    const msg = 'Sessão expirada. Faça login novamente.';
    store.finishUpload(false, msg);
    return { clientes: 0, vendas: 0, visitas: 0, sessionExpired: true };
  }

  // Limpa entradas legadas que ficaram com status 'sent' em versões anteriores.
  try {
    await purgeSentOutbox();
  } catch {
    // best-effort
  }

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
  let sessionExpired = false;

  const api = getApi();

  const handleItemError = async (
    err: unknown,
    clientId: string,
    setStatusFn: (
      id: string,
      status: 'error',
      patch?: { lastError?: string },
    ) => Promise<void>,
  ) => {
    const msg = extractApiErrorMessage(err);
    firstError = firstError || msg;
    await setStatusFn(clientId, 'error', { lastError: msg });
    store.setUploadItem(clientId, { status: 'error', message: msg });
    if (isUnauthorizedApiError(err)) {
      sessionExpired = true;
    }
  };

  // 1. Clientes novos primeiro — para que vendas/visitas apontem para o cd_cliente real
  for (const c of clientes) {
    if (sessionExpired) break;
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
      // Sucesso: remove a entrada da outbox (não mantém histórico local)
      await deleteOutboxCliente(c.client_id);
      store.setUploadItem(c.client_id, { status: 'sent' });
    } catch (err) {
      await handleItemError(err, c.client_id, setOutboxClienteStatus);
      if (sessionExpired) break;
    }
  }

  // 2. Recarrega vendas/visitas pois remap pode ter alterado cd_cliente nos payloads
  const vendasParaEnviar = await listPendingVendas();
  const visitasParaEnviar = await listPendingVisitas();

  for (const v of vendasParaEnviar) {
    if (sessionExpired) break;
    store.setUploadItem(v.client_id, { status: 'sending' });
    await setOutboxVendaStatus(v.client_id, 'sending');
    // Defesa: se a venda referencia um cd_cliente local (negativo) é porque
    // o upload do cliente associado não chegou a remapear para o cd real.
    // Enviar agora dispararia INT4 overflow no Postgres (Prevenda.cdCliente
    // é INT4). Marca erro claro e segue — usuário pode tentar de novo após
    // resolver o cliente.
    if (v.cd_cliente < 0) {
      const msg =
        'Cliente novo deste pedido ainda não foi sincronizado. Sincronize o cliente primeiro e tente novamente.';
      firstError = firstError || msg;
      await setOutboxVendaStatus(v.client_id, 'error', { lastError: msg });
      store.setUploadItem(v.client_id, { status: 'error', message: msg });
      continue;
    }
    try {
      const fullPayload = JSON.parse(v.payload);
      const { __display: _ignore, ...payload } = fullPayload;
      await api.post('/upload/venda', {
        clientId: v.client_id,
        ...payload,
      });
      // Sucesso: remove a venda da outbox local
      await deleteOutboxVenda(v.client_id);
      store.setUploadItem(v.client_id, { status: 'sent' });
    } catch (err) {
      await handleItemError(err, v.client_id, setOutboxVendaStatus);
      if (sessionExpired) break;
    }
  }

  for (const v of visitasParaEnviar) {
    if (sessionExpired) break;
    store.setUploadItem(v.client_id, { status: 'sending' });
    await setOutboxVisitaStatus(v.client_id, 'sending');
    if (v.cd_cliente < 0) {
      const msg =
        'Cliente novo desta visita ainda não foi sincronizado. Sincronize o cliente primeiro e tente novamente.';
      firstError = firstError || msg;
      await setOutboxVisitaStatus(v.client_id, 'error', { lastError: msg });
      store.setUploadItem(v.client_id, { status: 'error', message: msg });
      continue;
    }
    try {
      const payload = JSON.parse(v.payload);
      await api.post('/upload/visita', {
        clientId: v.client_id,
        ...payload,
      });
      // Sucesso: remove a visita local e a entrada da outbox
      await deleteVisitaLocal(v.client_id);
      await deleteOutboxVisita(v.client_id);
      store.setUploadItem(v.client_id, { status: 'sent' });
    } catch (err) {
      await handleItemError(err, v.client_id, setOutboxVisitaStatus);
      if (sessionExpired) break;
    }
  }

  store.finishUpload(!firstError, firstError);
  return {
    clientes: clientes.length,
    vendas: vendasParaEnviar.length,
    visitas: visitasParaEnviar.length,
    sessionExpired: sessionExpired || undefined,
  };
}
