import { getDb } from '../database';
import { bulkInsertGeneric } from './auxiliares';

export interface EmpresaRow {
  cd_empresa: number;
  holding_id: number;
  nome: string | null;
  razao_social: string | null;
  cnpj: string | null;
  logo_url: string | null;
  logo_local: string | null;
  id_data_sincronizacao_venda_app?: number | null;
}

function empresaKey(cdEmpresa: number, holdingId: number) {
  return `${holdingId}:${cdEmpresa}`;
}

export async function bulkInsertEmpresas(
  items: any[],
  holdingIdFallback?: number,
) {
  if (!items.length) return;

  const db = await getDb();
  const anteriores = await db.getAllAsync<EmpresaRow>('SELECT * FROM empresa');
  const anteriorPorChave = new Map(
    anteriores.map((empresa) => [
      empresaKey(empresa.cd_empresa, empresa.holding_id),
      empresa,
    ]),
  );

  // Compatibilidade com uma API anterior, que ainda não enviava logoUrl.
  // Quando o campo existe e muda, o caminho local não é reaproveitado para
  // que a nova imagem seja baixada na sequência da sincronização.
  const preparados = items.map((item) => {
    const holdingId = Number(item.holdingId ?? holdingIdFallback);
    const cdEmpresa = Number(item.cdEmpresa);
    const anterior = anteriorPorChave.get(empresaKey(cdEmpresa, holdingId));
    if (
      !Object.prototype.hasOwnProperty.call(item, 'logoUrl') &&
      anterior?.logo_url
    ) {
      return { ...item, logoUrl: anterior.logo_url };
    }
    return item;
  });

  await bulkInsertGeneric('empresa', preparados, holdingIdFallback);

  await db.withTransactionAsync(async () => {
    for (const item of preparados) {
      const holdingId = Number(item.holdingId ?? holdingIdFallback);
      const cdEmpresa = Number(item.cdEmpresa);
      const anterior = anteriorPorChave.get(empresaKey(cdEmpresa, holdingId));
      const logoUrl = item.logoUrl ?? null;

      if (anterior?.logo_local && anterior.logo_url === logoUrl) {
        await db.runAsync(
          `UPDATE empresa
              SET logo_local = ?
            WHERE cd_empresa = ? AND holding_id = ?`,
          [anterior.logo_local, cdEmpresa, holdingId],
        );
      }
    }

    const holdings = [
      ...new Set(
        preparados.map((item) => Number(item.holdingId ?? holdingIdFallback)),
      ),
    ].filter(Number.isFinite);
    for (const holdingId of holdings) {
      const empresasHolding = preparados
        .filter(
          (item) => Number(item.holdingId ?? holdingIdFallback) === holdingId,
        )
        .map((item) => Number(item.cdEmpresa))
        .filter(Number.isFinite);
      if (!empresasHolding.length) continue;

      const placeholders = empresasHolding.map(() => '?').join(', ');
      await db.runAsync(
        `DELETE FROM empresa
          WHERE holding_id = ?
            AND cd_empresa NOT IN (${placeholders})`,
        [holdingId, ...empresasHolding],
      );
    }
  });
}

export async function getEmpresaById(
  cdEmpresa: number,
  holdingId: number,
): Promise<EmpresaRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<EmpresaRow>(
    `SELECT cd_empresa, holding_id, nome, razao_social, cnpj,
            logo_url, logo_local
       FROM empresa
      WHERE cd_empresa = ? AND holding_id = ?`,
    [cdEmpresa, holdingId],
  );
  return row ?? null;
}

export async function listEmpresasComLogoPendente(): Promise<EmpresaRow[]> {
  const db = await getDb();
  return db.getAllAsync<EmpresaRow>(
    `SELECT cd_empresa, holding_id, nome, razao_social, cnpj,
            logo_url, logo_local
       FROM empresa
      WHERE logo_url IS NOT NULL
        AND logo_url <> ''
        AND logo_local IS NULL`,
  );
}

export async function setEmpresaLogoLocal(
  cdEmpresa: number,
  holdingId: number,
  path: string | null,
) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE empresa
        SET logo_local = ?
      WHERE cd_empresa = ? AND holding_id = ?`,
    [path, cdEmpresa, holdingId],
  );
}
