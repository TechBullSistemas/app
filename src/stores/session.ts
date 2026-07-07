import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'techbull.token';
const USER_KEY = 'techbull.user';
const EXPIRES_KEY = 'techbull.expiresAt';

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
  /** Máximo desconto permitido na alteração manual de preço unitário (%). */
  prDescontoMax?: number;
}

interface SessionState {
  token: string | null;
  user: SessionUser | null;
  expiresAt: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (
    token: string,
    user: SessionUser,
    expiresAt?: string | null,
  ) => Promise<void>;
  refreshUser: () => Promise<void>;
  isSessionExpired: () => boolean;
  clear: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  expiresAt: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      const expiresAt = await SecureStore.getItemAsync(EXPIRES_KEY);
      const user = userJson ? (JSON.parse(userJson) as SessionUser) : null;
      set({ token, user, expiresAt, hydrated: true });
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
  setSession: async (token, user, expiresAt = null) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    if (expiresAt) {
      await SecureStore.setItemAsync(EXPIRES_KEY, expiresAt);
    } else {
      await SecureStore.deleteItemAsync(EXPIRES_KEY);
    }
    set({ token, user, expiresAt: expiresAt ?? null });
  },
  isSessionExpired: () => {
    const { expiresAt } = get();
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now();
  },
  refreshUser: async () => {
    if (!get().token) return;
    try {
      const { meRequest } = await import('@/api/auth');
      const data = await meRequest();
      if (!data?.user) return;
      const merged: SessionUser = { ...(get().user || {}), ...data.user };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(merged));
      set({ user: merged });
    } catch (err) {
      console.warn('Falha ao refrescar dados do usuário:', err);
    }
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
    set({ token: null, user: null, expiresAt: null });
  },
}));
