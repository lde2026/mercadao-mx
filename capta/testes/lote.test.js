import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste, conexaoDeTeste } from './ajuda.js';

const { pool, consultar } = await import('../src/db.js');
const repo = await import('../src/repositorio.js');
const { avisarLoteBaixo } = await import('../src/avisos.js');

await prepararBanco();

/**
 * Na plataforma que nao cria cupom por API, o lote e o estoque da recompensa.
 * Se ele zera sem ninguem avisar, o lead ouve a promessa e nao recebe nada,
 * e a reclamacao vai direto para o lojista. O aviso antes de zerar e o que
 * evita isso, e ele nao pode virar um e-mail por lead.
 */

async function lojaComLote(quantos) {
  const conta = await contaDeTeste('Pet Cia', `lote-${Date.now()}-${Math.random()}@teste.com.br`);
  const loja = await conexaoDeTeste(conta.id, 'loja_integrada', 'Pet Cia');
  const codigos = Array.from({ length: quantos }, (_, i) => `PET-${String(i).padStart(4, '0')}`);
  if (codigos.length) await repo.adicionarAoLote(conta.id, loja.id, codigos);
  return { conta, loja };
}

async function alertasDeLote(contaId) {
  const { rows } = await consultar(
    `select mensagem, dados from alertas where conta_id = $1 and tipo = 'lote_baixo' order by criado_em`,
    [contaId],
  );
  return rows;
}

test('lote folgado nao gera alerta nenhum', async () => {
  const { conta, loja } = await lojaComLote(40);
  const saldo = await repo.saldoDoLote(conta.id, loja.id);
  assert.equal(Number(saldo.disponiveis), 40);
  assert.equal(await avisarLoteBaixo({ conexao: loja, disponiveis: 40 }), false);
  assert.equal((await alertasDeLote(conta.id)).length, 0);
});

test('lote abaixo do piso avisa uma vez so, mesmo com varios leads seguidos', async () => {
  const { conta, loja } = await lojaComLote(8);
  assert.equal(await avisarLoteBaixo({ conexao: loja, disponiveis: 8 }), true);
  // Cada lead novo chama de novo; o segundo e o terceiro nao podem virar e-mail.
  assert.equal(await avisarLoteBaixo({ conexao: loja, disponiveis: 7 }), false);
  assert.equal(await avisarLoteBaixo({ conexao: loja, disponiveis: 6 }), false);
  const alertas = await alertasDeLote(conta.id);
  assert.equal(alertas.length, 1);
  assert.match(alertas[0].mensagem, /8 codigo/);
});

test('lote zerado avisa com o texto do estrago, nao com o texto de aviso', async () => {
  const { conta, loja } = await lojaComLote(0);
  assert.equal(await avisarLoteBaixo({ conexao: loja, disponiveis: 0 }), true);
  const [alerta] = await alertasDeLote(conta.id);
  assert.match(alerta.mensagem, /zerado/);
  assert.equal(alerta.dados.conexao_id, loja.id);
});

test('duas lojas da mesma conta avisam separado', async () => {
  const { conta, loja } = await lojaComLote(5);
  const outra = await conexaoDeTeste(conta.id, 'loja_integrada', 'Pet Cia Matriz');
  assert.equal(await avisarLoteBaixo({ conexao: loja, disponiveis: 5 }), true);
  assert.equal(await avisarLoteBaixo({ conexao: outra, disponiveis: 2 }), true);
  assert.equal((await alertasDeLote(conta.id)).length, 2);
});

test('o lote de uma conta nao aparece no saldo da outra', async () => {
  const { conta, loja } = await lojaComLote(12);
  const intrusa = await contaDeTeste('Intrusa', `intrusa-${Date.now()}@teste.com.br`);
  const saldo = await repo.saldoDoLote(intrusa.id, loja.id);
  assert.equal(Number(saldo.disponiveis), 0);
  assert.equal(Number(saldo.total), 0);
  assert.equal(Number((await repo.saldoDoLote(conta.id, loja.id)).disponiveis), 12);
});

test.after(() => pool.end());
