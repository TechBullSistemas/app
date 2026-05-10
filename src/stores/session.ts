import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'techbull.token';
const USER_KEY = 'techbull.user';

export interface SessionRepresentante {
  vlSaldoFlex: number;
  prFlexMin: number;
  prFlexMax: number;
  idMargem: 'S' | 'N' | string;
  prMargemLucroMinimo: number;
  cdTabelaPreco: number | null;
}

export interface SessionUser {
  userId: number;
  holdingId: number;
  cdEmpresa: number;
  nome: string;
  email?: string | null;
  idAtivo?: boolean;
  holdingName?: string | null;
  // Campos opcionais usados pelo motor de precificação. O backend antigo
  // (sem essas regras) não os envia, então mantemos como opcionais.
  cdEstado?: string | null;
  cdRepresentante?: number | null;
  representante?: SessionRepresentante | null;
}

interface SessionState {
  token: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: SessionUser) => Promise<void>;
  refreshUser: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      const user = userJson ? (JSON.parse(userJson) as SessionUser) : null;
      set({ token, user, hydrated: true });
      if (token && user) {
        get()
          .refreshUser()
          .catch((err) =>
            console.warn('Falha ao refrescar dados do usuário:', err),
          );
      }
    } catch (err) {
      console.error('Erro ao restaurar sessão:', err);
      set({ hydrated: true });
    }
  },
  setSession: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },
  refreshUser: async () => {
    if (!get().token) return;
    const { meRequest } = await import('@/api/auth');
    const data = await meRequest();
    if (!data?.user) return;
    const merged: SessionUser = { ...(get().user || {}), ...data.user };
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(merged));
    set({ user: merged });
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null });
  },
}));
