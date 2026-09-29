export function condicaoPrecoCacheKey(params: {
  cdProduto: number;
  qt: number;
  cdTabelaPreco: number;
  cdCondicaoPagto?: number | null;
  cdCliente?: number | null;
  apenasPadrao?: boolean;
}): string {
  return (
    `${params.cdProduto}|${params.qt}|${params.cdTabelaPreco}` +
    `|${params.cdCondicaoPagto ?? ''}|${params.cdCliente ?? ''}` +
    `|${params.apenasPadrao ? 'padrao' : 'todas'}`
  );
}
