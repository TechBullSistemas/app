import type { EmpresaParametros } from '@/db/repositories/parametros';
import type { ProdutoEngine, TabelaPrecoItemEngine } from './types';
import type { AliquotasResult } from './aliquotas';
import { safeNumber } from './casasDecimais';

export interface SubstituicaoInput {
  empresa: EmpresaParametros;
  produto: ProdutoEngine;
  precoTabela: TabelaPrecoItemEngine | null;
  aliquotas: AliquotasResult;
  qt: number;
  vlUnitario: number;
  vlIpi: number;
  vlDesconto: number;
  vlAcrescimo: number;
  // Quando ST vem do tabela_icms (id_st_diferenca_icms = "S")
  idStDiferencaIcms?: 'S' | 'N';
}

export interface SubstituicaoResult {
  vlBaseSubstituicao: number;
  vlIcmsSubstituicao: number;
  vlSubstituicao: number; // valor final do imposto ST a destacar
  vlDescontoCreditoSubstituicao: number;
}

/**
 * Porta literal de `calcula_substituicao2` do legado.
 *
 * Determina se a empresa é substituto/recolhedor de ST e calcula o valor da
 * substituição tributária aplicando:
 *   - regime tributário (idRegimeUtilizaReducaoBaseSubstituicao)
 *   - redução de base (interno/externo)
 *   - MVA / pauta (`prBaseSubstituicao`)
 *   - ICMS origem × destino (max(diff, 0))
 *   - modos B (base), R (redução), valor direto
 */
export function calcularSubstituicao(input: SubstituicaoInput): SubstituicaoResult {
  const { empresa, produto, precoTabela, aliquotas, qt } = input;

  const result: SubstituicaoResult = {
    vlBaseSubstituicao: 0,
    vlIcmsSubstituicao: 0,
    vlSubstituicao: 0,
    vlDescontoCreditoSubstituicao: 0,
  };

  // Empresa não é substituto e não força cálculo sempre → pula totalmente
  if (
    empresa.idSubstitutoTributarioIcms !== 'S' &&
    empresa.idCalculaSubstituicaoTributariaSempre !== 'S' &&
    input.idStDiferencaIcms !== 'S'
  ) {
    return result;
  }

  const valorBruto = qt * input.vlUnitario - input.vlDesconto + input.vlAcrescimo;
  if (valorBruto <= 0) return result;

  // Base = (Valor + IPI) com aplicação opcional de redução de base
  let base = valorBruto + input.vlIpi;

  // Aplica redução conforme regime
  const regime = empresa.idRegimeUtilizaReducaoBaseSubstituicao;
  if (regime === 'T' || regime === 'S') {
    const reducao = aliquotas.prReducaoBaseSubstituicao;
    if (reducao > 0) {
      base = base - base * (reducao / 100);
    }
  }

  // Acréscimo MVA / pauta (% sobre a base)
  const mva = aliquotas.prBaseSubstituicao;
  let baseSt = base;
  if (mva > 0) {
    baseSt = base + base * (mva / 100);
  } else {
    // Caso particular: prSubstituicao da TabelaPrecoItem como valor direto/percentual
    const prTabelaSt = safeNumber(precoTabela?.prSubstituicao);
    if (prTabelaSt > 0) {
      baseSt = base + base * (prTabelaSt / 100);
    }
  }

  // Margem de substituição do produto (legado: prMargemSubstituicao adicional)
  const margemProduto = safeNumber(produto.prMargemSubstituicao);
  if (margemProduto > 0) {
    baseSt = baseSt + baseSt * (margemProduto / 100);
  }

  // ICMS substituição: aplica alíquota interna do destino × base
  const icmsSt = baseSt * (aliquotas.prIcmsSubstituicao / 100);
  // ICMS origem da operação (já calculado via aliquotas)
  const icmsOperacao = base * (aliquotas.prIcmsVenda / 100);

  const stFinal = Math.max(icmsSt - icmsOperacao, 0);

  // Crédito de ST do produto (legado `vl_credito_substituicao`)
  let descontoCredito = 0;
  if (
    empresa.idUtilizaDescontoCreditoSubstituicaoVenda === 'S' &&
    safeNumber(produto.vlCreditoSubstituicao) > 0
  ) {
    descontoCredito = safeNumber(produto.vlCreditoSubstituicao) * qt;
  }

  result.vlBaseSubstituicao = baseSt;
  result.vlIcmsSubstituicao = icmsSt;
  result.vlSubstituicao = Math.max(stFinal - descontoCredito, 0);
  result.vlDescontoCreditoSubstituicao = descontoCredito;
  return result;
}
