import type { SQLiteDatabase } from "expo-sqlite";

/** Reconsulta a base atual: o cadastro pode mudar enquanto o pedido está aberto. */
export async function validarElegibilidadeVenda(
  db: Pick<SQLiteDatabase, "getFirstAsync">,
  holdingId: number,
  cdCliente: number,
  itens: { cdProduto: number }[],
) {
  const cliente = await db.getFirstAsync<{ id_ativo: number }>(
    "SELECT id_ativo FROM cliente WHERE holding_id = ? AND cd_cliente = ?",
    [holdingId, cdCliente],
  );
  if (!cliente || cliente.id_ativo !== 1) {
    throw new Error(
      "Cliente inativo ou indisponível. Não é permitido realizar novas vendas para este cliente.",
    );
  }
  for (const cdProduto of new Set(itens.map((it) => it.cdProduto))) {
    const produto = await db.getFirstAsync<{ vl_venda: number | null }>(
      "SELECT vl_venda FROM produto WHERE holding_id = ? AND cd_produto = ?",
      [holdingId, cdProduto],
    );
    if (!produto || !(Number(produto.vl_venda) > 0)) {
      throw new Error(
        `Produto #${cdProduto} sem preço de venda válido. Selecione somente produtos com valor de venda maior que zero.`,
      );
    }
  }
}
