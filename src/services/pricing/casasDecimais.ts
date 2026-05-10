// Arredondamento controlado pelo parâmetro `nrCasaDecimalValorVenda` da Empresa.
// Espelha o comportamento do legado, onde diferentes empresas usam 2, 3 ou 4
// casas para o valor de venda.
export function roundN(v: number, n = 2): number {
  if (!isFinite(v)) return 0;
  const f = Math.pow(10, Math.max(0, Math.floor(n)));
  return Math.round(v * f) / f;
}

export function safeNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}
