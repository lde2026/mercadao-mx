import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste, conexaoDeTeste } from './ajuda.js';

const { pool } = await import('../src/db.js');
const { costurarEventos, registrarEvento, perfilDoLead, mascararIp } =
  await import('../src/eventos.js');
const repo = await import('../src/repositorio.js');

await prepararBanco();

/**
 * Erro aqui vaza a navegacao de uma pessoa no perfil de outra, entao os casos
 * de vazamento valem mais que o caso feliz.
 */

async function cenario() {
  const contaA = await contaDeTeste('Bella Moda', `a-${Date.now()}@teste.com.br`);
  const contaB = await contaDeTeste('Casa Verde Decor', `b-${Date.now()}@teste.com.br`);
  const lojaA = await conexaoDeTeste(contaA.id, 'nuvemshop', 'Bella Moda');
  const lojaB = await conexaoDeTeste(contaB.id, 'tray', 'Casa Verde Decor');
  return { contaA, contaB, lojaA, lojaB };
}

function leadDe(conexao, nome, anonimoId) {
  return repo.criarLead({
    contaId: conexao.conta_id, conexaoId: conexao.id,
    nome, email: `${nome.toLowerCase()}@teste.com.br`, telefone: '41999990000',
    respostas: [{ pergunta: 'Qual o seu tamanho?', resposta: 'M' }],
    anonimoId, redeMascarada: '189.45.201.0/24',
  });
}

test('costura atribui a navegacao anonima ao lead que se identificou', async () => {
  const { lojaA } = await cenario();
  const anonimo = 'anon-visitante-1';

  await registrarEvento({ conexao: lojaA, anonimoId: anonimo, tipo: 'pagina',
    url: 'https://bellamoda.com.br/', titulo: 'Bella Moda', ip: '189.45.201.77' });
  await registrarEvento({ conexao: lojaA, anonimoId: anonimo, tipo: 'produto',
    url: 'https://bellamoda.com.br/vestido-midi-floral', titulo: 'Vestido Midi Floral', ip: '189.45.201.77' });

  const lead = await leadDe(lojaA, 'Renata', anonimo);
  const costurados = await costurarEventos({
    conexaoId: lojaA.id, anonimoId: anonimo, leadId: lead.id, contaId: lojaA.conta_id,
  });

  assert.equal(costurados, 2);
  const perfil = await perfilDoLead(lojaA.conta_id, lead.id);
  assert.equal(perfil.linhaDoTempo.length, 2);
  assert.equal(perfil.linhaDoTempo[1].titulo, 'Vestido Midi Floral');
});

test('costura nao alcanca outra loja mesmo com o mesmo anonimo_id', async () => {
  const { lojaA, lojaB } = await cenario();
  const anonimo = 'anon-mesmo-navegador';

  await registrarEvento({ conexao: lojaA, anonimoId: anonimo, tipo: 'produto',
    url: 'https://bellamoda.com.br/blusa-de-linho', titulo: 'Blusa de Linho', ip: '189.45.201.77' });
  await registrarEvento({ conexao: lojaB, anonimoId: anonimo, tipo: 'produto',
    url: 'https://casaverdedecor.com.br/luminaria-de-mesa', titulo: 'Luminaria de Mesa', ip: '189.45.201.77' });

  const leadA = await leadDe(lojaA, 'Renata', anonimo);
  await costurarEventos({
    conexaoId: lojaA.id, anonimoId: anonimo, leadId: leadA.id, contaId: lojaA.conta_id,
  });

  const perfil = await perfilDoLead(lojaA.conta_id, leadA.id);
  assert.equal(perfil.linhaDoTempo.length, 1);
  assert.equal(perfil.linhaDoTempo[0].titulo, 'Blusa de Linho');

  const { rows } = await pool.query(
    `select lead_id from eventos where conexao_id = $1`, [lojaB.id],
  );
  assert.equal(rows[0].lead_id, null, 'evento da loja B nao pode receber lead da loja A');
});

test('costura nao rouba evento ja atribuido a outro lead', async () => {
  const { lojaA } = await cenario();
  const anonimo = 'anon-navegador-compartilhado';

  await registrarEvento({ conexao: lojaA, anonimoId: anonimo, tipo: 'produto',
    url: 'https://bellamoda.com.br/jaqueta-jeans', titulo: 'Jaqueta Jeans', ip: '189.45.201.77' });

  const primeiro = await leadDe(lojaA, 'Renata', anonimo);
  await costurarEventos({
    conexaoId: lojaA.id, anonimoId: anonimo, leadId: primeiro.id, contaId: lojaA.conta_id,
  });

  // Segunda pessoa no mesmo computador, cenario real de loja de shopping e
  // de casa com um PC so.
  const segundo = await leadDe(lojaA, 'Marcos', anonimo);
  const roubados = await costurarEventos({
    conexaoId: lojaA.id, anonimoId: anonimo, leadId: segundo.id, contaId: lojaA.conta_id,
  });

  assert.equal(roubados, 0, 'nenhum evento pode mudar de dono');
  const perfilPrimeiro = await perfilDoLead(lojaA.conta_id, primeiro.id);
  const perfilSegundo = await perfilDoLead(lojaA.conta_id, segundo.id);
  assert.equal(perfilPrimeiro.linhaDoTempo.length, 1);
  assert.equal(perfilSegundo.linhaDoTempo.length, 0);
});

test('costura recusa chamada sem escopo de conta ou conexao', async () => {
  const { lojaA } = await cenario();
  const lead = await leadDe(lojaA, 'Renata', 'anon-x');
  await assert.rejects(
    () => costurarEventos({ anonimoId: 'anon-x', leadId: lead.id, contaId: lojaA.conta_id }),
    /exige conexaoId/,
  );
});

test('perfil do lead da conta A nao abre para a conta B', async () => {
  const { contaB, lojaA } = await cenario();
  const lead = await leadDe(lojaA, 'Renata', 'anon-y');
  assert.equal(await perfilDoLead(contaB.id, lead.id), null);
});

test('evento nunca guarda o IP inteiro', async () => {
  const { lojaA } = await cenario();
  await registrarEvento({ conexao: lojaA, anonimoId: 'anon-z', tipo: 'pagina',
    url: 'https://bellamoda.com.br/', ip: '189.45.201.77' });
  const { rows } = await pool.query(
    `select rede_mascarada from eventos where anonimo_id = 'anon-z'`,
  );
  assert.equal(rows[0].rede_mascarada, '189.45.201.0/24');
  assert.ok(!rows[0].rede_mascarada.includes('.77'));
  assert.equal(mascararIp('2804:14d:5c81:8a00::1'), '2804:14d:5c81::/48');
});

test.after(() => pool.end());
