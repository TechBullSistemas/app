import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { listClientes, ClienteRow } from '@/db/repositories/clientes';

function tpPessoaLabel(tp: string | null | undefined) {
  if (tp === 'F') return 'Física';
  if (tp === 'J') return 'Jurídica';
  return null;
}

function fmtCpfCnpj(raw: string | null | undefined) {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(
      8,
      12,
    )}-${d.slice(12)}`;
  }
  return raw;
}

export default function ClientesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await listClientes(search, 200);
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

  // Recarrega ao voltar para a tela (após criar cliente novo, p.ex.)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listClientes(search, 200).then((rows) => {
        if (alive) setItems(rows);
      });
      return () => {
        alive = false;
      };
    }, [search]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          placeholder="Buscar por nome, razão ou CPF/CNPJ"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        <Pressable
          style={styles.newBtn}
          onPress={() => router.push('/(app)/clientes/novo')}
        >
          <Ionicons name="person-add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>Novo</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.cd_cliente}-${it.holding_id}`}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum cliente encontrado.</Text>}
          renderItem={({ item }) => {
            const enderecoLine = [
              item.endereco,
              item.numero,
              item.bairro,
            ]
              .filter(Boolean)
              .join(', ');
            const cidadeLine = item.cidade_nome
              ? `${item.cidade_nome}${item.estado ? `/${item.estado}` : ''}`
              : null;
            const pendente = item.origem === 'local' && (item.pending_sync ?? 0) === 1;
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/clientes/[id]',
                    params: { id: String(item.cd_cliente), h: String(item.holding_id) },
                  })
                }
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.name}>{item.nome ?? '(sem nome)'}</Text>
                  {pendente ? (
                    <View style={styles.chipPendente}>
                      <Ionicons name="cloud-upload-outline" size={11} color="#92400e" />
                      <Text style={styles.chipPendenteText}>Pendente envio</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sub}>
                  {fmtCpfCnpj(item.cpf_cnpj) || '—'}
                  {tpPessoaLabel(item.tp_pessoa)
                    ? ` • ${tpPessoaLabel(item.tp_pessoa)}`
                    : ''}
                </Text>
                {enderecoLine ? <Text style={styles.sub}>{enderecoLine}</Text> : null}
                {cidadeLine ? <Text style={styles.sub}>{cidadeLine}</Text> : null}
                {item.celular ? <Text style={styles.sub}>📱 {item.celular}</Text> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBox: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  newBtnText: { color: '#fff', fontWeight: '700' },
  row: { padding: 14 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipPendente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipPendenteText: { color: '#92400e', fontSize: 10, fontWeight: '700' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', marginTop: 2, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
