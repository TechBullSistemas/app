export function produtoLiberadoInternet(value: unknown): boolean {
  // APIs anteriores não enviavam o campo: mantém o default true do ERP.
  if (value == null || value === '') return true;
  return value === true || value === 1 || String(value).trim().toUpperCase() === 'S';
}

export function podeSincronizarProduto(
  produto: { idSituacao?: string | null; idLiberadoInternet?: unknown },
  verificaLiberadoInternet: boolean,
): boolean {
  const ativo = produto.idSituacao == null || produto.idSituacao.trim() === 'A';
  return ativo && (!verificaLiberadoInternet || produtoLiberadoInternet(produto.idLiberadoInternet));
}
