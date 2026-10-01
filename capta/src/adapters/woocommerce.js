import crypto from 'node:crypto';
import { pedir } from './http.js';

/**
 * A mais simples das quatro: basic auth com consumer key e secret, cupom e
 * webhook por API. O preco e o pre-requisito de ambiente, que some sem aviso:
 * sem HTTPS e sem permalink em "nome do post", /wp-json deixa de existir e
 * toda chamada volta 404 como se a loja nao tivesse WooCommerce.
 */

function base(credenciais) {
  return `${credenciais.url.replace(/\/+$/, '')}/wp-json/wc/v3`;
}

function cabecalhos(credenciais) {
  const par = Buffer.from(`${credenciais.consumer_key}:${credenciais.consumer_secret}`).toString('base64');
  return { Authorization: `Basic ${par}`, 'Content-Type': 'application/json' };
}

export const woocommerce = {
  plataforma: 'woocommerce',
  tokenExpira: false,

  async criarCupom(credenciais, { codigo, desconto, frete = false }) {
    await pedir(`${base(credenciais)}/coupons`, {
      method: 'POST',
      headers: cabecalhos(credenciais),
      body: JSON.stringify({
        code: codigo,
        // Frete gratis no WooCommerce nao e um tipo, e uma flag num cupom de
        // valor zero. Sem o fixed_cart zerado ele recusa criar.
        discount_type: frete ? 'fixed_cart' : 'percent',
        amount: frete ? '0' : String(desconto),
        free_shipping: frete,
        usage_limit: 1,
        individual_use: true,
      }),
    }, { plataforma: 'woocommerce' });
    return { codigo };
  },

  /**
   * O WooCommerce nao tem API de injecao de script porque quem manda no tema
   * e o WordPress. Por isso o modo e manual mesmo com a API sendo a mais
   * aberta das quatro.
   *
   * Duas saidas, e a tag vem junto de proposito: o plugin so aparece em
   * "Plugins, Adicionar novo" depois de publicado no repositorio oficial do
   * WordPress, e ate la essa instrucao sozinha manda o lojista procurar uma
   * coisa que nao existe. Colar a tag no tema funciona hoje, em qualquer
   * loja WooCommerce, sem depender de aprovacao de ninguem.
   */
  async instalarScript(credenciais, urlScript) {
    return {
      modo: 'manual',
      instrucoes: [
        'Cole a tag abaixo no tema, antes do </body>: em Aparencia, Editor de temas, ou pelo seu plugin de cabecalho e rodape.',
        'Salve e recarregue a loja. O botao aparece no canto que voce escolheu.',
        'Alternativa, quando o plugin Captapp estiver publicado no WordPress: instale por Plugins, Adicionar novo, e cole a chave da loja em Configuracoes, Captapp. Ele injeta o widget sozinho e se mantem atualizado.',
      ],
      tag: `<script async src="${urlScript}"></script>`,
      urlScript,
    };
  },

  async criarWebhook(credenciais, urlDestino, segredo) {
    return pedir(`${base(credenciais)}/webhooks`, {
      method: 'POST',
      headers: cabecalhos(credenciais),
      body: JSON.stringify({
        name: 'Captapp pedido pago',
        topic: 'order.updated',
        delivery_url: urlDestino,
        secret: segredo,
      }),
    }, { plataforma: 'woocommerce' });
  },

  verificarWebhook(credenciais, corpoBruto, cabecalhosReq) {
    const assinatura = cabecalhosReq['x-wc-webhook-signature'];
    if (!assinatura || !credenciais.segredo_webhook) return false;
    const esperado = crypto
      .createHmac('sha256', credenciais.segredo_webhook)
      .update(corpoBruto)
      .digest('base64');
    const a = Buffer.from(assinatura);
    const b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  async listarPedidos(credenciais, desde) {
    const busca = new URLSearchParams({
      after: desde.toISOString(), status: 'processing,completed', per_page: '100',
    });
    const pedidos = await pedir(`${base(credenciais)}/orders?${busca}`, {
      headers: cabecalhos(credenciais),
    }, { plataforma: 'woocommerce' });
    return (pedidos || []).map((p) => ({
      idExterno: String(p.id),
      valor: Number(p.total || 0),
      cupomCodigo: p.coupon_lines?.[0]?.code || null,
      feitoEm: p.date_created_gmt ? `${p.date_created_gmt}Z` : p.date_created,
    }));
  },
};
