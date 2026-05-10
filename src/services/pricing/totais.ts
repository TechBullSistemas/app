import type { EmpresaParametros } from '@/db/repositories/parametros';
import { roundN } from './casasDecimais';

export interface TotalItemEngine {
  qt: number;
  vlUnitario: number;
  vlIpi: number;
  vlSt: number;
  vlDesconto: number;
  vlAcrescimo: number;
  vlFlex: number;
}

export interface TotaisPedido {
  totalProdutos: number;
  totalIpi: number;
  totalSt: number;
  totalDesconto: number;
  totalAcrescimo: number;
  totalFlex: number;
  totalPedido: number;
}

export function calculaTotaisPedido(
  itens: TotalItemEngine[],
  empresa: EmpresaParametros,
): TotaisPedido {
  let totalProdutos = 0;
  let totalIpi = 0;
  let totalSt = 0;
  let totalDesconto = 0;
  let totalAcrescimo = 0;
  let totalFlex = 0;

  for (const it of itens) {
    totalProdutos += it.qt * it.vlUnitario;
    totalIpi += it.vlIpi;
    totalSt += it.vlSt;
    totalDesconto += it.vlDesconto;
    totalAcrescimo += it.vlAcrescimo;
    totalFlex += it.vlFlex;
  }

  // Se a empresa não destaca IPI ou não é substituto de ICMS, não soma no total.
  const ipiNoTotal = empresa.idDestacaIpi === 'S' ? totalIpi : 0;
  const stNoTotal =
    empresa.idSubstitutoTributarioIcms === 'S' ||
    empresa.idCalculaSubstituicaoTributariaSempre === 'S'
      ? totalSt
      : 0;

  const totalPedido =
    totalProdutos - totalDesconto + totalAcrescimo + ipiNoTotal + stNoTotal;

  return {
    totalProdutos: roundN(totalProdutos, 2),
    totalIpi: roundN(totalIpi, 2),
    totalSt: roundN(totalSt, 2),
    totalDesconto: roundN(totalDesconto, 2),
    totalAcrescimo: roundN(totalAcrescimo, 2),
    totalFlex: roundN(totalFlex, 2),
    totalPedido: roundN(totalPedido, 2),
  };
}
