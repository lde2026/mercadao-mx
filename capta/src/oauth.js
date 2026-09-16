import { tray, nuvemshop, adaptador } from './adapters/index.js';
import { log } from './log.js';
import * as repo from './repositorio.js';

/**
 * Conexao de loja por OAuth, para o lojista ligar a loja sozinho sem copiar
 * token de lugar nenhum.
 *
 * O code que a plataforma manda e de uso unico e vence em minutos, entao a
 * troca por token acontece na hora, na propria callback, antes de saber qual
 * conta do Captapp vai ficar com a loja. O token resultante fica no banco,
 * cifrado, numa linha sem dono; para o painel viaja apenas o id dessa linha,
 * o "bilhete". Quem esta logado entrega o bilhete em /api/conexoes/oauth e
 * a loja passa a ser da conta dele.
 *
 * O bilhete e id opaco de uso unico, e nao a credencial em si, por uma razao
 * concreta: URL vaza. Vai para o historico do navegador, para a sincronizacao
 * da conta Google, para extensao instalada, para print de tela em suporte.
 * Um id ja queimado que vazou nao serve para nada; um token de loja que vazou
 * entrega a loja do cliente.
 */

const VALIDADE_BILHETE_MINUTOS = 15;

/**
 * Para onde o segredo do nosso aplicativo pode ser enviado.
 *
 * A Tray manda o `api_address` na propria query da callback, e a troca do
 * code exige um POST com consumer_key e consumer_secret para esse endereco.
 * Sem restricao, qualquer pessoa chama a callback com api_address apontando
 * para o servidor dela e recebe o segredo do nosso aplicativo, que vale para
 * TODAS as lojas conectadas. Apontando para 127.0.0.1 ou para o servico de
 * metadados da nuvem, vira varredura da rede interna com o erro devolvido na
 * tela como oraculo.
 *
 * Por isso o destino e uma lista fechada. Loja em dominio proprio entra em
 * TRAY_DOMINIOS, uma por vez, na hora de conectar. E chato de proposito:
 * a alternativa e um segredo que qualquer um coleta.
 */
const SUFIXOS_TRAY = ['.commercesuite.com.br'];

function dominiosPermitidos() {
  const extras = (process.env.TRAY_DOMINIOS || '')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return [...SUFIXOS_TRAY, ...extras];
}

/** Devolve a URL normalizada, ou null quando o destino nao e aceitavel. */
export function enderecoDeLojaTray(bruto, { exigirHttps = process.env.NODE_ENV === 'production' } = {}) {
  let url;
  try {
    url = new URL(String(bruto || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && (exigirHttps || url.protocol !== 'http:')) return null;
  if (url.port && !['', '80', '443'].includes(url.port)) return null;
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase();
  // Endereco numerico nunca e loja: e tentativa de alcancar a rede interna.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;

  const aceito = dominiosPermitidos().some((sufixo) => (
    sufixo.startsWith('.') ? host.endsWith(sufixo) : host === sufixo || host.endsWith(`.${sufixo}`)
  ));
  return aceito ? url : null;
}

const URL_PUBLICA = () => process.env.URL_PUBLICA || 'http://localhost:3000';

export function configuracaoOauth() {
  return {
    tray: Boolean(process.env.TRAY_CONSUMER_KEY && process.env.TRAY_CONSUMER_SECRET),
    nuvemshop: Boolean(process.env.NUVEMSHOP_CLIENT_ID && process.env.NUVEMSHOP_CLIENT_SECRET),
    nuvemshopAppId: process.env.NUVEMSHOP_CLIENT_ID || null,
  };
}

function bilhete(plataforma, credenciais, extras = {}) {
  return repo.guardarConexaoPendente({
    plataforma, credenciais, extras, validadeMinutos: VALIDADE_BILHETE_MINUTOS,
  });
}

/** Resgate unico. Id repetido, vencido ou inventado sai daqui como erro. */
export async function abrirBilhete(id) {
  const dados = await repo.resgatarConexaoPendente(id);
  if (!dados) throw new Error('bilhete invalido ou ja usado, conecte a loja de novo');
  return dados;
}

/** Pagina minima, sem script, para o iframe do painel da Tray. */
function pagina(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<style>body{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111318;background:#f6f7f9;margin:0;padding:32px 20px}
.cx{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e6ec;border-radius:14px;padding:28px}
h1{font-size:22px;margin:0 0 10px}p{margin:0 0 14px;color:#4b5563}
.bt{display:inline-block;background:#15803d;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px}
.erro{color:#b91c1c}</style></head><body><div class="cx">${corpo}</div></body></html>`;
}

function escapar(texto) {
  return String(texto || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Cabecalhos das paginas de callback: podem abrir em iframe da plataforma, e nada mais. */
function cabecalhosDeCallback(res) {
  res.removeHeader('X-Frame-Options');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *");
  res.set('Cache-Control', 'no-store');
  res.type('html');
}

export function registrarRotasOauth(app) {
  /**
   * Tray, passo 1: a Tray abre esta pagina dentro do painel da loja com url,
   * adm_user e store. O botao leva ao auth.php da loja, no topo da janela,
   * porque a tela de autorizacao da Tray nao vive dentro de iframe.
   */
  app.get('/tray/callback', (req, res) => {
    cabecalhosDeCallback(res);
    const { tray: pronto } = configuracaoOauth();
    if (!pronto) {
      return res.status(503).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">A integracao com a Tray ainda nao esta configurada neste servidor.</p>'));
    }
    // Sem esta conferencia, a pagina viraria um botao de aparencia oficial,
    // no nosso dominio, apontando para onde o atacante quisesse.
    const loja = enderecoDeLojaTray(req.query.url || req.query.store_host);
    if (!loja) {
      return res.status(400).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">Abra esta pagina pelo painel da sua loja Tray, em Meus aplicativos. Se a sua loja usa dominio proprio, fale com a gente para liberar o endereco.</p>'));
    }
    const destino = tray.urlDeAutorizacao({
      dominioLoja: loja.origin,
      consumerKey: process.env.TRAY_CONSUMER_KEY,
      callback: `${URL_PUBLICA()}/tray/callback/auth`,
    });
    res.send(pagina('Instalar o Captapp', `<h1>Captapp na sua loja</h1>
<p>O Captapp coloca um chat na vitrine que pergunta o que o visitante procura, entrega um beneficio e manda o contato para o seu painel.</p>
<p>Ao instalar, a Tray vai pedir sua autorizacao para o Captapp criar cupons e ler pedidos da loja.</p>
<a class="bt" href="${escapar(destino)}" target="_top">Instalar agora</a>`));
  });

  /** Tray, passo 3: chega code e api_address; troca por token e manda para o painel. */
  app.get('/tray/callback/auth', async (req, res) => {
    cabecalhosDeCallback(res);
    const { code, api_address: apiAddress, store, store_host: storeHost } = req.query;
    if (!code || !apiAddress) {
      return res.status(400).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">A Tray nao mandou o codigo de autorizacao. Tente instalar de novo pelo painel da loja.</p>'));
    }
    // O consumer_secret vai no corpo do POST para este endereco. Ele so pode
    // sair daqui para uma loja Tray conhecida.
    const destinoApi = enderecoDeLojaTray(apiAddress);
    if (!destinoApi) {
      log.aviso('oauth.tray.destino_recusado', { host: (() => { try { return new URL(String(apiAddress)).hostname; } catch { return 'ilegivel'; } })() });
      return res.status(400).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">Endereco de API nao reconhecido como loja Tray. Se a sua loja usa dominio proprio, fale com a gente para liberar o endereco.</p>'));
    }
    try {
      const credenciais = await tray.trocarCodigo({
        apiAddress: destinoApi.toString().replace(/\/+$/, ''), code: String(code),
        consumerKey: process.env.TRAY_CONSUMER_KEY,
        consumerSecret: process.env.TRAY_CONSUMER_SECRET,
      });
      // A loja responde com api_host, e e nele que as chamadas futuras vao.
      // Uma loja comprometida poderia apontar para fora; a lista fechada vale
      // para a resposta tambem.
      if (!enderecoDeLojaTray(credenciais.api_address)) {
        log.aviso('oauth.tray.api_host_recusado', { store_id: credenciais.store_id || null });
        credenciais.api_address = destinoApi.toString().replace(/\/+$/, '');
      }
      if (!credenciais.store_id && store) credenciais.store_id = String(store);
      const token = await bilhete('tray', credenciais, { storeHost: storeHost ? String(storeHost) : null });
      log.info('oauth.tray.autorizado', { store_id: credenciais.store_id });
      res.redirect(`${URL_PUBLICA()}/#/integracoes?bilhete=${encodeURIComponent(token)}`);
    } catch (erro) {
      log.erro('oauth.tray.falhou', { motivo: erro.message });
      res.status(502).send(pagina('Captapp', `<h1>Captapp</h1><p class="erro">A Tray recusou a troca do codigo (${escapar(erro.message)}). Tente instalar de novo pelo painel da loja.</p>`));
    }
  });

  /** Nuvemshop: a loja de aplicativos manda o code para esta URL. */
  app.get('/nuvemshop/callback', async (req, res) => {
    cabecalhosDeCallback(res);
    const { code } = req.query;
    const { nuvemshop: pronto } = configuracaoOauth();
    if (!pronto) {
      return res.status(503).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">A integracao com a Nuvemshop ainda nao esta configurada neste servidor.</p>'));
    }
    if (!code) {
      return res.status(400).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">A Nuvemshop nao mandou o codigo de autorizacao. Instale o app de novo pela loja de aplicativos.</p>'));
    }
    try {
      const credenciais = await nuvemshop.trocarCodigo({
        code: String(code),
        clientId: process.env.NUVEMSHOP_CLIENT_ID,
        clientSecret: process.env.NUVEMSHOP_CLIENT_SECRET,
      });
      const token = await bilhete('nuvemshop', credenciais);
      log.info('oauth.nuvemshop.autorizado', { store_id: credenciais.store_id });
      res.redirect(`${URL_PUBLICA()}/#/integracoes?bilhete=${encodeURIComponent(token)}`);
    } catch (erro) {
      log.erro('oauth.nuvemshop.falhou', { motivo: erro.message });
      res.status(502).send(pagina('Captapp', `<h1>Captapp</h1><p class="erro">A Nuvemshop recusou a troca do codigo (${escapar(erro.message)}). Instale o app de novo pela loja de aplicativos.</p>`));
    }
  });
}

/**
 * Fecha a conexao com o bilhete entregue por quem esta logado. Le nome e
 * dominio na API da loja, cria a conexao e ja tenta instalar o widget e o
 * webhook. Falha de instalacao nao derruba a conexao: fica para o botao
 * "Resolver instalacao" no painel.
 */
export async function concluirOauth({ contaId, bilheteTexto, nomeLoja }) {
  const dados = await abrirBilhete(bilheteTexto);
  const api = adaptador(dados.plataforma);

  let loja = { nome: null, dominio: null };
  try {
    loja = await api.dadosDaLoja(dados.credenciais);
  } catch (erro) {
    log.aviso('oauth.loja_sem_dados', { plataforma: dados.plataforma, motivo: erro.message });
  }
  if (loja.storeId && !dados.credenciais.store_id) dados.credenciais.store_id = loja.storeId;

  const conexao = await repo.criarConexao({
    contaId,
    plataforma: dados.plataforma,
    nomeLoja: String(nomeLoja || loja.nome || dados.extras?.storeHost || 'Minha loja').slice(0, 120),
    dominio: loja.dominio || (dados.extras?.storeHost ? String(dados.extras.storeHost).replace(/^https?:\/\//, '') : null),
    credenciais: dados.credenciais,
  });
  log.info('conexao.criada', { conta_id: contaId, conexao_id: conexao.id, plataforma: dados.plataforma, origem: 'oauth' });

  const urlScript = `${URL_PUBLICA()}/widget.js?k=${conexao.chave_publica}`;
  let instalacao = null;
  try {
    instalacao = await api.instalarScript(dados.credenciais, urlScript);
    await repo.atualizarConexao(contaId, conexao.id, {
      modo_instalacao: instalacao.modo,
      detalhe_status: instalacao.motivo || instalacao.ressalva || null,
    });
    if (instalacao.idScript) {
      await repo.salvarCredenciais(contaId, conexao.id, { ...dados.credenciais, id_script: instalacao.idScript });
    }
  } catch (erro) {
    log.aviso('oauth.instalacao_falhou', { conta_id: contaId, conexao_id: conexao.id, motivo: erro.message });
  }

  if (api.criarWebhook) {
    try {
      await api.criarWebhook(dados.credenciais, `${URL_PUBLICA()}/webhook/loja/${conexao.chave_publica}`);
    } catch (erro) {
      log.aviso('oauth.webhook_falhou', { conta_id: contaId, conexao_id: conexao.id, motivo: erro.message });
    }
  }

  return { conexao: await repo.buscarConexao(contaId, conexao.id), instalacao };
}
