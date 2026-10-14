import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepararBanco, contaDeTeste, conexaoDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';

/**
 * O assistente que monta o fluxo.
 *
 * A API da Anthropic nao e alcancavel daqui, e nem deveria ser num teste: um
 * modelo devolve texto diferente a cada chamada, e teste que depende disso
 * acusa falha quando nada quebrou. Entao sobe um servidor falso que devolve o
 * que a gente mandar, e o que se confere e o nosso lado: o que sai na chamada,
 * o que entra de volta e o que o painel recebe depois da normalizacao.
 *
 * A parte que mais importa aqui e a normalizacao. O que volta de um modelo e
 * entrada externa como qualquer outra, e sugestao com cinco perguntas ou
 * pergunta sem opcao chegaria no painel e seria recusada na publicacao, com o
 * lojista achando que o produto quebrou.
 */

let pedidos = [];
let resposta = null;

const falso = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (p) => { corpo += p; });
  req.on('end', () => {
    pedidos.push({
      caminho: req.url,
      chave: req.headers['x-api-key'],
      versao: req.headers['anthropic-version'],
      corpo: JSON.parse(corpo),
    });
    res.writeHead(resposta.http || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(resposta.corpo));
  });
});
await new Promise((ok) => falso.listen(0, ok));

process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${falso.address().port}`;
process.env.ANTHROPIC_API_KEY = 'chave-de-teste';

const { pool } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');
const { sugerirFluxo } = await import('../src/redator.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

const conta = await contaDeTeste('Lincoln Joias', 'pierre+redator@lojadoecommerce.com.br');
const loja = await conexaoDeTeste(conta.id, 'outra', 'Lincoln Joias');

const entrada = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'pierre+redator@lojadoecommerce.com.br', senha: 'senha-de-teste-123' }),
});
const cookie = entrada.headers.get('set-cookie').split(';')[0];

function responder(texto, extra = {}) {
  resposta = { corpo: { content: [{ type: 'text', text: texto }], ...extra } };
}

function sugerir(descricao) {
  return fetch(`${base}/api/conexoes/${loja.id}/fluxo/sugerir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ descricao }),
  });
}

const BOA = JSON.stringify({
  convite: 'Ganhe 10% na aliança',
  consentimento: 'Ao continuar, você concorda que a Lincoln Joias use seus dados para entrar em contato sobre esta compra.',
  desconto: 10,
  recompensa: 'cupom',
  perguntas: [
    { texto: 'O que você procura?', opcoes: ['Aliança', 'Anel', 'Colar'] },
    { texto: 'Para quando é?', opcoes: ['Este mês', 'Em três meses', 'Só pesquisando'] },
    { texto: 'Quer ajuda de alguém da equipe?', opcoes: ['Sim, me chamem', 'Prefiro sozinha'] },
  ],
});

test('a descricao da loja vira quadro pronto, e nada de lead sai na chamada', async () => {
  pedidos = [];
  responder(BOA);
  const r = await sugerir('Vendo aliança de ouro e anel de noivado, ticket de dois a cinco mil.');
  assert.equal(r.status, 200);
  const fluxo = await r.json();
  assert.equal(fluxo.perguntas.length, 3);
  assert.equal(fluxo.recompensa, 'cupom');

  const pedido = pedidos[0];
  assert.equal(pedido.caminho, '/v1/messages');
  assert.equal(pedido.chave, 'chave-de-teste');
  assert.ok(pedido.versao, 'a versao da API e obrigatoria no cabecalho');
  assert.equal(pedido.corpo.model, 'claude-opus-5-5');

  // O que sai e o nome da loja e o que o lojista escreveu, nada mais. Lead
  // nenhum pode entrar nesta chamada: quem respondeu o chat nao autorizou a
  // propria conversa a virar material de redacao.
  const conversa = JSON.stringify(pedido.corpo.messages);
  assert.match(conversa, /Lincoln Joias/);
  assert.doesNotMatch(conversa, /@|\d{8}/, 'nenhum contato de lead pode ir junto');
});

test('sugestao fora do formato e aparada antes de chegar ao painel', async () => {
  responder('Claro, segue o fluxo:\n' + JSON.stringify({
    convite: 'x'.repeat(200),
    consentimento: 'Consentimento da loja.',
    desconto: 400,
    recompensa: 'inventada',
    perguntas: [
      { texto: 'Uma', opcoes: ['a', 'b'] },
      { texto: 'Duas', opcoes: ['a', 'b'] },
      { texto: 'Tres', opcoes: ['a', 'b'] },
      { texto: 'Quatro', opcoes: ['a', 'b'] },
      { texto: 'Sem opcao nenhuma', opcoes: [] },
    ],
  }) + '\nEspero que ajude.');

  const fluxo = await (await sugerir('Loja de roupa feminina, ticket baixo.')).json();
  // Quatro perguntas nao publicam: a quarta e sempre a de contato.
  assert.equal(fluxo.perguntas.length, 3);
  assert.ok(fluxo.convite.length <= 60);
  assert.ok(fluxo.desconto <= 90);
  assert.equal(fluxo.recompensa, 'cupom', 'beneficio desconhecido tem que virar o padrao');
  assert.ok(fluxo.perguntas.every((p) => p.opcoes.length >= 2));
});

test('resposta imprestavel vira recado, nao tela quebrada', async () => {
  responder('Desculpe, nao consigo ajudar com isso.');
  const r = await sugerir('Loja de roupa feminina, ticket baixo.');
  assert.equal(r.status, 502);
  assert.ok((await r.json()).explicacao, 'o lojista precisa saber o que fazer agora');
});

test('recusa por politica nao vira sugestao', async () => {
  resposta = { corpo: { content: [], stop_reason: 'refusal' } };
  await assert.rejects(
    () => sugerirFluxo({ loja: 'Lincoln Joias', descricao: 'qualquer coisa aqui' }),
    /recusado/,
  );
});

test('descricao curta demais nem chega a custar dinheiro', async () => {
  pedidos = [];
  const r = await sugerir('joias');
  assert.equal(r.status, 400);
  assert.equal(pedidos.length, 0, 'nao pode sair chamada paga para uma palavra');
});

test('a conta tem teto diario, senao um botao em tela vira conta aberta', async () => {
  responder(BOA);
  let cortou = null;
  for (let i = 0; i < 25; i += 1) {
    const r = await sugerir('Vendo aliança de ouro, ticket alto, cliente indeciso.');
    if (r.status === 429) { cortou = i; break; }
  }
  assert.ok(cortou !== null, 'o teto diario tinha que ter cortado');
});

test('sem chave configurada o painel nao mostra o assistente', async () => {
  const guardada = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const eu = await (await fetch(`${base}/api/eu`, { headers: { Cookie: cookie } })).json();
    assert.equal(eu.redator, false);

    const r = await sugerir('Vendo aliança de ouro, ticket alto, cliente indeciso.');
    assert.equal(r.status, 503);
  } finally {
    process.env.ANTHROPIC_API_KEY = guardada;
  }
});

test('loja de outra conta nao aceita sugestao', async () => {
  const outra = await contaDeTeste('Casa Verde', 'pierre+outra-r@lojadoecommerce.com.br');
  const lojaDela = await conexaoDeTeste(outra.id, 'outra', 'Casa Verde');
  const r = await fetch(`${base}/api/conexoes/${lojaDela.id}/fluxo/sugerir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ descricao: 'Vendo plantas e vasos de cimento queimado.' }),
  });
  assert.equal(r.status, 404);
});

test.after(async () => {
  servidor.close();
  falso.close();
  await pool.end();
});
