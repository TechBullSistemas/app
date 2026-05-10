import { getDb } from '../database';

export interface ImpostoRow {
  cd_imposto: number;
  holding_id: number;
  ds_imposto: string | null;
}

export interface ImpostoUfRow {
  cd_imposto: number;
  cd_estado: string;
  holding_id: number;
  pr_icms_interno: number;
  pr_icms_interno_revenda: number;
  pr_icms_interno_industria: number;
  pr_icms_externo: number;
  pr_base_substituicao_interno: number;
  pr_base_substituicao_externo: number;
  pr_reducao_base_substituicao_interno: number;
  pr_reducao_base_substituicao_externo: number;
  pr_reducao_icms_interno: number;
  pr_reducao_icms_externo: number;
  pr_pis: number;
  pr_cofins: number;
  pr_fcp: number;
  pr_fcp_st: number;
}

export async function bulkInsertImpostos(items: any[], holdingFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO imposto (cd_imposto, holding_id, ds_imposto)
         VALUES (?, ?, ?)`,
        [
          Number(it.cdImposto),
          Number(it.holdingId ?? holdingFallback),
          it.dsImposto ?? null,
        ],
      );
    }
  });
}

export async function bulkInsertImpostoUf(items: any[], holdingFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO imposto_uf (
           cd_imposto, cd_estado, holding_id,
           pr_icms_interno, pr_icms_interno_revenda, pr_icms_interno_industria,
           pr_icms_externo,
           pr_base_substituicao_interno, pr_base_substituicao_externo,
           pr_reducao_base_substituicao_interno, pr_reducao_base_substituicao_externo,
           pr_reducao_icms_interno, pr_reducao_icms_externo,
           pr_pis, pr_cofins, pr_fcp, pr_fcp_st
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(it.cdImposto),
          String(it.cdEstado),
          Number(it.holdingId ?? holdingFallback),
          Number(it.prIcmsInterno ?? 0),
          Number(it.prIcmsInternoRevenda ?? 0),
          Number(it.prIcmsInternoIndustria ?? 0),
          Number(it.prIcmsExterno ?? 0),
          Number(it.prBaseSubstituicaoInterno ?? 0),
          Number(it.prBaseSubstituicaoExterno ?? 0),
          Number(it.prReducaoBaseSubstituicaoInterno ?? 0),
          Number(it.prReducaoBaseSubstituicaoExterno ?? 0),
          Number(it.prReducaoIcmsInterno ?? 0),
          Number(it.prReducaoIcmsExterno ?? 0),
          Number(it.prPis ?? 0),
          Number(it.prCofins ?? 0),
          Number(it.prFcp ?? 0),
          Number(it.prFcpSt ?? 0),
        ],
      );
    }
  });
}

export async function findImpostoUf(
  cdImposto: number,
  cdEstado: string,
  holdingId: number,
): Promise<ImpostoUfRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ImpostoUfRow>(
    `SELECT * FROM imposto_uf
     WHERE cd_imposto = ? AND cd_estado = ? AND holding_id = ?`,
    [cdImposto, cdEstado, holdingId],
  );
  return row ?? null;
}
