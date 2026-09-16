/**
 * De onde veio a requisicao, de verdade.
 *
 * Com `trust proxy: true`, o Express devolve a primeira entrada do cabecalho
 * X-Forwarded-For, que e escrita pelo proprio cliente. Basta mandar um valor
 * diferente a cada requisicao para que todo limite por IP passe a contar
 * baldes separados: forca bruta de senha sem teto, lead falso sem teto, e o
 * "IP mascarado" que guardamos por LGPD vira ficcao escolhida pelo atacante.
 *
 * Por isso duas decisoes aqui:
 *
 * O numero de saltos confiaveis e explicito (PROXY_SALTOS), nunca `true`.
 * Atras do Cloudflare, CF-Connecting-IP e melhor ainda, porque o Cloudflare
 * SOBRESCREVE esse cabecalho em vez de acrescentar. Mas so vale quando o
 * Cloudflare e a unica porta de entrada: se alguem alcanca o servidor direto,
 * forja o cabecalho e volta a escolher o proprio IP. Por isso e opcional e
 * precisa ser ligado de proposito.
 */

export const SALTOS_CONFIAVEIS = Number(process.env.PROXY_SALTOS) || 1;

function ehIpPlausivel(valor) {
  const limpo = String(valor || '').trim();
  if (!limpo || limpo.length > 45) return false;
  return /^[0-9a-f:.]+$/i.test(limpo);
}

export function ipDoCliente(req) {
  if (process.env.CONFIAR_CLOUDFLARE === '1') {
    const cloudflare = req.headers['cf-connecting-ip'];
    if (ehIpPlausivel(cloudflare)) return String(cloudflare).trim();
  }
  return req.ip || null;
}
