export interface TituloSaldo {
  vl_titulo: number | null;
  vl_pago: number | null;
  raw_json: string | null;
}

const SITUACOES_FORA_DE_ABERTO = new Set(['PG', 'CA', 'NE']);

function parseRaw(rawJson: string | null | undefined): Record<string, unknown> | null {
  if (!rawJson) return null;
  try {
    const raw = JSON.parse(rawJson);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function situacaoTitulo(rawJson: string | null | undefined): string | null {
  const raw = parseRaw(rawJson);
  if (!raw) return null;
  const value = raw.idSituacao ?? raw.id_situacao;
  if (value == null) return null;
  const situacao = String(value).trim().toUpperCase();
  return situacao || null;
}

export function tituloCancelado(rawJson: string | null | undefined): boolean {
  const raw = parseRaw(rawJson);
  if (!raw) return false;
  const dt = raw.dtCancelamento ?? raw.dt_cancelamento;
  return dt != null && String(dt).trim() !== '';
}

/** Título ainda cobrável: em aberto, com saldo e sem cancelamento no ERP. */
export function tituloEmAberto(row: TituloSaldo): boolean {
  const situacao = situacaoTitulo(row.raw_json);
  if (situacao && SITUACOES_FORA_DE_ABERTO.has(situacao)) return false;
  if (tituloCancelado(row.raw_json)) return false;
  const vlTitulo = row.vl_titulo ?? 0;
  if (!(vlTitulo > 0)) return false;
  return row.vl_pago == null || row.vl_pago < vlTitulo;
}

export function labelTituloReceber(row: TituloSaldo): string {
  const situacao = situacaoTitulo(row.raw_json);
  if (situacao === 'CA' || tituloCancelado(row.raw_json)) return 'Cancelado';
  if (situacao === 'NE') return 'Negociado';
  if (tituloEmAberto(row)) return 'Em aberto';
  return 'Quitado';
}

/**
 * Mesma regra de tituloEmAberto, usada no aviso agregado da listagem de clientes.
 * idSituacao e dtCancelamento ficam no raw_json sincronizado.
 */
export const SQL_TITULO_EM_ABERTO = `
  COALESCE(vl_titulo, 0) > 0
  AND (vl_pago IS NULL OR vl_pago < COALESCE(vl_titulo, 0))
  AND UPPER(TRIM(COALESCE(json_extract(raw_json, '$.idSituacao'), ''))) NOT IN ('PG', 'CA', 'NE')
  AND (
    json_extract(raw_json, '$.dtCancelamento') IS NULL
    OR TRIM(COALESCE(json_extract(raw_json, '$.dtCancelamento'), '')) = ''
  )
`;
