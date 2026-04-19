import * as SQLite from 'expo-sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_meta (
  entity TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0,
  downloaded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS empresa (
  cd_empresa INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  nome TEXT,
  razao_social TEXT,
  cnpj TEXT,
  PRIMARY KEY (cd_empresa, holding_id)
);

CREATE TABLE IF NOT EXISTS cliente (
  cd_cliente INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  nome TEXT,
  razao_social TEXT,
  cpf_cnpj TEXT,
  tp_pessoa TEXT,
  fone TEXT,
  celular TEXT,
  email TEXT,
  endereco TEXT,
  numero TEXT,
  bairro TEXT,
  cd_cidade INTEGER,
  cep TEXT,
  cd_vendedor INTEGER,
  id_ativo INTEGER DEFAULT 1,
  raw_json TEXT,
  PRIMARY KEY (cd_cliente, holding_id)
);
CREATE INDEX IF NOT EXISTS idx_cliente_nome ON cliente(nome);

CREATE TABLE IF NOT EXISTS produto (
  cd_produto INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  referencia TEXT,
  cd_marca INTEGER,
  cd_grupo INTEGER,
  cd_fornecedor INTEGER,
  cd_unidade INTEGER,
  cd_cor INTEGER,
  cd_tamanho INTEGER,
  vl_venda REAL,
  vl_atacado REAL,
  vl_promocao REAL,
  qt_disponivel REAL,
  foto_url TEXT,
  foto_local TEXT,
  raw_json TEXT,
  PRIMARY KEY (cd_produto, holding_id)
);
CREATE INDEX IF NOT EXISTS idx_produto_descricao ON produto(descricao);
CREATE INDEX IF NOT EXISTS idx_produto_referencia ON produto(referencia);

CREATE TABLE IF NOT EXISTS marca (
  cd_marca INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_marca, holding_id)
);

CREATE TABLE IF NOT EXISTS cor (
  cd_cor INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_cor, holding_id)
);

CREATE TABLE IF NOT EXISTS tamanho (
  cd_tamanho INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_tamanho, holding_id)
);

CREATE TABLE IF NOT EXISTS grupo_produto (
  cd_grupo INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_grupo, holding_id)
);

CREATE TABLE IF NOT EXISTS fornecedor (
  cd_fornecedor INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  nome TEXT,
  razao_social TEXT,
  cnpj TEXT,
  PRIMARY KEY (cd_fornecedor, holding_id)
);

CREATE TABLE IF NOT EXISTS categoria (
  cd_categoria INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_categoria, holding_id)
);

CREATE TABLE IF NOT EXISTS condicao_pagto (
  cd_condicao INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  qt_parcelas INTEGER,
  raw_json TEXT,
  PRIMARY KEY (cd_condicao, holding_id)
);

CREATE TABLE IF NOT EXISTS condicao_preco (
  cd_condicao_preco INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  id_promocao INTEGER DEFAULT 0,
  pr_acrescimo REAL DEFAULT 0,
  pr_acrescimo_comissao REAL DEFAULT 0,
  id_tipo_acrescimo TEXT DEFAULT 'V',
  raw_json TEXT,
  PRIMARY KEY (cd_condicao_preco, holding_id)
);

CREATE TABLE IF NOT EXISTS forma_pagamento (
  cd_forma INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_forma, holding_id)
);

CREATE TABLE IF NOT EXISTS natureza_operacao (
  cd_natureza INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  raw_json TEXT,
  PRIMARY KEY (cd_natureza, holding_id)
);

CREATE TABLE IF NOT EXISTS tipo_venda (
  cd_tipo INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_tipo, holding_id)
);

CREATE TABLE IF NOT EXISTS tabela_preco (
  cd_tabela INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_tabela, holding_id)
);

CREATE TABLE IF NOT EXISTS unidade (
  cd_unidade INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  descricao TEXT,
  PRIMARY KEY (cd_unidade, holding_id)
);

CREATE TABLE IF NOT EXISTS cidade (
  cd_cidade INTEGER PRIMARY KEY,
  nome TEXT,
  cd_estado INTEGER
);

CREATE TABLE IF NOT EXISTS mensagem (
  cd_mensagem INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  titulo TEXT,
  mensagem TEXT,
  dt_envio TEXT,
  PRIMARY KEY (cd_mensagem, holding_id)
);

CREATE TABLE IF NOT EXISTS nota_fiscal_saida (
  cd_nota INTEGER NOT NULL,
  cd_empresa INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  cd_cliente INTEGER,
  dt_emissao TEXT,
  vl_total REAL,
  raw_json TEXT,
  PRIMARY KEY (cd_nota, cd_empresa, holding_id)
);
CREATE INDEX IF NOT EXISTS idx_nfs_cliente ON nota_fiscal_saida(cd_cliente, holding_id);

CREATE TABLE IF NOT EXISTS titulo_receber (
  cd_titulo INTEGER NOT NULL,
  cd_empresa INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  cd_cliente INTEGER,
  dt_emissao TEXT,
  dt_vencimento TEXT,
  vl_titulo REAL,
  vl_pago REAL,
  raw_json TEXT,
  PRIMARY KEY (cd_titulo, cd_empresa, holding_id)
);
CREATE INDEX IF NOT EXISTS idx_titulo_cliente ON titulo_receber(cd_cliente, holding_id);

CREATE TABLE IF NOT EXISTS visita (
  cd_visita INTEGER,
  cd_empresa INTEGER,
  holding_id INTEGER,
  cd_cliente INTEGER NOT NULL,
  cd_vendedor INTEGER NOT NULL,
  dt_visita TEXT NOT NULL,
  id_comprou INTEGER DEFAULT 0,
  motivo_nao_comprou TEXT,
  observacao TEXT,
  latitude REAL,
  longitude REAL,
  client_id TEXT UNIQUE,
  origem TEXT DEFAULT 'remoto'
);
CREATE INDEX IF NOT EXISTS idx_visita_cliente ON visita(cd_cliente, holding_id);

-- Outboxes (pendentes de upload)
CREATE TABLE IF NOT EXISTS outbox_venda (
  client_id TEXT PRIMARY KEY,
  cd_cliente INTEGER NOT NULL,
  cd_empresa INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  vl_total REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  cd_prevenda INTEGER
);

CREATE TABLE IF NOT EXISTS outbox_visita (
  client_id TEXT PRIMARY KEY,
  cd_cliente INTEGER NOT NULL,
  cd_empresa INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS outbox_cliente (
  client_id TEXT PRIMARY KEY,
  cd_cliente_local INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  cd_cliente_remoto INTEGER
);
`;

interface ColumnInfo {
  name: string;
}

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  ddl: string,
) {
  const cols = await db.getAllAsync<ColumnInfo>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
  }
}

export async function runMigrations(db: SQLite.SQLiteDatabase) {
  await db.execAsync(SCHEMA);
  // Migrações aditivas idempotentes para clientes locais
  await ensureColumn(db, 'cliente', 'client_id', 'client_id TEXT');
  await ensureColumn(db, 'cliente', 'origem', "origem TEXT DEFAULT 'remoto'");
  await ensureColumn(
    db,
    'cliente',
    'pending_sync',
    'pending_sync INTEGER DEFAULT 0',
  );
  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cliente_client_id ON cliente(client_id) WHERE client_id IS NOT NULL;`,
  );
}

const TABLES = [
  'sync_meta',
  'empresa',
  'cliente',
  'produto',
  'marca',
  'cor',
  'tamanho',
  'grupo_produto',
  'fornecedor',
  'categoria',
  'condicao_pagto',
  'condicao_preco',
  'forma_pagamento',
  'natureza_operacao',
  'tipo_venda',
  'tabela_preco',
  'unidade',
  'cidade',
  'mensagem',
  'nota_fiscal_saida',
  'titulo_receber',
  'visita',
];

export async function clearSyncTables(db: SQLite.SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    for (const t of TABLES) {
      if (t === 'cliente') {
        // Preserva clientes cadastrados offline ainda não sincronizados
        await db.execAsync(
          `DELETE FROM cliente WHERE origem IS NULL OR origem <> 'local' OR pending_sync = 0;`,
        );
      } else {
        await db.execAsync(`DELETE FROM ${t};`);
      }
    }
  });
}
