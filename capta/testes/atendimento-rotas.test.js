import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';
// Definida antes de importar o servidor: a rota interna le a chave do
// ambiente a cada chamada, mas o aviso de boot acontece na carga.
process.env.CHAVE_SERVICO = 'chave-de-servico-de-teste-com-tamanho-suficiente';

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
  if (modulo) {
    await consultar('update contas set modulo_atendimento = true where id = $1', [conta.id]);
  }
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

test.after(async () => {
  servidor.close();
  await pool.end();
});
