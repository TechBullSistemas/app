import { useLocalSearchParams } from 'expo-router';
import { PedidoForm } from '@/components/PedidoForm';

export default function EditarPedido() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  return <PedidoForm clientId={String(clientId)} />;
}
