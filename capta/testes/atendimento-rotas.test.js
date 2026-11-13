import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepararBanco, contaDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';
// Definida antes de importar o servidor: a rota interna le a chave do
// ambiente a cada chamada, mas o aviso de boot acontece na carga.
process.env.CHAVE_SERVICO = 'chave-de-servico-de-teste-com-tamanho-suficiente';
// Quem liga o modulo e define o numero de uma conta e o operador, e a lista
// tambem e lida na carga.
process.env.OPERADOR_EMAILS = 'contato@lojadoecommerce.com.br';

const { pool, consultar } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

/**
 * As rotas do modulo de atendimento.
 *
 * O que se testa aqui e quem alcanca o que. A base vira o prompt de um agente
 * que fala com o cliente final da loja, entao rota frouxa aqui nao e um
 * vazamento de tela: e a loja A respondendo no WhatsApp com a politica de
 * troca da loja B.
 *
 * E a rota interna merece atencao propria porque ela e a unica do projeto em
 * que um id na URL decide de quem e o dado. A autorizacao dela e so a chave
 * de servico, entao e ela que precisa estar certa.
 */

async function contaLogada(nome, email, { modulo = true } = {}) {
  const conta = await contaDeTeste(nome, email);
  // Conta nova ja nasce com o modulo; aqui o teste desliga de proposito para
  // provar o que acontece com quem nao assina.
  await consultar('update contas set modulo_atendimento = $2 where id = $1', [conta.id, modulo]);
  const r = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: 'senha-de-teste-123' }),
  });
  assert.equal(r.status, 200, `login de ${nome} falhou`);
  return { ...conta, cookie: r.headers.get('set-cookie').split(';')[0] };
}

function pedir(caminho, { metodo = 'GET', cookie, corpo, cabecalhos = {} } = {}) {
  return fetch(`${base}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...cabecalhos,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
}

const contaA = await contaLogada('Bella Moda', 'pierre+ar-a@lojadoecommerce.com.br');
const contaB = await contaLogada('Casa Verde', 'pierre+ar-b@lojadoecommerce.com.br');
const semModulo = await contaLogada('Pet Cia', 'pierre+ar-c@lojadoecommerce.com.br', { modulo: false });
// Um login so para o operador: o teto de entrada e por IP e por minuto, e
// cada chamada a mais derruba as provas seguintes com 429.
const operador = await contaLogada('Loja do E-commerce', 'contato@lojadoecommerce.com.br', { modulo: false });

test('o lojista le e grava a propria base pelo painel', async () => {
  const vazia = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(vazia.status, 200);
  assert.equal(vazia.json.base.nomeLoja, '');
  assert.deepEqual(vazia.json.versoes, []);

  const salvo = await pedir('/api/atendimento', {
    metodo: 'PUT', cookie: contaA.cookie,
    corpo: {
      nomeLoja: 'Bella Moda',
      horarioAtendimento: 'Seg a sex, 9h as 18h',
      formasPagamento: ['Pix', 'Cartão em até 12x'],
    },
  });
  assert.equal(salvo.status, 200);
  assert.equal(salvo.json.base.nomeLoja, 'Bella Moda');

  const depois = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(depois.json.versoes.length, 1);
  assert.equal(depois.json.versoes[0].origem, 'formulario');
  assert.equal(depois.json.versoes[0].autor, 'pierre+ar-a@lojadoecommerce.com.br');
});

test('o corpo nao escolhe de quem e a base', async () => {
  // O id da conta no corpo e ruido: quem manda e a sessao. Sem isso, trocar
  // uma linha no devtools escreveria na loja do vizinho.
  await pedir('/api/atendimento', {
    metodo: 'PUT', cookie: contaB.cookie,
    corpo: { nomeLoja: 'Casa Verde', contaId: contaA.id, conta_id: contaA.id },
  });

  const daA = await pedir('/api/atendimento', { cookie: contaA.cookie });
  const daB = await pedir('/api/atendimento', { cookie: contaB.cookie });
  assert.equal(daA.json.base.nomeLoja, 'Bella Moda');
  assert.equal(daB.json.base.nomeLoja, 'Casa Verde');
});

test('versao de outra conta nao restaura, mesmo com o id na mao', async () => {
  const daA = await pedir('/api/atendimento', { cookie: contaA.cookie });
  const versaoDaA = daA.json.versoes[0].id;

  const r = await pedir(`/api/atendimento/versoes/${versaoDaA}/restaurar`, {
    metodo: 'POST', cookie: contaB.cookie,
  });
  assert.equal(r.status, 404);

  const daB = await pedir('/api/atendimento', { cookie: contaB.cookie });
  assert.equal(daB.json.base.nomeLoja, 'Casa Verde', 'a base da B nao pode ter mudado');
});

test('restaurar volta o valor e deixa rastro', async () => {
  await pedir('/api/atendimento', {
    metodo: 'PUT', cookie: contaA.cookie, corpo: { horarioAtendimento: 'Todo dia, 8h as 20h' },
  });
  const antes = await pedir('/api/atendimento', { cookie: contaA.cookie });
  const alvo = antes.json.versoes.find((v) => v.origem === 'formulario');

  const r = await pedir(`/api/atendimento/versoes/${alvo.id}/restaurar`, {
    metodo: 'POST', cookie: contaA.cookie,
  });
  assert.equal(r.status, 200);

  const depois = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(depois.json.versoes[0].origem, 'restauracao');
  assert.ok(depois.json.versoes.length > antes.json.versoes.length);
});

test('quem nao assina o modulo nao encontra a rota', async () => {
  // 404 e nao 403: para quem nao tem o modulo, ele nao existe. 403 contaria
  // que existe uma base ali e que falta so uma permissao.
  const lendo = await pedir('/api/atendimento', { cookie: semModulo.cookie });
  assert.equal(lendo.status, 404);
  const gravando = await pedir('/api/atendimento', {
    metodo: 'PUT', cookie: semModulo.cookie, corpo: { nomeLoja: 'x' },
  });
  assert.equal(gravando.status, 404);
  // E a conta sem o modulo tambem nao aparece com ele ligado no /api/eu.
  const eu = await pedir('/api/eu', { cookie: semModulo.cookie });
  assert.equal(eu.json.modulos.atendimento, false);
});

test('sem sessao nenhuma, nada', async () => {
  assert.equal((await pedir('/api/atendimento')).status, 401);
  assert.equal((await pedir('/api/atendimento', { metodo: 'PUT', corpo: {} })).status, 401);
});

test('a rota interna exige a chave de servico', async () => {
  const semChave = await pedir(`/interno/base/${contaA.id}`);
  assert.equal(semChave.status, 401);

  const chaveErrada = await pedir(`/interno/base/${contaA.id}`, {
    cabecalhos: { Authorization: 'Bearer chave-errada-com-o-mesmo-tamanho-aqui' },
  });
  assert.equal(chaveErrada.status, 401);

  // Cookie de lojista nao serve: a rota e de servico, nao de navegador.
  const comCookie = await pedir(`/interno/base/${contaA.id}`, { cookie: contaA.cookie });
  assert.equal(comCookie.status, 401);
});

test('com a chave certa, o agente recebe a base daquela loja', async () => {
  const r = await pedir(`/interno/base/${contaA.id}`, {
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.conta.id, contaA.id);
  assert.equal(r.json.base.nomeLoja, 'Bella Moda');
  assert.deepEqual(r.json.base.formasPagamento, ['Pix', 'Cartão em até 12x']);
  // O formato e o mesmo do painel e o mesmo guardado na versao.
  assert.ok('tomDeVoz' in r.json.base);
});

test('conta sem o modulo nao tem base para o agente', async () => {
  const r = await pedir(`/interno/base/${semModulo.id}`, {
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(r.status, 404);
});

test('sem CHAVE_SERVICO no ambiente a rota recusa tudo', async () => {
  // O contrario, tratar a falta da chave como "sem exigencia", publicaria a
  // base de todos os clientes no primeiro deploy sem a variavel.
  const guardada = process.env.CHAVE_SERVICO;
  delete process.env.CHAVE_SERVICO;
  try {
    const r = await pedir(`/interno/base/${contaA.id}`, {
      cabecalhos: { Authorization: 'Bearer ' },
    });
    assert.equal(r.status, 401);
  } finally {
    process.env.CHAVE_SERVICO = guardada;
  }
});

/*
 * O medidor.
 *
 * Quem conta e o agente, que fala com o cliente final e roda fora do Capta.
 * Entao a rota de contagem carrega a mesma responsabilidade da que entrega a
 * base: um id na URL e uma chave de servico decidindo de quem e o numero.
 * Contagem que cai na conta errada vira fatura errada.
 */
test('o agente conta as mensagens pela rota interna', async () => {
  const chave = { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` };

  const vazio = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(vazio.json.consumo.enviadas, 0);
  assert.equal(vazio.json.consumo.atualizadoEm, null, 'sem contagem o painel sabe que e silencio');

  const uma = await pedir(`/interno/base/${contaA.id}/consumo`, {
    metodo: 'POST', cabecalhos: chave, corpo: { enviadas: 1 },
  });
  assert.equal(uma.status, 200);
  assert.equal(uma.json.enviadas, 1);

  // Lote, porque chamada por mensagem numa instalacao com dezenas de lojas
  // vira transito que nao precisa existir.
  const lote = await pedir(`/interno/base/${contaA.id}/consumo`, {
    metodo: 'POST', cabecalhos: chave, corpo: { enviadas: 40 },
  });
  assert.equal(lote.json.enviadas, 41, 'soma, nao substitui');

  const tela = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(tela.json.consumo.enviadas, 41);
  assert.ok(tela.json.consumo.atualizadoEm, 'agora o painel tem o que mostrar');
});

test('a contagem de uma conta nao encosta na outra', async () => {
  const chave = { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` };
  await pedir(`/interno/base/${contaB.id}/consumo`, {
    metodo: 'POST', cabecalhos: chave, corpo: { enviadas: 7 },
  });

  const b = await pedir('/api/atendimento', { cookie: contaB.cookie });
  assert.equal(b.json.consumo.enviadas, 7);

  const a = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(a.json.consumo.enviadas, 41, 'a conta A nao mexeu');
});

test('contar exige a chave de servico, e o lojista nao conta por si', async () => {
  const semChave = await pedir(`/interno/base/${contaA.id}/consumo`, {
    metodo: 'POST', corpo: { enviadas: 100 },
  });
  assert.equal(semChave.status, 401);

  const chaveErrada = await pedir(`/interno/base/${contaA.id}/consumo`, {
    metodo: 'POST', cabecalhos: { Authorization: 'Bearer chave-que-nao-e-a-nossa' },
    corpo: { enviadas: 100 },
  });
  assert.equal(chaveErrada.status, 401);

  // O cookie do dono da conta tambem nao serve: a rota e de servico, e
  // deixar o lojista mexer no proprio medidor e deixar ele escolher a fatura.
  const comCookie = await pedir(`/interno/base/${contaA.id}/consumo`, {
    metodo: 'POST', cookie: contaA.cookie, corpo: { enviadas: 100 },
  });
  assert.equal(comCookie.status, 401);

  const tela = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(tela.json.consumo.enviadas, 41, 'nenhuma das tres contou');
});

test('conta sem o modulo nao acumula consumo', async () => {
  const r = await pedir(`/interno/base/${semModulo.id}/consumo`, {
    metodo: 'POST', cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { enviadas: 3 },
  });
  assert.equal(r.status, 404);
});

test('lote fora do limite e aparado, nao recusado', async () => {
  const chave = { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` };
  const antes = (await pedir('/api/atendimento', { cookie: contaB.cookie })).json.consumo.enviadas;

  // Agente com defeito mandando um numero absurdo nao pode inflar a fatura
  // nem derrubar a rota: entra o teto.
  const r = await pedir(`/interno/base/${contaB.id}/consumo`, {
    metodo: 'POST', cabecalhos: chave, corpo: { enviadas: 999999 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.enviadas, antes + 500);

  const zero = await pedir(`/interno/base/${contaB.id}/consumo`, {
    metodo: 'POST', cabecalhos: chave, corpo: { enviadas: 0 },
  });
  assert.equal(zero.json.enviadas, antes + 501, 'sem numero, conta uma');
});

/*
 * O numero e a ligacao entre a conversa que chega e a loja que ela pertence.
 *
 * O agente sabe em qual numero a mensagem caiu, e nao de qual conta do Capta.
 * Se essa resolucao errar, a loja A responde o cliente da loja B com a
 * politica de troca errada, e isso nao aparece em tela nenhuma: aparece no
 * WhatsApp do cliente final.
 */
test('o agente descobre a loja pelo numero que recebeu a mensagem', async () => {
  const chave = { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` };

  const antes = await pedir('/interno/numero/5541988887777', { cabecalhos: chave });
  assert.equal(antes.status, 404, 'numero que ninguem reivindicou nao resolve');

  const posto = await pedir(`/api/admin/contas/${contaA.id}/numero`, {
    metodo: 'POST', cookie: operador.cookie, corpo: { numero: '(41) 98888-7777' },
  });
  assert.equal(posto.status, 200);
  assert.equal(posto.json.numero, '5541988887777', 'guarda numa forma so, com o pais');

  const achou = await pedir('/interno/numero/41988887777', { cabecalhos: chave });
  assert.equal(achou.status, 200);
  assert.equal(achou.json.conta.id, contaA.id);
  assert.equal(achou.json.base.nomeLoja, 'Bella Moda');

  // O agente manda o numero do jeito que o WhatsApp entrega, com mascara ou
  // sem: os dois precisam cair na mesma loja.
  const mascarado = await pedir('/interno/numero/%2B55%20(41)%2098888-7777', { cabecalhos: chave });
  assert.equal(mascarado.status, 200);
  assert.equal(mascarado.json.conta.id, contaA.id);
});

test('numero so resolve com a chave de servico', async () => {
  const semChave = await pedir('/interno/numero/41988887777');
  assert.equal(semChave.status, 401);

  const errada = await pedir('/interno/numero/41988887777', {
    cabecalhos: { Authorization: 'Bearer nao-e-a-nossa' },
  });
  assert.equal(errada.status, 401);
});

test('o mesmo numero nao pode ter dois donos', async () => {
  const conflito = await pedir(`/api/admin/contas/${contaB.id}/numero`, {
    metodo: 'POST', cookie: operador.cookie, corpo: { numero: '41988887777' },
  });
  assert.equal(conflito.status, 409);

  // E a conta A continua dona: tentativa recusada nao pode deixar as duas sem.
  const ainda = await pedir('/interno/numero/41988887777', {
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(ainda.json.conta.id, contaA.id);
});

test('so o operador define o numero de uma conta', async () => {
  // O numero decide para onde vai a conversa do cliente final. Deixar o
  // lojista declarar o proprio seria deixar ele apontar para o do vizinho.
  const lojista = await pedir(`/api/admin/contas/${contaA.id}/numero`, {
    metodo: 'POST', cookie: contaA.cookie, corpo: { numero: '41999990000' },
  });
  assert.equal(lojista.status, 403);
});

test('numero curto demais nao entra', async () => {
  const r = await pedir(`/api/admin/contas/${contaB.id}/numero`, {
    metodo: 'POST', cookie: operador.cookie, corpo: { numero: '4199' },
  });
  assert.equal(r.status, 400);
});

test('conta sem o modulo nao resolve pelo numero', async () => {
  await pedir(`/api/admin/contas/${semModulo.id}/numero`, {
    metodo: 'POST', cookie: operador.cookie, corpo: { numero: '41977776666' },
  });
  const r = await pedir('/interno/numero/41977776666', {
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(r.status, 404);
});

test('a tela diz o que falta para o atendimento entrar no ar', async () => {
  const tela = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(tela.json.prontidao.numero, '5541988887777');
  assert.equal(tela.json.prontidao.atendendo, true, 'ja contou mensagem nos testes acima');

  const sem = await pedir('/api/atendimento', { cookie: contaB.cookie });
  assert.equal(sem.json.prontidao.numero, null);
});

/*
 * O freio de mao.
 *
 * Se o agente nao enxergar a pausa, ele continua respondendo por horas depois
 * de o lojista ter puxado o freio, e o lojista so descobre pelo cliente
 * reclamando. Por isso a pausa viaja nas duas rotas que o agente usa.
 */
test('o lojista pausa e o agente enxerga, pelas duas rotas', async () => {
  const chave = { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` };

  const antes = await pedir(`/interno/base/${contaA.id}`, { cabecalhos: chave });
  assert.equal(antes.json.pausado, false);

  const parou = await pedir('/api/atendimento/pausa', {
    metodo: 'POST', cookie: contaA.cookie,
    corpo: { pausado: true, recado: 'Estamos em manutenção hoje.' },
  });
  assert.equal(parou.status, 200);
  assert.equal(parou.json.pausado, true);

  const porId = await pedir(`/interno/base/${contaA.id}`, { cabecalhos: chave });
  assert.equal(porId.json.pausado, true);
  assert.equal(porId.json.recado, 'Estamos em manutenção hoje.');

  const porNumero = await pedir('/interno/numero/41988887777', { cabecalhos: chave });
  assert.equal(porNumero.json.pausado, true);
  assert.equal(porNumero.json.recado, 'Estamos em manutenção hoje.');

  const tela = await pedir('/api/atendimento', { cookie: contaA.cookie });
  assert.equal(tela.json.pausa.pausado, true);
});

test('religar mantem o recado guardado para a proxima vez', async () => {
  const voltou = await pedir('/api/atendimento/pausa', {
    metodo: 'POST', cookie: contaA.cookie, corpo: { pausado: false },
  });
  assert.equal(voltou.json.pausado, false);
  // Quem escreveu o recado uma vez nao devia ter que escrever de novo no
  // proximo dia de manutencao.
  assert.equal(voltou.json.recado, 'Estamos em manutenção hoje.');

  const agente = await pedir(`/interno/base/${contaA.id}`, {
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(agente.json.pausado, false);
});

test('a pausa de uma conta nao para a outra', async () => {
  await pedir('/api/atendimento/pausa', {
    metodo: 'POST', cookie: contaA.cookie, corpo: { pausado: true },
  });
  const vizinha = await pedir('/api/atendimento', { cookie: contaB.cookie });
  assert.equal(vizinha.json.pausa.pausado, false);

  await pedir('/api/atendimento/pausa', {
    metodo: 'POST', cookie: contaA.cookie, corpo: { pausado: false },
  });
});

test('pausar exige o modulo, e nao se pausa pela rota interna', async () => {
  const sem = await pedir('/api/atendimento/pausa', {
    metodo: 'POST', cookie: semModulo.cookie, corpo: { pausado: true },
  });
  assert.equal(sem.status, 404);

  // A pausa e decisao do lojista. O agente le, nao escreve.
  const agente = await pedir('/api/atendimento/pausa', {
    metodo: 'POST', cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { pausado: true },
  });
  assert.equal(agente.status, 401);
});

/*
 * Os atendimentos que chegam pelo WhatsApp.
 *
 * Aqui mora o risco que o resto do projeto nao tem: o agente manda a conversa
 * de um cliente final pela rota interna, e um id de conversa na URL do painel
 * nao pode servir de autorizacao. Loja B abrindo a conversa da loja A nao e
 * vazamento de tela, e a conversa de um consumidor com outra empresa.
 */
test('o agente registra a fala e o painel da conta ve, so a dona', async () => {
  const entrou = await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST',
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { cliente: '41988887777', nome: 'Joana', direcao: 'cliente', texto: 'Voces tem o quadriciclo 49cc?' },
  });
  assert.equal(entrou.status, 200);
  assert.equal(entrou.json.responder, true, 'conversa nova e da IA');
  const id = entrou.json.id;

  await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST',
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { cliente: '41988887777', direcao: 'agente', texto: 'Temos sim, em tres cores.' },
  });

  const minha = await pedir('/api/atendimentos', { cookie: contaA.cookie });
  assert.equal(minha.status, 200);
  assert.equal(minha.json.atendimentos.length, 1, 'duas falas, um atendimento so');
  assert.equal(minha.json.atendimentos[0].falas, 2);
  assert.equal(minha.json.atendimentos[0].nome, 'Joana');
  assert.equal(minha.json.contagem.total, 1);

  // A vizinha nao ve a conversa na lista nem alcanca pelo id.
  const dela = await pedir('/api/atendimentos', { cookie: contaB.cookie });
  assert.equal(dela.json.atendimentos.length, 0);
  const espiando = await pedir(`/api/atendimentos/${id}`, { cookie: contaB.cookie });
  assert.equal(espiando.status, 404, 'conta B tinha que receber 404 na conversa da conta A');

  const aberta = await pedir(`/api/atendimentos/${id}`, { cookie: contaA.cookie });
  assert.equal(aberta.status, 200);
  assert.equal(aberta.json.falas.length, 2);
  assert.equal(aberta.json.falas[0].direcao, 'cliente');
});

test('assumir cala o agente naquela conversa, e so nela', async () => {
  const lista = await pedir('/api/atendimentos', { cookie: contaA.cookie });
  const id = lista.json.atendimentos[0].id;

  // Uma segunda conversa, para provar que a pausa e por cliente e nao da loja.
  await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST',
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { cliente: '41977776666', direcao: 'cliente', texto: 'Qual o prazo para Curitiba?' },
  });

  const assumiu = await pedir(`/api/atendimentos/${id}/estado`, {
    metodo: 'POST', cookie: contaA.cookie, corpo: { estado: 'humano' },
  });
  assert.equal(assumiu.status, 200);
  assert.equal(assumiu.json.estado, 'humano');

  const voltou = await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST',
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { cliente: '41988887777', direcao: 'cliente', texto: 'Oi, ainda esta ai?' },
  });
  assert.equal(voltou.json.responder, false, 'o agente tem que calar na conversa assumida');
  assert.equal(voltou.json.estado, 'humano', 'mensagem nova nao devolve a conversa para a IA');

  const outra = await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST',
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { cliente: '41977776666', direcao: 'cliente', texto: 'Alo?' },
  });
  assert.equal(outra.json.responder, true, 'a outra conversa segue com a IA');

  const devolveu = await pedir(`/api/atendimentos/${id}/estado`, {
    metodo: 'POST', cookie: contaA.cookie, corpo: { estado: 'ia' },
  });
  assert.equal(devolveu.json.estado, 'ia');
  assert.equal(devolveu.json.assumido_em, null);
});

test('a conta vizinha nao escreve na conversa pela rota interna sem a chave', async () => {
  const semChave = await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST', corpo: { cliente: '41911112222', direcao: 'cliente', texto: 'oi' },
  });
  assert.equal(semChave.status, 401);

  const comCookie = await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST', cookie: contaB.cookie, corpo: { cliente: '41911112222', direcao: 'cliente', texto: 'oi' },
  });
  assert.equal(comCookie.status, 401, 'cookie de lojista nao vale como chave de servico');

  const semModulo = await pedir(`/interno/atendimentos/${contaA.id}`, {
    metodo: 'POST',
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
    corpo: { cliente: '', direcao: 'cliente', texto: 'oi' },
  });
  assert.equal(semModulo.status, 400, 'sem numero de cliente nao se cria conversa');

  const estadoTorto = await pedir('/api/atendimentos/00000000-0000-0000-0000-000000000000/estado', {
    metodo: 'POST', cookie: contaA.cookie, corpo: { estado: 'inventado' },
  });
  assert.equal(estadoTorto.status, 400);
});

/*
 * A receita do Atende Ai no Admin.
 *
 * Ela nao sai de assinaturas, e sim da faixa gravada na conta, entao nenhum
 * teste de plano cobre isso: sem este, mudar a faixa de uma conta mexeria no
 * numero do Admin sem ninguem perceber. E as duas receitas ficam separadas de
 * proposito, porque o Atende Ai ainda nao passa pela cobranca automatica.
 */
test('o Admin conta a recorrencia do Atende Ai pela faixa, separada do Capta', async () => {
  await consultar(
    `update contas set modulo_atendimento = false where email <> $1`,
    [contaA.email],
  );
  await consultar(
    `update contas set modulo_atendimento = true, faixa_atendimento = 'escala' where id = $1`,
    [contaA.id],
  );

  const resumo = await pedir('/api/admin/resumo', { cookie: operador.cookie });
  assert.equal(resumo.status, 200);
  assert.equal(resumo.json.mrrAtendimento, 797);
  assert.equal(resumo.json.mrr, 0, 'conta sem assinatura nao pode virar receita do Capta');
  assert.deepEqual(resumo.json.atendimento, [{ faixa: 'escala', n: 1 }]);
  assert.equal(resumo.json.faixas.escala.mensal, 797);
});

/*
 * Responder pelo painel.
 *
 * O painel nao fala com o WhatsApp: ele enfileira e o agente envia. O que se
 * prova aqui e que a mensagem so vira fala da conversa depois da entrega
 * confirmada, e que a fila de uma loja nao aparece para a outra.
 */
test('a resposta do painel entra na fila e so vira fala quando o agente entrega', async () => {
  const lista = await pedir('/api/atendimentos', { cookie: contaA.cookie });
  const alvo = lista.json.atendimentos.find((a) => a.cliente === '5541988887777');

  const mandou = await pedir(`/api/atendimentos/${alvo.id}/mensagem`, {
    metodo: 'POST', cookie: contaA.cookie, corpo: { texto: 'Oi Joana, aqui e o Pierre, eu assumo daqui.' },
  });
  assert.equal(mandou.status, 200);
  assert.equal(mandou.json.estado, 'humano', 'responder a mao assume a conversa');

  const antes = await pedir(`/api/atendimentos/${alvo.id}`, { cookie: contaA.cookie });
  assert.equal(antes.json.fila.length, 1, 'fica na fila enquanto nao sai');
  assert.ok(!antes.json.falas.some((f) => f.direcao === 'humano'),
    'nao pode virar fala antes de o cliente receber');

  // A loja vizinha nao enxerga a fila da outra.
  const dela = await pedir(`/interno/saida/${contaB.id}`, {
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(dela.status, 404, 'conta B esta sem o modulo e nem fila tem');

  const fila = await pedir(`/interno/saida/${contaA.id}`, {
    cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(fila.status, 200);
  assert.equal(fila.json.fila.length, 1);
  assert.equal(fila.json.fila[0].cliente, '5541988887777', 'o agente precisa saber para quem enviar');

  const entregou = await pedir(`/interno/saida/${contaA.id}/${fila.json.fila[0].id}/entregue`, {
    metodo: 'POST', cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(entregou.status, 200);

  const depois = await pedir(`/api/atendimentos/${alvo.id}`, { cookie: contaA.cookie });
  assert.equal(depois.json.fila.length, 0);
  assert.ok(depois.json.falas.some((f) => f.direcao === 'humano'), 'entregue vira fala');

  // Confirmar duas vezes nao duplica a mensagem na conversa.
  const denovo = await pedir(`/interno/saida/${contaA.id}/${fila.json.fila[0].id}/entregue`, {
    metodo: 'POST', cabecalhos: { Authorization: `Bearer ${process.env.CHAVE_SERVICO}` },
  });
  assert.equal(denovo.status, 404);
  const final = await pedir(`/api/atendimentos/${alvo.id}`, { cookie: contaA.cookie });
  assert.equal(final.json.falas.filter((f) => f.direcao === 'humano').length, 1);

  await pedir(`/api/atendimentos/${alvo.id}/estado`, {
    metodo: 'POST', cookie: contaA.cookie, corpo: { estado: 'ia' },
  });
});

/*
 * Ligar a cobranca do Atende Ai.
 *
 * O Asaas e trocado por um servidor local: o que se testa aqui e a nossa
 * sequencia (cliente, assinatura da faixa, cobranca unica da ativacao) e o
 * valor que sai, nao o Asaas. Mandar o preco errado aqui e mandar a fatura
 * errada para o cliente do Pierre.
 */
test('o operador liga a cobranca da faixa e a ativacao sai uma vez so', async () => {
  const pedidos = [];
  const asaasFalso = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (p) => { corpo += p; });
    req.on('end', () => {
      pedidos.push({ caminho: req.url, corpo: corpo ? JSON.parse(corpo) : null });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: `ext_${pedidos.length}` }));
    });
  });
  await new Promise((ok) => asaasFalso.listen(0, ok));
  process.env.ASAAS_BASE = `http://127.0.0.1:${asaasFalso.address().port}`;
  process.env.ASAAS_API_KEY = 'chave-de-teste';

  try {
    await consultar('update contas set modulo_atendimento = true where id = $1', [contaB.id]);

    const ligou = await pedir(`/api/admin/contas/${contaB.id}/cobranca`, {
      metodo: 'POST', cookie: operador.cookie,
      corpo: { faixa: 'crescimento', ciclo: 'mensal', ativacao: 'acompanhada', documento: '12345678909' },
    });
    assert.equal(ligou.status, 200, JSON.stringify(ligou.json));
    assert.equal(ligou.json.faixa, 'crescimento');
    assert.equal(ligou.json.ativacao.valor, 1890);

    const assinatura = pedidos.find((p) => p.caminho.includes('/subscriptions'));
    assert.equal(assinatura.corpo.value, 397, 'Crescimento mensal sao R$ 397');
    assert.equal(assinatura.corpo.cycle, 'MONTHLY');
    const ativacao = pedidos.find((p) => p.caminho.includes('/payments'));
    assert.equal(ativacao.corpo.value, 1890);

    // De novo: a assinatura e refeita, a ativacao nao se repete.
    const outraVez = await pedir(`/api/admin/contas/${contaB.id}/cobranca`, {
      metodo: 'POST', cookie: operador.cookie,
      corpo: { faixa: 'escala', ciclo: 'anual', ativacao: 'acompanhada' },
    });
    assert.equal(outraVez.status, 200);
    assert.equal(outraVez.json.ativacao, null, 'ativacao e cobranca unica');
    const cobrancas = await consultar(
      `select tipo from cobrancas where conta_id = $1`, [contaB.id],
    );
    assert.equal(cobrancas.rows.length, 1);

    const anual = pedidos.filter((p) => p.caminho.includes('/subscriptions')).pop();
    assert.equal(anual.corpo.cycle, 'YEARLY');
    // Escala anual: 797 com 20% de desconto, vezes doze.
    assert.equal(anual.corpo.value, 7651.2);

    const faixaTorta = await pedir(`/api/admin/contas/${contaB.id}/cobranca`, {
      metodo: 'POST', cookie: operador.cookie, corpo: { faixa: 'inventada' },
    });
    assert.equal(faixaTorta.status, 400);
  } finally {
    asaasFalso.close();
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_BASE;
    await consultar('update contas set modulo_atendimento = false where id = $1', [contaB.id]);
  }
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
