// Fachada do motor de precificação. Orquestra os módulos individuais e expõe
// `calcularItem` (item único) e `calcularPedido` (lista de itens).
//
// Importante: este motor NUNCA é a fonte da verdade fiscal — o ERP recalcula
// IPI/ICMS/ST no faturamento da NF. O propósito é dar ao vendedor uma
// estimativa instantânea offline, equivalente ao que o app legado entregava.

import type {
  ContextoCalculoItem,
  ItemPedidoEngine,
  ProdutoEngine,
  ResultadoCalculoItem,
  TabelaPrecoItemEngine,
} from './types';
import { calcularAliquotas } from './aliquotas';
import { calcularSubstituicao } from './substituicao';
import { calcularIpi } from './ipi';
import { calcularComissao } from './comissao';
import { calcularPrecoUnitario } from './precoUnitario';
import { calculaTotaisPedido, TotalItemEngine } from './totais';
import { roundN, safeNumber } from './casasDecimais';
import { findImpostoUf } from '@/db/repositories/impostos';
import { findTabelaIcms } from '@/db/repositories/tabelaIcms';
import { findCondicaoPagtoPreco } from '@/db/repositories/condicaoPagtoPreco';
import { findCondicaoPreco } from '@/db/repositories/condicaoPreco';
import { findCondicaoPagto } from '@/db/repositories/condicaoPagto';
import { findTabelaPrecoItem } from '@/db/repositories/tabelaPrecoItem';

export interface CalcularItemInput {
  produto: ProdutoEngine;
  qt: number;
  contexto: ContextoCalculoItem;
  // Override manual do preço (vendedor digitou). Quando presente, pula o
  // pipeline de cálculo de preço e usa esse valor — mas ainda calcula IPI/ST,
  // comissão e flex sobre ele.
  vlUnitarioManual?: number;
  // Permite injetar tabelaPrecoItem já carregada para evitar SELECT extra.
  precoTabela?: TabelaPrecoItemEngine | null;
  holdingId: number;
}

export async function calcularItem(
  input: CalcularItemInput,
): Promise<ResultadoCalculoItem> {
  const { produto, qt, contexto, holdingId } = input;
  const empresa = contexto.empresa;
  const avisos: string[] = [];

  // Carrega o preço da tabela quando não veio injetado.
  let precoTabela = input.precoTabela ?? null;
  if (!precoTabela && contexto.cdTabelaPreco) {
    const row = await findTabelaPrecoItem(
      contexto.cdTabelaPreco,
      produto.cdProduto,
      holdingId,
    );
    if (row) {
      precoTabela = {
        cdTabelaPreco: row.cd_tabela_preco,
        cdProduto: row.cd_produto,
        vlVenda: Number(row.vl_venda ?? 0),
        vlVendaAtacado: Number(row.vl_venda_atacado ?? 0),
        vlPromocao: Number(row.vl_promocao ?? 0),
        vlPromocaoAprazo: Number(row.vl_promocao_aprazo ?? 0),
        dtPromocaoInicio: row.dt_promocao_inicio,
        dtPromocaoFim: row.dt_promocao_fim,
        vlCusto: Number(row.vl_custo ?? 0),
        prIpi: Number(row.pr_ipi ?? 0),
        prDesconto: Number(row.pr_desconto ?? 0),
        prSubstituicao: Number(row.pr_substituicao ?? 0),
        prMargemLucro: Number(row.pr_margem_lucro ?? 0),
        prMargemExtra: Number(row.pr_margem_extra ?? 0),
        prAcrescimoFinanceiro: Number(row.pr_acrescimo_financeiro ?? 0),
        vlCustoSubstituicao: Number(row.vl_custo_substituicao ?? 0),
        vlIcmsSubstituicao: Number(row.vl_icms_substituicao ?? 0),
        vlCustoImportacao: Number(row.vl_custo_importacao ?? 0),
        vlCustoContabil: Number(row.vl_custo_contabil ?? 0),
        vlAquisicao: Number(row.vl_aquisicao ?? 0),
        vlBonificacao: Number(row.vl_bonificacao ?? 0),
        vlCustoContabilNf: Number(row.vl_custo_contabil_nf ?? 0),
        vlCustoContabilMedio: Number(row.vl_custo_contabil_medio ?? 0),
        prPisSaida: Number(row.pr_pis_saida ?? 0),
        prCofinsSaida: Number(row.pr_cofins_saida ?? 0),
      };
    }
  }

  // Resolve impostoUf e tabela_icms quando ausentes do contexto.
  // Estratégia (espelha o legado em `f_calculo_custo`):
  //   - Para PIS/COFINS/ICMS de saída usados na fórmula: imposto_uf da
  //     UF da EMPRESA é a fonte primária.
  //   - Para ST e operações entre estados, calcularAliquotas combina com
  //     `tabela_icms` (origem×destino).
  // Buscamos primeiro pela UF do cliente (preferência da operação atual),
  // com fallback para UF da empresa quando o cliente não tem UF cadastrada.
  if (!contexto.impostoUf && produto.cdImposto) {
    const ufLookup = contexto.ufCliente ?? contexto.ufEmpresa ?? null;
    const r = ufLookup
      ? await findImpostoUf(produto.cdImposto, ufLookup, holdingId)
      : null;
    if (r) {
      contexto.impostoUf = {
        cdImposto: r.cd_imposto,
        cdEstado: r.cd_estado,
        prIcmsInterno: Number(r.pr_icms_interno),
        prIcmsInternoRevenda: Number(r.pr_icms_interno_revenda ?? 0),
        prIcmsInternoIndustria: Number(r.pr_icms_interno_industria ?? 0),
        prIcmsExterno: Number(r.pr_icms_externo),
        prBaseSubstituicaoInterno: Number(r.pr_base_substituicao_interno),
        prBaseSubstituicaoExterno: Number(r.pr_base_substituicao_externo),
        prReducaoBaseSubstituicaoInterno: Number(
          r.pr_reducao_base_substituicao_interno,
        ),
        prReducaoBaseSubstituicaoExterno: Number(
          r.pr_reducao_base_substituicao_externo,
        ),
        prReducaoIcmsInterno: Number(r.pr_reducao_icms_interno),
        prReducaoIcmsExterno: Number(r.pr_reducao_icms_externo),
        prPis: Number(r.pr_pis),
        prCofins: Number(r.pr_cofins),
        prFcp: Number(r.pr_fcp),
        prFcpSt: Number(r.pr_fcp_st),
      };
    }
  }

  let prIcmsTabela: number | null = contexto.prIcmsTabela ?? null;
  let idStDiferenca: 'S' | 'N' = 'N';
  if (!prIcmsTabela && contexto.ufEmpresa && contexto.ufCliente) {
    const t = await findTabelaIcms(contexto.ufEmpresa, contexto.ufCliente);
    if (t) {
      prIcmsTabela = Number(t.pr_icms);
      idStDiferenca = (t.id_st_diferenca_icms ?? 'N') as 'S' | 'N';
    }
  }

  // CondicaoPreco resolvida a partir de cdCondicaoPreco quando o caller
  // (ex.: PedidoForm) só passa o id selecionado no dropdown por item.
  if (!contexto.condicaoPreco && contexto.cdCondicaoPreco) {
    const c = await findCondicaoPreco(contexto.cdCondicaoPreco, holdingId);
    if (c) {
      contexto.condicaoPreco = {
        cdCondicaoPreco: c.cd_condicao_preco,
        idPromocao: c.id_promocao === 'S',
        prAcrescimo: Number(c.pr_acrescimo ?? 0),
        prAcrescimoComissao: Number(c.pr_acrescimo_comissao ?? 0),
        idTipoAcrescimo: (c.id_tipo_acrescimo ?? 'V') as 'V' | 'N' | 'M',
        idUltimaVenda: (c.id_ultima_venda ?? 0) > 0,
        vlValor: Number(c.vl_valor ?? 0),
      };
    }
  }

  // CondicaoPagto quando ausente — necessária para o `pr_desconto` do
  // legado (passo 4 do `Produto_Valores_find`: subtrai do preço-base).
  if (!contexto.condicaoPagto && contexto.cdCondicaoPagto) {
    const cp = await findCondicaoPagto(contexto.cdCondicaoPagto, holdingId);
    if (cp) {
      contexto.condicaoPagto = {
        prDesconto: Number(cp.pr_desconto ?? 0),
        prAcrescimo: Number(cp.pr_acrescimo ?? 0),
      };
    }
  }

  // CondicaoPagtoPreco quando ausente
  if (
    !contexto.condicaoPagtoPreco &&
    contexto.cdCondicaoPagto &&
    contexto.cdCondicaoPreco
  ) {
    const c = await findCondicaoPagtoPreco(
      contexto.cdCondicaoPagto,
      contexto.cdCondicaoPreco,
      holdingId,
    );
    if (c) {
      contexto.condicaoPagtoPreco = {
        cdCondicaoPagto: c.cd_condicao_pagto,
        cdCondicaoPreco: c.cd_tabela_preco_condicao,
        prAcrescimo: Number(c.pr_acrescimo),
        prComissao: Number(c.pr_comissao),
        idEntraPauta: (c.id_entra_pauta ?? 'N') as 'S' | 'N',
        nrOrdemPauta: Number(c.nr_ordem_pauta),
      };
    }
  }

  // Aliquotas (calculadas antes do preço para alimentar v_pr_icms_saida na
  // fórmula dinâmica — replica `f_calculo_custo_parametro` do legado, que
  // recebe pr_icms já resolvido por f_calcula_imposto_busca_aliquota2).
  const aliquotas = calcularAliquotas({
    empresa,
    produto,
    ufEmpresa: contexto.ufEmpresa,
    ufCliente: contexto.ufCliente,
    impostoUf: contexto.impostoUf ?? null,
    prIcmsTabela,
    tpClienteVenda: contexto.cliente?.tpClienteVenda ?? 'C',
  });
  contexto.prIcmsSaida = aliquotas.prIcmsVenda;
  contexto.prPisSaidaFallback = contexto.impostoUf?.prPis ?? null;
  contexto.prCofinsSaidaFallback = contexto.impostoUf?.prCofins ?? null;
  contexto.prIcmsInternoEscolhido = aliquotas.prIcmsInternoEscolhido;
  contexto.fonteIcmsInterno = aliquotas.fonteIcmsInterno;

  // Passo de preço (8 etapas)
  let vlUnitario: number;
  let vlDescontoUnit = 0;
  let trace: Awaited<ReturnType<typeof calcularPrecoUnitario>>['trace'] | null = null;
  if (input.vlUnitarioManual != null && empresa.idBloqueiaAlteracaoPrecoTablet !== 'S') {
    vlUnitario = roundN(safeNumber(input.vlUnitarioManual), empresa.nrCasaDecimalValorVenda);
  } else {
    const pre = await calcularPrecoUnitario({
      contexto,
      precoTabela,
      qt,
      cdProduto: produto.cdProduto,
      holdingId,
    });
    vlUnitario = pre.vlUnitario;
    vlDescontoUnit = pre.vlDescontoUnit;
    trace = pre.trace;
    avisos.push(...pre.avisos);
  }

  // IPI
  const ipi = calcularIpi({ produto, precoTabela, qt, vlUnitario });

  // ST
  const st = calcularSubstituicao({
    empresa,
    produto,
    precoTabela,
    aliquotas,
    qt,
    vlUnitario,
    vlIpi: ipi.vlIpi,
    vlDesconto: vlDescontoUnit * qt,
    vlAcrescimo: 0,
    idStDiferencaIcms: idStDiferenca,
  });

  // Comissão
  const prComissaoFinal = (() => {
    const cpp = contexto.condicaoPagtoPreco;
    if (cpp && cpp.prComissao > 0) return cpp.prComissao;
    return safeNumber(produto.prComissao);
  })();
  const vlComissao = calcularComissao({
    qt,
    vlUnitario,
    vlDesconto: vlDescontoUnit * qt,
    prComissao: prComissaoFinal,
  });

  // Base ICMS aproximada (sem reduções)
  const baseBruta = qt * vlUnitario - vlDescontoUnit * qt;
  const vlBaseIcms = aliquotas.prReducaoIcms > 0
    ? baseBruta - baseBruta * (aliquotas.prReducaoIcms / 100)
    : baseBruta;
  const vlIcms = vlBaseIcms * (aliquotas.prIcmsVenda / 100);

  // Flex: delta gerado pelo desconto/acréscimo no item.
  // Quando idGeraFlex = "N" o item não impacta saldo.
  const vlFlexItem = produto.idGeraFlex === 'N'
    ? 0
    : roundN(0 - vlDescontoUnit * qt, 2);

  return {
    vlUnitario: roundN(vlUnitario, empresa.nrCasaDecimalValorVenda),
    vlIpi: roundN(ipi.vlIpi, 2),
    vlSt: roundN(st.vlSubstituicao, 2),
    vlFlex: vlFlexItem,
    vlDesconto: roundN(vlDescontoUnit * qt, 2),
    vlComissao: roundN(vlComissao, 2),
    prIcmsAplicado: aliquotas.prIcmsVenda,
    vlBaseIcms: roundN(vlBaseIcms, 2),
    vlIcms: roundN(vlIcms, 2),
    prComissao: prComissaoFinal,
    avisos,
    trace,
  };
}

export interface PedidoCalculadoEngine {
  itens: Array<{ item: ItemPedidoEngine; resultado: ResultadoCalculoItem }>;
  totais: ReturnType<typeof calculaTotaisPedido>;
}

export async function calcularPedido(
  itens: ItemPedidoEngine[],
  contexto: ContextoCalculoItem,
  holdingId: number,
): Promise<PedidoCalculadoEngine> {
  const out: PedidoCalculadoEngine['itens'] = [];
  for (const it of itens) {
    const resultado = await calcularItem({
      produto: it.produto,
      qt: it.qt,
      contexto,
      vlUnitarioManual: it.vlUnitarioManual,
      precoTabela: it.precoTabela,
      holdingId,
    });
    out.push({ item: it, resultado });
  }
  const totaisInput: TotalItemEngine[] = out.map(({ item, resultado }) => ({
    qt: item.qt,
    vlUnitario: resultado.vlUnitario,
    vlIpi: resultado.vlIpi,
    vlSt: resultado.vlSt,
    vlDesconto: resultado.vlDesconto,
    vlAcrescimo: 0,
    vlFlex: resultado.vlFlex,
  }));
  const totais = calculaTotaisPedido(totaisInput, contexto.empresa);
  return { itens: out, totais };
}

export * from './types';
export { resolverTabelaPreco } from './tabelaPrecoResolver';
export { validacaoFlex } from './flex';
export { validacaoVariacaoPreco } from './variacaoPreco';
export { roundN, safeNumber } from './casasDecimais';
export {
  listarCondicoesPrecoProduto,
  type CondicaoPrecoOpt,
} from './condicoesPrecoProduto';
export type { PrecoTrace } from './precoUnitario';
