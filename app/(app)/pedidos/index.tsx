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
import { listPrevendas, PrevendaRow } from '@/db/repositories/prevendas';
import { getClienteById } from '@/db/repositories/clientes';

type OutboxItem = OutboxVendaRow & {
  kind: 'outbox';
  clienteNome?: string;
};

type PrevendaItem = PrevendaRow & {
  kind: 'prevenda';
};

type ListItem = OutboxItem | PrevendaItem;

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('pt-BR');
}

const OUTBOX_STATUS_COLOR: Record<string, string> = {
  pending: '#64748b',
  sending: '#0ea5e9',
  sent: '#16a34a',
  error: '#dc2626',
};

const OUTBOX_STATUS_LABEL: Record<string, string> = {
  pending: 'A enviar',
  sending: 'Enviando',
  sent: 'Enviado',
  error: 'Erro',
};

export default function PedidosScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [outboxRows, prevendaRows] = await Promise.all([
      listOutboxVendas(),
      listPrevendas(),
    ]);

    const outboxItems: OutboxItem[] = [];
    for (const r of outboxRows) {
      const c = await getClienteById(r.cd_cliente, r.holding_id);
      outboxItems.push({
        ...r,
        kind: 'outbox',
        clienteNome: c?.nome ?? `Cliente #${r.cd_cliente}`,
      });
    }

    // Evita duplicar prevenda que ainda está na outbox (mesmo client_id)
    const outboxClientIds = new Set(
      outboxRows.map((r) => r.client_id).filter(Boolean),
    );
    const prevendaItems: PrevendaItem[] = prevendaRows
      .filter((p) => !p.client_id || !outboxClientIds.has(p.client_id))
      .map((p) => ({ ...p, kind: 'prevenda' as const }));

    setItems([...outboxItems, ...prevendaItems]);
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
          keyExtractor={(it) =>
            it.kind === 'outbox'
              ? `outbox:${it.client_id}`
              : `prevenda:${it.nr_prevenda}:${it.cd_empresa}:${it.holding_id}`
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Nenhum pedido local nem pré-venda sincronizada.
            </Text>
          }
          ListHeaderComponent={
            items.length > 0 ? (
              <Text style={styles.hint}>
                “A enviar” = app → Techbull. “Pendente/Sincronizado” = Techbull →
                Duapi.
              </Text>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'outbox' ? (
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
                    Local • {fmtDate(item.created_at)}
                  </Text>
                  <Text style={styles.value}>{fmtMoney(item.vl_total)}</Text>
                </View>
                <View
                  style={[
                    styles.tag,
                    { backgroundColor: OUTBOX_STATUS_COLOR[item.status] },
                  ]}
                >
                  <Text style={styles.tagText}>
                    {OUTBOX_STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/pedidos/remoto/[nrPrevenda]',
                    params: {
                      nrPrevenda: String(item.nr_prevenda),
                      cdEmpresa: String(item.cd_empresa),
                      holdingId: String(item.holding_id),
                    },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.nm_cliente ?? `Cliente #${item.cd_cliente}`}
                  </Text>
                  <Text style={styles.sub}>
                    Nº {item.nr_prevenda} • {fmtDate(item.dt_emissao)}
                  </Text>
                  <Text style={styles.value}>{fmtMoney(item.vl_total)}</Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    item.id_sincronizado_duapi
                      ? styles.badgeSynced
                      : styles.badgePending,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      item.id_sincronizado_duapi
                        ? styles.badgeTextSynced
                        : styles.badgeTextPending,
                    ]}
                  >
                    {item.id_sincronizado_duapi ? 'Sincronizado' : 'Pendente'}
                  </Text>
                </View>
              </Pressable>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hint: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16,
  },
  row: { flexDirection: 'row', padding: 14, alignItems: 'center', gap: 8 },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  value: { color: '#16a34a', fontWeight: '700', marginTop: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeSynced: {
    borderColor: 'rgba(5, 150, 105, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  badgePending: {
    borderColor: 'rgba(217, 119, 6, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  badgeText: { fontWeight: '700', fontSize: 11 },
  badgeTextSynced: { color: '#047857' },
  badgeTextPending: { color: '#b45309' },
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
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b', paddingHorizontal: 24 },
});
