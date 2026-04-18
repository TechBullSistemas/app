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
import { bulkInsertGeneric } from '@/db/repositories/auxiliares';

function aux(key: string) {
  return (items: any[], holdingIdFallback?: number) =>
    bulkInsertGeneric(key, items, holdingIdFallback);
}

export const SYNC_ENTITIES: SyncEntityDef[] = [
  { key: 'empresa', endpoint: 'empresa', label: 'Empresas', paged: false, insertFn: aux('empresa') },
  { key: 'marca', endpoint: 'marca', label: 'Marcas', paged: false, insertFn: aux('marca') },
  { key: 'cor', endpoint: 'cor', label: 'Cores', paged: false, insertFn: aux('cor') },
  { key: 'tamanho', endpoint: 'tamanho', label: 'Tamanhos', paged: false, insertFn: aux('tamanho') },
  { key: 'grupo-produto', endpoint: 'grupo-produto', label: 'Grupos de Produto', paged: false, insertFn: aux('grupo-produto') },
  { key: 'fornecedor', endpoint: 'fornecedor', label: 'Fornecedores', paged: false, insertFn: aux('fornecedor') },
  { key: 'categoria', endpoint: 'categoria', label: 'Categorias', paged: false, insertFn: aux('categoria') },
  { key: 'condicao-pagto', endpoint: 'condicao-pagto', label: 'Condições de Pagamento', paged: false, insertFn: aux('condicao-pagto') },
  { key: 'forma-pagamento', endpoint: 'forma-pagamento', label: 'Formas de Pagamento', paged: false, insertFn: aux('forma-pagamento') },
  { key: 'natureza-operacao', endpoint: 'natureza-operacao', label: 'Naturezas de Operação', paged: false, insertFn: aux('natureza-operacao') },
  { key: 'tipo-venda', endpoint: 'tipo-venda', label: 'Tipos de Venda', paged: false, insertFn: aux('tipo-venda') },
  { key: 'tabela-preco', endpoint: 'tabela-preco', label: 'Tabelas de Preço', paged: false, insertFn: aux('tabela-preco') },
  { key: 'unidade', endpoint: 'unidade', label: 'Unidades', paged: false, insertFn: aux('unidade') },
  { key: 'cidade', endpoint: 'cidade', label: 'Cidades', paged: false, insertFn: aux('cidade') },
  { key: 'mensagem', endpoint: 'mensagem', label: 'Mensagens', paged: false, insertFn: aux('mensagem') },
  { key: 'cliente', endpoint: 'cliente', label: 'Clientes', paged: true, insertFn: bulkInsertClientes },
  { key: 'produto', endpoint: 'produto', label: 'Produtos', paged: true, insertFn: bulkInsertProdutos },
  { key: 'nota-fiscal-saida', endpoint: 'nota-fiscal-saida', label: 'Notas Fiscais (Vendas)', paged: true, insertFn: bulkInsertNotas },
  { key: 'titulo-receber', endpoint: 'titulo-receber', label: 'Títulos a Receber', paged: true, insertFn: bulkInsertTitulos },
  { key: 'visita', endpoint: 'visita', label: 'Visitas', paged: true, insertFn: bulkInsertVisitas },
];

export const SYNC_ENTITY_KEYS = SYNC_ENTITIES.map((e) => e.key);
