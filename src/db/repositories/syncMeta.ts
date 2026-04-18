import { getDb } from '../database';

export type SyncStatus = 'pending' | 'running' | 'done' | 'error';

export interface SyncMetaRow {
  entity: string;
  total: number;
  downloaded: number;
  status: SyncStatus;
  message: string | null;
  updated_at: string | null;
}

export async function upsertSyncMeta(
  entity: string,
  patch: Partial<Omit<SyncMetaRow, 'entity'>>,
) {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<SyncMetaRow>(
    'SELECT * FROM sync_meta WHERE entity = ?',
    [entity],
  );
  if (!existing) {
    await db.runAsync(
      `INSERT INTO sync_meta (entity, total, downloaded, status, message, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entity,
        patch.total ?? 0,
        patch.downloaded ?? 0,
        patch.status ?? 'pending',
        patch.message ?? null,
        now,
      ],
    );
  } else {
    await db.runAsync(
      `UPDATE sync_meta SET
        total = ?,
        downloaded = ?,
        status = ?,
        message = ?,
        updated_at = ?
       WHERE entity = ?`,
      [
        patch.total ?? existing.total,
        patch.downloaded ?? existing.downloaded,
        patch.status ?? existing.status,
        patch.message ?? existing.message,
        now,
        entity,
      ],
    );
  }
}

export async function listSyncMeta(): Promise<SyncMetaRow[]> {
  const db = await getDb();
  return db.getAllAsync<SyncMetaRow>('SELECT * FROM sync_meta ORDER BY entity');
}

export async function resetSyncMeta(entities: string[]) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const e of entities) {
      await db.runAsync(
        `INSERT INTO sync_meta (entity, total, downloaded, status, message, updated_at)
         VALUES (?, 0, 0, 'pending', NULL, ?)
         ON CONFLICT(entity) DO UPDATE SET
           total = 0, downloaded = 0, status = 'pending', message = NULL, updated_at = ?`,
        [e, now, now],
      );
    }
  });
}
