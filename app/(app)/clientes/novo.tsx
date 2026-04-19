import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { ClienteForm } from '@/components/ClienteForm';
import { insertClienteLocal } from '@/db/repositories/clientes';
import { useSessionStore } from '@/stores/session';

export default function NovoClienteScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const [saving, setSaving] = useState(false);

  return (
    <ClienteForm
      submitLabel="Salvar Cliente"
      saving={saving}
      onSubmit={async (data) => {
        if (!user) {
          Alert.alert('Sessão', 'Faça login novamente.');
          return;
        }
        setSaving(true);
        try {
          const cli = await insertClienteLocal(user.holdingId, data);
          Alert.alert(
            'Cliente cadastrado',
            'Será enviado ao servidor no próximo "Enviar Informações".',
          );
          router.replace({
            pathname: '/(app)/clientes/[id]',
            params: { id: String(cli.cd_cliente), h: String(cli.holding_id) },
          });
        } catch (err) {
          console.error(err);
          Alert.alert('Erro', 'Não foi possível salvar o cliente.');
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
