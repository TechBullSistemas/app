/**
 * Código do produto mostrado ao usuário. Em empresas cujo DUAPI usa código
 * texto, `cd_produto` é um sequencial interno e o código do DUAPI vem em
 * `cdProdutoDuapi`. Nas demais, o campo é nulo e o código interno é exibido.
 */
export function codigoProduto(
  cdProduto: number | string,
  cdProdutoDuapi?: string | null,
): string {
  return cdProdutoDuapi?.trim() || String(cdProduto);
}
