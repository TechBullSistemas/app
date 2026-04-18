import { getDb } from '../database';

export interface VisitaRow {
  cd_visita: number | null;
  cd_empresa: number | null;
  holding_id: number | null;
  cd_cliente: number;
  cd_vendedor: number;
  dt_visita: string;
  id_comprou: number;
  motivo_nao_comprou: string | null;
  observacao: string | null;
  latitude: number | null;
  longitude: number | null;
  client_id: string | null;
  origem: string;
}

export async function bulkInsertVisitas(items: any[], holdingIdFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO visita
         (cd_visita, cd_empresa, holding_id, cd_cliente, cd_vendedor, dt_visita,
          id_comprou, motivo_nao_comprou, observacao, latitude, longitude, client_id, origem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'remoto')`,
        [
          it.cdVisita ?? null,
          it.cdEmpresa ?? null,
          it.holdingId ?? holdingIdFallback ?? null,
          it.cdCliente,
          it.cdVendedor,
          typeof it.dtVisita === 'string' ? it.dtVisita : new Date(it.dtVisita).toISOString(),
          it.idComprou ? 1 : 0,
          it.motivoNaoComprou ?? null,
          it.observacao ?? null,
          it.latitude != null ? Number(it.latitude) : null,
          it.longitude != null ? Number(it.longitude) : null,
          it.clientId ?? null,
        ],
      );
    }
  });
}

export async function insertVisitaLocal(v: {
  clientId: string;
  cdCliente: number;
  cdVendedor: number;
  cdEmpresa: number;
  holdingId: number;
  dtVisita: string;
  idComprou: boolean;
  motivoNaoComprou?: string | null;
  observacao?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO visita
     (cd_visita, cd_empresa, holding_id, cd_cliente, cd_vendedor, dt_visita,
      id_comprou, motivo_nao_comprou, observacao, latitude, longitude, client_id, origem)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
    [
      v.cdEmpresa,
      v.holdingId,
      v.cdCliente,
      v.cdVendedor,
      v.dtVisita,
      v.idComprou ? 1 : 0,
      v.motivoNaoComprou ?? null,
      v.observacao ?? null,
      v.latitude ?? null,
      v.longitude ?? null,
      v.clientId,
    ],
  );
}

export async function markVisitaUploaded(
  clientId: string,
  cdVisita: number | null,
  cdEmpresa: number | null,
) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE visita
     SET origem = 'remoto',
         cd_visita = COALESCE(?, cd_visita),
         cd_empresa = COALESCE(?, cd_empresa)
     WHERE client_id = ?`,
    [cdVisita, cdEmpresa, clientId],
  );
}

export async function listVisitas(limit = 200): Promise<VisitaRow[]> {
  const db = await getDb();
  return db.getAllAsync<VisitaRow>(
    'SELECT * FROM visita ORDER BY dt_visita DESC LIMIT ?',
    [limit],
  );
}

export async function listVisitasCliente(cdCliente: number, holdingId: number) {
  const db = await getDb();
  return db.getAllAsync<VisitaRow>(
    'SELECT * FROM visita WHERE cd_cliente = ? AND holding_id = ? ORDER BY dt_visita DESC',
    [cdCliente, holdingId],
  );
}

export async function getVisitaByClientId(clientId: string) {
  const db = await getDb();
  return db.getFirstAsync<VisitaRow>(
    'SELECT * FROM visita WHERE client_id = ?',
    [clientId],
  );
}

export async function updateVisitaLocal(
  clientId: string,
  patch: {
    idComprou: boolean;
    motivoNaoComprou?: string | null;
    observacao?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    dtVisita?: string;
  },
) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE visita
       SET id_comprou = ?,
           motivo_nao_comprou = ?,
           observacao = ?,
           latitude = ?,
           longitude = ?,
           dt_visita = COALESCE(?, dt_visita)
     WHERE client_id = ? AND origem = 'local'`,
    [
      patch.idComprou ? 1 : 0,
      patch.motivoNaoComprou ?? null,
      patch.observacao ?? null,
      patch.latitude ?? null,
      patch.longitude ?? null,
      patch.dtVisita ?? null,
      clientId,
    ],
  );
}

export async function deleteVisitaLocal(clientId: string) {
  const db = await getDb();
  await db.runAsync(
    "DELETE FROM visita WHERE client_id = ? AND origem = 'local'",
    [clientId],
  );
}
