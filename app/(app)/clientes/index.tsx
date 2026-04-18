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
import { useRouter } from 'expo-router';
import { listClientes, ClienteRow } from '@/db/repositories/clientes';

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
                <Text style={styles.name}>{item.nome ?? '(sem nome)'}</Text>
                <Text style={styles.sub}>
                  {item.cpf_cnpj || '—'}
                  {item.tp_pessoa ? ` • ${item.tp_pessoa}` : ''}
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
  searchBox: { padding: 12, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  row: { padding: 14 },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', marginTop: 2, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
