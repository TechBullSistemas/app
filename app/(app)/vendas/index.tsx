import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '@/db/database';

interface NotaItem {
  cd_nota: number;
  cd_empresa: number;
  holding_id: number;
  cd_cliente: number | null;
  dt_emissao: string | null;
  vl_total: number | null;
  cliente_nome: string | null;
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('pt-BR');
  } catch {
    return v;
  }
}

export default function VendasScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NotaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<NotaItem>(
        `SELECT n.cd_nota, n.cd_empresa, n.holding_id, n.cd_cliente, n.dt_emissao, n.vl_total,
                c.nome as cliente_nome
         FROM nota_fiscal_saida n
         LEFT JOIN cliente c
           ON c.cd_cliente = n.cd_cliente AND c.holding_id = n.holding_id
         ORDER BY n.dt_emissao DESC
         LIMIT 500`,
      );
      setItems(rows);
      setLoading(false);
    })();
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  return (
    <FlatList
      data={items}
      style={{ backgroundColor: '#fff' }}
      keyExtractor={(it) => `${it.cd_nota}-${it.cd_empresa}-${it.holding_id}`}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      ListEmptyComponent={<Text style={styles.empty}>Nenhuma venda registrada.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            router.push({
              pathname: '/(app)/vendas/[id]',
              params: {
                id: String(item.cd_nota),
                e: String(item.cd_empresa),
                h: String(item.holding_id),
              },
            })
          }
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>NF {item.cd_nota}</Text>
            <Text style={styles.sub}>{item.cliente_nome ?? `Cliente #${item.cd_cliente}`}</Text>
            <Text style={styles.sub}>{fmtDate(item.dt_emissao)}</Text>
          </View>
          <Text style={styles.value}>{fmtMoney(item.vl_total)}</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 14, gap: 12, alignItems: 'center', backgroundColor: '#fff' },
  rowPressed: { backgroundColor: '#f1f5f9' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  value: { color: '#16a34a', fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
