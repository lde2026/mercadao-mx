import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';
process.env.URL_PUBLICA = 'http://localhost:3000';

/*
 * O resumo da semana.
 *
 * Ele sai por e-mail e nao da para voltar atras, entao a conta tem que
 * aparecer no proprio resumo e em mais nenhum. E ele nao pode sair para quem
 * nao usou nada: relatorio de zero atras de zero ensina a pessoa a marcar
 * como spam, e aí o e-mail do mes que vendeu tambem nao e lido.
 */

const { pool, consultar } = await import('../src/db.js');
await prepararBanco();
const repo = await import('../src/repositorio.js');
const { resumoDaSemana, valeMandar } = await import('../src/relatorio.js');
const tarefas = await import('../src/tarefas.js');

const lojaA = await contaDeTeste('Mx Kids', 'mx@teste.local');
const lojaB = await contaDeTeste('Vizinha', 'vizinha@teste.local');
await consultar('update contas set modulo_atendimento = true where id in ($1, $2)', [lojaA.id, lojaB.id]);

await repo.registrarFala(lojaA.id, { cliente: '41988887777', direcao: 'cliente', texto: 'Oi' });
await repo.registrarFala(lojaA.id, { cliente: '41977776666', direcao: 'cliente', texto: 'Prazo?' });
await repo.registrarFala(lojaB.id, { cliente: '41911112222', direcao: 'cliente', texto: 'Da vizinha' });

test('o resumo conta so o que e da conta', async () => {
  const minha = await resumoDaSemana(lojaA.id);
  assert.equal(minha.conversas, 2);

  const dela = await resumoDaSemana(lojaB.id);
  assert.equal(dela.conversas, 1, 'o resumo de uma loja nao pode somar a conversa da outra');
});

test('conversa assumida aparece como esperando o lojista', async () => {
  const lista = await repo.listarAtendimentos(lojaA.id);
  await repo.definirEstadoAtendimento(lojaA.id, lista[0].id, 'humano');

  const resumo = await resumoDaSemana(lojaA.id);
  assert.equal(resumo.comVoce, 1);
});

test('conta que conversou vale o e-mail; conta parada nao', async () => {
  assert.equal(valeMandar(await resumoDaSemana(lojaA.id)), true);

  const parada = await contaDeTeste('Parada', 'parada@teste.local');
  assert.equal(valeMandar(await resumoDaSemana(parada.id)), false,
    'semana zerada atras de semana zerada nao vira e-mail');
});

test('fora da janela de segunda de manha nao sai nada', async () => {
  const terca = new Date('2026-11-17T09:00:00');
  const fora = await tarefas.enviarResumosDaSemana(terca);
  assert.equal(fora.enviados, 0);
  assert.equal(fora.motivo, 'fora da janela');

  const madrugada = new Date('2026-11-16T03:00:00');
  assert.equal((await tarefas.enviarResumosDaSemana(madrugada)).motivo, 'fora da janela');
});

test('na janela, cada conta recebe uma vez so na semana', async () => {
  const segunda = new Date('2026-11-16T09:00:00');
  const primeira = await tarefas.enviarResumosDaSemana(segunda);
  assert.ok(primeira.enviados >= 1);

  // A tarefa roda de hora em hora: rodar de novo nao pode mandar outro.
  const segundaVez = await tarefas.enviarResumosDaSemana(segunda);
  assert.equal(segundaVez.enviados, 0);

  // Inclusive a conta parada fica marcada, senao seria relida toda hora.
  const parada = await consultar(
    `select relatorio_em from contas where email = 'parada@teste.local'`,
  );
  assert.ok(parada.rows[0].relatorio_em, 'marcar sem mandar evita reler a conta parada');
});

test('quem desligou nas configuracoes nao entra na lista', async () => {
  await consultar(`update contas set relatorio_semanal = false, relatorio_em = null`);
  const contas = await repo.contasParaRelatorio();
  assert.equal(contas.length, 0);
});

test.after(async () => {
  await pool.end();
});
