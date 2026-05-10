import { getDb } from '../database';

export interface CondicaoPrecoRow {
  cd_condicao_preco: number;
  holding_id: number;
  descricao: string | null;
  id_promocao: string | null;
  pr_acrescimo: number | null;
  pr_acrescimo_comissao: number | null;
  id_tipo_acrescimo: string | null;
  id_ultima_venda: number | null;
  vl_valor: number | null;
  raw_json: string | null;
}

export async function listCondicoesPreco(
  holdingId: number,
): Promise<CondicaoPrecoRow[]> {
  const db = await getDb();
  return db.getAllAsync<CondicaoPrecoRow>(
    `SELECT * FROM condicao_preco
      WHERE holding_id = ?
      ORDER BY cd_condicao_preco ASC`,
    [holdingId],
  );
}

export async function findCondicaoPreco(
  cdCondicaoPreco: number,
  holdingId: number,
): Promise<CondicaoPrecoRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CondicaoPrecoRow>(
    `SELECT * FROM condicao_preco
      WHERE cd_condicao_preco = ? AND holding_id = ?`,
    [cdCondicaoPreco, holdingId],
  );
  return row ?? null;
}
