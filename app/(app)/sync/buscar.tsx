import {
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
import { useOnlineStore } from '@/stores/online';
import { extractApiErrorMessage } from '@/api/client';

export default function BuscarInformacoesScreen() {
  const isOnline = useOnlineStore((s) => s.isOnline);
  const {
    entities,
    downloadRunning,
    downloadError,
    downloadFinishedAt,
    uploadRunning,
  } = useSyncStore();

  function start() {
    if (!isOnline) {
      Alert.alert('Sem conexão', 'Conecte-se à internet para importar.');
      return;
    }
    Alert.alert(
      'Importar informações?',
      'A base local será atualizada. Aguarde a conclusão para voltar a usar o app.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            try {
              await runDownloadSync();
            } catch (err) {
              // Erros durante a carga são apresentados no bloqueio global.
              if (!useSyncStore.getState().downloadNeedsRecovery) {
                Alert.alert('Importação', extractApiErrorMessage(err));
              }
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Buscar informações</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: downloadRunning || uploadRunning }}
          style={[
            styles.button,
            (downloadRunning || uploadRunning) && styles.disabled,
          ]}
          onPress={start}
          disabled={downloadRunning || uploadRunning}
        >
          <Ionicons name="cloud-download" size={20} color="#fff" />
          <Text style={styles.buttonText}>Iniciar Download</Text>
        </Pressable>
        {uploadRunning ? (
          <Text style={styles.subtle}>
            Aguarde o envio de informações terminar.
          </Text>
        ) : null}
      </View>

      {downloadFinishedAt && !downloadRunning && !downloadError ? (
        <View
          style={[styles.card, styles.success]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.successTitle}>Importação concluída</Text>
          <Text style={styles.subtle}>
            {new Date(downloadFinishedAt).toLocaleString('pt-BR')}
          </Text>
        </View>
      ) : null}

      {Object.keys(entities).length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informações importadas</Text>
          {Object.entries(entities).map(([key, entity]) => (
            <View key={key} style={styles.line}>
              <View style={styles.lineContent}>
                <Text style={styles.lineLabel}>{entity.label}</Text>
                <Text style={styles.subtle}>
                  {entity.downloaded.toLocaleString('pt-BR')} registros
                </Text>
              </View>
              <Ionicons
                name={
                  entity.status === 'done' ? 'checkmark-circle' : 'alert-circle'
                }
                size={20}
                color={entity.status === 'done' ? '#16a34a' : '#b45309'}
              />
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtle: { color: '#64748b' },
  sectionTitle: { fontWeight: '700', color: '#0f172a' },
  button: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#1e3a8a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lineContent: { flex: 1, gap: 4 },
  lineLabel: { color: '#334155', fontWeight: '600' },
  success: { backgroundColor: '#dcfce7' },
  successTitle: { color: '#14532d', fontWeight: '700' },
});
