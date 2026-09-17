export interface PedidoItem {
  cdProduto: number;
  descricao: string;
  qt: number;
  vlUnitario: number;
  vlTotal: number;
  vlUnitarioOriginal?: number | null;
  vlDesconto?: number;
  ncm?: string | null;
  codigoBarras?: string | null;
  fotoUri?: string | null;
}

export interface PedidoParcela {
  numero: number;
  vencimento: string;
  valor: number;
}

export interface PedidoPdfData {
  holdingId?: number;
  cdEmpresa?: number;
  cdCliente?: number;
  modeloImpressaoApp?: 'padrao' | 'detalhado_fotos';
  empresaEndereco?: string | null;
  empresaCidadeUf?: string | null;
  empresaCep?: string | null;
  empresaIe?: string | null;
  empresaFone?: string | null;
  empresaEmail?: string | null;
  clienteCidadeUf?: string | null;
  clienteCep?: string | null;
  clienteIe?: string | null;
  clienteFone?: string | null;
  cdTabelaPreco?: number | null;
  cdCondicaoPagto?: number | null;
  cdFormaPagamento?: number | null;
  cdTipoVenda?: number | null;
  tabelaPreco?: string | null;
  condicaoPagamento?: string | null;
  tipoVenda?: string | null;
  representante?: string | null;
  dsOrdemCompra?: string | null;
  vlDescontoTotal?: number;
  vlAcrescimoTotal?: number;
  numero?: string | number | null;
  empresaNome?: string;
  empresaCnpj?: string;
  empresaLogoUri?: string | null;
  clienteNome: string;
  clienteCpfCnpj?: string | null;
  clienteEndereco?: string | null;
  data: string;
  itens: PedidoItem[];
  vlTotal: number;
  formaPagamento?: string | null;
  parcelas?: PedidoParcela[];
  observacao?: string | null;
}
