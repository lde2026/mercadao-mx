import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';
process.env.URL_PUBLICA = 'http://localhost:3000';

/*
 * Os dois avisos do atendimento.
 *
 * O pior caso deste produto nao da erro em tela nenhuma: o lojista assume uma
 * conversa, fecha o painel e esquece. Do lado de fora fica um consumidor
 * esperando uma loja que acha que esta atendendo. Nenhuma tela grita sozinha,
 * entao quem grita e isto aqui.
 */

const { pool, consultar } = await import('../src/db.js');
await prepararBanco();
const repo = await import('../src/repositorio.js');
const tarefas = await import('../src/tarefas.js');

const loja = await contaDeTeste('Mx Kids', 'mx@teste.local');
await consultar('update contas set modulo_atendimento = true where id = $1', [loja.id]);

async function conversaCom(cliente, falas) {
  let atend = null;
  for (const [direcao, texto] of falas) {
    atend = await repo.registrarFala(loja.id, { cliente, direcao, texto });
  }
  return atend;
}

function envelhecer(id, minutos) {
  return consultar(
    `update atendimentos set ultima_em = now() - make_interval(mins => $2) where id = $1`,
    [id, minutos],
  );
}

test('conversa assumida, com o cliente falando por ultimo, vira aviso', async () => {
  const atend = await conversaCom('41988887777', [
    ['cliente', 'Oi, queria trocar a cor'],
    ['humano', 'Oi! Deixa eu ver aqui'],
    ['cliente', 'Beleza, fico no aguardo'],
  ]);
  await repo.definirEstadoAtendimento(loja.id, atend.id, 'humano');
  await envelhecer(atend.id, 40);

  const esperando = await repo.conversasEsperandoLojista(15);
  assert.equal(esperando.length, 1);
  assert.equal(esperando[0].id, atend.id);

  const fecho = await tarefas.avisarConversasParadas(15);
  assert.equal(fecho.avisadas, 1);

  // Avisado uma vez, nao avisa de novo na rodada seguinte: a tarefa roda a
  // cada dez minutos e viraria perseguicao.
  const denovo = await repo.conversasEsperandoLojista(15);
  assert.equal(denovo.length, 0);
});

test('se o cliente escrever de novo, o aviso volta', async () => {
  const lista = await repo.listarAtendimentos(loja.id);
  const atend = lista.find((a) => a.cliente === '5541988887777');

  await repo.registrarFala(loja.id, {
    cliente: '41988887777', direcao: 'cliente', texto: 'Alguem ai?',
  });
  // O aviso foi mandado antes de o cliente escrever de novo, que e a ordem
  // real: avisamos, ele insistiu, e a bola voltou para o lojista.
  await consultar(
    `update atendimentos set avisado_em = now() - interval '2 hours' where id = $1`,
    [atend.id],
  );
  await envelhecer(atend.id, 30);

  const esperando = await repo.conversasEsperandoLojista(15);
  assert.equal(esperando.length, 1, 'mensagem nova depois do aviso merece aviso novo');
});

test('conversa com a IA nao gera aviso: nao ha ninguem esperando', async () => {
  const atend = await conversaCom('41977776666', [
    ['cliente', 'Qual o prazo?'],
    ['agente', 'De 5 a 10 dias uteis.'],
    ['cliente', 'Obrigado'],
  ]);
  await envelhecer(atend.id, 90);

  const esperando = await repo.conversasEsperandoLojista(15);
  assert.ok(!esperando.some((c) => c.id === atend.id), 'quem responde ali e o agente');
});

test('se o lojista ja respondeu por ultimo, ninguem esta esperando', async () => {
  const atend = await conversaCom('41955554444', [
    ['cliente', 'Tem desconto?'],
    ['humano', 'Tenho sim, me chama no privado'],
  ]);
  await repo.definirEstadoAtendimento(loja.id, atend.id, 'humano');
  await envelhecer(atend.id, 120);

  const esperando = await repo.conversasEsperandoLojista(15);
  assert.ok(!esperando.some((c) => c.id === atend.id), 'a bola esta com o cliente, nao com a loja');
});

test('conversa recente nao vira aviso: ele pode estar digitando', async () => {
  const atend = await conversaCom('41944443333', [['cliente', 'Oi']]);
  await repo.definirEstadoAtendimento(loja.id, atend.id, 'humano');

  const esperando = await repo.conversasEsperandoLojista(15);
  assert.ok(!esperando.some((c) => c.id === atend.id));
});

test('a conta e marcada como ativada uma vez so', async () => {
  const primeira = await repo.marcarAtivada(loja.id);
  assert.ok(primeira, 'a primeira vez devolve a conta, e e ela que vira aviso');
  assert.equal(primeira.nome, 'Mx Kids');

  const segunda = await repo.marcarAtivada(loja.id);
  assert.equal(segunda, null, 'editar a base de novo nao pode reavisar');
});

test.after(async () => {
  await pool.end();
});
