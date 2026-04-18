import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { listOutboxVendas, OutboxVendaRow } from '@/db/repositories/outbox';
import { getClienteById } from '@/db/repositories/clientes';

interface Item extends OutboxVendaRow {
  clienteNome?: string;
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#64748b',
  sending: '#0ea5e9',
  sent: '#16a34a',
  error: '#dc2626',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  sending: 'Enviando',
  sent: 'Enviado',
  error: 'Erro',
};

export default function PedidosScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await listOutboxVendas();
    const enriched: Item[] = [];
    for (const r of rows) {
      const c = await getClienteById(r.cd_cliente, r.holding_id);
      enriched.push({ ...r, clienteNome: c?.nome ?? `Cliente #${r.cd_cliente}` });
    }
    setItems(enriched);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.fab} onPress={() => router.push('/(app)/pedidos/novo')}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.client_id}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum pedido registrado.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/(app)/pedidos/[clientId]',
                  params: { clientId: item.client_id },
                })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.clienteNome}</Text>
                <Text style={styles.sub}>
                  {new Date(item.created_at).toLocaleString('pt-BR')}
                </Text>
                <Text style={styles.value}>{fmtMoney(item.vl_total)}</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: STATUS_COLOR[item.status] }]}>
                <Text style={styles.tagText}>{STATUS_LABEL[item.status]}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: { flexDirection: 'row', padding: 14, alignItems: 'center', gap: 8 },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  value: { color: '#16a34a', fontWeight: '700', marginTop: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    zIndex: 10,
  },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
