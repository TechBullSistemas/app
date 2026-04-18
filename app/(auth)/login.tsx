import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginRequest } from '@/api/auth';
import { useSessionStore } from '@/stores/session';
import { extractApiErrorMessage } from '@/api/client';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useSessionStore((s) => s.setSession);

  async function handleLogin() {
    if (!email || !senha) {
      Alert.alert('Login', 'Informe e-mail e senha.');
      return;
    }
    setLoading(true);
    try {
      const res = await loginRequest(email.trim(), senha);
      await setSession(res.token, res.user);
    } catch (err) {
      Alert.alert('Erro ao entrar', extractApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBox}>
            <Text style={styles.brand}>TechBull</Text>
            <Text style={styles.subtitle}>Vendas • Representante</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
            />

            <Text style={styles.label}>Senha</Text>
            <TextInput
              secureTextEntry
              style={styles.input}
              value={senha}
              onChangeText={setSenha}
              placeholder="••••••••"
            />

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Entrar</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            Em caso de problemas, contate o administrador da sua holding.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 24, gap: 24 },
  brandBox: { alignItems: 'center', marginTop: 32, marginBottom: 8 },
  brand: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#cbd5e1', marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  label: { color: '#334155', fontWeight: '600', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  footer: { color: '#94a3b8', textAlign: 'center', fontSize: 12 },
});
