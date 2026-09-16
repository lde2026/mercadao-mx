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
 * Formato e posicao do botao flutuante.
 *
 * O valor errado aqui nao estoura: o widget so desenha o botao num canto que
 * o lojista nao escolheu, na loja dele, e ele descobre por reclamacao de
 * cliente. Por isso o teste cobre o caminho inteiro, do salvar ate o que o
 * widget recebe, e cobre tambem o padrao de quem nunca mexeu nisso.
 */

const conta = await contaDeTeste('Loja do E-commerce', 'pierre+b@lojadoecommerce.com.br');
const loja = await conexaoDeTeste(conta.id, 'nuvemshop', 'Bella Moda', { store_id: '1' });

const CONSENTIMENTO = 'Ao continuar, você concorda que a Bella Moda use seus dados para entrar em contato.';

function entrar() {
  return fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'pierre+b@lojadoecommerce.com.br', senha: 'senha-de-teste-123' }),
  }).then((r) => r.headers.get('set-cookie').split(';')[0]);
}

const cookie = await entrar();

function salvar(corpo) {
  return fetch(`${base}/api/conexoes/${loja.id}/fluxo`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      convite: 'Ganhe benefícios',
      consentimento: CONSENTIMENTO,
      desconto: 10,
      perguntas: [],
      ...corpo,
    }),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
}

function fluxoDoWidget() {
  return fetch(`${base}/w/fluxo/${loja.chave_publica}`).then((r) => r.json());
}

test('quem nunca mexeu fica com o botao de sempre', async () => {
  // Retangular no canto inferior direito e o que as lojas ja instaladas tem.
  // Um padrao diferente mudaria a cara da loja dos clientes num deploy.
  assert.equal((await salvar({})).status, 200);
  const fluxo = await fluxoDoWidget();
  assert.equal(fluxo.botaoFormato, 'retangular');
  assert.equal(fluxo.botaoPosicao, 'direita-inferior');
});

test('formato e posicao escolhidos chegam ate o widget', async () => {
  assert.equal((await salvar({ botaoFormato: 'redondo', botaoPosicao: 'esquerda-central' })).status, 200);
  const fluxo = await fluxoDoWidget();
  assert.equal(fluxo.botaoFormato, 'redondo');
  assert.equal(fluxo.botaoPosicao, 'esquerda-central');

  // E continua valendo depois de recarregar o construtor no painel.
  const salvo = await repo.fluxoDaConexao(conta.id, loja.id);
  assert.equal(salvo.botao_formato, 'redondo');
  assert.equal(salvo.botao_posicao, 'esquerda-central');
});

test('as seis posicoes sao aceitas', async () => {
  for (const lado of ['direita', 'esquerda']) {
    for (const altura of ['inferior', 'central', 'superior']) {
      const posicao = `${lado}-${altura}`;
      assert.equal((await salvar({ botaoPosicao: posicao })).status, 200, `${posicao} tinha que ser aceita`);
      assert.equal((await fluxoDoWidget()).botaoPosicao, posicao);
    }
  }
});

test('valor inventado volta 400 e nao chega ao banco', async () => {
  await salvar({ botaoFormato: 'redondo', botaoPosicao: 'direita-superior' });

  const formato = await salvar({ botaoFormato: 'triangular' });
  assert.equal(formato.status, 400);
  const posicao = await salvar({ botaoPosicao: 'meio-do-nada' });
  assert.equal(posicao.status, 400);

  // 400 e nao 500: o check do banco existe, mas quem responde e a rota, com
  // explicacao. E o fluxo bom nao pode ter sido sobrescrito pela tentativa.
  const fluxo = await fluxoDoWidget();
  assert.equal(fluxo.botaoFormato, 'redondo');
  assert.equal(fluxo.botaoPosicao, 'direita-superior');
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
