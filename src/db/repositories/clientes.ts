import { getDb } from '../database';

export interface ClienteRow {
  cd_cliente: number;
  holding_id: number;
  nome: string | null;
  razao_social: string | null;
  cpf_cnpj: string | null;
  tp_pessoa: string | null;
  fone: string | null;
  celular: string | null;
  email: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cd_cidade: number | null;
  cep: string | null;
  cd_vendedor: number | null;
  id_ativo: number;
  raw_json: string | null;
}

export async function bulkInsertClientes(items: any[], holdingIdFallback?: number) {
  if (!items.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const holdingId = it.holdingId ?? holdingIdFallback;
      const nome = it.nmCliente ?? it.nome ?? null;
      const cpfCnpj = it.cpf ?? it.cpfCnpj ?? null;
      const numero = it.dsNumero ?? it.numero ?? null;
      const cdCidade = it.cdCidade ?? null;
      await db.runAsync(
        `INSERT OR REPLACE INTO cliente
         (cd_cliente, holding_id, nome, razao_social, cpf_cnpj, tp_pessoa, fone, celular, email,
          endereco, numero, bairro, cd_cidade, cep, cd_vendedor, id_ativo, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          it.cdCliente,
          holdingId,
          nome,
          it.razaoSocial ?? null,
          cpfCnpj,
          it.tpPessoa ?? null,
          it.fone ?? null,
          it.celular ?? null,
          it.email ?? null,
          it.endereco ?? null,
          numero,
          it.bairro ?? null,
          cdCidade,
          it.cep ?? null,
          it.cdVendedor ?? null,
          it.idAtivo === false ? 0 : 1,
          JSON.stringify(it),
        ],
      );
    }
  });
}

export async function listClientes(search?: string, limit = 100): Promise<ClienteRow[]> {
  const db = await getDb();
  if (search && search.trim()) {
    const like = `%${search.trim()}%`;
    return db.getAllAsync<ClienteRow>(
      `SELECT * FROM cliente
       WHERE nome LIKE ? OR razao_social LIKE ? OR cpf_cnpj LIKE ?
       ORDER BY nome LIMIT ?`,
      [like, like, like, limit],
    );
  }
  return db.getAllAsync<ClienteRow>('SELECT * FROM cliente ORDER BY nome LIMIT ?', [limit]);
}

export async function getClienteById(cdCliente: number, holdingId: number) {
  const db = await getDb();
  return db.getFirstAsync<ClienteRow>(
    'SELECT * FROM cliente WHERE cd_cliente = ? AND holding_id = ?',
    [cdCliente, holdingId],
  );
}
