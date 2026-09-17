type ClienteAtraso = {
  id_bloqueia_venda_cliente_atrasado_app?: number | null;
  dt_primeiro_titulo_aberto?: string | null;
};

export const MENSAGEM_CLIENTE_ATRASADO =
  'Venda bloqueada: o cliente possui título a receber em atraso. Regularize os títulos e busque as informações novamente.';

export function clienteComVendaBloqueada(cliente: ClienteAtraso, now = new Date()): boolean {
  if (cliente.id_bloqueia_venda_cliente_atrasado_app !== 1 || !cliente.dt_primeiro_titulo_aberto) return false;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)!.value;
  const hoje = `${parte('year')}-${parte('month')}-${parte('day')}`;
  return cliente.dt_primeiro_titulo_aberto.slice(0, 10) < hoje;
}
