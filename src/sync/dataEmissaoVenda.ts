interface VendaUploadPayload {
  dtEmissao?: string;
  prevendaTitulo?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function aplicarDataSincronizacaoVenda<T extends VendaUploadPayload>(
  payload: T,
  utilizarDataSincronizacao: boolean,
  dataSincronizacao: string,
): T {
  if (!utilizarDataSincronizacao) return payload;

  return {
    ...payload,
    dtEmissao: dataSincronizacao,
    prevendaTitulo: payload.prevendaTitulo?.map((titulo) => ({
      ...titulo,
      dtEmissao: dataSincronizacao,
    })),
  } as T;
}
