import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste, conexaoDeTeste, assinarPlano } from './ajuda.js';

process.env.NODE_ENV = 'test';

const { pool } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');
const repo = await import('../src/repositorio.js');
const { PLANOS, cotaDeLojas } = await import('../src/billing/planos.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

/**
 * Teto de lojas por plano.
 *
 * O teto so vale se valer nos dois caminhos de criacao, o formulario e a
 * volta do OAuth, e se nao tirar do ar a loja de quem ja passou do teto por
 * ter baixado de plano. Os testes abaixo cobrem os tres casos.
 */

async function conta(nome, plano) {
  const c = await contaDeTeste(nome, `lojas-${Date.now()}-${Math.random()}@teste.com.br`);
  if (plano) await assinarPlano(c.id, plano);
  return c;
}

async function conectar(contaId, nomeLoja) {
  return conexaoDeTeste(contaId, 'outra', nomeLoja, {});
}

test('cada plano tem o teto que foi vendido', () => {
  assert.equal(PLANOS.essencial.lojas, 1);
  assert.equal(PLANOS.crescimento.lojas, 3);
  assert.equal(PLANOS.escala.lojas, 10);
  // Sem plano vale o de entrada, nunca ilimitado.
  assert.equal(cotaDeLojas(null), 1);
  assert.equal(cotaDeLojas('inventado'), 1);
});

test('Essencial para na segunda loja', async () => {
  const c = await conta('Bella Moda', 'essencial');
  await conectar(c.id, 'Loja 1');
  await assert.rejects(() => conectar(c.id, 'Loja 2'), (e) => {
    assert.equal(e.codigo, 'teto_de_lojas');
    assert.equal(e.teto, 1);
    assert.equal(e.conectadas, 1);
    return true;
  });
  assert.equal(await repo.contarConexoes(c.id), 1);
});

test('Crescimento vai ate a terceira e para na quarta', async () => {
  const c = await conta('Casa Verde', 'crescimento');
  for (const nome of ['Loja 1', 'Loja 2', 'Loja 3']) await conectar(c.id, nome);
  await assert.rejects(() => conectar(c.id, 'Loja 4'), /3 loja/);
  assert.equal(await repo.contarConexoes(c.id), 3);
});

test('a rota responde 409 com o caminho da saida, nao 500', async () => {
  const c = await contaDeTeste('Pet Cia', `rota-${Date.now()}@teste.com.br`);
  await assinarPlano(c.id, 'essencial');
  const cookie = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: (await repo.buscarConta(c.id)).email, senha: 'senha-de-teste-123' }),
  }).then((r) => r.headers.get('set-cookie').split(';')[0]);

  const criar = (nome) => fetch(`${base}/api/conexoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ plataforma: 'outra', nomeLoja: nome, credenciais: {} }),
  });

  assert.equal((await criar('Primeira')).status, 201);
  const segunda = await criar('Segunda');
  assert.equal(segunda.status, 409);
  const corpo = await segunda.json();
  assert.match(corpo.erro, /1 loja/);
  // Sem o caminho da saida a mensagem manda o lojista abrir chamado.
  assert.match(corpo.explicacao, /Crescimento/);
});

test('quem ja passou do teto mantem as lojas e so nao conecta mais', async () => {
  const c = await conta('Agência', 'escala');
  for (let i = 0; i < 4; i += 1) await conectar(c.id, `Loja ${i + 1}`);

  // Desce para um plano que comporta 3. As quatro continuam no ar.
  await assinarPlano(c.id, 'crescimento');
  assert.equal(await repo.contarConexoes(c.id), 4);
  const lojas = await repo.listarConexoes(c.id);
  assert.equal(lojas.filter((l) => l.status === 'ativa').length, 4);

  // O que ela perde e a proxima.
  await assert.rejects(() => conectar(c.id, 'Loja 5'), /teto|3 loja/);
});

test('descer de plano com lojas demais e recusado com o numero exato', async () => {
  const c = await contaDeTeste('Multi', `desce-${Date.now()}@teste.com.br`);
  await assinarPlano(c.id, 'escala');
  for (let i = 0; i < 5; i += 1) await conectar(c.id, `Loja ${i + 1}`);
  const cookie = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: (await repo.buscarConta(c.id)).email, senha: 'senha-de-teste-123' }),
  }).then((r) => r.headers.get('set-cookie').split(';')[0]);

  const r = await fetch(`${base}/api/assinatura`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ plano: 'essencial', ciclo: 'mensal' }),
  });
  assert.equal(r.status, 409);
  const corpo = await r.json();
  assert.match(corpo.explicacao, /Remova 4 loja/);

  // E o plano nao mudou pela metade.
  assert.equal((await repo.assinaturaDaConta(c.id)).plano, 'escala');
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
