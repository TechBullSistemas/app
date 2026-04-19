import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1e3a8a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="home" options={{ title: 'TechBull Vendas' }} />
      <Stack.Screen name="clientes/index" options={{ title: 'Clientes' }} />
      <Stack.Screen name="clientes/[id]" options={{ title: 'Cliente' }} />
      <Stack.Screen name="clientes/novo" options={{ title: 'Novo Cliente' }} />
      <Stack.Screen name="clientes/editar/[id]" options={{ title: 'Editar Cliente' }} />
      <Stack.Screen name="produtos/index" options={{ title: 'Produtos' }} />
      <Stack.Screen name="produtos/[id]" options={{ title: 'Produto' }} />
      <Stack.Screen name="visitas/index" options={{ title: 'Visitas' }} />
      <Stack.Screen name="visitas/nova" options={{ title: 'Nova Visita' }} />
      <Stack.Screen name="vendas/index" options={{ title: 'Vendas (Notas Fiscais)' }} />
      <Stack.Screen name="vendas/[id]" options={{ title: 'Detalhe da Venda' }} />
      <Stack.Screen name="clientes/produto/[cdProduto]" options={{ title: 'Produto do Cliente' }} />
      <Stack.Screen name="pedidos/index" options={{ title: 'Consulta de Pedidos' }} />
      <Stack.Screen name="pedidos/[clientId]" options={{ title: 'Pedido' }} />
      <Stack.Screen name="pedidos/novo" options={{ title: 'Novo Pedido' }} />
      <Stack.Screen name="pedidos/editar/[clientId]" options={{ title: 'Editar Pedido' }} />
      <Stack.Screen name="visitas/[clientId]" options={{ title: 'Editar Visita' }} />
      <Stack.Screen name="mensagens/index" options={{ title: 'Mensagens' }} />
      <Stack.Screen name="senha" options={{ title: 'Alterar Senha' }} />
      <Stack.Screen name="sync/buscar" options={{ title: 'Buscar Informações' }} />
      <Stack.Screen name="sync/enviar" options={{ title: 'Enviar Informações' }} />
    </Stack>
  );
}
