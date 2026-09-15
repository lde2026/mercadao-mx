import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste, conexaoDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';

const { pool } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');
const repo = await import('../src/repositorio.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

/**
 * O beneficio do fim do chat decide se a plataforma e chamada ou nao. Errar
 * aqui cria cupom para quem pediu diagnostico, ou deixa sem cupom quem pediu.
 */

const conta = await contaDeTeste('Loja do E-commerce', 'pierre+r@lojadoecommerce.com.br');
const loja = await conexaoDeTeste(conta.id, 'nuvemshop', 'Loja do E-commerce', { store_id: '1' });

async function publicar(recompensa, extra = {}) {
  await repo.salvarFluxo(conta.id, loja.id, {
    convite: 'Diagnóstico gratuito',
    consentimento: 'Ao continuar, você concorda que a Loja do E-commerce use seus dados para entrar em contato.',
    desconto: 10,
    recompensa,
    perguntas: [{ texto: 'Qual descreve melhor o momento da sua operação?', opcoes: ['Só loja virtual', 'Física e virtual'] }],
    ...extra,
  });
}

async function responder(nome) {
  const r = await fetch(`${base}/w/lead/${loja.chave_publica}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome, email: `${nome.toLowerCase()}@teste.com.br`, telefone: '41999990000', consentimento: true,
      respostas: [{ pergunta: 'Qual descreve melhor o momento da sua operação?', resposta: 'Só loja virtual' }],
    }),
  });
  return { status: r.status, json: await r.json() };
}

test('o widget recebe o beneficio junto com o fluxo', async () => {
  await publicar('diagnostico');
  const r = await fetch(`${base}/w/fluxo/${loja.chave_publica}`);
  assert.equal((await r.json()).recompensa, 'diagnostico');
});

test('diagnostico grava o lead e nao tenta cupom na plataforma', async () => {
  await publicar('diagnostico');
  const r = await responder('Carla');
  assert.equal(r.status, 200);
  assert.equal(r.json.recompensa, 'diagnostico');
  assert.equal(r.json.cupom, null);
  const { rows } = await pool.query(
    `select count(*)::int as n from cupons where lead_id = $1`, [r.json.leadId],
  );
  assert.equal(rows[0].n, 0, 'diagnostico nao pode criar registro de cupom');
  const lead = await repo.buscarLead(conta.id, r.json.leadId);
  assert.equal(lead.nome, 'Carla', 'o lead precisa estar na fila mesmo sem cupom');
});

test('frete gratis registra cupom do tipo frete e desconto zero', async () => {
  await publicar('frete_gratis');
  const r = await responder('Bruno');
  assert.equal(r.status, 200);
  assert.equal(r.json.recompensa, 'frete_gratis');
  const { rows } = await pool.query(
    `select tipo, desconto from cupons where lead_id = $1`, [r.json.leadId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tipo, 'frete');
  assert.equal(rows[0].desconto, 0);
});

test('cupom continua sendo o padrao quando nada e informado', async () => {
  await publicar('cupom');
  const r = await responder('Dora');
  assert.equal(r.json.recompensa, 'cupom');
  const { rows } = await pool.query(`select tipo, desconto from cupons where lead_id = $1`, [r.json.leadId]);
  assert.equal(rows[0].tipo, 'percentual');
  assert.equal(rows[0].desconto, 10);
});

test('formato, abrir sozinho e cor do botao chegam ao widget', async () => {
  await publicar('cupom', { modo: 'chat', abrirApos: 12, cor: '#ff5a1f' });
  const r = await (await fetch(`${base}/w/fluxo/${loja.chave_publica}`)).json();
  assert.equal(r.modo, 'chat');
  assert.equal(r.abrirApos, 12);
  assert.equal(r.cor, '#ff5a1f');
  assert.equal(r.loja, 'Loja do E-commerce');
});

test('o painel recusa formato e cor invalidos', async () => {
  const entrada = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'pierre+r@lojadoecommerce.com.br', senha: 'senha-de-teste-123' }),
  });
  const cookie = entrada.headers.get('set-cookie').split(';')[0];
  for (const corpo of [{ modo: 'balao' }, { cor: 'vermelho' }]) {
    const r = await fetch(`${base}/api/conexoes/${loja.id}/fluxo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consentimento: 'x', perguntas: [], ...corpo }),
    });
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
});

test('o painel recusa beneficio que nao existe', async () => {
  const entrada = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'pierre+r@lojadoecommerce.com.br', senha: 'senha-de-teste-123' }),
  });
  const cookie = entrada.headers.get('set-cookie').split(';')[0];
  const r = await fetch(`${base}/api/conexoes/${loja.id}/fluxo`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ consentimento: 'x', perguntas: [], recompensa: 'brinde' }),
  });
  assert.equal(r.status, 400);
});

test('a lista de modelos cobre loja e operacao que nao e loja', async () => {
  const entrada = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'pierre+r@lojadoecommerce.com.br', senha: 'senha-de-teste-123' }),
  });
  const cookie = entrada.headers.get('set-cookie').split(';')[0];
  const modelos = await (await fetch(`${base}/api/modelos`, { headers: { Cookie: cookie } })).json();
  const tipos = new Set(modelos.map((m) => m.recompensa));
  for (const t of ['cupom', 'frete_gratis', 'diagnostico', 'especialista', 'consultoria']) {
    assert.ok(tipos.has(t), `falta modelo com beneficio ${t}`);
  }
  for (const m of modelos) {
    assert.ok(m.perguntas.length <= 3, `${m.id} passa do teto de tres perguntas`);
  }
});

test.after(async () => { servidor.close(); await pool.end(); });
