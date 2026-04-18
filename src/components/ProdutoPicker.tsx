import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { listProdutos, ProdutoRow } from '@/db/repositories/produtos';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (produto: ProdutoRow) => void;
}

export function ProdutoPicker({ visible, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ProdutoRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const t = setTimeout(async () => {
      const rows = await listProdutos(search, 100);
      if (alive) setItems(rows);
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
            <Text style={styles.title}>Selecione o produto</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.input}
              placeholder="Buscar produto..."
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          <FlatList
            data={items}
            keyExtractor={(it) => `${it.cd_produto}-${it.holding_id}`}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                {item.foto_local || item.foto_url ? (
                  <Image
                    source={{ uri: (item.foto_local || item.foto_url) as string }}
                    style={styles.thumb}
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.descricao}</Text>
                  <Text style={styles.sub}>
                    Ref: {item.referencia || '—'} • Estoque: {item.qt_disponivel ?? 0}
                  </Text>
                  <Text style={styles.price}>
                    {(item.vl_venda ?? 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1e3a8a',
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  close: { color: '#fff', fontWeight: '600' },
  searchBox: { padding: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10 },
  row: { padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f1f5f9' },
  thumbEmpty: { backgroundColor: '#e2e8f0' },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  price: { color: '#16a34a', fontWeight: '700', marginTop: 2 },
});
