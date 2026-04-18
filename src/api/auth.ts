import { getApi } from './client';
import { SessionUser } from '@/stores/session';

export interface LoginResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
  user: SessionUser;
}

export async function loginRequest(email: string, senha: string) {
  const api = getApi();
  const { data } = await api.post<LoginResponse>('/auth/login', {
    email,
    senha,
    timezone: 'America/Sao_Paulo',
  });
  return data;
}

export async function logoutRequest() {
  const api = getApi();
  try {
    await api.post('/auth/logout', {});
  } catch (err) {
    console.warn('Falha ao deslogar do servidor (ignorado):', err);
  }
}

export async function changePasswordRequest(senhaAtual: string, novaSenha: string) {
  const api = getApi();
  const { data } = await api.post('/auth/change-password', {
    senhaAtual,
    novaSenha,
  });
  return data;
}
