import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco } from './ajuda.js';

const { pool, consultar } = await import('../src/db.js');
const repo = await import('../src/repositorio.js');
const { abrirBilhete } = await import('../src/oauth.js');

await prepararBanco();

/**
 * O bilhete de OAuth e o que separa "a loja autorizou" de "esta conta e dona
 * da loja". Se ele for reutilizavel, quem puser a mao nele rouba a loja do
 * cliente: sai com o token de API e passa a criar cupom na loja alheia.
 * Por isso os testes aqui sao todos sobre o que NAO pode funcionar.
 */

const CREDENCIAIS = {
  api_address: 'https://loja.commercesuite.com.br/web_api',
  access_token: 'token-secreto', refresh_token: 'refresh-secreto', store_id: '391250',
};

test('a credencial fica no banco cifrada, e o bilhete e so um id opaco', async () => {
  const id = await repo.guardarConexaoPendente({ plataforma: 'tray', credenciais: CREDENCIAIS });
  assert.match(id, /^[0-9a-f-]{36}$/i, 'o bilhete tem que ser um id, nao um blob');

  const { rows } = await consultar('select credenciais from conexoes_pendentes where id = $1', [id]);
  assert.doesNotMatch(rows[0].credenciais, /token-secreto/, 'o token nao pode estar legivel no banco');
  assert.doesNotMatch(rows[0].credenciais, /commercesuite/, 'nem o endereco da loja');
});

test('o bilhete vale uma vez so: a segunda tentativa nao devolve nada', async () => {
  const id = await repo.guardarConexaoPendente({ plataforma: 'tray', credenciais: CREDENCIAIS });

  const primeira = await repo.resgatarConexaoPendente(id);
  assert.equal(primeira.credenciais.access_token, 'token-secreto');
  assert.equal(primeira.plataforma, 'tray');

  assert.equal(await repo.resgatarConexaoPendente(id), null, 'o segundo resgate tinha que falhar');
});

test('duas contas correndo pelo mesmo bilhete: so uma leva', async () => {
  const id = await repo.guardarConexaoPendente({ plataforma: 'nuvemshop', credenciais: CREDENCIAIS });
  const tentativas = await Promise.all(
    Array.from({ length: 5 }, () => repo.resgatarConexaoPendente(id)),
  );
  assert.equal(tentativas.filter(Boolean).length, 1, 'exatamente uma tentativa pode vencer');
});

test('bilhete vencido nao vale', async () => {
  const id = await repo.guardarConexaoPendente({
    plataforma: 'tray', credenciais: CREDENCIAIS, validadeMinutos: 0,
  });
  assert.equal(await repo.resgatarConexaoPendente(id), null);
});

test('id inventado ou malformado nao derruba nem vaza', async () => {
  for (const lixo of ['', null, 'nao-e-uuid', "' or 1=1 --", '../../etc/passwd', '00000000-0000-0000-0000-000000000000']) {
    assert.equal(await repo.resgatarConexaoPendente(lixo), null, `${JSON.stringify(lixo)} tinha que ser recusado`);
  }
});

test('abrirBilhete recusa id gasto com mensagem, e nao com dado da loja', async () => {
  const id = await repo.guardarConexaoPendente({ plataforma: 'tray', credenciais: CREDENCIAIS });
  await abrirBilhete(id);
  await assert.rejects(() => abrirBilhete(id), (erro) => {
    assert.match(erro.message, /bilhete/);
    assert.doesNotMatch(erro.message, /token-secreto|commercesuite/);
    return true;
  });
});

test('a limpeza tira pendencia velha e deixa a viva em paz', async () => {
  const viva = await repo.guardarConexaoPendente({ plataforma: 'tray', credenciais: CREDENCIAIS });
  await consultar(
    `insert into conexoes_pendentes (plataforma, credenciais, expira_em, criado_em)
     values ('tray', 'v1.x.y.z', now() - interval '3 days', now() - interval '3 days')`,
  );
  const antes = await consultar('select count(*)::int as n from conexoes_pendentes');
  await repo.limparConexoesPendentes();
  const depois = await consultar('select count(*)::int as n from conexoes_pendentes');
  assert.equal(depois.rows[0].n, antes.rows[0].n - 1);
  assert.ok(await repo.resgatarConexaoPendente(viva), 'a pendencia viva tinha que sobreviver');
});

test.after(() => pool.end());
