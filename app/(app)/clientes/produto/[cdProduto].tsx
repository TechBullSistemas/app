import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  listNotasByClienteProduto,
  NotaProdutoLinha,
} from '@/db/repositories/notas';
import { getProdutoById, ProdutoRow } from '@/db/repositories/produtos';
import { getClienteById, ClienteRow } from '@/db/repositories/clientes';

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('pt-BR');
  } catch {
    return v;
  }
}

export default function ClienteProdutoVendas() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    cdProduto: string;
    cliente: string;
    h: string;
  }>();
  const cdProduto = Number(params.cdProduto);
  const cdCliente = Number(params.cliente);
  const holdingId = Number(params.h);

  const [produto, setProduto] = useState<ProdutoRow | null>(null);
  const [cliente, setCliente] = useState<ClienteRow | null>(null);
  const [linhas, setLinhas] = useState<NotaProdutoLinha[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [p, c, l] = await Promise.all([
        getProdutoById(cdProduto, holdingId),
        getClienteById(cdCliente, holdingId),
        listNotasByClienteProduto(cdCliente, holdingId, cdProduto),
      ]);
      setProduto(p ?? null);
      setCliente(c ?? null);
      setLinhas(l);
      setLoading(false);
    })();
  }, [cdCliente, cdProduto, holdingId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  const totalQt = linhas.reduce((acc, l) => acc + l.qt, 0);
  const totalVl = linhas.reduce((acc, l) => acc + l.vlTotal, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {produto?.foto_local || produto?.foto_url ? (
            <Image
              source={{ uri: (produto?.foto_local || produto?.foto_url) as string }}
              style={styles.thumb}
            />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {produto?.descricao ?? `Produto ${cdProduto}`}
            </Text>
            <Text style={styles.subtle}>Ref: {produto?.referencia ?? '—'}</Text>
            {cliente ? (
              <Text style={styles.subtle}>Cliente: {cliente.nome}</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.cardResumo}>
        <View style={styles.resumoBox}>
          <Text style={styles.resumoLabel}>Vendas</Text>
          <Text style={styles.resumoValor}>{linhas.length}</Text>
        </View>
        <View style={styles.resumoBox}>
          <Text style={styles.resumoLabel}>Qtd. total</Text>
          <Text style={styles.resumoValor}>{totalQt}</Text>
        </View>
        <View style={styles.resumoBox}>
          <Text style={styles.resumoLabel}>Valor total</Text>
          <Text style={[styles.resumoValor, { color: '#16a34a' }]}>{fmtMoney(totalVl)}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vendas deste produto ({linhas.length})</Text>
        {linhas.length === 0 ? (
          <Text style={styles.subtle}>Nenhuma venda encontrada.</Text>
        ) : (
          linhas.map((l, idx) => (
            <Pressable
              key={`${l.nota.cd_nota}-${l.nota.cd_empresa}-${idx}`}
              style={styles.linha}
              onPress={() =>
                router.push({
                  pathname: '/(app)/vendas/[id]',
                  params: {
                    id: String(l.nota.cd_nota),
                    e: String(l.nota.cd_empresa),
                    h: String(l.nota.holding_id),
                  },
                })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.linhaMain}>NF {l.nota.cd_nota}</Text>
                <Text style={styles.linhaSub}>
                  {fmtDate(l.nota.dt_emissao)} • {l.qt}× {fmtMoney(l.vlUnitario)}
                </Text>
              </View>
              <Text style={styles.linhaTotal}>{fmtMoney(l.vlTotal)}</Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  subtle: { color: '#64748b', fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#f1f5f9' },
  thumbEmpty: { backgroundColor: '#e2e8f0' },
  cardResumo: { flexDirection: 'row', gap: 8 },
  resumoBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  resumoLabel: { color: '#64748b', fontSize: 11 },
  resumoValor: { color: '#0f172a', fontWeight: '800', fontSize: 18 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  linhaMain: { color: '#0f172a', fontWeight: '700' },
  linhaSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  linhaTotal: { color: '#16a34a', fontWeight: '700' },
});
