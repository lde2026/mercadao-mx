/**
 * A diferenca entre os planos e a quantidade de leads captados no mes; o
 * Escala nao tem teto. O anual tem 20% de desconto sobre doze mensalidades.
 */
export const PLANOS = {
  essencial: {
    nome: 'Essencial',
    mensal: 99,
    leadsMes: 100,
    rastreamento: false,
  },
  crescimento: {
    nome: 'Crescimento',
    mensal: 199,
    leadsMes: 300,
    rastreamento: true,
  },
  escala: {
    nome: 'Escala',
    mensal: 299,
    leadsMes: null,
    rastreamento: true,
  },
};

export const IMPLANTACAO = 990;
export const DESCONTO_ANUAL = 0.2;

export function precoDoPlano(plano, ciclo = 'mensal') {
  const escolhido = PLANOS[plano];
  if (!escolhido) throw new Error(`plano desconhecido: ${plano}`);
  if (ciclo !== 'anual') return escolhido.mensal;
  return Math.round(escolhido.mensal * 12 * (1 - DESCONTO_ANUAL) * 100) / 100;
}

export function planoTemRastreamento(plano) {
  return Boolean(PLANOS[plano]?.rastreamento);
}

/** null significa sem teto. */
export function cotaDeLeads(plano) {
  return PLANOS[plano]?.leadsMes ?? null;
}
