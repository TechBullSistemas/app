import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';

import { useSyncStore } from '@/stores/sync';
import { useSessionStore } from '@/stores/session';
import { hasIncompleteDownload } from '@/sync/downloadCheckpoint';

function KeepScreenAwake() {
  useKeepAwake('download-sync', { suppressDeactivateWarnings: true });
  return null;
}

export function DownloadGate() {
  const [checked, setChecked] = useState(false);
  const running = useSyncStore((s) => s.downloadRunning);
  const needsRecovery = useSyncStore((s) => s.downloadNeedsRecovery);
  const token = useSessionStore((s) => s.token);
  const pathname = usePathname();
  const router = useRouter();
  const mustReturn =
    !!token && (running || needsRecovery) && pathname !== '/sync/buscar';

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

  useEffect(() => {
    if (checked && mustReturn) router.navigate('/(app)/sync/buscar');
  }, [checked, mustReturn, router]);

  return (
    <>
      {running ? <KeepScreenAwake /> : null}
      <Modal
        visible={!checked || mustReturn}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={() => {}}
      >
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#1e3a8a" />
          <Text style={styles.label}>Abrindo importação…</Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#f1f5f9',
  },
  label: { color: '#334155', fontSize: 16 },
});
