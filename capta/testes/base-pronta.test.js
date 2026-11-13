import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.CHAVE_CREDENCIAIS = process.env.CHAVE_CREDENCIAIS || 'a'.repeat(64);

const { faltaNaBase, BASE_OBRIGATORIA, OPERACIONAIS_MINIMOS } = await import('../src/atendimento.js');

/*
 * Quando a base ja da para o agente atender.
 *
 * A regra antiga era "quatro campos quaisquer", e ela deixava entrar no ar uma
 * loja que sabia o proprio tom de voz e nao sabia o que vendia. Quem paga isso
 * e o cliente final, que recebe uma resposta vazia achando que falou com a
 * loja. Funcao pura, entao da para cobrir caso a caso sem montar banco.
 */

test('nome e segmento sao obrigatorios, e nenhum outro campo substitui os dois', () => {
  const semNada = faltaNaBase({});
  assert.deepEqual(semNada.obrigatorios, BASE_OBRIGATORIA);
  assert.equal(semNada.pronta, false);

  // Cinco campos preenchidos, e nenhum deles diz quem e a loja nem o que vende.
  const enfeitada = faltaNaBase({
    tomDeVoz: 'Simpatico', observacoes: 'Qualquer coisa', perguntasFrequentes: 'Varias',
    horarioAtendimento: 'Seg a sex', politicaTroca: 'Em 7 dias',
  });
  assert.equal(enfeitada.pronta, false, 'cinco campos nao valem se faltar o nome da loja');
  assert.deepEqual(enfeitada.obrigatorios, ['nomeLoja', 'segmento']);
});

test('so nome e segmento tambem nao bastam: falta como a loja opera', () => {
  const magra = faltaNaBase({ nomeLoja: 'Mx Kids', segmento: 'Mini motos' });
  assert.deepEqual(magra.obrigatorios, []);
  assert.equal(magra.operacionaisQueFaltam, OPERACIONAIS_MINIMOS);
  assert.equal(magra.pronta, false);

  const quase = faltaNaBase({
    nomeLoja: 'Mx Kids', segmento: 'Mini motos', horarioAtendimento: 'Seg a sex, 9h as 18h',
  });
  assert.equal(quase.operacionaisQueFaltam, 1);
  assert.equal(quase.pronta, false);
});

test('nome, segmento e dois operacionais ja atendem', () => {
  const pronta = faltaNaBase({
    nomeLoja: 'Mx Kids', segmento: 'Mini motos',
    horarioAtendimento: 'Seg a sex, 9h as 18h', politicaTroca: 'Troca em ate 7 dias.',
  });
  assert.equal(pronta.pronta, true);
  assert.deepEqual(pronta.obrigatorios, []);
  assert.equal(pronta.operacionaisQueFaltam, 0);
});

test('lista vazia nao conta como campo preenchido', () => {
  const vazia = faltaNaBase({
    nomeLoja: 'Mx Kids', segmento: 'Mini motos',
    formasPagamento: [], prazosEntrega: [], linkSite: 'https://mxkids.com.br',
  });
  assert.equal(vazia.operacionaisQueFaltam, 1, 'lista vazia e campo em branco, nao campo respondido');

  const cheia = faltaNaBase({
    nomeLoja: 'Mx Kids', segmento: 'Mini motos',
    formasPagamento: ['Pix'], linkSite: 'https://mxkids.com.br',
  });
  assert.equal(cheia.pronta, true);
});
