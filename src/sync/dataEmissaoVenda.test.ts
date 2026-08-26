import { aplicarDataSincronizacaoVenda } from './dataEmissaoVenda';

function assertEqual(recebido: unknown, esperado: unknown, caso: string) {
  if (JSON.stringify(recebido) !== JSON.stringify(esperado)) {
    throw new Error(
      `${caso}: esperado ${JSON.stringify(esperado)}, recebido ${JSON.stringify(recebido)}`,
    );
  }
}

const payload = {
  dtEmissao: '2026-08-25T10:00:00.000Z',
  prevendaTitulo: [
    {
      nrParcela: 1,
      dtEmissao: '2026-08-25T10:00:00.000Z',
      dtVencto: '2026-09-25T00:00:00.000Z',
    },
  ],
};

assertEqual(
  aplicarDataSincronizacaoVenda(payload, false, '2026-08-26T14:30:00.000Z'),
  payload,
  'mantém a emissão original quando a configuração está desativada',
);

assertEqual(
  aplicarDataSincronizacaoVenda(payload, true, '2026-08-26T14:30:00.000Z'),
  {
    ...payload,
    dtEmissao: '2026-08-26T14:30:00.000Z',
    prevendaTitulo: [
      {
        ...payload.prevendaTitulo[0],
        dtEmissao: '2026-08-26T14:30:00.000Z',
      },
    ],
  },
  'aplica o mesmo instante de sincronização à venda e aos títulos',
);
