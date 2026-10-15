import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, contaDeTeste, conexaoDeTeste } from './ajuda.js';

process.env.NODE_ENV = 'test';

const { pool, consultar } = await import('../src/db.js');
await prepararBanco();
const repo = await import('../src/repositorio.js');
const { resumoDaSemana, valeMandar } = await import('../src/relatorio.js');

/**
 * Os numeros do relatorio semanal.
 *
 * Erro aqui nao derruba nada, e e por isso que e perigoso: o numero errado
 * sai por e-mail, chega na caixa do lojista e nao da para voltar atras. Dois
 * casos importam acima de todos: a janela de sete dias, que nao pode pegar
 * lead velho, e o filtro por conta, porque somar a loja de outro cliente no
 * relatorio deste seria o pior vazamento possivel.
 */

const DIA = 24 * 3600 * 1000;
const agora = new Date();
const diasAtras = (n) => new Date(agora.getTime() - n * DIA);

const conta = await contaDeTeste('Bella Moda', 'pierre+rel@lojadoecommerce.com.br');
const loja = await conexaoDeTeste(conta.id, 'nuvemshop', 'Bella Moda', { store_id: '1' });

const vizinha = await contaDeTeste('Casa Verde', 'pierre+rel2@lojadoecommerce.com.br');
const lojaVizinha = await conexaoDeTeste(vizinha.id, 'tray', 'Casa Verde');

async function lead({ conta: c, conexao, nome, dias, contatado = false }) {
  const novo = await repo.criarLead({
    contaId: c.id, conexaoId: conexao.id, nome, email: `${nome}@teste.com.br`,
    telefone: '41999990000', respostas: [], anonimoId: null, redeMascarada: null,
  });
  await consultar('update leads set criado_em = $2 where id = $1', [novo.id, diasAtras(dias)]);
  if (contatado) await consultar('update leads set contatado_em = now() where id = $1', [novo.id]);
  return novo;
}

test('a janela e de sete dias, e a semana anterior entra so para comparar', async () => {
  await lead({ conta, conexao: loja, nome: 'ana', dias: 1 });
  await lead({ conta, conexao: loja, nome: 'bia', dias: 3 });
  await lead({ conta, conexao: loja, nome: 'cris', dias: 6 });
  // Estes dois sao da semana passada: contam na comparacao, nunca no total.
  await lead({ conta, conexao: loja, nome: 'dani', dias: 9 });
  await lead({ conta, conexao: loja, nome: 'edu', dias: 13 });
  // E este e velho demais para aparecer em qualquer um dos dois numeros.
  await lead({ conta, conexao: loja, nome: 'fabi', dias: 30 });

  const r = await resumoDaSemana(conta.id, agora);
  assert.equal(r.leads, 3);
  assert.equal(r.leadsAntes, 2);
});

test('lead de outra conta nunca entra no relatorio desta', async () => {
  await lead({ conta: vizinha, conexao: lojaVizinha, nome: 'gabi', dias: 2 });
  await lead({ conta: vizinha, conexao: lojaVizinha, nome: 'hugo', dias: 2 });

  const r = await resumoDaSemana(conta.id, agora);
  assert.equal(r.leads, 3, 'o vizinho vazou para dentro do relatorio');

  const dela = await resumoDaSemana(vizinha.id, agora);
  assert.equal(dela.leads, 2);
});

test('quem ainda nao foi atendido aparece separado', async () => {
  const atendido = await lead({ conta, conexao: loja, nome: 'ivo', dias: 2, contatado: true });
  assert.ok(atendido.id);
  const r = await resumoDaSemana(conta.id, agora);
  assert.equal(r.leads, 4);
  // Os tres do primeiro teste seguem sem contato; o quarto ja foi atendido.
  assert.equal(r.semContato, 3);
});

test('faturamento conta so pedido ligado a um lead', async () => {
  const dela = await lead({ conta, conexao: loja, nome: 'joana', dias: 2 });
  // A data entra a mao: "agora" foi fixado quando o arquivo carregou, e um
  // cupom criado alguns segundos depois cairia fora da janela.
  const { rows } = await consultar(
    `insert into cupons (conta_id, conexao_id, lead_id, codigo, desconto, status, criado_em)
     values ($1, $2, $3, 'BELLA-AAA111', 10, 'criado', $4) returning id`,
    [conta.id, loja.id, dela.id, diasAtras(2)],
  );
  assert.ok(rows[0].id);

  await repo.registrarPedido({
    contaId: conta.id, conexaoId: loja.id, idExterno: '900',
    valor: 250.5, cupomCodigo: 'BELLA-AAA111', feitoEm: diasAtras(1),
  });
  // Pedido sem cupom do chat e venda da loja, nao venda do Captapp.
  await repo.registrarPedido({
    contaId: conta.id, conexaoId: loja.id, idExterno: '901',
    valor: 999, cupomCodigo: null, feitoEm: diasAtras(1),
  });

  const r = await resumoDaSemana(conta.id, agora);
  assert.equal(r.cupons, 1);
  assert.equal(r.pedidos, 1);
  assert.equal(r.faturamento, 250.5);
});

test('duas semanas sem lead nenhum nao viram e-mail', async () => {
  // Relatorio de zero uma vez e util e cutuca. Toda semana e so ensinar a
  // pessoa a marcar o remetente como spam.
  assert.equal(valeMandar({ leads: 0, leadsAntes: 0 }), false);
  assert.equal(valeMandar({ leads: 0, leadsAntes: 4 }), true);
  assert.equal(valeMandar({ leads: 2, leadsAntes: 0 }), true);
});

test.after(async () => {
  await pool.end();
});
