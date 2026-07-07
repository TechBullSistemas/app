import axios, { AxiosError, AxiosInstance } from 'axios';
import { Alert } from 'react-native';
import { API_URL } from '@/config/env';
import { useSessionStore } from '@/stores/session';

let instance: AxiosInstance | null = null;
let sessionAlertShown = false;

export function resetSessionAlertFlag() {
  sessionAlertShown = false;
}

export function getApi(): AxiosInstance {
  if (instance) return instance;

  instance = axios.create({
    baseURL: `${API_URL}/api/mobile`,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
  });

  instance.interceptors.request.use((config) => {
    const token = useSessionStore.getState().token;
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (resp) => resp,
    async (error: AxiosError) => {
      if (error?.response?.status === 401) {
        await useSessionStore.getState().clear();
        if (!sessionAlertShown) {
          sessionAlertShown = true;
          Alert.alert(
            'Sessão expirada',
            'Faça login novamente para continuar.',
          );
        }
      }
      return Promise.reject(error);
    },
  );

  return instance;
}

export function isUnauthorizedApiError(err: unknown): boolean {
  return (err as AxiosError)?.response?.status === 401;
}

export function isSessionExpiredMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('sessão expirada') ||
    m.includes('sessão inválida') ||
    m.includes('faça login novamente')
  );
}

export function extractApiErrorMessage(err: unknown): string {
  const ax = err as AxiosError<any>;
  const status = ax?.response?.status;

  if (status === 401) {
    return 'Sessão expirada. Faça login novamente.';
  }
  if (status === 504) {
    return 'O servidor demorou para responder. Tente novamente em instantes.';
  }
  if (ax?.code === 'ECONNABORTED' || /timeout/i.test(ax?.message || '')) {
    return 'Tempo de resposta esgotado. Verifique sua conexão e tente novamente.';
  }

  const data = ax?.response?.data;
  if (data?.message) return String(data.message);
  if (data?.error?.message) return String(data.error.message);
  if (typeof data === 'string' && data.trim()) return data;
  if (ax?.message) return ax.message;
  return 'Erro desconhecido';
}
