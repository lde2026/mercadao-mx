/**
 * Os precos do Atende Ai.
 *
 * Arquivo proprio, separado do planos.js, de proposito. O Captapp tem
 * assinatura com historia e cliente dentro, e juntar os dois agora seria
 * decidir no codigo uma pergunta comercial que ainda nao tem resposta.
 * Quando tiver, isto vira um arquivo que some, e nao uma migracao de dado
 * vivo com cliente pagando no meio.
 *
 * A faixa e teto de mensagens que o agente envia no mes, e nao de conversas:
 * conversa e o que se vende, mensagem e o que se mede. A conversao entre as
 * duas depende de quantas respostas uma conversa leva, que muda por loja, e
 * por isso ela fica na proposta e nao aqui.
 */

export const FAIXAS = {
  essencial: { nome: 'Essencial', mensagens: 1000, mensal: 197 },
  crescimento: { nome: 'Crescimento', mensagens: 3000, mensal: 397 },
  escala: { nome: 'Escala', mensagens: 8000, mensal: 797 },
};

export const FAIXA_DE_ENTRADA = 'essencial';

/**
 * Excedente a quatro vezes o custo, e nao bloqueio.
 *
 * Cortar a resposta ao cliente final para forcar uma troca de plano estraga
 * justamente o produto que foi vendido: a loja fica muda no WhatsApp no dia
 * de maior movimento. Entao passou do teto, cobra, e avisa antes.
 */
export const EXCEDENTE = 0.15;
export const AVISAR_EM = 0.8;

export const DESCONTO_ANUAL = 0.2;

/**
 * Duas ativacoes. A diferenca nao e o que se configura, e quem fica junto nos
 * primeiros 30 dias, que e quando o agente erra e o lojista decide se confia
 * nele. A acompanhada e seguro contra cancelamento no mes 2, nao um extra.
 */
export const ATIVACOES = {
  simples: { nome: 'Ativação', valor: 997 },
  acompanhada: { nome: 'Ativação acompanhada', valor: 1890, dias: 30, revisoes: 4 },
};

function centavos(v) { return Math.round(v * 100) / 100; }

export function ehFaixa(nome) {
  return Object.prototype.hasOwnProperty.call(FAIXAS, String(nome));
}

export function precoDaFaixa(nome, ciclo = 'mensal') {
  const faixa = FAIXAS[nome];
  if (!faixa) return null;
  const mensal = ciclo === 'anual'
    ? centavos(faixa.mensal * (1 - DESCONTO_ANUAL))
    : faixa.mensal;
  return {
    faixa: nome,
    nome: faixa.nome,
    ciclo: ciclo === 'anual' ? 'anual' : 'mensal',
    mensal,
    total: ciclo === 'anual' ? centavos(mensal * 12) : mensal,
    mensagens: faixa.mensagens,
  };
}

export function precoDaAtivacao(tipo = 'simples') {
  const ativacao = ATIVACOES[tipo];
  return ativacao ? { tipo, ...ativacao } : null;
}

/**
 * Onde a conta esta dentro da faixa dela.
 *
 * Devolve tambem o que ja passou do teto, porque e isso que entra na fatura,
 * e o aviso, porque o lojista precisa saber antes e nao na conta do mes
 * seguinte.
 */
export function situacao(enviadas, nome = FAIXA_DE_ENTRADA) {
  const faixa = FAIXAS[nome] || FAIXAS[FAIXA_DE_ENTRADA];
  const usadas = Math.max(0, Math.trunc(Number(enviadas) || 0));
  const sobrando = Math.max(0, faixa.mensagens - usadas);
  const passou = Math.max(0, usadas - faixa.mensagens);

  return {
    faixa: FAIXAS[nome] ? nome : FAIXA_DE_ENTRADA,
    nome: faixa.nome,
    incluidas: faixa.mensagens,
    enviadas: usadas,
    sobrando,
    fatia: faixa.mensagens ? usadas / faixa.mensagens : 0,
    avisar: usadas >= faixa.mensagens * AVISAR_EM,
    excedente: { mensagens: passou, valor: centavos(passou * EXCEDENTE) },
  };
}

/** A faixa que caberia esse volume, para sugerir a troca em vez do excedente. */
export function faixaPara(enviadas) {
  const usadas = Math.max(0, Math.trunc(Number(enviadas) || 0));
  const nomes = Object.keys(FAIXAS);
  for (const nome of nomes) {
    if (usadas <= FAIXAS[nome].mensagens) return nome;
  }
  return nomes[nomes.length - 1];
}
