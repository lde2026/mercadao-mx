import { pedir } from './http.js';

/**
 * A Tray nao tem base de API propria: a base e o dominio da loja do lojista,
 * que chega no callback do OAuth como api_address. Guardar isso junto da
 * credencial nao e opcional, sem ele nao existe para onde chamar.
 *
 * O access_token dura poucas horas e o refresh cerca de um mes, entao toda
 * chamada passa por garantirToken. Sem isso o cupom falha de madrugada e o
 * lead recebe promessa sem recompensa.
 */

function base(credenciais) {
  return credenciais.api_address.replace(/\/+$/, '');
}

function expirado(credenciais) {
  if (!credenciais.expira_em) return true;
  // Margem de cinco minutos: token que vence no meio da requisicao falha igual
  // a token vencido.
  return new Date(credenciais.expira_em).getTime() - Date.now() < 5 * 60 * 1000;
}

export const tray = {
  plataforma: 'tray',
  tokenExpira: true,

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
        expira_em: resposta.date_expiration_access_token
          || new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      },
      renovou: true,
    };
  },

  /**
   * discount_coupons aceita form-urlencoded e recusa JSON, ao contrario do
   * resto da API. Enviar JSON aqui volta 400 sem explicacao util.
   */
  async criarCupom(credenciais, { codigo, desconto }) {
    const corpo = new URLSearchParams({
      'DiscountCoupon[code]': codigo,
      'DiscountCoupon[type]': 'percentual',
      'DiscountCoupon[value]': String(desconto),
      'DiscountCoupon[usage_counter_limit]': '1',
      'DiscountCoupon[active]': '1',
    });
    await pedir(`${base(credenciais)}/discount_coupons?access_token=${credenciais.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
    }, { plataforma: 'tray' });
    return { codigo };
  },

  /**
   * Sem API de injecao. O script e colado a mao no painel da Tray, e a
   * armadilha e o CSP com nonce do tema: script sem o nonce da pagina e
   * bloqueado pelo navegador sem erro visivel para o lojista.
   */
  async instalarScript(credenciais, urlScript) {
    return {
      modo: 'manual',
      instrucoes: [
        'No painel da Tray, entre em Configuracoes e Scripts personalizados.',
        'Cole a tag abaixo no campo de script do rodape e salve.',
        'Se o tema usar CSP com nonce, repita o nonce da pagina na tag, senao o navegador bloqueia sem avisar.',
      ],
      tag: `<script async src="${urlScript}"></script>`,
      urlScript,
    };
  },

  async listarPedidos(credenciais, desde) {
    const busca = new URLSearchParams({
      access_token: credenciais.access_token,
      modified_date: desde.toISOString().slice(0, 10),
      limit: '100',
    });
    const resposta = await pedir(`${base(credenciais)}/orders?${busca}`, {}, { plataforma: 'tray' });
    return (resposta?.Orders || []).map((item) => {
      const p = item.Order || item;
      return {
        idExterno: String(p.id),
        valor: Number(p.total || 0),
        cupomCodigo: p.discount_coupon || null,
        feitoEm: p.date,
      };
    });
  },
};
