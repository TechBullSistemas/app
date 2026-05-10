import type { ProdutoEngine, TabelaPrecoItemEngine } from './types';
import { safeNumber } from './casasDecimais';

// vl_ipi = qt × vlUnitario × prIpi/100
// Prefere o `prIpi` do produto (override) sobre o da TabelaPrecoItem.
export function calcularIpi(params: {
  produto: ProdutoEngine;
  precoTabela: TabelaPrecoItemEngine | null;
  qt: number;
  vlUnitario: number;
}): { vlIpi: number; prIpi: number } {
  const prProduto = safeNumber(params.produto.prIpi);
  const prTabela = safeNumber(params.precoTabela?.prIpi);
  const prIpi = prProduto > 0 ? prProduto : prTabela;
  const vlIpi = params.qt * params.vlUnitario * (prIpi / 100);
  return { vlIpi, prIpi };
}
