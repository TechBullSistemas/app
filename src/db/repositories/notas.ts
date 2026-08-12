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
    `SELECT * FROM nota_fiscal_saida
     WHERE cd_cliente = ? AND holding_id = ?
     ORDER BY dt_emissao DESC, cd_nota DESC, cd_empresa DESC`,
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

// --- Títulos a receber: helpers ---

export interface TituloParsed {
  serie: string | null;
  cdNota: number | null;
}

export function parseTituloRaw(row: TituloRow): TituloParsed {
  try {
    const raw = row.raw_json ? JSON.parse(row.raw_json) : {};
    const serieRaw = raw.cdSerie ?? raw.nrSerie ?? raw.dsSerie ?? raw.serie;
    const cdNotaRaw = raw.nrNota ?? raw.cdNota ?? raw.cdNotaFiscal;
    const cdNota = cdNotaRaw != null ? Number(cdNotaRaw) : null;
    return {
      serie: serieRaw != null ? String(serieRaw) : null,
      cdNota: cdNota != null && Number.isFinite(cdNota) ? cdNota : null,
    };
  } catch {
    return { serie: null, cdNota: null };
  }
}

export function tituloEmAberto(row: TituloRow): boolean {
  return !row.vl_pago || row.vl_pago < (row.vl_titulo ?? 0);
}

export function diasVencidos(dtVencimento: string | null | undefined): number | null {
  if (!dtVencimento) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dtVencimento);
  if (Number.isNaN(venc.getTime())) return null;
  venc.setHours(0, 0, 0, 0);
  const diff = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

export interface TituloAtrasoResumo {
  maxDiasAtraso: number;
  vlTotalAtraso: number;
}

export function calcTituloAtrasoResumo(titulos: TituloRow[]): TituloAtrasoResumo | null {
  let maxDias = 0;
  let vlTotal = 0;
  for (const t of titulos) {
    if (!tituloEmAberto(t)) continue;
    const dias = diasVencidos(t.dt_vencimento);
    if (dias == null) continue;
    maxDias = Math.max(maxDias, dias);
    vlTotal += (t.vl_titulo ?? 0) - (t.vl_pago ?? 0);
  }
  if (maxDias <= 0) return null;
  return { maxDiasAtraso: maxDias, vlTotalAtraso: vlTotal };
}

export async function getMapTitulosAtrasoResumo(): Promise<
  Map<string, TituloAtrasoResumo>
> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    cd_cliente: number;
    holding_id: number;
    max_dias: number;
    vl_atraso: number;
  }>(
    `SELECT cd_cliente, holding_id,
            MAX(julianday('now', 'localtime') - julianday(dt_vencimento)) AS max_dias,
            SUM(COALESCE(vl_titulo, 0) - COALESCE(vl_pago, 0)) AS vl_atraso
     FROM titulo_receber
     WHERE dt_vencimento IS NOT NULL
       AND date(dt_vencimento) < date('now', 'localtime')
       AND (vl_pago IS NULL OR vl_pago < COALESCE(vl_titulo, 0))
     GROUP BY cd_cliente, holding_id`,
  );
  const map = new Map<string, TituloAtrasoResumo>();
  for (const r of rows) {
    const maxDias = Math.floor(r.max_dias);
    if (maxDias <= 0) continue;
    map.set(`${r.cd_cliente}-${r.holding_id}`, {
      maxDiasAtraso: maxDias,
      vlTotalAtraso: r.vl_atraso,
    });
  }
  return map;
}

export function sortTitulosByVencimento(titulos: TituloRow[]): TituloRow[] {
  return [...titulos].sort((a, b) => {
    if (!a.dt_vencimento && !b.dt_vencimento) return 0;
    if (!a.dt_vencimento) return 1;
    if (!b.dt_vencimento) return -1;
    return a.dt_vencimento.localeCompare(b.dt_vencimento);
  });
}

// --- Notas fiscais: helpers e listagem filtrada ---

export interface NotaParsed {
  serie: string | null;
  cdCondicaoPagto: number | null;
}

export function parseNotaRaw(rawJson: string | null): NotaParsed {
  try {
    const raw = rawJson ? JSON.parse(rawJson) : {};
    const serieRaw = raw.cdSerie ?? raw.nrSerie ?? raw.dsSerie ?? raw.serie;
    const cdCond = raw.cdCondicaoPagto ?? raw.cd_condicao_pagto;
    const cdCondicaoPagto = cdCond != null ? Number(cdCond) : null;
    return {
      serie: serieRaw != null ? String(serieRaw) : null,
      cdCondicaoPagto:
        cdCondicaoPagto != null && Number.isFinite(cdCondicaoPagto)
          ? cdCondicaoPagto
          : null,
    };
  } catch {
    return { serie: null, cdCondicaoPagto: null };
  }
}

export interface NotaListagemFiltro {
  dtInicio?: string;
  dtFim?: string;
  clienteSearch?: string;
  nrNota?: number;
  holdingId?: number;
}

export interface NotaListagemRow extends NotaFiscalRow {
  cliente_nome: string | null;
  serie: string | null;
  condicao_pagto: string | null;
}

export async function listNotasFiltradas(
  filtro: NotaListagemFiltro,
): Promise<NotaListagemRow[]> {
  const db = await getDb();
  const params: (string | number)[] = [];
  let sql = `
    SELECT n.*, c.nome AS cliente_nome
    FROM nota_fiscal_saida n
    LEFT JOIN cliente c
      ON c.cd_cliente = n.cd_cliente AND c.holding_id = n.holding_id
    WHERE 1=1`;

  if (filtro.holdingId != null) {
    sql += ' AND n.holding_id = ?';
    params.push(filtro.holdingId);
  }

  if (filtro.nrNota != null && Number.isFinite(filtro.nrNota)) {
    sql += ' AND n.cd_nota = ?';
    params.push(filtro.nrNota);
  } else {
    if (filtro.dtInicio) {
      sql += ' AND date(n.dt_emissao) >= date(?)';
      params.push(filtro.dtInicio);
    }
    if (filtro.dtFim) {
      sql += ' AND date(n.dt_emissao) <= date(?)';
      params.push(filtro.dtFim);
    }
  }

  if (filtro.clienteSearch?.trim()) {
    const like = `%${filtro.clienteSearch.trim()}%`;
    sql += ' AND (c.nome LIKE ? OR c.razao_social LIKE ?)';
    params.push(like, like);
  }

  sql += ' ORDER BY n.dt_emissao DESC LIMIT 500';

  const rows = await db.getAllAsync<
    NotaFiscalRow & { cliente_nome: string | null }
  >(sql, params);

  const condCache = new Map<string, string | null>();
  const out: NotaListagemRow[] = [];

  for (const row of rows) {
    const parsed = parseNotaRaw(row.raw_json);
    let condicao_pagto: string | null = null;
    if (parsed.cdCondicaoPagto != null && row.holding_id != null) {
      const key = `${parsed.cdCondicaoPagto}-${row.holding_id}`;
      if (condCache.has(key)) {
        condicao_pagto = condCache.get(key) ?? null;
      } else {
        const cp = await db.getFirstAsync<{ descricao: string | null }>(
          'SELECT descricao FROM condicao_pagto WHERE cd_condicao = ? AND holding_id = ?',
          [parsed.cdCondicaoPagto, row.holding_id],
        );
        condicao_pagto = cp?.descricao ?? null;
        condCache.set(key, condicao_pagto);
      }
    }
    out.push({
      ...row,
      serie: parsed.serie,
      condicao_pagto,
    });
  }

  return out;
}

export interface ProdutoCompradoCliente {
  cd_produto: number;
  descricao: string | null;
  qt_total: number;
  vl_total: number;
  vendas_count: number;
}

function isCancelado(idSituacao: unknown): boolean {
  return String(idSituacao ?? '').trim().toUpperCase() === 'CA';
}

/**
 * Extrai somente itens válidos de uma nota sincronizada. O endpoint mobile
 * envia o cabeçalho e `notaFiscalSaidaItem` no raw_json, incluindo a situação
 * de ambos; assim a referência funciona offline e desconsidera cancelamentos.
 */
function getItensVendaAtivos(nota: NotaFiscalRow): any[] {
  if (!nota.raw_json) return [];
  try {
    const parsed = JSON.parse(nota.raw_json);
    if (isCancelado(parsed?.idSituacao)) return [];
    const items = Array.isArray(parsed?.notaFiscalSaidaItem)
      ? parsed.notaFiscalSaidaItem
      : [];
    return items.filter((item: any) => !isCancelado(item?.idSituacao));
  } catch {
    return [];
  }
}

export async function listProdutosCompradosCliente(
  cdCliente: number,
  holdingId: number,
): Promise<ProdutoCompradoCliente[]> {
  const notas = await listNotasByCliente(cdCliente, holdingId);
  const acc = new Map<number, ProdutoCompradoCliente>();
  const seenNotas = new Map<number, Set<string>>();

  for (const n of notas) {
    const items = getItensVendaAtivos(n);
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

export interface UltimaVendaProdutoCliente {
  vlUnitario: number;
  dtEmissao: string | null;
}

/**
 * Mapa produto → última venda válida do cliente. Como as notas vêm ordenadas
 * da mais recente para a mais antiga, a primeira ocorrência de cada produto
 * é a referência correta. Retorna também vendas com valor unitário zero.
 */
export async function getUltimasVendasCliente(
  cdCliente: number,
  holdingId: number,
): Promise<Map<number, UltimaVendaProdutoCliente>> {
  const notas = await listNotasByCliente(cdCliente, holdingId);
  const result = new Map<number, UltimaVendaProdutoCliente>();

  for (const nota of notas) {
    for (const item of getItensVendaAtivos(nota)) {
      const cdProduto = Number(item.cdProduto);
      if (!Number.isFinite(cdProduto) || result.has(cdProduto)) continue;

      const vlUnitario = num(item.vlUnitario);
      if (vlUnitario == null) continue;

      result.set(cdProduto, {
        vlUnitario,
        dtEmissao: nota.dt_emissao,
      });
    }
  }

  return result;
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
  const ultimas = await getUltimasVendasCliente(cdCliente, holdingId);
  return ultimas.get(cdProduto)?.vlUnitario ?? null;
}

export async function listNotasByClienteProduto(
  cdCliente: number,
  holdingId: number,
  cdProduto: number,
): Promise<NotaProdutoLinha[]> {
  const notas = await listNotasByCliente(cdCliente, holdingId);
  const out: NotaProdutoLinha[] = [];
  for (const n of notas) {
    const items = getItensVendaAtivos(n);
    for (const it of items) {
      if (Number(it.cdProduto) === cdProduto) {
        const vlUnit = num(it.vlUnitario);
        if (vlUnit == null) continue;
        const qt = Number(it.qtProduto ?? 0) || 0;
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
  }
  return out;
}
