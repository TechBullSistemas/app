import { getDb } from '@/db/database';

/**
 * Retorna os cd_tabela_preco permitidos para o usuário.
 * - `null` = sem restrição (usuário não tem vínculos cadastrados).
 * - `number[]` = apenas essas tabelas devem ser exibidas.
 */
export async function getCdTabelasPermitidas(
  userId: number | null | undefined,
  holdingId: number,
): Promise<number[] | null> {
  if (!userId) return null;

  const db = await getDb();
  const rows = await db.getAllAsync<{ cd_tabela_preco: number }>(
    `SELECT cd_tabela_preco FROM usuario_tabela_preco
     WHERE holding_id = ? AND cd_usuario = ?
     ORDER BY cd_tabela_preco`,
    [holdingId, userId],
  );

  if (rows.length === 0) return null;
  return rows.map((r) => r.cd_tabela_preco);
}
