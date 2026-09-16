/**
 * Os planos se separam por tres coisas: quantos leads por mes, quantas lojas
 * conectadas e se o rastreamento de navegacao entra. O Escala nao tem teto de
 * leads. O anual tem 20% de desconto sobre doze mensalidades.
 *
 * O teto de lojas tem teto de verdade em todos, inclusive no Escala: uma
 * conta e um cliente, e dez lojas ja e agencia. Passar disso e conversa de
 * contrato, nao botao no painel.
 */
export const PLANOS = {
  essencial: {
    nome: 'Essencial',
    mensal: 99,
    leadsMes: 100,
    lojas: 1,
    rastreamento: false,
  },
  crescimento: {
    nome: 'Crescimento',
    mensal: 199,
    leadsMes: 300,
    lojas: 3,
    rastreamento: true,
  },
  escala: {
    nome: 'Escala',
    mensal: 299,
    leadsMes: null,
    lojas: 10,
    rastreamento: true,
  },
};

/**
 * Conta sem assinatura ainda nao escolheu plano, e e por aqui que ela entra.
 *
 * Usar o plano de entrada como teto e a escolha conservadora: quem precisa de
 * mais loja escolhe o plano, que e um clique, e ninguem conecta dez lojas sem
 * nunca assinar nada.
 */
export const PLANO_DE_ENTRADA = 'essencial';

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

/** Quantas lojas o plano permite conectar. Sem plano, vale o de entrada. */
export function cotaDeLojas(plano) {
  return (PLANOS[plano] || PLANOS[PLANO_DE_ENTRADA]).lojas;
}
