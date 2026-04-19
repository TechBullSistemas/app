import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'techbull.token';
const USER_KEY = 'techbull.user';

export interface SessionUser {
  userId: number;
  holdingId: number;
  cdEmpresa: number;
  nome: string;
  email?: string | null;
  idAtivo?: boolean;
  holdingName?: string | null;
}

interface SessionState {
  token: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: SessionUser) => Promise<void>;
  clear: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      const user = userJson ? (JSON.parse(userJson) as SessionUser) : null;
      set({ token, user, hydrated: true });
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
  clear: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null });
  },
}));
