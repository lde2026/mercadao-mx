import crypto from 'node:crypto';
import { pedir, ErroPlataforma } from './http.js';

const BASE = 'https://api.tiendanube.com/v1';
// A Nuvemshop rejeita requisicao sem User-Agent identificavel.
const AGENTE = 'Captapp (contato@lojadoecommerce.com.br)';

function cabecalhos(credenciais) {
  return {
    'Authentication': `bearer ${credenciais.access_token}`,
    'User-Agent': AGENTE,
    'Content-Type': 'application/json',
  };
}

function url(credenciais, caminho) {
  return `${BASE}/${credenciais.store_id}${caminho}`;
}

/**
 * Loja inadimplente com a propria Nuvemshop devolve 402 em tudo, com script
 * fora do ar e webhook parado. Sem traduzir isso, o lojista abre chamado
 * conosco achando que o defeito e nosso.
 */
function traduzir(erro) {
  if (erro.status === 402) {
    erro.inadimplenteNaPlataforma = true;
    erro.message = 'loja inadimplente com a Nuvemshop';
  }
  return erro;
}

export const nuvemshop = {
  plataforma: 'nuvemshop',
  tokenExpira: false,

  /**
   * OAuth da Nuvemshop: o lojista instala o app pela loja de aplicativos e a
   * Nuvemshop manda um code para a URL de redirecionamento cadastrada. Aqui
   * o code vira o token permanente da loja. O client_secret fica na
   * credencial porque e com ele que se confere a assinatura do webhook.
   */
  urlDeAutorizacao({ appId }) {
    return `https://www.nuvemshop.com.br/apps/${encodeURIComponent(appId)}/authorize`;
  },

  async trocarCodigo({ code, clientId, clientSecret }) {
    const resposta = await pedir('https://www.tiendanube.com/apps/authorize/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENTE },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code,
      }).toString(),
    }, { plataforma: 'nuvemshop' });
    if (!resposta?.access_token || !resposta?.user_id) {
      throw new ErroPlataforma('resposta sem token', { plataforma: 'nuvemshop' });
    }
    return {
      store_id: String(resposta.user_id),
      access_token: resposta.access_token,
      client_secret: clientSecret,
    };
  },

  /** Nome e dominio da loja, para a conexao nascer com o nome certo. */
  async dadosDaLoja(credenciais) {
    const loja = await pedir(url(credenciais, ''), { headers: cabecalhos(credenciais) },
      { plataforma: 'nuvemshop' });
    const nome = typeof loja?.name === 'object' ? (loja.name.pt || Object.values(loja.name)[0]) : loja?.name;
    return { nome: nome || null, dominio: loja?.original_domain || loja?.domains?.[0] || null };
  },

  async criarCupom(credenciais, { codigo, desconto, frete = false }) {
    try {
      await pedir(url(credenciais, '/coupons'), {
        method: 'POST',
        headers: cabecalhos(credenciais),
        body: JSON.stringify({
          code: codigo,
          // shipping e o tipo de frete gratis na Nuvemshop; o value e ignorado nele.
          type: frete ? 'shipping' : 'percentage',
          value: frete ? '0' : String(desconto),
          max_uses: 1,
          valid: true,
        }),
      }, { plataforma: 'nuvemshop' });
      return { codigo };
    } catch (erro) {
      throw traduzir(erro);
    }
  },

  /**
   * Instalacao automatica de verdade, unica das quatro. A ressalva importa
   * para a venda: a Nuvemshop so carrega script em pagina de produto e no
   * checkout, entao a home do lojista fica sem widget e nao ha o que fazer
   * pelo lado dele.
   */
  async instalarScript(credenciais, urlScript) {
    try {
      const criado = await pedir(url(credenciais, '/scripts'), {
        method: 'POST',
        headers: cabecalhos(credenciais),
        body: JSON.stringify({ src: urlScript, event: 'onload', where: 'store' }),
      }, { plataforma: 'nuvemshop' });
      return {
        modo: 'auto',
        idScript: criado?.id ? String(criado.id) : null,
        ressalva: 'A Nuvemshop carrega o script apenas em pagina de produto e no checkout. A home fica sem o widget.',
      };
    } catch (erro) {
      throw traduzir(erro);
    }
  },

  async removerScript(credenciais, idScript) {
    await pedir(url(credenciais, `/scripts/${idScript}`), {
      method: 'DELETE', headers: cabecalhos(credenciais),
    }, { plataforma: 'nuvemshop' });
  },

  async criarWebhook(credenciais, urlDestino) {
    return pedir(url(credenciais, '/webhooks'), {
      method: 'POST',
      headers: cabecalhos(credenciais),
      body: JSON.stringify({ event: 'order/paid', url: urlDestino }),
    }, { plataforma: 'nuvemshop' });
  },

  verificarWebhook(credenciais, corpoBruto, cabecalhosReq) {
    const assinatura = cabecalhosReq['x-linkedstore-hmac-sha256'];
    if (!assinatura || !credenciais.client_secret) return false;
    const esperado = crypto
      .createHmac('sha256', credenciais.client_secret)
      .update(corpoBruto)
      .digest('hex');
    const a = Buffer.from(assinatura);
    const b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  async lerPedido(credenciais, idPedido) {
    const pedido = await pedir(url(credenciais, `/orders/${idPedido}`), {
      headers: cabecalhos(credenciais),
    }, { plataforma: 'nuvemshop' });
    return {
      idExterno: String(pedido.id),
      valor: Number(pedido.total || 0),
      cupomCodigo: pedido.coupon?.[0]?.code || null,
      feitoEm: pedido.created_at,
    };
  },

  async listarPedidos(credenciais, desde) {
    const busca = new URLSearchParams({ created_at_min: desde.toISOString(), per_page: '200' });
    const pedidos = await pedir(url(credenciais, `/orders?${busca}`), {
      headers: cabecalhos(credenciais),
    }, { plataforma: 'nuvemshop' });
    return (pedidos || []).map((p) => ({
      idExterno: String(p.id),
      valor: Number(p.total || 0),
      cupomCodigo: p.coupon?.[0]?.code || null,
      feitoEm: p.created_at,
    }));
  },
};
