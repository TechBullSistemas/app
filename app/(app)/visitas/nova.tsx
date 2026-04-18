import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import { ClientePicker } from '@/components/ClientePicker';
import { ClienteRow } from '@/db/repositories/clientes';
import { useSessionStore } from '@/stores/session';
import { insertVisitaLocal } from '@/db/repositories/visitas';
import { enqueueVisita } from '@/db/repositories/outbox';

export default function NovaVisitaScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [cliente, setCliente] = useState<ClienteRow | null>(null);
  const [comprou, setComprou] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [usarGps, setUsarGps] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSalvar() {
    if (!user) return;
    if (!cliente) {
      Alert.alert('Atenção', 'Selecione o cliente.');
      return;
    }
    if (!comprou && !motivo.trim()) {
      Alert.alert('Atenção', 'Informe o motivo de não compra.');
      return;
    }

    setSaving(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (usarGps) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          try {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          } catch (err) {
            console.warn('GPS falhou', err);
          }
        }
      }

      const clientId = uuidv4();
      const dtVisita = new Date().toISOString();
      const payload = {
        cdCliente: cliente.cd_cliente,
        cdEmpresa: user.cdEmpresa,
        holdingId: user.holdingId,
        cdVendedor: user.userId,
        dtVisita,
        idComprou: comprou,
        motivoNaoComprou: comprou ? null : motivo.trim() || null,
        observacao: obs.trim() || null,
        latitude: lat,
        longitude: lng,
      };

      await insertVisitaLocal({ clientId, ...payload });
      await enqueueVisita({
        clientId,
        cdCliente: cliente.cd_cliente,
        cdEmpresa: user.cdEmpresa,
        holdingId: user.holdingId,
        payload,
      });

      Alert.alert('Visita', 'Visita salva localmente. Envie em "Enviar Informações" quando estiver online.');
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível salvar a visita.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={styles.label}>Cliente</Text>
      <Pressable style={styles.field} onPress={() => setPickerOpen(true)}>
        <Text style={cliente ? styles.value : styles.placeholder}>
          {cliente ? cliente.nome : 'Selecionar cliente...'}
        </Text>
      </Pressable>

      <View style={styles.switchRow}>
        <Text style={styles.label}>O cliente comprou?</Text>
        <Switch value={comprou} onValueChange={setComprou} />
      </View>

      {!comprou && (
        <>
          <Text style={styles.label}>Motivo de não compra *</Text>
          <TextInput
            style={[styles.input, { minHeight: 56 }]}
            value={motivo}
            onChangeText={setMotivo}
            multiline
            placeholder="Ex.: estoque alto, fora do prazo..."
          />
        </>
      )}

      <Text style={styles.label}>Observação</Text>
      <TextInput
        style={[styles.input, { minHeight: 80 }]}
        value={obs}
        onChangeText={setObs}
        multiline
        placeholder="Detalhes adicionais"
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Capturar GPS</Text>
        <Switch value={usarGps} onValueChange={setUsarGps} />
      </View>

      <Pressable
        style={[styles.button, saving && { opacity: 0.6 }]}
        onPress={handleSalvar}
        disabled={saving}
      >
        <Text style={styles.buttonText}>{saving ? 'Salvando...' : 'Salvar Visita'}</Text>
      </Pressable>

      <ClientePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={setCliente}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  label: { fontWeight: '600', color: '#334155' },
  field: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  value: { color: '#0f172a', fontWeight: '600' },
  placeholder: { color: '#94a3b8' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
  },
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
