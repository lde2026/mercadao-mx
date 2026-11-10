import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';

const { pool } = await import('../src/db.js');
await prepararBanco();
const atendimento = await import('../src/atendimento.js');

/**
 * Base de conhecimento do atendimento: dados e historico.
 *
 * Duas coisas aqui doem de verdade. A primeira e o isolamento: esta base vira
 * o prompt de um agente que fala com o cliente final, entao base trocada e a
 * loja A respondendo com o prazo de entrega e a politica de troca da loja B,
 * no WhatsApp, para um cliente de verdade.
 *
 * A segunda e o historico. Ele so serve se guardar o estado ANTERIOR, e se
 * restaurar nao apagar nada: quem restaura esta consertando um erro, e e o
 * pior momento para descobrir que a volta tambem e irreversivel.
 */

const contaA = await contaDeTeste('Bella Moda', 'pierre+at-a@lojadoecommerce.com.br');
const contaB = await contaDeTeste('Casa Verde', 'pierre+at-b@lojadoecommerce.com.br');

test('a base nasce vazia na primeira leitura, uma por conta', async () => {
  const primeira = await atendimento.base(contaA.id);
  assert.ok(primeira.id);
  assert.equal(primeira.nome_loja, '');
  assert.deepEqual(primeira.prazos_entrega, []);
  assert.equal(primeira.frete_gratis_acima, null);

  // Ler de novo devolve a mesma base, nao uma segunda: duas bases para a
  // mesma loja e o agente respondendo por uma enquanto o lojista edita a
  // outra.
  const segunda = await atendimento.base(contaA.id);
  assert.equal(segunda.id, primeira.id);
});

test('campo que nao existe nao vira coluna, e lista torta vira lista limpa', async () => {
  await atendimento.base(contaA.id);
  const salva = await atendimento.salvar(contaA.id, {
    nomeLoja: '  Bella Moda  ',
    formasPagamento: ['Pix', '', '   ', 'Cartão em até 12x'],
    prazosEntrega: [
      { regiao: 'Sudeste', prazo: '2 a 4 dias úteis' },
      { regiao: '', prazo: '' },
      { regiao: 'Norte', prazo: '7 a 12 dias úteis' },
    ],
    freteGratisAcima: '299,90',
    // Nem o formulario nem o modelo de linguagem decidem o que existe.
    inventado: 'nao deveria entrar',
    conta_id: '00000000-0000-0000-0000-000000000000',
  });

  assert.equal(salva.nome_loja, 'Bella Moda');
  assert.deepEqual(salva.formas_pagamento, ['Pix', 'Cartão em até 12x']);
  assert.equal(salva.prazos_entrega.length, 2);
  assert.equal(salva.frete_gratis_acima, 299.9);
  assert.equal(salva.conta_id, contaA.id, 'conta_id do corpo nao pode trocar o dono da base');
  assert.equal(salva.inventado, undefined);
});

test('frete gratis nulo e diferente de zero', async () => {
  // Nulo e "a loja nao tem frete gratis". Zero e "frete gratis em qualquer
  // valor". O agente responde coisas opostas nos dois casos.
  await atendimento.salvar(contaA.id, { freteGratisAcima: 0 });
  assert.equal((await atendimento.base(contaA.id)).frete_gratis_acima, 0);

  await atendimento.salvar(contaA.id, { freteGratisAcima: null });
  assert.equal((await atendimento.base(contaA.id)).frete_gratis_acima, null);

  // Texto que nao e numero vira nulo, nunca um valor inventado.
  await atendimento.salvar(contaA.id, { freteGratisAcima: 'de graça' });
  assert.equal((await atendimento.base(contaA.id)).frete_gratis_acima, null);
});

test('cada gravacao guarda o estado anterior, nao o novo', async () => {
  await atendimento.salvar(contaA.id, { horarioAtendimento: 'Seg a sex, 9h as 18h' });
  await atendimento.salvar(contaA.id, { horarioAtendimento: 'Todo dia, 8h as 20h' });

  const lista = await atendimento.versoes(contaA.id);
  // A mais recente guarda o que havia imediatamente antes da ultima troca.
  assert.equal(lista[0].conteudo.horarioAtendimento, 'Seg a sex, 9h as 18h');
  assert.equal((await atendimento.base(contaA.id)).horario_atendimento, 'Todo dia, 8h as 20h');
});

test('restaurar volta o valor e nao apaga o historico', async () => {
  const lista = await atendimento.versoes(contaA.id);
  const antes = lista.length;
  const alvo = lista.find((v) => v.conteudo.horarioAtendimento === 'Seg a sex, 9h as 18h');

  const volta = await atendimento.restaurar(contaA.id, alvo.id, { autorEmail: 'dona@loja.com.br' });
  assert.equal(volta.horario_atendimento, 'Seg a sex, 9h as 18h');

  const depois = await atendimento.versoes(contaA.id);
  assert.equal(depois.length, antes + 1, 'restaurar tem que virar mais uma versao');
  assert.equal(depois[0].origem, 'restauracao');
  // E a volta tambem e reversivel: quem restaura esta consertando um erro.
  assert.equal(depois[0].conteudo.horarioAtendimento, 'Todo dia, 8h as 20h');
});

test('uma conta nao le, nao grava e nao restaura a base da outra', async () => {
  await atendimento.salvar(contaA.id, { politicaTroca: 'Trocas em 30 dias' });
  await atendimento.base(contaB.id);
  await atendimento.salvar(contaB.id, { politicaTroca: 'Trocas em 7 dias' });

  assert.equal((await atendimento.base(contaA.id)).politica_troca, 'Trocas em 30 dias');
  assert.equal((await atendimento.base(contaB.id)).politica_troca, 'Trocas em 7 dias');

  // O historico de uma nao aparece na outra.
  const daB = await atendimento.versoes(contaB.id);
  assert.ok(daB.every((v) => v.conteudo.politicaTroca !== 'Trocas em 30 dias'));

  // E a versao da A, com id na mao, nao restaura dentro da B: saber o id de
  // uma versao nao significa ser dono dela.
  const daA = await atendimento.versoes(contaA.id);
  assert.equal(await atendimento.restaurar(contaB.id, daA[0].id), null);
  assert.equal((await atendimento.base(contaB.id)).politica_troca, 'Trocas em 7 dias');
});

test('salvar numa conta sem base nao cria base nem versao', async () => {
  // Conta inexistente nao pode virar base orfa pelo caminho da gravacao.
  const fantasma = '00000000-0000-0000-0000-000000000000';
  assert.equal(await atendimento.salvar(fantasma, { nomeLoja: 'Fantasma' }), null);
  assert.equal((await atendimento.versoes(fantasma)).length, 0);
});

test.after(async () => {
  await pool.end();
});
