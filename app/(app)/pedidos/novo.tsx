import { useLocalSearchParams } from 'expo-router';
import { PedidoForm } from '@/components/PedidoForm';

export default function NovoPedido() {
  const params = useLocalSearchParams<{
    cd_cliente?: string;
    holding_id?: string;
  }>();
  const preCdCliente = params.cd_cliente ? Number(params.cd_cliente) : null;
  const preHoldingId = params.holding_id ? Number(params.holding_id) : null;

  return <PedidoForm preCdCliente={preCdCliente} preHoldingId={preHoldingId} />;
}
