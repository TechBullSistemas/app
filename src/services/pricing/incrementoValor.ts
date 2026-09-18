export const PASSO_VALOR_PADRAO = 0.05;

export function lerIncrementoValor(rawJson: string | null | undefined) {
  let raw: Record<string, unknown> | null = null;
  try {
    raw = JSON.parse(rawJson || '{}');
  } catch {
    // Payload antigo ou inválido mantém os botões desativados.
  }
  const passo = raw?.vlIncrementoValorApp;
  const valido =
    typeof passo === 'number' &&
    Number.isFinite(passo) &&
    passo >= 0.01 &&
    passo <= 999999.99 &&
    Math.abs(passo * 100 - Math.round(passo * 100)) < 0.000001;
  return {
    idMostraIncrementoValorApp:
      raw?.idMostraIncrementoValorApp === true && valido,
    vlIncrementoValorApp: valido ? passo : PASSO_VALOR_PADRAO,
  };
}

export function incrementarValor(
  valor: number,
  passo: number,
  direcao: -1 | 1,
) {
  if (!Number.isFinite(valor) || !Number.isFinite(passo) || passo <= 0)
    return valor;
  // Preserva casas adicionais do preço calculado, sem acumular resíduos binários.
  return Math.max(
    0,
    (Math.round(valor * 1e6) + direcao * Math.round(passo * 1e6)) / 1e6,
  );
}
