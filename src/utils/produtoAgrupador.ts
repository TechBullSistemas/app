/**
 * Seleção de produto pelo agrupador (opção da empresa
 * `idSelecionaProdutoAgrupador`). No DUAPI o agrupador 1 é "NAO AGRUPAR":
 * só acima dele há outros produtos para escolher.
 */
export function temAgrupador(cdAgrupador: unknown): boolean {
  const cd = Number(cdAgrupador);
  return Number.isInteger(cd) && cd > 1;
}

export interface CaracteristicaProduto {
  /** Nome da característica: COR, TAMANHO, SABOR. */
  nome: string;
  valor: string;
}

/** Lê as características gravadas pelo "Buscar informações". */
export function caracteristicasDoProduto(
  caracteristicasJson: string | null | undefined,
): CaracteristicaProduto[] {
  if (!caracteristicasJson) return [];
  let lista: unknown;
  try {
    lista = JSON.parse(caracteristicasJson);
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((item) => {
    const nome = String(item?.dsCaracteristicaProduto ?? '').trim();
    const valor = String(item?.valor ?? '').trim();
    return nome && valor ? [{ nome, valor }] : [];
  });
}
