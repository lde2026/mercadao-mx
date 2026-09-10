import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as repo from './repositorio.js';
import { log } from './log.js';
import { adaptador, PLATAFORMAS } from './adapters/index.js';
import { concluirLead } from './fluxo-lead.js';
import { registrarEvento, perfilDoLead, esquecerLead } from './eventos.js';
import { calcularAcesso, avisoDeCobranca } from './billing/acesso.js';
import { PLANOS, precoDoPlano, IMPLANTACAO } from './billing/planos.js';
import * as asaas from './billing/asaas.js';
import * as kiwify from './billing/kiwify.js';
import {
  carregarConta, exigirConta, aplicarRegua, entrar, montarCookie, limparCookie,
} from './auth.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const URL_PUBLICA = process.env.URL_PUBLICA || 'http://localhost:3000';

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
  const credenciais = await repo.credenciaisDaConexao(conexao.conta_id, conexao.id);
  const bruto = req.body.toString('utf8');

  if (!api.verificarWebhook?.(credenciais, bruto, req.headers)) {
    log.aviso('webhook.recusado', {
      conta_id: conexao.conta_id, conexao_id: conexao.id, motivo: 'assinatura',
    });
    return res.status(401).end();
  }

  try {
    const pedido = JSON.parse(bruto);
    const normalizado = conexao.plataforma === 'nuvemshop'
      ? await api.lerPedido(credenciais, pedido.id)
      : {
        idExterno: String(pedido.id),
        valor: Number(pedido.total || 0),
        cupomCodigo: pedido.coupon_lines?.[0]?.code || null,
        feitoEm: pedido.date_created_gmt ? `${pedido.date_created_gmt}Z` : new Date().toISOString(),
      };

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
    const { lead, cupom } = await concluirLead({
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
  const [assinatura, abertas] = await Promise.all([
    repo.assinaturaDaConta(contaId),
    repo.cobrancasEmAberto(contaId),
  ]);
  return calcularAcesso({ assinatura, cobrancasAbertas: abertas });
}

// ------------------------------------------------------------ painel: api ---

app.use(carregarConta);

app.post('/api/cadastro', async (req, res) => {
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

app.post('/api/login', async (req, res) => {
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
    conta: req.conta,
    assinatura,
    acesso: req.acesso,
    aviso: avisoDeCobranca(req.acesso),
    planos: PLANOS,
  });
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

  const credenciais = await repo.credenciaisDaConexao(req.conta.id, conexao.id);
  const urlScript = `${URL_PUBLICA}/widget.js?k=${conexao.chave_publica}`;

  try {
    const resultado = await adaptador(conexao.plataforma).instalarScript(credenciais, urlScript);
    await repo.atualizarConexao(req.conta.id, conexao.id, {
      modo_instalacao: resultado.modo,
      detalhe_status: resultado.motivo || resultado.ressalva || null,
    });
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

app.get('/api/conexoes/:id/fluxo', async (req, res) => {
  const conexao = await repo.buscarConexao(req.conta.id, req.params.id);
  if (!conexao) return res.status(404).json({ erro: 'nao encontrada' });
  res.json(await repo.fluxoDaConexao(req.conta.id, conexao.id));
});

app.put('/api/conexoes/:id/fluxo', async (req, res) => {
  const conexao = await repo.buscarConexao(req.conta.id, req.params.id);
  if (!conexao) return res.status(404).json({ erro: 'nao encontrada' });

  const { convite, consentimento, desconto, perguntas } = req.body || {};
  if (!consentimento) return res.status(400).json({ erro: 'a linha de consentimento e obrigatoria' });
  if ((perguntas || []).length > 3) {
    return res.status(400).json({
      erro: 'maximo de tres perguntas antes da de contato',
      explicacao: 'A quarta pergunta e sempre a de contato e nao pode ser removida.',
    });
  }
  const id = await repo.salvarFluxo(req.conta.id, conexao.id, {
    convite: convite || 'Ganhe cupom',
    consentimento,
    desconto: Number(desconto) || 10,
    perguntas: perguntas || [],
  });
  res.json({ id });
});

app.get('/api/leads', async (req, res) => {
  res.json(await repo.listarLeads(req.conta.id, {
    limite: Math.min(Number(req.query.limite) || 50, 200),
    deslocamento: Number(req.query.deslocamento) || 0,
    conexaoId: req.query.conexao || null,
  }));
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

app.get('/api/financeiro', async (req, res) => {
  const { consultar } = await import('./db.js');
  const { rows } = await consultar(
    `select date_trunc('month', p.feito_em) as mes,
            count(*) as pedidos,
            sum(p.valor) as faturado
       from pedidos p
      where p.conta_id = $1 and p.lead_id is not null
      group by 1 order by 1 desc limit 12`,
    [req.conta.id],
  );
  const cobrancas = await repo.cobrancasEmAberto(req.conta.id);
  const assinatura = await repo.assinaturaDaConta(req.conta.id);
  res.json({
    porMes: rows,
    cobrancasEmAberto: cobrancas,
    assinatura,
    mensalidade: assinatura ? precoDoPlano(assinatura.plano, assinatura.ciclo) : null,
    implantacao: IMPLANTACAO,
    acesso: req.acesso,
  });
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

// -------------------------------------------------------------- estaticos ---

app.use(express.static(path.join(aqui, '..', 'public'), {
  maxAge: '5m',
  setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
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
}

export { app };
