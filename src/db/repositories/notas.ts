import { getDb } from '../database';

export interface NotaFiscalRow {
  cd_nota: number;
  cd_empresa: number;
  holding_id: number;
  cd_cliente: number | null;
  dt_emissao: string | null;
  vl_total: number | null;
  raw_json: string | null;
}

export interface TituloRow {
  cd_titulo: number;
  cd_empresa: number;
  holding_id: number;
  cd_cliente: number | null;
  dt_emissao: string | null;
  dt_vencimento: string | null;
  vl_titulo: number | null;
  vl_pago: number | null;
  raw_json: string | null;
}

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function bulkInsertNotas(items: any[], holdingIdFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const cdNota = it.nrNota ?? it.cdNota;
      const cdEmpresa = it.cdEmpresa;
      const holdingId = it.holdingId ?? holdingIdFallback;
      const vlTotal = num(it.vlTotalNota ?? it.vlTotal);
      await db.runAsync(
        `INSERT OR REPLACE INTO nota_fiscal_saida
         (cd_nota, cd_empresa, holding_id, cd_cliente, dt_emissao, vl_total, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          cdNota,
          cdEmpresa,
          holdingId,
          it.cdCliente ?? null,
          it.dtEmissao ?? null,
          vlTotal,
          JSON.stringify(it),
        ],
      );
    }
  });
}

export async function bulkInsertTitulos(items: any[], holdingIdFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const cdTitulo = it.nrTitulo ?? it.cdTitulo;
      const cdEmpresa = it.cdEmpresa;
      const holdingId = it.holdingId ?? holdingIdFallback;
      const cdCliente = it.cdPessoa ?? it.cdCliente ?? null;
      await db.runAsync(
        `INSERT OR REPLACE INTO titulo_receber
         (cd_titulo, cd_empresa, holding_id, cd_cliente, dt_emissao, dt_vencimento, vl_titulo, vl_pago, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cdTitulo,
          cdEmpresa,
          holdingId,
          cdCliente,
          it.dtEmissao ?? null,
          it.dtVencimento ?? null,
          num(it.vlTitulo ?? it.vlOriginal),
          num(it.vlPago),
          JSON.stringify(it),
        ],
      );
    }
  });
}

export async function listNotasByCliente(cdCliente: number, holdingId: number) {
  const db = await getDb();
  return db.getAllAsync<NotaFiscalRow>(
    'SELECT * FROM nota_fiscal_saida WHERE cd_cliente = ? AND holding_id = ? ORDER BY dt_emissao DESC',
    [cdCliente, holdingId],
  );
}

export async function listTitulosByCliente(cdCliente: number, holdingId: number) {
  const db = await getDb();
  return db.getAllAsync<TituloRow>(
    'SELECT * FROM titulo_receber WHERE cd_cliente = ? AND holding_id = ? ORDER BY dt_vencimento',
    [cdCliente, holdingId],
  );
}
