type CondicaoPadrao = {
  cdCondicaoPreco: number;
  idPromocao: boolean;
  idUltimaVenda: boolean;
};

export function escolherCondicaoPrecoPadrao<T extends CondicaoPadrao>(
  opcoes: T[],
  cdCondicaoPrecoCliente?: number | null,
): T | undefined {
  return opcoes.find((opcao) => opcao.cdCondicaoPreco === cdCondicaoPrecoCliente)
    ?? opcoes.find((opcao) => !opcao.idPromocao && !opcao.idUltimaVenda)
    ?? opcoes[0];
}
