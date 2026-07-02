import { getDb } from '../database';
import { getProdutoDescricoes } from './produtos';

export interface NotaFiscalRow {
  cd_nota: number;
  cd_empresa: number;
  holding_id: number;
  cd_cliente: number | null;
  dt_emissao: string | null;
  vl_total: number | null;
  raw_json: string | null;
}

export interface TituloRow {
  cd_titulo: number;
  cd_empresa: number;
  holding_id: number;
  cd_cliente: number | null;
  dt_emissao: string | null;
  dt_vencimento: string | null;
  vl_titulo: number | null;
  vl_pago: number | null;
  raw_json: string | null;
}

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function bulkInsertNotas(items: any[], holdingIdFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const cdNota = it.nrNota ?? it.cdNota;
      const cdEmpresa = it.cdEmpresa;
      const holdingId = it.holdingId ?? holdingIdFallback;
      const vlTotal = num(it.vlTotalNota ?? it.vlTotal);
      await db.runAsync(
        `INSERT OR REPLACE INTO nota_fiscal_saida
         (cd_nota, cd_empresa, holding_id, cd_cliente, dt_emissao, vl_total, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          cdNota,
          cdEmpresa,
          holdingId,
          it.cdCliente ?? null,
          it.dtEmissao ?? null,
          vlTotal,
          JSON.stringify(it),
        ],
      );
    }
  });
}

export async function bulkInsertTitulos(items: any[], holdingIdFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const cdTitulo = it.nrTitulo ?? it.cdTitulo;
      const cdEmpresa = it.cdEmpresa;
      const holdingId = it.holdingId ?? holdingIdFallback;
      const cdCliente = it.cdPessoa ?? it.cdCliente ?? null;
      await db.runAsync(
        `INSERT OR REPLACE INTO titulo_receber
         (cd_titulo, cd_empresa, holding_id, cd_cliente, dt_emissao, dt_vencimento, vl_titulo, vl_pago, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cdTitulo,
          cdEmpresa,
          holdingId,
          cdCliente,
          it.dtEmissao ?? null,
          it.dtVencimento ?? null,
          num(it.vlTitulo ?? it.vlOriginal),
          num(it.vlPago),
          JSON.stringify(it),
        ],
      );
    }
  });
}

export async function listNotasByCliente(cdCliente: number, holdingId: number) {
  const db = await getDb();
  return db.getAllAsync<NotaFiscalRow>(
    'SELECT * FROM nota_fiscal_saida WHERE cd_cliente = ? AND holding_id = ? ORDER BY dt_emissao DESC',
    [cdCliente, holdingId],
  );
}

export async function getNotaById(
  cdNota: number,
  cdEmpresa: number,
  holdingId: number,
) {
  const db = await getDb();
  return db.getFirstAsync<NotaFiscalRow>(
    'SELECT * FROM nota_fiscal_saida WHERE cd_nota = ? AND cd_empresa = ? AND holding_id = ?',
    [cdNota, cdEmpresa, holdingId],
  );
}

export async function listTitulosByCliente(cdCliente: number, holdingId: number) {
  const db = await getDb();
  return db.getAllAsync<TituloRow>(
    'SELECT * FROM titulo_receber WHERE cd_cliente = ? AND holding_id = ? ORDER BY dt_vencimento',
    [cdCliente, holdingId],
  );
}

export interface ProdutoCompradoCliente {
  cd_produto: number;
  descricao: string | null;
  qt_total: number;
  vl_total: number;
  vendas_count: number;
}

export async function listProdutosCompradosCliente(
  cdCliente: number,
  holdingId: number,
): Promise<ProdutoCompradoCliente[]> {
  const notas = await listNotasByCliente(cdCliente, holdingId);
  const acc = new Map<number, ProdutoCompradoCliente>();
  const seenNotas = new Map<number, Set<string>>();

  for (const n of notas) {
    if (!n.raw_json) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(n.raw_json);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed?.notaFiscalSaidaItem)
      ? parsed.notaFiscalSaidaItem
      : [];
    for (const it of items) {
      const cd = Number(it.cdProduto);
      if (!Number.isFinite(cd)) continue;
      const qt = Number(it.qtProduto ?? 0) || 0;
      const vlUnit = Number(it.vlUnitario ?? 0) || 0;
      const vlDesc = Number(it.vlDesconto ?? 0) || 0;
      const vlAcr = Number(it.vlAcrescimo ?? 0) || 0;
      const totalLinha = qt * vlUnit - vlDesc + vlAcr;
      const cur = acc.get(cd) ?? {
        cd_produto: cd,
        descricao: it.dsProduto ?? null,
        qt_total: 0,
        vl_total: 0,
        vendas_count: 0,
      };
      cur.qt_total += qt;
      cur.vl_total += totalLinha;
      if (!cur.descricao && it.dsProduto) cur.descricao = it.dsProduto;
      acc.set(cd, cur);
      const notaKey = `${n.cd_nota}|${n.cd_empresa}`;
      if (!seenNotas.has(cd)) seenNotas.set(cd, new Set());
      seenNotas.get(cd)!.add(notaKey);
    }
  }
  for (const [cd, set] of seenNotas) {
    const cur = acc.get(cd);
    if (cur) cur.vendas_count = set.size;
  }

  // Itens da NF podem vir sem dsProduto (carga do legado): completa a
  // descrição pelo catálogo local sincronizado.
  const semDescricao = [...acc.values()]
    .filter((p) => !p.descricao)
    .map((p) => p.cd_produto);
  if (semDescricao.length) {
    const descricoes = await getProdutoDescricoes(semDescricao, holdingId);
    for (const cd of semDescricao) {
      const desc = descricoes.get(cd);
      if (desc) acc.get(cd)!.descricao = desc;
    }
  }

  return Array.from(acc.values()).sort((a, b) => b.vl_total - a.vl_total);
}

export interface NotaProdutoLinha {
  nota: NotaFiscalRow;
  qt: number;
  vlUnitario: number;
  vlTotal: number;
}

/**
 * Último preço unitário praticado de um produto para um cliente (forma de
 * preço 'V' — `empresa.id_forma_preco_venda_produto`). As notas já vêm
 * ordenadas por dt_emissao DESC, então a primeira linha com valor é a mais
 * recente. Retorna null quando o cliente nunca comprou o produto.
 */
export async function getUltimaVendaProdutoCliente(
  cdCliente: number,
  holdingId: number,
  cdProduto: number,
): Promise<number | null> {
  const linhas = await listNotasByClienteProduto(cdCliente, holdingId, cdProduto);
  for (const l of linhas) {
    if (l.vlUnitario > 0) return l.vlUnitario;
  }
  return null;
}

export async function listNotasByClienteProduto(
  cdCliente: number,
  holdingId: number,
  cdProduto: number,
): Promise<NotaProdutoLinha[]> {
  const notas = await listNotasByCliente(cdCliente, holdingId);
  const out: NotaProdutoLinha[] = [];
  for (const n of notas) {
    if (!n.raw_json) continue;
    try {
      const parsed = JSON.parse(n.raw_json);
      const items = Array.isArray(parsed?.notaFiscalSaidaItem)
        ? parsed.notaFiscalSaidaItem
        : [];
      for (const it of items) {
        if (Number(it.cdProduto) === cdProduto) {
          const qt = Number(it.qtProduto ?? 0) || 0;
          const vlUnit = Number(it.vlUnitario ?? 0) || 0;
          const vlDesc = Number(it.vlDesconto ?? 0) || 0;
          const vlAcr = Number(it.vlAcrescimo ?? 0) || 0;
          out.push({
            nota: n,
            qt,
            vlUnitario: vlUnit,
            vlTotal: qt * vlUnit - vlDesc + vlAcr,
          });
        }
      }
    } catch {}
  }
  return out;
}
