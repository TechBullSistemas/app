import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { changePasswordRequest } from '@/api/auth';
import { extractApiErrorMessage } from '@/api/client';
import { useOnlineStore } from '@/stores/online';

export default function AlterarSenha() {
  const router = useRouter();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSalvar() {
    if (!isOnline) {
      Alert.alert('Sem conexão', 'É necessário estar online para alterar a senha.');
      return;
    }
    if (!atual || !nova || !confirma) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
      return;
    }
    if (nova.length < 6) {
      Alert.alert('Senha fraca', 'A nova senha precisa ter ao menos 6 caracteres.');
      return;
    }
    if (nova !== confirma) {
      Alert.alert('Confirmação', 'A confirmação não confere com a nova senha.');
      return;
    }
    setLoading(true);
    try {
      await changePasswordRequest(atual, nova);
      Alert.alert('Senha', 'Senha alterada com sucesso!');
      router.back();
    } catch (err) {
      Alert.alert('Erro', extractApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {!isOnline && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>Você está offline. Conecte-se para alterar a senha.</Text>
        </View>
      )}
      <Text style={styles.label}>Senha atual</Text>
      <TextInput style={styles.input} secureTextEntry value={atual} onChangeText={setAtual} />

      <Text style={styles.label}>Nova senha</Text>
      <TextInput style={styles.input} secureTextEntry value={nova} onChangeText={setNova} />

      <Text style={styles.label}>Confirmar nova senha</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={confirma}
        onChangeText={setConfirma}
      />

      <Pressable
        style={[styles.button, (loading || !isOnline) && { opacity: 0.5 }]}
        onPress={handleSalvar}
        disabled={loading || !isOnline}
      >
        <Text style={styles.buttonText}>{loading ? 'Alterando...' : 'Alterar Senha'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  label: { color: '#334155', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  warn: { backgroundColor: '#fef3c7', padding: 12, borderRadius: 8 },
  warnText: { color: '#92400e' },
});
