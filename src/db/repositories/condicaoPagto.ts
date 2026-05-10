import { getDb } from '../database';

/**
 * Acesso à `condicao_pagto` local. Os campos `pr_desconto` e
 * `pr_acrescimo` são essenciais para o pipeline de preço (legado:
 * `cliente_condicao_pagto.getPr_desconto()` é subtraído do preço-base).
 */
export interface CondicaoPagtoRow {
  cd_condicao: number;
  holding_id: number;
  descricao: string | null;
  qt_parcelas: number | null;
  pr_acrescimo: number | null;
  pr_desconto: number | null;
}

export async function findCondicaoPagto(
  cdCondicao: number,
  holdingId: number,
): Promise<CondicaoPagtoRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CondicaoPagtoRow>(
    `SELECT cd_condicao, holding_id, descricao, qt_parcelas,
            pr_acrescimo, pr_desconto
       FROM condicao_pagto
      WHERE cd_condicao = ? AND holding_id = ?`,
    [cdCondicao, holdingId],
  );
  return row ?? null;
}
