import { useEffect, useState } from 'react';
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
import { ClienteRow, listClientes } from '@/db/repositories/clientes';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (cliente: ClienteRow) => void;
}

export function ClientePicker({ visible, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ClienteRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const t = setTimeout(async () => {
      const rows = await listClientes(search, 100);
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
            <Text style={styles.title}>Selecione o cliente</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.input}
              placeholder="Buscar cliente..."
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          <FlatList
            data={items}
            keyExtractor={(it) => `${it.cd_cliente}-${it.holding_id}`}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.name}>{item.nome}</Text>
                <Text style={styles.sub}>{item.cpf_cnpj || '—'}</Text>
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
  row: { padding: 14 },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
});
