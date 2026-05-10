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
import { Ionicons } from '@expo/vector-icons';
import type { CondicaoPrecoOpt } from '@/services/pricing';

interface Props {
  visible: boolean;
  title?: string;
  options: CondicaoPrecoOpt[];
  selectedId?: number | null;
  onClose: () => void;
  onSelect: (c: CondicaoPrecoOpt) => void;
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Picker reutilizável para escolher a Condição de Preço por linha de item.
 * Diferente do `TabelaPrecoPicker`, o caller é quem precalcula as opções
 * (com `vlValor` já resolvido pelo motor) — assim o modal apenas exibe.
 */
export function CondicaoPrecoPicker({
  visible,
  title = 'Condição de preço',
  options,
  selectedId,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(it) => String(it.cdCondicaoPreco)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Nenhuma condição de preço cadastrada.
              </Text>
            }
            renderItem={({ item }) => {
              const ativo = selectedId === item.cdCondicaoPreco;
              return (
                <Pressable
                  style={[styles.row, ativo && styles.rowActive]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      #{item.cdCondicaoPreco} • {item.descricao}
                    </Text>
                    <Text style={styles.subtle}>
                      {fmtMoney(item.vlValor)}
                      {item.idPromocao ? ' • promoção' : ''}
                      {item.idUltimaVenda ? ' • última venda' : ''}
                      {item.prAcrescimo > 0 && !item.idUltimaVenda
                        ? ` • +${item.prAcrescimo}%`
                        : ''}
                    </Text>
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
  row: {
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  rowActive: { backgroundColor: '#eff6ff' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  subtle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
