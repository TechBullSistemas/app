import { getDb } from '../database';

export interface TabelaIcmsRow {
  cd_estado_origem: string;
  cd_estado_destino: string;
  pr_icms: number;
  id_st_diferenca_icms: string;
}

export async function bulkInsertTabelaIcms(items: any[]) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO tabela_icms
           (cd_estado_origem, cd_estado_destino, pr_icms, id_st_diferenca_icms)
         VALUES (?, ?, ?, ?)`,
        [
          String(it.cdEstadoOrigem),
          String(it.cdEstadoDestino),
          Number(it.prIcms ?? 0),
          String(it.idStDiferencaIcms ?? 'N'),
        ],
      );
    }
  });
}

export async function findTabelaIcms(
  origem: string,
  destino: string,
): Promise<TabelaIcmsRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TabelaIcmsRow>(
    `SELECT * FROM tabela_icms
     WHERE cd_estado_origem = ? AND cd_estado_destino = ?`,
    [origem, destino],
  );
  return row ?? null;
}
