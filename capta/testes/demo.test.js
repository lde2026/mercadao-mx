import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco } from './ajuda.js';

process.env.NODE_ENV = 'test';

const { pool, consultar } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

/**
 * Demonstracao publica.
 *
 * O risco aqui nao e a pagina ficar feia, e ela virar porta de entrada: um
 * endpoint publico que grava no banco sem conta nenhuma atras. Os testes
 * abaixo travam que ela nao escreve nada e nao alcanca dado de cliente.
 */

test('o fluxo da demonstracao sai pronto, sem precisar de conta', async () => {
  const r = await fetch(`${base}/w/fluxo/demo`);
  assert.equal(r.status, 200);
  const fluxo = await r.json();
  assert.equal(fluxo.loja, 'Aurora Boutique');
  assert.equal(fluxo.perguntas.length, 3);
  assert.equal(fluxo.recompensa, 'cupom');
  // Rastreamento desligado: sem conta nao ha para onde mandar evento.
  assert.equal(fluxo.rastrear, false);
});

test('o lead da demonstracao volta para a pagina e nao entra no banco', async () => {
  const antes = await consultar('select count(*)::int as n from leads');

  const r = await fetch(`${base}/w/lead/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Renata Souza',
      email: 'renata@email.com.br',
      telefone: '41999990000',
      consentimento: true,
      respostas: [{ pergunta: 'Qual o seu tamanho?', resposta: 'M' }],
    }),
  });
  assert.equal(r.status, 200);
  const corpo = await r.json();

  assert.equal(corpo.demo, true);
  assert.match(corpo.cupom, /^AURORA-/);
  // Volta para a pagina poder montar o painel sem guardar nada.
  assert.equal(corpo.lead.nome, 'Renata Souza');
  assert.equal(corpo.lead.respostas.length, 1);

  const depois = await consultar('select count(*)::int as n from leads');
  assert.equal(depois.rows[0].n, antes.rows[0].n, 'a demonstracao nao pode gravar lead');

  const contas = await consultar('select count(*)::int as n from contas');
  assert.equal(contas.rows[0].n, 0, 'a demonstracao nao pode criar conta');
});

test('cada resposta traz um cupom diferente', async () => {
  const pedir = () => fetch(`${base}/w/lead/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'A', respostas: [] }),
  }).then((r) => r.json()).then((c) => c.cupom);

  const vistos = new Set(await Promise.all([pedir(), pedir(), pedir(), pedir()]));
  assert.ok(vistos.size > 1, 'cupom fixo faria a demonstracao parecer quebrada');
});

test('a chave demo nao vaza a loja de ninguem', async () => {
  // Nao existe conexao com essa chave, e a rota da demonstracao responde antes
  // da busca por chave de verdade. Chave inventada continua em 404.
  const r = await fetch(`${base}/w/fluxo/pk_inventada`);
  assert.equal(r.status, 404);
});

test('a pagina abre no endereco curto', async () => {
  const r = await fetch(`${base}/demo`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Aurora Boutique/);
  assert.match(html, /widget\.js\?k=demo/);
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
