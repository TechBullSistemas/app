import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../database';
import { calcularFlexPedido } from '../../services/pricing/flex';

export interface FlexSnapshot {
  enabled: boolean;
  ready: boolean;
  revision: number;
  saldo: number;
  pendente: number;
  disponivel: number;
  syncedAt: string | null;
  conhecidos: string[];
}
export type FlexScope = {
  holdingId: number;
  userId: number;
  idUsaSaldoFlex?: boolean;
};
export function flexSeller(payload: any): number | null {
  const displayId = String(payload.__display?.representante ?? '').match(
    /^(\d+)\s*-/,
  )?.[1];
  const value = Number(
    payload.cdFuncionario ?? displayId ?? payload.cdRepresentante,
  );
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

type Db = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

// Local saves and complete snapshots share one queue and a SQLite transaction.
let queue: Promise<unknown> = Promise.resolve();
export function withFlexWrite<T>(
  work: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const task = queue.then(async () => {
    const db = await getDb();
    let result!: T;
    if (Platform.OS === 'web') {
      await db.withTransactionAsync(async () => {
        result = await work(db);
      });
    } else {
      await db.withExclusiveTransactionAsync(async (tx) => {
        result = await work(tx);
      });
    }
    return result;
  });
  queue = task.catch(() => undefined);
  return task;
}

export async function readFlexSnapshot(
  db: Db,
  scope: FlexScope,
): Promise<FlexSnapshot | null> {
  const row = await db.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM flex_estado WHERE holding_id = ? AND user_id = ?',
    [scope.holdingId, scope.userId],
  );
  return row ? JSON.parse(row.payload) : null;
}

export async function getFlexLocal(
  scope: FlexScope,
  excludeClientId?: string,
  db?: Db,
) {
  const conn = db ?? (await getDb());
  const snapshot = await readFlexSnapshot(conn, scope);
  const enabled = snapshot?.enabled ?? scope.idUsaSaldoFlex === true;
  if (!enabled)
    return { enabled: false, ready: false, disponivel: 0, local: 0 };
  const known = new Set(snapshot?.conhecidos ?? []);
  const rows = await conn.getAllAsync<{ client_id: string; payload: string }>(
    'SELECT client_id, payload FROM outbox_venda WHERE holding_id = ?',
    [scope.holdingId],
  );
  let localCents = 0;
  for (const row of rows) {
    if (row.client_id === excludeClientId || known.has(row.client_id)) continue;
    const payload = JSON.parse(row.payload);
    if (flexSeller(payload) != null && flexSeller(payload) !== scope.userId)
      continue;
    localCents += Math.round(
      calcularFlexPedido(payload.prevendaItem ?? []).consumo * 100,
    );
  }
  const local = localCents / 100;
  return {
    enabled: true,
    ready: snapshot?.ready === true,
    local,
    disponivel: Math.round(((snapshot?.disponivel ?? 0) - local) * 100) / 100,
  };
}

export async function assertFlexSave(
  db: Db,
  scope: FlexScope,
  clientId: string,
  payload: any,
) {
  const state = await getFlexLocal(scope, clientId, db);
  if (!state.enabled) return;
  const { consumo } = calcularFlexPedido(payload.prevendaItem);
  if (consumo <= 0) return;
  if (!state.ready)
    throw new Error(
      'Saldo Flex ainda não sincronizado. Use Buscar informações antes de conceder desconto.',
    );
  if (consumo > state.disponivel) {
    const money = (value: number) =>
      value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    throw new Error(
      `Saldo Flex insuficiente. Disponível: ${money(Math.max(0, state.disponivel))}. Desconto solicitado: ${money(consumo)}. Reduza o desconto para salvar o pedido.`,
    );
  }
}

export async function storeFlexSnapshot(
  scope: FlexScope,
  snapshot: FlexSnapshot,
) {
  if (
    typeof snapshot.enabled !== 'boolean' ||
    typeof snapshot.ready !== 'boolean' ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    ![snapshot.saldo, snapshot.pendente, snapshot.disponivel].every(
      Number.isFinite,
    ) ||
    !Array.isArray(snapshot.conhecidos) ||
    snapshot.conhecidos.some((id) => typeof id !== 'string')
  ) {
    throw new Error(
      'Resposta de saldo Flex inválida. Tente sincronizar novamente.',
    );
  }
  await withFlexWrite(async (db) => {
    const previous = await readFlexSnapshot(db, scope);
    if (previous && previous.revision > snapshot.revision) return;
    await db.runAsync(
      'INSERT OR REPLACE INTO flex_estado (holding_id, user_id, payload) VALUES (?, ?, ?)',
      [scope.holdingId, scope.userId, JSON.stringify(snapshot)],
    );
    // A complete response transfers these reservations to the server. Remove
    // receipts atomically, so the next request can omit their clientIds safely.
    for (const id of snapshot.conhecidos) {
      await db.runAsync(
        'DELETE FROM outbox_venda WHERE client_id = ? AND holding_id = ?',
        [id, scope.holdingId],
      );
    }
  });
}
