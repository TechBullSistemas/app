import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
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
  listProdutosDoAgrupador,
  listProdutosVendidos,
  ProdutoRow,
} from '@/db/repositories/produtos';
import {
  getUltimasVendasCliente,
  type UltimaVendaProdutoCliente,
} from '@/db/repositories/notas';
import { FotoProdutoModal } from '@/components/FotoProdutoModal';
import { codigoProduto } from '@/utils/codigoProduto';
import {
  caracteristicasDoProduto,
  temAgrupador,
} from '@/utils/produtoAgrupador';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (produto: ProdutoRow, vlUltimaCompra: number | null) => void;
  cdCliente?: number | null;
  holdingId?: number | null;
  mostrarUltimaCompra?: boolean;
  /** Tocar num produto com agrupador abre os produtos do mesmo agrupador. */
  selecaoPorAgrupador?: boolean;
  cdTabelaPreco?: number | null;
  resolvePreco?: (produto: ProdutoRow) => Promise<number | null>;
}

interface Variacoes {
  /** Produto tocado na lista; fica destacado entre as variações. */
  origem: ProdutoRow;
  itens: ProdutoRow[];
}

interface HistoricoCliente {
  key: string;
  ultimasVendas: Map<number, UltimaVendaProdutoCliente>;
}

const EMPTY_HISTORY = new Map<number, UltimaVendaProdutoCliente>();

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function aplicarPrecos(
  rows: ProdutoRow[],
  resolvePreco?: (produto: ProdutoRow) => Promise<number | null>,
): Promise<ProdutoRow[]> {
  if (!resolvePreco) return rows;
  return Promise.all(
    rows.map(async (produto) => {
      const preco = await resolvePreco(produto);
      return preco != null && Number.isFinite(preco) && preco > 0
        ? { ...produto, vl_venda: preco }
        : produto;
    }),
  );
}

export function ProdutoPicker({
  visible,
  onClose,
  onSelect,
  cdCliente,
  holdingId,
  mostrarUltimaCompra = true,
  selecaoPorAgrupador = false,
  cdTabelaPreco,
  resolvePreco,
}: Props) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ProdutoRow[]>([]);
  const [somenteVendidos, setSomenteVendidos] = useState(false);
  const [historico, setHistorico] = useState<HistoricoCliente | null>(null);
  const [fotoExpandida, setFotoExpandida] = useState<{
    uri: string;
    descricao: string | null;
  } | null>(null);
  const [calculandoPrecos, setCalculandoPrecos] = useState(false);
  const [variacoes, setVariacoes] = useState<Variacoes | null>(null);
  const [abrindoVariacoes, setAbrindoVariacoes] = useState<number | null>(null);

  const clienteKey =
    cdCliente != null && holdingId != null ? `${cdCliente}|${holdingId}` : null;
  const historicoAtual =
    clienteKey != null && historico?.key === clienteKey
      ? historico.ultimasVendas
      : EMPTY_HISTORY;
  const historicoCarregado =
    clienteKey == null || historico?.key === clienteKey;

  useEffect(() => {
    if (
      !visible ||
      clienteKey == null ||
      cdCliente == null ||
      holdingId == null
    ) {
      return;
    }

    let alive = true;
    getUltimasVendasCliente(cdCliente, holdingId)
      .then((ultimasVendas) => {
        if (alive) setHistorico({ key: clienteKey, ultimasVendas });
      })
      .catch((err) => {
        console.warn('ProdutoPicker: histórico indisponível', err);
        if (alive)
          setHistorico({ key: clienteKey, ultimasVendas: EMPTY_HISTORY });
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
      setCalculandoPrecos(false);
      return;
    }
    let alive = true;
    setItems([]);
    setCalculandoPrecos(true);
    const t = setTimeout(async () => {
      try {
        const rows =
          somenteVendidos && holdingId != null
            ? await listProdutosVendidos(
                Array.from(historicoAtual.keys()),
                holdingId,
                search,
                100,
                true,
                cdTabelaPreco,
              )
            : await listProdutos(
                search,
                100,
                holdingId ?? undefined,
                true,
                cdTabelaPreco,
              );
        const rowsComPreco = await aplicarPrecos(rows, resolvePreco);
        if (alive) setItems(rowsComPreco);
      } catch (err) {
        console.warn('ProdutoPicker: falha ao listar produtos', err);
        if (alive) setItems([]);
      } finally {
        if (alive) setCalculandoPrecos(false);
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
    cdTabelaPreco,
    resolvePreco,
    visible,
  ]);

  useEffect(() => {
    if (!visible) setVariacoes(null);
  }, [visible]);

  function selecionar(item: ProdutoRow) {
    onSelect(item, historicoAtual.get(item.cd_produto)?.vlUnitario ?? null);
    onClose();
  }

  async function tocarProduto(item: ProdutoRow) {
    if (!selecaoPorAgrupador || !temAgrupador(item.cd_agrupador)) {
      selecionar(item);
      return;
    }
    if (abrindoVariacoes != null) return;
    setAbrindoVariacoes(item.cd_produto);
    try {
      const itens = await aplicarPrecos(
        await listProdutosDoAgrupador(
          Number(item.cd_agrupador),
          item.holding_id,
          true,
          cdTabelaPreco,
        ),
        resolvePreco,
      );
      // Só o próprio produto disponível: não há o que escolher.
      if (itens.length <= 1) {
        selecionar(item);
        return;
      }
      Keyboard.dismiss();
      setVariacoes({ origem: item, itens });
    } catch (err) {
      console.warn('ProdutoPicker: variações indisponíveis', err);
      selecionar(item);
    } finally {
      setAbrindoVariacoes(null);
    }
  }

  function renderFoto(item: ProdutoRow, style: object) {
    const uri = item.foto_local || item.foto_url;
    if (!uri) return <View style={[style, styles.thumbEmpty]} />;
    return (
      <Pressable
        onPress={() => setFotoExpandida({ uri, descricao: item.descricao })}
        hitSlop={6}
      >
        <Image source={{ uri }} style={style} />
      </Pressable>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={variacoes ? () => setVariacoes(null) : onClose}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {variacoes
                ? variacoes.origem.ds_agrupador || 'Escolha a variação'
                : 'Selecione o produto'}
            </Text>
            <Pressable
              onPress={variacoes ? () => setVariacoes(null) : onClose}
              hitSlop={10}
            >
              <Text style={styles.close}>
                {variacoes ? 'Voltar' : 'Fechar'}
              </Text>
            </Pressable>
          </View>
          {variacoes ? (
            <FlatList
              data={variacoes.itens}
              keyExtractor={(it) => `${it.cd_produto}-${it.holding_id}`}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListHeaderComponent={
                <Text style={styles.variacoesInfo}>
                  {variacoes.itens.length} produtos neste agrupador. Toque no
                  que vai para o pedido.
                </Text>
              }
              renderItem={({ item }) => {
                const ultimaVenda = historicoAtual.get(item.cd_produto);
                const caracteristicas = caracteristicasDoProduto(
                  item.caracteristicas_json,
                );
                return (
                  <Pressable
                    style={[
                      styles.row,
                      item.cd_produto === variacoes.origem.cd_produto &&
                        styles.rowOrigem,
                    ]}
                    onPress={() => selecionar(item)}
                  >
                    {renderFoto(item, styles.thumbVariacao)}
                    <View style={{ flex: 1 }}>
                      {caracteristicas.length > 0 ? (
                        <View style={styles.chips}>
                          {caracteristicas.map((c) => (
                            <Text key={c.nome} style={styles.chip}>
                              {c.nome}: {c.valor}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                      <Text style={styles.code}>
                        #{codigoProduto(item.cd_produto, item.cd_produto_duapi)}
                      </Text>
                      <Text style={styles.name}>{item.descricao}</Text>
                      <Text style={styles.stock}>
                        Estoque: {item.qt_disponivel ?? 0}
                      </Text>
                      <Text style={styles.price}>
                        {fmtMoney(item.vl_venda ?? 0)}
                      </Text>
                      {mostrarUltimaCompra && ultimaVenda != null ? (
                        <Text style={styles.lastPrice}>
                          Última compra: {fmtMoney(ultimaVenda.vlUnitario)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          ) : null}
          <View style={[styles.lista, variacoes ? styles.oculto : null]}>
            <View style={styles.searchBox}>
              <TextInput
                style={styles.input}
                placeholder="Buscar por código, descrição ou referência"
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
                calculandoPrecos ? (
                  <View style={styles.loadingPrice}>
                    <ActivityIndicator color="#2563eb" />
                    <Text style={styles.empty}>Calculando preços...</Text>
                  </View>
                ) : (
                  <Text style={styles.empty}>
                    {somenteVendidos
                      ? 'Nenhum produto vendido para este cliente.'
                      : 'Nenhum produto encontrado.'}
                  </Text>
                )
              }
              renderItem={({ item }) => {
                const ultimaVenda = historicoAtual.get(item.cd_produto);
                const comVariacoes =
                  selecaoPorAgrupador && temAgrupador(item.cd_agrupador);
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => tocarProduto(item)}
                  >
                    {renderFoto(item, styles.thumb)}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.code}>
                        #{codigoProduto(item.cd_produto, item.cd_produto_duapi)}
                      </Text>
                      <Text style={styles.name}>{item.descricao}</Text>
                      <Text style={styles.sub}>
                        Ref: {item.referencia || '—'}
                      </Text>
                      <Text style={styles.stock}>
                        Estoque: {item.qt_disponivel ?? 0}
                      </Text>
                      <Text style={styles.price}>
                        {fmtMoney(item.vl_venda ?? 0)}
                      </Text>
                      {mostrarUltimaCompra && ultimaVenda != null ? (
                        <Text style={styles.lastPrice}>
                          Última compra: {fmtMoney(ultimaVenda.vlUnitario)}
                        </Text>
                      ) : null}
                    </View>
                    {abrindoVariacoes === item.cd_produto ? (
                      <ActivityIndicator color="#2563eb" />
                    ) : comVariacoes ? (
                      <Text style={styles.variacoesLink}>Variações ›</Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>
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
  title: { color: '#fff', fontWeight: '700', fontSize: 16, flex: 1 },
  close: { color: '#fff', fontWeight: '600' },
  searchBox: { padding: 12, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabel: { color: '#334155', fontWeight: '600' },
  row: { padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f1f5f9' },
  thumbVariacao: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  thumbEmpty: { backgroundColor: '#e2e8f0' },
  lista: { flex: 1 },
  // Mantém a busca e a posição da lista ao voltar das variações.
  oculto: { display: 'none' },
  rowOrigem: { backgroundColor: '#eff6ff' },
  variacoesInfo: { color: '#64748b', fontSize: 12, padding: 12 },
  variacoesLink: { color: '#2563eb', fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: {
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  code: { color: '#1e3a8a', fontSize: 11, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  stock: { color: '#334155', fontSize: 16, fontWeight: '700', marginTop: 2 },
  price: { color: '#16a34a', fontWeight: '700', marginTop: 2 },
  lastPrice: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  empty: { color: '#94a3b8', textAlign: 'center', padding: 24 },
  loadingPrice: { alignItems: 'center', paddingTop: 24 },
});
