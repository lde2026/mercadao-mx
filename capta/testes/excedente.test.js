import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepararBanco, contaDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';

/*
 * O fecho do excedente.
 *
 * E a unica parte da cobranca em que o valor e calculado por nos e nao por
 * tabela, e ela roda sozinha de seis em seis horas. Errar aqui e mandar a
 * fatura errada para o cliente, ou a mesma fatura quatro vezes por dia.
 *
 * O Asaas e trocado por um servidor local: o teste prova a nossa decisao de
 * cobrar ou nao, e quanto, sem depender de rede nem de chave de verdade.
 */
const pedidos = [];
const asaasFalso = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (p) => { corpo += p; });
  req.on('end', () => {
    pedidos.push({ caminho: req.url, corpo: corpo ? JSON.parse(corpo) : null });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: `pay_${pedidos.length}` }));
  });
});
await new Promise((ok) => asaasFalso.listen(0, ok));
process.env.ASAAS_BASE = `http://127.0.0.1:${asaasFalso.address().port}`;
process.env.ASAAS_API_KEY = 'chave-de-teste';

const { pool } = await import('../src/db.js');
await prepararBanco();
const repo = await import('../src/repositorio.js');
const tarefas = await import('../src/tarefas.js');

const mesPassado = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1))
  .toISOString().slice(0, 10);

async function contaCobravel(nome, email, faixa, enviadas) {
  const conta = await contaDeTeste(nome, email);
  await pool.query(
    `update contas set modulo_atendimento = true, faixa_atendimento = $2, cliente_externo = $3
      where id = $1`,
    [conta.id, faixa, `cus_${email}`],
  );
  await pool.query(
    `insert into consumo_atendimento (conta_id, competencia, enviadas) values ($1, $2, $3)`,
    [conta.id, mesPassado, enviadas],
  );
  return conta;
}

test('quem passou do plano recebe uma fatura de excedente, com o valor da tabela', async () => {
  // Essencial inclui 1.000. 1.250 enviadas sao 250 acima, a R$ 0,15.
  const conta = await contaCobravel('Passou do teto', 'passou@teste.local', 'essencial', 1250);

  const fecho = await tarefas.fecharExcedentes();
  assert.equal(fecho.competencia, mesPassado);

  const cobrancas = await pool.query(
    `select tipo, valor from cobrancas where conta_id = $1`, [conta.id],
  );
  assert.equal(cobrancas.rows.length, 1);
  assert.equal(cobrancas.rows[0].tipo, 'excedente');
  assert.equal(Number(cobrancas.rows[0].valor), 37.5, '250 mensagens a R$ 0,15');

  const mandado = pedidos.find((p) => p.corpo && p.corpo.customer === `cus_passou@teste.local`);
  assert.ok(mandado, 'o Asaas recebeu a cobranca');
  assert.equal(mandado.corpo.value, 37.5);
  assert.match(mandado.corpo.description, /250 mensagens acima do plano/);
});

test('rodar de novo nao cria a segunda fatura do mesmo mes', async () => {
  const antes = (await pool.query(`select count(*)::int as n from cobrancas`)).rows[0].n;
  await tarefas.fecharExcedentes();
  await tarefas.fecharExcedentes();
  const depois = (await pool.query(`select count(*)::int as n from cobrancas`)).rows[0].n;
  assert.equal(depois, antes, 'a tarefa roda de 6 em 6 horas: repetir nao pode cobrar de novo');
});

test('quem ficou dentro do plano nao recebe fatura nenhuma', async () => {
  const conta = await contaCobravel('Dentro do teto', 'dentro@teste.local', 'crescimento', 900);
  await tarefas.fecharExcedentes();

  const cobrancas = await pool.query(
    `select 1 from cobrancas where conta_id = $1`, [conta.id],
  );
  assert.equal(cobrancas.rows.length, 0);

  // Mesmo sem cobrar, o mes fica marcado: senao a tarefa releria esse mes
  // para sempre, em toda conta que nunca passa do plano.
  const marca = await repo.consumoDoMesDaConta(conta.id, mesPassado);
  assert.equal(marca.excedente_cobrado, true);
});

test('o mes corrente nao e fechado: ainda tem mensagem para enviar', async () => {
  const conta = await contaCobravel('Mes corrente', 'corrente@teste.local', 'essencial', 5000);
  const competenciaAgora = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    .toISOString().slice(0, 10);
  await pool.query(
    `delete from consumo_atendimento where conta_id = $1`, [conta.id],
  );
  await pool.query(
    `insert into consumo_atendimento (conta_id, competencia, enviadas) values ($1, $2, $3)`,
    [conta.id, competenciaAgora, 5000],
  );

  await tarefas.fecharExcedentes();
  const cobrancas = await pool.query(`select 1 from cobrancas where conta_id = $1`, [conta.id]);
  assert.equal(cobrancas.rows.length, 0, 'o mes que ainda esta correndo nao vira fatura');
});

test('sem chave do Asaas a tarefa nao inventa cobranca', async () => {
  const guardada = process.env.ASAAS_API_KEY;
  delete process.env.ASAAS_API_KEY;
  const fecho = await tarefas.fecharExcedentes();
  assert.equal(fecho.fechados, 0);
  assert.equal(fecho.motivo, 'asaas nao configurado');
  process.env.ASAAS_API_KEY = guardada;
});

test.after(async () => {
  asaasFalso.close();
  await pool.end();
});
