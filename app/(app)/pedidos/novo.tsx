import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import { ClientePicker } from '@/components/ClientePicker';
import { ProdutoPicker } from '@/components/ProdutoPicker';
import { ClienteRow } from '@/db/repositories/clientes';
import { ProdutoRow } from '@/db/repositories/produtos';
import { getDb } from '@/db/database';
import { useSessionStore } from '@/stores/session';
import { enqueueVenda } from '@/db/repositories/outbox';

interface ItemPedido {
  cdProduto: number;
  descricao: string;
  qt: number;
  vlUnitario: number;
}

interface CondicaoOpt {
  cd_condicao: number;
  descricao: string;
  qt_parcelas: number | null;
}

interface FormaOpt {
  cd_forma: number;
  descricao: string;
}

interface TipoVendaOpt {
  cd_tipo: number;
  descricao: string;
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function NovoPedido() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);

  const [cliPickerOpen, setCliPickerOpen] = useState(false);
  const [prodPickerOpen, setProdPickerOpen] = useState(false);
  const [cliente, setCliente] = useState<ClienteRow | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [obs, setObs] = useState('');

  const [condicoes, setCondicoes] = useState<CondicaoOpt[]>([]);
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  const [tipos, setTipos] = useState<TipoVendaOpt[]>([]);
  const [cdCondicao, setCdCondicao] = useState<number | null>(null);
  const [cdForma, setCdForma] = useState<number | null>(null);
  const [cdTipoVenda, setCdTipoVenda] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const cs = await db.getAllAsync<CondicaoOpt>(
        'SELECT cd_condicao, descricao, qt_parcelas FROM condicao_pagto ORDER BY descricao',
      );
      const fs = await db.getAllAsync<FormaOpt>(
        'SELECT cd_forma, descricao FROM forma_pagamento ORDER BY descricao',
      );
      const ts = await db.getAllAsync<TipoVendaOpt>(
        'SELECT cd_tipo, descricao FROM tipo_venda ORDER BY descricao',
      );
      setCondicoes(cs);
      setFormas(fs);
      setTipos(ts);
      if (ts.length === 1) setCdTipoVenda(ts[0].cd_tipo);
      if (fs.length === 1) setCdForma(fs[0].cd_forma);
      if (cs.length === 1) setCdCondicao(cs[0].cd_condicao);
    })();
  }, []);

  const condicaoSel = useMemo(
    () => condicoes.find((c) => c.cd_condicao === cdCondicao) || null,
    [condicoes, cdCondicao],
  );
  const formaSel = useMemo(
    () => formas.find((f) => f.cd_forma === cdForma) || null,
    [formas, cdForma],
  );
  const tipoSel = useMemo(
    () => tipos.find((t) => t.cd_tipo === cdTipoVenda) || null,
    [tipos, cdTipoVenda],
  );

  const total = useMemo(
    () => itens.reduce((acc, it) => acc + it.qt * it.vlUnitario, 0),
    [itens],
  );

  const parcelas = useMemo(() => {
    const qt = condicaoSel?.qt_parcelas ?? 1;
    if (qt < 1) return [];
    const base = Math.round((total / qt) * 100) / 100;
    const out: { numero: number; vencimento: string; valor: number }[] = [];
    let acumulado = 0;
    for (let i = 1; i <= qt; i++) {
      const valor = i === qt ? Math.round((total - acumulado) * 100) / 100 : base;
      acumulado += valor;
      const venc = new Date();
      venc.setDate(venc.getDate() + 30 * i);
      out.push({
        numero: i,
        vencimento: isoDate(venc),
        valor,
      });
    }
    return out;
  }, [condicaoSel, total]);

  function adicionarProduto(p: ProdutoRow) {
    const exist = itens.find((it) => it.cdProduto === p.cd_produto);
    if (exist) {
      setItens((prev) =>
        prev.map((it) => (it.cdProduto === p.cd_produto ? { ...it, qt: it.qt + 1 } : it)),
      );
    } else {
      setItens((prev) => [
        ...prev,
        {
          cdProduto: p.cd_produto,
          descricao: p.descricao ?? `Produto ${p.cd_produto}`,
          qt: 1,
          vlUnitario: p.vl_venda ?? 0,
        },
      ]);
    }
  }

  function alterarItem(cdProduto: number, patch: Partial<ItemPedido>) {
    setItens((prev) =>
      prev.map((it) => (it.cdProduto === cdProduto ? { ...it, ...patch } : it)),
    );
  }

  function removerItem(cdProduto: number) {
    setItens((prev) => prev.filter((it) => it.cdProduto !== cdProduto));
  }

  async function salvar() {
    if (!user) return;
    if (!cliente) return Alert.alert('Atenção', 'Selecione o cliente.');
    if (!itens.length) return Alert.alert('Atenção', 'Adicione pelo menos um item.');
    if (!cdCondicao) return Alert.alert('Atenção', 'Selecione a condição de pagamento.');
    if (!cdForma) return Alert.alert('Atenção', 'Selecione a forma de pagamento.');
    if (!cdTipoVenda) return Alert.alert('Atenção', 'Selecione o tipo de venda.');

    setSalvando(true);
    try {
      const clientId = uuidv4();
      const dtEmissao = new Date().toISOString();

      const prevendaItem = itens.map((it) => ({
        cdProduto: it.cdProduto,
        qtProduto: it.qt,
        vlCusto: 0,
        vlUnitario: it.vlUnitario,
        vlDesconto: 0,
        prComissao: 0,
        vlAcrescimo: 0,
        cdFuncionario: user.userId,
        qtEntregaSeparacao: 0,
        qtEntregaConferido: 0,
        idProdutoPromocao: 'N',
        qtDevolvido: 0,
        vlPromocao: 0,
      }));

      const prevendaTitulo = parcelas.map((p) => ({
        nrParcela: p.numero,
        dtEmissao,
        dtVencto: p.vencimento,
        vlTitulo: p.valor,
        nrForma: cdForma,
      }));

      const prevendaFormaPagamento = parcelas.length
        ? parcelas.map((p) => ({
            idFormaPagamento: cdForma,
            nrParcela: p.numero,
            vlParcela: p.valor,
            vlTotal: total,
            vlFormaOriginal: p.valor,
          }))
        : [
            {
              idFormaPagamento: cdForma,
              nrParcela: 1,
              vlParcela: total,
              vlTotal: total,
              vlFormaOriginal: total,
            },
          ];

      const uploadPayload = {
        cdEmpresa: user.cdEmpresa,
        cdCliente: cliente.cd_cliente,
        cdTipoVenda,
        cdFormaPagamento: cdForma,
        dtEmissao,
        obs: obs.trim() || undefined,
        vlBruto: total,
        vlTotal: total,
        prevendaItem,
        prevendaTitulo,
        prevendaFormaPagamento,
        prevendaFuncionarioAuxiliar: [],
      };

      const displayPayload = {
        condicaoLabel: condicaoSel?.descricao,
        formaPagamentoLabel: formaSel?.descricao,
        tipoVendaLabel: tipoSel?.descricao,
        observacao: obs.trim() || null,
        itens: itens.map((it) => ({
          cdProduto: it.cdProduto,
          descricao: it.descricao,
          qt: it.qt,
          vlUnitario: it.vlUnitario,
          vlTotal: Math.round(it.qt * it.vlUnitario * 100) / 100,
        })),
        parcelas,
      };

      await enqueueVenda({
        clientId,
        cdCliente: cliente.cd_cliente,
        cdEmpresa: user.cdEmpresa,
        holdingId: user.holdingId,
        payload: { ...uploadPayload, __display: displayPayload },
        vlTotal: total,
      });

      Alert.alert(
        'Pedido salvo',
        'Pedido registrado offline. Use "Enviar Informações" quando estiver online.',
      );
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível salvar o pedido.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
    >
      <Text style={styles.label}>Cliente</Text>
      <Pressable style={styles.field} onPress={() => setCliPickerOpen(true)}>
        <Text style={cliente ? styles.value : styles.placeholder}>
          {cliente ? cliente.nome : 'Selecionar cliente...'}
        </Text>
      </Pressable>

      <View style={styles.itensHeader}>
        <Text style={styles.label}>Itens ({itens.length})</Text>
        <Pressable style={styles.addBtn} onPress={() => setProdPickerOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Adicionar</Text>
        </Pressable>
      </View>

      {itens.length === 0 ? (
        <Text style={styles.placeholder}>Nenhum item adicionado.</Text>
      ) : (
        itens.map((it) => (
          <View key={it.cdProduto} style={styles.itemBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>{it.descricao}</Text>
              <View style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLbl}>Qtd</Text>
                  <TextInput
                    style={styles.itemInput}
                    keyboardType="numeric"
                    value={String(it.qt)}
                    onChangeText={(t) =>
                      alterarItem(it.cdProduto, { qt: Number(t.replace(',', '.')) || 0 })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLbl}>Vl. unit.</Text>
                  <TextInput
                    style={styles.itemInput}
                    keyboardType="decimal-pad"
                    value={String(it.vlUnitario)}
                    onChangeText={(t) =>
                      alterarItem(it.cdProduto, {
                        vlUnitario: Number(t.replace(',', '.')) || 0,
                      })
                    }
                  />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.itemLbl}>Total</Text>
                  <Text style={styles.itemTotal}>{fmtMoney(it.qt * it.vlUnitario)}</Text>
                </View>
              </View>
            </View>
            <Pressable onPress={() => removerItem(it.cdProduto)} style={styles.removeBtn}>
              <Ionicons name="trash" size={18} color="#dc2626" />
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.label}>Tipo de venda</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipsRow}>
          {tipos.map((t) => (
            <Pressable
              key={t.cd_tipo}
              style={[styles.chip, cdTipoVenda === t.cd_tipo && styles.chipActive]}
              onPress={() => setCdTipoVenda(t.cd_tipo)}
            >
              <Text
                style={[styles.chipText, cdTipoVenda === t.cd_tipo && styles.chipTextActive]}
              >
                {t.descricao}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.label}>Condição de pagamento</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipsRow}>
          {condicoes.map((c) => (
            <Pressable
              key={c.cd_condicao}
              style={[styles.chip, cdCondicao === c.cd_condicao && styles.chipActive]}
              onPress={() => setCdCondicao(c.cd_condicao)}
            >
              <Text
                style={[styles.chipText, cdCondicao === c.cd_condicao && styles.chipTextActive]}
              >
                {c.descricao}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.label}>Forma de pagamento</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipsRow}>
          {formas.map((f) => (
            <Pressable
              key={f.cd_forma}
              style={[styles.chip, cdForma === f.cd_forma && styles.chipActive]}
              onPress={() => setCdForma(f.cd_forma)}
            >
              <Text style={[styles.chipText, cdForma === f.cd_forma && styles.chipTextActive]}>
                {f.descricao}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {parcelas.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Parcelas</Text>
          {parcelas.map((p) => (
            <View key={p.numero} style={styles.parcelaRow}>
              <Text style={styles.value}>
                {p.numero}/{parcelas.length}
              </Text>
              <Text style={styles.subtle}>{p.vencimento}</Text>
              <Text style={styles.itemTotal}>{fmtMoney(p.valor)}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.label}>Observação</Text>
      <TextInput
        style={[styles.input, { minHeight: 70 }]}
        value={obs}
        onChangeText={setObs}
        multiline
        placeholder="Observações adicionais"
      />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total do pedido</Text>
        <Text style={styles.totalValue}>{fmtMoney(total)}</Text>
      </View>

      <Pressable
        style={[styles.button, salvando && { opacity: 0.6 }]}
        onPress={salvar}
        disabled={salvando}
      >
        <Text style={styles.buttonText}>{salvando ? 'Salvando...' : 'Salvar Pedido'}</Text>
      </Pressable>

      <ClientePicker
        visible={cliPickerOpen}
        onClose={() => setCliPickerOpen(false)}
        onSelect={setCliente}
      />
      <ProdutoPicker
        visible={prodPickerOpen}
        onClose={() => setProdPickerOpen(false)}
        onSelect={adicionarProduto}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  label: { fontWeight: '700', color: '#334155' },
  field: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  value: { color: '#0f172a', fontWeight: '600' },
  placeholder: { color: '#94a3b8' },
  subtle: { color: '#64748b', fontSize: 12 },
  itensHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  addBtn: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  itemBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  itemRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' },
  itemLbl: { fontSize: 11, color: '#64748b' },
  itemInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    minWidth: 60,
  },
  itemTotal: { color: '#16a34a', fontWeight: '700' },
  removeBtn: { padding: 6 },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#334155', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 10, gap: 4 },
  parcelaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    textAlignVertical: 'top',
  },
  totalCard: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  totalLabel: { color: '#cbd5e1', fontWeight: '600' },
  totalValue: { color: '#22c55e', fontWeight: '800', fontSize: 22 },
  button: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
