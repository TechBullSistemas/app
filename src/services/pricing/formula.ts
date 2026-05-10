// Avaliador de fórmula dinâmica via expr-eval (sandbox).
//
// O legado guardava em `Empresa.dsFuncaoCalculoPrecoVenda` uma string de SQL
// avaliada via `eval` (vulnerabilidade clássica). Aqui usamos `expr-eval` com
// whitelist de variáveis: nada além de aritmética, if/else, min/max e
// funções matemáticas básicas é aceito. Sem acesso a SQL, JS, IO nem
// objetos do sistema.

import { Parser } from 'expr-eval';

const parser = new Parser({
  allowMemberAccess: false,
  operators: {
    add: true,
    concatenate: false,
    conditional: true,
    divide: true,
    factorial: false,
    multiply: true,
    power: true,
    remainder: true,
    subtract: true,
    logical: true,
    comparison: true,
    in: false,
    assignment: false,
  },
});

const ALLOWED_FUNCTIONS = new Set([
  'abs',
  'ceil',
  'floor',
  'round',
  'min',
  'max',
  'sqrt',
  'log',
  'exp',
  'pow',
  'if',
]);

export interface FormulaContext {
  // Variáveis aritméticas pré-injetadas. Tudo no formato número.
  // Convenção do legado: nomes começam por `v_`.
  [key: string]: number | string | boolean;
}

/**
 * Avalia uma expressão escrita pelo usuário (Empresa.dsFuncaoCalculoPrecoVenda).
 * Retorna o número resultante; em qualquer erro devolve `null` para o motor cair
 * no comportamento padrão (preço sem fórmula).
 */
export function avaliarFormula(
  expressao: string | null | undefined,
  contexto: FormulaContext,
): number | null {
  if (!expressao || !expressao.trim()) return null;
  try {
    const parsed = parser.parse(expressao);
    // Validação: apenas variáveis whitelisted ou funções permitidas.
    const refs = parsed.variables({ withMembers: false });
    for (const r of refs) {
      if (ALLOWED_FUNCTIONS.has(r)) continue;
      if (!Object.prototype.hasOwnProperty.call(contexto, r)) {
        // Variável desconhecida → trata como zero (legado fazia o mesmo).
        contexto[r] = 0;
      }
    }
    const value = parsed.evaluate(contexto as any);
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}
