import { getDb } from '@/db/database';

export interface TabelaPrecoPromocaoRow {
  cd_empresa: number;
  cd_produto: number;
  holding_id: number;
  vl_promocao: number;
  pr_comissao: number;
  dt_ult_alteracao: string;
  cd_representante: number | null;
  nr_item: number;
  dt_inicio: string;
  dt_fim: string | null;
  pr_desconto: number | null;
  cd_tabela_preco: number;
  cd_promocao: number | null;
  cd_promocao_internet: number | null;
}

export async function bulkInsertTabelaPrecoPromocao(
  items: any[],
  holdingFallback?: number,
) {
  if (!items.length) return;
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO tabela_preco_promocao (
           cd_empresa, cd_produto, holding_id, vl_promocao, pr_comissao,
           dt_ult_alteracao, cd_representante, nr_item, dt_inicio, dt_fim,
           pr_desconto, cd_tabela_preco, cd_promocao, cd_promocao_internet
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(item.cdEmpresa),
          Number(item.cdProduto),
          Number(item.holdingId ?? holdingFallback),
          Number(item.vlPromocao),
          Number(item.prComissao),
          String(item.dtUltAlteracao),
          item.cdRepresentante != null ? Number(item.cdRepresentante) : null,
          Number(item.nrItem),
          String(item.dtInicio),
          item.dtFim ? String(item.dtFim) : null,
          item.prDesconto != null ? Number(item.prDesconto) : null,
          Number(item.cdTabelaPreco ?? 0),
          item.cdPromocao != null ? Number(item.cdPromocao) : null,
          item.cdPromocaoInternet != null
            ? Number(item.cdPromocaoInternet)
            : null,
        ],
      );
    }
  });
}

interface FindPromocaoParams {
  cdEmpresa: number;
  cdProduto: number;
  cdTabelaPreco: number;
  cdRepresentante?: number | null;
  holdingId: number;
  hoje?: Date;
}

export async function findTabelaPrecoPromocao({
  cdEmpresa,
  cdProduto,
  cdTabelaPreco,
  cdRepresentante,
  holdingId,
  hoje = new Date(),
}: FindPromocaoParams): Promise<TabelaPrecoPromocaoRow | null> {
  const db = await getDb();
  const data = [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, '0'),
    String(hoje.getDate()).padStart(2, '0'),
  ].join('-');
  const representanteValido =
    cdRepresentante != null && cdRepresentante > 0
      ? Number(cdRepresentante)
      : null;

  const row = await db.getFirstAsync<TabelaPrecoPromocaoRow>(
    `SELECT *
       FROM tabela_preco_promocao
      WHERE holding_id = ?
        AND cd_empresa = ?
        AND cd_produto = ?
        AND cd_tabela_preco = ?
        AND vl_promocao > 0
        AND date(dt_inicio) <= date(?)
        AND (dt_fim IS NULL OR date(dt_fim) >= date(?))
        AND (cd_representante IS NULL OR cd_representante = ?)
      ORDER BY
        CASE WHEN cd_representante = ? THEN 0 ELSE 1 END,
        date(dt_inicio) DESC,
        nr_item DESC
      LIMIT 1`,
    [
      holdingId,
      cdEmpresa,
      cdProduto,
      cdTabelaPreco,
      data,
      data,
      representanteValido,
      representanteValido,
    ],
  );

  return row ?? null;
}
