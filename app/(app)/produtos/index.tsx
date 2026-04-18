import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { listProdutos, ProdutoRow } from '@/db/repositories/produtos';

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ProdutosScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ProdutoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await listProdutos(search, 200);
      if (alive) {
        setItems(rows);
        setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          placeholder="Buscar por descrição ou referência"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.cd_produto}-${it.holding_id}`}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum produto encontrado.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/(app)/produtos/[id]',
                  params: { id: String(item.cd_produto), h: String(item.holding_id) },
                })
              }
            >
              <View style={styles.thumbBox}>
                {item.foto_local ? (
                  <Image source={{ uri: item.foto_local }} style={styles.thumb} />
                ) : item.foto_url ? (
                  <Image source={{ uri: item.foto_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Text style={{ color: '#cbd5e1', fontSize: 10 }}>SEM FOTO</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.descricao ?? '(sem descrição)'}
                </Text>
                <Text style={styles.sub}>
                  Ref: {item.referencia || '—'} • Estoque: {item.qt_disponivel ?? 0}
                </Text>
                <Text style={styles.price}>{fmtMoney(item.vl_venda)}</Text>
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
  searchBox: { padding: 12, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  row: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'center' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  thumbBox: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#f1f5f9' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', marginTop: 2, fontSize: 12 },
  price: { color: '#16a34a', fontWeight: '700', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
