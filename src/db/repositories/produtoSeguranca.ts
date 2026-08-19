import { getDb } from '../database';

export interface ProdutoSegurancaRow {
  cd_empresa: number;
  cd_produto: number;
  holding_id: number;
  pr_margem_seguranca: number;
}

export async function bulkInsertProdutoSeguranca(
  items: any[],
  holdingFallback?: number,
) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO produto_seguranca
           (cd_empresa, cd_produto, holding_id, pr_margem_seguranca)
         VALUES (?, ?, ?, ?)`,
        [
          Number(item.cdEmpresa),
          Number(item.cdProduto),
          Number(item.holdingId ?? holdingFallback),
          Number(item.prMargemSeguranca ?? 0),
        ],
      );
    }
  });
}

export async function findProdutoSeguranca(
  cdEmpresa: number,
  cdProduto: number,
  holdingId: number,
): Promise<ProdutoSegurancaRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProdutoSegurancaRow>(
    `SELECT * FROM produto_seguranca
      WHERE cd_empresa = ? AND cd_produto = ? AND holding_id = ?`,
    [cdEmpresa, cdProduto, holdingId],
  );
  return row ?? null;
}
