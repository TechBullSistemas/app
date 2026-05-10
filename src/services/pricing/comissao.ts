import { safeNumber } from './casasDecimais';

// Comissão = ((vlUnit × qt) − vlDesconto) × prComissao / 100
export function calcularComissao(params: {
  qt: number;
  vlUnitario: number;
  vlDesconto: number;
  prComissao: number;
}): number {
  const base = params.qt * params.vlUnitario - safeNumber(params.vlDesconto);
  if (base <= 0) return 0;
  return base * (safeNumber(params.prComissao) / 100);
}
