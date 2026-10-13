import { planoTemRastreamento, cotaDeLeads, cotaDeLojas } from './planos.js';

/**
 * Regua de inadimplencia.
 *
 * Atrasar pagamento nao apaga nada. O que cai, cai em degraus, e nada disso
 * toca lead: quem paga volta a funcionar no mesmo minuto, sem reimplantacao.
 *
 * Esta funcao e pura de proposito. Ela recebe o estado e devolve a decisao,
 * sem ler banco e sem relogio proprio, para que os degraus possam ser testados
 * dia a dia sem montar cenario de banco. Errar aqui corta loja que esta em dia.
 */

export const DEGRAUS = {
  RASTREAMENTO: 7,
  WIDGET: 10,
  SCRIPT: 45,
};

const DIA_EM_MS = 24 * 60 * 60 * 1000;

function paraDiaUtc(valor) {
  const data = valor instanceof Date ? valor : new Date(valor);
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
}

/**
 * Conta a partir da cobranca vencida mais antiga ainda em aberto. Usar a mais
 * recente faria a segunda fatura em aberto zerar o atraso da primeira e a
 * conta nunca chegaria a degrau nenhum.
 */
export function diasDeAtraso(cobrancasAbertas, hoje = new Date()) {
  const dia = paraDiaUtc(hoje);
  let pior = 0;
  for (const cobranca of cobrancasAbertas || []) {
    const atraso = Math.floor((dia - paraDiaUtc(cobranca.vence_em)) / DIA_EM_MS);
    if (atraso > pior) pior = atraso;
  }
  return pior;
}

/** Dias que faltam do teste. Negativo quer dizer que ja acabou. */
export function diasDeTeste(testeAte, hoje = new Date()) {
  if (!testeAte) return null;
  return Math.ceil((paraDiaUtc(testeAte) - paraDiaUtc(hoje)) / DIA_EM_MS);
}

export function calcularAcesso({
  assinatura, cobrancasAbertas = [], hoje = new Date(), leadsNoMes = 0, testeAte = null,
} = {}) {
  const atraso = diasDeAtraso(cobrancasAbertas, hoje);
  const plano = assinatura?.plano || null;

  /*
   * Teste de 7 dias vencido sem assinatura.
   *
   * So o widget sai da loja. O painel continua inteiro, e os leads captados
   * no teste continuam la, visiveis e exportaveis: quem experimentou e nao
   * assinou ainda pode voltar, e tirar dele o que ja captou seria cobrar
   * duas vezes pela mesma decisao.
   *
   * Conta com assinatura ativa ignora o teste: quem assinou saiu dele.
   * Conta sem teste_ate e conta anterior a esta regra, e nao perde nada.
   */
  const assinou = Boolean(assinatura) && assinatura.status === 'ativa';
  const diasRestantes = diasDeTeste(testeAte, hoje);
  const testeVencido = !assinou && diasRestantes != null && diasRestantes < 0;

  // Cota do plano atingida: o chat sai do ar na loja ate o dia 1 ou ate o
  // upgrade. So o widget cai; o painel e os leads ja captados ficam.
  const cota = cotaDeLeads(plano);
  const cotaEstourada = cota != null && leadsNoMes >= cota;

  // Conta sem assinatura nenhuma e conta em implantacao, antes da primeira
  // cobranca existir, e nao pode nascer trancada. Quem derruba servico e
  // cancelamento explicito ou atraso, nunca a ausencia de registro.
  const parada = Boolean(assinatura) && assinatura.status !== 'ativa';

  const acesso = {
    plano,
    cotaLeads: cota,
    // Quantas lojas o plano permite. Informativo aqui: quem recusa a loja
    // numero seguinte e o repositorio, no momento de criar.
    cotaLojas: cotaDeLojas(plano),
    leadsNoMes,
    cotaEstourada,
    diasAtraso: atraso,
    emTeste: !assinou && diasRestantes != null && diasRestantes >= 0,
    diasDeTeste: diasRestantes,
    testeVencido,
    rastreamento: !parada && planoTemRastreamento(plano) && atraso < DEGRAUS.RASTREAMENTO,
    widget: !parada && !testeVencido && atraso < DEGRAUS.WIDGET && !cotaEstourada,
    painel: parada || atraso >= DEGRAUS.WIDGET ? 'leitura' : 'total',
    // A remocao do script depende so do atraso, nunca do status da assinatura:
    // cancelamento e outro assunto e nao esta na regua que voce definiu.
    scriptNaLoja: atraso < DEGRAUS.SCRIPT,
    // Nunca muda. Esta escrito para que mudar isso exija apagar esta linha
    // de proposito, e nao acontecer por descuido numa refatoracao.
    leadsPreservados: true,
  };

  if (testeVencido) acesso.motivo = 'teste de 7 dias encerrado, sem plano escolhido';
  else if (parada) acesso.motivo = `assinatura ${assinatura.status}`;
  else if (atraso >= DEGRAUS.SCRIPT) acesso.motivo = `script removido da loja, ${atraso} dias de atraso`;
  else if (atraso >= DEGRAUS.WIDGET) acesso.motivo = `widget fora do ar e painel em leitura, ${atraso} dias de atraso`;
  else if (atraso >= DEGRAUS.RASTREAMENTO) acesso.motivo = `rastreamento desligado, ${atraso} dias de atraso`;
  else if (cotaEstourada) acesso.motivo = `cota de ${cota} leads do mes atingida`;

  return acesso;
}

/** Aviso no painel antes do primeiro corte, para o lojista nao ser pego de surpresa. */
export function avisoDeCobranca(acesso) {
  if (acesso.diasAtraso <= 0) return null;
  if (acesso.diasAtraso < DEGRAUS.RASTREAMENTO) {
    return {
      gravidade: 'aviso',
      texto: `Fatura em aberto há ${acesso.diasAtraso} dia(s). No dia ${DEGRAUS.RASTREAMENTO} o rastreamento de navegação é desligado.`,
    };
  }
  if (acesso.diasAtraso < DEGRAUS.WIDGET) {
    return {
      gravidade: 'aviso',
      texto: `Rastreamento desligado por atraso. No dia ${DEGRAUS.WIDGET} o widget sai do ar da loja.`,
    };
  }
  if (acesso.diasAtraso < DEGRAUS.SCRIPT) {
    return {
      gravidade: 'erro',
      texto: `Widget fora do ar e painel em leitura. Seus leads continuam guardados. No dia ${DEGRAUS.SCRIPT} o script é removido da loja.`,
    };
  }
  return {
    gravidade: 'erro',
    texto: 'Script removido da loja. Seus leads continuam guardados e voltam no mesmo minuto do pagamento.',
  };
}

/** Aviso do teste: quanto falta, e o que acontece quando acabar. */
export function avisoDeTeste(acesso) {
  if (acesso.testeVencido) {
    return {
      gravidade: 'erro',
      texto: 'Seu teste de 7 dias acabou e o chat saiu do ar na loja. O painel e os leads que você já captou continuam seus. Escolha um plano para o chat voltar.',
    };
  }
  if (!acesso.emTeste) return null;
  const dias = acesso.diasDeTeste;
  if (dias === 0) {
    return { gravidade: 'aviso', texto: 'Último dia do teste. Amanhã o chat sai do ar na loja, mas o painel e os leads continuam com você.' };
  }
  if (dias <= 3) {
    return { gravidade: 'aviso', texto: `Faltam ${dias} dia(s) de teste. Depois disso o chat sai do ar na loja; o painel e os leads ficam.` };
  }
  return { gravidade: 'aviso', texto: `Teste gratuito: faltam ${dias} dias.` };
}

/** Aviso no painel quando a cota derrubou o chat. */
export function avisoDeCota(acesso) {
  if (!acesso.cotaEstourada) return null;
  return {
    gravidade: 'erro',
    texto: `Cota de ${acesso.cotaLeads} leads do mês atingida. O chat saiu do ar na loja e volta no dia 1, ou na hora se você mudar de plano.`,
  };
}
