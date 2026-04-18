import { getDb } from '../database';

export interface ProdutoRow {
  cd_produto: number;
  holding_id: number;
  descricao: string | null;
  referencia: string | null;
  cd_marca: number | null;
  cd_grupo: number | null;
  cd_fornecedor: number | null;
  cd_unidade: number | null;
  cd_cor: number | null;
  cd_tamanho: number | null;
  vl_venda: number | null;
  vl_atacado: number | null;
  vl_promocao: number | null;
  qt_disponivel: number | null;
  foto_url: string | null;
  foto_local: string | null;
  raw_json: string | null;
}

function pickPreco(it: any) {
  const tab = Array.isArray(it.tabelaPrecoItem) ? it.tabelaPrecoItem[0] : null;
  return {
    vlVenda: tab?.vlVenda != null ? Number(tab.vlVenda) : null,
    vlVendaAtacado: tab?.vlVendaAtacado != null ? Number(tab.vlVendaAtacado) : null,
    vlPromocao: tab?.vlPromocao != null ? Number(tab.vlPromocao) : null,
  };
}

function pickEstoque(it: any) {
  const e = Array.isArray(it.saldoEstoque) ? it.saldoEstoque[0] : null;
  if (!e) return null;
  if (e.qtDisponivel != null) return Number(e.qtDisponivel);
  if (e.qtFisico != null) return Number(e.qtFisico);
  return null;
}

export async function bulkInsertProdutos(items: any[], holdingIdFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const holdingId = it.holdingId ?? holdingIdFallback;
      const descricao = it.dsProduto ?? it.descricao ?? it.dsAbreviacao ?? null;
      const referencia = it.cdReferencia ?? it.referencia ?? null;
      const preco = pickPreco(it);
      const qt = pickEstoque(it);
      await db.runAsync(
        `INSERT OR REPLACE INTO produto
         (cd_produto, holding_id, descricao, referencia, cd_marca, cd_grupo, cd_fornecedor,
          cd_unidade, cd_cor, cd_tamanho, vl_venda, vl_atacado, vl_promocao, qt_disponivel,
          foto_url, foto_local, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           COALESCE((SELECT foto_local FROM produto WHERE cd_produto = ? AND holding_id = ?), NULL),
           ?)`,
        [
          it.cdProduto,
          holdingId,
          descricao,
          referencia,
          it.cdMarca ?? null,
          it.cdGrupo ?? null,
          it.cdFornecedor ?? null,
          it.cdUnidade ?? null,
          it.cdCor ?? null,
          it.cdTamanho ?? null,
          preco.vlVenda,
          preco.vlVendaAtacado,
          preco.vlPromocao,
          qt,
          it.fotoUrl ?? null,
          it.cdProduto,
          holdingId,
          JSON.stringify(it),
        ],
      );
    }
  });
}

export async function listProdutos(search?: string, limit = 100): Promise<ProdutoRow[]> {
  const db = await getDb();
  if (search && search.trim()) {
    const like = `%${search.trim()}%`;
    return db.getAllAsync<ProdutoRow>(
      `SELECT * FROM produto
       WHERE descricao LIKE ? OR referencia LIKE ?
       ORDER BY descricao LIMIT ?`,
      [like, like, limit],
    );
  }
  return db.getAllAsync<ProdutoRow>('SELECT * FROM produto ORDER BY descricao LIMIT ?', [limit]);
}

export async function getProdutoById(cdProduto: number, holdingId: number) {
  const db = await getDb();
  return db.getFirstAsync<ProdutoRow>(
    'SELECT * FROM produto WHERE cd_produto = ? AND holding_id = ?',
    [cdProduto, holdingId],
  );
}

export async function setProdutoFotoLocal(cdProduto: number, holdingId: number, path: string | null) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE produto SET foto_local = ? WHERE cd_produto = ? AND holding_id = ?',
    [path, cdProduto, holdingId],
  );
}

export async function clearProdutoFotoUrl(cdProduto: number, holdingId: number) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE produto SET foto_url = NULL WHERE cd_produto = ? AND holding_id = ?',
    [cdProduto, holdingId],
  );
}

export async function listProdutosComFotoPendente(limit = 200): Promise<ProdutoRow[]> {
  const db = await getDb();
  return db.getAllAsync<ProdutoRow>(
    `SELECT * FROM produto
     WHERE foto_url IS NOT NULL AND foto_url <> '' AND foto_local IS NULL
     LIMIT ?`,
    [limit],
  );
}
