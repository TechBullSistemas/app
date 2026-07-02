// Tipos do motor de precificação portado do app legado Duapi.
// Espelha os contratos do legado adaptados ao TypeScript.

import type { EmpresaParametros } from '@/db/repositories/parametros';

export type IndicadorSN = 'S' | 'N';

export interface ProdutoEngine {
  cdProduto: number;
  dsProduto?: string | null;
  cdImposto?: number | null;
  cdSituacaoTributaria?: string | null;
  prIcms?: number; // alíquota base do produto (override)
  prIpi?: number; // override por produto (caso TabelaPrecoItem.prIpi seja zero)
  prMargemSubstituicao?: number;
  prReducaoIcms?: number;
  vlCreditoSubstituicao?: number;
  idGeraFlex?: IndicadorSN;
  idOrigemProduto?: string;
  prComissao?: number;
  vlCusto?: number;
}

export interface TabelaPrecoItemEngine {
  cdTabelaPreco: number;
  cdProduto: number;
  vlVenda: number;
  vlVendaAtacado?: number;
  vlPromocao?: number;
  vlPromocaoAprazo?: number;
  dtPromocaoInicio?: string | null;
  dtPromocaoFim?: string | null;
  vlCusto?: number;
  prIpi?: number; // override por tabela
  prDesconto?: number;
  prSubstituicao?: number;
  prMargemLucro?: number;
  prMargemExtra?: number;
  prAcrescimoFinanceiro?: number;
  // Campos de custo expostos à fórmula dinâmica.
  vlCustoSubstituicao?: number;
  vlIcmsSubstituicao?: number;
  vlCustoImportacao?: number;
  vlCustoContabil?: number;
  vlAquisicao?: number;
  vlBonificacao?: number;
  vlCustoContabilNf?: number;
  vlCustoContabilMedio?: number;
  prPisSaida?: number;
  prCofinsSaida?: number;
}

export interface CondicaoPrecoEngine {
  cdCondicaoPreco: number;
  idPromocao: boolean;
  prAcrescimo: number; // %
  prAcrescimoComissao: number; // %
  // Legado: 'V' = acréscimo em valor (sempre aplicado quando pr_acrescimo>0),
  // 'N' = sem acréscimo, 'M' = margem (gateia a fórmula dinâmica).
  // Note: o pipeline aplica o `pr_acrescimo` da condicao_preco SEMPRE que > 0,
  // independentemente do `id_tipo_acrescimo`. O tipo 'M' só altera o que
  // acontece DEPOIS (formula path em `f_calcula_margem_lucro_item`).
  idTipoAcrescimo: 'V' | 'N' | 'M' | string;
  idUltimaVenda: boolean;
  vlValor: number; // preço da última venda quando idUltimaVenda
}

export interface CondicaoPagtoPrecoEngine {
  cdCondicaoPagto: number;
  cdCondicaoPreco: number;
  prAcrescimo: number; // %
  prComissao: number; // %
  idEntraPauta: 'S' | 'N';
  nrOrdemPauta: number;
}

export interface ImpostoUfEngine {
  cdImposto: number;
  cdEstado: string;
  prIcmsInterno: number;
  // Alíquotas internas por tipo de cliente (porta nova: legado não tinha).
  // Quando zero, o motor cai no `prIcmsInterno` padrão.
  prIcmsInternoRevenda: number;
  prIcmsInternoIndustria: number;
  prIcmsExterno: number;
  prBaseSubstituicaoInterno: number;
  prBaseSubstituicaoExterno: number;
  prReducaoBaseSubstituicaoInterno: number;
  prReducaoBaseSubstituicaoExterno: number;
  prReducaoIcmsInterno: number;
  prReducaoIcmsExterno: number;
  prPis: number;
  prCofins: number;
  prFcp: number;
  prFcpSt: number;
}

export interface RepresentanteEngine {
  cdRepresentante: number;
  vlSaldoFlex: number;
  prFlexMin: number;
  prFlexMax: number;
  idMargem: 'S' | 'N';
  prMargemLucroMinimo: number;
  cdTabelaPreco?: number | null;
}

export interface ClienteEngine {
  cdCliente: number;
  cdEstado?: string | null; // UF do destinatário
  cdTabelaPreco?: number | null;
  // Tipo de cliente para venda: 'C' consumo (default), 'I' indústria, 'R' revenda.
  // Decide qual alíquota interna de ICMS o motor escolhe.
  tpClienteVenda?: 'C' | 'I' | 'R' | string | null;
}

export interface ContextoCalculoItem {
  empresa: EmpresaParametros;
  representante?: RepresentanteEngine | null;
  cliente?: ClienteEngine | null;
  ufEmpresa: string | null;
  ufCliente: string | null;
  cdTabelaPreco: number;
  cdCondicaoPreco?: number | null;
  cdCondicaoPagto?: number | null;
  condicaoPreco?: CondicaoPrecoEngine | null;
  condicaoPagtoPreco?: CondicaoPagtoPrecoEngine | null;
  impostoUf?: ImpostoUfEngine | null;
  prIcmsTabela?: number | null; // de tabela_icms (origem×destino)
  custoVariaveis?: Record<string, number>;
  // Forma de preço 'V': último unitário praticado do produto para o cliente
  // (resolvido pelo orquestrador a cada item; null = primeira venda).
  vlUltimaVendaProduto?: number | null;
  // Dados da CondicaoPagto selecionada no pedido (legado:
  // `cliente_condicao_pagto.getPr_desconto()`). `prDesconto` é subtraído
  // do preço-base após o acréscimo da condição de preço (passo 4 do
  // pipeline em `Produto_Valores_find`).
  condicaoPagto?: {
    prDesconto: number;
    prAcrescimo: number;
  } | null;
  // Alíquotas de saída pré-calculadas (porta `f_calcula_imposto_busca_aliquota2`
  // do legado). Quando presentes, são consumidas pela fórmula dinâmica como
  // `v_pr_icms_saida`. Para PIS/COFINS o preço unitário também aceita os
  // valores cadastrados em `tabela_preco_item` como override por linha.
  prIcmsSaida?: number | null;
  prPisSaidaFallback?: number | null;
  prCofinsSaidaFallback?: number | null;
  // Diagnóstico do ICMS interno escolhido por `pickIcmsInterno` (consumo/
  // revenda/indústria). Usado pelo `PrecoTrace` para o vendedor entender de
  // qual coluna do `imposto_uf` veio a alíquota.
  prIcmsInternoEscolhido?: number | null;
  fonteIcmsInterno?: 'C' | 'R' | 'I' | null;
  hoje?: Date;
}

export interface ResultadoCalculoItem {
  vlUnitario: number;
  vlIpi: number;
  vlSt: number;
  vlFlex: number;
  vlDesconto: number;
  vlComissao: number;
  prIcmsAplicado: number;
  vlBaseIcms: number;
  vlIcms: number;
  prComissao: number;
  avisos: string[];
  // Detalhamento passo a passo do cálculo do preço unitário (usado pela UI
  // "Detalhes do preço"). Null quando o preço veio de override manual ou de
  // um caminho que não passou pelo pipeline (ex.: edição direta do vendedor).
  trace?: import('./precoUnitario').PrecoTrace | null;
}

export interface ItemPedidoEngine {
  produto: ProdutoEngine;
  qt: number;
  vlUnitarioManual?: number; // se editado manualmente
  precoTabela: TabelaPrecoItemEngine | null;
}
