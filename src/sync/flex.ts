import { getApi } from '@/api/client';
import { getDb } from '@/db/database';
import {
  storeFlexSnapshot,
  flexSeller,
  type FlexSnapshot,
} from '@/db/repositories/flex';
import { useSessionStore } from '@/stores/session';

let running: Promise<void> | null = null;
export function refreshFlex(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const { user, token } = useSessionStore.getState();
    if (!user || !token) return;
    const db = await getDb();
    const rows = await db.getAllAsync<{ client_id: string; payload: string }>(
      'SELECT client_id, payload FROM outbox_venda WHERE holding_id = ?',
      [user.holdingId],
    );
    const clientIds = rows
      .filter((row) => {
        const p = JSON.parse(row.payload);
        return flexSeller(p) === user.userId;
      })
      .map((row) => row.client_id);
    const { data } = await getApi().post<FlexSnapshot>('/flex/estado', {
      clientIds,
    });
    if (useSessionStore.getState().token !== token) return;
    await storeFlexSnapshot(user, data);
  })().finally(() => {
    running = null;
  });
  return running;
}
