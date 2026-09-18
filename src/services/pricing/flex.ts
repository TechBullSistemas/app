export interface FlexItem {
  qtProduto: number;
  vlUnitario: number;
  vlPrecoOriginal: number;
}

// Schema prices have three decimal places and quantities five. Use integer
// arithmetic to keep half-cent rounding identical to the API.
export function calcularFlexItem(item: FlexItem): number {
  const values = [item.qtProduto, item.vlUnitario, item.vlPrecoOriginal];
  if (
    values.some((v) => !Number.isFinite(v)) ||
    item.qtProduto <= 0 ||
    item.vlUnitario < 0 ||
    item.vlPrecoOriginal < 0
  ) {
    throw new Error(
      'Preço original, preço vendido e quantidade inválidos para o Flex.',
    );
  }
  const delta =
    Math.round(item.vlUnitario * 1000) -
    Math.round(item.vlPrecoOriginal * 1000);
  const product = delta * Math.round(item.qtProduto * 100000);
  if (!Number.isSafeInteger(product))
    throw new Error('Valor do pedido acima do limite permitido.');
  return (Math.sign(product) * Math.round(Math.abs(product) / 1000000)) / 100;
}

export function calcularFlexPedido(itens: FlexItem[]) {
  const valores = itens.map(calcularFlexItem);
  const cents = valores.map((v) => Math.round(v * 100));
  return {
    valores,
    total: cents.reduce((s, v) => s + v, 0) / 100,
    consumo: cents.reduce((s, v) => s + Math.max(0, -v), 0) / 100,
  };
}
