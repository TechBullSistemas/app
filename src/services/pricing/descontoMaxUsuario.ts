export const DEFAULT_PR_DESCONTO_MAX = 10;
const TOLERANCIA_PERCENTUAL = 0.01;

export function resolvePrDescontoMax(prDescontoMax?: number | null): number {
  if (prDescontoMax == null) return DEFAULT_PR_DESCONTO_MAX;
  const n = Number(prDescontoMax);
  return Number.isFinite(n) ? n : DEFAULT_PR_DESCONTO_MAX;
}

export interface DescontoMaxUsuarioPrecoResult {
  ok: boolean;
  motivo?: string;
  prCalculado: number;
  prLimite: number;
  vlMinimo: number;
}

export function calcDescontoPctReferencia(
  vlReferencia: number,
  vlUnitario: number,
): number {
  if (vlReferencia <= 0 || vlUnitario >= vlReferencia) return 0;
  return Number(
    (((vlReferencia - vlUnitario) / vlReferencia) * 100).toFixed(4),
  );
}

export function calcVlMinimoPermitido(
  vlReferencia: number,
  prDescontoMax?: number | null,
): number {
  const prMax = resolvePrDescontoMax(prDescontoMax);
  if (prMax <= 0 || vlReferencia <= 0) return 0;
  return Number((vlReferencia * (1 - prMax / 100)).toFixed(2));
}

/**
 * Valida se a redução manual do preço unitário respeita o prDescontoMax do usuário.
 * Só se aplica quando o vendedor editou o preço abaixo da referência calculada.
 */
export function validacaoDescontoMaxUsuarioPreco(params: {
  prDescontoMax?: number | null;
  vlReferencia: number;
  vlUnitario: number;
  editadoManualmente?: boolean;
}): DescontoMaxUsuarioPrecoResult {
  const prMax = resolvePrDescontoMax(params.prDescontoMax);
  const vlReferencia = Number(params.vlReferencia) || 0;
  const vlUnitario = Number(params.vlUnitario) || 0;
  const vlMinimo = calcVlMinimoPermitido(vlReferencia, prMax);

  if (prMax <= 0 || params.editadoManualmente === false) {
    return { ok: true, prCalculado: 0, prLimite: prMax, vlMinimo };
  }
  if (vlReferencia <= 0 || vlUnitario >= vlReferencia) {
    return { ok: true, prCalculado: 0, prLimite: prMax, vlMinimo };
  }

  const desconto = calcDescontoPctReferencia(vlReferencia, vlUnitario);
  if (desconto > prMax + TOLERANCIA_PERCENTUAL) {
    return {
      ok: false,
      prCalculado: desconto,
      prLimite: prMax,
      vlMinimo,
      motivo: `Desconto de ${desconto.toFixed(2)}% excede o máximo permitido para seu usuário (${prMax.toFixed(2)}%). Mínimo R$ ${vlMinimo.toFixed(2)}.`,
    };
  }

  return { ok: true, prCalculado: desconto, prLimite: prMax, vlMinimo };
}

export function mensagemDescontoPrecoAjustado(prDescontoMax: number): string {
  return `Desconto máximo permitido para seu usuário é ${prDescontoMax.toFixed(2).replace(/\.?0+$/, '')}%. O valor foi ajustado.`;
}
