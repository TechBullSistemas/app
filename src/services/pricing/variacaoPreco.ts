import type { EmpresaParametros } from '@/db/repositories/parametros';
import type { ProdutoEngine, RepresentanteEngine, TabelaPrecoItemEngine } from './types';
import { safeNumber } from './casasDecimais';

export interface VariacaoPrecoResult {
  ok: boolean;
  motivo?: string;
  modo: 'M' | 'D';
  prCalculado: number;
  prLimite: number;
}

/**
 * Espelha `validacaoVariacaoPreco` do legado.
 *
 * Modo "M" (margem mínima): garante que o preço unitário >= custo × (1 + margem%).
 * Modo "D" (desconto máximo): garante que o desconto em relação ao vlVenda não
 * supera o teto definido (margemLucroMinimo do representante OU empresa).
 */
export function validacaoVariacaoPreco(params: {
  empresa: EmpresaParametros;
  representante?: RepresentanteEngine | null;
  produto: ProdutoEngine;
  precoTabela: TabelaPrecoItemEngine | null;
  vlUnitario: number;
}): VariacaoPrecoResult {
  const modo = params.empresa.idProdutoControleVariacaoPreco;
  const repTemMargem = params.representante?.idMargem === 'S';
  const margem = repTemMargem
    ? safeNumber(params.representante!.prMargemLucroMinimo)
    : safeNumber(params.empresa.prMargemLucroMinimo);

  if (margem <= 0) {
    return {
      ok: true,
      modo,
      prCalculado: 0,
      prLimite: 0,
    };
  }

  if (modo === 'M') {
    const custo = safeNumber(params.precoTabela?.vlCusto ?? params.produto.vlCusto);
    if (custo <= 0) {
      return { ok: true, modo, prCalculado: 0, prLimite: margem };
    }
    const minimo = custo * (1 + margem / 100);
    if (params.vlUnitario < minimo) {
      return {
        ok: false,
        modo,
        prCalculado: ((minimo - params.vlUnitario) / minimo) * 100,
        prLimite: margem,
        motivo: `Preço abaixo da margem mínima (${margem}%). Mínimo R$ ${minimo.toFixed(2)}.`,
      };
    }
    return { ok: true, modo, prCalculado: 0, prLimite: margem };
  }

  // Modo D — desconto máximo permitido
  const vlVenda = safeNumber(params.precoTabela?.vlVenda);
  if (vlVenda <= 0) {
    return { ok: true, modo, prCalculado: 0, prLimite: margem };
  }
  const desconto = ((vlVenda - params.vlUnitario) / vlVenda) * 100;
  if (desconto > margem) {
    return {
      ok: false,
      modo,
      prCalculado: desconto,
      prLimite: margem,
      motivo: `Desconto ${desconto.toFixed(2)}% excede o máximo permitido (${margem}%).`,
    };
  }
  return { ok: true, modo, prCalculado: desconto, prLimite: margem };
}
