/**
 * O anual custa dez meses. O plano do meio e o desenhado para vender, porque
 * e onde entra o rastreamento de navegacao.
 */
export const PLANOS = {
  essencial: {
    nome: 'Essencial',
    mensal: 197,
    limiteLeadsMes: 300,
    rastreamento: false,
  },
  crescimento: {
    nome: 'Crescimento',
    mensal: 397,
    limiteLeadsMes: 1500,
    rastreamento: true,
  },
  escala: {
    nome: 'Escala',
    mensal: 797,
    limiteLeadsMes: null,
    rastreamento: true,
  },
};

export const IMPLANTACAO = 1500;

const MESES_NO_ANUAL = 10;

export function precoDoPlano(plano, ciclo = 'mensal') {
  const escolhido = PLANOS[plano];
  if (!escolhido) throw new Error(`plano desconhecido: ${plano}`);
  return ciclo === 'anual' ? escolhido.mensal * MESES_NO_ANUAL : escolhido.mensal;
}

export function planoTemRastreamento(plano) {
  return Boolean(PLANOS[plano]?.rastreamento);
}
