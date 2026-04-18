import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSyncStore } from '@/stores/sync';
import { runDownloadSync } from '@/sync/download';
import { downloadPendingPhotos } from '@/services/photoCache';
import { useOnlineStore } from '@/stores/online';

export default function BuscarInformacoesScreen() {
  const isOnline = useOnlineStore((s) => s.isOnline);
  const { entities, downloadRunning, downloadError, downloadFinishedAt, startDownload } =
    useSyncStore();

  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const [photosRunning, setPhotosRunning] = useState(false);

  const summary = useMemo(() => {
    const list = Object.values(entities);
    const totalDownloaded = list.reduce((acc, e) => acc + e.downloaded, 0);
    const totalEsperado = list.reduce((acc, e) => acc + (e.total || e.downloaded), 0);
    return { count: list.length, totalDownloaded, totalEsperado };
  }, [entities]);

  async function start() {
    if (!isOnline) {
      Alert.alert('Sem conexão', 'Conecte-se à internet para sincronizar.');
      return;
    }
    Alert.alert(
      'Atenção',
      'Isso vai apagar TODOS os dados locais e baixar tudo do servidor. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: async () => {
            try {
              await runDownloadSync();
              setPhotosRunning(true);
              await downloadPendingPhotos({
                onProgress: (done, total) => setPhotoProgress({ done, total }),
              });
              setPhotosRunning(false);
              Alert.alert('Sincronização', 'Concluído com sucesso!');
            } catch (err) {
              setPhotosRunning(false);
              console.error(err);
              Alert.alert('Erro', 'Falha durante a sincronização. Veja os detalhes na tela.');
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={styles.card}>
        <Text style={styles.title}>Buscar informações</Text>
        <Text style={styles.subtle}>
          O banco local será limpo e todos os dados (clientes, produtos, vendas, títulos, etc.)
          serão baixados novamente para uso offline.
        </Text>

        <Pressable
          style={[styles.button, downloadRunning && { opacity: 0.6 }]}
          onPress={start}
          disabled={downloadRunning}
        >
          <Ionicons name="cloud-download" size={20} color="#fff" />
          <Text style={styles.buttonText}>
            {downloadRunning ? 'Sincronizando...' : 'Iniciar Download'}
          </Text>
        </Pressable>
      </View>

      {(downloadRunning || summary.count > 0) && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Progresso por entidade</Text>
          {Object.entries(entities).map(([key, e]) => (
            <View key={key} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineLabel}>{e.label}</Text>
                <Text style={styles.lineSub}>
                  {e.downloaded.toLocaleString('pt-BR')} / {(e.total || e.downloaded).toLocaleString('pt-BR')}
                </Text>
                {e.message ? <Text style={styles.errorText}>{e.message}</Text> : null}
              </View>
              <Status status={e.status} />
            </View>
          ))}
        </View>
      )}

      {(photosRunning || photoProgress) && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fotos dos produtos</Text>
          <View style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineLabel}>Baixando fotos</Text>
              <Text style={styles.lineSub}>
                {photoProgress?.done ?? 0} / {photoProgress?.total ?? 0}
              </Text>
            </View>
            {photosRunning ? <ActivityIndicator /> : <Status status="done" />}
          </View>
        </View>
      )}

      {downloadError ? (
        <View style={[styles.card, { backgroundColor: '#fee2e2' }]}>
          <Text style={{ color: '#991b1b', fontWeight: '700' }}>Erro: {downloadError}</Text>
        </View>
      ) : null}

      {downloadFinishedAt && !downloadRunning && !downloadError ? (
        <View style={[styles.card, { backgroundColor: '#dcfce7' }]}>
          <Text style={{ color: '#14532d', fontWeight: '700' }}>
            Última sincronização: {new Date(downloadFinishedAt).toLocaleString('pt-BR')}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Status({ status }: { status: string }) {
  if (status === 'running') return <ActivityIndicator />;
  if (status === 'done') return <Ionicons name="checkmark-circle" size={20} color="#16a34a" />;
  if (status === 'error') return <Ionicons name="alert-circle" size={20} color="#dc2626" />;
  return <Ionicons name="ellipse-outline" size={20} color="#94a3b8" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtle: { color: '#475569' },
  sectionTitle: { fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  button: {
    flexDirection: 'row',
    backgroundColor: '#14b8a6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    gap: 8,
  },
  lineLabel: { color: '#0f172a', fontWeight: '600' },
  lineSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  errorText: { color: '#dc2626', fontSize: 12, marginTop: 2 },
});
