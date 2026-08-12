import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import {
  listProdutos,
  listProdutosVendidos,
  ProdutoRow,
} from '@/db/repositories/produtos';
import {
  getUltimasVendasCliente,
  type UltimaVendaProdutoCliente,
} from '@/db/repositories/notas';
import { FotoProdutoModal } from '@/components/FotoProdutoModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (produto: ProdutoRow, vlUltimaCompra: number | null) => void;
  cdCliente?: number | null;
  holdingId?: number | null;
}

interface HistoricoCliente {
  key: string;
  ultimasVendas: Map<number, UltimaVendaProdutoCliente>;
}

const EMPTY_HISTORY = new Map<number, UltimaVendaProdutoCliente>();

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ProdutoPicker({
  visible,
  onClose,
  onSelect,
  cdCliente,
  holdingId,
}: Props) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ProdutoRow[]>([]);
  const [somenteVendidos, setSomenteVendidos] = useState(false);
  const [historico, setHistorico] = useState<HistoricoCliente | null>(null);
  const [fotoExpandida, setFotoExpandida] = useState<{
    uri: string;
    descricao: string | null;
  } | null>(null);

  const clienteKey =
    cdCliente != null && holdingId != null ? `${cdCliente}|${holdingId}` : null;
  const historicoAtual =
    clienteKey != null && historico?.key === clienteKey
      ? historico.ultimasVendas
      : EMPTY_HISTORY;
  const historicoCarregado = clienteKey == null || historico?.key === clienteKey;

  useEffect(() => {
    if (!visible || clienteKey == null || cdCliente == null || holdingId == null) {
      return;
    }

    let alive = true;
    getUltimasVendasCliente(cdCliente, holdingId)
      .then((ultimasVendas) => {
        if (alive) setHistorico({ key: clienteKey, ultimasVendas });
      })
      .catch((err) => {
        console.warn('ProdutoPicker: histórico indisponível', err);
        if (alive) setHistorico({ key: clienteKey, ultimasVendas: EMPTY_HISTORY });
      });

    return () => {
      alive = false;
    };
  }, [cdCliente, clienteKey, holdingId, visible]);

  useEffect(() => {
    if (clienteKey == null && somenteVendidos) setSomenteVendidos(false);
  }, [clienteKey, somenteVendidos]);

  useEffect(() => {
    if (!visible) return;
    if (somenteVendidos && !historicoCarregado) {
      setItems([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const rows = somenteVendidos && holdingId != null
          ? await listProdutosVendidos(
              Array.from(historicoAtual.keys()),
              holdingId,
              search,
              100,
            )
          : await listProdutos(search, 100, holdingId ?? undefined);
        if (alive) setItems(rows);
      } catch (err) {
        console.warn('ProdutoPicker: falha ao listar produtos', err);
        if (alive) setItems([]);
      }
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [
    historicoAtual,
    historicoCarregado,
    holdingId,
    search,
    somenteVendidos,
    visible,
  ]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
            <Text style={styles.title}>Selecione o produto</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.input}
              placeholder="Buscar produto..."
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus
            />
            {clienteKey != null ? (
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Somente vendidos</Text>
                <Switch
                  value={somenteVendidos}
                  onValueChange={setSomenteVendidos}
                  accessibilityLabel="Mostrar somente produtos já vendidos para este cliente"
                  trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                  thumbColor={somenteVendidos ? '#2563eb' : '#f8fafc'}
                />
              </View>
            ) : null}
          </View>
          <FlatList
            data={items}
            keyExtractor={(it) => `${it.cd_produto}-${it.holding_id}`}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {somenteVendidos
                  ? 'Nenhum produto vendido para este cliente.'
                  : 'Nenhum produto encontrado.'}
              </Text>
            }
            renderItem={({ item }) => {
              const ultimaVenda = historicoAtual.get(item.cd_produto);
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onSelect(item, ultimaVenda?.vlUnitario ?? null);
                    onClose();
                  }}
                >
                  {item.foto_local || item.foto_url ? (
                    <Pressable
                      onPress={() =>
                        setFotoExpandida({
                          uri: (item.foto_local || item.foto_url) as string,
                          descricao: item.descricao,
                        })
                      }
                      hitSlop={6}
                    >
                      <Image
                        source={{
                          uri: (item.foto_local || item.foto_url) as string,
                        }}
                        style={styles.thumb}
                      />
                    </Pressable>
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.code}>#{item.cd_produto}</Text>
                    <Text style={styles.name}>{item.descricao}</Text>
                    <Text style={styles.sub}>
                      Ref: {item.referencia || '—'} • Estoque:{' '}
                      {item.qt_disponivel ?? 0}
                    </Text>
                    <Text style={styles.price}>
                      {fmtMoney(item.vl_venda ?? 0)}
                    </Text>
                    {ultimaVenda != null ? (
                      <Text style={styles.lastPrice}>
                        Última compra: {fmtMoney(ultimaVenda.vlUnitario)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
          <FotoProdutoModal
            visible={fotoExpandida != null}
            uri={fotoExpandida?.uri ?? null}
            descricao={fotoExpandida?.descricao}
            onClose={() => setFotoExpandida(null)}
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
  searchBox: { padding: 12, gap: 10 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabel: { color: '#334155', fontWeight: '600' },
  row: { padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f1f5f9' },
  thumbEmpty: { backgroundColor: '#e2e8f0' },
  code: { color: '#1e3a8a', fontSize: 11, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  price: { color: '#16a34a', fontWeight: '700', marginTop: 2 },
  lastPrice: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  empty: { color: '#94a3b8', textAlign: 'center', padding: 24 },
});
