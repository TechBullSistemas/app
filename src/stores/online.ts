import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

interface OnlineState {
  isOnline: boolean;
  unsubscribe: (() => void) | null;
  init: () => void;
}

export const useOnlineStore = create<OnlineState>((set, get) => ({
  isOnline: true,
  unsubscribe: null,
  init: () => {
    if (get().unsubscribe) return;
    const unsub = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      set({ isOnline: online });
    });
    set({ unsubscribe: unsub });
    NetInfo.fetch().then((s) => {
      set({ isOnline: !!(s.isConnected && s.isInternetReachable !== false) });
    });
  },
}));
