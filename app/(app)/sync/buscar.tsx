import { useCallback } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSyncStore } from '@/stores/sync';
import { useSessionStore } from '@/stores/session';
import { runDownloadSync } from '@/sync/download';
import { useOnlineStore } from '@/stores/online';
import { extractApiErrorMessage } from '@/api/client';
import { DownloadOverview } from '@/components/DownloadOverview';

export default function BuscarInformacoesScreen() {
  const isOnline = useOnlineStore((s) => s.isOnline);
  const token = useSessionStore((s) => s.token);
  const {
    downloadRunning,
    downloadError,
    downloadNeedsRecovery,
    uploadRunning,
  } = useSyncStore();
  const insets = useSafeAreaInsets();
  const blocked = !!token && (downloadRunning || downloadNeedsRecovery);

  const explainBlocked = useCallback(() => {
    Alert.alert(
      downloadRunning ? 'Importação em andamento' : 'Importação não concluída',
      downloadRunning
        ? 'Aguarde a conclusão para sair desta tela.'
        : 'Tente novamente para concluir a importação antes de sair.',
      [{ text: 'OK' }],
    );
  }, [downloadRunning]);

  usePreventRemove(blocked, explainBlocked);
  useFocusEffect(
    useCallback(() => {
      if (!blocked) return;
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          explainBlocked();
          return true;
        },
      );
      return () => subscription.remove();
    }, [blocked, explainBlocked]),
  );

  async function importData() {
    try {
      await runDownloadSync();
    } catch (err) {
      if (!useSyncStore.getState().downloadNeedsRecovery) {
        Alert.alert('Importação', extractApiErrorMessage(err));
      }
    }
  }

  function start() {
    if (!isOnline) {
      Alert.alert('Sem conexão', 'Conecte-se à internet para importar.');
      return;
    }
    if (downloadNeedsRecovery) {
      void importData();
      return;
    }
    Alert.alert(
      'Importar informações?',
      'A base local será atualizada. Aguarde a conclusão para voltar a usar o app.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Importar', onPress: importData },
      ],
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          gestureEnabled: !blocked,
          headerBackButtonMenuEnabled: false,
        }}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: downloadRunning || uploadRunning || !isOnline,
          }}
          style={[
            styles.button,
            (downloadRunning || uploadRunning || !isOnline) && styles.disabled,
          ]}
          onPress={start}
          disabled={downloadRunning || uploadRunning || !isOnline}
        >
          <Ionicons name="cloud-download" size={20} color="#fff" />
          <Text style={styles.buttonText}>
            {downloadRunning
              ? 'Importando…'
              : downloadNeedsRecovery
                ? 'Tentar novamente'
                : 'Iniciar Download'}
          </Text>
        </Pressable>
        {uploadRunning ? (
          <Text style={styles.subtle}>
            Aguarde o envio de informações terminar.
          </Text>
        ) : null}
        {!isOnline ? (
          <Text style={styles.subtle}>Sem conexão com a internet.</Text>
        ) : null}
        {downloadError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {downloadError}
          </Text>
        ) : null}
      </View>
      <DownloadOverview />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  actions: { padding: 16, gap: 12 },
  subtle: { color: '#64748b' },
  error: { color: '#991b1b', lineHeight: 20 },
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
});
