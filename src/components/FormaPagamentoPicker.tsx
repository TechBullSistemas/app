import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { getDb } from "@/db/database";

export interface FormaPagamentoOpt {
  cd_forma: number;
  descricao: string;
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

interface Props {
  visible: boolean;
  holdingId: number;
  onClose: () => void;
  onSelect: (forma: FormaPagamentoOpt) => void;
  selectedId?: number | null;
}

export function FormaPagamentoPicker({
  visible,
  holdingId,
  onClose,
  onSelect,
  selectedId,
}: Props) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<FormaPagamentoOpt[]>([]);

  useEffect(() => {
    if (!visible) return;

    let alive = true;
    getDb()
      .then((db) =>
        db.getAllAsync<FormaPagamentoOpt>(
          `SELECT cd_forma, descricao
             FROM forma_pagamento
            WHERE holding_id = ?
            ORDER BY descricao`,
          [holdingId],
        ),
      )
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .catch(() => {
        if (alive) setItems([]);
      });

    return () => {
      alive = false;
    };
  }, [holdingId, visible]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter(
      (item) =>
        String(item.cd_forma).includes(query) ||
        (item.descricao || "").toLowerCase().includes(query),
    );
  }, [items, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text style={styles.title}>Forma de pagamento</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.input}
              placeholder="Buscar forma..."
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.cd_forma)}
            ItemSeparatorComponent={ListSeparator}
            ListEmptyComponent={
              <Text style={styles.empty}>Nenhuma forma encontrada.</Text>
            }
            renderItem={({ item }) => {
              const selected = selectedId === item.cd_forma;
              return (
                <Pressable
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Text style={styles.name}>
                    #{item.cd_forma} • {item.descricao}
                  </Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color="#16a34a"
                    />
                  ) : null}
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
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#1e3a8a",
  },
  title: { color: "#fff", fontWeight: "700", fontSize: 16 },
  close: { color: "#fff", fontWeight: "600" },
  searchBox: { padding: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
  },
  row: {
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  rowSelected: { backgroundColor: "#eff6ff" },
  separator: { height: 1, backgroundColor: "#e2e8f0" },
  name: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  empty: { textAlign: "center", marginTop: 32, color: "#64748b" },
});
