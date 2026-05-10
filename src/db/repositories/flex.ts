import { getDb } from '../database';

export interface FlexMovtoRow {
  nr_movto: number;
  cd_empresa: number;
  nr_prevenda: number;
  id_origem: string;
  cd_representante: number;
  cd_produto: number | null;
  dt_movto: string | null;
  id_operacao: string;
  vl_movto: number;
  id_tipo: string;
  holding_id: number;
}

// Movimentos pendentes em outbox (vendas ainda não confirmadas pelo backend).
// Retorna soma do `vlFlexTotal` de cada payload pendente para esse representante.
export async function getSaldoPendenteOutbox(
  cdRepresentante: number,
  holdingId: number,
): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM outbox_venda
     WHERE holding_id = ? AND status IN ('pending', 'sending', 'error')`,
    [holdingId],
  );
  let soma = 0;
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload);
      if (
        p?.cdRepresentante === cdRepresentante ||
        // Quando cdRepresentante não está no payload, o backend resolve.
        // Aqui usamos um fallback otimista: assume que pertence ao user atual.
        p?.cdRepresentante == null
      ) {
        soma += Number(p?.vlFlexTotal ?? 0);
      }
    } catch {
      // payload malformado, ignora
    }
  }
  return soma;
}

/**
 * Saldo efetivo do representante:
 *   saldoConsolidado (vindo da sessão / User do ERP)
 *   + débitos/créditos pendentes do outbox local (vendas em fila)
 *   + delta do rascunho em andamento.
 */
export async function getSaldoEfetivo(
  saldoConsolidado: number,
  cdRepresentante: number,
  holdingId: number,
  draftDelta = 0,
): Promise<number> {
  const pendente = await getSaldoPendenteOutbox(cdRepresentante, holdingId);
  return Number(saldoConsolidado) + pendente + draftDelta;
}
