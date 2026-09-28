type StatusPedido = 'draft' | 'pending' | 'sending' | 'sent' | 'error' | null;

export function deveSalvarRascunhoAutomaticamente({
  habilitado,
  emEdicao,
  status,
}: {
  habilitado: boolean;
  emEdicao: boolean;
  status: StatusPedido;
}): boolean {
  return habilitado && (!emEdicao || status === 'draft');
}
