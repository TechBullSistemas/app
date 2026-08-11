import {
  getApi,
  extractApiErrorMessage,
  isUnauthorizedApiError,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from '@/api/client';
import {
  deleteOutboxCliente,
  deleteOutboxVenda,
  deleteOutboxVisita,
  listPendingClientes,
  listPendingVendas,
  listPendingVisitas,
  purgeSentOutbox,
  resetStaleSendingOutbox,
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
import { upsertPrevendaFromUpload } from '@/db/repositories/prevendas';
import { useSyncStore, UploadItemProgress } from '@/stores/sync';
import { useSessionStore } from '@/stores/session';

export interface UploadSyncResult {
  clientes: number;
  vendas: number;
  visitas: number;
  sessionExpired?: boolean;
}

export interface UploadSyncOptions {
  /**
   * client_ids de vendas que o usuário desmarcou na tela de envio.
   * Essas vendas não são enviadas e permanecem pendentes no outbox.
   */
  skipVendaClientIds?: string[];
}

export async function runUploadSync(
  options?: UploadSyncOptions,
): Promise<UploadSyncResult> {
  const store = useSyncStore.getState();
  const skipVendas = new Set(options?.skipVendaClientIds ?? []);

  if (useSessionStore.getState().isSessionExpired()) {
    const msg = 'Sessão expirada. Faça login novamente.';
    store.finishUpload(false, msg);
    return { clientes: 0, vendas: 0, visitas: 0, sessionExpired: true };
  }

  let firstError: string | null = null;
  let sessionExpired = false;
  let clientesCount = 0;
  let vendasCount = 0;
  let visitasCount = 0;
  let uploadStarted = false;

  try {
    try {
      await resetStaleSendingOutbox();
    } catch {
      // best-effort
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

    clientesCount = clientes.length;
    vendasCount = vendas.filter((v) => !skipVendas.has(v.client_id)).length;
    visitasCount = visitas.length;

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
    uploadStarted = true;

    if (items.length === 0) {
      return { clientes: 0, vendas: 0, visitas: 0 };
    }

    const api = getApi();
    const uploadConfig = { timeout: UPLOAD_REQUEST_TIMEOUT_MS };

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
        const { data } = await api.post(
          '/upload/cliente',
          { clientId: c.client_id, ...payload },
          uploadConfig,
        );
        const cdReal: number | null =
          data?.cliente?.cdCliente ?? data?.cdCliente ?? null;
        if (!cdReal) throw new Error('Servidor não retornou cdCliente.');
        try {
          await remapClienteLocalToRemoto(c.client_id, cdReal);
        } catch (remapErr) {
          await markClienteSincronizado(c.client_id);
          throw remapErr;
        }
        await deleteOutboxCliente(c.client_id);
        store.setUploadItem(c.client_id, { status: 'sent' });
      } catch (err) {
        await handleItemError(err, c.client_id, setOutboxClienteStatus);
        if (sessionExpired) break;
      }
    }

    // Vendas desmarcadas pelo usuário ficam de fora do envio e permanecem
    // pendentes no outbox (aparecem na lista com status 'pending').
    const vendasParaEnviar = (await listPendingVendas()).filter(
      (v) => !skipVendas.has(v.client_id),
    );
    const visitasParaEnviar = await listPendingVisitas();
    vendasCount = vendasParaEnviar.length;
    visitasCount = visitasParaEnviar.length;

    for (const v of vendasParaEnviar) {
      if (sessionExpired) break;
      store.setUploadItem(v.client_id, { status: 'sending' });
      await setOutboxVendaStatus(v.client_id, 'sending');
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
        const { __display: display, ...payload } = fullPayload;
        const { data } = await api.post(
          '/upload/venda',
          { clientId: v.client_id, ...payload },
          uploadConfig,
        );
        const prevenda = data?.prevenda ?? null;
        if (prevenda?.nrPrevenda) {
          const nmCliente =
            display?.clienteNome ??
            prevenda.cliente?.nmCliente ??
            prevenda.nmCliente ??
            null;
          try {
            await upsertPrevendaFromUpload(
              {
                ...prevenda,
                clientId: v.client_id,
                idSincronizadoDuapi: prevenda.idSincronizadoDuapi ?? false,
                nmCliente,
                dsFormaPagamento:
                  display?.formaPagamentoLabel ??
                  prevenda.dsFormaPagamento ??
                  prevenda.formaPagamento?.dsFormaPagamento ??
                  null,
                prevendaItem: (prevenda.prevendaItem ?? payload.prevendaItem ?? []).map(
                  (it: any, idx: number) => ({
                    ...it,
                    dsProduto:
                      it.dsProduto ??
                      display?.itens?.[idx]?.descricao ??
                      null,
                  }),
                ),
                prevendaTitulo:
                  prevenda.prevendaTitulo ?? payload.prevendaTitulo ?? [],
                prevendaFormaPagamento:
                  prevenda.prevendaFormaPagamento ??
                  payload.prevendaFormaPagamento ??
                  [],
              },
              v.holding_id,
            );
          } catch {
            // best-effort: próximo download sync traz a prevenda
          }
        }
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
        await api.post(
          '/upload/visita',
          { clientId: v.client_id, ...payload },
          uploadConfig,
        );
        await deleteVisitaLocal(v.client_id);
        await deleteOutboxVisita(v.client_id);
        store.setUploadItem(v.client_id, { status: 'sent' });
      } catch (err) {
        await handleItemError(err, v.client_id, setOutboxVisitaStatus);
        if (sessionExpired) break;
      }
    }

    return {
      clientes: clientesCount,
      vendas: vendasCount,
      visitas: visitasCount,
      sessionExpired: sessionExpired || undefined,
    };
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    firstError = firstError || msg;
    if (isUnauthorizedApiError(err)) {
      sessionExpired = true;
    }
    throw err;
  } finally {
    if (uploadStarted) {
      store.finishUpload(!firstError, firstError);
    }
  }
}
