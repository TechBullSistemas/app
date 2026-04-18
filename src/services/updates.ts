import { Alert } from 'react-native';

interface UpdatesModule {
  isEnabled: boolean;
  channel?: string | null;
  runtimeVersion?: string | null;
  checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync: () => Promise<{ isNew: boolean }>;
  reloadAsync: () => Promise<void>;
}

function getUpdates(): UpdatesModule | null {
  try {
    const mod = require('expo-updates') as UpdatesModule;
    if (!mod || typeof mod.checkForUpdateAsync !== 'function') return null;
    return mod;
  } catch {
    return null;
  }
}

export async function checkAndApplyUpdate(opts: {
  silent?: boolean;
} = {}): Promise<'no-module' | 'disabled' | 'no-update' | 'applied' | 'error'> {
  const Updates = getUpdates();
  if (!Updates) return 'no-module';
  if (!Updates.isEnabled) return 'disabled';

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return 'no-update';

    await Updates.fetchUpdateAsync();

    if (opts.silent) {
      await Updates.reloadAsync();
      return 'applied';
    }

    return await new Promise((resolve) => {
      Alert.alert(
        'Atualização disponível',
        'Há uma nova versão do aplicativo. Deseja recarregar agora para aplicar?',
        [
          {
            text: 'Depois',
            style: 'cancel',
            onPress: () => resolve('applied'),
          },
          {
            text: 'Recarregar',
            onPress: async () => {
              try {
                await Updates.reloadAsync();
              } catch {}
              resolve('applied');
            },
          },
        ],
      );
    });
  } catch (err) {
    console.warn('checkAndApplyUpdate falhou:', err);
    return 'error';
  }
}

export function isUpdatesEnabled(): boolean {
  const u = getUpdates();
  return !!u?.isEnabled;
}
