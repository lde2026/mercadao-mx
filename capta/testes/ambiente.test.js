import test from 'node:test';
import assert from 'node:assert/strict';
import { conferirAmbiente } from '../src/ambiente.js';

/**
 * Chave ausente que so aparece no primeiro login de cliente e pior do que
 * deploy que nao sobe. O que se testa aqui e a fronteira: o que derruba o
 * processo e o que apenas desliga um recurso.
 */

const CHAVE = 'a'.repeat(64);
const SEGREDO = 's'.repeat(40);

function conferir(env, producao = false) {
  const guardado = { ...process.env };
  for (const nome of Object.keys(process.env)) {
    if (/^(DATABASE_URL|CHAVE_CREDENCIAIS|SEGREDO_SESSAO|URL_PUBLICA|OPERADOR_EMAILS|EMAIL_PROVEDOR|ASAAS_)/.test(nome)) {
      delete process.env[nome];
    }
  }
  Object.assign(process.env, env);
  try {
    return conferirAmbiente({ producao });
  } finally {
    for (const nome of Object.keys(process.env)) delete process.env[nome];
    Object.assign(process.env, guardado);
  }
}

const COMPLETO = {
  DATABASE_URL: 'postgres://x', CHAVE_CREDENCIAIS: CHAVE, SEGREDO_SESSAO: SEGREDO,
  URL_PUBLICA: 'https://captapp.lojadoecommerce.com.br',
  OPERADOR_EMAILS: 'contato@lojadoecommerce.com.br', EMAIL_PROVEDOR: 'resend',
};

test('ambiente completo nao para nem avisa', () => {
  const { paradas, avisos } = conferir(COMPLETO);
  assert.deepEqual(paradas, []);
  // Asaas ausente e escolha, nao defeito: a cobranca fica manual.
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /ASAAS_API_KEY/);
});

test('sem o que cifra credencial ou assina sessao, o processo nao sobe', () => {
  for (const faltando of ['DATABASE_URL', 'CHAVE_CREDENCIAIS', 'SEGREDO_SESSAO']) {
    const env = { ...COMPLETO };
    delete env[faltando];
    const { paradas } = conferir(env);
    assert.ok(paradas.some((p) => p.startsWith(faltando)), `${faltando} tinha que parar o boot`);
  }
});

test('chave de tamanho errado e recusada, e a mensagem diz como gerar', () => {
  const { paradas } = conferir({ ...COMPLETO, CHAVE_CREDENCIAIS: 'curta' });
  assert.equal(paradas.length, 1);
  assert.match(paradas[0], /hexadecimal/);
  assert.match(paradas[0], /randomBytes/);
});

test('segredo de sessao curto e recusado', () => {
  const { paradas } = conferir({ ...COMPLETO, SEGREDO_SESSAO: 'curto' });
  assert.ok(paradas.some((p) => p.startsWith('SEGREDO_SESSAO')));
});

test('as duas chaves iguais param o boot em producao', () => {
  const { paradas } = conferir({ ...COMPLETO, SEGREDO_SESSAO: CHAVE }, true);
  assert.ok(paradas.some((p) => /iguais/.test(p)));
});

test('em producao a url publica tem que ser https', () => {
  const { paradas } = conferir({ ...COMPLETO, URL_PUBLICA: 'http://captapp.lojadoecommerce.com.br' }, true);
  assert.ok(paradas.some((p) => p.startsWith('URL_PUBLICA')));
  // Fora de producao, http e o normal do ambiente local.
  assert.deepEqual(conferir({ ...COMPLETO, URL_PUBLICA: 'http://localhost:3000' }).paradas, []);
});

test('Asaas com chave e sem token de webhook para o boot', () => {
  const { paradas } = conferir({ ...COMPLETO, ASAAS_API_KEY: 'x' });
  assert.equal(paradas.length, 1);
  assert.match(paradas[0], /ASAAS_WEBHOOK_TOKEN/);
});

test('e-mail e operador ausentes apenas avisam', () => {
  const env = { ...COMPLETO };
  delete env.EMAIL_PROVEDOR; delete env.OPERADOR_EMAILS;
  const { paradas, avisos } = conferir(env);
  assert.deepEqual(paradas, []);
  assert.ok(avisos.some((a) => /EMAIL_PROVEDOR/.test(a)));
  assert.ok(avisos.some((a) => /OPERADOR_EMAILS/.test(a)));
});
