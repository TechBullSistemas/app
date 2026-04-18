import { Redirect } from 'expo-router';
import { useSessionStore } from '@/stores/session';

export default function Index() {
  const token = useSessionStore((s) => s.token);
  if (!token) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(app)/home" />;
}
