import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  SQL_TITULO_EM_ABERTO,
  labelTituloReceber,
  tituloEmAberto,
} from './tituloAberto';

function titulo(overrides: {
  vl_titulo?: number | null;
  vl_pago?: number | null;
  idSituacao?: string | null;
  dtCancelamento?: string | null;
}) {
  const raw: Record<string, unknown> = {};
  if (overrides.idSituacao !== undefined) raw.idSituacao = overrides.idSituacao;
  if (overrides.dtCancelamento !== undefined) raw.dtCancelamento = overrides.dtCancelamento;
  return {
    vl_titulo: overrides.vl_titulo ?? 513.14,
    vl_pago: overrides.vl_pago ?? 0,
    raw_json: JSON.stringify(raw),
  };
}

test('aviso de atraso considera só título em aberto', () => {
  assert.equal(tituloEmAberto(titulo({ idSituacao: 'AB' })), true);
  assert.equal(tituloEmAberto(titulo({ idSituacao: 'CA' })), false);
  assert.equal(tituloEmAberto(titulo({ idSituacao: ' ca ' })), false);
  assert.equal(tituloEmAberto(titulo({ idSituacao: 'PG' })), false);
  assert.equal(tituloEmAberto(titulo({ idSituacao: 'NE' })), false);
  assert.equal(
    tituloEmAberto(titulo({ idSituacao: 'AB', dtCancelamento: '2024-08-01' })),
    false,
  );
  assert.equal(tituloEmAberto(titulo({ idSituacao: 'AB', vl_pago: 513.14 })), false);
  assert.equal(tituloEmAberto(titulo({ idSituacao: 'AB', vl_titulo: 0 })), false);
  assert.equal(labelTituloReceber(titulo({ idSituacao: 'CA' })), 'Cancelado');
  assert.equal(labelTituloReceber(titulo({ idSituacao: 'NE' })), 'Negociado');
  assert.equal(labelTituloReceber(titulo({ idSituacao: 'AB' })), 'Em aberto');
  assert.equal(labelTituloReceber(titulo({ idSituacao: 'PG' })), 'Quitado');
});

test('listagem ignora título vencido cancelado e soma só o aberto', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE titulo_receber (
      cd_cliente INTEGER,
      holding_id INTEGER,
      dt_vencimento TEXT,
      vl_titulo REAL,
      vl_pago REAL,
      raw_json TEXT
    );
  `);
  const insert = sqlite.prepare(
    `INSERT INTO titulo_receber
     (cd_cliente, holding_id, dt_vencimento, vl_titulo, vl_pago, raw_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insert.run(619, 1, '2024-08-12', 513.14, 0, JSON.stringify({ idSituacao: 'CA' }));
  insert.run(619, 1, '2024-08-12', 100, 0, JSON.stringify({ idSituacao: 'NE' }));
  insert.run(
    619,
    1,
    '2024-08-12',
    50,
    0,
    JSON.stringify({ idSituacao: 'AB', dtCancelamento: '2024-09-01' }),
  );
  insert.run(619, 1, '2024-09-01', 20, 0, JSON.stringify({ idSituacao: 'AB' }));
  insert.run(700, 1, '2024-09-01', 80, 80, JSON.stringify({ idSituacao: 'AB' }));

  const rows = sqlite
    .prepare(
      `SELECT cd_cliente, holding_id,
              SUM(COALESCE(vl_titulo, 0) - COALESCE(vl_pago, 0)) AS vl_atraso
       FROM titulo_receber
       WHERE dt_vencimento IS NOT NULL
         AND date(dt_vencimento) < date('now', 'localtime')
         AND ${SQL_TITULO_EM_ABERTO}
       GROUP BY cd_cliente, holding_id`,
    )
    .all() as { cd_cliente: number; vl_atraso: number }[];

  assert.equal(rows.length, 1);
  assert.equal(rows[0].cd_cliente, 619);
  assert.equal(rows[0].vl_atraso, 20);
});
