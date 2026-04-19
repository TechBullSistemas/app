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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as MailComposer from 'expo-mail-composer';

import { getDb } from '@/db/database';
import { getClienteById } from '@/db/repositories/clientes';
import { deleteOutboxVenda } from '@/db/repositories/outbox';
import {
  compartilharPdf,
  gerarPdfPedido,
  imprimirPdf,
  lerPdfBase64,
  PedidoPdfData,
} from '@/services/pdfVenda';
import { useOnlineStore } from '@/stores/online';
import { enviarVendaPorEmail } from '@/api/email';
import { extractApiErrorMessage } from '@/api/client';

interface OutboxRow {
  client_id: string;
  cd_cliente: number;
  cd_empresa: number;
  holding_id: number;
  payload: string;
  vl_total: number | null;
  status: string;
  created_at: string;
  cd_prevenda: number | null;
}

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

export default function PedidoDetalhe() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const [row, setRow] = useState<OutboxRow | null>(null);
  const [pdfData, setPdfData] = useState<PedidoPdfData | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailDest, setEmailDest] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setPdfUri(null);
    const db = await getDb();
    const r = await db.getFirstAsync<OutboxRow>(
      'SELECT * FROM outbox_venda WHERE client_id = ?',
      [String(clientId)],
    );
    if (!r) {
      setRow(null);
      setPdfData(null);
      setLoading(false);
      return;
    }
    const cli = await getClienteById(r.cd_cliente, r.holding_id);
    const payload = JSON.parse(r.payload);
    const display = payload.__display ?? payload;
    const data: PedidoPdfData = {
      numero: r.cd_prevenda ?? r.client_id.slice(0, 8).toUpperCase(),
      clienteNome: cli?.nome ?? `Cliente #${r.cd_cliente}`,
      clienteCpfCnpj: cli?.cpf_cnpj ?? null,
      clienteEndereco: cli
        ? `${cli.endereco ?? ''} ${cli.numero ?? ''} - ${cli.bairro ?? ''}`
        : null,
      data: new Date(r.created_at).toLocaleString('pt-BR'),
      itens: (display.itens || []).map((it: any) => ({
        cdProduto: it.cdProduto,
        descricao: it.descricao,
        qt: Number(it.qt) || 0,
        vlUnitario: Number(it.vlUnitario) || 0,
        vlTotal: Number(it.vlTotal) || 0,
      })),
      vlTotal: Number(r.vl_total) || 0,
      formaPagamento: display.formaPagamentoLabel ?? null,
      parcelas: display.parcelas ?? [],
      observacao: display.observacao ?? null,
    };
    setRow(r);
    setPdfData(data);
    setEmailDest((prev) => prev || cli?.email || '');
    setLoading(false);
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const podeEditar = row?.status === 'pending' || row?.status === 'error';

  function handleEditar() {
    if (!podeEditar || !row) return;
    router.push({
      pathname: '/(app)/pedidos/editar/[clientId]',
      params: { clientId: row.client_id },
    });
  }

  function handleExcluir() {
    if (!podeEditar || !row) return;
    Alert.alert(
      'Excluir pedido',
      'Esta ação removerá o pedido do dispositivo e ele NÃO será enviado. Confirma?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteOutboxVenda(row.client_id);
            Alert.alert('Pedido', 'Pedido removido.');
            router.back();
          },
        },
      ],
    );
  }

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
      Alert.alert('E-mail', 'Nenhum aplicativo de e-mail disponível neste dispositivo.');
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
  if (!row || !pdfData) return <Text style={{ padding: 16 }}>Pedido não encontrado.</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={styles.card}>
        <Text style={styles.title}>Pedido #{pdfData.numero}</Text>
        <Text style={styles.subtle}>{pdfData.data}</Text>
        <Text style={styles.subtle}>Status: {row.status}</Text>

        {podeEditar && (
          <View style={styles.buttonsRow}>
            <ActionButton
              icon="create"
              label="Editar"
              color="#f59e0b"
              onPress={handleEditar}
            />
            <ActionButton
              icon="trash"
              label="Excluir"
              color="#dc2626"
              onPress={handleExcluir}
            />
          </View>
        )}
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

      <View style={styles.card}>
        <Text style={styles.section}>Ações</Text>
        <View style={styles.buttonsRow}>
          <ActionButton icon="print" label="Imprimir" color="#0ea5e9" onPress={handleImprimir} />
          <ActionButton icon="share-social" label="Compartilhar" color="#10b981" onPress={handleCompartilhar} />
        </View>

        <Text style={[styles.subtle, { marginTop: 12 }]}>Enviar por e-mail (somente online)</Text>
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
          <Text style={styles.warn}>Você está offline. Conecte-se para enviar pelo servidor.</Text>
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
    borderColor: '#f1f5f9',
    alignItems: 'center',
  },
  itemTotal: { color: '#16a34a', fontWeight: '700' },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#cbd5e1',
  },
  totalLabel: { fontWeight: '700' },
  totalValue: { color: '#16a34a', fontWeight: '800', fontSize: 18 },
  buttonsRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#f8fafc',
    marginTop: 6,
  },
  warn: { color: '#b91c1c', fontSize: 12, marginTop: 6 },
});
