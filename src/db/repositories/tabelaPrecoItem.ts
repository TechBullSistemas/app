import { getDb } from '../database';

export interface TabelaPrecoItemRow {
  cd_tabela_preco: number;
  cd_produto: number;
  holding_id: number;
  vl_venda: number;
  vl_venda_atacado: number;
  vl_promocao: number;
  vl_promocao_aprazo: number;
  dt_promocao_inicio: string | null;
  dt_promocao_fim: string | null;
  vl_custo: number;
  pr_ipi: number;
  pr_desconto: number;
  pr_substituicao: number;
  pr_margem_lucro: number;
  pr_margem_extra: number;
  pr_acrescimo_financeiro: number;
  vl_custo_substituicao: number;
  vl_icms_substituicao: number;
  vl_custo_importacao: number;
  vl_custo_contabil: number;
  vl_aquisicao: number;
  vl_bonificacao: number;
  vl_custo_contabil_nf: number;
  vl_custo_contabil_medio: number;
  pr_pis_saida: number;
  pr_cofins_saida: number;
}

export async function bulkInsertTabelaPrecoItem(
  items: any[],
  holdingFallback?: number,
) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO tabela_preco_item (
           cd_tabela_preco, cd_produto, holding_id,
           vl_venda, vl_venda_atacado, vl_promocao, vl_promocao_aprazo,
           dt_promocao_inicio, dt_promocao_fim,
           vl_custo, pr_ipi, pr_desconto, pr_substituicao,
           pr_margem_lucro, pr_margem_extra, pr_acrescimo_financeiro,
           vl_custo_substituicao, vl_icms_substituicao, vl_custo_importacao,
           vl_custo_contabil, vl_aquisicao, vl_bonificacao,
           vl_custo_contabil_nf, vl_custo_contabil_medio,
           pr_pis_saida, pr_cofins_saida
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(it.cdTabelaPreco),
          Number(it.cdProduto),
          Number(it.holdingId ?? holdingFallback),
          Number(it.vlVenda ?? 0),
          Number(it.vlVendaAtacado ?? 0),
          Number(it.vlPromocao ?? 0),
          Number(it.vlPromocaoAprazo ?? 0),
          it.dtPromocaoInicio ? String(it.dtPromocaoInicio) : null,
          it.dtPromocaoFim ? String(it.dtPromocaoFim) : null,
          Number(it.vlCusto ?? 0),
          Number(it.prIpi ?? 0),
          Number(it.prDesconto ?? 0),
          Number(it.prSubstituicao ?? 0),
          Number(it.prMargemLucro ?? 0),
          Number(it.prMargemExtra ?? 0),
          Number(it.prAcrescimoFinanceiro ?? 0),
          Number(it.vlCustoSubstituicao ?? 0),
          Number(it.vlIcmsSubstituicao ?? 0),
          Number(it.vlCustoImportacao ?? 0),
          Number(it.vlCustoContabil ?? 0),
          Number(it.vlAquisicao ?? 0),
          Number(it.vlBonificacao ?? 0),
          Number(it.vlCustoContabilNf ?? 0),
          Number(it.vlCustoContabilMedio ?? 0),
          Number(it.prPisSaida ?? 0),
          Number(it.prCofinsSaida ?? 0),
        ],
      );
    }
  });
}

export async function findTabelaPrecoItem(
  cdTabelaPreco: number,
  cdProduto: number,
  holdingId: number,
): Promise<TabelaPrecoItemRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TabelaPrecoItemRow>(
    `SELECT * FROM tabela_preco_item
     WHERE cd_tabela_preco = ? AND cd_produto = ? AND holding_id = ?`,
    [cdTabelaPreco, cdProduto, holdingId],
  );
  return row ?? null;
}
