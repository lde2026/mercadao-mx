import { pedir } from './http.js';

/**
 * Tray, conforme developers.tray.com.br (captura de 15/09/2026, em
 * docs/tray-api.md).
 *
 * A Tray nao tem base de API propria: a base e o dominio da loja do lojista,
 * que chega no callback do OAuth como api_address e ja vem com /web_api no
 * fim. Guardar isso junto da credencial nao e opcional, sem ele nao existe
 * para onde chamar.
 *
 * O access_token dura tres horas e o refresh trinta dias, entao toda chamada
 * passa por garantirToken. Sem isso o cupom falha de madrugada e o lead
 * recebe promessa sem recompensa.
 *
 * O token vai sempre na query string. Em cabecalho a API responde 401.
 */

function base(credenciais) {
  return String(credenciais.api_address || '').replace(/\/+$/, '');
}

function comToken(credenciais, caminho, extras = {}) {
  const busca = new URLSearchParams({ access_token: credenciais.access_token, ...extras });
  return `${base(credenciais)}${caminho}?${busca}`;
}

function expirado(credenciais) {
  if (!credenciais.expira_em) return true;
  // Margem de cinco minutos: token que vence no meio da requisicao falha igual
  // a token vencido.
  return new Date(credenciais.expira_em).getTime() - Date.now() < 5 * 60 * 1000;
}

/**
 * A Tray devolve "2021-03-02 14:58:21" ou so "2021-03-02", sempre no horario
 * de Brasilia e sem fuso. Data que nao parseia vira null em vez de estourar,
 * porque um pedido com data estranha nao pode derrubar a varredura inteira.
 */
function dataDaTray(texto) {
  if (!texto || /^0000/.test(String(texto))) return null;
  const partes = String(texto).trim().split(' ');
  const hora = partes[1] || '00:00:00';
  const data = new Date(`${partes[0]}T${hora}-03:00`);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/**
 * O corpo do cupom vai em form-urlencoded com as chaves exatamente como a
 * documentacao mostra no exemplo oficial: ["DiscountCoupon"]["campo"].
 */
function formulario(recurso, campos) {
  const corpo = new URLSearchParams();
  for (const [campo, valor] of Object.entries(campos)) {
    corpo.append(`["${recurso}"]["${campo}"]`, String(valor));
  }
  return corpo.toString();
}

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JSON_ = { 'Content-Type': 'application/json' };

function normalizarPedido(p) {
  // discount_coupon vem como "codigo/valor"; coupon.code e o campo limpo.
  const codigo = p.coupon?.code || String(p.discount_coupon || '').split('/')[0] || null;
  return {
    idExterno: String(p.id),
    valor: Number(p.total || 0),
    cupomCodigo: codigo,
    feitoEm: dataDaTray(p.date && p.hour ? `${p.date} ${p.hour}` : p.date) || new Date().toISOString(),
    pago: String(p.has_payment) === '1',
  };
}

export const tray = {
  plataforma: 'tray',
  tokenExpira: true,

  /**
   * Passo 1 do OAuth: para onde mandar o lojista. O consumer_key e do nosso
   * aplicativo e vem do ambiente, nunca da conexao.
   */
  urlDeAutorizacao({ dominioLoja, consumerKey, callback }) {
    const busca = new URLSearchParams({ response_type: 'code', consumer_key: consumerKey, callback });
    return `${String(dominioLoja).replace(/\/+$/, '')}/auth.php?${busca}`;
  },

  /**
   * Passo 3 do OAuth: troca o code (uso unico) pelo par de tokens. O que
   * volta daqui e a credencial completa da conexao.
   */
  async trocarCodigo({ apiAddress, code, consumerKey, consumerSecret }) {
    const corpo = new URLSearchParams({
      consumer_key: consumerKey, consumer_secret: consumerSecret, code,
    });
    const resposta = await pedir(`${String(apiAddress).replace(/\/+$/, '')}/auth`, {
      method: 'POST', headers: FORM, body: corpo.toString(),
    }, { plataforma: 'tray' });
    return {
      api_address: String(resposta.api_host || apiAddress).replace(/\/+$/, ''),
      access_token: resposta.access_token,
      refresh_token: resposta.refresh_token,
      expira_em: dataDaTray(resposta.date_expiration_access_token)
        || new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      refresh_expira_em: dataDaTray(resposta.date_expiration_refresh_token),
      store_id: String(resposta.store_id || ''),
    };
  },

  /**
   * Devolve as credenciais possivelmente renovadas. Quem chama e responsavel
   * por gravar de volta quando renovou, senao a renovacao se perde e a cada
   * chamada gasta um refresh.
   */
  async garantirToken(credenciais) {
    if (!expirado(credenciais)) return { credenciais, renovou: false };

    const busca = new URLSearchParams({ refresh_token: credenciais.refresh_token });
    const resposta = await pedir(`${base(credenciais)}/auth?${busca}`, {
      method: 'GET',
    }, { plataforma: 'tray' });

    return {
      credenciais: {
        ...credenciais,
        access_token: resposta.access_token,
        refresh_token: resposta.refresh_token || credenciais.refresh_token,
        expira_em: dataDaTray(resposta.date_expiration_access_token)
          || new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
        refresh_expira_em: dataDaTray(resposta.date_expiration_refresh_token)
          || credenciais.refresh_expira_em || null,
      },
      renovou: true,
    };
  },

  /** Nome e dominio da loja, para a conexao nascer com o nome certo. */
  async dadosDaLoja(credenciais) {
    const info = await pedir(comToken(credenciais, '/info'), {}, { plataforma: 'tray' });
    return {
      nome: info?.name || null,
      dominio: String(info?.secure_uri || info?.uri || '').replace(/^https?:\/\//, '') || null,
      storeId: info?.id ? String(info.id) : null,
    };
  },

  /** Formas de envio ativas, que o cupom de frete gratis precisa listar. */
  async listarFretes(credenciais) {
    const resposta = await pedir(comToken(credenciais, '/shippings', { status: '1', limit: '50' }),
      {}, { plataforma: 'tray' });
    return (resposta?.Shippings || [])
      .map((item) => item.Shipping || item)
      .filter((f) => String(f.status) === '1')
      .map((f) => String(f.id));
  },

  /**
   * Cupom de uso unico. type e "%" ou "$", description e obrigatorio e os
   * dois limites de uso precisam bater, senao a loja recusa na hora de
   * aplicar. Frete gratis e um cupom de zero reais ligado as formas de envio
   * da loja por create_relationship.
   */
  async criarCupom(credenciais, { codigo, desconto, frete = false }) {
    const criado = await pedir(comToken(credenciais, '/discount_coupons'), {
      method: 'POST',
      headers: FORM,
      body: formulario('DiscountCoupon', {
        code: codigo,
        description: frete ? 'Captapp: frete gratis do lead' : 'Captapp: cupom do lead',
        value: frete ? '0.00' : Number(desconto).toFixed(2),
        type: frete ? '$' : '%',
        usage_counter_limit: '1',
        usage_counter_limit_customer: '1',
        cumulative_discount: '0',
      }),
    }, { plataforma: 'tray' });

    if (frete) {
      const fretes = await this.listarFretes(credenciais);
      if (!fretes.length) throw new Error('loja sem forma de envio ativa para o frete gratis');
      await pedir(comToken(credenciais, `/discount_coupons/create_relationship/${criado.id}`), {
        method: 'POST',
        headers: JSON_,
        body: JSON.stringify({
          DiscountCouponShipping: fretes.slice(0, 100).map((id) => ({ shipping_id: id })),
        }),
      }, { plataforma: 'tray' });
    }

    return { codigo, idExterno: criado?.id ? String(criado.id) : null };
  },

  /**
   * Instalacao automatica por external_scripts: um POST com a url e a loja
   * passa a carregar o widget em toda pagina. O id volta para a remocao do
   * dia 45 da regua.
   */
  async instalarScript(credenciais, urlScript) {
    const criado = await pedir(comToken(credenciais, '/external_scripts'), {
      method: 'POST',
      headers: JSON_,
      body: JSON.stringify({ ExternalScript: { source: urlScript } }),
    }, { plataforma: 'tray' });
    return {
      modo: 'auto',
      idScript: criado?.id ? String(criado.id) : null,
    };
  },

  async removerScript(credenciais, idScript) {
    await pedir(comToken(credenciais, `/external_scripts/${idScript}`), {
      method: 'DELETE',
    }, { plataforma: 'tray' });
  },

  /**
   * O webhook da Tray nao tem assinatura: chega em form-urlencoded com
   * seller_id, scope_name, scope_id e act. A defesa e dupla: o seller_id tem
   * de ser a loja desta conexao, e nada do corpo e gravado. O pedido e lido
   * de novo na API, que e quem sabe se ele existe e se foi pago.
   */
  verificarWebhook(credenciais, corpoBruto) {
    const campos = new URLSearchParams(String(corpoBruto));
    if (campos.get('scope_name') !== 'order') return false;
    return Boolean(credenciais.store_id) && campos.get('seller_id') === String(credenciais.store_id);
  },

  idDoWebhook(corpoBruto) {
    return new URLSearchParams(String(corpoBruto)).get('scope_id');
  },

  /** Devolve null quando o pedido ainda nao foi pago, para nao contar venda antes da hora. */
  async lerPedido(credenciais, idPedido) {
    const resposta = await pedir(comToken(credenciais, `/orders/${encodeURIComponent(idPedido)}`),
      {}, { plataforma: 'tray' });
    const pedido = normalizarPedido(resposta?.Order || resposta);
    return pedido.pago ? pedido : null;
  },

  /**
   * Varredura por data de modificacao, que e o unico filtro de periodo que a
   * listagem oferece. Paginas de 50, no maximo cinco por rodada, para ficar
   * longe do teto de 180 chamadas por minuto da loja.
   */
  async listarPedidos(credenciais, desde) {
    const pagos = [];
    for (let pagina = 1; pagina <= 5; pagina += 1) {
      const resposta = await pedir(comToken(credenciais, '/orders', {
        modified: desde.toISOString().slice(0, 10),
        limit: '50',
        page: String(pagina),
      }), {}, { plataforma: 'tray' });
      const itens = (resposta?.Orders || []).map((item) => normalizarPedido(item.Order || item));
      pagos.push(...itens.filter((p) => p.pago));
      const total = Number(resposta?.paging?.total || 0);
      if (itens.length < 50 || pagina * 50 >= total) break;
    }
    return pagos;
  },
};
