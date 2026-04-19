import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import { enqueueCliente, updateOutboxClientePayload } from './outbox';

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
  client_id?: string | null;
  origem?: 'remoto' | 'local' | null;
  pending_sync?: number | null;
  cidade_nome?: string | null;
  estado?: number | null;
}

export interface ClienteLocalInput {
  nome: string;
  razao_social?: string | null;
  cpf_cnpj?: string | null;
  tp_pessoa?: 'F' | 'J' | null;
  fone?: string | null;
  celular?: string | null;
  email?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cd_cidade?: number | null;
  cep?: string | null;
}

function extractClientIdMarker(observacao: unknown): string | null {
  if (typeof observacao !== 'string') return null;
  const m = observacao.match(/\[clientId:([0-9a-f-]{8,})\]/i);
  return m ? m[1] : null;
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

      // Se este cliente do servidor é um cliente que nós cadastramos offline
      // (marker [clientId:uuid] no campo observacao), removemos o registro local
      // (cd_cliente negativo) antes de inserir o real, evitando duplicação.
      const clientIdMarker = extractClientIdMarker(it.observacao);
      if (clientIdMarker) {
        await db.runAsync(
          `DELETE FROM cliente WHERE client_id = ? AND cd_cliente <> ?`,
          [clientIdMarker, it.cdCliente],
        );
      }

      await db.runAsync(
        `INSERT OR REPLACE INTO cliente
         (cd_cliente, holding_id, nome, razao_social, cpf_cnpj, tp_pessoa, fone, celular, email,
          endereco, numero, bairro, cd_cidade, cep, cd_vendedor, id_ativo, raw_json,
          client_id, origem, pending_sync)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'remoto', 0)`,
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

const SELECT_CLIENTE_COM_CIDADE = `
  SELECT c.*, ci.nome AS cidade_nome, ci.cd_estado AS estado
  FROM cliente c
  LEFT JOIN cidade ci ON ci.cd_cidade = c.cd_cidade
`;

export async function listClientes(search?: string, limit = 100): Promise<ClienteRow[]> {
  const db = await getDb();
  if (search && search.trim()) {
    const like = `%${search.trim()}%`;
    return db.getAllAsync<ClienteRow>(
      `${SELECT_CLIENTE_COM_CIDADE}
       WHERE c.nome LIKE ? OR c.razao_social LIKE ? OR c.cpf_cnpj LIKE ?
       ORDER BY c.nome LIMIT ?`,
      [like, like, like, limit],
    );
  }
  return db.getAllAsync<ClienteRow>(
    `${SELECT_CLIENTE_COM_CIDADE} ORDER BY c.nome LIMIT ?`,
    [limit],
  );
}

export async function getClienteById(cdCliente: number, holdingId: number) {
  const db = await getDb();
  return db.getFirstAsync<ClienteRow>(
    `${SELECT_CLIENTE_COM_CIDADE} WHERE c.cd_cliente = ? AND c.holding_id = ?`,
    [cdCliente, holdingId],
  );
}

export function isClienteEditavel(c: ClienteRow | null | undefined): boolean {
  if (!c) return false;
  return c.origem === 'local' && (c.pending_sync ?? 0) === 1;
}

function buildClientePayload(
  cdClienteLocal: number,
  holdingId: number,
  clientId: string,
  input: ClienteLocalInput,
) {
  return {
    clientId,
    holdingId,
    cdClienteLocal,
    nmCliente: input.nome,
    razaoSocial: input.razao_social ?? null,
    cpf: input.cpf_cnpj ?? null,
    tpPessoa: input.tp_pessoa ?? 'F',
    endereco: input.endereco ?? null,
    numero: input.numero ?? null,
    bairro: input.bairro ?? null,
    cdCidade: input.cd_cidade ?? null,
    cep: input.cep ?? null,
    fone: input.fone ?? null,
    celular: input.celular ?? null,
    email: input.email ?? null,
  };
}

export async function insertClienteLocal(
  holdingId: number,
  input: ClienteLocalInput,
): Promise<ClienteRow> {
  const db = await getDb();
  const clientId = uuidv4();
  const cdLocal = -Date.now();

  await db.runAsync(
    `INSERT INTO cliente
       (cd_cliente, holding_id, nome, razao_social, cpf_cnpj, tp_pessoa, fone, celular, email,
        endereco, numero, bairro, cd_cidade, cep, cd_vendedor, id_ativo, raw_json,
        client_id, origem, pending_sync)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, 'local', 1)`,
    [
      cdLocal,
      holdingId,
      input.nome,
      input.razao_social ?? null,
      input.cpf_cnpj ?? null,
      input.tp_pessoa ?? 'F',
      input.fone ?? null,
      input.celular ?? null,
      input.email ?? null,
      input.endereco ?? null,
      input.numero ?? null,
      input.bairro ?? null,
      input.cd_cidade ?? null,
      input.cep ?? null,
      clientId,
    ],
  );

  await enqueueCliente({
    clientId,
    cdClienteLocal: cdLocal,
    holdingId,
    payload: buildClientePayload(cdLocal, holdingId, clientId, input),
  });

  const row = await getClienteById(cdLocal, holdingId);
  if (!row) throw new Error('Falha ao criar cliente local.');
  return row;
}

export async function updateClienteLocal(
  cdCliente: number,
  holdingId: number,
  patch: ClienteLocalInput,
): Promise<ClienteRow> {
  const existing = await getClienteById(cdCliente, holdingId);
  if (!existing) throw new Error('Cliente não encontrado.');
  if (!isClienteEditavel(existing)) {
    throw new Error('Apenas clientes cadastrados offline podem ser editados.');
  }

  const db = await getDb();
  await db.runAsync(
    `UPDATE cliente
       SET nome = ?, razao_social = ?, cpf_cnpj = ?, tp_pessoa = ?,
           fone = ?, celular = ?, email = ?, endereco = ?, numero = ?,
           bairro = ?, cd_cidade = ?, cep = ?
     WHERE cd_cliente = ? AND holding_id = ?`,
    [
      patch.nome,
      patch.razao_social ?? null,
      patch.cpf_cnpj ?? null,
      patch.tp_pessoa ?? 'F',
      patch.fone ?? null,
      patch.celular ?? null,
      patch.email ?? null,
      patch.endereco ?? null,
      patch.numero ?? null,
      patch.bairro ?? null,
      patch.cd_cidade ?? null,
      patch.cep ?? null,
      cdCliente,
      holdingId,
    ],
  );

  const clientId = existing.client_id!;
  await updateOutboxClientePayload(
    clientId,
    buildClientePayload(cdCliente, holdingId, clientId, patch),
  );

  const row = await getClienteById(cdCliente, holdingId);
  if (!row) throw new Error('Falha ao atualizar cliente local.');
  return row;
}

/**
 * Após o servidor confirmar a criação do cliente, troca o cd_cliente local
 * (negativo) pelo cd_cliente real e propaga em todas as referências
 * (vendas e visitas pendentes/efetivadas).
 */
/**
 * Garante que o cliente local com o `clientId` informado deixe de ser exibido
 * como pendente, independentemente de remap de cd_cliente.
 */
export async function markClienteSincronizado(clientId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cliente SET origem = 'remoto', pending_sync = 0 WHERE client_id = ?`,
    [clientId],
  );
}

export async function remapClienteLocalToRemoto(
  clientId: string,
  cdClienteRemoto: number,
): Promise<void> {
  const db = await getDb();
  const local = await db.getFirstAsync<ClienteRow>(
    `SELECT * FROM cliente WHERE client_id = ?`,
    [clientId],
  );
  if (!local) return;
  const { cd_cliente: cdLocal, holding_id: holdingId } = local;

  // Estratégia: em vez de tentar UPDATE da PK (que pode dar conflito quando o
  // cliente já existe via download), deletamos o registro local e fazemos
  // INSERT OR REPLACE do cliente "real". Atualizamos referências e payloads.
  // Tudo fora de uma transação SQLite explícita para evitar engolir erros silenciosos
  // — cada passo é executado e logado individualmente.

  // 1. Remove o registro local (cd_cliente negativo)
  if (cdLocal !== cdClienteRemoto) {
    await db.runAsync(
      `DELETE FROM cliente WHERE cd_cliente = ? AND holding_id = ?`,
      [cdLocal, holdingId],
    );
  }

  // 2. Garante que exista um registro com o cd_cliente real (origem='remoto')
  //    Se já houver um (vindo de download), apenas zeramos os flags. Senão, criamos
  //    a partir dos dados do registro local.
  const remoto = await db.getFirstAsync<ClienteRow>(
    `SELECT * FROM cliente WHERE cd_cliente = ? AND holding_id = ?`,
    [cdClienteRemoto, holdingId],
  );
  if (remoto) {
    await db.runAsync(
      `UPDATE cliente
         SET origem = 'remoto', pending_sync = 0, client_id = NULL
       WHERE cd_cliente = ? AND holding_id = ?`,
      [cdClienteRemoto, holdingId],
    );
  } else {
    await db.runAsync(
      `INSERT INTO cliente
         (cd_cliente, holding_id, nome, razao_social, cpf_cnpj, tp_pessoa, fone, celular, email,
          endereco, numero, bairro, cd_cidade, cep, cd_vendedor, id_ativo, raw_json,
          client_id, origem, pending_sync)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'remoto', 0)`,
      [
        cdClienteRemoto,
        holdingId,
        local.nome,
        local.razao_social,
        local.cpf_cnpj,
        local.tp_pessoa,
        local.fone,
        local.celular,
        local.email,
        local.endereco,
        local.numero,
        local.bairro,
        local.cd_cidade,
        local.cep,
        local.cd_vendedor,
        local.id_ativo,
        local.raw_json,
      ],
    );
  }

  // 3. Atualiza referências em outras tabelas (vendas/visitas pendentes ou efetivadas)
  if (cdLocal !== cdClienteRemoto) {
    await db.runAsync(
      `UPDATE outbox_venda SET cd_cliente = ? WHERE cd_cliente = ? AND holding_id = ?`,
      [cdClienteRemoto, cdLocal, holdingId],
    );
    await db.runAsync(
      `UPDATE outbox_visita SET cd_cliente = ? WHERE cd_cliente = ? AND holding_id = ?`,
      [cdClienteRemoto, cdLocal, holdingId],
    );
    await db.runAsync(
      `UPDATE visita SET cd_cliente = ? WHERE cd_cliente = ? AND holding_id = ?`,
      [cdClienteRemoto, cdLocal, holdingId],
    );

    // 4. Reescreve o JSON de payload das vendas/visitas pendentes
    const vendas = await db.getAllAsync<{ client_id: string; payload: string }>(
      `SELECT client_id, payload FROM outbox_venda WHERE cd_cliente = ? AND holding_id = ?`,
      [cdClienteRemoto, holdingId],
    );
    for (const v of vendas) {
      try {
        const parsed = JSON.parse(v.payload);
        if (parsed && typeof parsed === 'object' && parsed.cdCliente === cdLocal) {
          parsed.cdCliente = cdClienteRemoto;
          await db.runAsync(
            `UPDATE outbox_venda SET payload = ? WHERE client_id = ?`,
            [JSON.stringify(parsed), v.client_id],
          );
        }
      } catch {
        // ignora payload inválido
      }
    }

    const visitas = await db.getAllAsync<{ client_id: string; payload: string }>(
      `SELECT client_id, payload FROM outbox_visita WHERE cd_cliente = ? AND holding_id = ?`,
      [cdClienteRemoto, holdingId],
    );
    for (const v of visitas) {
      try {
        const parsed = JSON.parse(v.payload);
        if (parsed && typeof parsed === 'object' && parsed.cdCliente === cdLocal) {
          parsed.cdCliente = cdClienteRemoto;
          await db.runAsync(
            `UPDATE outbox_visita SET payload = ? WHERE client_id = ?`,
            [JSON.stringify(parsed), v.client_id],
          );
        }
      } catch {
        // ignora payload inválido
      }
    }
  }
}

/**
 * Para um cd_cliente local (negativo) retorna o `client_id` (UUID) associado.
 * Se o cliente foi criado em uma versão antiga sem `client_id`, gera um agora
 * e enfileira no `outbox_cliente`, garantindo que o próximo upload o sincronize.
 */
export async function ensureClienteOutbox(
  cdClienteLocal: number,
  holdingId: number,
): Promise<string | null> {
  if (cdClienteLocal > 0) return null; // já é remoto

  const db = await getDb();
  const cli = await db.getFirstAsync<ClienteRow>(
    `SELECT * FROM cliente WHERE cd_cliente = ? AND holding_id = ?`,
    [cdClienteLocal, holdingId],
  );
  if (!cli) return null;

  let clientId = cli.client_id ?? null;
  if (!clientId) {
    clientId = uuidv4();
    await db.runAsync(
      `UPDATE cliente
         SET client_id = ?, origem = 'local', pending_sync = 1
       WHERE cd_cliente = ? AND holding_id = ?`,
      [clientId, cdClienteLocal, holdingId],
    );
  }

  // Garante entrada no outbox (idempotente — INSERT OR REPLACE)
  await enqueueCliente({
    clientId,
    cdClienteLocal,
    holdingId,
    payload: buildClientePayload(cdClienteLocal, holdingId, clientId, {
      nome: cli.nome ?? '',
      razao_social: cli.razao_social,
      cpf_cnpj: cli.cpf_cnpj,
      tp_pessoa: (cli.tp_pessoa as 'F' | 'J' | null) ?? 'F',
      fone: cli.fone,
      celular: cli.celular,
      email: cli.email,
      endereco: cli.endereco,
      numero: cli.numero,
      bairro: cli.bairro,
      cd_cidade: cli.cd_cidade,
      cep: cli.cep,
    }),
  });

  return clientId;
}

/**
 * Limpeza preventiva: clientes locais cujo upload já foi concluído com sucesso
 * (existe um registro em `outbox_cliente` com status 'sent' e cd_cliente_remoto)
 * mas que ainda aparecem como pendentes na tabela `cliente`. Útil para corrigir
 * estado inconsistente herdado de versões anteriores do app.
 */
export async function reconcileClientesPendentes(): Promise<number> {
  const db = await getDb();
  const orfaos = await db.getAllAsync<{
    client_id: string;
    cd_cliente_remoto: number | null;
  }>(
    `SELECT o.client_id, o.cd_cliente_remoto
       FROM outbox_cliente o
      WHERE o.status = 'sent'
        AND o.cd_cliente_remoto IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM cliente c
           WHERE c.client_id = o.client_id
             AND c.origem = 'local'
             AND c.pending_sync = 1
        )`,
  );
  for (const o of orfaos) {
    if (o.cd_cliente_remoto != null) {
      await remapClienteLocalToRemoto(o.client_id, o.cd_cliente_remoto);
    }
  }
  return orfaos.length;
}
