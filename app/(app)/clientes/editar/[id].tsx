import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ClienteForm } from '@/components/ClienteForm';
import {
  ClienteRow,
  getClienteById,
  isClienteEditavel,
  updateClienteLocal,
} from '@/db/repositories/clientes';

export default function EditarClienteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; h: string }>();
  const cdCliente = Number(params.id);
  const holdingId = Number(params.h);

  const [cli, setCli] = useState<ClienteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getClienteById(cdCliente, holdingId).then((c) => {
      if (alive) {
        setCli(c ?? null);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [cdCliente, holdingId]);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 24 }} />;
  }

  if (!cli) {
    return (
      <View style={{ padding: 24 }}>
        <Text>Cliente não encontrado.</Text>
      </View>
    );
  }

  if (!isClienteEditavel(cli)) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: '#dc2626', fontWeight: '700', marginBottom: 6 }}>
          Cliente somente leitura
        </Text>
        <Text style={{ color: '#475569' }}>
          Apenas clientes cadastrados offline (ainda não enviados ao servidor)
          podem ser editados pelo app.
        </Text>
      </View>
    );
  }

  return (
    <ClienteForm
      submitLabel="Salvar Alterações"
      saving={saving}
      initial={{
        nome: cli.nome ?? '',
        razao_social: cli.razao_social ?? null,
        cpf_cnpj: cli.cpf_cnpj ?? null,
        tp_pessoa: (cli.tp_pessoa as 'F' | 'J') ?? 'F',
        fone: cli.fone ?? null,
        celular: cli.celular ?? null,
        email: cli.email ?? null,
        endereco: cli.endereco ?? null,
        numero: cli.numero ?? null,
        bairro: cli.bairro ?? null,
        cd_cidade: cli.cd_cidade ?? null,
        cep: cli.cep ?? null,
      }}
      onSubmit={async (data) => {
        setSaving(true);
        try {
          await updateClienteLocal(cdCliente, holdingId, data);
          Alert.alert('Cliente atualizado', 'Alterações salvas localmente.');
          router.back();
        } catch (err: any) {
          console.error(err);
          Alert.alert('Erro', err?.message ?? 'Não foi possível atualizar o cliente.');
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
