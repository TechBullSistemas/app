import AsyncStorage from '@react-native-async-storage/async-storage';

// A base offline é única no aparelho. O marcador precisa sobreviver à limpeza
// das tabelas, ao encerramento do processo e à expiração da sessão.
const KEY = 'techbull.download-incomplete';

export async function hasIncompleteDownload(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === '1';
}

export async function markDownloadIncomplete() {
  await AsyncStorage.setItem(KEY, '1');
}

export async function clearIncompleteDownload() {
  await AsyncStorage.removeItem(KEY);
}
