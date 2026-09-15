import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as repo from './repositorio.js';
import { log } from './log.js';
import { adaptador, PLATAFORMAS } from './adapters/index.js';
import { concluirLead } from './fluxo-lead.js';
import { registrarEvento, perfilDoLead, esquecerLead } from './eventos.js';
import { calcularAcesso, avisoDeCobranca, avisoDeCota } from './billing/acesso.js';
import { PLANOS, precoDoPlano, IMPLANTACAO, DESCONTO_ANUAL } from './billing/planos.js';
import { MODELOS } from './modelos.js';
import * as asaas from './billing/asaas.js';
import * as kiwify from './billing/kiwify.js';
import { agendar } from './tarefas.js';
import { credenciaisProntas } from './credenciais.js';
import { registrarRotasOauth, concluirOauth, configuracaoOauth } from './oauth.js';
import {
  carregarConta, exigirConta, exigirOperador, ehOperador, aplicarRegua, entrar,
  montarCookie, limparCookie,
} from './auth.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const URL_PUBLICA = process.env.URL_PUBLICA || 'http://localhost:3000';
const PRODUCAO = process.env.NODE_ENV === 'production';

/**
 * Cabecalhos de seguranca. O widget e o rastreador sao carregados dentro da
 * loja do cliente, entao eles ficam de fora do frame-ancestors; o painel
 * nunca deve abrir dentro de iframe de terceiro.
 */
app.use((req, res, proximo) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (PRODUCAO) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const publico = req.path === '/widget.js' || req.path === '/rastreador.js'
    || req.path.startsWith('/w/') || req.path === '/e' || req.path.startsWith('/webhook/')
    || req.path.startsWith('/tray/') || req.path.startsWith('/nuvemshop/');
  if (!publico) {
    res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
      + "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  proximo();
});

/** Para o Railway e para o monitoramento. Confere o banco, nao so o processo. */
app.get('/saude', async (_req, res) => {
  try {
    const { consultar } = await import('./db.js');
    await consultar('select 1');
    res.json({ ok: true, banco: true });
  } catch (erro) {
    res.status(503).json({ ok: false, banco: false });
  }
});

// --------------------------------------------------------------- webhooks ---
// Corpo cru antes do parser de JSON: a assinatura e conferida sobre os bytes
// exatos que chegaram, e o JSON.parse seguido de stringify muda os bytes.

app.post('/webhook/asaas', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  if (!asaas.conferirToken(req.headers)) {
    log.aviso('webhook.recusado', { origem: 'asaas', motivo: 'token' });
    return res.status(401).end();
  }
  try {
    const resultado = await asaas.processarWebhook(JSON.parse(req.body.toString('utf8')));
    res.json(resultado);
  } catch (erro) {
    log.erro('webhook.falhou', { origem: 'asaas', motivo: erro.message });
    await repo.alertar({
      tipo: 'webhook_cobranca_falhou', gravidade: 'erro',
      mensagem: `Webhook do Asaas nao processou: ${erro.message}`,
      dados: { origem: 'asaas' },
    });
    res.status(500).json({ erro: 'falha ao processar' });
  }
});

app.post('/webhook/kiwify', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const bruto = req.body.toString('utf8');
  if (!kiwify.conferirAssinatura(bruto, req.query.signature)) {
    log.aviso('webhook.recusado', { origem: 'kiwify', motivo: 'assinatura' });
    return res.status(401).end();
  }
  try {
    res.json(await kiwify.processarWebhook(JSON.parse(bruto)));
  } catch (erro) {
    log.erro('webhook.falhou', { origem: 'kiwify', motivo: erro.message });
    await repo.alertar({
      tipo: 'webhook_cobranca_falhou', gravidade: 'erro',
      mensagem: `Webhook da Kiwify nao processou: ${erro.message}`,
      dados: { origem: 'kiwify' },
    });
    res.status(500).json({ erro: 'falha ao processar' });
  }
});

/** Webhook de pedido da loja. A verificacao muda por plataforma. */
app.post('/webhook/loja/:chave', express.raw({ type: '*/*', limit: '512kb' }), async (req, res) => {
  const conexao = await repo.buscarConexaoPorChave(req.params.chave);
  if (!conexao) return res.status(404).end();

  const api = adaptador(conexao.plataforma);
  const credenciais = await credenciaisProntas(conexao);
  const bruto = req.body.toString('utf8');

  if (!api.verificarWebhook?.(credenciais, bruto, req.headers)) {
    log.aviso('webhook.recusado', {
      conta_id: conexao.conta_id, conexao_id: conexao.id, motivo: 'assinatura',
    });
    return res.status(401).end();
  }

  try {
    // Quem sabe ler o pedido na API le de novo: o corpo do webhook so
    // aponta o id. No WooCommerce o corpo assinado ja e o pedido inteiro.
    let normalizado;
    if (api.lerPedido) {
      const idPedido = api.idDoWebhook ? api.idDoWebhook(bruto) : JSON.parse(bruto).id;
      normalizado = await api.lerPedido(credenciais, idPedido);
      // Pedido ainda nao pago: responde 200 para a plataforma nao reenviar e
      // espera a proxima notificacao.
      if (!normalizado) return res.json({ ok: true, ignorado: 'nao pago' });
    } else {
      const pedido = JSON.parse(bruto);
      normalizado = {
        idExterno: String(pedido.id),
        valor: Number(pedido.total || 0),
        cupomCodigo: pedido.coupon_lines?.[0]?.code || null,
        feitoEm: pedido.date_created_gmt ? `${pedido.date_created_gmt}Z` : new Date().toISOString(),
      };
    }

    const gravado = await repo.registrarPedido({
      contaId: conexao.conta_id, conexaoId: conexao.id, ...normalizado,
    });
    log.info('pedido.registrado', {
      conta_id: conexao.conta_id, conexao_id: conexao.id,
      atribuido: Boolean(gravado?.lead_id),
    });
    res.json({ ok: true });
  } catch (erro) {
    log.erro('pedido.falhou', {
      conta_id: conexao.conta_id, conexao_id: conexao.id, motivo: erro.message,
    });
    res.status(500).json({ erro: 'falha ao registrar pedido' });
  }
});

// Teto de corpo depois dos webhooks, que tem o proprio.
app.use(express.json({ limit: '32kb' }));

// ------------------------------------------------------- limite e publico ---

/**
 * /e e /w/* aceitam requisicao de qualquer navegador do mundo. Sem teto, uma
 * tarde basta para encher o banco de lead falso ou queimar o lote de cupons de
 * um cliente. O limite conta por chave e por IP: so por chave, um atacante
 * derruba a loja inteira; so por IP, ele troca de IP.
 */
function limitar({ porChave, porIp, janela = 60 }) {
  return async (req, res, proximo) => {
    const chave = req.params.chave || 'sem-chave';
    const ip = req.ip || 'sem-ip';
    const [okChave, okIp] = await Promise.all([
      repo.consumirLimite(`chave:${chave}`, janela, porChave),
      repo.consumirLimite(`ip:${ip}:${chave}`, janela, porIp),
    ]);
    if (!okChave || !okIp) {
      log.aviso('limite.estourado', { chave_loja: chave, por: okChave ? 'ip' : 'chave' });
      return res.status(429).json({ erro: 'muitas requisicoes' });
    }
    proximo();
  };
}

/**
 * O widget roda no dominio da loja do cliente, entao a origem e sempre outra.
 *
 * A origem e devolvida especifica e nao como curinga porque o sendBeacon do
 * rastreador manda credenciais sempre, e o navegador recusa curinga nesse
 * caso. Liberar credencial aqui nao abre nada: estas rotas nao leem cookie,
 * autenticam pela chave da loja, e o cookie do painel e SameSite Lax, entao
 * nem chega a viajar.
 *
 * Allow-Headers com Content-Type e obrigatorio: sem ele o preflight do POST
 * com JSON e recusado e nenhum lead sai de loja nenhuma.
 */
function liberarOrigem(req, res, proximo) {
  const origem = req.headers.origin;
  if (origem) {
    res.set('Access-Control-Allow-Origin', origem);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Max-Age', '86400');
  res.set('Vary', 'Origin');
  proximo();
}

app.options('/w/*', liberarOrigem, (_req, res) => res.status(204).end());
app.options('/e', liberarOrigem, (_req, res) => res.status(204).end());

/** Configuracao do widget. A conexao e conferida antes de qualquer trabalho. */
app.get('/w/fluxo/:chave', liberarOrigem, limitar({ porChave: 600, porIp: 60 }), async (req, res) => {
  const fluxo = await repo.fluxoPorChave(req.params.chave);
  if (!fluxo) return res.status(404).json({ erro: 'nao encontrado' });

  const acesso = await acessoDaConta(fluxo.conta_id);
  if (!acesso.widget) return res.status(204).end();

  res.set('Cache-Control', 'public, max-age=120');
  res.json({
    convite: fluxo.convite,
    consentimento: fluxo.consentimento,
    perguntas: (fluxo.perguntas || []).slice(0, 3),
    recompensa: fluxo.recompensa || 'cupom',
    modo: fluxo.modo || 'painel',
    abrirApos: fluxo.abrir_apos || 0,
    cor: fluxo.cor || null,
    loja: fluxo.nome_loja,
    rastrear: acesso.rastreamento,
  });
});

/** Fim do chat: grava o lead e tenta o cupom, nessa ordem. */
app.post('/w/lead/:chave', liberarOrigem, limitar({ porChave: 120, porIp: 10 }), async (req, res) => {
  const fluxo = await repo.fluxoPorChave(req.params.chave);
  if (!fluxo) return res.status(404).json({ erro: 'nao encontrado' });

  const acesso = await acessoDaConta(fluxo.conta_id);
  if (!acesso.widget) return res.status(204).end();

  const { nome, email, telefone, respostas, anonimoId, consentimento } = req.body || {};
  if (!consentimento) return res.status(400).json({ erro: 'consentimento obrigatorio' });
  if (!nome || (!email && !telefone)) {
    return res.status(400).json({ erro: 'nome e um contato sao obrigatorios' });
  }

  const conexao = await repo.buscarConexaoPorChave(req.params.chave);
  try {
    const { lead, cupom, recompensa } = await concluirLead({
      conexao,
      fluxo,
      nome: String(nome).slice(0, 120),
      email: email ? String(email).slice(0, 160) : null,
      telefone: telefone ? String(telefone).slice(0, 40) : null,
      respostas: Array.isArray(respostas) ? respostas.slice(0, 3) : [],
      anonimoId: anonimoId ? String(anonimoId).slice(0, 64) : null,
      redeMascarada: null,
    });
    // O leadId volta porque o widget chama window.__captaIdentificar com ele.
    // Conhecer o id nao da acesso a nada: /api/leads/:id exige sessao e
    // confere o dono, que e o que o teste de isolamento garante.
    res.json({
      ok: true,
      leadId: lead.id,
      recompensa,
      cupom: cupom.status === 'criado' ? cupom.codigo : null,
      desconto: cupom.status === 'criado' ? cupom.desconto : null,
    });
  } catch (erro) {
    log.erro('lead.falhou', { conexao_id: conexao?.id, motivo: erro.message });
    res.status(500).json({ erro: 'falha ao registrar' });
  }
});

/** Rastreamento de navegacao. So do plano Crescimento para cima. */
app.post('/e', liberarOrigem, limitar({ porChave: 3000, porIp: 240 }), async (req, res) => {
  const { chave, anonimoId, tipo, url, titulo, dados } = req.body || {};
  if (!chave || !anonimoId) return res.status(204).end();

  const conexao = await repo.buscarConexaoPorChave(String(chave));
  if (!conexao) return res.status(204).end();

  const acesso = await acessoDaConta(conexao.conta_id);
  if (!acesso.rastreamento) return res.status(204).end();

  await registrarEvento({
    conexao, anonimoId: String(anonimoId).slice(0, 64), tipo, url, titulo, dados,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
  });
  res.status(204).end();
});

async function acessoDaConta(contaId) {
  const [assinatura, abertas, leadsNoMes] = await Promise.all([
    repo.assinaturaDaConta(contaId),
    repo.cobrancasEmAberto(contaId),
    repo.leadsNoMes(contaId),
  ]);
  const acesso = calcularAcesso({ assinatura, cobrancasAbertas: abertas, leadsNoMes });
  // Cota atingida e chance de upgrade, entao vira alerta, mas um por mes.
  if (acesso.cotaEstourada) {
    await repo.alertarUmaVezNoMes({
      contaId, tipo: 'cota_atingida', gravidade: 'aviso',
      mensagem: `Cota de ${acesso.cotaLeads} leads do mes atingida. O chat saiu do ar na loja.`,
    });
  }
  return acesso;
}

// ---------------------------------------------------- conexao por oauth ---

// Paginas de callback das plataformas. Publicas: quem chega aqui ainda nao
// esta logado no Captapp, e o bilhete que sai daqui so vale com sessao.
registrarRotasOauth(app);

// ------------------------------------------------------------ painel: api ---

app.use(carregarConta);

/** Sem teto, o login e forca bruta livre. Dez por minuto por IP e folgado para gente e apertado para robo. */
async function limitarEntrada(req, res, proximo) {
  const ok = await repo.consumirLimite(`entrada:${req.ip || 'sem-ip'}`, 60, 10);
  if (!ok) {
    log.aviso('limite.estourado', { rota: req.path, por: 'ip' });
    return res.status(429).json({ erro: 'muitas tentativas, espere um minuto' });
  }
  proximo();
}

app.post('/api/cadastro', limitarEntrada, async (req, res) => {
  const { nome, email, senha } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'campos obrigatorios' });
  if (String(senha).length < 8) return res.status(400).json({ erro: 'senha de no minimo 8 caracteres' });

  try {
    const conta = await repo.criarConta({ nome, email, senha });
    const sessaoId = await repo.criarSessao(conta.id);
    log.info('conta.criada', { conta_id: conta.id });
    res.set('Set-Cookie', montarCookie(sessaoId))
      .json({ conta: { id: conta.id, nome: conta.nome, email: conta.email } });
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'email ja cadastrado' });
    throw erro;
  }
});

app.post('/api/login', limitarEntrada, async (req, res) => {
  const { email, senha } = req.body || {};
  const entrada = await entrar(String(email || ''), String(senha || ''));
  if (!entrada) return res.status(401).json({ erro: 'email ou senha invalidos' });
  res.set('Set-Cookie', montarCookie(entrada.sessaoId))
    .json({ conta: { id: entrada.conta.id, nome: entrada.conta.nome, email: entrada.conta.email } });
});

app.post('/api/sair', async (req, res) => {
  if (req.sessaoId) await repo.apagarSessao(req.sessaoId);
  res.set('Set-Cookie', limparCookie()).json({ ok: true });
});

app.use('/api', exigirConta, aplicarRegua);

app.get('/api/eu', async (req, res) => {
  const assinatura = await repo.assinaturaDaConta(req.conta.id);
  res.json({
    conta: { ...req.conta, operador: ehOperador(req.conta.email) },
    assinatura,
    acesso: req.acesso,
    aviso: avisoDeCobranca(req.acesso) || avisoDeCota(req.acesso),
    planos: PLANOS,
  });
});

app.post('/api/conta/senha', async (req, res) => {
  const { atual, nova } = req.body || {};
  if (!atual || !nova) return res.status(400).json({ erro: 'informe a senha atual e a nova' });
  if (String(nova).length < 8) return res.status(400).json({ erro: 'senha nova de no minimo 8 caracteres' });
  const ok = await repo.trocarSenha(req.conta.id, req.sessaoId, { atual: String(atual), nova: String(nova) });
  if (!ok) return res.status(401).json({ erro: 'senha atual nao confere' });
  log.info('senha.trocada', { conta_id: req.conta.id });
  res.json({ ok: true });
});

app.get('/api/conexoes', async (req, res) => {
  const conexoes = await repo.listarConexoes(req.conta.id);
  res.json(await Promise.all(conexoes.map(async (conexao) => ({
    ...conexao,
    lote: conexao.plataforma === 'loja_integrada'
      ? await repo.saldoDoLote(req.conta.id, conexao.id)
      : null,
  }))));
});

/** O que o painel precisa saber para oferecer o botao de conectar por OAuth. */
app.get('/api/conexoes/oauth', (_req, res) => {
  const cfg = configuracaoOauth();
  res.json({
    tray: cfg.tray,
    nuvemshop: cfg.nuvemshop,
    nuvemshopUrl: cfg.nuvemshop ? adaptador('nuvemshop').urlDeAutorizacao({ appId: cfg.nuvemshopAppId }) : null,
  });
});

/** Fecha a conexao iniciada na callback de OAuth, agora com a conta dona. */
app.post('/api/conexoes/oauth', async (req, res) => {
  const { bilhete, nomeLoja } = req.body || {};
  if (!bilhete) return res.status(400).json({ erro: 'bilhete obrigatorio' });
  try {
    const resultado = await concluirOauth({ contaId: req.conta.id, bilheteTexto: bilhete, nomeLoja });
    res.status(201).json(resultado);
  } catch (erro) {
    if (/bilhete/.test(erro.message)) return res.status(400).json({ erro: erro.message });
    log.erro('oauth.conclusao_falhou', { conta_id: req.conta.id, motivo: erro.message });
    res.status(502).json({ erro: erro.message });
  }
});

app.post('/api/conexoes', async (req, res) => {
  const { plataforma, nomeLoja, dominio, credenciais } = req.body || {};
  if (!PLATAFORMAS.includes(plataforma)) return res.status(400).json({ erro: 'plataforma invalida' });
  if (!nomeLoja || !credenciais) return res.status(400).json({ erro: 'campos obrigatorios' });

  const conexao = await repo.criarConexao({
    contaId: req.conta.id, plataforma, nomeLoja, dominio, credenciais,
  });
  log.info('conexao.criada', {
    conta_id: req.conta.id, conexao_id: conexao.id, plataforma,
  });
  res.status(201).json(conexao);
});

/**
 * Resolve o modo de instalacao. Devolve auto, manual ou bloqueado com o texto
 * pronto, para ninguem da equipe precisar entrar na loja do cliente.
 */
app.post('/api/conexoes/:id/instalacao', async (req, res) => {
  const conexao = await repo.buscarConexao(req.conta.id, req.params.id);
  if (!conexao) return res.status(404).json({ erro: 'nao encontrada' });

  const credenciais = await credenciaisProntas(conexao);
  const urlScript = `${URL_PUBLICA}/widget.js?k=${conexao.chave_publica}`;

  try {
    const resultado = await adaptador(conexao.plataforma).instalarScript(credenciais, urlScript);
    await repo.atualizarConexao(req.conta.id, conexao.id, {
      modo_instalacao: resultado.modo,
      detalhe_status: resultado.motivo || resultado.ressalva || null,
    });
    // O id do script e o que permite tirar o widget da loja no dia 45 da
    // regua. Fica junto da credencial, cifrado, porque e dado da plataforma.
    if (resultado.idScript) {
      await repo.salvarCredenciais(req.conta.id, conexao.id, {
        ...credenciais, id_script: resultado.idScript,
      });
    }
    log.info('instalacao.resolvida', {
      conta_id: req.conta.id, conexao_id: conexao.id,
      plataforma: conexao.plataforma, modo: resultado.modo,
    });
    res.json(resultado);
  } catch (erro) {
    if (erro.inadimplenteNaPlataforma) {
      await repo.atualizarConexao(req.conta.id, conexao.id, {
        status: 'inadimplente_plataforma', detalhe_status: erro.message,
      });
      return res.status(409).json({
        erro: erro.message,
        explicacao: 'A loja esta inadimplente com a propria Nuvemshop. Enquanto isso durar, script e webhook ficam fora do ar por decisao dela, nao nossa.',
      });
    }
    log.erro('instalacao.falhou', {
      conta_id: req.conta.id, conexao_id: conexao.id, motivo: erro.message,
    });
    res.status(502).json({ erro: erro.message });
  }
});

app.post('/api/conexoes/:id/lote', async (req, res) => {
  const conexao = await repo.buscarConexao(req.conta.id, req.params.id);
  if (!conexao) return res.status(404).json({ erro: 'nao encontrada' });

  const codigos = (req.body?.codigos || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 5000);
  const inseridos = await repo.adicionarAoLote(req.conta.id, conexao.id, codigos);
  res.json({ inseridos, saldo: await repo.saldoDoLote(req.conta.id, conexao.id) });
});

app.get('/api/modelos', (_req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(MODELOS);
});

app.get('/api/conexoes/:id/fluxo', async (req, res) => {
  const conexao = await repo.buscarConexao(req.conta.id, req.params.id);
  if (!conexao) return res.status(404).json({ erro: 'nao encontrada' });
  res.json(await repo.fluxoDaConexao(req.conta.id, conexao.id));
});

app.put('/api/conexoes/:id/fluxo', async (req, res) => {
  const conexao = await repo.buscarConexao(req.conta.id, req.params.id);
  if (!conexao) return res.status(404).json({ erro: 'nao encontrada' });

  const {
    convite, consentimento, desconto, perguntas, recompensa = 'cupom', modo = 'painel', abrirApos = 0, cor = null,
  } = req.body || {};
  if (cor && !/^#[0-9a-f]{6}$/i.test(String(cor))) return res.status(400).json({ erro: 'cor invalida' });
  if (!consentimento) return res.status(400).json({ erro: 'a linha de consentimento e obrigatoria' });
  if (!RECOMPENSAS.has(recompensa)) return res.status(400).json({ erro: 'beneficio invalido' });
  if (!['painel', 'chat'].includes(modo)) return res.status(400).json({ erro: 'formato invalido' });
  const segundos = Math.min(Math.max(Number(abrirApos) || 0, 0), 120);
  if ((perguntas || []).length > 3) {
    return res.status(400).json({
      erro: 'maximo de tres perguntas antes da de contato',
      explicacao: 'A quarta pergunta e sempre a de contato e nao pode ser removida.',
    });
  }
  const limpas = (perguntas || [])
    .map((p) => ({
      texto: String(p.texto || '').trim().slice(0, 160),
      opcoes: (Array.isArray(p.opcoes) ? p.opcoes : [])
        .map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 8),
    }))
    .filter((p) => p.texto);
  const pct = Math.min(Math.max(Number(desconto) || 10, 1), 90);
  const id = await repo.salvarFluxo(req.conta.id, conexao.id, {
    convite: String(convite || 'Ganhe cupom').trim().slice(0, 60),
    consentimento: String(consentimento).trim().slice(0, 300),
    desconto: pct,
    perguntas: limpas,
    recompensa,
    modo,
    abrirApos: segundos,
    cor: cor || null,
  });
  res.json({ id, perguntas: limpas.length });
});

const SITUACOES = new Set(['a_contatar', 'contatados']);
const RECOMPENSAS = new Set(['cupom', 'frete_gratis', 'diagnostico', 'especialista', 'consultoria']);

/**
 * Planilha dos leads. Ponto e virgula e BOM porque o Excel em portugues abre
 * CSV com virgula numa coluna so e mostra acento quebrado sem o BOM. Quem
 * exporta e o lojista, para o proprio CRM ou para o vendedor dele.
 */
function celulaCsv(valor) {
  const texto = valor == null ? '' : String(valor);
  // Celula que comeca com = + - @ vira formula no Excel e executa ao abrir.
  // O nome do lead e digitado por visitante anonimo, entao pode vir assim.
  const segura = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${segura.replace(/"/g, '""')}"`;
}

app.get('/api/leads.csv', async (req, res) => {
  const leads = await repo.listarLeads(req.conta.id, {
    limite: 5000, situacao: SITUACOES.has(req.query.situacao) ? req.query.situacao : null,
  });
  const cabecalho = ['Nome', 'WhatsApp', 'E-mail', 'Loja', 'Cupom', 'Cupom criado',
    'Respostas', 'Contatado em', 'Faturado', 'Entrou em'];
  const linhas = leads.map((l) => [
    l.nome, l.telefone, l.email, l.nome_loja, l.cupom,
    l.cupom_status === 'criado' ? 'sim' : 'nao',
    (l.respostas || []).map((r) => `${r.pergunta} ${r.resposta}`).join(' | '),
    l.contatado_em ? new Date(l.contatado_em).toLocaleString('pt-BR') : '',
    Number(l.faturado || 0).toFixed(2).replace('.', ','),
    new Date(l.criado_em).toLocaleString('pt-BR'),
  ].map(celulaCsv).join(';'));

  log.info('leads.exportados', { conta_id: req.conta.id, quantidade: leads.length });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\ufeff' + [cabecalho.map(celulaCsv).join(';'), ...linhas].join('\r\n'));
});

app.get('/api/leads', async (req, res) => {
  const [leads, contagem] = await Promise.all([
    repo.listarLeads(req.conta.id, {
      limite: Math.min(Number(req.query.limite) || 100, 200),
      deslocamento: Number(req.query.deslocamento) || 0,
      conexaoId: req.query.conexao || null,
      situacao: SITUACOES.has(req.query.situacao) ? req.query.situacao : null,
    }),
    repo.contagemDeLeads(req.conta.id),
  ]);
  res.json({ leads, contagem });
});

/**
 * Marca o lead como contatado. E a unica escrita do painel que o lojista faz
 * varias vezes por dia, entao ela precisa ser um clique e nada mais: exigir
 * classificacao de venda aqui faz ele nao marcar, e a fila volta a mentir.
 */
app.post('/api/leads/:id/contato', async (req, res) => {
  const { contatado = true, resultado = null } = req.body || {};
  if (resultado && !['contatado', 'vendeu', 'perdeu'].includes(resultado)) {
    return res.status(400).json({ erro: 'resultado invalido' });
  }
  const lead = await repo.marcarContato(req.conta.id, req.params.id, {
    contatado: Boolean(contatado), resultado,
  });
  if (!lead) return res.status(404).json({ erro: 'nao encontrado' });
  log.info('lead.contato', {
    conta_id: req.conta.id, lead_id: lead.id, contatado: Boolean(contatado),
  });
  res.json(lead);
});

app.get('/api/leads/:id', async (req, res) => {
  const perfil = await perfilDoLead(req.conta.id, req.params.id);
  if (!perfil) return res.status(404).json({ erro: 'nao encontrado' });
  res.json(perfil);
});

app.delete('/api/leads/:id', async (req, res) => {
  const apagado = await esquecerLead(req.conta.id, req.params.id);
  if (!apagado) return res.status(404).json({ erro: 'nao encontrado' });
  res.json({ ok: true });
});

/**
 * O Financeiro e da ferramenta, nao da loja: plano, mensalidade, cota de
 * leads e as cobrancas do Captapp. Faturamento atribuido ao chat fica na fila
 * e no perfil do lead, nao aqui.
 */
app.get('/api/financeiro', async (req, res) => {
  const [assinatura, cobrancas, usados, implantacaoPaga] = await Promise.all([
    repo.assinaturaDaConta(req.conta.id),
    repo.cobrancasDaConta(req.conta.id),
    repo.leadsNoMes(req.conta.id),
    repo.jaPagouImplantacao(req.conta.id),
  ]);
  const precos = {};
  for (const id of Object.keys(PLANOS)) {
    precos[id] = { mensal: precoDoPlano(id, 'mensal'), anual: precoDoPlano(id, 'anual') };
  }
  res.json({
    assinatura,
    planos: PLANOS,
    precos,
    descontoAnual: DESCONTO_ANUAL,
    implantacao: { valor: IMPLANTACAO, cobrada: implantacaoPaga },
    uso: { leadsMes: usados, cota: req.acesso.cotaLeads },
    cobrancas,
    acesso: req.acesso,
    cobrancaAutomatica: asaas.configurado(),
  });
});

/**
 * Escolha ou troca de plano. Com o Asaas configurado, cria o cliente, a
 * assinatura e a cobranca de implantacao na primeira vez; o webhook faz o
 * resto. Sem o Asaas, a assinatura entra como manual e a cobranca acontece
 * fora, entao nao ha cobranca em aberto e a regua nao corta ninguem por
 * fatura que nunca existiu.
 */
app.post('/api/assinatura', async (req, res) => {
  const { plano, ciclo = 'mensal', documento } = req.body || {};
  if (!PLANOS[plano]) return res.status(400).json({ erro: 'plano invalido' });
  if (!['mensal', 'anual'].includes(ciclo)) return res.status(400).json({ erro: 'ciclo invalido' });

  const atual = await repo.assinaturaDaConta(req.conta.id);
  if (atual && atual.plano === plano && atual.ciclo === ciclo) {
    return res.json({ assinatura: atual, mudou: false });
  }

  if (!asaas.configurado()) {
    const assinatura = await repo.trocarAssinatura({
      contaId: req.conta.id, plano, ciclo, origem: 'manual',
    });
    log.info('assinatura.manual', { conta_id: req.conta.id, plano, ciclo });
    return res.json({ assinatura, mudou: true, cobrancaAutomatica: false });
  }

  try {
    const conta = await repo.buscarConta(req.conta.id);
    let clienteExterno = conta.cliente_externo;
    if (!clienteExterno) {
      const doc = String(documento || conta.documento || '').replace(/\D/g, '');
      if (!doc) return res.status(400).json({ erro: 'informe o CPF ou CNPJ para a cobranca' });
      const cliente = await asaas.criarCliente({ nome: conta.nome, email: conta.email, cpfCnpj: doc });
      clienteExterno = cliente.id;
      await repo.salvarClienteExterno(req.conta.id, { clienteExterno, documento: doc });
    }

    if (atual?.id_externo && atual.origem === 'asaas') {
      await asaas.cancelarAssinatura(atual.id_externo);
    }
    const criada = await asaas.criarAssinatura({ clienteExterno, plano, ciclo });
    const assinatura = await repo.trocarAssinatura({
      contaId: req.conta.id, plano, ciclo, origem: 'asaas', idExterno: criada.id,
    });

    if (!(await repo.jaPagouImplantacao(req.conta.id))) {
      const venceEm = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const cobranca = await asaas.cobrarImplantacao({ clienteExterno, venceEm });
      await repo.registrarCobranca({
        contaId: req.conta.id, tipo: 'implantacao', valor: IMPLANTACAO,
        origem: 'asaas', idExterno: cobranca.id, venceEm,
      });
    }

    log.info('assinatura.criada', { conta_id: req.conta.id, plano, ciclo, origem: 'asaas' });
    res.json({ assinatura, mudou: true, cobrancaAutomatica: true });
  } catch (erro) {
    log.erro('assinatura.falhou', { conta_id: req.conta.id, motivo: erro.message });
    await repo.alertar({
      contaId: req.conta.id, tipo: 'assinatura_falhou', gravidade: 'erro',
      mensagem: `Nao foi possivel criar a assinatura no Asaas: ${erro.message}`,
    });
    res.status(502).json({ erro: 'a cobranca nao respondeu, tente de novo em instantes' });
  }
});

/** Quantos leads entraram hoje, em quais lojas, e quantos cupons falharam. */
app.get('/api/hoje', async (req, res) => {
  const { consultar } = await import('./db.js');
  const { rows } = await consultar(
    `select cx.nome_loja, cx.plataforma,
            count(l.id) as leads,
            count(*) filter (where cp.status = 'criado') as cupons_ok,
            count(*) filter (where cp.status = 'falhou') as cupons_falhos
       from conexoes cx
       left join leads l on l.conexao_id = cx.id and l.criado_em >= current_date
       left join cupons cp on cp.lead_id = l.id
      where cx.conta_id = $1
      group by cx.id, cx.nome_loja, cx.plataforma
      order by leads desc`,
    [req.conta.id],
  );
  res.json({ dia: new Date().toISOString().slice(0, 10), lojas: rows });
});

app.get('/api/alertas', async (req, res) => {
  const { consultar } = await import('./db.js');
  const { rows } = await consultar(
    `select id, tipo, gravidade, mensagem, criado_em from alertas
      where conta_id = $1 and resolvido = false
      order by criado_em desc limit 50`,
    [req.conta.id],
  );
  res.json(rows);
});

// -------------------------------------------------------------- operador ---

app.get('/api/admin/resumo', exigirOperador, async (_req, res) => {
  const resumo = await repo.resumoGeral();
  // Receita mensal recorrente: mensal conta o preco, anual conta um doze avos.
  const mrr = resumo.assinantes.reduce((soma, a) => {
    const preco = precoDoPlano(a.plano, a.ciclo);
    return soma + (a.ciclo === 'anual' ? preco / 12 : preco) * a.n;
  }, 0);
  res.json({ ...resumo, mrr: Math.round(mrr * 100) / 100, planos: PLANOS });
});

app.get('/api/admin/contas', exigirOperador, async (_req, res) => {
  const contas = await repo.listarContas();
  const hoje = Date.now();
  res.json(contas.map((c) => ({
    ...c,
    diasAtraso: c.vencida_desde
      ? Math.floor((hoje - new Date(c.vencida_desde).getTime()) / 86400000) : 0,
  })));
});

/**
 * Entrar na conta de um cliente para fazer a implantacao. E o que a equipe
 * precisa para conectar loja e montar o fluxo sem mexer no banco. Fica em
 * log com quem entrou e onde.
 */
app.post('/api/admin/contas/:id/entrar', exigirOperador, async (req, res) => {
  const alvo = await repo.buscarConta(req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'conta nao encontrada' });
  const sessaoId = await repo.criarSessao(alvo.id, 1);
  log.aviso('operador.entrou', { operador_id: req.conta.id, conta_id: alvo.id });
  res.set('Set-Cookie', montarCookie(sessaoId)).json({ conta: { id: alvo.id, nome: alvo.nome } });
});

// -------------------------------------------------------------- estaticos ---

// Uma hora de cache e stale-while-revalidate: o Cloudflare segura o
// widget.js por todo visitante de toda loja, e uma versao nova chega em ate
// uma hora sem ninguem precisar limpar cache. Se precisar antes, purga no
// Cloudflare.
app.use(express.static(path.join(aqui, '..', 'public'), {
  maxAge: '1h',
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  },
}));
app.use(express.static(path.join(aqui, '..', 'painel')));

app.use((erro, req, res, _proximo) => {
  log.erro('rota.falhou', {
    rota: req.path, metodo: req.method, conta_id: req.conta?.id, motivo: erro.message,
  });
  res.status(500).json({ erro: 'erro interno' });
});

const porta = Number(process.env.PORTA) || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(porta, () => log.info('servidor.subiu', { porta }));
  agendar();
}

export { app };
