import { getDb } from '@/db/database';
import { getClienteById } from '@/db/repositories/clientes';
import type { PedidoPdfData } from './types';

export function parseJson(value?: string | null): Record<string, any> {
  try {
    return value ? (JSON.parse(value) ?? {}) : {};
  } catch {
    return {};
  }
}

export function codigoComDescricao(
  codigo: number | null | undefined,
  descricao?: string | null,
) {
  return [codigo, descricao]
    .filter((v) => v !== null && v !== undefined && v !== '')
    .join(' - ');
}

export async function complementarPedidoPdf(
  p: PedidoPdfData,
): Promise<PedidoPdfData> {
  if (p.holdingId == null)
    return { ...p, itens: p.itens.map((it) => ({ ...it })) };
  const db = await getDb();
  const holdingId = p.holdingId;
  const ids = [...new Set(p.itens.map((it) => it.cdProduto))];
  const [cliente, produtos, tabela, condicao, tipo] = await Promise.all([
    p.cdCliente != null ? getClienteById(p.cdCliente, holdingId) : null,
    ids.length
      ? db.getAllAsync<{
          cd_produto: number;
          foto_local: string | null;
          raw_json: string | null;
        }>(
          'SELECT cd_produto, foto_local, raw_json FROM produto WHERE holding_id = ? AND cd_produto IN (SELECT value FROM json_each(?))',
          [holdingId, JSON.stringify(ids)],
        )
      : [],
    db.getFirstAsync<{ descricao: string }>(
      'SELECT descricao FROM tabela_preco WHERE holding_id = ? AND cd_tabela = ?',
      [holdingId, p.cdTabelaPreco ?? -1],
    ),
    db.getFirstAsync<{ descricao: string }>(
      'SELECT descricao FROM condicao_pagto WHERE holding_id = ? AND cd_condicao = ?',
      [holdingId, p.cdCondicaoPagto ?? -1],
    ),
    db.getFirstAsync<{ descricao: string }>(
      'SELECT descricao FROM tipo_venda WHERE holding_id = ? AND cd_tipo = ?',
      [holdingId, p.cdTipoVenda ?? -1],
    ),
  ]);
  const porProduto = new Map(
    produtos.map((produto) => [produto.cd_produto, produto]),
  );
  const cliRaw = parseJson(cliente?.raw_json);
  return {
    ...p,
    clienteCidadeUf:
      p.clienteCidadeUf ??
      [cliente?.cidade_nome, cliente?.estado].filter(Boolean).join(' / '),
    clienteCep: p.clienteCep ?? cliente?.cep,
    clienteIe: p.clienteIe ?? cliRaw.rg,
    clienteFone: p.clienteFone ?? (cliente?.fone || cliente?.celular),
    tabelaPreco:
      p.tabelaPreco ?? codigoComDescricao(p.cdTabelaPreco, tabela?.descricao),
    condicaoPagamento: codigoComDescricao(
      p.cdCondicaoPagto,
      p.condicaoPagamento ?? condicao?.descricao,
    ),
    formaPagamento: codigoComDescricao(p.cdFormaPagamento, p.formaPagamento),
    tipoVenda:
      p.tipoVenda ?? codigoComDescricao(p.cdTipoVenda, tipo?.descricao),
    itens: p.itens.map((item) => {
      const produto = porProduto.get(item.cdProduto);
      const raw = parseJson(produto?.raw_json);
      const barras = Array.isArray(raw.produtoBarra)
        ? raw.produtoBarra
            .map((b: any) => String(b.cdBarra ?? '').trim())
            .filter(Boolean)
            .sort()
        : [];
      return {
        ...item,
        ncm: item.ncm ?? raw.cdClassificacaoFiscal,
        codigoBarras: item.codigoBarras ?? barras[0],
        fotoUri: item.fotoUri ?? produto?.foto_local,
      };
    }),
  };
}
