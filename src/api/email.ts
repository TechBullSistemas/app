import { getApi } from './client';

export interface EnviarVendaEmailParams {
  to: string;
  subject?: string;
  nrPrevenda?: number | string | null;
  empresaName?: string;
  pdfBase64: string;
  filename?: string;
  htmlBody?: string;
}

export async function enviarVendaPorEmail(params: EnviarVendaEmailParams) {
  const api = getApi();
  const filename = params.filename || `pedido-${params.nrPrevenda ?? 'venda'}.pdf`;
  const { data } = await api.post(
    '/email/venda',
    {
      to: params.to,
      subject: params.subject,
      nrPrevenda: params.nrPrevenda ?? undefined,
      empresaName: params.empresaName,
      htmlBody: params.htmlBody,
      attachment: {
        filename,
        data: params.pdfBase64,
      },
    },
    { timeout: 120000 },
  );
  return data;
}
