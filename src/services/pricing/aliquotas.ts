import type { EmpresaParametros } from '@/db/repositories/parametros';
import type { ImpostoUfEngine, ProdutoEngine } from './types';
import { safeNumber } from './casasDecimais';

export interface AliquotasResult {
  prIcmsVenda: number; // ICMS aplicado na operação atual
  prBaseSubstituicao: number; // % MVA / pauta da ST
  prIcmsSubstituicao: number; // ICMS interno do destino (usado no destino da ST)
  prReducaoBaseSubstituicao: number;
  prReducaoIcms: number; // redução da base de ICMS na operação
  // Indicadores derivados úteis para o restante do pipeline.
  isInterna: boolean;
  isImportado: boolean;
  // Diagnóstico para a UI/trace: alíquota interna escolhida e qual fonte foi
  // usada (consumo padrão / revenda / indústria).
  prIcmsInternoEscolhido: number;
  fonteIcmsInterno: 'C' | 'R' | 'I';
}

/**
 * Escolhe a alíquota de ICMS interno conforme o tipo de venda do cliente:
 *   - 'C' (consumo / default): usa `prIcmsInterno`.
 *   - 'R' (revenda): usa `prIcmsInternoRevenda`; se zero, cai em `prIcmsInterno`.
 *   - 'I' (indústria): usa `prIcmsInternoIndustria`; se zero, cai em `prIcmsInterno`.
 *
 * Não tinha equivalente direto no legado — é uma extensão para diferenciar a
 * tributação na venda interna conforme o destino (consumo vs revenda vs
 * indústria), conforme solicitado.
 */
export function pickIcmsInterno(
  impostoUf: ImpostoUfEngine,
  tp?: string | null,
): { valor: number; fonte: 'C' | 'R' | 'I' } {
  const padrao = safeNumber(impostoUf.prIcmsInterno);
  if (tp === 'R') {
    const v = safeNumber(impostoUf.prIcmsInternoRevenda);
    return v > 0 ? { valor: v, fonte: 'R' } : { valor: padrao, fonte: 'C' };
  }
  if (tp === 'I') {
    const v = safeNumber(impostoUf.prIcmsInternoIndustria);
    return v > 0 ? { valor: v, fonte: 'I' } : { valor: padrao, fonte: 'C' };
  }
  return { valor: padrao, fonte: 'C' };
}

/**
 * Porta de `f_calcula_imposto_busca_aliquota2`.
 *
 * Decide qual alíquota de ICMS aplicar (interna vs externa, importado, MVA externo)
 * conforme:
 *   - UF empresa × UF cliente
 *   - origem do produto (importado = "1","2","3","6","7","8")
 *   - flag `idUtilizaMvaExternoVenda`
 *   - `prIcmsProdutoImportadoCompraVendaForaEstado` quando importado fora estado
 *   - `prIcms` do produto como override final (ICMS_PRODUTO_VENDA do legado)
 */
export function calcularAliquotas(params: {
  empresa: EmpresaParametros;
  produto: ProdutoEngine;
  ufEmpresa: string | null;
  ufCliente: string | null;
  impostoUf: ImpostoUfEngine | null;
  prIcmsTabela: number | null;
  tpClienteVenda?: string | null;
}): AliquotasResult {
  const {
    empresa,
    produto,
    ufEmpresa,
    ufCliente,
    impostoUf,
    prIcmsTabela,
    tpClienteVenda,
  } = params;

  const isInterna = !!ufEmpresa && !!ufCliente && ufEmpresa === ufCliente;
  const origem = String(produto.idOrigemProduto ?? '0');
  const isImportado = ['1', '2', '3', '6', '7', '8'].includes(origem);

  let prIcmsVenda = 0;
  let prBaseSubstituicao = 0;
  let prIcmsSubstituicao = 0;
  let prReducaoBaseSubstituicao = 0;
  let prReducaoIcms = 0;
  // Default: tipo "C" (consumo) → padrão atual (`prIcmsInterno`).
  let prIcmsInternoEscolhido = 0;
  let fonteIcmsInterno: 'C' | 'R' | 'I' = 'C';

  if (impostoUf) {
    const pick = pickIcmsInterno(impostoUf, tpClienteVenda);
    prIcmsInternoEscolhido = pick.valor;
    fonteIcmsInterno = pick.fonte;

    if (isInterna) {
      prIcmsVenda = pick.valor;
      prBaseSubstituicao = safeNumber(impostoUf.prBaseSubstituicaoInterno);
      prReducaoBaseSubstituicao = safeNumber(
        impostoUf.prReducaoBaseSubstituicaoInterno,
      );
      prReducaoIcms = safeNumber(impostoUf.prReducaoIcmsInterno);
    } else {
      prIcmsVenda = safeNumber(impostoUf.prIcmsExterno);
      prBaseSubstituicao = empresa.idUtilizaMvaExternoVenda === 'S'
        ? safeNumber(impostoUf.prBaseSubstituicaoExterno)
        : safeNumber(impostoUf.prBaseSubstituicaoInterno);
      prReducaoBaseSubstituicao = safeNumber(
        impostoUf.prReducaoBaseSubstituicaoExterno,
      );
      prReducaoIcms = empresa.idUtilizaReducaoIcmsForaEstado === 'S'
        ? safeNumber(impostoUf.prReducaoIcmsExterno)
        : 0;
    }
    // ICMS interno do destino (usado em `calcula_substituicao2`). Também
    // varia por `tpClienteVenda`: se o destinatário é revenda/indústria,
    // a ST usa a respectiva alíquota interna.
    prIcmsSubstituicao = pick.valor;
  }

  // Override por produto: replica `if (icms_produto > 0) usa do produto`
  const prIcmsProduto = safeNumber(produto.prIcms);
  if (prIcmsProduto > 0 && isInterna) {
    prIcmsVenda = prIcmsProduto;
  }

  // Importado fora estado com parâmetro fixo na empresa
  if (
    isImportado &&
    !isInterna &&
    safeNumber(empresa.prIcmsProdutoImportadoCompraVendaForaEstado) > 0
  ) {
    prIcmsVenda = empresa.prIcmsProdutoImportadoCompraVendaForaEstado;
  }

  // Fallback para a tabela_icms (origem × destino)
  if (prIcmsVenda <= 0 && prIcmsTabela != null && prIcmsTabela > 0) {
    prIcmsVenda = prIcmsTabela;
  }

  return {
    prIcmsVenda,
    prBaseSubstituicao,
    prIcmsSubstituicao,
    prReducaoBaseSubstituicao,
    prReducaoIcms,
    isInterna,
    isImportado,
    prIcmsInternoEscolhido,
    fonteIcmsInterno,
  };
}
