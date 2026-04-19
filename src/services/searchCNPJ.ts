import axios from 'axios';

export interface CNPJResult {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  cidade: string | null;
  uf: string | null;
  cidadeIbgeId: number | null;
}

function onlyDigits(s: string) {
  return (s ?? '').replace(/\D/g, '');
}

function joinPhone(ddd: any, fone: any): string | null {
  const d = ddd ? String(ddd).replace(/\D/g, '') : '';
  const f = fone ? String(fone).replace(/\D/g, '') : '';
  if (!f) return null;
  return d ? `${d}${f}` : f;
}

/**
 * Busca dados públicos de um CNPJ na API publica.cnpj.ws (mesma usada no /cadastro
 * do frontend). Retorna `null` em caso de erro/CNPJ não encontrado.
 */
export async function searchCNPJ(cnpj: string): Promise<CNPJResult | null> {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return null;

  try {
    const { data } = await axios.get(`https://publica.cnpj.ws/cnpj/${d}`, {
      timeout: 15000,
    });
    const est = data?.estabelecimento ?? {};
    const cidade = est.cidade ?? {};
    const estado = est.estado ?? {};
    const enderecoCompleto = [est.tipo_logradouro, est.logradouro]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      razaoSocial: data?.razao_social ?? null,
      nomeFantasia: est?.nome_fantasia ?? null,
      email: est?.email ?? null,
      telefone: joinPhone(est?.ddd1, est?.telefone1),
      cep: est?.cep ?? null,
      endereco: enderecoCompleto || null,
      numero: est?.numero ?? null,
      bairro: est?.bairro ?? null,
      complemento: est?.complemento ?? null,
      cidade: cidade?.nome ?? null,
      uf: estado?.sigla ?? null,
      cidadeIbgeId: cidade?.ibge_id ?? null,
    };
  } catch {
    return null;
  }
}
