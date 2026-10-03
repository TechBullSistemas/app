import type { SQLiteDatabase } from "expo-sqlite";
import { clienteComVendaBloqueada, MENSAGEM_CLIENTE_ATRASADO } from './clienteAtrasado';
import { codigoProduto } from '../utils/codigoProduto';

/**
 * Reconsulta a base atual: o cadastro pode mudar enquanto o pedido está aberto.
 * Vale o preço do produto (tabela padrão da empresa) ou o da tabela de preço
 * do pedido: empresa sem tabela padrão vende pela tabela do cliente.
 */
export async function validarElegibilidadeVenda(
  db: Pick<SQLiteDatabase, "getFirstAsync">,
  holdingId: number,
  cdCliente: number,
  itens: { cdProduto: number }[],
  cdTabelaPreco?: number | null,
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
    const produto = await db.getFirstAsync<{
      vl_venda: number | null;
      vl_tabela?: number | null;
      cd_produto_duapi: string | null;
    }>(
      cdTabelaPreco != null
        ? `SELECT p.vl_venda, tpi.vl_venda AS vl_tabela, p.cd_produto_duapi
             FROM produto p
             LEFT JOIN tabela_preco_item tpi
               ON tpi.cd_produto = p.cd_produto
              AND tpi.holding_id = p.holding_id
              AND tpi.cd_tabela_preco = ?
            WHERE p.holding_id = ? AND p.cd_produto = ?`
        : "SELECT vl_venda, cd_produto_duapi FROM produto WHERE holding_id = ? AND cd_produto = ?",
      cdTabelaPreco != null
        ? [cdTabelaPreco, holdingId, cdProduto]
        : [holdingId, cdProduto],
    );
    if (
      !produto ||
      !(Number(produto.vl_venda) > 0 || Number(produto.vl_tabela) > 0)
    ) {
      throw new Error(
        `Produto #${codigoProduto(cdProduto, produto?.cd_produto_duapi)} sem preço de venda válido. Selecione somente produtos com valor de venda maior que zero.`,
      );
    }
  }
}
