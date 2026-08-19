export interface SyncEntityDef {
  key: string;
  endpoint: string;
  label: string;
  paged: boolean;
  insertFn: (items: any[], holdingIdFallback?: number) => Promise<void>;
}

import { bulkInsertProdutos } from '@/db/repositories/produtos';
import { bulkInsertClientes } from '@/db/repositories/clientes';
import { bulkInsertNotas, bulkInsertTitulos } from '@/db/repositories/notas';
import { bulkInsertVisitas } from '@/db/repositories/visitas';
import { bulkInsertPrevendas } from '@/db/repositories/prevendas';
import { bulkInsertGeneric } from '@/db/repositories/auxiliares';
import {
  bulkInsertImpostos,
  bulkInsertImpostoUf,
} from '@/db/repositories/impostos';
import { bulkInsertTabelaIcms } from '@/db/repositories/tabelaIcms';
import { bulkInsertTabelaPrecoItem } from '@/db/repositories/tabelaPrecoItem';
import { bulkInsertTabelaPrecoPromocao } from '@/db/repositories/tabelaPrecoPromocao';
import { bulkInsertProdutoDesconto } from '@/db/repositories/produtoDesconto';
import { bulkInsertProdutoSeguranca } from '@/db/repositories/produtoSeguranca';
import { bulkInsertCondicaoPagtoPreco } from '@/db/repositories/condicaoPagtoPreco';
import { bulkInsertProdutoCustoVariavel } from '@/db/repositories/parametros';
import { bulkInsertEmpresas } from '@/db/repositories/empresas';

function aux(key: string) {
  return (items: any[], holdingIdFallback?: number) =>
    bulkInsertGeneric(key, items, holdingIdFallback);
}

export const SYNC_ENTITIES: SyncEntityDef[] = [
  { key: 'empresa', endpoint: 'empresa', label: 'Empresas', paged: false, insertFn: bulkInsertEmpresas },
  { key: 'marca', endpoint: 'marca', label: 'Marcas', paged: false, insertFn: aux('marca') },
  { key: 'cor', endpoint: 'cor', label: 'Cores', paged: false, insertFn: aux('cor') },
  { key: 'tamanho', endpoint: 'tamanho', label: 'Tamanhos', paged: false, insertFn: aux('tamanho') },
  { key: 'grupo-produto', endpoint: 'grupo-produto', label: 'Grupos de Produto', paged: false, insertFn: aux('grupo-produto') },
  { key: 'fornecedor', endpoint: 'fornecedor', label: 'Fornecedores', paged: false, insertFn: aux('fornecedor') },
  { key: 'categoria', endpoint: 'categoria', label: 'Categorias', paged: false, insertFn: aux('categoria') },
  { key: 'condicao-pagto', endpoint: 'condicao-pagto', label: 'Condições de Pagamento', paged: false, insertFn: aux('condicao-pagto') },
  { key: 'condicao-preco', endpoint: 'condicao-preco', label: 'Condições de Preço', paged: false, insertFn: aux('condicao-preco') },
  { key: 'forma-pagamento', endpoint: 'forma-pagamento', label: 'Formas de Pagamento', paged: false, insertFn: aux('forma-pagamento') },
  { key: 'natureza-operacao', endpoint: 'natureza-operacao', label: 'Naturezas de Operação', paged: false, insertFn: aux('natureza-operacao') },
  { key: 'tipo-venda', endpoint: 'tipo-venda', label: 'Tipos de Venda', paged: false, insertFn: aux('tipo-venda') },
  { key: 'tabela-preco', endpoint: 'tabela-preco', label: 'Tabelas de Preço', paged: false, insertFn: aux('tabela-preco') },
  { key: 'usuario-tabela-preco', endpoint: 'usuario-tabela-preco', label: 'Tabelas de Preço por Usuário', paged: false, insertFn: aux('usuario-tabela-preco') },
  { key: 'unidade', endpoint: 'unidade', label: 'Unidades', paged: false, insertFn: aux('unidade') },
  { key: 'cidade', endpoint: 'cidade', label: 'Cidades', paged: false, insertFn: aux('cidade') },
  { key: 'cliente', endpoint: 'cliente', label: 'Clientes', paged: true, insertFn: bulkInsertClientes },
  { key: 'produto', endpoint: 'produto', label: 'Produtos', paged: true, insertFn: bulkInsertProdutos },
  { key: 'nota-fiscal-saida', endpoint: 'nota-fiscal-saida', label: 'Notas Fiscais (Vendas)', paged: true, insertFn: bulkInsertNotas },
  { key: 'titulo-receber', endpoint: 'titulo-receber', label: 'Títulos a Receber', paged: true, insertFn: bulkInsertTitulos },
  { key: 'visita', endpoint: 'visita', label: 'Visitas', paged: true, insertFn: bulkInsertVisitas },
  { key: 'prevenda', endpoint: 'prevenda', label: 'Pré-vendas', paged: true, insertFn: bulkInsertPrevendas },
  // Motor de precificação
  { key: 'imposto', endpoint: 'imposto', label: 'Impostos', paged: false, insertFn: bulkInsertImpostos },
  { key: 'imposto-uf', endpoint: 'imposto-uf', label: 'Impostos por UF', paged: false, insertFn: bulkInsertImpostoUf },
  { key: 'tabela-icms', endpoint: 'tabela-icms', label: 'Tabela ICMS Origem×Destino', paged: false, insertFn: (items) => bulkInsertTabelaIcms(items) },
  { key: 'tabela-preco-item', endpoint: 'tabela-preco-item', label: 'Itens de Tabela de Preço', paged: true, insertFn: bulkInsertTabelaPrecoItem },
  { key: 'tabela-preco-promocao', endpoint: 'tabela-preco-promocao', label: 'Promoções de Tabela de Preço', paged: true, insertFn: bulkInsertTabelaPrecoPromocao },
  { key: 'produto-desconto', endpoint: 'produto-desconto', label: 'Faixas de Desconto por Produto', paged: true, insertFn: bulkInsertProdutoDesconto },
  { key: 'produto-seguranca', endpoint: 'produto-seguranca', label: 'Margens de Segurança por Produto', paged: false, insertFn: bulkInsertProdutoSeguranca },
  { key: 'condicao-pagto-preco', endpoint: 'condicao-pagto-preco', label: 'Acréscimos por Cond. Pagto/Preço', paged: false, insertFn: bulkInsertCondicaoPagtoPreco },
  { key: 'produto-custo-variavel', endpoint: 'produto-custo-variavel', label: 'Custos Variáveis (Fórmula)', paged: false, insertFn: bulkInsertProdutoCustoVariavel },
];

export const SYNC_ENTITY_KEYS = SYNC_ENTITIES.map((e) => e.key);
