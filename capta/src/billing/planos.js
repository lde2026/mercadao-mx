/**
 * Dois planos, e a diferenca entre eles e so o teto de leads.
 *
 * Eram tres. Tres fazia o lojista comparar linhas de tabela em vez de decidir,
 * e o do meio nao vendia: quem precisava de mais de cem leads ja precisava de
 * mais de trezentos. Agora e uma pergunta so, "voce passa de 500 leads por
 * mes", e quem nao sabe comeca embaixo e sobe num clique.
 *
 * O rastreamento de navegacao entra nos dois. Ele era a cenoura do plano do
 * meio, e sem plano do meio virava motivo de nao assinar o de entrada: saber
 * o que a pessoa olhou antes de responder e o que faz a vendedora abrir a
 * conversa certa, e isso vale para a loja pequena tambem.
 *
 * O anual e 20% sobre doze mensalidades, para os dois planos. Uma conta so,
 * no lugar de preco escrito a mao em cada plano: assim mexer no mensal ja
 * acerta o anual, e nao existe a chance de um dos dois ficar para tras.
 */
export const PLANOS = {
  essencial: {
    nome: 'Essencial',
    mensal: 59,
    leadsMes: 500,
    lojas: 1,
    rastreamento: true,
  },
  crescimento: {
    nome: 'Ilimitado',
    mensal: 99,
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

export const IMPLANTACAO = 699;
export const DESCONTO_ANUAL = 0.2;

/**
 * Implantacao: a vista com desconto, ou parcelado sem juros.
 *
 * Sem juros quer dizer sem juros de verdade: seis parcelas somam os mesmos
 * R$ 990. Quem paga de uma vez leva 10% porque o dinheiro entra hoje e nao
 * passa pelo risco de parcela que nao vem.
 *
 * As duas formas vivem aqui, e nao espalhadas pela rota e pela landing,
 * porque preco que a pagina anuncia diferente do que a fatura cobra e
 * problema de consumidor, nao de codigo.
 */
export const DESCONTO_AVISTA = 0.1;
export const PARCELAS_IMPLANTACAO = 6;

export const FORMAS_IMPLANTACAO = ['avista', 'parcelado'];

export function precoDaImplantacao(forma = 'avista') {
  if (forma === 'parcelado') {
    const parcela = Math.round((IMPLANTACAO / PARCELAS_IMPLANTACAO) * 100) / 100;
    return {
      forma: 'parcelado',
      total: IMPLANTACAO,
      parcelas: PARCELAS_IMPLANTACAO,
      valorParcela: parcela,
    };
  }
  return {
    forma: 'avista',
    total: Math.round(IMPLANTACAO * (1 - DESCONTO_AVISTA) * 100) / 100,
    parcelas: 1,
    valorParcela: Math.round(IMPLANTACAO * (1 - DESCONTO_AVISTA) * 100) / 100,
    desconto: DESCONTO_AVISTA,
    economia: Math.round(IMPLANTACAO * DESCONTO_AVISTA * 100) / 100,
  };
}

export function precoDoPlano(plano, ciclo = 'mensal') {
  const escolhido = PLANOS[plano];
  if (!escolhido) throw new Error(`plano desconhecido: ${plano}`);
  if (ciclo !== 'anual') return escolhido.mensal;
  // O anual e cobrado de uma vez, entao o que vale e o total do ano.
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
