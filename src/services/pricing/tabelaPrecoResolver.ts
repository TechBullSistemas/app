import type { EmpresaParametros } from '@/db/repositories/parametros';
import type { ClienteEngine, RepresentanteEngine } from './types';

/**
 * Resolve qual `cdTabelaPreco` usar para precificar uma venda.
 *
 * Regra do legado controlada por `Empresa.idIgnoraTabelaPrecoClienteTablet`:
 *   - "N" (default): cliente → representante → empresa.cdTabelaPrecoPadrao
 *   - "S": ignora cliente, usa representante → empresa.cdTabelaPrecoPadrao
 *
 * Retorna `null` se nenhuma camada tiver tabela cadastrada (caller deve
 * tratar como "venda sem tabela", que é o comportamento atual do app).
 */
export function resolverTabelaPreco(params: {
  empresa: EmpresaParametros;
  cliente?: ClienteEngine | null;
  representante?: RepresentanteEngine | null;
}): number | null {
  const { empresa, cliente, representante } = params;
  const ignoraCliente = empresa.idIgnoraTabelaPrecoClienteTablet === 'S';

  if (!ignoraCliente && cliente?.cdTabelaPreco) {
    return cliente.cdTabelaPreco;
  }
  if (representante?.cdTabelaPreco) {
    return representante.cdTabelaPreco;
  }
  if (empresa.cdTabelaPrecoPadrao) {
    return empresa.cdTabelaPrecoPadrao;
  }
  return null;
}
