import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { listMensagens } from '@/db/repositories/auxiliares';

export default function MensagensScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMensagens()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(it) => `${it.cd_mensagem}-${it.holding_id}`}
      style={{ backgroundColor: '#fff' }}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      ListEmptyComponent={<Text style={styles.empty}>Nenhuma mensagem.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.title}>{item.titulo || '(sem título)'}</Text>
          {item.dt_envio ? <Text style={styles.sub}>{item.dt_envio}</Text> : null}
          {item.mensagem ? <Text style={styles.body}>{item.mensagem}</Text> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { padding: 14 },
  title: { fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  body: { color: '#334155', marginTop: 6 },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b' },
});
