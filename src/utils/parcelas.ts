export interface ParcelaComValor {
  valor: number;
  valorInput?: string;
}

function paraCentavos(valor: number): number {
  const numero = Number(valor);
  return Math.max(0, Math.round((Number.isFinite(numero) ? numero : 0) * 100));
}

/**
 * Espelha a distribuição usada no frontend: trabalha em centavos e reparte o
 * resíduo entre as primeiras parcelas, garantindo soma exata.
 */
export function distribuirValoresParcelas(
  total: number,
  quantidade: number,
): number[] {
  const numeroParcelas = Math.floor(Number(quantidade) || 0);
  if (numeroParcelas <= 0) return [];

  const totalCentavos = paraCentavos(total);
  const baseCentavos = Math.floor(totalCentavos / numeroParcelas);
  const residuo = totalCentavos - baseCentavos * numeroParcelas;

  return Array.from(
    { length: numeroParcelas },
    (_, indice) => (baseCentavos + (indice < residuo ? 1 : 0)) / 100,
  );
}

/** Recalcula todas as parcelas sem alterar datas ou demais metadados. */
export function recalcularParcelasNoTotal<T extends ParcelaComValor>(
  parcelas: T[],
  total: number,
): T[] {
  const valores = distribuirValoresParcelas(total, parcelas.length);
  return parcelas.map((parcela, indice) => ({
    ...parcela,
    valor: valores[indice] ?? 0,
    valorInput: undefined,
  }));
}

/**
 * Mantém o valor digitado (dentro do total disponível) e redistribui o saldo
 * entre as demais parcelas. Em parcela única, o valor sempre volta ao total.
 */
export function redistribuirParcelasAposEdicao<T extends ParcelaComValor>(
  parcelas: T[],
  indiceEditado: number,
  novoValor: number,
  total: number,
): T[] {
  if (parcelas.length === 0) return [];
  if (indiceEditado < 0 || indiceEditado >= parcelas.length) return parcelas;
  if (parcelas.length === 1) return recalcularParcelasNoTotal(parcelas, total);

  const totalCentavos = paraCentavos(total);
  const minimoCentavos = totalCentavos >= parcelas.length ? 1 : 0;
  const maximoEditado = Math.max(
    minimoCentavos,
    totalCentavos - minimoCentavos * (parcelas.length - 1),
  );
  const valorEditado = Math.min(
    maximoEditado,
    Math.max(minimoCentavos, paraCentavos(novoValor)),
  );
  const demaisValores = distribuirValoresParcelas(
    (totalCentavos - valorEditado) / 100,
    parcelas.length - 1,
  );

  let indiceDemais = 0;
  return parcelas.map((parcela, indice) => ({
    ...parcela,
    valor:
      indice === indiceEditado
        ? valorEditado / 100
        : (demaisValores[indiceDemais++] ?? 0),
    valorInput: undefined,
  }));
}

/**
 * Barreira final antes de persistir: preserva a distribuição válida e corrige
 * qualquer diferença residual; se a correção deixaria parcela negativa,
 * redistribui o total por completo.
 */
export function garantirSomaParcelas<T extends ParcelaComValor>(
  parcelas: T[],
  total: number,
): T[] {
  if (parcelas.length === 0) return [];

  const totalCentavos = paraCentavos(total);
  const valoresCentavos = parcelas.map((parcela) =>
    paraCentavos(parcela.valor),
  );
  const somaCentavos = valoresCentavos.reduce((soma, valor) => soma + valor, 0);
  const diferenca = totalCentavos - somaCentavos;

  if (diferenca === 0) {
    return parcelas.map((parcela, indice) => ({
      ...parcela,
      valor: valoresCentavos[indice] / 100,
      valorInput: undefined,
    }));
  }

  const ultimoIndice = parcelas.length - 1;
  const ultimoCorrigido = valoresCentavos[ultimoIndice] + diferenca;
  if (ultimoCorrigido >= 0) {
    return parcelas.map((parcela, indice) => ({
      ...parcela,
      valor:
        (indice === ultimoIndice ? ultimoCorrigido : valoresCentavos[indice]) /
        100,
      valorInput: undefined,
    }));
  }

  return recalcularParcelasNoTotal(parcelas, total);
}
