import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listVisitas, VisitaRow } from '@/db/repositories/visitas';
import { getClienteById } from '@/db/repositories/clientes';

interface VisitaItem extends VisitaRow {
  clienteNome?: string;
}

function fmtDate(v: string) {
  try {
    return new Date(v).toLocaleString('pt-BR');
  } catch {
    return v;
  }
}

export default function VisitasScreen() {
  const router = useRouter();
  const [items, setItems] = useState<VisitaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await listVisitas(200);
    const enriched: VisitaItem[] = [];
    for (const r of rows) {
      let nome: string | undefined;
      if (r.holding_id) {
        const c = await getClienteById(r.cd_cliente, r.holding_id);
        nome = c?.nome ?? undefined;
      }
      enriched.push({ ...r, clienteNome: nome });
    }
    setItems(enriched);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Pressable style={styles.fab} onPress={() => router.push('/(app)/visitas/nova')}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, i) => `${it.client_id ?? it.cd_visita ?? i}`}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma visita registrada.</Text>}
          renderItem={({ item }) => {
            const podeEditar = item.origem === 'local' && !!item.client_id;
            const Wrapper: any = podeEditar ? Pressable : View;
            return (
              <Wrapper
                style={styles.row}
                onPress={
                  podeEditar
                    ? () =>
                        router.push({
                          pathname: '/(app)/visitas/[clientId]',
                          params: { clientId: item.client_id! },
                        })
                    : undefined
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.clienteNome ?? `Cliente #${item.cd_cliente}`}
                  </Text>
                  <Text style={styles.sub}>{fmtDate(item.dt_visita)}</Text>
                  <Text style={[styles.sub, { color: item.id_comprou ? '#16a34a' : '#dc2626' }]}>
                    {item.id_comprou ? 'Comprou' : 'Não comprou'}
                  </Text>
                  {item.motivo_nao_comprou ? (
                    <Text style={styles.sub}>Motivo: {item.motivo_nao_comprou}</Text>
                  ) : null}
                  {item.observacao ? <Text style={styles.sub}>{item.observacao}</Text> : null}
                </View>
                {item.origem === 'local' ? (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>Pendente</Text>
                  </View>
                ) : null}
                {podeEditar ? (
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                ) : null}
              </Wrapper>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: { flexDirection: 'row', padding: 14, alignItems: 'flex-start', gap: 8 },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', marginTop: 2, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    zIndex: 10,
  },
  tag: { backgroundColor: '#fde68a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText: { color: '#92400e', fontWeight: '700', fontSize: 11 },
});
