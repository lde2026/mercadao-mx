import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco } from './ajuda.js';

process.env.NODE_ENV = 'test';

const { pool, consultar } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');
const { TERMOS } = await import('../src/termos.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

/**
 * Aceite dos termos e prova, nao enfeite. Se a conta nasce sem registro de
 * qual versao foi aceita e quando, a cobranca e a politica de dados ficam sem
 * lastro no dia em que alguem contestar.
 */

function cadastrar(corpo) {
  return fetch(`${base}/api/cadastro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

test('a versao vigente dos termos e publica, sem sessao', async () => {
  const r = await fetch(`${base}/api/termos`);
  assert.equal(r.status, 200);
  const dados = await r.json();
  assert.equal(dados.versao, TERMOS.versao);
  assert.match(dados.urlTermos, /^https:\/\//);
  assert.match(dados.urlPrivacidade, /^https:\/\//);
});

test('cadastro sem aceite e recusado e nao cria conta', async () => {
  const email = `sem-aceite-${Date.now()}@teste.com.br`;
  const r = await cadastrar({ nome: 'Loja Sem Aceite', email, senha: 'senha-de-teste-123' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /termos/);
  const { rows } = await consultar('select 1 from contas where email = $1', [email]);
  assert.equal(rows.length, 0, 'nao pode ter criado a conta');
});

test('aceite falso ou ausente vale como recusa', async () => {
  for (const aceite of [false, 'sim', 1, null]) {
    const r = await cadastrar({
      nome: 'Loja X', email: `aceite-${Date.now()}-${Math.random()}@teste.com.br`,
      senha: 'senha-de-teste-123', aceite,
    });
    assert.equal(r.status, 400, `aceite ${JSON.stringify(aceite)} tinha que ser recusado`);
  }
});

test('cadastro com aceite grava versao, data e rede mascarada', async () => {
  const email = `com-aceite-${Date.now()}@teste.com.br`;
  const r = await cadastrar({ nome: 'Loja Com Aceite', email, senha: 'senha-de-teste-123', aceite: true });
  assert.equal(r.status, 200);

  const { rows } = await consultar(
    'select termos_versao, termos_aceitos_em, termos_rede from contas where email = $1', [email],
  );
  assert.equal(rows[0].termos_versao, TERMOS.versao);
  assert.ok(rows[0].termos_aceitos_em instanceof Date, 'a data do aceite tem que estar gravada');
  // Mesma regra do evento do visitante: rede, nunca o endereco inteiro.
  if (rows[0].termos_rede) assert.match(rows[0].termos_rede, /\/\d+$/);
});

test.after(async () => { servidor.close(); await pool.end(); });
