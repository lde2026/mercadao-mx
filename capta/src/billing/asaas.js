import crypto from 'node:crypto';
import { pedir } from '../adapters/http.js';
import { log } from '../log.js';
import { precoDoPlano, IMPLANTACAO } from './planos.js';
import * as repo from '../repositorio.js';

/**
 * Asaas aceita boleto, Pix e cartao na mesma assinatura e emite NFS-e por API,
 * que e o motivo de ser o destino e nao o atalho.
 */

function base() {
  return process.env.ASAAS_BASE || 'https://api.asaas.com/v3';
}

function cabecalhos() {
  return { access_token: process.env.ASAAS_API_KEY, 'Content-Type': 'application/json' };
}

export async function criarCliente({ nome, email, cpfCnpj, telefone }) {
  return pedir(`${base()}/customers`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({ name: nome, email, cpfCnpj, mobilePhone: telefone }),
  }, { plataforma: 'asaas' });
}

export async function criarAssinatura({ clienteExterno, plano, ciclo, formaPagamento = 'UNDEFINED' }) {
  const valor = precoDoPlano(plano, ciclo);
  const proximo = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return pedir(`${base()}/subscriptions`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({
      customer: clienteExterno,
      billingType: formaPagamento,
      value: valor,
      nextDueDate: proximo,
      cycle: ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
      description: `Capta ${plano} ${ciclo}`,
    }),
  }, { plataforma: 'asaas' });
}

export async function cobrarImplantacao({ clienteExterno, venceEm }) {
  return pedir(`${base()}/payments`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({
      customer: clienteExterno,
      billingType: 'UNDEFINED',
      value: IMPLANTACAO,
      dueDate: venceEm,
      description: 'Implantacao Capta',
    }),
  }, { plataforma: 'asaas' });
}

/** O token do webhook e conferido em tempo constante para nao virar oraculo. */
export function conferirToken(cabecalhosReq) {
  const recebido = cabecalhosReq['asaas-access-token'] || '';
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN || '';
  if (!esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const QUITAM = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH']);
const ABREM = new Set(['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_OVERDUE']);
const ANULAM = new Set(['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED']);

/**
 * O webhook nao decide acesso, so escreve o estado da cobranca. Quem decide
 * corte e sempre acesso.js, lendo cobranca em aberto. Isso mantem uma fonte de
 * verdade unica mesmo com Asaas e Kiwify convivendo.
 */
export async function processarWebhook(corpo) {
  const evento = corpo?.event;
  const pagamento = corpo?.payment;
  if (!evento || !pagamento?.id) {
    throw new Error('webhook do Asaas sem evento ou pagamento');
  }

  const conta = await contaPorClienteExterno(pagamento.customer);
  if (!conta) {
    // Cobranca de cliente que nao existe aqui e sinal de configuracao errada,
    // nao de ataque, mas precisa aparecer para alguem.
    await repo.alertar({
      tipo: 'webhook_cobranca_sem_conta',
      gravidade: 'erro',
      mensagem: `Webhook do Asaas para cliente externo desconhecido no evento ${evento}`,
      dados: { evento, cliente_externo: pagamento.customer },
    });
    return { tratado: false };
  }

  if (QUITAM.has(evento)) {
    await repo.quitarCobranca('asaas', pagamento.id);
    log.info('cobranca.paga', { conta_id: conta.id, origem: 'asaas', evento });
    return { tratado: true, acao: 'quitada' };
  }

  if (ABREM.has(evento)) {
    await repo.registrarCobranca({
      contaId: conta.id,
      tipo: /implanta/i.test(pagamento.description || '') ? 'implantacao' : 'assinatura',
      valor: Number(pagamento.value),
      origem: 'asaas',
      idExterno: pagamento.id,
      venceEm: pagamento.dueDate,
      status: 'aberta',
    });
    log.info('cobranca.aberta', { conta_id: conta.id, origem: 'asaas', evento });
    return { tratado: true, acao: 'aberta' };
  }

  if (ANULAM.has(evento)) {
    await repo.cancelarCobranca('asaas', pagamento.id);
    log.info('cobranca.cancelada', { conta_id: conta.id, origem: 'asaas', evento });
    return { tratado: true, acao: 'cancelada' };
  }

  return { tratado: false, acao: 'ignorada' };
}

async function contaPorClienteExterno(clienteExterno) {
  return repo.contaPorClienteExterno(clienteExterno);
}

export async function cancelarAssinatura(idExterno) {
  return pedir(`${base()}/subscriptions/${idExterno}`, {
    method: 'DELETE', headers: cabecalhos(),
  }, { plataforma: 'asaas' });
}

export function configurado() {
  return Boolean(process.env.ASAAS_API_KEY);
}
