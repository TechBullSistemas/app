import { getDb } from '../database';

// Espelho da `Util_Parametro` do legado: lê os flags da empresa e devolve
// getters tipados com os mesmos nomes do Prisma para o resto do app não
// precisar lidar com snake_case nem com nulls/strings vazias.
export interface EmpresaParametros {
  cdEmpresa: number;
  holdingId: number;
  cdEstado: string | null;
  cdTabelaPrecoPadrao: number | null;
  // Flags fiscais
  idDestacaIpi: 'S' | 'N';
  idSubstitutoTributarioIcms: 'S' | 'N';
  idCalculaSubstituicaoTributariaSempre: 'S' | 'N';
  idRegimeUtilizaReducaoBaseSubstituicao: 'S' | 'N' | 'T';
  idUtilizaMvaExternoVenda: 'S' | 'N';
  idUtilizaStDiferencaIcms: 'S' | 'N';
  idUtilizaReducaoIcmsForaEstado: 'S' | 'N';
  prIcmsProdutoImportadoCompraVendaForaEstado: number;
  // Flags comerciais
  idUtilizaDescontoCreditoSubstituicaoVenda: 'S' | 'N';
  idUtilizaDescontoPromocaoPedidoVenda: 'S' | 'N';
  idUtilizaPromocaoPorTabelaPreco: 'S' | 'N';
  idUtilizaCondicaoPagtoLigacaoCondicaoPreco: 'S' | 'N';
  idEmpresaUtilizaAcrescimoCondicaoPagto: 'S' | 'N';
  // Controles
  idProdutoControleVariacaoPreco: 'M' | 'D';
  prMargemLucroMinimo: number;
  nrCasaDecimalValorVenda: number;
  idBloqueiaAlteracaoPrecoTablet: 'S' | 'N';
  idIgnoraTabelaPrecoClienteTablet: 'S' | 'N';
  idAlteraTabelaPrecoTablet: 'S' | 'N';
  idPermiteAlterarValorProdutoPalm: 'S' | 'A' | 'N';
  idPermiteAlterarFormaPagamentoApp: boolean;
  idDataSincronizacaoVendaApp: boolean;
  // Fórmula dinâmica
  dsFuncaoCalculoPrecoVenda: string | null;
  dsFuncaoCalculoMargemLucro: string | null;
  // Legado aceita 'S' (custo agregado simples), 'N' (não usa) e 'F' (fórmula).
  // 'F' é o gate principal de `f_calcula_margem_lucro_item` para rodar
  // `ds_funcao_calculo_preco_venda`.
  idCustoAgregado: 'S' | 'N' | 'F';
  // Forma do preço de venda do produto:
  //   'T' = tabela de preço (pipeline padrão, fórmula não roda),
  //   'V' = última venda do produto para o cliente (fallback: tabela),
  //   'M' = margem — usa a fórmula `ds_funcao_calculo_preco_venda`.
  idFormaPrecoVendaProduto: 'T' | 'V' | 'M';
}

const DEFAULTS: Omit<EmpresaParametros, 'cdEmpresa' | 'holdingId'> = {
  cdEstado: null,
  cdTabelaPrecoPadrao: null,
  idDestacaIpi: 'N',
  idSubstitutoTributarioIcms: 'N',
  idCalculaSubstituicaoTributariaSempre: 'N',
  idRegimeUtilizaReducaoBaseSubstituicao: 'N',
  idUtilizaMvaExternoVenda: 'N',
  idUtilizaStDiferencaIcms: 'N',
  idUtilizaReducaoIcmsForaEstado: 'N',
  prIcmsProdutoImportadoCompraVendaForaEstado: 0,
  idUtilizaDescontoCreditoSubstituicaoVenda: 'N',
  idUtilizaDescontoPromocaoPedidoVenda: 'N',
  idUtilizaPromocaoPorTabelaPreco: 'N',
  idUtilizaCondicaoPagtoLigacaoCondicaoPreco: 'N',
  idEmpresaUtilizaAcrescimoCondicaoPagto: 'S',
  idProdutoControleVariacaoPreco: 'D',
  prMargemLucroMinimo: 0,
  nrCasaDecimalValorVenda: 2,
  idBloqueiaAlteracaoPrecoTablet: 'N',
  idIgnoraTabelaPrecoClienteTablet: 'N',
  idAlteraTabelaPrecoTablet: 'N',
  idPermiteAlterarValorProdutoPalm: 'S',
  idPermiteAlterarFormaPagamentoApp: true,
  idDataSincronizacaoVendaApp: false,
  dsFuncaoCalculoPrecoVenda: null,
  dsFuncaoCalculoMargemLucro: null,
  idCustoAgregado: 'N',
  idFormaPrecoVendaProduto: 'T',
};

function s(v: unknown, fallback: any): any {
  if (v === null || v === undefined || v === '') return fallback;
  return v;
}

function n(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback;
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export async function getEmpresaParametros(
  cdEmpresa: number,
  holdingId: number,
): Promise<EmpresaParametros> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM empresa WHERE cd_empresa = ? AND holding_id = ?`,
    [cdEmpresa, holdingId],
  );
  if (!row) {
    return { cdEmpresa, holdingId, ...DEFAULTS };
  }
  return {
    cdEmpresa,
    holdingId,
    cdEstado: s(row.cd_estado, null),
    cdTabelaPrecoPadrao:
      row.cd_tabela_preco_padrao != null
        ? Number(row.cd_tabela_preco_padrao)
        : null,
    idDestacaIpi: s(row.id_destaca_ipi, DEFAULTS.idDestacaIpi),
    idSubstitutoTributarioIcms: s(
      row.id_substituto_tributario_icms,
      DEFAULTS.idSubstitutoTributarioIcms,
    ),
    idCalculaSubstituicaoTributariaSempre: s(
      row.id_calcula_substituicao_tributaria_sempre,
      DEFAULTS.idCalculaSubstituicaoTributariaSempre,
    ),
    idRegimeUtilizaReducaoBaseSubstituicao: s(
      row.id_regime_utiliza_reducao_base_substituicao,
      DEFAULTS.idRegimeUtilizaReducaoBaseSubstituicao,
    ),
    idUtilizaMvaExternoVenda: s(
      row.id_utiliza_mva_externo_venda,
      DEFAULTS.idUtilizaMvaExternoVenda,
    ),
    idUtilizaStDiferencaIcms: s(
      row.id_utiliza_st_diferenca_icms,
      DEFAULTS.idUtilizaStDiferencaIcms,
    ),
    idUtilizaReducaoIcmsForaEstado: s(
      row.id_utiliza_reducao_icms_fora_estado,
      DEFAULTS.idUtilizaReducaoIcmsForaEstado,
    ),
    prIcmsProdutoImportadoCompraVendaForaEstado: n(
      row.pr_icms_produto_importado_compra_venda_fora_estado,
      DEFAULTS.prIcmsProdutoImportadoCompraVendaForaEstado,
    ),
    idUtilizaDescontoCreditoSubstituicaoVenda: s(
      row.id_utiliza_desconto_credito_substituicao_venda,
      DEFAULTS.idUtilizaDescontoCreditoSubstituicaoVenda,
    ),
    idUtilizaDescontoPromocaoPedidoVenda: s(
      row.id_utiliza_desconto_promocao_pedido_venda,
      DEFAULTS.idUtilizaDescontoPromocaoPedidoVenda,
    ),
    idUtilizaPromocaoPorTabelaPreco: s(
      row.id_utiliza_promocao_por_tabela_preco,
      DEFAULTS.idUtilizaPromocaoPorTabelaPreco,
    ),
    idUtilizaCondicaoPagtoLigacaoCondicaoPreco: s(
      row.id_utiliza_condicao_pagto_ligacao_condicao_preco,
      DEFAULTS.idUtilizaCondicaoPagtoLigacaoCondicaoPreco,
    ),
    idEmpresaUtilizaAcrescimoCondicaoPagto: s(
      row.id_empresa_utiliza_acrescimo_condicao_pagto,
      DEFAULTS.idEmpresaUtilizaAcrescimoCondicaoPagto,
    ),
    idProdutoControleVariacaoPreco: s(
      row.id_produto_controle_variacao_preco,
      DEFAULTS.idProdutoControleVariacaoPreco,
    ),
    prMargemLucroMinimo: n(
      row.pr_margem_lucro_minimo,
      DEFAULTS.prMargemLucroMinimo,
    ),
    nrCasaDecimalValorVenda: n(
      row.nr_casa_decimal_valor_venda,
      DEFAULTS.nrCasaDecimalValorVenda,
    ),
    idBloqueiaAlteracaoPrecoTablet: s(
      row.id_bloqueia_alteracao_preco_tablet,
      DEFAULTS.idBloqueiaAlteracaoPrecoTablet,
    ),
    idIgnoraTabelaPrecoClienteTablet: s(
      row.id_ignora_tabela_preco_cliente_tablet,
      DEFAULTS.idIgnoraTabelaPrecoClienteTablet,
    ),
    idAlteraTabelaPrecoTablet: s(
      row.id_altera_tabela_preco_tablet,
      DEFAULTS.idAlteraTabelaPrecoTablet,
    ),
    idPermiteAlterarValorProdutoPalm: s(
      row.id_permite_alterar_valor_produto_palm,
      DEFAULTS.idPermiteAlterarValorProdutoPalm,
    ),
    idPermiteAlterarFormaPagamentoApp:
      row.id_permite_alterar_forma_pagamento_app !== 0,
    idDataSincronizacaoVendaApp:
      row.id_data_sincronizacao_venda_app === 1,
    dsFuncaoCalculoPrecoVenda: s(
      row.ds_funcao_calculo_preco_venda,
      DEFAULTS.dsFuncaoCalculoPrecoVenda,
    ),
    dsFuncaoCalculoMargemLucro: s(
      row.ds_funcao_calculo_margem_lucro,
      DEFAULTS.dsFuncaoCalculoMargemLucro,
    ),
    idCustoAgregado: s(row.id_custo_agregado, DEFAULTS.idCustoAgregado),
    idFormaPrecoVendaProduto: s(
      row.id_forma_preco_venda_produto,
      DEFAULTS.idFormaPrecoVendaProduto,
    ),
  };
}

export interface CustoVariavelRow {
  cd_empresa: number;
  nm_variavel: string;
  holding_id: number;
  pr_variavel: number;
  id_utilizacao: string;
}

export async function bulkInsertProdutoCustoVariavel(
  items: any[],
  holdingFallback?: number,
) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO produto_custo_variavel
           (cd_empresa, nm_variavel, holding_id, pr_variavel, id_utilizacao)
         VALUES (?, ?, ?, ?, ?)`,
        [
          Number(it.cdEmpresa),
          String(it.nmVariavel),
          Number(it.holdingId ?? holdingFallback),
          Number(it.prVariavel ?? 0),
          String(it.idUtilizacao ?? 'F'),
        ],
      );
    }
  });
}

export async function listCustoVariavel(
  cdEmpresa: number,
  holdingId: number,
): Promise<CustoVariavelRow[]> {
  const db = await getDb();
  return db.getAllAsync<CustoVariavelRow>(
    `SELECT * FROM produto_custo_variavel WHERE cd_empresa = ? AND holding_id = ?`,
    [cdEmpresa, holdingId],
  );
}
