import { getDb } from '../database';

export interface ProdutoDescontoRow {
  cd_produto: number;
  nr_item: number;
  holding_id: number;
  qt_produto_inicio: number;
  qt_produto_fim: number;
  pr_desconto: number;
}

export async function bulkInsertProdutoDesconto(
  items: any[],
  holdingFallback?: number,
) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO produto_desconto
           (cd_produto, nr_item, holding_id, qt_produto_inicio, qt_produto_fim, pr_desconto)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          Number(it.cdProduto),
          Number(it.nrItem),
          Number(it.holdingId ?? holdingFallback),
          Number(it.qtProdutoInicio ?? 0),
          Number(it.qtProdutoFim ?? 0),
          Number(it.prDesconto ?? 0),
        ],
      );
    }
  });
}

// Retorna a faixa que contém `qt`. Se nenhuma faixa cobrir, retorna null.
export async function findDescontoFaixa(
  cdProduto: number,
  qt: number,
  holdingId: number,
): Promise<ProdutoDescontoRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProdutoDescontoRow>(
    `SELECT * FROM produto_desconto
     WHERE cd_produto = ? AND holding_id = ?
       AND qt_produto_inicio <= ? AND qt_produto_fim >= ?
     ORDER BY pr_desconto DESC LIMIT 1`,
    [cdProduto, holdingId, qt, qt],
  );
  return row ?? null;
}
