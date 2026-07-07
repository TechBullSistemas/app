import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
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
import { Ionicons } from '@expo/vector-icons';
import {
  listCidades,
  type CidadeRow,
} from '@/db/repositories/auxiliares';

export type { CidadeRow };

function formatCidadeLabel(cidade: CidadeRow): string {
  const nome = cidade.nome?.trim() || `Cidade #${cidade.cd_cidade}`;
  return cidade.cd_estado ? `${nome}/${cidade.cd_estado}` : nome;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (cidade: CidadeRow) => void;
  selectedId?: number | null;
}

export function CidadePicker({
  visible,
  onClose,
  onSelect,
  selectedId,
}: Props) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CidadeRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const rows = await listCidades();
      setItems(rows);
    })();
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        String(it.cd_cidade).includes(q) ||
        (it.nome || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const emptyMessage =
    items.length === 0
      ? "Nenhuma cidade sincronizada. Execute 'Buscar Informações' para sincronizar."
      : 'Nenhuma cidade encontrada.';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Cidade</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.input}
              placeholder="Buscar cidade..."
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(it) => String(it.cd_cidade)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <Text style={styles.empty}>{emptyMessage}</Text>
            }
            renderItem={({ item }) => {
              const ativo = selectedId === item.cd_cidade;
              return (
                <Pressable
                  style={[styles.row, ativo && styles.rowActive]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{formatCidadeLabel(item)}</Text>
                  </View>
                  {ativo && (
                    <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
                  )}
                </Pressable>
              );
            }}
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
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
  },
  row: {
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  rowActive: { backgroundColor: '#eff6ff' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b', paddingHorizontal: 24 },
});
