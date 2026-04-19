import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSyncStore, UploadItemProgress } from '@/stores/sync';
import { runUploadSync } from '@/sync/upload';
import { useOnlineStore } from '@/stores/online';
import {
  listOutboxClientes,
  listOutboxVendas,
  listOutboxVisitas,
} from '@/db/repositories/outbox';

export default function EnviarInformacoesScreen() {
  const isOnline = useOnlineStore((s) => s.isOnline);
  const { uploadRunning, uploadItems, uploadError, uploadFinishedAt } = useSyncStore();
  const [pending, setPending] = useState<UploadItemProgress[]>([]);

  async function refresh() {
    const [cs, vs, vis] = await Promise.all([
      listOutboxClientes(),
      listOutboxVendas(),
      listOutboxVisitas(),
    ]);
    const norm = (s: string): UploadItemProgress['status'] =>
      s === 'sent' ? 'sent' : s === 'sending' ? 'sending' : s === 'error' ? 'error' : 'pending';
    const items: UploadItemProgress[] = [
      ...cs.map<UploadItemProgress>((c) => ({
        clientId: c.client_id,
        kind: 'cliente',
        label: `Cliente novo • ${c.cd_cliente_local}`,
        status: norm(c.status),
        message: c.last_error,
      })),
      ...vs.map<UploadItemProgress>((v) => ({
        clientId: v.client_id,
        kind: 'venda',
        label: `Venda • Cliente ${v.cd_cliente}`,
        status: norm(v.status),
        message: v.last_error,
      })),
      ...vis.map<UploadItemProgress>((v) => ({
        clientId: v.client_id,
        kind: 'visita',
        label: `Visita • Cliente ${v.cd_cliente}`,
        status: norm(v.status),
        message: v.last_error,
      })),
    ];
    setPending(items);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleEnviar() {
    if (!isOnline) {
      Alert.alert('Sem conexão', 'Conecte-se à internet para enviar.');
      return;
    }
    try {
      const r = await runUploadSync();
      Alert.alert(
        'Envio concluído',
        `Clientes: ${r.clientes} • Vendas: ${r.vendas} • Visitas: ${r.visitas}`,
      );
      refresh();
    } catch (err) {
      console.error(err);
    }
  }

  function kindLabel(kind: UploadItemProgress['kind']): string {
    if (kind === 'venda') return 'Pedido';
    if (kind === 'visita') return 'Visita';
    return 'Cliente';
  }

  const list = uploadItems.length > 0 ? uploadItems : pending;

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>Enviar informações</Text>
        <Text style={styles.subtle}>
          Vendas e visitas registradas offline serão enviadas para o servidor.
        </Text>
        <Pressable
          style={[styles.button, (uploadRunning || !isOnline) && { opacity: 0.6 }]}
          onPress={handleEnviar}
          disabled={uploadRunning || !isOnline}
        >
          <Ionicons name="cloud-upload" size={20} color="#fff" />
          <Text style={styles.buttonText}>
            {uploadRunning ? 'Enviando...' : 'Enviar pendências'}
          </Text>
        </Pressable>
        {uploadFinishedAt && !uploadRunning ? (
          <Text style={[styles.subtle, { marginTop: 6 }]}>
            Último envio: {new Date(uploadFinishedAt).toLocaleString('pt-BR')}
          </Text>
        ) : null}
        {uploadError ? <Text style={styles.error}>Erro: {uploadError}</Text> : null}
      </View>

      <FlatList
        contentContainerStyle={{ padding: 12, gap: 8 }}
        data={list}
        keyExtractor={(it) => it.clientId}
        ListEmptyComponent={
          <Text style={styles.empty}>Nada pendente para enviar.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowSub}>{kindLabel(item.kind)}</Text>
              {item.message ? <Text style={styles.error}>{item.message}</Text> : null}
            </View>
            <StatusIcon status={item.status} />
          </View>
        )}
      />
    </View>
  );
}

function StatusIcon({ status }: { status: UploadItemProgress['status'] }) {
  if (status === 'sending') return <ActivityIndicator />;
  if (status === 'sent') return <Ionicons name="checkmark-circle" size={22} color="#16a34a" />;
  if (status === 'error') return <Ionicons name="alert-circle" size={22} color="#dc2626" />;
  return <Ionicons name="time-outline" size={22} color="#64748b" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  headerCard: { backgroundColor: '#fff', padding: 14, gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtle: { color: '#475569' },
  button: {
    marginTop: 8,
    flexDirection: 'row',
    backgroundColor: '#f97316',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: { color: '#0f172a', fontWeight: '600' },
  rowSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  error: { color: '#dc2626', fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 32 },
});
