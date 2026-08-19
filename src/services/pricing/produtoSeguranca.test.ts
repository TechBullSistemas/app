import { avaliarFormula } from './formula';
import { roundN } from './casasDecimais';

function assertPreco(
  descricao: string,
  margemLucro: number,
  esperado: number,
  margemSeguranca = 9.07,
) {
  const formula =
    'v_vl_contabil / (1 - ((v_pr_margem_lucro + v_pr_pis_saida + v_pr_cofins_saida - v_pr_politica_comercial + v_pr_margem_seguranca + v_pr_icms_saida) / 100))';
  const resultado = avaliarFormula(formula, {
    v_vl_contabil: 25.769083,
    v_pr_margem_lucro: margemLucro,
    v_pr_pis_saida: 0.65,
    v_pr_cofins_saida: 3,
    v_pr_politica_comercial: 0,
    v_pr_margem_seguranca: margemSeguranca,
    v_pr_icms_saida: 17,
  });

  const recebido = resultado == null ? null : roundN(resultado, 2);
  if (recebido !== esperado) {
    throw new Error(
      `${descricao}: esperado ${esperado}, recebido ${String(recebido)}`,
    );
  }
}

assertPreco('NORMAL', 31.0038, 65.61);
assertPreco('TAB. A', 28, 60.95);
assertPreco('TAB. B', 27, 59.54);
assertPreco('produto sem margem de segurança', 31.0038, 53.3, 0);
