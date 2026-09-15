import { planoTemRastreamento, cotaDeLeads } from './planos.js';

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

export function calcularAcesso({ assinatura, cobrancasAbertas = [], hoje = new Date() } = {}) {
  const atraso = diasDeAtraso(cobrancasAbertas, hoje);
  const plano = assinatura?.plano || null;

  // Conta sem assinatura nenhuma e conta em implantacao, antes da primeira
  // cobranca existir, e nao pode nascer trancada. Quem derruba servico e
  // cancelamento explicito ou atraso, nunca a ausencia de registro.
  const parada = Boolean(assinatura) && assinatura.status !== 'ativa';

  const acesso = {
    plano,
    cotaLeads: cotaDeLeads(plano),
    diasAtraso: atraso,
    rastreamento: !parada && planoTemRastreamento(plano) && atraso < DEGRAUS.RASTREAMENTO,
    widget: !parada && atraso < DEGRAUS.WIDGET,
    painel: parada || atraso >= DEGRAUS.WIDGET ? 'leitura' : 'total',
    // A remocao do script depende so do atraso, nunca do status da assinatura:
    // cancelamento e outro assunto e nao esta na regua que voce definiu.
    scriptNaLoja: atraso < DEGRAUS.SCRIPT,
    // Nunca muda. Esta escrito para que mudar isso exija apagar esta linha
    // de proposito, e nao acontecer por descuido numa refatoracao.
    leadsPreservados: true,
  };

  if (parada) acesso.motivo = `assinatura ${assinatura.status}`;
  else if (atraso >= DEGRAUS.SCRIPT) acesso.motivo = `script removido da loja, ${atraso} dias de atraso`;
  else if (atraso >= DEGRAUS.WIDGET) acesso.motivo = `widget fora do ar e painel em leitura, ${atraso} dias de atraso`;
  else if (atraso >= DEGRAUS.RASTREAMENTO) acesso.motivo = `rastreamento desligado, ${atraso} dias de atraso`;

  return acesso;
}

/** Aviso no painel antes do primeiro corte, para o lojista nao ser pego de surpresa. */
export function avisoDeCobranca(acesso) {
  if (acesso.diasAtraso <= 0) return null;
  if (acesso.diasAtraso < DEGRAUS.RASTREAMENTO) {
    return {
      gravidade: 'aviso',
      texto: `Fatura em aberto ha ${acesso.diasAtraso} dia(s). No dia ${DEGRAUS.RASTREAMENTO} o rastreamento de navegacao e desligado.`,
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
      texto: `Widget fora do ar e painel em leitura. Seus leads continuam guardados. No dia ${DEGRAUS.SCRIPT} o script e removido da loja.`,
    };
  }
  return {
    gravidade: 'erro',
    texto: 'Script removido da loja. Seus leads continuam guardados e voltam no mesmo minuto do pagamento.',
  };
}
