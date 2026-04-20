import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { OnlineBadge } from '@/components/OnlineBadge';
import { useSessionStore } from '@/stores/session';
import { logoutRequest } from '@/api/auth';
import { countPending } from '@/db/repositories/outbox';
import { getAppVersion, getVersionLabel } from '@/config/version';
import { checkAndApplyUpdate, isUpdatesEnabled } from '@/services/updates';

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  color: string;
  badge?: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const clear = useSessionStore((s) => s.clear);

  const { width: windowWidth } = useWindowDimensions();
  const layout = getResponsiveLayout(windowWidth);

  const [pending, setPending] = useState({ vendas: 0, visitas: 0, clientes: 0 });
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const versionInfo = getAppVersion();
  const versionLabel = getVersionLabel();
  const updatesEnabled = isUpdatesEnabled();

  useEffect(() => {
    countPending().then(setPending).catch(() => undefined);
  }, []);

  async function handleCheckUpdate() {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const r = await checkAndApplyUpdate({ silent: false });
      if (r === 'no-module') {
        Alert.alert(
          'Atualização',
          'O módulo de atualizações não está habilitado nesta build.',
        );
      } else if (r === 'disabled') {
        Alert.alert('Atualização', 'Atualizações OTA estão desabilitadas.');
      } else if (r === 'no-update') {
        Alert.alert('Atualização', 'Você já está na versão mais recente.');
      } else if (r === 'error') {
        Alert.alert('Atualização', 'Não foi possível verificar agora.');
      }
    } finally {
      setCheckingUpdate(false);
    }
  }

  function go(href: string) {
    router.push(href as any);
  }

  async function handleSair() {
    Alert.alert('Sair', 'Deseja realmente sair do app?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logoutRequest();
          await clear();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const menu: MenuItem[] = [
    { label: 'Clientes', icon: 'people', href: '/(app)/clientes', color: '#0ea5e9' },
    { label: 'Visitas', icon: 'walk', href: '/(app)/visitas', color: '#10b981' },
    { label: 'Produtos', icon: 'cube', href: '/(app)/produtos', color: '#f59e0b' },
    { label: 'Pedidos', icon: 'receipt', href: '/(app)/pedidos', color: '#8b5cf6' },
    { label: 'Meta', icon: 'speedometer', href: '/(app)/meta', color: '#ec4899' },
    { label: 'Buscar Info.', icon: 'cloud-download', href: '/(app)/sync/buscar', color: '#14b8a6' },
    {
      label: 'Enviar Info.',
      icon: 'cloud-upload',
      href: '/(app)/sync/enviar',
      color: '#f97316',
      badge: pending.vendas + pending.visitas + pending.clientes,
    },
    { label: 'Alterar Senha', icon: 'key', href: '/(app)/senha', color: '#64748b' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Olá, {user?.nome ?? 'Representante'}</Text>
          {user?.holdingName ? (
            <Text style={styles.subtle}>{user.holdingName}</Text>
          ) : null}
        </View>
        <OnlineBadge />
      </View>

      <View style={[styles.grid, { gap: layout.gap }]}>
        {menu.map((m) => (
          <Pressable
            key={m.label}
            style={[styles.tile, { width: layout.tileSize, height: layout.tileSize }]}
            onPress={() => go(m.href)}
          >
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: m.color,
                  width: layout.iconCircle,
                  height: layout.iconCircle,
                  borderRadius: layout.iconCircle / 2,
                },
              ]}
            >
              <Ionicons name={m.icon} size={layout.iconSize} color="#fff" />
              {!!m.badge && m.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{m.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tileLabel, { fontSize: layout.labelSize }]}>{m.label}</Text>
          </Pressable>
        ))}

        <Pressable
          style={[styles.tile, { width: layout.tileSize, height: layout.tileSize }]}
          onPress={handleSair}
        >
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: '#dc2626',
                width: layout.iconCircle,
                height: layout.iconCircle,
                borderRadius: layout.iconCircle / 2,
              },
            ]}
          >
            <Ionicons name="exit" size={layout.iconSize} color="#fff" />
          </View>
          <Text style={[styles.tileLabel, { fontSize: layout.labelSize }]}>Sair</Text>
        </Pressable>
      </View>

      <Pressable style={styles.versionBox} onPress={handleCheckUpdate}>
        <View style={{ flex: 1 }}>
          <Text style={styles.versionLabel}>{versionLabel}</Text>
          <Text style={styles.versionSub}>
            {versionInfo.platform.toUpperCase()}
            {versionInfo.runtimeVersion ? ` • runtime ${versionInfo.runtimeVersion}` : ''}
            {versionInfo.channel ? ` • ${versionInfo.channel}` : ''}
          </Text>
          {updatesEnabled ? (
            <Text style={styles.versionHint}>
              {checkingUpdate ? 'Verificando atualização...' : 'Toque para verificar atualização'}
            </Text>
          ) : (
            <Text style={styles.versionHint}>OTA desabilitado nesta build</Text>
          )}
        </View>
        <Ionicons
          name={checkingUpdate ? 'sync' : 'cloud-download-outline'}
          size={20}
          color="#64748b"
        />
      </Pressable>
    </ScrollView>
  );
}

const SCREEN_PADDING = 16;

interface ResponsiveLayout {
  columns: number;
  gap: number;
  tileSize: number;
  iconCircle: number;
  iconSize: number;
  labelSize: number;
}

function getResponsiveLayout(width: number): ResponsiveLayout {
  let columns = 3;
  let gap = 12;

  if (width >= 1200) {
    columns = 6;
    gap = 20;
  } else if (width >= 900) {
    columns = 5;
    gap = 18;
  } else if (width >= 600) {
    columns = 4;
    gap = 16;
  }

  const available = width - SCREEN_PADDING * 2 - gap * (columns - 1);
  const tileSize = Math.floor(available / columns);

  const iconCircle = Math.round(tileSize * 0.45);
  const iconSize = Math.round(iconCircle * 0.5);
  const labelSize = Math.max(12, Math.round(tileSize * 0.11));

  return { columns, gap, tileSize, iconCircle, iconSize, labelSize };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    gap: 12,
  },
  hello: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtle: { color: '#64748b', marginTop: 2, fontSize: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  tile: {
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    elevation: 1,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    marginTop: 8,
    color: '#0f172a',
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  versionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 10,
  },
  versionLabel: { color: '#0f172a', fontWeight: '700' },
  versionSub: { color: '#64748b', fontSize: 11, marginTop: 2 },
  versionHint: { color: '#2563eb', fontSize: 11, marginTop: 2, fontWeight: '600' },
});
