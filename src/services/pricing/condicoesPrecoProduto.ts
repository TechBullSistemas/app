import type {
  CondicaoPrecoEngine,
  ContextoCalculoItem,
  ProdutoEngine,
  TabelaPrecoItemEngine,
} from './types';
import { calcularItem } from '.';
import {
  isCondicaoPrecoPromocao,
  listCondicoesPreco,
} from '@/db/repositories/condicaoPreco';

export interface CondicaoPrecoOpt {
  cdCondicaoPreco: number;
  descricao: string;
  idPromocao: boolean;
  idUltimaVenda: boolean;
  prAcrescimo: number;
  vlValor: number;
}

/**
 * Calcula a lista de condições de preço aplicáveis a um produto.
 * Espelha o comportamento do legado em `PedidoTabActivity.calculaInformacoes_*`,
 * onde para cada Condicao_Preco da holding o app determina o `vl_valor`
 * (preço resultante daquele cenário) executando o pipeline completo.
 *
 * Importante: usa o mesmo orquestrador (`calcularItem`) que o `useEffect`
 * de pricing — assim o `vlValor` listado no dropdown é IDÊNTICO ao preço
 * que o motor aplica quando a condição é selecionada (se não fosse, o
 * vendedor veria um preço no select e outro no item).
 */
export async function listarCondicoesPrecoProduto(params: {
  produto: ProdutoEngine;
  contexto: Omit<ContextoCalculoItem, 'condicaoPreco'>;
  precoTabela: TabelaPrecoItemEngine | null;
  qt: number;
  holdingId: number;
}): Promise<CondicaoPrecoOpt[]> {
  const condicoes = await listCondicoesPreco(params.holdingId);
  const out: CondicaoPrecoOpt[] = [];
  for (const c of condicoes) {
    const cdEng: CondicaoPrecoEngine = {
      cdCondicaoPreco: c.cd_condicao_preco,
      idPromocao: isCondicaoPrecoPromocao(c.id_promocao),
      prAcrescimo: Number(c.pr_acrescimo ?? 0),
      prAcrescimoComissao: Number(c.pr_acrescimo_comissao ?? 0),
      idTipoAcrescimo: (c.id_tipo_acrescimo ?? 'V') as 'V' | 'N',
      idUltimaVenda: (c.id_ultima_venda ?? 0) > 0,
      vlValor: Number(c.vl_valor ?? 0),
    };
    // Cada iteração precisa de seu próprio contexto: `calcularItem` muta o
    // contexto recebido (preenche prIcmsSaida, impostoUf, etc.). Se
    // partilhássemos a mesma instância entre condições, valores resolvidos
    // numa iteração vazariam para a seguinte.
    const ctx: ContextoCalculoItem = {
      ...params.contexto,
      cdCondicaoPreco: cdEng.cdCondicaoPreco,
      condicaoPreco: cdEng,
      condicaoPagtoPreco: null,
    };
    const r = await calcularItem({
      produto: params.produto,
      qt: params.qt,
      contexto: ctx,
      precoTabela: params.precoTabela,
      holdingId: params.holdingId,
    });
    out.push({
      cdCondicaoPreco: cdEng.cdCondicaoPreco,
      descricao: c.descricao ?? `Condição #${c.cd_condicao_preco}`,
      idPromocao: cdEng.idPromocao,
      idUltimaVenda: cdEng.idUltimaVenda,
      prAcrescimo: cdEng.prAcrescimo,
      vlValor: r.vlUnitario,
    });
  }
  return out;
}
