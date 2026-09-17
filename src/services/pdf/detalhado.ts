import type { PedidoItem, PedidoPdfData } from './types';

const escape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const number = (value: number, digits = 2) =>
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const field = (label: string, value: unknown, cls = '') =>
  `<div class="field ${cls}"><span>${label}</span><strong>${escape(value || '-')}</strong></div>`;

export function descontoItem(item: PedidoItem) {
  // Usa os valores gravados na venda, nunca o preço atual do catálogo.
  const original = Number(item.vlUnitarioOriginal ?? item.vlUnitario);
  const base = original * item.qt;
  return base > 0 ? Math.max(0, ((base - item.vlTotal) / base) * 100) : 0;
}

type Pagina = {
  itens: PedidoItem[];
  resumo?: boolean;
  observacao?: string;
  parcelas?: string[];
};

function quebrarTexto(text: string, largura: number): string[] {
  return text.split(/\r?\n/).flatMap((paragrafo) => {
    const linhas: string[] = [];
    let restante = paragrafo;
    while (restante.length > largura) {
      const espaco = restante.lastIndexOf(' ', largura);
      const corte = espaco > largura / 2 ? espaco : largura;
      linhas.push(restante.slice(0, corte));
      restante = restante.slice(corte).trimStart();
    }
    return [...linhas, restante];
  });
}

export function paginarPedido(p: PedidoPdfData): Pagina[] {
  const paginas: Pagina[] = [{ itens: p.itens.slice(0, 4) }];
  for (let i = 4; i < p.itens.length; i += 6)
    paginas.push({ itens: p.itens.slice(i, i + 6) });
  let pagina = paginas[paginas.length - 1];
  // Espaço em linhas de 4 mm; reserva cabeçalho, rodapé e totais antes das observações.
  const capacidade = (page: Pagina, index: number) =>
    Math.floor((220 - (index === 0 ? 55 : 0) - page.itens.length * 36) / 4);
  let linhas = capacidade(pagina, paginas.length - 1);
  if (linhas < 11) {
    pagina = { itens: [] };
    paginas.push(pagina);
    linhas = capacidade(pagina, paginas.length - 1);
  }
  pagina.resumo = true;
  linhas -= 11;
  const parcelas = (p.parcelas ?? []).map((parcela) => {
    const data = /^(\d{4})-(\d{2})-(\d{2})/.exec(parcela.vencimento);
    return `${parcela.numero} - ${data ? `${data[3]}/${data[2]}/${data[1]}` : parcela.vencimento} - R$ ${number(parcela.valor)}`;
  });
  const observacao = p.observacao ? quebrarTexto(p.observacao, 70) : [];
  for (const [tipo, texto] of [
    ['parcelas', parcelas],
    ['observacao', observacao],
  ] as const) {
    let i = 0;
    while (i < texto.length) {
      if (linhas < 3) {
        pagina = { itens: [] };
        paginas.push(pagina);
        linhas = capacidade(pagina, paginas.length - 1);
      }
      const trecho = texto.slice(i, i + linhas - 2);
      if (tipo === 'parcelas') pagina.parcelas = trecho;
      else pagina.observacao = trecho.join('\n');
      i += trecho.length;
      linhas -= trecho.length + 2;
    }
  }
  return paginas;
}

function itemHtml(item: PedidoItem) {
  return `<tr class="item"><td class="foto">${item.fotoUri?.startsWith('data:image/') ? `<img src="${escape(item.fotoUri)}" />` : '<div class="sem-foto">Sem foto</div>'}</td>
    <td class="produto"><strong>${escape(item.cdProduto)} - ${escape(item.descricao)}</strong><div>NCM: ${escape(item.ncm || '-')}</div><div>Código de barras: ${escape(item.codigoBarras || '-')}</div></td>
    <td class="numero">${number(descontoItem(item))}</td><td class="numero">${number(item.vlUnitario)}</td><td class="numero">${Number(item.qt).toLocaleString('pt-BR', { maximumFractionDigits: 5 })}</td><td class="numero">${number(item.vlTotal)}</td></tr>`;
}

export function buildHtmlDetalhado(
  p: PedidoPdfData,
  logo: string | null = null,
) {
  const paginas = paginarPedido(p);
  const totalItens = p.itens.reduce((total, item) => total + item.vlTotal, 0);
  const empresa = `<header><div class="logo">${logo ? `<img src="${escape(logo)}" />` : ''}</div><div class="empresa"><strong>${escape(p.empresaNome)}</strong><div>${escape(p.empresaEndereco)}</div><div>${escape(p.empresaCidadeUf)} ${p.empresaCep ? `- CEP: ${escape(p.empresaCep)}` : ''}</div><div>CNPJ: ${escape(p.empresaCnpj || '-')} &nbsp; IE: ${escape(p.empresaIe || '-')}</div><div>${escape(p.empresaFone || '')} ${p.empresaEmail ? `- ${escape(p.empresaEmail)}` : ''}</div></div></header>`;
  const dados = `<section class="dados"><div class="grid tres">${field('Pedido', p.numero)}${field('Representante', p.representante)}${field('Digitado em', p.data)}</div><div class="grid cliente">${field('Cliente', [p.cdCliente, p.clienteNome].filter((v) => v != null).join(' - '))}${field('CPF/CNPJ', p.clienteCpfCnpj)}${field('Inscrição estadual', p.clienteIe)}</div><div class="grid tres">${field('Endereço', p.clienteEndereco)}${field('Cidade / UF', p.clienteCidadeUf)}${field('CEP / Telefone', [p.clienteCep, p.clienteFone].filter(Boolean).join(' / '))}</div><div class="grid quatro">${field('Tabela de preço', p.tabelaPreco)}${field('Condição de pagamento', p.condicaoPagamento)}${field('Forma de pagamento', p.formaPagamento)}${field('Tipo de pedido', p.tipoVenda)}</div>${p.dsOrdemCompra ? field('Ordem de compra', p.dsOrdemCompra) : ''}</section>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Pedido ${escape(p.numero)}</title><style>
    @page { size: A4; margin: 10mm; } * { box-sizing: border-box; } body { margin:0; font-family: Arial, Helvetica, sans-serif; color:#202020; font-size:10px; }
    .pagina { height:276mm; position:relative; page-break-after:always; padding-bottom:10mm; } .pagina:last-child { page-break-after:auto; }
    header { min-height:35mm; display:flex; gap:5mm; align-items:center; border-bottom:1px solid #333; padding-bottom:3mm; margin-bottom:3mm; }
    .logo { width:42mm; flex-shrink:0; } .logo img { max-width:40mm; max-height:25mm; object-fit:contain; }
    .empresa { flex:1; line-height:1.5; overflow-wrap:anywhere; } .empresa strong { font-size:13px; }
    .dados { min-height:38mm; } .grid { display:grid; gap:3mm; margin-bottom:2mm; } .tres { grid-template-columns:1.1fr 1.1fr 1fr; } .cliente { grid-template-columns:2fr 1fr 1fr; } .quatro { grid-template-columns:repeat(4,1fr); }
    .field span { display:block; font-size:9px; color:#555; } .field strong { display:block; font-weight:normal; overflow-wrap:anywhere; font-size:10px; }
    table { border-collapse:collapse; width:100%; table-layout:fixed; } th { text-align:left; font-weight:normal; height:7mm; border-bottom:1px solid #333; } td { vertical-align:middle; }
    .item { height:36mm; } .foto { width:32mm; text-align:center; } .foto img { max-width:30mm; max-height:32mm; object-fit:contain; } .sem-foto { color:#999; font-size:9px; }
    .produto { padding:2mm; overflow-wrap:anywhere; } .produto strong { display:block; font-weight:normal; margin-bottom:2mm; } .produto div { margin-top:1mm; font-size:9px; }
    .numero { text-align:right; white-space:nowrap; font-size:9px; } .resumo { margin:4mm 0 3mm auto; width:65mm; border-top:1px solid; line-height:1.6; } .resumo div { display:flex; justify-content:space-between; } .total { font-size:12px; font-weight:bold; }
    .complemento { margin-top:2mm; font-size:10px; line-height:4mm; } .complemento p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
    footer { position:absolute; bottom:0; width:100%; height:7mm; border-top:1px solid; display:flex; justify-content:space-between; align-items:center; font-size:9px; }
  </style></head><body>${paginas
    .map(
      (pagina, i) => `<article class="pagina">${empresa}${i === 0 ? dados : ''}
    ${pagina.itens.length ? `<table><colgroup><col style="width:32mm"/><col/><col style="width:13mm"/><col style="width:18mm"/><col style="width:12mm"/><col style="width:20mm"/></colgroup><thead><tr><th colspan="2">Produto</th><th class="numero">Desc. %</th><th class="numero">Valor un.</th><th class="numero">Qtd.</th><th class="numero">Valor total</th></tr></thead><tbody>${pagina.itens.map(itemHtml).join('')}</tbody></table>` : ''}
    ${pagina.resumo ? `<section class="resumo"><div><span>Total dos itens</span><span>${number(totalItens)}</span></div>${p.vlDescontoTotal ? `<div><span>Desconto</span><span>${number(p.vlDescontoTotal)}</span></div>` : ''}${p.vlAcrescimoTotal ? `<div><span>Acréscimo</span><span>${number(p.vlAcrescimoTotal)}</span></div>` : ''}<div class="total"><span>Total do pedido</span><span>R$ ${number(p.vlTotal)}</span></div></section>` : ''}
    ${pagina.parcelas ? `<section class="complemento"><strong>Parcelas</strong><p>${escape(pagina.parcelas.join('\n'))}</p></section>` : ''}
    ${pagina.observacao !== undefined ? `<section class="complemento"><strong>Observações</strong><p>${escape(pagina.observacao)}</p></section>` : ''}
    <footer><span>${escape(p.data)}</span><span>TechBull Vendas - Pedido ${escape(p.numero)}</span><span>Página ${i + 1} de ${paginas.length}</span></footer></article>`,
    )
    .join('')}</body></html>`;
}
