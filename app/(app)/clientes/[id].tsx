import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ClienteRow, getClienteById, isClienteEditavel } from '@/db/repositories/clientes';

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
import {
  listNotasByCliente,
  listProdutosCompradosCliente,
  listTitulosByCliente,
  NotaFiscalRow,
  ProdutoCompradoCliente,
  TituloRow,
} from '@/db/repositories/notas';
import {
  listOutboxVendasByCliente,
  OutboxVendaRow,
} from '@/db/repositories/outbox';
import { listVisitasCliente, VisitaRow } from '@/db/repositories/visitas';
import { getProdutoById } from '@/db/repositories/produtos';

type AbaId = 'dados' | 'vendas' | 'produtos' | 'pendentes';

interface AbaDef {
  id: AbaId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const ABAS: AbaDef[] = [
  { id: 'dados', label: 'Dados', icon: 'person-outline' },
  { id: 'vendas', label: 'Vendas', icon: 'receipt-outline' },
  { id: 'produtos', label: 'Produtos', icon: 'cube-outline' },
  { id: 'pendentes', label: 'Pendentes', icon: 'time-outline' },
];

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

export default function ClienteDetalhe() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; h: string }>();
  const cdCliente = Number(params.id);
  const holdingId = Number(params.h);

  const [aba, setAba] = useState<AbaId>('dados');
  const [cli, setCli] = useState<ClienteRow | null>(null);
  const [notas, setNotas] = useState<NotaFiscalRow[]>([]);
  const [titulos, setTitulos] = useState<TituloRow[]>([]);
  const [visitas, setVisitas] = useState<VisitaRow[]>([]);
  const [produtos, setProdutos] = useState<ProdutoCompradoCliente[]>([]);
  const [pendentes, setPendentes] = useState<OutboxVendaRow[]>([]);
  const [produtoFotos, setProdutoFotos] = useState<Record<number, string | null>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, n, t, v, p, pen] = await Promise.all([
      getClienteById(cdCliente, holdingId),
      listNotasByCliente(cdCliente, holdingId),
      listTitulosByCliente(cdCliente, holdingId),
      listVisitasCliente(cdCliente, holdingId),
      listProdutosCompradosCliente(cdCliente, holdingId),
      listOutboxVendasByCliente(cdCliente, holdingId),
    ]);
    setCli(c ?? null);
    setNotas(n);
    setTitulos(t);
    setVisitas(v);
    setProdutos(p);
    setPendentes(pen);

    const fotosMap: Record<number, string | null> = {};
    await Promise.all(
      p.slice(0, 60).map(async (it) => {
        const prod = await getProdutoById(it.cd_produto, holdingId);
        fotosMap[it.cd_produto] = prod?.foto_local || prod?.foto_url || null;
      }),
    );
    setProdutoFotos(fotosMap);
    setLoading(false);
  }, [cdCliente, holdingId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !cli) {
    return <ActivityIndicator style={{ marginTop: 24 }} />;
  }

  const tituloAberto = titulos.filter((t) => !t.vl_pago || t.vl_pago < (t.vl_titulo ?? 0));
  const enderecoLine = [cli.endereco, cli.numero, cli.bairro].filter(Boolean).join(', ');
  const cidadeLine = cli.cidade_nome
    ? `${cli.cidade_nome}${cli.estado ? `/${cli.estado}` : ''}`
    : null;

  function tirarPedido() {
    router.push({
      pathname: '/(app)/pedidos/novo',
      params: { cd_cliente: String(cdCliente), holding_id: String(holdingId) },
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <Text style={styles.titulo}>{cli.nome}</Text>
          {isClienteEditavel(cli) ? (
            <View style={styles.chipPendente}>
              <Ionicons name="cloud-upload-outline" size={11} color="#92400e" />
              <Text style={styles.chipPendenteText}>Pendente envio</Text>
            </View>
          ) : null}
        </View>
        {cli.razao_social ? <Text style={styles.subtle}>{cli.razao_social}</Text> : null}
        <Text style={styles.subtle}>{fmtCpfCnpj(cli.cpf_cnpj) || '—'}</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.tirarBtn} onPress={tirarPedido}>
            <Ionicons name="cart" size={18} color="#fff" />
            <Text style={styles.tirarBtnText}>Tirar Pedido</Text>
          </Pressable>
          {isClienteEditavel(cli) ? (
            <Pressable
              style={styles.editBtn}
              onPress={() =>
                router.push({
                  pathname: '/(app)/clientes/editar/[id]',
                  params: { id: String(cdCliente), h: String(holdingId) },
                })
              }
            >
              <Ionicons name="create-outline" size={18} color="#1e3a8a" />
              <Text style={styles.editBtnText}>Editar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.tabsRow}>
        {ABAS.map((a) => {
          const ativo = aba === a.id;
          return (
            <Pressable
              key={a.id}
              style={[styles.tab, ativo && styles.tabAtiva]}
              onPress={() => setAba(a.id)}
            >
              <Ionicons
                name={a.icon}
                size={16}
                color={ativo ? '#fff' : '#475569'}
              />
              <Text style={[styles.tabText, ativo && styles.tabTextAtiva]}>
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        {aba === 'dados' && (
          <>
            <Section title="Contato">
              <Linha label="Telefone" value={cli.fone || '—'} />
              <Linha label="Celular" value={cli.celular || '—'} />
              <Linha label="E-mail" value={cli.email || '—'} />
            </Section>
            <Section title="Endereço">
              <Linha label="Logradouro" value={enderecoLine || '—'} />
              <Linha label="Cidade" value={cidadeLine || '—'} />
              <Linha label="CEP" value={cli.cep || '—'} />
            </Section>
            <Section title="Financeiro (em aberto)">
              {tituloAberto.length === 0 ? (
                <Text style={styles.subtle}>Sem títulos em aberto.</Text>
              ) : (
                tituloAberto.map((t) => (
                  <View key={`${t.cd_titulo}-${t.cd_empresa}`} style={styles.linhaItem}>
                    <Text style={styles.linhaItemMain}>Título {t.cd_titulo}</Text>
                    <Text style={styles.linhaItemSub}>
                      Venc.: {fmtDate(t.dt_vencimento)} • {fmtMoney(t.vl_titulo)}
                    </Text>
                  </View>
                ))
              )}
            </Section>
            <Section title={`Visitas (${visitas.length})`}>
              {visitas.length === 0 ? (
                <Text style={styles.subtle}>Sem visitas.</Text>
              ) : (
                visitas.slice(0, 10).map((v, i) => (
                  <View key={`${v.cd_visita ?? 'l'}-${i}`} style={styles.linhaItem}>
                    <Text style={styles.linhaItemMain}>
                      {fmtDate(v.dt_visita)}{' '}
                      {v.id_comprou ? '• Comprou' : '• Não comprou'}
                    </Text>
                    {v.motivo_nao_comprou ? (
                      <Text style={styles.linhaItemSub}>Motivo: {v.motivo_nao_comprou}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </Section>
          </>
        )}

        {aba === 'vendas' && (
          <Section title={`Vendas (${notas.length})`}>
            {notas.length === 0 ? (
              <Text style={styles.subtle}>Nenhuma venda registrada.</Text>
            ) : (
              notas.map((n) => (
                <Pressable
                  key={`${n.cd_nota}-${n.cd_empresa}`}
                  style={styles.cardLinha}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/vendas/[id]',
                      params: {
                        id: String(n.cd_nota),
                        e: String(n.cd_empresa),
                        h: String(n.holding_id),
                      },
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaItemMain}>NF {n.cd_nota}</Text>
                    <Text style={styles.linhaItemSub}>{fmtDate(n.dt_emissao)}</Text>
                  </View>
                  <Text style={styles.cardTotal}>{fmtMoney(n.vl_total)}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </Pressable>
              ))
            )}
          </Section>
        )}

        {aba === 'produtos' && (
          <Section title={`Produtos comprados (${produtos.length})`}>
            {produtos.length === 0 ? (
              <Text style={styles.subtle}>Nenhum produto encontrado nas vendas.</Text>
            ) : (
              produtos.map((p) => {
                const foto = produtoFotos[p.cd_produto];
                return (
                  <Pressable
                    key={p.cd_produto}
                    style={styles.cardLinha}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/clientes/produto/[cdProduto]',
                        params: {
                          cdProduto: String(p.cd_produto),
                          cliente: String(cdCliente),
                          h: String(holdingId),
                        },
                      })
                    }
                  >
                    {foto ? (
                      <Image source={{ uri: foto }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaItemMain} numberOfLines={2}>
                        {p.descricao ?? `Produto ${p.cd_produto}`}
                      </Text>
                      <Text style={styles.linhaItemSub}>
                        Qtd. {p.qt_total} • {p.vendas_count} venda
                        {p.vendas_count !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Text style={styles.cardTotal}>{fmtMoney(p.vl_total)}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                  </Pressable>
                );
              })
            )}
          </Section>
        )}

        {aba === 'pendentes' && (
          <Section title={`Pedidos pendentes (${pendentes.length})`}>
            {pendentes.length === 0 ? (
              <Text style={styles.subtle}>Nenhum pedido pendente para este cliente.</Text>
            ) : (
              pendentes.map((p) => (
                <Pressable
                  key={p.client_id}
                  style={styles.cardLinha}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/pedidos/[clientId]',
                      params: { clientId: p.client_id },
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaItemMain}>
                      {fmtDate(p.created_at)}
                    </Text>
                    <Text style={styles.linhaItemSub}>
                      Status: {p.status === 'pending' ? 'Aguardando envio' : p.status}
                      {p.attempts > 0 ? ` • ${p.attempts} tentativa(s)` : ''}
                    </Text>
                    {p.last_error ? (
                      <Text style={[styles.linhaItemSub, { color: '#dc2626' }]}>
                        {p.last_error}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.cardTotal}>{fmtMoney(p.vl_total)}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </Pressable>
              ))
            )}
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaLabel}>{label}</Text>
      <Text style={styles.linhaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  headerCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 4,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  titulo: { fontSize: 18, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  subtle: { color: '#64748b', fontSize: 12 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
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
  tirarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  tirarBtnText: { color: '#fff', fontWeight: '700' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0e7ff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  editBtnText: { color: '#1e3a8a', fontWeight: '700' },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  tabAtiva: { backgroundColor: '#1e3a8a' },
  tabText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  tabTextAtiva: { color: '#fff' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  linhaLabel: { color: '#64748b' },
  linhaValue: { color: '#0f172a', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  linhaItem: { paddingVertical: 6, borderTopWidth: 1, borderColor: '#f1f5f9' },
  linhaItemMain: { color: '#0f172a', fontWeight: '600' },
  linhaItemSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  cardLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardTotal: { color: '#16a34a', fontWeight: '700' },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f1f5f9' },
  thumbEmpty: { backgroundColor: '#e2e8f0' },
});
