import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';
process.env.URL_PUBLICA = 'https://captapp.lojadoecommerce.com.br';

const { pool } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');
const repo = await import('../src/repositorio.js');
const { adaptador } = await import('../src/adapters/index.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

/**
 * Loja fora das quatro que integram.
 *
 * O risco aqui nao e o chat nao funcionar, e o sistema tratar essa loja como
 * se tivesse API: tentar criar cupom que nao existe, varrer pedidos que nao
 * ha, ou pedir uma credencial que ninguem tem. Cada teste abaixo fecha um
 * desses caminhos.
 */

const conta = await contaDeTeste('Loja do E-commerce', 'pierre+o@lojadoecommerce.com.br');

const cookie = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'pierre+o@lojadoecommerce.com.br', senha: 'senha-de-teste-123' }),
}).then((r) => r.headers.get('set-cookie').split(';')[0]);

function pedir(caminho, opcoes = {}) {
  return fetch(base + caminho, {
    method: opcoes.metodo || 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
}

test('conecta sem pedir credencial nenhuma', async () => {
  const r = await pedir('/api/conexoes', {
    metodo: 'POST',
    corpo: { plataforma: 'outra', nomeLoja: 'Ateliê da Ana', dominio: 'ateliedaana.com.br', credenciais: {} },
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.plataforma, 'outra');
  assert.ok(r.json.chave_publica, 'sem chave publica o widget nao tem como se identificar');
});

test('a instalacao devolve a tag pronta, com a chave da loja dentro', async () => {
  const lista = await pedir('/api/conexoes');
  const loja = (lista.json.conexoes || lista.json).find((c) => c.nome_loja === 'Ateliê da Ana');

  const r = await pedir(`/api/conexoes/${loja.id}/instalacao`, { metodo: 'POST' });
  assert.equal(r.status, 200);
  assert.equal(r.json.modo, 'manual');
  assert.ok(r.json.instrucoes.length, 'sem passos o lojista nao sabe onde colar');
  assert.match(r.json.tag, /^<script async src="https:\/\/captapp\.lojadoecommerce\.com\.br\/widget\.js\?k=/);
  assert.ok(r.json.tag.includes(loja.chave_publica), 'a tag tem que carregar a chave desta loja');

  // O modo fica gravado, senao o painel pediria a instalacao de novo a cada visita.
  const depois = await pedir('/api/conexoes');
  const salva = (depois.json.conexoes || depois.json).find((c) => c.id === loja.id);
  assert.equal(salva.modo_instalacao, 'manual');
  // E o cupom vem de lote, como na Loja Integrada: o painel so mostra o
  // formulario de reposicao quando esta chave existe.
  assert.ok(salva.lote, 'sem lote o lojista nao tem onde cadastrar os codigos');
  assert.equal(Number(salva.lote.disponiveis), 0);
});

test('nao promete cupom por API nem varredura de pedidos', async () => {
  const api = adaptador('outra');
  assert.equal(api.criaCupomPorApi, false);
  assert.equal(api.temWebhookDePedido, false);
  // Ausente de proposito: a varredura pula quem nao tem, em vez de chamar e
  // receber lista vazia a cada meia hora.
  assert.equal(api.listarPedidos, undefined);
  await assert.rejects(() => api.criarCupom(), /lote/);
});

test('a varredura de pedidos nao enxerga esta loja', async () => {
  // A consulta filtra por plataforma. Se um dia deixar de filtrar, o guarda
  // em tarefas.js pula; este teste trava o comportamento de hoje.
  const paraVarrer = await repo.conexoesParaVarrer(0);
  assert.ok(!paraVarrer.some((c) => c.plataforma === 'outra'));
});

test('WooCommerce tambem entrega a tag, nao so a instrucao do plugin', async () => {
  // O plugin so existe em "Plugins, Adicionar novo" depois de publicado no
  // repositorio do WordPress. Sem a tag junto, a instrucao manda o lojista
  // procurar uma coisa que ainda nao esta la, e a instalacao trava.
  const api = adaptador('woocommerce');
  const r = await api.instalarScript({}, 'https://captapp.lojadoecommerce.com.br/widget.js?k=pk_x');
  assert.equal(r.modo, 'manual');
  assert.match(r.tag, /^<script async src="https:\/\/captapp\.lojadoecommerce\.com\.br\/widget\.js\?k=pk_x"/);
  assert.ok(r.instrucoes.some((i) => /tema/i.test(i)), 'o primeiro caminho tem que ser o que funciona hoje');
});

test('plataforma inventada continua sendo recusada', async () => {
  const r = await pedir('/api/conexoes', {
    metodo: 'POST',
    corpo: { plataforma: 'shopify', nomeLoja: 'Qualquer', credenciais: {} },
  });
  assert.equal(r.status, 400);
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
