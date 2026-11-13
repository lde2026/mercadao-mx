import crypto from 'node:crypto';
import { log } from './log.js';

/*
 * A ponta da Meta: o que chega do WhatsApp e o que sai para ele.
 *
 * Tudo que entra por aqui veio da internet aberta, entao nada e aproveitado
 * antes da assinatura conferir. E o numero do cliente final nunca aparece em
 * log: ele e dado pessoal de alguem que nem cliente nosso e.
 */

const GRAFO = process.env.META_GRAPH_URL || 'https://graph.facebook.com/v21.0';
const ESPERA = 15_000;

export function configurado() {
  return Boolean(process.env.META_APP_SECRET);
}

/**
 * A assinatura do corpo cru, em tempo constante.
 *
 * Sem segredo configurado a resposta e nao, nunca sim: uma instalacao que
 * esquecesse META_APP_SECRET aceitaria qualquer um mandando conversa falsa
 * para dentro das contas.
 */
export function assinaturaConfere(cru, cabecalho) {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo) return false;
  const oferecida = String(cabecalho || '');
  if (!oferecida.startsWith('sha256=')) return false;

  const esperada = 'sha256=' + crypto.createHmac('sha256', segredo).update(cru).digest('hex');
  const a = Buffer.from(oferecida);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A confirmacao que a Meta pede ao cadastrar o webhook. */
export function desafioDoWebhook(query) {
  const esperado = process.env.META_VERIFY_TOKEN || '';
  if (!esperado) return null;
  if (query['hub.mode'] !== 'subscribe') return null;
  const oferecido = String(query['hub.verify_token'] || '');
  const a = Buffer.from(oferecido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return String(query['hub.challenge'] || '');
}

/**
 * Tira do evento o que interessa: de qual numero da loja, e quais mensagens.
 *
 * O phone_number_id e o que diz de quem e a conversa. Ele vem da Meta, dentro
 * de um corpo ja autenticado pela assinatura, e e o unico campo aqui em que
 * da para confiar para essa decisao.
 *
 * Recibo de entrega e de leitura chegam no mesmo webhook e nao sao mensagem:
 * responder a eles seria o agente conversando com o proprio eco.
 */
export function lerEvento(corpo) {
  const saida = [];
  for (const entrada of corpo?.entry || []) {
    for (const mudanca of entrada?.changes || []) {
      const valor = mudanca?.value || {};
      const phoneId = valor?.metadata?.phone_number_id;
      if (!phoneId || !Array.isArray(valor.messages)) continue;

      const nomes = new Map();
      for (const c of valor.contacts || []) {
        if (c?.wa_id) nomes.set(String(c.wa_id), c?.profile?.name || null);
      }

      for (const m of valor.messages) {
        if (!m || !m.from) continue;
        saida.push({
          phoneId: String(phoneId),
          id: m.id ? String(m.id) : null,
          de: String(m.from),
          nome: nomes.get(String(m.from)) || null,
          tipo: String(m.type || ''),
          texto: m.type === 'text' ? String(m.text?.body || '') : '',
        });
      }
    }
  }
  return saida;
}

/** Manda um texto pelo numero da loja. */
export async function enviarTexto({ phoneId, token, para, texto, contaId = null }) {
  const resposta = await fetch(`${GRAFO}/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'text',
      text: { preview_url: false, body: String(texto).slice(0, 4000) },
    }),
    signal: AbortSignal.timeout(ESPERA),
  });

  if (!resposta.ok) {
    // O corpo do erro da Meta pode trazer o numero do destinatario, entao o
    // log fica so com o codigo.
    log.erro('whatsapp.envio_falhou', { conta_id: contaId, http: resposta.status });
    throw new Error(`whatsapp http ${resposta.status}`);
  }
  const dados = await resposta.json().catch(() => ({}));
  return dados?.messages?.[0]?.id || null;
}
