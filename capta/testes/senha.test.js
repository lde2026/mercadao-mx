import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste } from './ajuda.js';

const { pool, consultar } = await import('../src/db.js');
const repo = await import('../src/repositorio.js');
const { conferirSenha } = await import('../src/cripto.js');

await prepararBanco();

/**
 * Recuperacao de senha e porta de entrada sem senha, entao o que se testa e
 * o que nao pode acontecer: token de e-mail inexistente, token usado duas
 * vezes, token vencido e sessao antiga sobrevivendo a troca.
 */

test('e-mail desconhecido nao gera token e a resposta nao denuncia isso', async () => {
  assert.equal(await repo.criarRecuperacaoSenha('ninguem@teste.com.br'), null);
});

test('token troca a senha uma vez so e derruba as sessoes antigas', async () => {
  const email = `rec-${Date.now()}@teste.com.br`;
  const conta = await contaDeTeste('Loja Rec', email);
  const sessao = await repo.criarSessao(conta.id);
  assert.ok(await repo.buscarSessao(sessao));

  const recuperacao = await repo.criarRecuperacaoSenha(email);
  assert.equal(recuperacao.conta.id, conta.id);
  assert.match(recuperacao.token, /^[0-9a-f]{64}$/);

  const { rows } = await consultar('select token_hash from recuperacoes_senha where conta_id = $1', [conta.id]);
  assert.notEqual(rows[0].token_hash, recuperacao.token, 'o banco guarda o hash, nunca o token');

  assert.equal(await repo.usarRecuperacaoSenha(recuperacao.token, 'senha-nova-123'), conta.id);
  const { rows: contas } = await consultar('select senha_hash from contas where id = $1', [conta.id]);
  assert.ok(conferirSenha('senha-nova-123', contas[0].senha_hash));
  assert.equal(await repo.buscarSessao(sessao), null, 'sessao antiga nao sobrevive');

  assert.equal(await repo.usarRecuperacaoSenha(recuperacao.token, 'outra-senha-456'), null, 'segundo uso e recusado');
  assert.equal(await repo.usarRecuperacaoSenha('0'.repeat(64), 'outra-senha-456'), null, 'token inventado e recusado');
});

test('token vencido nao troca a senha', async () => {
  const email = `venc-${Date.now()}@teste.com.br`;
  await contaDeTeste('Loja Venc', email);
  const recuperacao = await repo.criarRecuperacaoSenha(email, 0);
  assert.equal(await repo.usarRecuperacaoSenha(recuperacao.token, 'senha-nova-123'), null);
});

test('configuracoes da conta so aceitam os campos previstos', async () => {
  const email = `cfg-${Date.now()}@teste.com.br`;
  const conta = await contaDeTeste('Loja Cfg', email);
  const atualizada = await repo.atualizarConta(conta.id, {
    nome: 'Loja Nova', whatsapp: '41999990000', email_aviso: 'equipe@teste.com.br',
    avisar_lead: false, email: 'hacker@teste.com.br', senha_hash: 'x',
  });
  assert.equal(atualizada.nome, 'Loja Nova');
  assert.equal(atualizada.whatsapp, '41999990000');
  assert.equal(atualizada.avisar_lead, false);
  assert.equal(atualizada.email, email, 'e-mail de login nao muda por aqui');
});

test.after(() => pool.end());
