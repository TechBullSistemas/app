import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { ActivityIndicator, View } from 'react-native';

import { useSessionStore } from '@/stores/session';
import { useOnlineStore } from '@/stores/online';
import { getDb } from '@/db/database';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { hydrated, hydrate, token } = useSessionStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    hydrate();
    getDb().catch((err) => console.error('Falha ao abrir DB:', err));
    useOnlineStore.getState().init();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(app)/home');
    }
  }, [hydrated, token, segments, router]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <Slot />
        </AuthGate>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
