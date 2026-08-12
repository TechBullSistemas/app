import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import { getEmpresaById } from '@/db/repositories/empresas';

export interface PedidoItem {
  cdProduto: number;
  descricao: string;
  qt: number;
  vlUnitario: number;
  vlTotal: number;
}

export interface PedidoParcela {
  numero: number;
  vencimento: string;
  valor: number;
}

export interface PedidoPdfData {
  numero?: string | number | null;
  empresaNome?: string;
  empresaCnpj?: string;
  empresaLogoUri?: string | null;
  clienteNome: string;
  clienteCpfCnpj?: string | null;
  clienteEndereco?: string | null;
  data: string;
  itens: PedidoItem[];
  vlTotal: number;
  formaPagamento?: string | null;
  parcelas?: PedidoParcela[];
  observacao?: string | null;
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function rowsItens(itens: PedidoItem[]) {
  return itens
    .map(
      (it) => `
        <tr>
          <td>${it.cdProduto}</td>
          <td>${escape(it.descricao)}</td>
          <td style="text-align:right;">${it.qt}</td>
          <td style="text-align:right;">${fmtMoney(it.vlUnitario)}</td>
          <td style="text-align:right;">${fmtMoney(it.vlTotal)}</td>
        </tr>`,
    )
    .join('');
}

function rowsParcelas(parcelas?: PedidoParcela[]) {
  if (!parcelas?.length) return '';
  return `
    <h3>Parcelas</h3>
    <table>
      <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th></tr></thead>
      <tbody>
        ${parcelas
          .map(
            (p) => `
              <tr>
                <td>${p.numero}</td>
                <td>${escape(p.vencimento)}</td>
                <td style="text-align:right;">${fmtMoney(p.valor)}</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function escape(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(s: string) {
  return escape(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function resolveLogoSource(uri?: string | null): Promise<string | null> {
  const value = uri?.trim();
  if (!value) return null;
  if (value.startsWith('data:image/') || /^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(value, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const lower = value.toLowerCase();
    const mime =
      lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/png';
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function getEmpresaPedidoPdfData(
  cdEmpresa: number,
  holdingId: number,
): Promise<
  Pick<PedidoPdfData, 'empresaNome' | 'empresaCnpj' | 'empresaLogoUri'>
> {
  const empresa = await getEmpresaById(cdEmpresa, holdingId);
  return {
    empresaNome: empresa?.nome ?? empresa?.razao_social ?? undefined,
    empresaCnpj: empresa?.cnpj ?? undefined,
    empresaLogoUri: empresa?.logo_local ?? empresa?.logo_url ?? null,
  };
}

function buildHtml(p: PedidoPdfData, empresaLogoSrc: string | null) {
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Pedido ${p.numero ?? ''}</title>
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #0f172a; }
      h1 { margin: 0; font-size: 22px; }
      h3 { margin: 18px 0 6px; font-size: 14px; color: #1e3a8a; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 12px; }
      .company { display: flex; align-items: center; justify-content: flex-end; gap: 10px; max-width: 52%; }
      .company-logo { width: 64px; height: 56px; object-fit: contain; }
      .company-text { text-align: right; }
      .label { color: #64748b; font-size: 11px; text-transform: uppercase; }
      .value { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
      th { background: #f1f5f9; text-align: left; }
      .totalbox { margin-top: 12px; text-align: right; }
      .totalbox .v { font-size: 22px; font-weight: 800; color: #16a34a; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      .obs { background: #f8fafc; padding: 8px; border-radius: 6px; font-size: 12px; color: #334155; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>Pedido ${p.numero ?? ''}</h1>
        <div class="label">Emitido em</div>
        <div class="value">${escape(p.data)}</div>
      </div>
      <div class="company">
        ${empresaLogoSrc ? `<img class="company-logo" src="${escapeAttribute(empresaLogoSrc)}" alt="Logo da empresa" />` : ''}
        <div class="company-text">
          <div class="value">${escape(p.empresaNome ?? '')}</div>
          ${p.empresaCnpj ? `<div class="label">CNPJ ${escape(p.empresaCnpj)}</div>` : ''}
        </div>
      </div>
    </div>

    <h3>Cliente</h3>
    <div class="grid">
      <div>
        <div class="label">Nome</div>
        <div class="value">${escape(p.clienteNome)}</div>
      </div>
      <div>
        <div class="label">CPF/CNPJ</div>
        <div class="value">${escape(p.clienteCpfCnpj ?? '—')}</div>
      </div>
      <div style="grid-column: span 2;">
        <div class="label">Endereço</div>
        <div class="value">${escape(p.clienteEndereco ?? '—')}</div>
      </div>
    </div>

    <h3>Itens</h3>
    <table>
      <thead>
        <tr>
          <th>Cód.</th>
          <th>Descrição</th>
          <th style="text-align:right;">Qtd</th>
          <th style="text-align:right;">Valor unit.</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rowsItens(p.itens)}</tbody>
    </table>

    <div class="totalbox">
      <div class="label">Total do pedido</div>
      <div class="v">${fmtMoney(p.vlTotal)}</div>
    </div>

    ${p.formaPagamento ? `<h3>Pagamento</h3><div>${escape(p.formaPagamento)}</div>` : ''}
    ${rowsParcelas(p.parcelas)}

    ${p.observacao ? `<h3>Observações</h3><div class="obs">${escape(p.observacao)}</div>` : ''}
  </body>
  </html>`;
}

export async function gerarPdfPedido(p: PedidoPdfData) {
  const empresaLogoSrc = await resolveLogoSource(p.empresaLogoUri);
  const html = buildHtml(p, empresaLogoSrc);
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function compartilharPdf(uri: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Pedido em PDF' });
  }
}

export async function imprimirPdf(uri: string) {
  await Print.printAsync({ uri });
}

export async function lerPdfBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}
