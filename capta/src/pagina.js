import dns from 'node:dns/promises';
import net from 'node:net';
import { log } from './log.js';

/**
 * Le a pagina da loja para o assistente aproveitar o que ja esta escrito la.
 *
 * O lojista cola o link e o assistente monta a proposta com o que achou: nome,
 * segmento, prazo, forma de pagamento, politica de troca. Economiza a parte
 * mais chata do preenchimento, que e justamente a que faz ele desistir no
 * meio e deixar a base pela metade.
 *
 * Mas isto e o servidor buscando uma URL escolhida por quem esta do outro
 * lado, e isso e um pedido de SSRF se for feito ingenuamente: o endereco que
 * ele manda pode apontar para dentro da propria rede do Capta, ou para o
 * servico de metadados da nuvem, que responde credencial da maquina a quem
 * perguntar. Por isso o endereco e resolvido e conferido antes da conexao,
 * redirecionamento passa pela mesma conferencia, e so entra o que e HTML.
 *
 * E o texto que volta e entrada nao confiavel como qualquer outra. Ele nunca
 * grava: viagem no maximo a uma proposta, que o lojista confirma ou nao.
 */

const TETO_BYTES = 400_000;
const TETO_TEXTO = 12_000;
const ESPERA = 8_000;
const SALTOS = 2;

/** Endereco que nao e unicast publico nao se busca, e so. */
export function enderecoFechado(ip) {
  const tipo = net.isIP(ip);
  if (!tipo) return true;

  if (tipo === 6) {
    const baixo = ip.toLowerCase();
    // IPv4 escrito em IPv6 (::ffff:169.254.169.254) e o disfarce mais obvio.
    const mapeado = baixo.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return enderecoFechado(mapeado[1]);
    if (baixo === '::1' || baixo === '::') return true;
    const inicio = baixo.split(':')[0];
    const grupo = parseInt(inicio || '0', 16);
    if (Number.isNaN(grupo)) return true;
    if ((grupo & 0xfe00) === 0xfc00) return true;          // fc00::/7, rede local
    if ((grupo & 0xffc0) === 0xfe80) return true;          // fe80::/10, link-local
    if (baixo.startsWith('64:ff9b:')) return true;         // NAT64 para IPv4
    if (baixo.startsWith('2002:')) return true;            // 6to4
    return false;
  }

  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;                 // metadados da nuvem
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;       // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true;                               // multicast e reservado
  return false;
}

/**
 * Confere o endereco antes de abrir a conexao.
 *
 * O que fica de fora: esquema que nao e http, porta que nao e a de web, nome
 * que resolve para endereco fechado. A resolucao acontece aqui e a conexao
 * acontece depois, entao em teoria o nome pode mudar de endereco no meio
 * (DNS rebinding). Vale o risco: o pior caso e o conteudo de uma pagina
 * interna virar uma proposta que o lojista veria antes de confirmar, e o
 * corpo buscado nunca e devolvido cru para o navegador dele.
 */
export async function conferir(cru) {
  let url;
  try {
    url = new URL(String(cru).trim());
  } catch {
    return { erro: 'esse endereço não parece um link' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { erro: 'o endereço precisa começar com http ou https' };
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    return { erro: 'o endereço tem uma porta fora do padrão' };
  }
  if (url.username || url.password) return { erro: 'o endereço tem usuário e senha dentro dele' };

  // Endereco escrito direto como IP nao passa pelo DNS, mas passa pela
  // mesma regra.
  if (net.isIP(url.hostname)) {
    return enderecoFechado(url.hostname) ? { erro: 'esse endereço é de rede interna' } : { url };
  }
  if (!url.hostname.includes('.') || url.hostname.endsWith('.localhost')) {
    return { erro: 'esse endereço é de rede interna' };
  }

  let enderecos;
  try {
    enderecos = await dns.lookup(url.hostname, { all: true });
  } catch {
    return { erro: 'não achei esse endereço' };
  }
  if (!enderecos.length) return { erro: 'não achei esse endereço' };
  if (enderecos.some((e) => enderecoFechado(e.address))) {
    return { erro: 'esse endereço é de rede interna' };
  }
  return { url };
}

/** Tira marcacao e sobra o texto que uma pessoa leria na pagina. */
export function textoDoHtml(html) {
  const limpo = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const titulo = (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const descricao = (String(html).match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  ) || [])[1] || '';

  const texto = [titulo, descricao, limpo]
    .join('\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  return texto.slice(0, TETO_TEXTO);
}

/**
 * Busca a pagina e devolve o texto, ou o motivo de nao ter dado.
 *
 * O corpo e lido em pedacos e cortado no teto: pagina de 40 MB existe, e
 * carregar ela inteira na memoria para depois jogar fora e o jeito facil de
 * derrubar o servidor por acidente.
 */
export async function lerPagina(cru, { contaId = null } = {}) {
  let alvo = cru;

  for (let salto = 0; salto <= SALTOS; salto += 1) {
    const checado = await conferir(alvo);
    if (checado.erro) return { erro: checado.erro };

    let resposta;
    try {
      resposta = await fetch(checado.url, {
        redirect: 'manual',
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Capta/1.0' },
        signal: AbortSignal.timeout(ESPERA),
      });
    } catch (erro) {
      log.aviso('pagina.falhou', { conta_id: contaId, motivo: erro.name });
      return { erro: 'não consegui abrir essa página' };
    }

    // Redirecionamento nao se segue no automatico: o destino e um endereco
    // novo e passa pela mesma conferencia do primeiro.
    if (resposta.status >= 300 && resposta.status < 400) {
      const destino = resposta.headers.get('location');
      if (!destino) return { erro: 'não consegui abrir essa página' };
      alvo = new URL(destino, checado.url).toString();
      continue;
    }

    if (!resposta.ok) return { erro: `a página respondeu ${resposta.status}` };

    const tipo = (resposta.headers.get('content-type') || '').toLowerCase();
    if (!tipo.includes('text/html') && !tipo.includes('xhtml')) {
      return { erro: 'esse link não é uma página de site' };
    }

    let bytes = 0;
    const pedacos = [];
    for await (const pedaco of resposta.body) {
      bytes += pedaco.length;
      pedacos.push(pedaco);
      if (bytes >= TETO_BYTES) break;
    }
    const html = Buffer.concat(pedacos).toString('utf8');
    const texto = textoDoHtml(html);
    if (texto.length < 80) return { erro: 'essa página não tem texto que eu consiga ler' };

    log.info('pagina.lida', { conta_id: contaId, caracteres: texto.length });
    // O html volta junto para quem precisa dos links da pagina. Ele nao sai
    // daqui para o modelo: o que vai para o prompt e sempre o texto.
    return { texto, html, endereco: checado.url.toString() };
  }

  return { erro: 'essa página redireciona demais' };
}

/** Acha o primeiro link no que o lojista escreveu. */
export function acharLink(texto) {
  const achado = String(texto).match(/https?:\/\/[^\s<>"']+/i);
  if (achado) return achado[0].replace(/[.,;:)]+$/, '');
  // Ele cola "lojadoecommerce.com.br" sem o https na frente mais vezes que
  // com, e recusar isso seria recusar o caso comum.
  const nu = String(texto).match(/(?:^|\s)((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(\/[^\s]*)?/i);
  if (nu && /\.(com|br|net|org|store|shop|io|co|me|app)\b/i.test(nu[1])) {
    return `https://${nu[1]}${nu[2] || ''}`;
  }
  return null;
}


/*
 * As paginas que respondem o que o lojista nao deveria ter que digitar.
 *
 * A home de uma loja nao tem politica de troca: ela tem um link para a
 * politica de troca, no rodape. Entao, para "manda o link que eu leio o
 * site" ser verdade, e preciso seguir esses links. A lista e de palavras que
 * aparecem no caminho ou no texto do link, e nao de caminhos fixos, porque
 * cada plataforma usa um.
 */
const PALAVRAS = [
  'troca', 'devolu', 'reembolso', 'garantia',
  'entrega', 'frete', 'envio', 'prazo',
  'pagamento', 'parcel',
  'faq', 'duvida', 'duvidas', 'ajuda', 'atendimento', 'contato',
  'politica', 'privacidade', 'termos', 'sobre', 'quem-somos', 'quem_somos',
];

const TETO_EXTRA = 5_000;
const TETO_JUNTO = 22_000;
const EXTRAS = 3;

/** Os links da pagina que parecem responder alguma coisa da base. */
export function linksUteis(html, base) {
  const achados = [];
  const vistos = new Set();
  const raiz = new URL(base);
  const padrao = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;

  let casou = padrao.exec(html);
  while (casou) {
    let url = null;
    try {
      url = new URL(casou[1], base);
    } catch { url = null; }

    if (url && (url.protocol === 'http:' || url.protocol === 'https:')
      // So o mesmo site. Link para o Instagram da loja nao e base de
      // conhecimento, e seguir dominio de terceiro aqui seria transformar o
      // nosso servidor em buscador de endereco escolhido por quem escreveu a
      // pagina.
      && url.hostname === raiz.hostname) {
      url.hash = '';
      const chave = url.toString();
      const alvo = (url.pathname + ' ' + casou[2]).toLowerCase();
      if (!vistos.has(chave) && chave !== base && PALAVRAS.some((p) => alvo.includes(p))) {
        vistos.add(chave);
        achados.push(chave);
      }
    }
    casou = padrao.exec(html);
  }
  return achados;
}

/**
 * Le a loja: a pagina que o lojista mandou mais as que ela aponta.
 *
 * O lojista manda o endereco da loja e espera que a gente saiba a politica de
 * troca dele. Ler so a home nao cumpre isso, e ficar perguntando campo por
 * campo e o que ele pediu para parar de fazer.
 */
export async function lerLoja(cru, { contaId = null, extras = EXTRAS } = {}) {
  const principal = await lerPagina(cru, { contaId });
  if (principal.erro) return principal;

  const candidatas = linksUteis(principal.html || '', principal.endereco).slice(0, extras);
  const partes = [`Página ${principal.endereco}:\n${principal.texto}`];
  const lidas = [principal.endereco];
  let tamanho = partes[0].length;

  for (const endereco of candidatas) {
    if (tamanho >= TETO_JUNTO) break;
    // Uma pagina que nao abre nao derruba a leitura: a loja continua tendo a
    // home, que ja vale mais que nada.
    const extra = await lerPagina(endereco, { contaId });
    if (extra.erro) continue;
    const pedaco = `Página ${extra.endereco}:\n${extra.texto.slice(0, TETO_EXTRA)}`;
    partes.push(pedaco);
    lidas.push(extra.endereco);
    tamanho += pedaco.length;
  }

  log.info('loja.lida', { conta_id: contaId, paginas: lidas.length });
  return {
    texto: partes.join('\n\n').slice(0, TETO_JUNTO),
    endereco: principal.endereco,
    paginas: lidas,
  };
}
