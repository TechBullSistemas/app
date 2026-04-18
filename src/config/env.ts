import Constants from 'expo-constants';

const fromEnv =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants?.expoConfig?.extra as any)?.apiUrl ||
  '';

export const API_URL = (fromEnv || 'http://localhost:3000').replace(/\/$/, '');

export const env = {
  apiUrl: API_URL,
};
