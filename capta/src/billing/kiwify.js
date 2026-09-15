import crypto from 'node:crypto';
import { log } from '../log.js';
import * as repo from '../repositorio.js';
import { consultar } from '../db.js';

/**
 * Atalho para vender antes da integracao com o Asaas ficar pronta, e nao o
 * destino.
 *
 * A regra que mantem isso seguro: a Kiwify nao escreve estado de acesso. Ela
 * escreve cobranca com origem kiwify, como qualquer outra origem, e quem
 * decide corte continua sendo acesso.js. Duas fontes de verdade sobre acesso
 * e como se corta loja que esta em dia.
 */

export function conferirAssinatura(corpoBruto, assinaturaRecebida) {
  const segredo = process.env.KIWIFY_WEBHOOK_TOKEN || '';
  if (!segredo || !assinaturaRecebida) return false;
  const esperado = crypto.createHmac('sha1', segredo).update(corpoBruto).digest('hex');
  const a = Buffer.from(String(assinaturaRecebida));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PAGO = new Set(['paid', 'approved']);
const PERDIDO = new Set(['refunded', 'chargedback', 'canceled', 'refused']);

export async function processarWebhook(corpo) {
  const status = String(corpo?.order_status || corpo?.status || '').toLowerCase();
  const idExterno = corpo?.order_id || corpo?.id;
  const email = corpo?.Customer?.email || corpo?.customer?.email;

  if (!idExterno || !email) throw new Error('webhook da Kiwify sem pedido ou cliente');

  const conta = await repo.buscarContaPorEmail(email);
  if (!conta) {
    await repo.alertar({
      tipo: 'webhook_cobranca_sem_conta',
      gravidade: 'erro',
      mensagem: 'Webhook da Kiwify para email sem conta no Captapp',
      dados: { origem: 'kiwify', id_externo: idExterno },
    });
    return { tratado: false };
  }

  if (PAGO.has(status)) {
    const { rowCount } = await consultar(
      `update cobrancas set status = 'paga', pago_em = now(), atualizado_em = now()
        where origem = 'kiwify' and id_externo = $1`,
      [String(idExterno)],
    );
    if (!rowCount) {
      // Venda avulsa que nunca teve cobranca aberta aqui. Registrar ja paga
      // mantem o historico financeiro completo sem afetar a regua.
      await repo.registrarCobranca({
        contaId: conta.id,
        valor: Number(corpo?.Commissions?.charge_amount || corpo?.charge_amount || 0) / 100,
        origem: 'kiwify',
        idExterno: String(idExterno),
        venceEm: new Date().toISOString().slice(0, 10),
        status: 'paga',
      });
    }
    log.info('cobranca.paga', { conta_id: conta.id, origem: 'kiwify' });
    return { tratado: true, acao: 'quitada' };
  }

  if (PERDIDO.has(status)) {
    await repo.reabrirCobranca('kiwify', String(idExterno));
    log.aviso('cobranca.reaberta', { conta_id: conta.id, origem: 'kiwify', status });
    return { tratado: true, acao: 'reaberta' };
  }

  return { tratado: false, acao: 'ignorada' };
}
