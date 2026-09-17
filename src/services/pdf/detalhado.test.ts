import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHtmlDetalhado, paginarPedido, descontoItem } from './detalhado';
import { buildHtmlPadrao } from './padrao';
import type { PedidoPdfData } from './types';

const pedido: PedidoPdfData = {
  numero: 123,
  clienteNome: 'Cliente <teste>',
  data: '17/09/2026',
  vlTotal: 266.68,
  itens: Array.from({ length: 11 }, (_, i) => ({
    cdProduto: i + 1,
    descricao: `Produto ${i + 1}`,
    qt: 1,
    vlUnitario: 10,
    vlTotal: 10,
    ncm: '95030099',
    codigoBarras: '07898262273712',
  })),
};

test('11 itens geram três páginas sem perder produtos; cabeçalho e rodapé se repetem', () => {
  const pages = paginarPedido(pedido);
  assert.deepEqual(
    pages.map((p) => p.itens.length),
    [4, 6, 1],
  );
  const html = buildHtmlDetalhado(pedido);
  assert.equal((html.match(/<header>/g) ?? []).length, 3);
  assert.match(html, /Página 3 de 3/);
  assert.match(html, /Cliente &lt;teste&gt;/);
  assert.match(html, /07898262273712/);
  assert.match(html, /R\$ 266,68/);
  assert.equal((html.match(/Sem foto/g) ?? []).length, 11);
});

test('observações extensas e parcelas continuam em páginas novas, preservando o texto', () => {
  const observacao = 'Palavra '.repeat(1300);
  const p = {
    ...pedido,
    observacao,
    parcelas: Array.from({ length: 80 }, (_, i) => ({
      numero: i + 1,
      vencimento: '2026-10-17',
      valor: 1,
    })),
  };
  const pages = paginarPedido(p);
  assert.equal(pages.flatMap((p) => p.parcelas ?? []).length, 80);
  assert.equal(
    pages
      .map((p) => p.observacao ?? '')
      .join(' ')
      .replace(/\s/g, ''),
    observacao.replace(/\s/g, ''),
  );
  assert.equal(pages.filter((p) => p.resumo).length, 1);
});

test('desconto usa o preço original gravado e preserva total, modelo padrão continua simples', () => {
  assert.equal(
    descontoItem({
      cdProduto: 1,
      descricao: 'A',
      qt: 2,
      vlUnitario: 9,
      vlUnitarioOriginal: 10,
      vlTotal: 18,
    }),
    10,
  );
  assert.equal(
    descontoItem({
      cdProduto: 1,
      descricao: 'A',
      qt: 1,
      vlUnitario: 11,
      vlUnitarioOriginal: 10,
      vlTotal: 11,
    }),
    0,
  );
  const html = buildHtmlPadrao(pedido, null);
  assert.doesNotMatch(html, /NCM:|Código de barras:|Sem foto|Página 1 de/);
  assert.match(html, /Total do pedido/);
});
