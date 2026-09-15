import { tray, nuvemshop, adaptador } from './adapters/index.js';
import { cifrar, decifrar } from './cripto.js';
import { log } from './log.js';
import * as repo from './repositorio.js';

/**
 * Conexao de loja por OAuth, para o lojista ligar a loja sozinho sem copiar
 * token de lugar nenhum.
 *
 * O code que a plataforma manda e de uso unico e vence em minutos, entao a
 * troca por token acontece na hora, na propria callback, antes de saber qual
 * conta do Captapp vai ficar com a loja. O resultado viaja cifrado no
 * endereco do painel (o "bilhete"), e so vira conexao quando alguem logado
 * o entrega em /api/conexoes/oauth. O bilhete vence em quinze minutos e nao
 * serve para nada fora desse endpoint: e a mesma cifra das credenciais no
 * banco, com a chave que so o servidor tem.
 */

const VALIDADE_BILHETE_MS = 15 * 60 * 1000;

const URL_PUBLICA = () => process.env.URL_PUBLICA || 'http://localhost:3000';

export function configuracaoOauth() {
  return {
    tray: Boolean(process.env.TRAY_CONSUMER_KEY && process.env.TRAY_CONSUMER_SECRET),
    nuvemshop: Boolean(process.env.NUVEMSHOP_CLIENT_ID && process.env.NUVEMSHOP_CLIENT_SECRET),
    nuvemshopAppId: process.env.NUVEMSHOP_CLIENT_ID || null,
  };
}

function bilhete(plataforma, credenciais, extras = {}) {
  return cifrar({ plataforma, credenciais, extras, criadoEm: Date.now() });
}

export function abrirBilhete(texto) {
  let dados;
  try {
    dados = decifrar(String(texto || ''));
  } catch {
    throw new Error('bilhete invalido');
  }
  if (!dados?.plataforma || !dados?.credenciais) throw new Error('bilhete invalido');
  if (Date.now() - Number(dados.criadoEm || 0) > VALIDADE_BILHETE_MS) {
    throw new Error('bilhete vencido, conecte a loja de novo');
  }
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
    const dominioLoja = String(req.query.url || req.query.store_host || '').trim();
    if (!pronto) {
      return res.status(503).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">A integracao com a Tray ainda nao esta configurada neste servidor.</p>'));
    }
    if (!/^https?:\/\/[a-z0-9.-]+/i.test(dominioLoja)) {
      return res.status(400).send(pagina('Captapp', '<h1>Captapp</h1><p class="erro">Abra esta pagina pelo painel da sua loja Tray, em Meus aplicativos.</p>'));
    }
    const destino = tray.urlDeAutorizacao({
      dominioLoja,
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
    try {
      const credenciais = await tray.trocarCodigo({
        apiAddress: String(apiAddress), code: String(code),
        consumerKey: process.env.TRAY_CONSUMER_KEY,
        consumerSecret: process.env.TRAY_CONSUMER_SECRET,
      });
      if (!credenciais.store_id && store) credenciais.store_id = String(store);
      const token = bilhete('tray', credenciais, { storeHost: storeHost ? String(storeHost) : null });
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
      const token = bilhete('nuvemshop', credenciais);
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
  const dados = abrirBilhete(bilheteTexto);
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
