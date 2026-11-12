import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAIXAS, FAIXA_DE_ENTRADA, EXCEDENTE, ATIVACOES,
  ehFaixa, precoDaFaixa, precoDaAtivacao, situacao, faixaPara,
} from '../src/billing/atendeai.js';

/**
 * Os precos do Atende Ai.
 *
 * Sao funcoes puras, e por isso da para prova-las sem banco e sem servidor.
 * O que se confere aqui e aritmetica de dinheiro, que e onde erro nao aparece
 * em tela nenhuma: aparece na fatura do cliente, um mes depois, e volta como
 * reclamacao.
 */

test('a faixa diz quantas mensagens cabem e quanto custa', () => {
  assert.equal(FAIXAS.essencial.mensagens, 1000);
  assert.equal(FAIXAS.essencial.mensal, 197);
  assert.equal(FAIXAS.crescimento.mensal, 397);
  assert.equal(FAIXAS.escala.mensal, 797);
  assert.equal(FAIXA_DE_ENTRADA, 'essencial');
});

test('o anual tira 20% e cobra doze meses', () => {
  const mensal = precoDaFaixa('crescimento');
  assert.equal(mensal.mensal, 397);
  assert.equal(mensal.total, 397);

  const anual = precoDaFaixa('crescimento', 'anual');
  assert.equal(anual.mensal, 317.6);
  assert.equal(anual.total, 3811.2);
  // Doze vezes o valor com desconto, e nao o cheio: preco anunciado diferente
  // do faturado e problema de consumidor, nao de codigo.
  assert.equal(anual.total, Math.round(397 * 0.8 * 12 * 100) / 100);
});

test('faixa que nao existe nao vira preco', () => {
  assert.equal(precoDaFaixa('premium'), null);
  assert.equal(ehFaixa('premium'), false);
  assert.equal(ehFaixa('escala'), true);
});

test('as duas ativacoes', () => {
  assert.equal(precoDaAtivacao('simples').valor, 997);
  assert.equal(precoDaAtivacao('acompanhada').valor, 1890);
  assert.equal(ATIVACOES.acompanhada.dias, 30);
  assert.equal(precoDaAtivacao('vitalicia'), null);
});

test('dentro da faixa nao ha excedente nem aviso', () => {
  const s = situacao(400, 'essencial');
  assert.equal(s.enviadas, 400);
  assert.equal(s.incluidas, 1000);
  assert.equal(s.sobrando, 600);
  assert.equal(s.avisar, false);
  assert.equal(s.excedente.mensagens, 0);
  assert.equal(s.excedente.valor, 0);
});

test('o aviso sai em 80%, antes da conta chegar', () => {
  assert.equal(situacao(799, 'essencial').avisar, false);
  assert.equal(situacao(800, 'essencial').avisar, true);
  assert.equal(situacao(800, 'essencial').sobrando, 200);
});

test('passou do teto, cobra o excedente', () => {
  const s = situacao(1250, 'essencial');
  assert.equal(s.sobrando, 0);
  assert.equal(s.excedente.mensagens, 250);
  assert.equal(s.excedente.valor, 37.5);
  assert.equal(s.excedente.valor, Math.round(250 * EXCEDENTE * 100) / 100);
});

test('o excedente nao acumula centavo perdido', () => {
  // Tres casas no produto virariam R$ 0,01 de diferenca por mes, para mais ou
  // para menos, e diferenca de centavo em fatura e ligacao de cliente.
  for (const n of [1, 7, 13, 333, 1667]) {
    const s = situacao(1000 + n, 'essencial');
    assert.equal(s.excedente.valor, Math.round(n * 15) / 100, `${n} mensagens`);
  }
});

test('faixa desconhecida cai na de entrada em vez de quebrar a tela', () => {
  const s = situacao(500, 'premium');
  assert.equal(s.faixa, 'essencial');
  assert.equal(s.incluidas, 1000);
});

test('sem contagem ainda, a situacao e zero e nao erro', () => {
  const s = situacao(null, 'essencial');
  assert.equal(s.enviadas, 0);
  assert.equal(s.fatia, 0);
  assert.equal(s.avisar, false);
});

test('faixaPara sugere o plano que caberia o volume', () => {
  assert.equal(faixaPara(500), 'essencial');
  assert.equal(faixaPara(1000), 'essencial');
  assert.equal(faixaPara(1001), 'crescimento');
  assert.equal(faixaPara(3000), 'crescimento');
  assert.equal(faixaPara(7999), 'escala');
  // Acima do maior plano nao existe faixa nova: ali a conversa e excedente
  // ou proposta, e nao um plano que o preco nao conhece.
  assert.equal(faixaPara(50000), 'escala');
});
