import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getEmpresaById } from '@/db/repositories/empresas';
import { buildHtmlPadrao } from './pdf/padrao';
import { buildHtmlDetalhado } from './pdf/detalhado';
import { complementarPedidoPdf, parseJson } from './pdf/dados';
import type { PedidoPdfData } from './pdf/types';
export type { PedidoPdfData, PedidoItem, PedidoParcela } from './pdf/types';

async function resolveImageSource(
  uri?: string | null,
  allowRemote = false,
): Promise<string | null> {
  const value = uri?.trim();
  if (!value) return null;
  if (value.startsWith('data:image/')) return value;
  if (/^https?:\/\//i.test(value)) return allowRemote ? value : null;
  try {
    const base64 = await FileSystem.readAsStringAsync(value, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mime = /\.jpe?g$/i.test(value)
      ? 'image/jpeg'
      : /\.webp$/i.test(value)
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
): Promise<Partial<PedidoPdfData>> {
  const empresa = await getEmpresaById(cdEmpresa, holdingId);
  const raw = parseJson(empresa?.raw_json);
  return {
    cdEmpresa,
    holdingId,
    modeloImpressaoApp:
      raw.modeloImpressaoApp === 'detalhado_fotos'
        ? 'detalhado_fotos'
        : 'padrao',
    empresaNome: empresa?.nome ?? empresa?.razao_social ?? undefined,
    empresaCnpj: empresa?.cnpj ?? undefined,
    empresaLogoUri: empresa?.logo_local ?? empresa?.logo_url ?? null,
    empresaEndereco: [raw.endereco, raw.dsNumero, raw.dsComplemento, raw.bairro]
      .filter(Boolean)
      .join(', '),
    empresaCidadeUf: [
      raw.cidade?.nmCidade,
      raw.cdEstado || raw.cidade?.cdEstado,
    ]
      .filter(Boolean)
      .join(' / '),
    empresaCep: raw.cep,
    empresaIe: raw.inscEstadual,
    empresaFone: raw.fone,
    empresaEmail: raw.email,
  };
}

export async function gerarPdfPedido(p: PedidoPdfData) {
  const current =
    p.cdEmpresa != null && p.holdingId != null
      ? { ...p, ...(await getEmpresaPedidoPdfData(p.cdEmpresa, p.holdingId)) }
      : p;
  const logo = await resolveImageSource(
    current.empresaLogoUri,
    current.modeloImpressaoApp !== 'detalhado_fotos',
  );
  if (current.modeloImpressaoApp !== 'detalhado_fotos') {
    const { uri } = await Print.printToFileAsync({
      html: buildHtmlPadrao(current, logo),
    });
    return uri;
  }
  const enriched = await complementarPedidoPdf(current);
  // Fotos locais são incorporadas ao arquivo. Não dispara downloads ao imprimir.
  const images = new Map<number, string | null>();
  for (const item of enriched.itens) {
    if (!images.has(item.cdProduto))
      images.set(item.cdProduto, await resolveImageSource(item.fotoUri));
    item.fotoUri = images.get(item.cdProduto) ?? null;
  }
  const { uri } = await Print.printToFileAsync({
    html: buildHtmlDetalhado(enriched, logo),
    width: 595.28,
    height: 841.89,
  });
  return uri;
}

export async function compartilharPdf(uri: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Pedido em PDF',
    });
  }
}
export async function imprimirPdf(uri: string) {
  await Print.printAsync({ uri });
}
export async function lerPdfBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
