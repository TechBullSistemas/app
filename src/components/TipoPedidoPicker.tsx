import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

export const TIPOS_PEDIDO = [
  { id: 1, descricao: 'Venda' },
  { id: 2, descricao: 'Recolhe Troca' },
  { id: 3, descricao: 'Troca' },
  { id: 4, descricao: 'Recolhe Devolução' },
  { id: 5, descricao: 'Bonificação' },
  { id: 6, descricao: 'Amostra' },
] as const;

export type TipoPedido = (typeof TIPOS_PEDIDO)[number];

export function TipoPedidoPicker({
  visible,
  selectedId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedId: number;
  onClose: () => void;
  onSelect: (tipo: TipoPedido) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Tipo do pedido</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <FlatList
            data={TIPOS_PEDIDO}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, item.id === selectedId && styles.selected]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.code}>{item.id}</Text>
                <Text style={styles.name}>{item.descricao}</Text>
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
  row: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'center' },
  selected: { backgroundColor: '#eff6ff' },
  code: { color: '#1e3a8a', fontWeight: '800', width: 24 },
  name: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
});
