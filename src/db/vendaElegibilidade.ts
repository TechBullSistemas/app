import type { SQLiteDatabase } from "expo-sqlite";
import { clienteComVendaBloqueada, MENSAGEM_CLIENTE_ATRASADO } from './clienteAtrasado';

/** Reconsulta a base atual: o cadastro pode mudar enquanto o pedido está aberto. */
export async function validarElegibilidadeVenda(
  db: Pick<SQLiteDatabase, "getFirstAsync">,
  holdingId: number,
  cdCliente: number,
  itens: { cdProduto: number }[],
) {
  const cliente = await db.getFirstAsync<{ id_ativo: number; id_bloqueia_venda_cliente_atrasado_app: number; dt_primeiro_titulo_aberto: string | null }>(
    "SELECT id_ativo, id_bloqueia_venda_cliente_atrasado_app, dt_primeiro_titulo_aberto FROM cliente WHERE holding_id = ? AND cd_cliente = ?",
    [holdingId, cdCliente],
  );
  if (!cliente || cliente.id_ativo !== 1) {
    throw new Error(
      "Cliente inativo ou indisponível. Não é permitido realizar novas vendas para este cliente.",
    );
  }
  if (clienteComVendaBloqueada(cliente)) throw new Error(MENSAGEM_CLIENTE_ATRASADO);
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
