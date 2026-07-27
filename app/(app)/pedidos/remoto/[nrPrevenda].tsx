import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as MailComposer from 'expo-mail-composer';

import {
  getPrevendaByKey,
  listPrevendaItens,
  PrevendaRow,
} from '@/db/repositories/prevendas';
import { getClienteById } from '@/db/repositories/clientes';
import {
  compartilharPdf,
  gerarPdfPedido,
  imprimirPdf,
  lerPdfBase64,
  PedidoPdfData,
} from '@/services/pdfVenda';
import { useOnlineStore } from '@/stores/online';
import { useSessionStore } from '@/stores/session';
import { enviarVendaPorEmail } from '@/api/email';
import { extractApiErrorMessage } from '@/api/client';

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtVenc(s: string | null | undefined) {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('pt-BR');
}

export default function PedidoRemotoDetalhe() {
  const { nrPrevenda, cdEmpresa, holdingId } = useLocalSearchParams<{
    nrPrevenda: string;
    cdEmpresa: string;
    holdingId: string;
  }>();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const isIntegradorDuapi = useSessionStore(
    (s) => s.user?.idIntegradorDuapi === true,
  );
  const [row, setRow] = useState<PrevendaRow | null>(null);
  const [pdfData, setPdfData] = useState<PedidoPdfData | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailDest, setEmailDest] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setPdfUri(null);
    const nr = Number(nrPrevenda);
    const emp = Number(cdEmpresa);
    const hid = Number(holdingId);
    if (!nr || !emp || !hid) {
      setRow(null);
      setPdfData(null);
      setLoading(false);
      return;
    }

    const r = await getPrevendaByKey(nr, emp, hid);
    if (!r) {
      setRow(null);
      setPdfData(null);
      setLoading(false);
      return;
    }

    const itens = await listPrevendaItens(nr, emp, hid);
    const cli = await getClienteById(r.cd_cliente, r.holding_id);
    let raw: any = null;
    try {
      raw = r.raw_json ? JSON.parse(r.raw_json) : null;
    } catch {
      raw = null;
    }

    const parcelas = (raw?.prevendaTitulo ?? []).map((t: any) => ({
      numero: Number(t.nrParcela) || 0,
      vencimento:
        typeof t.dtVencto === 'string'
          ? t.dtVencto
          : t.dtVencto
            ? new Date(t.dtVencto).toISOString()
            : '',
      valor: Number(t.vlTitulo) || 0,
    }));

    const data: PedidoPdfData = {
      numero: r.nr_prevenda,
      clienteNome: r.nm_cliente ?? cli?.nome ?? `Cliente #${r.cd_cliente}`,
      clienteCpfCnpj: cli?.cpf_cnpj ?? null,
      clienteEndereco: cli
        ? `${cli.endereco ?? ''} ${cli.numero ?? ''} - ${cli.bairro ?? ''}`
        : null,
      data: fmtDate(r.dt_emissao),
      itens: itens.map((it) => {
        const qt = Number(it.qt_produto) || 0;
        const vlUnit = Number(it.vl_unitario) || 0;
        const desc = Number(it.vl_desconto) || 0;
        const acresc = Number(it.vl_acrescimo) || 0;
        return {
          cdProduto: it.cd_produto,
          descricao: it.ds_produto ?? `Produto #${it.cd_produto}`,
          qt,
          vlUnitario: vlUnit,
          vlTotal: qt * vlUnit - desc + acresc,
        };
      }),
      vlTotal: Number(r.vl_total) || 0,
      formaPagamento: r.ds_forma_pagamento ?? null,
      parcelas,
      observacao: r.obs ?? null,
    };

    setRow(r);
    setPdfData(data);
    setEmailDest((prev) => prev || cli?.email || '');
    setLoading(false);
  }, [nrPrevenda, cdEmpresa, holdingId]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function ensurePdf(): Promise<string | null> {
    if (pdfUri) return pdfUri;
    if (!pdfData) return null;
    const uri = await gerarPdfPedido(pdfData);
    setPdfUri(uri);
    return uri;
  }

  async function handleImprimir() {
    const uri = await ensurePdf();
    if (uri) await imprimirPdf(uri);
  }

  async function handleCompartilhar() {
    const uri = await ensurePdf();
    if (uri) await compartilharPdf(uri);
  }

  async function handleEnviarEmailServer() {
    if (!isOnline) {
      Alert.alert('Sem conexão', 'É necessário estar online para enviar e-mail.');
      return;
    }
    if (!emailDest || !emailDest.includes('@')) {
      Alert.alert('E-mail', 'Informe um e-mail válido.');
      return;
    }
    const uri = await ensurePdf();
    if (!uri || !pdfData) return;
    setEnviando(true);
    try {
      const base64 = await lerPdfBase64(uri);
      await enviarVendaPorEmail({
        to: emailDest,
        subject: `Pedido ${pdfData.numero}`,
        nrPrevenda: pdfData.numero ?? undefined,
        pdfBase64: base64,
        filename: `pedido-${pdfData.numero}.pdf`,
      });
      Alert.alert('E-mail', 'Pedido enviado com sucesso!');
    } catch (err) {
      Alert.alert('Erro', extractApiErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  async function handleEnviarEmailNativo() {
    const uri = await ensurePdf();
    if (!uri) return;
    const can = await MailComposer.isAvailableAsync();
    if (!can) {
      Alert.alert(
        'E-mail',
        'Nenhum aplicativo de e-mail disponível neste dispositivo.',
      );
      return;
    }
    await MailComposer.composeAsync({
      recipients: emailDest ? [emailDest] : [],
      subject: `Pedido ${pdfData?.numero ?? ''}`,
      body: 'Segue em anexo o pedido.',
      attachments: [uri],
    });
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (!row || !pdfData) {
    return <Text style={{ padding: 16 }}>Pré-venda não encontrada.</Text>;
  }

  const duapiLabel = row.id_sincronizado_duapi ? 'Sincronizado' : 'Pendente';
  const duapiColor = row.id_sincronizado_duapi ? '#047857' : '#b45309';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 14 }}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Pedido #{pdfData.numero}</Text>
        <Text style={styles.subtle}>{pdfData.data}</Text>
        {isIntegradorDuapi ? (
          <Text style={[styles.subtle, { color: duapiColor, fontWeight: '700' }]}>
            Sync Duapi: {duapiLabel}
          </Text>
        ) : null}
        {row.nr_nota != null ? (
          <Text style={styles.subtle}>
            Nota: {row.nr_nota}
            {row.serie_nota ? `/${row.serie_nota}` : ''}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Cliente</Text>
        <Text style={styles.value}>{pdfData.clienteNome}</Text>
        <Text style={styles.subtle}>{pdfData.clienteCpfCnpj}</Text>
        <Text style={styles.subtle}>{pdfData.clienteEndereco}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Itens ({pdfData.itens.length})</Text>
        {pdfData.itens.map((it, i) => (
          <View key={i} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>{it.descricao}</Text>
              <Text style={styles.subtle}>
                {it.qt} x {fmtMoney(it.vlUnitario)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{fmtMoney(it.vlTotal)}</Text>
          </View>
        ))}
        <View style={styles.totalLine}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{fmtMoney(pdfData.vlTotal)}</Text>
        </View>
      </View>

      {pdfData.formaPagamento ? (
        <View style={styles.card}>
          <Text style={styles.section}>Forma de pagamento</Text>
          <Text style={styles.value}>{pdfData.formaPagamento}</Text>
        </View>
      ) : null}

      {pdfData.parcelas?.length ? (
        <View style={styles.card}>
          <Text style={styles.section}>Parcelas</Text>
          {pdfData.parcelas.map((p) => (
            <View key={p.numero} style={styles.itemRow}>
              <Text style={styles.value}>
                {p.numero} • {fmtVenc(p.vencimento)}
              </Text>
              <Text style={styles.itemTotal}>{fmtMoney(p.valor)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {row.ds_ordem_compra ? (
        <View style={styles.card}>
          <Text style={styles.section}>Ordem de compra</Text>
          <Text style={styles.value}>{row.ds_ordem_compra}</Text>
        </View>
      ) : null}

      {pdfData.observacao ? (
        <View style={styles.card}>
          <Text style={styles.section}>Observação</Text>
          <Text style={styles.value}>{pdfData.observacao}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.section}>Ações</Text>
        <View style={styles.buttonsRow}>
          <ActionButton
            icon="print"
            label="Imprimir"
            color="#0ea5e9"
            onPress={handleImprimir}
          />
          <ActionButton
            icon="share-social"
            label="Compartilhar"
            color="#10b981"
            onPress={handleCompartilhar}
          />
        </View>

        <Text style={[styles.subtle, { marginTop: 12 }]}>
          Enviar por e-mail (somente online)
        </Text>
        <TextInput
          style={styles.input}
          value={emailDest}
          onChangeText={setEmailDest}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="cliente@exemplo.com"
        />
        <View style={styles.buttonsRow}>
          <ActionButton
            icon="mail"
            label={enviando ? 'Enviando...' : 'Enviar do servidor'}
            color={isOnline ? '#2563eb' : '#94a3b8'}
            onPress={handleEnviarEmailServer}
            disabled={enviando || !isOnline}
          />
          <ActionButton
            icon="paper-plane"
            label="App de E-mail"
            color="#6366f1"
            onPress={handleEnviarEmailNativo}
          />
        </View>
        {!isOnline && (
          <Text style={styles.warn}>
            Você está offline. Conecte-se para enviar pelo servidor.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, { backgroundColor: color }, disabled && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, gap: 6 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  section: { fontWeight: '700', color: '#1e3a8a', marginBottom: 4 },
  subtle: { color: '#64748b', fontSize: 12 },
  value: { color: '#0f172a', fontWeight: '600' },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    alignItems: 'center',
    gap: 8,
  },
  itemTotal: { fontWeight: '700', color: '#0f172a' },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  totalLabel: { fontWeight: '700', color: '#64748b' },
  totalValue: { fontWeight: '800', color: '#16a34a', fontSize: 16 },
  buttonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    backgroundColor: '#fff',
  },
  warn: { color: '#b45309', fontSize: 12, marginTop: 6 },
});
