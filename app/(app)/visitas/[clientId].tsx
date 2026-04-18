import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';

import {
  deleteVisitaLocal,
  getVisitaByClientId,
  updateVisitaLocal,
  VisitaRow,
} from '@/db/repositories/visitas';
import {
  deleteOutboxVisita,
  updateOutboxVisitaPayload,
} from '@/db/repositories/outbox';
import { getClienteById, ClienteRow } from '@/db/repositories/clientes';

export default function EditarVisitaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId: string }>();
  const clientId = params.clientId;

  const [carregando, setCarregando] = useState(true);
  const [visita, setVisita] = useState<VisitaRow | null>(null);
  const [cliente, setCliente] = useState<ClienteRow | null>(null);

  const [comprou, setComprou] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [usarGps, setUsarGps] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const v = await getVisitaByClientId(clientId);
      if (!v) {
        setCarregando(false);
        return;
      }
      setVisita(v);
      setComprou(v.id_comprou === 1);
      setMotivo(v.motivo_nao_comprou ?? '');
      setObs(v.observacao ?? '');
      setUsarGps(v.latitude != null && v.longitude != null);
      if (v.holding_id) {
        const c = await getClienteById(v.cd_cliente, v.holding_id);
        setCliente(c ?? null);
      }
      setCarregando(false);
    })();
  }, [clientId]);

  async function handleSalvar() {
    if (!visita) return;
    if (visita.origem !== 'local') {
      Alert.alert('Atenção', 'Esta visita já foi sincronizada e não pode ser editada.');
      return;
    }
    if (!comprou && !motivo.trim()) {
      Alert.alert('Atenção', 'Informe o motivo de não compra.');
      return;
    }

    setSaving(true);
    try {
      let lat: number | null = visita.latitude;
      let lng: number | null = visita.longitude;
      if (usarGps && (lat == null || lng == null)) {
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
      } else if (!usarGps) {
        lat = null;
        lng = null;
      }

      await updateVisitaLocal(clientId, {
        idComprou: comprou,
        motivoNaoComprou: comprou ? null : motivo.trim() || null,
        observacao: obs.trim() || null,
        latitude: lat,
        longitude: lng,
      });

      await updateOutboxVisitaPayload(clientId, {
        cdCliente: visita.cd_cliente,
        cdEmpresa: visita.cd_empresa,
        holdingId: visita.holding_id,
        cdVendedor: visita.cd_vendedor,
        dtVisita: visita.dt_visita,
        idComprou: comprou,
        motivoNaoComprou: comprou ? null : motivo.trim() || null,
        observacao: obs.trim() || null,
        latitude: lat,
        longitude: lng,
      });

      Alert.alert('Visita', 'Alterações salvas localmente.');
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível salvar a visita.');
    } finally {
      setSaving(false);
    }
  }

  function handleExcluir() {
    if (!visita) return;
    if (visita.origem !== 'local') return;
    Alert.alert(
      'Excluir visita',
      'Tem certeza que deseja excluir esta visita pendente?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteVisitaLocal(clientId);
            await deleteOutboxVisita(clientId);
            router.back();
          },
        },
      ],
    );
  }

  if (carregando) return <ActivityIndicator style={{ marginTop: 24 }} />;

  if (!visita) {
    return <Text style={{ padding: 16 }}>Visita não encontrada.</Text>;
  }

  if (visita.origem !== 'local') {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 16, color: '#0f172a' }}>
          Esta visita já foi sincronizada e não pode mais ser editada.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={styles.headerCard}>
        <Text style={styles.subtle}>Cliente</Text>
        <Text style={styles.title}>{cliente?.nome ?? `#${visita.cd_cliente}`}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>Pendente — não enviado</Text>
        </View>
      </View>

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
        <Text style={styles.label}>Usar GPS</Text>
        <Switch value={usarGps} onValueChange={setUsarGps} />
      </View>

      <Pressable
        style={[styles.button, saving && { opacity: 0.6 }]}
        onPress={handleSalvar}
        disabled={saving}
      >
        <Text style={styles.buttonText}>{saving ? 'Salvando...' : 'Salvar Alterações'}</Text>
      </Pressable>

      <Pressable style={styles.btnExcluir} onPress={handleExcluir}>
        <Text style={styles.btnExcluirText}>Excluir visita pendente</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  headerCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    gap: 6,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  subtle: { color: '#64748b', fontSize: 12 },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  tagText: { color: '#92400e', fontWeight: '700', fontSize: 11 },
  label: { fontWeight: '600', color: '#334155' },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    fontSize: 14,
    textAlignVertical: 'top',
  },
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
  btnExcluir: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginTop: 4,
  },
  btnExcluirText: { color: '#dc2626', fontWeight: '700' },
});
