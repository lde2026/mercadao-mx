import test from 'node:test';
import assert from 'node:assert/strict';

const { calcularAcesso, avisoDeTeste, diasDeTeste } = await import('../src/billing/acesso.js');

/**
 * Teste de 7 dias.
 *
 * A decisao de negocio e estreita e precisa continuar estreita: acabou o
 * teste, o chat sai da loja e NADA mais. O painel continua inteiro e os leads
 * captados no teste continuam visiveis e exportaveis. Quem experimentou e nao
 * assinou ainda pode voltar, e tirar dele o que ja captou seria cobrar duas
 * vezes pela mesma decisao.
 */

const DIA = 24 * 3600 * 1000;
const hoje = new Date('2026-10-13T12:00:00Z');
const daqui = (dias) => new Date(hoje.getTime() + dias * DIA);

test('durante o teste a conta usa tudo', () => {
  const a = calcularAcesso({ testeAte: daqui(4), hoje });
  assert.equal(a.emTeste, true);
  assert.equal(a.diasDeTeste, 4);
  assert.equal(a.testeVencido, false);
  assert.equal(a.widget, true);
  assert.equal(a.painel, 'total');
});

test('acabado o teste, so o chat sai da loja', () => {
  const a = calcularAcesso({ testeAte: daqui(-1), hoje });
  assert.equal(a.testeVencido, true);
  assert.equal(a.widget, false, 'o chat tem que sair da loja');
  // O resto fica. Esta e a decisao do negocio, escrita para quem mudar isso
  // ter que apagar a linha de proposito.
  assert.equal(a.painel, 'total', 'o painel continua inteiro');
  assert.equal(a.leadsPreservados, true);
  assert.equal(a.scriptNaLoja, true, 'o script so sai no dia 45 de atraso, nao pelo teste');
  assert.match(a.motivo, /teste/);
});

test('quem assina sai do teste, mesmo com a data vencida', () => {
  const a = calcularAcesso({
    assinatura: { plano: 'crescimento', status: 'ativa' },
    testeAte: daqui(-30),
    hoje,
  });
  assert.equal(a.testeVencido, false);
  assert.equal(a.emTeste, false);
  assert.equal(a.widget, true);
});

test('conta anterior a esta regra nao perde nada', () => {
  // teste_ate nulo e conta criada antes do teste existir.
  const a = calcularAcesso({ testeAte: null, hoje });
  assert.equal(a.emTeste, false);
  assert.equal(a.testeVencido, false);
  assert.equal(a.widget, true);
  assert.equal(diasDeTeste(null), null);
});

test('o ultimo dia ainda e dia de teste', () => {
  // Vence hoje: a pessoa tem o dia inteiro, nao perde no meio do expediente.
  const a = calcularAcesso({ testeAte: hoje, hoje });
  assert.equal(a.diasDeTeste, 0);
  assert.equal(a.testeVencido, false);
  assert.equal(a.widget, true);
});

test('o aviso muda de tom conforme o prazo aperta', () => {
  assert.match(avisoDeTeste(calcularAcesso({ testeAte: daqui(6), hoje })).texto, /faltam 6 dias/i);
  assert.match(avisoDeTeste(calcularAcesso({ testeAte: daqui(2), hoje })).texto, /2 dia/);
  assert.match(avisoDeTeste(calcularAcesso({ testeAte: hoje, hoje })).texto, /[Úú]ltimo dia/);

  const vencido = avisoDeTeste(calcularAcesso({ testeAte: daqui(-1), hoje }));
  assert.equal(vencido.gravidade, 'erro');
  // O aviso precisa dizer o que a pessoa NAO perdeu, senao ela acha que
  // perdeu os leads e nao volta.
  assert.match(vencido.texto, /leads/i);

  assert.equal(avisoDeTeste(calcularAcesso({ hoje })), null);
});

test('fatura em atraso continua mandando mais que o teste', () => {
  // Quem esta em teste e tambem deve: o motivo mostrado e o atraso, que corta
  // mais fundo.
  const a = calcularAcesso({
    assinatura: { plano: 'essencial', status: 'ativa' },
    cobrancasAbertas: [{ vence_em: daqui(-12) }],
    testeAte: daqui(3),
    hoje,
  });
  assert.equal(a.widget, false);
  assert.equal(a.painel, 'leitura');
  assert.match(a.motivo, /atraso/);
});
