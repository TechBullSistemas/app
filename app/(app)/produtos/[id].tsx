import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getProdutoById, ProdutoRow } from '@/db/repositories/produtos';

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ProdutoDetalhe() {
  const params = useLocalSearchParams<{ id: string; h: string }>();
  const cdProduto = Number(params.id);
  const holdingId = Number(params.h);
  const [item, setItem] = useState<ProdutoRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await getProdutoById(cdProduto, holdingId);
      setItem(r ?? null);
      setLoading(false);
    })();
  }, [cdProduto, holdingId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (!item) return <Text style={{ padding: 16 }}>Produto não encontrado.</Text>;

  const photo = item.foto_local || item.foto_url || null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={[styles.image, styles.imageEmpty]}>
          <Text style={{ color: '#94a3b8' }}>SEM FOTO</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>{item.descricao}</Text>
        <Text style={styles.subtle}>Ref.: {item.referencia || '—'}</Text>
        <Text style={styles.price}>{fmtMoney(item.vl_venda)}</Text>
        {item.vl_atacado ? (
          <Text style={styles.subtle}>Atacado: {fmtMoney(item.vl_atacado)}</Text>
        ) : null}
        {item.vl_promocao ? (
          <Text style={styles.subtle}>Promoção: {fmtMoney(item.vl_promocao)}</Text>
        ) : null}
        <Text style={styles.subtle}>Estoque disponível: {item.qt_disponivel ?? 0}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  image: { width: '100%', height: 280, backgroundColor: '#fff', borderRadius: 12 },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, gap: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtle: { color: '#475569' },
  price: { color: '#16a34a', fontWeight: '800', fontSize: 22, marginVertical: 6 },
});
