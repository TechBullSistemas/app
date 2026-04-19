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
import { getDb } from '@/db/database';

export interface CondicaoOpt {
  cd_condicao: number;
  descricao: string;
  qt_parcelas: number | null;
  raw_json: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (cond: CondicaoOpt) => void;
  selectedId?: number | null;
}

export function CondicaoPagtoPicker({
  visible,
  onClose,
  onSelect,
  selectedId,
}: Props) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CondicaoOpt[]>([]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<CondicaoOpt>(
        'SELECT cd_condicao, descricao, qt_parcelas, raw_json FROM condicao_pagto ORDER BY descricao',
      );
      setItems(rows);
    })();
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        String(it.cd_condicao).includes(q) ||
        (it.descricao || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Condição de pagamento</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.input}
              placeholder="Buscar condição..."
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(it) => String(it.cd_condicao)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <Text style={styles.empty}>Nenhuma condição encontrada.</Text>
            }
            renderItem={({ item }) => {
              const ativo = selectedId === item.cd_condicao;
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
                      #{item.cd_condicao} • {item.descricao}
                    </Text>
                    {item.qt_parcelas ? (
                      <Text style={styles.sub}>
                        {item.qt_parcelas}{' '}
                        {item.qt_parcelas === 1 ? 'parcela' : 'parcelas'}
                      </Text>
                    ) : null}
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
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
