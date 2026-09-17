import { getDb } from '../database';
import { assertFlexSave, withFlexWrite, readFlexSnapshot } from './flex';
import { useSessionStore } from '../../stores/session';
import { validarElegibilidadeVenda } from '../vendaElegibilidade';

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'error';

export interface OutboxVendaRow {
  client_id: string;
  cd_cliente: number;
  cd_empresa: number;
  holding_id: number;
  payload: string;
  vl_total: number | null;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  cd_prevenda: number | null;
}

export interface OutboxVisitaRow {
  client_id: string;
  cd_cliente: number;
  cd_empresa: number;
  holding_id: number;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface OutboxClienteRow {
  client_id: string;
  cd_cliente_local: number;
  holding_id: number;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  cd_cliente_remoto: number | null;
}

export async function enqueueVenda(item: {
  clientId: string;
  cdCliente: number;
  cdEmpresa: number;
  holdingId: number;
  payload: any;
  vlTotal: number | null;
}) {
  return withFlexWrite(async (db) => {
    const user = useSessionStore.getState().user;
    if (!user || user.holdingId !== item.holdingId)
      throw new Error('Sessão inválida para salvar este pedido.');
    await assertFlexSave(db, user, item.clientId, item.payload);
    const now = new Date().toISOString();
    await validarElegibilidadeVenda(
      db,
      item.holdingId,
      item.cdCliente,
      item.payload.prevendaItem,
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO outbox_venda
     (client_id, cd_cliente, cd_empresa, holding_id, payload, vl_total, status, attempts, last_error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?)`,
      [
        item.clientId,
        item.cdCliente,
        item.cdEmpresa,
        item.holdingId,
        JSON.stringify(item.payload),
        item.vlTotal,
        now,
      ],
    );
  });
}

export async function enqueueVisita(item: {
  clientId: string;
  cdCliente: number;
  cdEmpresa: number;
  holdingId: number;
  payload: any;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO outbox_visita
     (client_id, cd_cliente, cd_empresa, holding_id, payload, status, attempts, last_error, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?)`,
    [
      item.clientId,
      item.cdCliente,
      item.cdEmpresa,
      item.holdingId,
      JSON.stringify(item.payload),
      now,
    ],
  );
}

export async function updateOutboxVendaPayload(
  clientId: string,
  payload: any,
  vlTotal: number | null,
) {
  return withFlexWrite(async (db) => {
    const existing = await db.getFirstAsync<OutboxVendaRow>(
      'SELECT * FROM outbox_venda WHERE client_id = ?',
      [clientId],
    );
    if (!existing) throw new Error('Pedido não encontrado ou já enviado.');
    await assertEditable(existing);
    const user = useSessionStore.getState().user;
    if (
      !user ||
      user.holdingId !== existing.holding_id ||
      Number(payload.cdFuncionario) !== user.userId
    )
      throw new Error('Este pedido pertence a outro vendedor.');
    await validarElegibilidadeVenda(
      db,
      existing.holding_id,
      payload.cdCliente,
      payload.prevendaItem,
    );
    await assertFlexSave(db, user, clientId, payload);
    await db.runAsync(
      `UPDATE outbox_venda SET payload = ?, vl_total = ?, status = 'pending', last_error = NULL WHERE client_id = ?`,
      [JSON.stringify(payload), vlTotal, clientId],
    );
  });
}

async function assertEditable(row: OutboxVendaRow) {
  const payload = JSON.parse(row.payload);
  const user = useSessionStore.getState().user;
  const snapshot = user ? await readFlexSnapshot(await getDb(), user) : null;
  const enabled = snapshot?.enabled ?? user?.idUsaSaldoFlex ?? false;
  if (
    payload.flexVersion === 1 &&
    (row.status === 'sending' ||
      row.status === 'sent' ||
      (enabled && row.attempts > 0))
  ) {
    throw new Error(
      'Este pedido já teve uma tentativa de envio. Use Enviar informações para confirmar o recebimento antes de alterar ou excluir.',
    );
  }
}

export async function deleteOutboxVenda(clientId: string) {
  return withFlexWrite(async (db) => {
    const row = await db.getFirstAsync<OutboxVendaRow>(
      'SELECT * FROM outbox_venda WHERE client_id = ?',
      [clientId],
    );
    if (row) await assertEditable(row);
    await db.runAsync('DELETE FROM outbox_venda WHERE client_id = ?', [
      clientId,
    ]);
  });
}

export async function getOutboxVenda(
  clientId: string,
): Promise<OutboxVendaRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<OutboxVendaRow>(
    'SELECT * FROM outbox_venda WHERE client_id = ?',
    [clientId],
  );
  return row ?? null;
}

export async function listOutboxVendas(): Promise<OutboxVendaRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxVendaRow>(
    "SELECT * FROM outbox_venda WHERE status <> 'sent' ORDER BY created_at",
  );
}

export async function listOutboxVendasByCliente(
  cdCliente: number,
  holdingId: number,
): Promise<OutboxVendaRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxVendaRow>(
    `SELECT * FROM outbox_venda
     WHERE cd_cliente = ? AND holding_id = ? AND status <> 'sent'
     ORDER BY created_at DESC`,
    [cdCliente, holdingId],
  );
}

export async function listOutboxVisitas(): Promise<OutboxVisitaRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxVisitaRow>(
    'SELECT * FROM outbox_visita ORDER BY created_at',
  );
}

export async function listPendingVendas(): Promise<OutboxVendaRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxVendaRow>(
    "SELECT * FROM outbox_venda WHERE status IN ('pending','error') ORDER BY created_at",
  );
}

export async function listPendingVisitas(): Promise<OutboxVisitaRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxVisitaRow>(
    "SELECT * FROM outbox_visita WHERE status IN ('pending','error') ORDER BY created_at",
  );
}

export async function setOutboxVendaStatus(
  clientId: string,
  status: OutboxStatus,
  patch?: {
    lastError?: string | null;
    cdPrevenda?: number | null;
    rejected?: boolean;
  },
) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE outbox_venda
       SET status = ?,
           attempts = CASE WHEN ? = 1 THEN 0 ELSE attempts + CASE WHEN ? = 'sending' THEN 1 ELSE 0 END END,
           last_error = ?,
           sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END,
           cd_prevenda = COALESCE(?, cd_prevenda)
     WHERE client_id = ?`,
    [
      status,
      patch?.rejected ? 1 : 0,
      status,
      patch?.lastError ?? null,
      status,
      now,
      patch?.cdPrevenda ?? null,
      clientId,
    ],
  );
}

export async function updateOutboxVisitaPayload(
  clientId: string,
  payload: any,
) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox_visita
       SET payload = ?,
           status = 'pending',
           last_error = NULL
     WHERE client_id = ?`,
    [JSON.stringify(payload), clientId],
  );
}

export async function deleteOutboxVisita(clientId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox_visita WHERE client_id = ?', [
    clientId,
  ]);
}

export async function setOutboxVisitaStatus(
  clientId: string,
  status: OutboxStatus,
  patch?: { lastError?: string | null },
) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE outbox_visita
       SET status = ?,
           attempts = attempts + CASE WHEN ? IN ('pending','sending') THEN 0 ELSE 1 END,
           last_error = ?,
           sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
     WHERE client_id = ?`,
    [status, status, patch?.lastError ?? null, status, now, clientId],
  );
}

export async function enqueueCliente(item: {
  clientId: string;
  cdClienteLocal: number;
  holdingId: number;
  payload: any;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO outbox_cliente
     (client_id, cd_cliente_local, holding_id, payload, status, attempts, last_error, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, NULL, ?)`,
    [
      item.clientId,
      item.cdClienteLocal,
      item.holdingId,
      JSON.stringify(item.payload),
      now,
    ],
  );
}

export async function updateOutboxClientePayload(
  clientId: string,
  payload: any,
) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox_cliente
       SET payload = ?,
           status = 'pending',
           last_error = NULL
     WHERE client_id = ?`,
    [JSON.stringify(payload), clientId],
  );
}

export async function listOutboxClientes(): Promise<OutboxClienteRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxClienteRow>(
    'SELECT * FROM outbox_cliente ORDER BY created_at',
  );
}

export async function listPendingClientes(): Promise<OutboxClienteRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxClienteRow>(
    "SELECT * FROM outbox_cliente WHERE status IN ('pending','error') ORDER BY created_at",
  );
}

export async function deleteOutboxCliente(clientId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox_cliente WHERE client_id = ?', [
    clientId,
  ]);
}

export async function setOutboxClienteStatus(
  clientId: string,
  status: OutboxStatus,
  patch?: { lastError?: string | null; cdClienteRemoto?: number | null },
) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE outbox_cliente
       SET status = ?,
           attempts = attempts + CASE WHEN ? IN ('pending','sending') THEN 0 ELSE 1 END,
           last_error = ?,
           sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END,
           cd_cliente_remoto = COALESCE(?, cd_cliente_remoto)
     WHERE client_id = ?`,
    [
      status,
      status,
      patch?.lastError ?? null,
      status,
      now,
      patch?.cdClienteRemoto ?? null,
      clientId,
    ],
  );
}

/**
 * Remove qualquer entrada da outbox que já tenha status 'sent'.
 * Útil para limpar registros legados criados em versões anteriores onde o
 * upload marcava como 'sent' em vez de deletar.
 */
export async function purgeSentOutbox() {
  const db = await getDb();
  await db.execAsync(
    `DELETE FROM outbox_venda    WHERE status = 'sent' AND COALESCE(json_extract(payload, '$.flexVersion'), 0) <> 1;
     DELETE FROM outbox_visita   WHERE status = 'sent';
     DELETE FROM outbox_cliente  WHERE status = 'sent';`,
  );
}

/** Itens presos em 'sending' (upload interrompido) voltam para 'pending'. */
export async function resetStaleSendingOutbox() {
  const db = await getDb();
  await db.execAsync(
    `UPDATE outbox_cliente SET status = 'pending' WHERE status = 'sending';
     UPDATE outbox_venda    SET status = 'pending' WHERE status = 'sending';
     UPDATE outbox_visita   SET status = 'pending' WHERE status = 'sending';`,
  );
}

export async function countPending(): Promise<{
  vendas: number;
  visitas: number;
  clientes: number;
}> {
  const db = await getDb();
  const v = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM outbox_venda WHERE status IN ('pending','error')",
  );
  const x = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM outbox_visita WHERE status IN ('pending','error')",
  );
  const c = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM outbox_cliente WHERE status IN ('pending','error')",
  );
  return { vendas: v?.c ?? 0, visitas: x?.c ?? 0, clientes: c?.c ?? 0 };
}
