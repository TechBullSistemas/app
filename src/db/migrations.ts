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
  pr_acrescimo REAL DEFAULT 0,
  pr_desconto REAL DEFAULT 0,
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

-- ============================================================================
-- Motor de precificação mobile (port das regras do app legado Duapi)
-- ============================================================================

CREATE TABLE IF NOT EXISTS imposto (
  cd_imposto INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  ds_imposto TEXT,
  PRIMARY KEY (cd_imposto, holding_id)
);

CREATE TABLE IF NOT EXISTS imposto_uf (
  cd_imposto INTEGER NOT NULL,
  cd_estado TEXT NOT NULL,
  holding_id INTEGER NOT NULL,
  pr_icms_interno REAL DEFAULT 0,
  pr_icms_interno_revenda REAL DEFAULT 0,
  pr_icms_interno_industria REAL DEFAULT 0,
  pr_icms_externo REAL DEFAULT 0,
  pr_base_substituicao_interno REAL DEFAULT 0,
  pr_base_substituicao_externo REAL DEFAULT 0,
  pr_reducao_base_substituicao_interno REAL DEFAULT 0,
  pr_reducao_base_substituicao_externo REAL DEFAULT 0,
  pr_reducao_icms_interno REAL DEFAULT 0,
  pr_reducao_icms_externo REAL DEFAULT 0,
  pr_pis REAL DEFAULT 0,
  pr_cofins REAL DEFAULT 0,
  pr_fcp REAL DEFAULT 0,
  pr_fcp_st REAL DEFAULT 0,
  PRIMARY KEY (cd_imposto, cd_estado, holding_id)
);

CREATE TABLE IF NOT EXISTS tabela_icms (
  cd_estado_origem TEXT NOT NULL,
  cd_estado_destino TEXT NOT NULL,
  pr_icms REAL DEFAULT 0,
  id_st_diferenca_icms TEXT DEFAULT 'N',
  PRIMARY KEY (cd_estado_origem, cd_estado_destino)
);

CREATE TABLE IF NOT EXISTS tabela_preco_item (
  cd_tabela_preco INTEGER NOT NULL,
  cd_produto INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  vl_venda REAL DEFAULT 0,
  vl_venda_atacado REAL DEFAULT 0,
  vl_promocao REAL DEFAULT 0,
  vl_promocao_aprazo REAL DEFAULT 0,
  dt_promocao_inicio TEXT,
  dt_promocao_fim TEXT,
  vl_custo REAL DEFAULT 0,
  pr_ipi REAL DEFAULT 0,
  pr_desconto REAL DEFAULT 0,
  pr_substituicao REAL DEFAULT 0,
  pr_margem_lucro REAL DEFAULT 0,
  pr_margem_extra REAL DEFAULT 0,
  pr_acrescimo_financeiro REAL DEFAULT 0,
  vl_custo_substituicao REAL DEFAULT 0,
  vl_icms_substituicao REAL DEFAULT 0,
  vl_custo_importacao REAL DEFAULT 0,
  vl_custo_contabil REAL DEFAULT 0,
  vl_aquisicao REAL DEFAULT 0,
  vl_bonificacao REAL DEFAULT 0,
  vl_custo_contabil_nf REAL DEFAULT 0,
  vl_custo_contabil_medio REAL DEFAULT 0,
  pr_pis_saida REAL DEFAULT 0,
  pr_cofins_saida REAL DEFAULT 0,
  PRIMARY KEY (cd_tabela_preco, cd_produto, holding_id)
);
CREATE INDEX IF NOT EXISTS idx_tpi_produto ON tabela_preco_item(cd_produto, holding_id);

CREATE TABLE IF NOT EXISTS produto_desconto (
  cd_produto INTEGER NOT NULL,
  nr_item INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  qt_produto_inicio REAL DEFAULT 0,
  qt_produto_fim REAL DEFAULT 0,
  pr_desconto REAL DEFAULT 0,
  PRIMARY KEY (cd_produto, nr_item, holding_id)
);
CREATE INDEX IF NOT EXISTS idx_pd_produto ON produto_desconto(cd_produto, holding_id);

CREATE TABLE IF NOT EXISTS condicao_pagto_preco (
  cd_condicao_pagto INTEGER NOT NULL,
  cd_tabela_preco_condicao INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  pr_acrescimo REAL DEFAULT 0,
  pr_comissao REAL DEFAULT 0,
  id_entra_pauta TEXT DEFAULT 'N',
  nr_ordem_pauta INTEGER DEFAULT 0,
  PRIMARY KEY (cd_condicao_pagto, cd_tabela_preco_condicao, holding_id)
);

CREATE TABLE IF NOT EXISTS representante_saldo_flex (
  cd_representante INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  vl_saldo_flex REAL DEFAULT 0,
  dt_manutencao TEXT,
  PRIMARY KEY (cd_representante, holding_id)
);

CREATE TABLE IF NOT EXISTS flex_movto (
  nr_movto INTEGER PRIMARY KEY AUTOINCREMENT,
  cd_empresa INTEGER NOT NULL,
  nr_prevenda INTEGER NOT NULL,
  id_origem TEXT DEFAULT 'V',
  cd_representante INTEGER NOT NULL,
  cd_produto INTEGER,
  dt_movto TEXT,
  id_operacao TEXT DEFAULT 'D',
  vl_movto REAL DEFAULT 0,
  id_tipo TEXT DEFAULT 'N',
  holding_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS produto_custo_variavel (
  cd_empresa INTEGER NOT NULL,
  nm_variavel TEXT NOT NULL,
  holding_id INTEGER NOT NULL,
  pr_variavel REAL DEFAULT 0,
  id_utilizacao TEXT DEFAULT 'F',
  PRIMARY KEY (cd_empresa, nm_variavel, holding_id)
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

  // Cliente: tabela de preço preferencial usada pelo motor de precificação.
  await ensureColumn(db, 'cliente', 'cd_tabela_preco', 'cd_tabela_preco INTEGER');
  // Cliente: condição de pagamento padrão para pré-selecionar no pedido.
  await ensureColumn(
    db,
    'cliente',
    'cd_condicao_pagto',
    'cd_condicao_pagto INTEGER',
  );
  // Cliente: tipo de cliente para venda (C=consumo, I=indústria, R=revenda).
  // Utilizado pelo motor para escolher a alíquota de ICMS interno correta
  // em `imposto_uf` (pr_icms_interno_revenda / pr_icms_interno_industria).
  await ensureColumn(
    db,
    'cliente',
    'tp_cliente_venda',
    "tp_cliente_venda TEXT DEFAULT 'C'",
  );

  // ImpostoUf: alíquotas de ICMS interno por tipo de cliente. Quando o
  // valor estiver zero o motor faz fallback para `pr_icms_interno`.
  await ensureColumn(
    db,
    'imposto_uf',
    'pr_icms_interno_revenda',
    'pr_icms_interno_revenda REAL DEFAULT 0',
  );
  await ensureColumn(
    db,
    'imposto_uf',
    'pr_icms_interno_industria',
    'pr_icms_interno_industria REAL DEFAULT 0',
  );

  // CondicaoPagto: porta `pr_desconto` e `pr_acrescimo` para uso direto no
  // pipeline de preço (legado: `cliente_condicao_pagto.getPr_desconto()`
  // entra como subtração após o acréscimo da condição de preço).
  await ensureColumn(
    db,
    'condicao_pagto',
    'pr_acrescimo',
    'pr_acrescimo REAL DEFAULT 0',
  );
  await ensureColumn(
    db,
    'condicao_pagto',
    'pr_desconto',
    'pr_desconto REAL DEFAULT 0',
  );

  // Empresa: flags do motor de precificação + UF + fórmulas dinâmicas.
  await ensureColumn(db, 'empresa', 'cd_estado', 'cd_estado TEXT');
  await ensureColumn(
    db,
    'empresa',
    'cd_tabela_preco_padrao',
    'cd_tabela_preco_padrao INTEGER',
  );
  const empresaFlags: Array<[string, string]> = [
    ['id_destaca_ipi', "id_destaca_ipi TEXT DEFAULT 'N'"],
    ['id_substituto_tributario_icms', "id_substituto_tributario_icms TEXT DEFAULT 'N'"],
    [
      'id_calcula_substituicao_tributaria_sempre',
      "id_calcula_substituicao_tributaria_sempre TEXT DEFAULT 'N'",
    ],
    [
      'id_regime_utiliza_reducao_base_substituicao',
      "id_regime_utiliza_reducao_base_substituicao TEXT DEFAULT 'N'",
    ],
    ['id_utiliza_mva_externo_venda', "id_utiliza_mva_externo_venda TEXT DEFAULT 'N'"],
    ['id_utiliza_st_diferenca_icms', "id_utiliza_st_diferenca_icms TEXT DEFAULT 'N'"],
    [
      'id_utiliza_reducao_icms_fora_estado',
      "id_utiliza_reducao_icms_fora_estado TEXT DEFAULT 'N'",
    ],
    [
      'pr_icms_produto_importado_compra_venda_fora_estado',
      'pr_icms_produto_importado_compra_venda_fora_estado REAL DEFAULT 0',
    ],
    [
      'id_utiliza_desconto_credito_substituicao_venda',
      "id_utiliza_desconto_credito_substituicao_venda TEXT DEFAULT 'N'",
    ],
    [
      'id_utiliza_desconto_promocao_pedido_venda',
      "id_utiliza_desconto_promocao_pedido_venda TEXT DEFAULT 'N'",
    ],
    [
      'id_utiliza_promocao_por_tabela_preco',
      "id_utiliza_promocao_por_tabela_preco TEXT DEFAULT 'N'",
    ],
    [
      'id_utiliza_condicao_pagto_ligacao_condicao_preco',
      "id_utiliza_condicao_pagto_ligacao_condicao_preco TEXT DEFAULT 'N'",
    ],
    [
      'id_empresa_utiliza_acrescimo_condicao_pagto',
      "id_empresa_utiliza_acrescimo_condicao_pagto TEXT DEFAULT 'S'",
    ],
    [
      'id_produto_controle_variacao_preco',
      "id_produto_controle_variacao_preco TEXT DEFAULT 'D'",
    ],
    ['pr_margem_lucro_minimo', 'pr_margem_lucro_minimo REAL DEFAULT 0'],
    ['nr_casa_decimal_valor_venda', 'nr_casa_decimal_valor_venda INTEGER DEFAULT 2'],
    [
      'id_bloqueia_alteracao_preco_tablet',
      "id_bloqueia_alteracao_preco_tablet TEXT DEFAULT 'N'",
    ],
    [
      'id_ignora_tabela_preco_cliente_tablet',
      "id_ignora_tabela_preco_cliente_tablet TEXT DEFAULT 'N'",
    ],
    [
      'id_permite_alterar_valor_produto_palm',
      "id_permite_alterar_valor_produto_palm TEXT DEFAULT 'S'",
    ],
    [
      'id_altera_tabela_preco_tablet',
      "id_altera_tabela_preco_tablet TEXT DEFAULT 'N'",
    ],
    ['ds_funcao_calculo_preco_venda', 'ds_funcao_calculo_preco_venda TEXT'],
    ['ds_funcao_calculo_margem_lucro', 'ds_funcao_calculo_margem_lucro TEXT'],
    ['id_custo_agregado', "id_custo_agregado TEXT DEFAULT 'N'"],
  ];
  for (const [name, ddl] of empresaFlags) {
    await ensureColumn(db, 'empresa', name, ddl);
  }

  // Produto: campos novos do motor de precificação.
  const produtoCols: Array<[string, string]> = [
    ['cd_imposto', 'cd_imposto INTEGER'],
    ['pr_ipi', 'pr_ipi REAL DEFAULT 0'],
    ['id_origem_produto', "id_origem_produto TEXT DEFAULT '0'"],
    ['vl_credito_substituicao', 'vl_credito_substituicao REAL DEFAULT 0'],
    ['id_gera_flex', "id_gera_flex TEXT DEFAULT 'S'"],
    ['pr_margem_substituicao', 'pr_margem_substituicao REAL DEFAULT 0'],
    ['pr_reducao_icms', 'pr_reducao_icms REAL DEFAULT 0'],
    ['cd_classificacao_fiscal', 'cd_classificacao_fiscal TEXT'],
    // Espelho de cd_situacao_tributaria do produto (usado pela engine fiscal)
    ['cd_situacao_tributaria', 'cd_situacao_tributaria TEXT'],
    ['vl_custo', 'vl_custo REAL DEFAULT 0'],
    ['pr_comissao', 'pr_comissao REAL DEFAULT 0'],
  ];
  for (const [name, ddl] of produtoCols) {
    await ensureColumn(db, 'produto', name, ddl);
  }

  // CondicaoPreco: caso especial "última venda".
  await ensureColumn(
    db,
    'condicao_preco',
    'id_ultima_venda',
    'id_ultima_venda INTEGER DEFAULT 0',
  );
  await ensureColumn(db, 'condicao_preco', 'vl_valor', 'vl_valor REAL DEFAULT 0');

  // TabelaPrecoItem: campos de custo expostos à fórmula dinâmica.
  const tpiCols: Array<[string, string]> = [
    ['vl_custo_substituicao', 'vl_custo_substituicao REAL DEFAULT 0'],
    ['vl_icms_substituicao', 'vl_icms_substituicao REAL DEFAULT 0'],
    ['vl_custo_importacao', 'vl_custo_importacao REAL DEFAULT 0'],
    ['vl_custo_contabil', 'vl_custo_contabil REAL DEFAULT 0'],
    ['vl_aquisicao', 'vl_aquisicao REAL DEFAULT 0'],
    ['vl_bonificacao', 'vl_bonificacao REAL DEFAULT 0'],
    ['vl_custo_contabil_nf', 'vl_custo_contabil_nf REAL DEFAULT 0'],
    ['vl_custo_contabil_medio', 'vl_custo_contabil_medio REAL DEFAULT 0'],
    ['pr_pis_saida', 'pr_pis_saida REAL DEFAULT 0'],
    ['pr_cofins_saida', 'pr_cofins_saida REAL DEFAULT 0'],
  ];
  for (const [name, ddl] of tpiCols) {
    await ensureColumn(db, 'tabela_preco_item', name, ddl);
  }
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
  // Motor de precificação
  'imposto',
  'imposto_uf',
  'tabela_icms',
  'tabela_preco_item',
  'produto_desconto',
  'condicao_pagto_preco',
  'representante_saldo_flex',
  'flex_movto',
  'produto_custo_variavel',
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
