import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco } from './ajuda.js';

process.env.NODE_ENV = 'test';

const { pool } = await import('../src/db.js');
await prepararBanco();

const { app } = await import('../src/server.js');
const repo = await import('../src/repositorio.js');

const servidor = app.listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;

/**
 * Saber o id de um lead nao significa ser dono dele. Este arquivo existe para
 * ficar vermelho no dia em que alguem escrever uma rota que confia no id da
 * URL como autorizacao.
 */

async function pedir(caminho, { metodo = 'GET', corpo, cookie } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let json = null;
  try { json = await resposta.json(); } catch { /* 204 e 401 vem sem corpo */ }
  return { status: resposta.status, json, cookie: resposta.headers.get('set-cookie') };
}

async function contaLogada(nome, email) {
  const r = await pedir('/api/cadastro', {
    metodo: 'POST', corpo: { nome, email, senha: 'senha-de-teste-123' },
  });
  assert.equal(r.status, 200, `cadastro de ${nome} falhou`);
  return { id: r.json.conta.id, cookie: r.cookie.split(';')[0] };
}

async function lojaComLead(conta, nomeLoja, plataforma, nomePessoa) {
  const conexao = await repo.criarConexao({
    contaId: conta.id, plataforma, nomeLoja,
    credenciais: { access_token: 'token-de-teste' }, modoInstalacao: 'auto',
  });
  const lead = await repo.criarLead({
    contaId: conta.id, conexaoId: conexao.id,
    nome: nomePessoa, email: `${nomePessoa.toLowerCase()}@teste.com.br`,
    telefone: '41999990000',
    respostas: [
      { pergunta: 'Pra quem voce esta comprando?', resposta: 'Meu filho' },
      { pergunta: 'Que idade ele tem?', resposta: '5 a 8' },
    ],
    anonimoId: 'anon-teste', redeMascarada: '189.45.201.0/24',
  });
  return { conexao, lead };
}

const contaA = await contaLogada('MX Kids', 'pierre+a@lojadoecommerce.com.br');
const contaB = await contaLogada('Purple Skate', 'pierre+b@lojadoecommerce.com.br');
const lojaA = await lojaComLead(contaA, 'MX Kids', 'nuvemshop', 'Renata');
const lojaB = await lojaComLead(contaB, 'Purple Skate', 'tray', 'Marcos');

test('conta B lendo o lead da conta A recebe 404', async () => {
  const r = await pedir(`/api/leads/${lojaA.lead.id}`, { cookie: contaB.cookie });
  assert.equal(r.status, 404);
});

test('a conta dona le o proprio lead', async () => {
  const r = await pedir(`/api/leads/${lojaA.lead.id}`, { cookie: contaA.cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.lead.nome, 'Renata');
});

test('conta B apagando o lead da conta A recebe 404 e o lead continua vivo', async () => {
  const r = await pedir(`/api/leads/${lojaA.lead.id}`, {
    metodo: 'DELETE', cookie: contaB.cookie,
  });
  assert.equal(r.status, 404);
  const dono = await pedir(`/api/leads/${lojaA.lead.id}`, { cookie: contaA.cookie });
  assert.equal(dono.status, 200, 'o lead da conta A nao podia ter sido apagado');
});

test('a listagem de leads nunca mistura contas', async () => {
  const a = await pedir('/api/leads', { cookie: contaA.cookie });
  const b = await pedir('/api/leads', { cookie: contaB.cookie });
  assert.deepEqual(a.json.leads.map((l) => l.nome), ['Renata']);
  assert.deepEqual(b.json.leads.map((l) => l.nome), ['Marcos']);
});

test('conta B nao alcanca a conexao da conta A', async () => {
  for (const [caminho, metodo, corpo] of [
    [`/api/conexoes/${lojaA.conexao.id}/fluxo`, 'GET', undefined],
    [`/api/conexoes/${lojaA.conexao.id}/fluxo`, 'PUT', { consentimento: 'x', perguntas: [] }],
    [`/api/conexoes/${lojaA.conexao.id}/lote`, 'POST', { codigos: ['ROUBADO-1'] }],
    [`/api/conexoes/${lojaA.conexao.id}/instalacao`, 'POST', {}],
  ]) {
    const r = await pedir(caminho, { metodo, corpo, cookie: contaB.cookie });
    assert.equal(r.status, 404, `${metodo} ${caminho} devia ser 404`);
  }
});

test('a listagem de conexoes nunca mistura contas', async () => {
  const r = await pedir('/api/conexoes', { cookie: contaB.cookie });
  assert.equal(r.json.length, 1);
  assert.equal(r.json[0].nome_loja, 'Purple Skate');
});

test('a planilha exportada so traz os leads da propria conta', async () => {
  const r = await fetch(`${base}/api/leads.csv`, { headers: { Cookie: contaB.cookie } });
  assert.equal(r.status, 200);
  // Bytes crus: o text() do fetch descarta o BOM ao decodificar, e o teste
  // acusaria falta de um BOM que o servidor manda.
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'precisa do BOM para o Excel em portugues');
  const csv = new TextDecoder().decode(bytes);
  assert.ok(csv.includes('Marcos'), 'o lead da propria conta tem que estar');
  assert.ok(!csv.includes('Renata'), 'o lead da conta A nao pode aparecer na planilha da conta B');
  assert.ok(!csv.includes('MX Kids'), 'nem a loja da conta A');
});

test('nome de lead que parece formula nao executa ao abrir a planilha', async () => {
  await repo.criarLead({
    contaId: contaB.id, conexaoId: lojaB.conexao.id,
    nome: '=HYPERLINK("http://golpe.com";"clique")', email: 'x@teste.com.br', telefone: null,
    respostas: [], anonimoId: 'anon-f', redeMascarada: null,
  });
  const csv = await (await fetch(`${base}/api/leads.csv`, { headers: { Cookie: contaB.cookie } })).text();
  assert.ok(csv.includes(`"'=HYPERLINK`), 'celula que comeca com = tem que ganhar apostrofo');
});

test('nenhuma rota do painel responde sem sessao', async () => {
  for (const caminho of ['/api/eu', '/api/leads', '/api/leads.csv', '/api/conexoes', '/api/financeiro', '/api/hoje']) {
    const r = await pedir(caminho);
    assert.equal(r.status, 401, `${caminho} respondeu sem sessao`);
  }
});

test('cookie de sessao adulterado nao autentica', async () => {
  const adulterado = contaA.cookie.replace(/=(.)/, (_m, c) => `=${c === 'a' ? 'b' : 'a'}`);
  const r = await pedir('/api/eu', { cookie: adulterado });
  assert.equal(r.status, 401);
});

test('sair invalida a sessao no banco, nao so no navegador', async () => {
  const efemera = await contaLogada('Efemera', 'pierre+c@lojadoecommerce.com.br');
  assert.equal((await pedir('/api/eu', { cookie: efemera.cookie })).status, 200);
  await pedir('/api/sair', { metodo: 'POST', cookie: efemera.cookie });
  assert.equal((await pedir('/api/eu', { cookie: efemera.cookie })).status, 401);
});

test('o endpoint publico recusa lead sem consentimento', async () => {
  await repo.salvarFluxo(contaA.id, lojaA.conexao.id, {
    convite: 'Ganhe 10% na primeira compra',
    consentimento: 'Ao continuar, voce concorda que a MX Kids use seus dados para entrar em contato sobre esta compra.',
    desconto: 10,
    perguntas: [{ texto: 'Pra quem voce esta comprando?', opcoes: ['Meu filho', 'Minha filha', 'Presente', 'Pra mim'] }],
  });
  const r = await pedir(`/w/lead/${lojaA.conexao.chave_publica}`, {
    metodo: 'POST',
    corpo: { nome: 'Renata', email: 'renata@teste.com.br', consentimento: false },
  });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /consentimento/);
});

test('chave de loja inexistente para em 404 antes de qualquer trabalho', async () => {
  const r = await pedir('/w/fluxo/pk_naoexiste', {});
  assert.equal(r.status, 404);
});

test('o endpoint publico corta por limite de requisicoes', async () => {
  const chave = lojaB.conexao.chave_publica;
  let bloqueou = false;
  for (let i = 0; i < 15; i += 1) {
    const r = await pedir(`/w/lead/${chave}`, {
      metodo: 'POST', corpo: { nome: 'Robo', email: 'r@x.com', consentimento: true },
    });
    if (r.status === 429) { bloqueou = true; break; }
  }
  assert.ok(bloqueou, 'o teto por IP tinha que ter cortado antes de 15 tentativas');
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
