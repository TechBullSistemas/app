import {
  distribuirValoresParcelas,
  garantirSomaParcelas,
  recalcularParcelasNoTotal,
  redistribuirParcelasAposEdicao,
} from './parcelas';

interface ParcelaTeste {
  numero: number;
  vencimento: string;
  valor: number;
}

function assertEqual<T>(recebido: T, esperado: T, caso: string) {
  if (JSON.stringify(recebido) !== JSON.stringify(esperado)) {
    throw new Error(
      `${caso}: esperado ${JSON.stringify(esperado)}, recebido ${JSON.stringify(recebido)}`,
    );
  }
}

function parcela(numero: number, valor: number): ParcelaTeste {
  return { numero, vencimento: `2026-0${numero}-01`, valor };
}

assertEqual(
  distribuirValoresParcelas(100, 3),
  [33.34, 33.33, 33.33],
  'distribui resíduo de centavos como o frontend',
);

assertEqual(
  redistribuirParcelasAposEdicao([parcela(1, 1555.7)], 0, 1729.65, 1555.7).map(
    (item) => item.valor,
  ),
  [1555.7],
  'parcela única não altera o total do pedido',
);

assertEqual(
  redistribuirParcelasAposEdicao(
    [parcela(1, 33.34), parcela(2, 33.33), parcela(3, 33.33)],
    1,
    80,
    100,
  ).map((item) => item.valor),
  [10, 80, 10],
  'edição redistribui o saldo entre as demais parcelas',
);

assertEqual(
  recalcularParcelasNoTotal(
    [parcela(1, 20), parcela(2, 30), parcela(3, 50)],
    120,
  ).map((item) => item.valor),
  [40, 40, 40],
  'mudança do pedido recalcula todas as parcelas',
);

assertEqual(
  garantirSomaParcelas([parcela(1, 1729.65)], 1555.7).map((item) => item.valor),
  [1555.7],
  'barreira de persistência corrige payload legado divergente',
);

assertEqual(
  garantirSomaParcelas(
    [parcela(1, 40), parcela(2, 40), parcela(3, 19.99)],
    100,
  ).map((item) => item.valor),
  [40, 40, 20],
  'barreira de persistência corrige diferença residual',
);
