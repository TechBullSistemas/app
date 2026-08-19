import type {
  ContextoCalculoItem,
  TabelaPrecoItemEngine,
  TabelaPrecoPromocaoEngine,
} from './types';
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
  promocaoTabela?: TabelaPrecoPromocaoEngine | null;
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
  promocaoOrigem?:
    | 'representante'
    | 'geral'
    | 'tabela_preco_item'
    | null;
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

function dateKey(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function isPromocaoValida(p: TabelaPrecoItemEngine | null, hoje: Date): boolean {
  if (!p) return false;
  const atual = dateKey(hoje);
  const ini = p.dtPromocaoInicio ? dateKey(p.dtPromocaoInicio) : null;
  const fim = p.dtPromocaoFim ? dateKey(p.dtPromocaoFim) : null;
  const vl = safeNumber(p.vlPromocao);
  if (vl <= 0) return false;
  if (ini && atual < ini) return false;
  if (fim && atual > fim) return false;
  return true;
}

function isPromocaoTabelaValida(
  p: TabelaPrecoPromocaoEngine | null | undefined,
  hoje: Date,
): boolean {
  if (!p || safeNumber(p.vlPromocao) <= 0) return false;
  const atual = dateKey(hoje);
  const ini = dateKey(p.dtInicio);
  const fim = p.dtFim ? dateKey(p.dtFim) : null;
  if (atual < ini) return false;
  if (fim && atual > fim) return false;
  return true;
}

export async function calcularPrecoUnitario(
  input: PrecoUnitarioInput,
): Promise<PrecoUnitarioResult> {
  const {
    contexto,
    precoTabela,
    promocaoTabela,
    qt,
    cdProduto,
    holdingId,
  } = input;
  const empresa = contexto.empresa;
  const decimais = empresa.nrCasaDecimalValorVenda;
  const hoje = contexto.hoje ?? new Date();
  const avisos: string[] = [];

  // Registro de imposto_uf usado no diagnóstico das alíquotas internas do
  // trace. No modo 'M' o motor decide o ICMS pelo registro da UF da EMPRESA;
  // nas demais formas, pelo da UF do cliente.
  const impostoUfDiag =
    empresa.idFormaPrecoVendaProduto === 'M'
      ? contexto.impostoUfEmpresa ?? contexto.impostoUf
      : contexto.impostoUf;

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
        prIcmsInternoConsumo: impostoUfDiag?.prIcmsInterno ?? null,
        prIcmsInternoRevenda: impostoUfDiag?.prIcmsInternoRevenda ?? null,
        prIcmsInternoIndustria: impostoUfDiag?.prIcmsInternoIndustria ?? null,
        prIcmsInternoEscolhido: contexto.prIcmsInternoEscolhido ?? null,
        fonteIcmsInterno: contexto.fonteIcmsInterno ?? null,
      },
    };
  }

  // Forma de preço 'V' (empresa.id_forma_preco_venda_produto): usa o último
  // unitário praticado do produto para o cliente (resolvido pelo orquestrador
  // em `contexto.vlUltimaVendaProduto`). Sem venda anterior (null/0), segue o
  // pipeline normal da tabela de preço.
  const vlUltimaVendaProduto = safeNumber(contexto.vlUltimaVendaProduto);
  if (empresa.idFormaPrecoVendaProduto === 'V' && vlUltimaVendaProduto > 0) {
    const v = roundN(vlUltimaVendaProduto, decimais);
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
        cdCondicaoPreco: cp?.cdCondicaoPreco ?? null,
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
        formulaGateMotivo:
          "id_forma_preco_venda_produto='V' — última venda do produto para o cliente.",
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
        prIcmsInternoConsumo: impostoUfDiag?.prIcmsInterno ?? null,
        prIcmsInternoRevenda: impostoUfDiag?.prIcmsInternoRevenda ?? null,
        prIcmsInternoIndustria: impostoUfDiag?.prIcmsInternoIndustria ?? null,
        prIcmsInternoEscolhido: contexto.prIcmsInternoEscolhido ?? null,
        fonteIcmsInterno: contexto.fonteIcmsInterno ?? null,
      },
    };
  }

  // Passo 1 — Base: a condição id_promocao consulta primeiro a tabela própria
  // de promoções (representante → geral), já filtrada pelo produto e tabela de
  // preço. Sem correspondência, mantém a regra anterior do tabela_preco_item.
  let vlBase = 0;
  let origem: PrecoUnitarioResult['origem'] = 'tabela';
  const condIsPromocao = !!cp?.idPromocao;
  const promocaoTabelaValida =
    condIsPromocao && isPromocaoTabelaValida(promocaoTabela, hoje);
  const promocaoLegadaValida =
    condIsPromocao &&
    empresa.idUtilizaPromocaoPorTabelaPreco === 'S' &&
    isPromocaoValida(precoTabela, hoje);
  const promocaoValida = promocaoTabelaValida || promocaoLegadaValida;
  const promocaoOrigem: PrecoTrace['promocaoOrigem'] = promocaoTabelaValida
    ? promocaoTabela?.cdRepresentante != null
      ? 'representante'
      : 'geral'
    : promocaoLegadaValida
      ? 'tabela_preco_item'
      : null;
  const vlPromocaoAplicavel = promocaoTabelaValida
    ? safeNumber(promocaoTabela?.vlPromocao)
    : safeNumber(precoTabela?.vlPromocao);
  if (promocaoValida) {
    vlBase = vlPromocaoAplicavel;
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

  const formaPreco = empresa.idFormaPrecoVendaProduto ?? 'T';

  // Resolve PIS/COFINS/ICMS de saída ANTES da fórmula (e fora do `if (formula)`)
  // para que o trace reflita o que o motor usaria, mesmo sem fórmula.
  //
  // Modo 'M': PIS/COFINS vêm SEMPRE do imposto_uf (da UF da empresa, resolvido
  // pelo orquestrador em `prPisSaidaFallback`/`prCofinsSaidaFallback`),
  // ignorando o override por linha do `tabela_preco_item`. Nas demais formas,
  // o override do `tabela_preco_item` tem preferência.
  let prPisSaidaTrace = 0;
  let prPisSaidaOrigem: PrecoTrace['prPisSaidaOrigem'] = 'zero';
  if (formaPreco !== 'M' && safeNumber(precoTabela?.prPisSaida) > 0) {
    prPisSaidaTrace = safeNumber(precoTabela?.prPisSaida);
    prPisSaidaOrigem = 'tabela_preco_item';
  } else if (safeNumber(contexto.prPisSaidaFallback) > 0) {
    prPisSaidaTrace = safeNumber(contexto.prPisSaidaFallback);
    prPisSaidaOrigem = 'imposto_uf';
  }

  let prCofinsSaidaTrace = 0;
  let prCofinsSaidaOrigem: PrecoTrace['prCofinsSaidaOrigem'] = 'zero';
  if (formaPreco !== 'M' && safeNumber(precoTabela?.prCofinsSaida) > 0) {
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
  // Gate: a fórmula roda quando `empresa.id_forma_preco_venda_produto = 'M'`
  // (margem), há `ds_funcao_calculo_preco_venda` cadastrada e o preço não veio
  // de uma promoção válida da `tabela_preco_promocao`. A promoção já traz o
  // valor final de venda e não pode ser substituída pelo cálculo de margem.
  // Nos modos 'T' (tabela de preço) e 'V' (última venda) a fórmula nunca roda.
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
  const formulaBloqueadaPorPromocaoTabela = promocaoTabelaValida;
  const formulaGateAtende =
    formaPreco === 'M' &&
    !!empresa.dsFuncaoCalculoPrecoVenda &&
    !formulaBloqueadaPorPromocaoTabela;
  let formulaGateMotivo: string | null = null;
  if (formulaBloqueadaPorPromocaoTabela) {
    formulaGateMotivo =
      'Preço promocional válido em `tabela_preco_promocao` — fórmula dinâmica não aplicada.';
  } else if (formaPreco === 'T') {
    formulaGateMotivo =
      "id_forma_preco_venda_produto='T' — preço direto da tabela de preço.";
  } else if (formaPreco === 'V') {
    // Chegou aqui sem short-circuit → cliente nunca comprou o produto.
    formulaGateMotivo =
      "id_forma_preco_venda_produto='V' — primeira venda do produto para o cliente, usando tabela de preço.";
  } else if (!empresa.dsFuncaoCalculoPrecoVenda) {
    formulaGateMotivo = 'Empresa sem `ds_funcao_calculo_preco_venda` cadastrado.';
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
      // Custos variáveis do cadastro (produto_custo_variavel) entram PRIMEIRO:
      // eles só alimentam variáveis que o motor não calcula (ex.: custo_fixo,
      // comissao, v_pr_politica_comercial). Há clientes com linhas cadastradas
      // para nomes que o motor calcula (v_vl_contabil, v_pr_margem_lucro...)
      // com pr_variavel = 0 — se o spread viesse por último, esses zeros
      // sobrescreveriam os valores reais e quebrariam a fórmula.
      ...(contexto.custoVariaveis ?? {}),
      // Percentual específico da empresa×produto. Precisa vir depois dos
      // placeholders de produto_custo_variavel para sobrescrever o zero.
      v_pr_margem_seguranca: safeNumber(contexto.prMargemSeguranca),
      v_vl_venda: safeNumber(precoTabela?.vlVenda),
      v_vl_promocao: vlPromocaoAplicavel,
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
      // Acréscimo da CONDIÇÃO DE PAGAMENTO (condicao_pagto.pr_acrescimo).
      // Antes vinha da condição de preço, mas o correto é o acréscimo da
      // condição de pagamento entrar aqui como variável da fórmula — ele não
      // é mais aplicado sobre o total/parcelas do pedido.
      v_pr_acrescimo_condicao: safeNumber(cPagto?.prAcrescimo),
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
      vlPromocaoTabela: vlPromocaoAplicavel,
      promocaoValida,
      promocaoOrigem,
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
      prIcmsInternoConsumo: impostoUfDiag?.prIcmsInterno ?? null,
      prIcmsInternoRevenda: impostoUfDiag?.prIcmsInternoRevenda ?? null,
      prIcmsInternoIndustria: impostoUfDiag?.prIcmsInternoIndustria ?? null,
      prIcmsInternoEscolhido: contexto.prIcmsInternoEscolhido ?? null,
      fonteIcmsInterno: contexto.fonteIcmsInterno ?? null,
    },
  };
}
