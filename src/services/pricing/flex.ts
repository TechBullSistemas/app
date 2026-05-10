import type { RepresentanteEngine } from './types';
import { getSaldoEfetivo } from '@/db/repositories/flex';
import { roundN, safeNumber } from './casasDecimais';

export interface FlexValidacaoInput {
  representante: RepresentanteEngine;
  holdingId: number;
  vlVenda: number; // total da venda (base do %)
  vlDescontoConcedido: number; // desconto total concedido pelo vendedor
  vlAcrescimoConcedido: number; // acréscimo (gera flex positivo)
  draftDelta?: number; // saldo do draft em andamento
}

export interface FlexValidacaoResult {
  ok: boolean;
  motivo?: string;
  vlFlexItem: number; // delta de saldo gerado por essa operação
  prDescontoAplicado: number;
  saldoAtual: number;
  saldoApos: number;
  prFlexMin: number;
  prFlexMax: number;
}

/**
 * Porta de `FLEX_validacao` (legado). Calcula:
 *  - prDescontoAplicado = vlDesc / vlVenda * 100
 *  - vlFlexItem = vlAcrescimoConcedido − vlDescontoConcedido
 *  - Valida prFlexMin/prFlexMax do representante
 *  - Confere se o saldo efetivo (consolidado + outbox + draft) cobre o débito
 */
export async function validacaoFlex(
  input: FlexValidacaoInput,
): Promise<FlexValidacaoResult> {
  const rep = input.representante;
  const vlFlexItem = roundN(
    safeNumber(input.vlAcrescimoConcedido) - safeNumber(input.vlDescontoConcedido),
    2,
  );
  const prDescontoAplicado =
    input.vlVenda > 0
      ? roundN(
          (safeNumber(input.vlDescontoConcedido) / safeNumber(input.vlVenda)) * 100,
          3,
        )
      : 0;

  const saldoAtual = await getSaldoEfetivo(
    safeNumber(rep.vlSaldoFlex),
    rep.cdRepresentante,
    input.holdingId,
    input.draftDelta ?? 0,
  );
  const saldoApos = roundN(saldoAtual + vlFlexItem, 2);

  // Validação de min/max (% do desconto sobre a venda)
  if (rep.prFlexMax > 0 && prDescontoAplicado > rep.prFlexMax) {
    return {
      ok: false,
      motivo: `Desconto ${prDescontoAplicado}% excede o máximo permitido (${rep.prFlexMax}%).`,
      vlFlexItem,
      prDescontoAplicado,
      saldoAtual,
      saldoApos,
      prFlexMin: rep.prFlexMin,
      prFlexMax: rep.prFlexMax,
    };
  }

  // Saldo insuficiente: só bloqueia se for débito (vlFlexItem < 0).
  if (vlFlexItem < 0 && saldoApos < 0) {
    return {
      ok: false,
      motivo: `Saldo Flex insuficiente (atual ${saldoAtual.toFixed(2)}, ficaria em ${saldoApos.toFixed(2)}).`,
      vlFlexItem,
      prDescontoAplicado,
      saldoAtual,
      saldoApos,
      prFlexMin: rep.prFlexMin,
      prFlexMax: rep.prFlexMax,
    };
  }

  return {
    ok: true,
    vlFlexItem,
    prDescontoAplicado,
    saldoAtual,
    saldoApos,
    prFlexMin: rep.prFlexMin,
    prFlexMax: rep.prFlexMax,
  };
}
