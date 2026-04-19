import { getApi } from './client';

export interface MetaProgresso {
  cdMeta: number;
  dsMeta: string;
  vlMeta: number;
  idTipo: string;
  tpPeriodo: string;
  dtInicio: string;
  dtFim: string;
  cdVendedor: number | null;
  cdEmpresa: number | null;
  valorAtual: number;
  percentual: number;
}

export interface ListMetasResponse {
  data: MetaProgresso[];
}

export async function listMetas(cdEmpresa?: number) {
  const api = getApi();
  const { data } = await api.get<ListMetasResponse>('/meta', {
    params: cdEmpresa ? { cdEmpresa } : {},
  });
  return data.data;
}
