import { getDb } from '../database';

export interface CondicaoPagtoPrecoRow {
  cd_condicao_pagto: number;
  cd_tabela_preco_condicao: number;
  holding_id: number;
  pr_acrescimo: number;
  pr_comissao: number;
  id_entra_pauta: string;
  nr_ordem_pauta: number;
}

export async function bulkInsertCondicaoPagtoPreco(
  items: any[],
  holdingFallback?: number,
) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO condicao_pagto_preco (
           cd_condicao_pagto, cd_tabela_preco_condicao, holding_id,
           pr_acrescimo, pr_comissao, id_entra_pauta, nr_ordem_pauta
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(it.cdCondicaoPagto),
          Number(it.cdTabelaPrecoCondicao),
          Number(it.holdingId ?? holdingFallback),
          Number(it.prAcrescimo ?? 0),
          Number(it.prComissao ?? 0),
          String(it.idEntraPauta ?? 'N'),
          Number(it.nrOrdemPauta ?? 0),
        ],
      );
    }
  });
}

export async function findCondicaoPagtoPreco(
  cdCondicaoPagto: number,
  cdCondicaoPreco: number,
  holdingId: number,
): Promise<CondicaoPagtoPrecoRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CondicaoPagtoPrecoRow>(
    `SELECT * FROM condicao_pagto_preco
     WHERE cd_condicao_pagto = ? AND cd_tabela_preco_condicao = ? AND holding_id = ?`,
    [cdCondicaoPagto, cdCondicaoPreco, holdingId],
  );
  return row ?? null;
}
