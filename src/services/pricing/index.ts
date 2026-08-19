// Fachada do motor de precificação. Orquestra os módulos individuais e expõe
// `calcularItem` (item único) e `calcularPedido` (lista de itens).
//
// Importante: este motor NUNCA é a fonte da verdade fiscal — o ERP recalcula
// IPI/ICMS/ST no faturamento da NF. O propósito é dar ao vendedor uma
// estimativa instantânea offline, equivalente ao que o app legado entregava.

import type {
  ContextoCalculoItem,
  ImpostoUfEngine,
  ItemPedidoEngine,
  ProdutoEngine,
  ResultadoCalculoItem,
  TabelaPrecoItemEngine,
  TabelaPrecoPromocaoEngine,
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
import {
  findCondicaoPreco,
  isCondicaoPrecoPromocao,
} from '@/db/repositories/condicaoPreco';
import { findCondicaoPagto } from '@/db/repositories/condicaoPagto';
import { findTabelaPrecoItem } from '@/db/repositories/tabelaPrecoItem';
import { findTabelaPrecoPromocao } from '@/db/repositories/tabelaPrecoPromocao';
import { listCustoVariavel } from '@/db/repositories/parametros';
import { getUltimaVendaProdutoCliente } from '@/db/repositories/notas';
import { findProdutoSeguranca } from '@/db/repositories/produtoSeguranca';

function mapImpostoUfRow(r: any): ImpostoUfEngine {
  return {
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
      contexto.impostoUf = mapImpostoUfRow(r);
    }
  }

  // Modo 'M' (id_forma_preco_venda_produto): PIS/COFINS e a regra de ICMS da
  // operação leem o imposto_uf da UF da EMPRESA ("dentro do estado" =
  // operação interna da empresa). Reaproveita o registro já carregado quando
  // as UFs coincidem.
  if (
    !contexto.impostoUfEmpresa &&
    empresa.idFormaPrecoVendaProduto === 'M' &&
    produto.cdImposto &&
    contexto.ufEmpresa
  ) {
    if (contexto.impostoUf?.cdEstado === contexto.ufEmpresa) {
      contexto.impostoUfEmpresa = contexto.impostoUf;
    } else {
      const r = await findImpostoUf(
        produto.cdImposto,
        contexto.ufEmpresa,
        holdingId,
      );
      if (r) {
        contexto.impostoUfEmpresa = mapImpostoUfRow(r);
      }
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
        idPromocao: isCondicaoPrecoPromocao(c.id_promocao),
        prAcrescimo: Number(c.pr_acrescimo ?? 0),
        prAcrescimoComissao: Number(c.pr_acrescimo_comissao ?? 0),
        idTipoAcrescimo: (c.id_tipo_acrescimo ?? 'V') as 'V' | 'N' | 'M',
        idUltimaVenda: (c.id_ultima_venda ?? 0) > 0,
        vlValor: Number(c.vl_valor ?? 0),
      };
    }
  }

  // Condições marcadas como promoção consultam a tabela própria do DUAPI.
  // A query prioriza a promoção do representante e cai para a geral. Quando
  // não há uma linha vigente para produto + tabela, o pipeline legado segue
  // inalterado (inclusive o fallback de promoção do tabela_preco_item).
  let promocaoTabela: TabelaPrecoPromocaoEngine | null = null;
  if (contexto.condicaoPreco?.idPromocao && contexto.cdTabelaPreco) {
    try {
      const promocao = await findTabelaPrecoPromocao({
        cdEmpresa: empresa.cdEmpresa,
        cdProduto: produto.cdProduto,
        cdTabelaPreco: contexto.cdTabelaPreco,
        cdRepresentante: contexto.representante?.cdRepresentante,
        holdingId,
        hoje: contexto.hoje,
      });
      if (promocao) {
        promocaoTabela = {
          vlPromocao: Number(promocao.vl_promocao),
          prComissao: Number(promocao.pr_comissao),
          cdRepresentante: promocao.cd_representante,
          nrItem: promocao.nr_item,
          dtInicio: promocao.dt_inicio,
          dtFim: promocao.dt_fim,
        };
      }
    } catch {
      // Banco de uma versão anterior ou sync ainda incompleto: mantém o preço
      // que o app já calculava antes desta tabela existir.
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

  // Custos variáveis da fórmula (produto_custo_variavel): cada linha vira uma
  // variável de contexto com o nome cadastrado em `nm_variavel` (ex.:
  // `custo_fixo`, `comissao`) e o percentual em `pr_variavel`. No legado esses
  // nomes eram interpolados na SQL dinâmica da empresa; aqui entram no spread
  // do contexto da fórmula. Carrega uma única vez por contexto (reutilizado em
  // `calcularPedido`), mesmo quando não há linhas ({} evita novo SELECT).
  if (
    !contexto.custoVariaveis &&
    empresa.idFormaPrecoVendaProduto === 'M' &&
    empresa.dsFuncaoCalculoPrecoVenda
  ) {
    const vars: Record<string, number> = {};
    try {
      const rows = await listCustoVariavel(empresa.cdEmpresa, holdingId);
      for (const r of rows) {
        vars[r.nm_variavel] = safeNumber(r.pr_variavel);
      }
    } catch {
      // Tabela ainda não sincronizada → fórmula segue com variáveis em zero.
    }
    contexto.custoVariaveis = vars;
  }

  // Margem de segurança é específica por empresa×produto. No cadastro de
  // variáveis da fórmula ela aparece como placeholder zerado; o DUAPI resolve
  // o percentual real na tabela produto_seguranca.
  contexto.prMargemSeguranca = 0;
  if (
    empresa.idFormaPrecoVendaProduto === 'M' &&
    empresa.dsFuncaoCalculoPrecoVenda
  ) {
    try {
      const seguranca = await findProdutoSeguranca(
        empresa.cdEmpresa,
        produto.cdProduto,
        holdingId,
      );
      contexto.prMargemSeguranca = Number(
        seguranca?.pr_margem_seguranca ?? 0,
      );
    } catch {
      // Tabela ainda não sincronizada → mantém o comportamento anterior.
    }
  }

  // Forma de preço 'V' (id_forma_preco_venda_produto): último unitário
  // praticado do produto para o cliente, extraído das notas locais. Resolvido
  // a cada item (sem guard de cache — o contexto é compartilhado entre itens
  // do pedido e o valor é por produto). Null = primeira venda → o pipeline
  // segue com o preço da tabela.
  if (empresa.idFormaPrecoVendaProduto === 'V') {
    contexto.vlUltimaVendaProduto = null;
    const cdCliente = contexto.cliente?.cdCliente;
    if (cdCliente) {
      try {
        contexto.vlUltimaVendaProduto = await getUltimaVendaProdutoCliente(
          cdCliente,
          holdingId,
          produto.cdProduto,
        );
      } catch {
        // Notas ainda não sincronizadas → trata como primeira venda.
      }
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
    impostoUfEmpresa: contexto.impostoUfEmpresa ?? null,
    prIcmsTabela,
    tpClienteVenda: contexto.cliente?.tpClienteVenda ?? 'C',
  });
  contexto.prIcmsSaida = aliquotas.prIcmsVenda;
  // Modo 'M': PIS/COFINS vêm do imposto_uf da UF da empresa (fallback para o
  // registro da UF do cliente quando a empresa não tem linha cadastrada).
  const impostoUfPisCofins = empresa.idFormaPrecoVendaProduto === 'M'
    ? contexto.impostoUfEmpresa ?? contexto.impostoUf
    : contexto.impostoUf;
  contexto.prPisSaidaFallback = impostoUfPisCofins?.prPis ?? null;
  contexto.prCofinsSaidaFallback = impostoUfPisCofins?.prCofins ?? null;
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
      promocaoTabela,
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
