import { getDb } from '../database';

interface MapDef {
  table: string;
  pk: string[];
  columns: { from: string | string[]; to: string }[];
  raw?: boolean;
  needsHolding?: boolean;
}

const MAPS: Record<string, MapDef> = {
  empresa: {
    table: 'empresa',
    pk: ['cd_empresa', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdEmpresa', to: 'cd_empresa' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['nmEmpresa', 'nome', 'nmReduzido'], to: 'nome' },
      { from: ['razaoSocial', 'nmEmpresa'], to: 'razao_social' },
      { from: 'cnpj', to: 'cnpj' },
    ],
  },
  marca: {
    table: 'marca',
    pk: ['cd_marca', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdMarca', to: 'cd_marca' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsMarca', 'descricao'], to: 'descricao' },
    ],
  },
  cor: {
    table: 'cor',
    pk: ['cd_cor', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdCor', to: 'cd_cor' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsCor', 'descricao'], to: 'descricao' },
    ],
  },
  tamanho: {
    table: 'tamanho',
    pk: ['cd_tamanho', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdTamanho', to: 'cd_tamanho' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsTamanho', 'descricao'], to: 'descricao' },
    ],
  },
  'grupo-produto': {
    table: 'grupo_produto',
    pk: ['cd_grupo', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdGrupo', to: 'cd_grupo' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsGrupo', 'descricao'], to: 'descricao' },
    ],
  },
  fornecedor: {
    table: 'fornecedor',
    pk: ['cd_fornecedor', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdFornecedor', to: 'cd_fornecedor' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['nmFornecedor', 'nome'], to: 'nome' },
      { from: 'razaoSocial', to: 'razao_social' },
      { from: 'cnpj', to: 'cnpj' },
    ],
  },
  categoria: {
    table: 'categoria',
    pk: ['cd_categoria', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdCategoria', to: 'cd_categoria' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsCategoria', 'descricao'], to: 'descricao' },
    ],
  },
  'condicao-pagto': {
    table: 'condicao_pagto',
    pk: ['cd_condicao', 'holding_id'],
    needsHolding: true,
    raw: true,
    columns: [
      { from: ['cdCondicaoPagto', 'cdCondicao'], to: 'cd_condicao' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsCondicaoPagto', 'descricao'], to: 'descricao' },
      { from: ['nrParcelas', 'qtParcelas'], to: 'qt_parcelas' },
    ],
  },
  'forma-pagamento': {
    table: 'forma_pagamento',
    pk: ['cd_forma', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: ['cdFormaPagamento', 'cdForma'], to: 'cd_forma' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsFormaPagamento', 'descricao'], to: 'descricao' },
    ],
  },
  'natureza-operacao': {
    table: 'natureza_operacao',
    pk: ['cd_natureza', 'holding_id'],
    needsHolding: true,
    raw: true,
    columns: [
      { from: 'cdNatureza', to: 'cd_natureza' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsNatureza', 'descricao'], to: 'descricao' },
    ],
  },
  'tipo-venda': {
    table: 'tipo_venda',
    pk: ['cd_tipo', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: ['cdTipoVenda', 'cdTipo'], to: 'cd_tipo' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsTipoVenda', 'descricao'], to: 'descricao' },
    ],
  },
  'tabela-preco': {
    table: 'tabela_preco',
    pk: ['cd_tabela', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: ['cdTabelaPreco', 'cdTabela'], to: 'cd_tabela' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsTabelaPreco', 'descricao'], to: 'descricao' },
    ],
  },
  unidade: {
    table: 'unidade',
    pk: ['cd_unidade', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: 'cdUnidade', to: 'cd_unidade' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsUnidade', 'descricao'], to: 'descricao' },
    ],
  },
  cidade: {
    table: 'cidade',
    pk: ['cd_cidade'],
    columns: [
      { from: ['cdCidadeIbge', 'cdCidade'], to: 'cd_cidade' },
      { from: ['nmCidade', 'nome'], to: 'nome' },
      { from: 'cdEstado', to: 'cd_estado' },
    ],
  },
  mensagem: {
    table: 'mensagem',
    pk: ['cd_mensagem', 'holding_id'],
    needsHolding: true,
    columns: [
      { from: ['id', 'cdMensagem'], to: 'cd_mensagem' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['titulo'], to: 'titulo' },
      { from: ['dsMensagem', 'mensagem'], to: 'mensagem' },
      { from: ['dtCriacao', 'dtEnvio'], to: 'dt_envio' },
    ],
  },
};

function pick(it: any, from: string | string[]): any {
  if (Array.isArray(from)) {
    for (const k of from) {
      const v = it?.[k];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  }
  return it?.[from] ?? null;
}

export async function bulkInsertGeneric(
  entityKey: string,
  items: any[],
  holdingIdFallback?: number,
) {
  const map = MAPS[entityKey];
  if (!map) {
    console.warn('Entity sem mapeamento:', entityKey);
    return;
  }
  if (!items.length) return;
  const db = await getDb();
  const colsList = map.columns.map((c) => c.to);
  if (map.raw) colsList.push('raw_json');
  const placeholders = colsList.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${map.table} (${colsList.join(', ')}) VALUES (${placeholders})`;
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const params: any[] = map.columns.map((c) => {
        let v = pick(it, c.from);
        if (c.to === 'holding_id' && (v == null) && map.needsHolding) {
          v = holdingIdFallback ?? null;
        }
        if (v instanceof Date) return v.toISOString();
        return v ?? null;
      });
      if (map.raw) params.push(JSON.stringify(it));
      await db.runAsync(sql, params);
    }
  });
}

export async function listMensagens(): Promise<any[]> {
  const db = await getDb();
  return db.getAllAsync<any>('SELECT * FROM mensagem ORDER BY dt_envio DESC');
}
