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
      { from: 'cdEstado', to: 'cd_estado' },
      { from: 'cdTabelaPrecoPadrao', to: 'cd_tabela_preco_padrao' },
      { from: 'idDestacaIpi', to: 'id_destaca_ipi' },
      { from: 'idSubstitutoTributarioIcms', to: 'id_substituto_tributario_icms' },
      {
        from: 'idCalculaSubstituicaoTributariaSempre',
        to: 'id_calcula_substituicao_tributaria_sempre',
      },
      {
        from: 'idRegimeUtilizaReducaoBaseSubstituicao',
        to: 'id_regime_utiliza_reducao_base_substituicao',
      },
      { from: 'idUtilizaMvaExternoVenda', to: 'id_utiliza_mva_externo_venda' },
      { from: 'idUtilizaStDiferencaIcms', to: 'id_utiliza_st_diferenca_icms' },
      {
        from: 'idUtilizaReducaoIcmsForaEstado',
        to: 'id_utiliza_reducao_icms_fora_estado',
      },
      {
        from: 'prIcmsProdutoImportadoCompraVendaForaEstado',
        to: 'pr_icms_produto_importado_compra_venda_fora_estado',
      },
      {
        from: 'idUtilizaDescontoCreditoSubstituicaoVenda',
        to: 'id_utiliza_desconto_credito_substituicao_venda',
      },
      {
        from: 'idUtilizaDescontoPromocaoPedidoVenda',
        to: 'id_utiliza_desconto_promocao_pedido_venda',
      },
      {
        from: 'idUtilizaPromocaoPorTabelaPreco',
        to: 'id_utiliza_promocao_por_tabela_preco',
      },
      {
        from: 'idUtilizaCondicaoPagtoLigacaoCondicaoPreco',
        to: 'id_utiliza_condicao_pagto_ligacao_condicao_preco',
      },
      {
        from: 'idEmpresaUtilizaAcrescimoCondicaoPagto',
        to: 'id_empresa_utiliza_acrescimo_condicao_pagto',
      },
      {
        from: 'idProdutoControleVariacaoPreco',
        to: 'id_produto_controle_variacao_preco',
      },
      { from: 'prMargemLucroMinimo', to: 'pr_margem_lucro_minimo' },
      { from: 'nrCasaDecimalValorVenda', to: 'nr_casa_decimal_valor_venda' },
      {
        from: 'idBloqueiaAlteracaoPrecoTablet',
        to: 'id_bloqueia_alteracao_preco_tablet',
      },
      {
        from: 'idIgnoraTabelaPrecoClienteTablet',
        to: 'id_ignora_tabela_preco_cliente_tablet',
      },
      {
        from: 'idAlteraTabelaPrecoTablet',
        to: 'id_altera_tabela_preco_tablet',
      },
      {
        from: 'idPermiteAlterarValorProdutoPalm',
        to: 'id_permite_alterar_valor_produto_palm',
      },
      { from: 'dsFuncaoCalculoPrecoVenda', to: 'ds_funcao_calculo_preco_venda' },
      {
        from: 'dsFuncaoCalculoMargemLucro',
        to: 'ds_funcao_calculo_margem_lucro',
      },
      { from: 'idCustoAgregado', to: 'id_custo_agregado' },
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
      { from: 'prAcrescimo', to: 'pr_acrescimo' },
      { from: 'prDesconto', to: 'pr_desconto' },
    ],
  },
  'condicao-preco': {
    table: 'condicao_preco',
    pk: ['cd_condicao_preco', 'holding_id'],
    needsHolding: true,
    raw: true,
    columns: [
      { from: 'cdCondicaoPreco', to: 'cd_condicao_preco' },
      { from: 'holdingId', to: 'holding_id' },
      { from: ['dsCondicaoPreco', 'descricao'], to: 'descricao' },
      { from: 'idPromocao', to: 'id_promocao' },
      { from: 'prAcrescimo', to: 'pr_acrescimo' },
      { from: 'prAcrescimoComissao', to: 'pr_acrescimo_comissao' },
      { from: 'idTipoAcrescimo', to: 'id_tipo_acrescimo' },
      { from: 'idUltimaVenda', to: 'id_ultima_venda' },
      { from: 'vlValor', to: 'vl_valor' },
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
