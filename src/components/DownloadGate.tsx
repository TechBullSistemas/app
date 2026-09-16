import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';

import { useSyncStore } from '@/stores/sync';
import { useOnlineStore } from '@/stores/online';
import { runDownloadSync } from '@/sync/download';
import { hasIncompleteDownload } from '@/sync/downloadCheckpoint';
import { downloadPercent } from '@/sync/downloadProgress';
import { extractApiErrorMessage } from '@/api/client';

function KeepScreenAwake() {
  useKeepAwake('download-sync', { suppressDeactivateWarnings: true });
  return null;
}

export function DownloadGate() {
  const [checked, setChecked] = useState(false);
  const running = useSyncStore((s) => s.downloadRunning);
  const needsRecovery = useSyncStore((s) => s.downloadNeedsRecovery);
  const error = useSyncStore((s) => s.downloadError);
  const progress = useSyncStore((s) => s.downloadProgress);
  const online = useOnlineStore((s) => s.isOnline);

  useEffect(() => {
    let active = true;
    hasIncompleteDownload()
      .then((incomplete) => {
        if (active && incomplete && !useSyncStore.getState().downloadRunning) {
          useSyncStore
            .getState()
            .requireDownloadRecovery(
              'A importação anterior não terminou. Importe novamente para usar o app.',
            );
        }
      })
      .catch(() => {
        if (active)
          useSyncStore
            .getState()
            .requireDownloadRecovery(
              'Não foi possível verificar a importação. Tente importar novamente.',
            );
      })
      .finally(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function retry() {
    try {
      await runDownloadSync();
    } catch (err) {
      useSyncStore
        .getState()
        .requireDownloadRecovery(extractApiErrorMessage(err));
    }
  }

  const percent = downloadPercent(progress);
  const blocked = !checked || running || needsRecovery;

  return (
    <Modal
      visible={blocked}
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* A base parcial não pode ser usada. */
      }}
      supportedOrientations={['portrait', 'landscape']}
    >
      {blocked ? <StatusBar barStyle="dark-content" /> : null}
      {running ? <KeepScreenAwake /> : null}
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} bounces={false}>
          <View style={styles.content} testID="download-gate">
            {!checked ? (
              <>
                <ActivityIndicator size="large" color="#1e3a8a" />
                <Text style={styles.title}>Verificando importação</Text>
              </>
            ) : running ? (
              <>
                <Ionicons
                  name="cloud-download-outline"
                  size={52}
                  color="#1e3a8a"
                />
                <Text accessibilityRole="header" style={styles.title}>
                  Importando informações
                </Text>
                <Text style={styles.hint}>
                  Aguarde nesta tela até concluir.
                </Text>
                <View style={styles.progressHeading}>
                  <Text style={styles.label}>Progresso das etapas</Text>
                  <Text style={styles.percent}>{percent}%</Text>
                </View>
                <View
                  style={styles.track}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Importação de informações"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                >
                  <View style={[styles.fill, { width: `${percent}%` }]} />
                </View>
                <View style={styles.stage}>
                  <ActivityIndicator color="#1e3a8a" />
                  <Text accessibilityLiveRegion="polite" style={styles.label}>
                    {progress?.label ?? 'Preparando importação'}
                  </Text>
                </View>
                {progress && progress.total > 0 ? (
                  <Text style={styles.count}>
                    {progress.done.toLocaleString('pt-BR')} de{' '}
                    {progress.total.toLocaleString('pt-BR')}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Ionicons
                  name="alert-circle-outline"
                  size={52}
                  color="#b45309"
                />
                <Text accessibilityRole="header" style={styles.title}>
                  Importação não concluída
                </Text>
                <Text accessibilityRole="alert" style={styles.hint}>
                  {error}
                </Text>
                {!online ? (
                  <Text style={styles.offline}>
                    Conecte-se à internet para tentar novamente.
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !online }}
                  disabled={!online}
                  style={[styles.button, !online && styles.disabled]}
                  onPress={retry}
                >
                  <Text style={styles.buttonText}>Tentar novamente</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 18,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  hint: { fontSize: 16, lineHeight: 24, color: '#475569', textAlign: 'center' },
  progressHeading: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  label: { fontSize: 16, color: '#334155', flexShrink: 1 },
  percent: {
    fontSize: 18,
    color: '#1e3a8a',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#dbeafe',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#1e3a8a', borderRadius: 6 },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { color: '#64748b', fontSize: 14, fontVariant: ['tabular-nums'] },
  offline: { color: '#92400e', textAlign: 'center' },
  button: {
    backgroundColor: '#1e3a8a',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    minHeight: 48,
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
