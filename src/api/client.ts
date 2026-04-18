import axios, { AxiosError, AxiosInstance } from 'axios';
import { API_URL } from '@/config/env';
import { useSessionStore } from '@/stores/session';

let instance: AxiosInstance | null = null;

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
      }
      return Promise.reject(error);
    },
  );

  return instance;
}

export function extractApiErrorMessage(err: unknown): string {
  const ax = err as AxiosError<any>;
  const data = ax?.response?.data;
  if (data?.message) return String(data.message);
  if (typeof data === 'string') return data;
  if (ax?.message) return ax.message;
  return 'Erro desconhecido';
}
