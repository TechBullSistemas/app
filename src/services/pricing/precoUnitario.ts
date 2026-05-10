import type { ContextoCalculoItem, TabelaPrecoItemEngine } from './types';
import { roundN, safeNumber } from './casasDecimais';
import { findDescontoFaixa } from '@/db/repositories/produtoDesconto';
import { avaliarFormula } from './formula';

/**
 * Pipeline de 8 passos do legado (`Produto_Valores_find` + auxiliares):
 *   1) Base: promoção válida vs vlVenda
 *   2) Crédito ST embutido (vl_credito_substituicao)
 *   3) Acréscimo da CondicaoPreco (idTipoAcrescimo V/N)
 *   4) Desconto da CondicaoPagto (gates por promoção/condicao)
 *   5) Desconto por faixa de quantidade (produto_desconto)
 *   6) Arredondamento (nrCasaDecimalValorVenda)
 *   7) Caso especial idUltimaVenda (curto-circuito)
 *   8) Fórmula dinâmica (avalia expressão whitelist sobre v_* variables)
 */
export interface PrecoUnitarioInput {
  contexto: ContextoCalculoItem;
  precoTabela: TabelaPrecoItemEngine | null;
  qt: number;
  cdProduto: number;
  holdingId: number;
}

export interface PrecoUnitarioResult {
  vlBase: number;
  vlUnitario: number;
  vlDescontoUnit: number;
  prDescontoFaixa: number;
  origem:
    | 'tabela'
    | 'promocao'
    | 'ultima-venda'
    | 'formula'
    | 'manual';
  avisos: string[];
  trace: PrecoTrace;
}

/**
 * Detalhamento passo a passo do cálculo do preço unitário. Usado pela UI
 * "Detalhes do preço" para o vendedor entender exatamente de onde cada
 * componente saiu (e diagnosticar valores que parecerem estranhos).
 */
export interface PrecoTrace {
  cdTabelaPreco: number | null;
  vlVendaTabela: number;
  vlPromocaoTabela: number;
  promocaoValida: boolean;
  vlBase: number;
  origem: PrecoUnitarioResult['origem'];
  cdCondicaoPreco: number | null;
  prAcrescimoCondicao: number;
  vlAposAcrescimoCondicao: number;
  cdCondicaoPagto: number | null;
  // Desconto aplicado pela CondicaoPagto (legado: subtrai do preço).
  prDescontoCondicaoPagto: number;
  // Acréscimo aplicado pela CondicaoPagtoPreco quando ligação está ativa.
  prAcrescimoCondicaoPagto: number;
  vlAposAcrescimoCondicaoPagto: number;
  prDescontoFaixa: number;
  vlDescontoFaixa: number;
  vlAposDescontoFaixa: number;
  formulaAplicada: boolean;
  vlAposFormula: number | null;
  // Diagnóstico da fórmula dinâmica (quando a empresa tem
  // `dsFuncaoCalculoPrecoVenda` definida). `formulaExpr` é a expressão
  // original; `formulaVars` é o conjunto de variáveis (v_*) que foi passado
  // ao avaliador, permitindo ao vendedor entender de onde cada termo veio.
  formulaExpr: string | null;
  formulaVars: Record<string, number> | null;
  formulaErro?: string | null;
  // Gate da fórmula (legado): mostra qual condição falhou, quando aplicável.
  // Permite ao vendedor entender por que a fórmula não rodou — ex.: a
  // condição de preço selecionada é tipo 'V' (acréscimo direto, sem fórmula).
  formulaGateMotivo?: string | null;
  decimais: number;
  vlUnitarioFinal: number;
  // Diagnóstico das alíquotas de saída usadas na fórmula. Cada `*Origem`
  // indica de onde o valor veio: 'tabela_preco_item' (override por
  // produto/preço), 'imposto_uf' (cadastro estadual), 'aliquotas' (porta de
  // f_calcula_imposto_busca_aliquota2) ou 'zero' (não havia dado).
  prPisSaida?: number;
  prPisSaidaOrigem?: 'tabela_preco_item' | 'imposto_uf' | 'zero';
  prCofinsSaida?: number;
  prCofinsSaidaOrigem?: 'tabela_preco_item' | 'imposto_uf' | 'zero';
  prIcmsSaida?: number;
  prIcmsSaidaOrigem?: 'aliquotas' | 'zero';
  // Snapshot dos lookups consultados pelo orquestrador antes da fórmula —
  // permite ao vendedor ver se a UF do destino achou imposto_uf, se a
  // tabela_icms tem entrada para a rota etc.
  ufEmpresa?: string | null;
  ufCliente?: string | null;
  impostoUfEncontrado?: boolean;
  prIcmsTabelaIcms?: number | null;
  // Diagnóstico de seleção de ICMS interno por tipo de cliente (C/I/R).
  // `prIcmsInternoConsumo` é o valor padrão (`prIcmsInterno`),
  // `prIcmsInternoRevenda` e `prIcmsInternoIndustria` são os valores cadastrados,
  // `prIcmsInternoEscolhido` é o valor de fato usado pelo motor (com fallback).
  tpClienteVenda?: string | null;
  prIcmsInternoConsumo?: number | null;
  prIcmsInternoRevenda?: number | null;
  prIcmsInternoIndustria?: number | null;
  prIcmsInternoEscolhido?: number | null;
  fonteIcmsInterno?: 'C' | 'R' | 'I' | null;
}

function isPromocaoValida(p: TabelaPrecoItemEngine | null, hoje: Date): boolean {
  if (!p) return false;
  const ini = p.dtPromocaoInicio ? new Date(p.dtPromocaoInicio) : null;
  const fim = p.dtPromocaoFim ? new Date(p.dtPromocaoFim) : null;
  const vl = safeNumber(p.vlPromocao);
  if (vl <= 0) return false;
  if (ini && hoje < ini) return false;
  if (fim && hoje > fim) return false;
  return true;
}

export async function calcularPrecoUnitario(
  input: PrecoUnitarioInput,
): Promise<PrecoUnitarioResult> {
  const { contexto, precoTabela, qt, cdProduto, holdingId } = input;
  const empresa = contexto.empresa;
  const decimais = empresa.nrCasaDecimalValorVenda;
  const hoje = contexto.hoje ?? new Date();
  const avisos: string[] = [];

  // Passo 7 — short-circuit: condição de preço marcada como "última venda".
  const cp = contexto.condicaoPreco;
  if (cp?.idUltimaVenda && safeNumber(cp.vlValor) > 0) {
    const v = roundN(safeNumber(cp.vlValor), decimais);
    return {
      vlBase: v,
      vlUnitario: v,
      vlDescontoUnit: 0,
      prDescontoFaixa: 0,
      origem: 'ultima-venda',
      avisos,
      trace: {
        cdTabelaPreco: contexto.cdTabelaPreco ?? null,
        vlVendaTabela: safeNumber(precoTabela?.vlVenda),
        vlPromocaoTabela: safeNumber(precoTabela?.vlPromocao),
        promocaoValida: false,
        vlBase: v,
        origem: 'ultima-venda',
        cdCondicaoPreco: cp.cdCondicaoPreco,
        prAcrescimoCondicao: 0,
        vlAposAcrescimoCondicao: v,
        cdCondicaoPagto: contexto.cdCondicaoPagto ?? null,
        prDescontoCondicaoPagto: 0,
        prAcrescimoCondicaoPagto: 0,
        vlAposAcrescimoCondicaoPagto: v,
        prDescontoFaixa: 0,
        vlDescontoFaixa: 0,
        vlAposDescontoFaixa: v,
        formulaAplicada: false,
        vlAposFormula: null,
        formulaExpr: empresa.dsFuncaoCalculoPrecoVenda ?? null,
        formulaVars: null,
        formulaErro: null,
        formulaGateMotivo: 'Última venda — preço fixo da condição.',
        decimais,
        vlUnitarioFinal: v,
        prPisSaida: 0,
        prPisSaidaOrigem: 'zero',
        prCofinsSaida: 0,
        prCofinsSaidaOrigem: 'zero',
        prIcmsSaida: safeNumber(contexto.prIcmsSaida),
        prIcmsSaidaOrigem:
          safeNumber(contexto.prIcmsSaida) > 0 ? 'aliquotas' : 'zero',
        ufEmpresa: contexto.ufEmpresa ?? null,
        ufCliente: contexto.ufCliente ?? null,
        impostoUfEncontrado: !!contexto.impostoUf,
        prIcmsTabelaIcms: contexto.prIcmsTabela ?? null,
        tpClienteVenda: contexto.cliente?.tpClienteVenda ?? null,
        prIcmsInternoConsumo: contexto.impostoUf?.prIcmsInterno ?? null,
        prIcmsInternoRevenda: contexto.impostoUf?.prIcmsInternoRevenda ?? null,
        prIcmsInternoIndustria:
          contexto.impostoUf?.prIcmsInternoIndustria ?? null,
        prIcmsInternoEscolhido: contexto.prIcmsInternoEscolhido ?? null,
        fonteIcmsInterno: contexto.fonteIcmsInterno ?? null,
      },
    };
  }

  // Passo 1 — Base: vl_promocao quando a CondicaoPreco é promoção
  // (id_promocao='S') E a empresa habilita promo por tabela E há janela
  // vigente. Caso contrário, vlVenda. Replica o `case when` do
  // `Produto_Valores_find` no legado.
  let vlBase = 0;
  let origem: PrecoUnitarioResult['origem'] = 'tabela';
  const condIsPromocao = !!cp?.idPromocao;
  const promocaoValida =
    condIsPromocao &&
    empresa.idUtilizaPromocaoPorTabelaPreco === 'S' &&
    isPromocaoValida(precoTabela, hoje);
  if (promocaoValida) {
    vlBase = safeNumber(precoTabela!.vlPromocao);
    origem = 'promocao';
  } else if (precoTabela) {
    vlBase = safeNumber(precoTabela.vlVenda);
  }
  const vlBaseInicial = vlBase;

  // Passo 2 — Crédito ST embutido. No legado o select já devolve vl_preco
  // - vl_credito_substituicao quando a empresa tem regime que utiliza essa
  // dedução. Mantemos pendente até trazer `produto.vlCreditoSubstituicao`
  // via contexto (não impacta o fluxo atual: a maior parte dos clientes
  // não tem esse regime ativo).

  // Passo 3 — Acréscimo da CondicaoPreco.
  //
  // Semântica do `id_tipo_acrescimo` (independente da fórmula dinâmica):
  //   'V' — pr_acrescimo é ACRÉSCIMO em valor: vl = vl + vl × pr_acrescimo/100.
  //   'M' — pr_acrescimo é a MARGEM de lucro da condição; é aplicada via
  //         `v_pr_margem_lucro` quando a fórmula roda (não soma direto aqui).
  //   'N' — não aplica nada.
  //
  // A fórmula dinâmica (passo 8) roda independentemente do tipo (gate é só
  // `id_custo_agregado='F'`). Quando ela roda em modo 'M' SOBRESCREVE o
  // resultado, então o acréscimo direto seria descartado mesmo se aplicado;
  // por isso só aplicamos em 'V' aqui.
  let prAcrescimoCondicaoAplicado = 0;
  if (cp && cp.prAcrescimo > 0 && cp.idTipoAcrescimo === 'V') {
    prAcrescimoCondicaoAplicado = cp.prAcrescimo;
    vlBase = vlBase + vlBase * (cp.prAcrescimo / 100);
  }
  const vlAposAcrescimoCondicao = vlBase;

  // Passo 4 — Desconto da CondicaoPagto. Legado:
  //   if (cliente_condicao_pagto.pr_desconto > 0)
  //     if (id_utiliza_desconto_promocao_pedido_venda='S' || !cp.id_promocao)
  //        vl = vl - vl * (pr_desconto / 100)
  //
  // OBS: `condicao_pagto_preco.pr_acrescimo` (tabela CondicaoPagtoPreco)
  // só é usado quando `idUtilizaCondicaoPagtoLigacaoCondicaoPreco='S'`, e
  // mesmo assim no legado é via `Condicao_Pagto_Preco_Produto_Valores_find`
  // (que retorna o preço diretamente). Mantemos esse caminho como acréscimo
  // adicional para não quebrar configurações que já dependiam dele.
  const cPagto = contexto.condicaoPagto;
  let prDescontoCondicaoPagto = 0;
  if (
    cPagto &&
    safeNumber(cPagto.prDesconto) > 0 &&
    (empresa.idUtilizaDescontoPromocaoPedidoVenda === 'S' || !condIsPromocao)
  ) {
    prDescontoCondicaoPagto = safeNumber(cPagto.prDesconto);
    vlBase = vlBase - vlBase * (prDescontoCondicaoPagto / 100);
  }
  const cpp = contexto.condicaoPagtoPreco;
  let prAcrescimoCondicaoPagtoAplicado = 0;
  if (
    cpp &&
    empresa.idUtilizaCondicaoPagtoLigacaoCondicaoPreco === 'S' &&
    safeNumber(cpp.prAcrescimo) > 0
  ) {
    prAcrescimoCondicaoPagtoAplicado = safeNumber(cpp.prAcrescimo);
    vlBase = vlBase + vlBase * (prAcrescimoCondicaoPagtoAplicado / 100);
  }
  const vlAposAcrescimoCondicaoPagto = vlBase;

  // Passo 5 — Desconto por faixa de quantidade
  let prDescontoFaixa = 0;
  let vlDescontoUnit = 0;
  try {
    const faixa = await findDescontoFaixa(cdProduto, qt, holdingId);
    if (faixa) {
      prDescontoFaixa = safeNumber(faixa.pr_desconto);
      vlDescontoUnit = vlBase * (prDescontoFaixa / 100);
    }
  } catch {
    // Sem dados / tabela ainda não criada → ignora.
  }

  let vlUnitario = vlBase - vlDescontoUnit;
  const vlAposDescontoFaixa = vlUnitario;
  let vlAposFormula: number | null = null;
  let formulaAplicada = false;
  let formulaVarsTrace: Record<string, number> | null = null;
  let formulaErro: string | null = null;

  // Resolve PIS/COFINS/ICMS de saída ANTES da fórmula (e fora do `if (formula)`)
  // para que o trace reflita o que o motor usaria, mesmo sem fórmula.
  let prPisSaidaTrace = 0;
  let prPisSaidaOrigem: PrecoTrace['prPisSaidaOrigem'] = 'zero';
  if (safeNumber(precoTabela?.prPisSaida) > 0) {
    prPisSaidaTrace = safeNumber(precoTabela?.prPisSaida);
    prPisSaidaOrigem = 'tabela_preco_item';
  } else if (safeNumber(contexto.prPisSaidaFallback) > 0) {
    prPisSaidaTrace = safeNumber(contexto.prPisSaidaFallback);
    prPisSaidaOrigem = 'imposto_uf';
  }

  let prCofinsSaidaTrace = 0;
  let prCofinsSaidaOrigem: PrecoTrace['prCofinsSaidaOrigem'] = 'zero';
  if (safeNumber(precoTabela?.prCofinsSaida) > 0) {
    prCofinsSaidaTrace = safeNumber(precoTabela?.prCofinsSaida);
    prCofinsSaidaOrigem = 'tabela_preco_item';
  } else if (safeNumber(contexto.prCofinsSaidaFallback) > 0) {
    prCofinsSaidaTrace = safeNumber(contexto.prCofinsSaidaFallback);
    prCofinsSaidaOrigem = 'imposto_uf';
  }

  const prIcmsSaidaTrace = safeNumber(contexto.prIcmsSaida);
  const prIcmsSaidaOrigem: PrecoTrace['prIcmsSaidaOrigem'] =
    prIcmsSaidaTrace > 0 ? 'aliquotas' : 'zero';

  // Passo 8 — Fórmula dinâmica.
  //
  // Gate (esclarecido pelo usuário): a fórmula roda sempre que
  //   empresa.id_custo_agregado = 'F' e há `ds_funcao_calculo_preco_venda`.
  //
  // O `condicao_preco.id_tipo_acrescimo` NÃO gateia a fórmula — ele só decide
  // a fonte da margem usada como input:
  //   - 'M' → `v_pr_margem_lucro = condicao_preco.pr_acrescimo` (substitui a
  //            margem da tabela; reproduz `f_calcula_margem_lucro_item(...,
  //            c_p.getPr_acrescimo(), "V", ...)` do legado). Produz preços
  //            diferentes para TAB. A/B/C/D conforme cada condição.
  //   - 'V'/'N'/sem condição → `v_pr_margem_lucro = tabela_preco_item.pr_margem_lucro`
  //            (margem cadastrada no preço×tabela). O acréscimo direto do tipo
  //            'V' já foi aplicado no Passo 3.
  const formulaGateAtende =
    !!empresa.dsFuncaoCalculoPrecoVenda && empresa.idCustoAgregado === 'F';
  let formulaGateMotivo: string | null = null;
  if (!empresa.dsFuncaoCalculoPrecoVenda) {
    formulaGateMotivo = 'Empresa sem `ds_funcao_calculo_preco_venda` cadastrado.';
  } else if (empresa.idCustoAgregado !== 'F') {
    formulaGateMotivo = `idCustoAgregado='${empresa.idCustoAgregado}' (precisa ser 'F').`;
  }
  if (formulaGateAtende) {
    // Em modo 'M' a margem da condição substitui a da tabela; nos demais
    // modos (V/N/sem condição) usa a margem cadastrada no `tabela_preco_item`.
    const margemFonte: 'condicao' | 'tabela' =
      cp?.idTipoAcrescimo === 'M' && safeNumber(cp?.prAcrescimo) !== 0
        ? 'condicao'
        : 'tabela';
    const vMargemLucro =
      margemFonte === 'condicao'
        ? safeNumber(cp?.prAcrescimo)
        : safeNumber(precoTabela?.prMargemLucro);
    const ctx = {
      v_vl_venda: safeNumber(precoTabela?.vlVenda),
      v_vl_promocao: safeNumber(precoTabela?.vlPromocao),
      v_vl_custo: safeNumber(precoTabela?.vlCusto),
      v_pr_ipi: safeNumber(precoTabela?.prIpi),
      // Mantido por compatibilidade — `v_pr_icms` apontava para a margem
      // mínima da empresa; `v_pr_icms_saida` é a alíquota real de ICMS.
      v_pr_icms: safeNumber(empresa.prMargemLucroMinimo),
      // PIS/COFINS de saída: prefere `tabela_preco_item` (override por
      // preço×produto), cai para `imposto_uf` da UF da empresa — replica o
      // `select imposto_uf.pr_pis/pr_cofins` do legado em `f_calculo_custo`.
      // ICMS de saída: alíquota já resolvida por `calcularAliquotas`.
      v_pr_pis_saida: prPisSaidaTrace,
      v_pr_cofins_saida: prCofinsSaidaTrace,
      v_pr_icms_saida: prIcmsSaidaTrace,
      v_pr_acrescimo_condicao: safeNumber(cp?.prAcrescimo),
      v_pr_desconto_faixa: prDescontoFaixa,
      v_qt: qt,
      v_pr_margem_lucro: vMargemLucro,
      v_pr_margem_extra: safeNumber(precoTabela?.prMargemExtra),
      v_id_custo_agregado: empresa.idCustoAgregado === 'F' ? 1 : 0,
      v_vl_atacado: safeNumber(precoTabela?.vlVendaAtacado),
      v_vl_custo_substituicao: safeNumber(precoTabela?.vlCustoSubstituicao),
      v_vl_icms_substituicao: safeNumber(precoTabela?.vlIcmsSubstituicao),
      v_vl_custo_importacao: safeNumber(precoTabela?.vlCustoImportacao),
      v_vl_contabil: safeNumber(precoTabela?.vlCustoContabil),
      v_vl_custo_contabil: safeNumber(precoTabela?.vlCustoContabil),
      v_vl_aquisicao: safeNumber(precoTabela?.vlAquisicao),
      v_vl_bonificacao: safeNumber(precoTabela?.vlBonificacao),
      v_vl_custo_contabil_nf: safeNumber(precoTabela?.vlCustoContabilNf),
      v_vl_custo_contabil_medio: safeNumber(precoTabela?.vlCustoContabilMedio),
      ...(contexto.custoVariaveis ?? {}),
    };
    formulaVarsTrace = { ...ctx };
    const out = avaliarFormula(empresa.dsFuncaoCalculoPrecoVenda, ctx);
    if (out != null && out > 0) {
      vlUnitario = out;
      origem = 'formula';
      vlAposFormula = out;
      formulaAplicada = true;
    } else if (empresa.dsFuncaoCalculoPrecoVenda) {
      formulaErro = 'Fórmula retornou valor inválido (≤ 0 ou não numérico).';
      avisos.push('Fórmula de preço inválida — usando preço padrão.');
    }
  }

  // Passo 6 — Arredondamento
  vlUnitario = roundN(vlUnitario, decimais);
  vlBase = roundN(vlBase, decimais);
  vlDescontoUnit = roundN(vlDescontoUnit, decimais);

  return {
    vlBase,
    vlUnitario,
    vlDescontoUnit,
    prDescontoFaixa,
    origem,
    avisos,
    trace: {
      cdTabelaPreco: contexto.cdTabelaPreco ?? null,
      vlVendaTabela: safeNumber(precoTabela?.vlVenda),
      vlPromocaoTabela: safeNumber(precoTabela?.vlPromocao),
      promocaoValida,
      vlBase: vlBaseInicial,
      origem,
      cdCondicaoPreco: cp?.cdCondicaoPreco ?? null,
      prAcrescimoCondicao: prAcrescimoCondicaoAplicado,
      vlAposAcrescimoCondicao,
      cdCondicaoPagto: contexto.cdCondicaoPagto ?? null,
      prDescontoCondicaoPagto,
      prAcrescimoCondicaoPagto: prAcrescimoCondicaoPagtoAplicado,
      vlAposAcrescimoCondicaoPagto,
      prDescontoFaixa,
      vlDescontoFaixa: vlDescontoUnit,
      vlAposDescontoFaixa,
      formulaAplicada,
      vlAposFormula,
      formulaExpr: empresa.dsFuncaoCalculoPrecoVenda ?? null,
      formulaVars: formulaVarsTrace,
      formulaErro,
      formulaGateMotivo,
      decimais,
      vlUnitarioFinal: vlUnitario,
      prPisSaida: prPisSaidaTrace,
      prPisSaidaOrigem,
      prCofinsSaida: prCofinsSaidaTrace,
      prCofinsSaidaOrigem,
      prIcmsSaida: prIcmsSaidaTrace,
      prIcmsSaidaOrigem,
      ufEmpresa: contexto.ufEmpresa ?? null,
      ufCliente: contexto.ufCliente ?? null,
      impostoUfEncontrado: !!contexto.impostoUf,
      prIcmsTabelaIcms: contexto.prIcmsTabela ?? null,
      tpClienteVenda: contexto.cliente?.tpClienteVenda ?? null,
      prIcmsInternoConsumo: contexto.impostoUf?.prIcmsInterno ?? null,
      prIcmsInternoRevenda: contexto.impostoUf?.prIcmsInternoRevenda ?? null,
      prIcmsInternoIndustria:
        contexto.impostoUf?.prIcmsInternoIndustria ?? null,
      prIcmsInternoEscolhido: contexto.prIcmsInternoEscolhido ?? null,
      fonteIcmsInterno: contexto.fonteIcmsInterno ?? null,
    },
  };
}
