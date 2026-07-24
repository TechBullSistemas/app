import type * as SQLite from 'expo-sqlite';
import { getDb } from '../database';

export interface PrevendaRow {
  nr_prevenda: number;
  cd_empresa: number;
  holding_id: number;
  cd_cliente: number;
  nm_cliente: string | null;
  cd_funcionario: number | null;
  dt_emissao: string | null;
  vl_total: number | null;
  vl_bruto: number | null;
  obs: string | null;
  nr_nota: number | null;
  serie_nota: string | null;
  id_situacao: string | null;
  cd_forma_pagamento: number | null;
  ds_forma_pagamento: string | null;
  client_id: string | null;
  id_sincronizado_duapi: number;
  raw_json: string | null;
}

export interface PrevendaItemRow {
  nr_prevenda: number;
  cd_empresa: number;
  holding_id: number;
  cd_produto: number;
  qt_produto: number | null;
  vl_unitario: number | null;
  vl_desconto: number | null;
  vl_acrescimo: number | null;
  ds_produto: string | null;
  ds_unidade: string | null;
}

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIso(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return new Date(v).toISOString();
  } catch {
    return String(v);
  }
}

async function upsertPrevendaRow(
  db: SQLite.SQLiteDatabase,
  it: any,
  holdingIdFallback?: number,
) {
  const nrPrevenda = Number(it.nrPrevenda);
  const cdEmpresa = Number(it.cdEmpresa);
  const holdingId = Number(it.holdingId ?? holdingIdFallback);
  if (!nrPrevenda || !cdEmpresa || !holdingId) return;

  const nmCliente =
    it.nmCliente ?? it.cliente?.nmCliente ?? it.cliente?.nome ?? null;

  await db.runAsync(
    `INSERT OR REPLACE INTO prevenda
     (nr_prevenda, cd_empresa, holding_id, cd_cliente, nm_cliente, cd_funcionario,
      dt_emissao, vl_total, vl_bruto, obs, nr_nota, serie_nota, id_situacao,
      cd_forma_pagamento, ds_forma_pagamento, client_id, id_sincronizado_duapi, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nrPrevenda,
      cdEmpresa,
      holdingId,
      Number(it.cdCliente),
      nmCliente,
      it.cdFuncionario != null ? Number(it.cdFuncionario) : null,
      toIso(it.dtEmissao),
      num(it.vlTotal),
      num(it.vlBruto),
      it.obs ?? null,
      it.nrNota != null ? Number(it.nrNota) : null,
      it.serieNota ?? null,
      it.idSituacao ?? 'AB',
      it.cdFormaPagamento != null ? Number(it.cdFormaPagamento) : null,
      it.dsFormaPagamento ?? null,
      it.clientId ?? null,
      it.idSincronizadoDuapi ? 1 : 0,
      JSON.stringify(it),
    ],
  );

  await db.runAsync(
    `DELETE FROM prevenda_item
      WHERE nr_prevenda = ? AND cd_empresa = ? AND holding_id = ?`,
    [nrPrevenda, cdEmpresa, holdingId],
  );

  const items: any[] = it.prevendaItem ?? [];
  for (const item of items) {
    const cdProduto = Number(item.cdProduto);
    if (!cdProduto) continue;
    const qt = num(item.qtProduto) ?? 0;
    const vlUnit = num(item.vlUnitario) ?? 0;
    await db.runAsync(
      `INSERT OR REPLACE INTO prevenda_item
       (nr_prevenda, cd_empresa, holding_id, cd_produto, qt_produto, vl_unitario,
        vl_desconto, vl_acrescimo, ds_produto, ds_unidade)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nrPrevenda,
        cdEmpresa,
        holdingId,
        cdProduto,
        qt,
        vlUnit,
        num(item.vlDesconto) ?? 0,
        num(item.vlAcrescimo) ?? 0,
        item.dsProduto ?? item.produto?.dsProduto ?? null,
        item.dsUnidade ?? item.produto?.unidade?.dsUnidade ?? null,
      ],
    );
  }
}

export async function bulkInsertPrevendas(
  items: any[],
  holdingIdFallback?: number,
) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await upsertPrevendaRow(db, it, holdingIdFallback);
    }
  });
}

/** Upsert imediato após upload bem-sucedido (sem esperar download sync). */
export async function upsertPrevendaFromUpload(
  prevenda: any,
  holdingIdFallback?: number,
) {
  if (!prevenda) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await upsertPrevendaRow(
      db,
      {
        ...prevenda,
        idSincronizadoDuapi: prevenda.idSincronizadoDuapi ?? false,
        nmCliente:
          prevenda.nmCliente ??
          prevenda.cliente?.nmCliente ??
          prevenda.cliente?.nome ??
          null,
        dsFormaPagamento:
          prevenda.dsFormaPagamento ??
          prevenda.formaPagamento?.dsFormaPagamento ??
          null,
        prevendaItem: prevenda.prevendaItem ?? [],
        prevendaTitulo: prevenda.prevendaTitulo ?? [],
        prevendaFormaPagamento: prevenda.prevendaFormaPagamento ?? [],
      },
      holdingIdFallback,
    );
  });
}

export async function listPrevendas(): Promise<PrevendaRow[]> {
  const db = await getDb();
  return db.getAllAsync<PrevendaRow>(
    `SELECT * FROM prevenda ORDER BY dt_emissao DESC, nr_prevenda DESC`,
  );
}

export async function getPrevendaByKey(
  nrPrevenda: number,
  cdEmpresa: number,
  holdingId: number,
): Promise<PrevendaRow | null> {
  const db = await getDb();
  return db.getFirstAsync<PrevendaRow>(
    `SELECT * FROM prevenda
      WHERE nr_prevenda = ? AND cd_empresa = ? AND holding_id = ?`,
    [nrPrevenda, cdEmpresa, holdingId],
  );
}

export async function listPrevendaItens(
  nrPrevenda: number,
  cdEmpresa: number,
  holdingId: number,
): Promise<PrevendaItemRow[]> {
  const db = await getDb();
  return db.getAllAsync<PrevendaItemRow>(
    `SELECT * FROM prevenda_item
      WHERE nr_prevenda = ? AND cd_empresa = ? AND holding_id = ?
      ORDER BY cd_produto`,
    [nrPrevenda, cdEmpresa, holdingId],
  );
}
