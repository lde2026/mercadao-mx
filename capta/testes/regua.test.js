import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAcesso, diasDeAtraso, avisoDeCobranca, DEGRAUS } from '../src/billing/acesso.js';
import { precoDoPlano, planoTemRastreamento, PLANOS } from '../src/billing/planos.js';

/**
 * Erro aqui corta loja que esta em dia ou deixa inadimplente rodando de graca.
 * Os dois custam dinheiro, e o primeiro custa cliente.
 */

const HOJE = new Date('2026-03-20T12:00:00Z');
const ASSINATURA = { status: 'ativa', plano: 'crescimento' };

/** Cobranca que venceu ha N dias. */
function venceuHa(dias) {
  const data = new Date(Date.UTC(2026, 2, 20 - dias));
  return { vence_em: data.toISOString().slice(0, 10), valor: 397, status: 'aberta' };
}

function acessoNoDia(dias, assinatura = ASSINATURA) {
  return calcularAcesso({ assinatura, cobrancasAbertas: [venceuHa(dias)], hoje: HOJE });
}

test('conta em dia tem tudo ligado', () => {
  const acesso = calcularAcesso({ assinatura: ASSINATURA, cobrancasAbertas: [], hoje: HOJE });
  assert.equal(acesso.diasAtraso, 0);
  assert.equal(acesso.rastreamento, true);
  assert.equal(acesso.widget, true);
  assert.equal(acesso.painel, 'total');
  assert.equal(acesso.scriptNaLoja, true);
});

test('nada cai antes do dia 7', () => {
  for (let dia = 0; dia < DEGRAUS.RASTREAMENTO; dia += 1) {
    const acesso = acessoNoDia(dia);
    assert.equal(acesso.rastreamento, true, `dia ${dia} nao podia desligar rastreamento`);
    assert.equal(acesso.widget, true, `dia ${dia} nao podia derrubar widget`);
    assert.equal(acesso.painel, 'total', `dia ${dia} nao podia travar painel`);
  }
});

test('dia 7 desliga o rastreamento e nada mais', () => {
  const acesso = acessoNoDia(7);
  assert.equal(acesso.rastreamento, false);
  assert.equal(acesso.widget, true);
  assert.equal(acesso.painel, 'total');
  assert.equal(acesso.scriptNaLoja, true);
});

test('dia 10 tira o widget do ar e deixa o painel em leitura', () => {
  assert.equal(acessoNoDia(9).widget, true, 'dia 9 ainda tem widget');
  const acesso = acessoNoDia(10);
  assert.equal(acesso.widget, false);
  assert.equal(acesso.painel, 'leitura');
  assert.equal(acesso.scriptNaLoja, true, 'o script so sai no dia 45');
});

test('dia 45 remove o script da loja', () => {
  assert.equal(acessoNoDia(44).scriptNaLoja, true);
  assert.equal(acessoNoDia(45).scriptNaLoja, false);
  assert.equal(acessoNoDia(200).scriptNaLoja, false);
});

test('atraso nunca apaga lead, em nenhum degrau', () => {
  for (const dia of [0, 7, 10, 45, 365]) {
    assert.equal(acessoNoDia(dia).leadsPreservados, true, `dia ${dia} nao pode tocar em lead`);
  }
});

test('quem paga volta a funcionar no mesmo minuto', () => {
  const atrasado = acessoNoDia(60);
  assert.equal(atrasado.widget, false);

  // Pagar significa a cobranca sair da lista de abertas. Nao ha carencia,
  // nao ha reimplantacao e nao ha estado intermediario.
  const emDia = calcularAcesso({ assinatura: ASSINATURA, cobrancasAbertas: [], hoje: HOJE });
  assert.equal(emDia.widget, true);
  assert.equal(emDia.rastreamento, true);
  assert.equal(emDia.painel, 'total');
  assert.equal(emDia.scriptNaLoja, true);
});

test('cobranca que ainda nao venceu nao e atraso', () => {
  const futura = { vence_em: '2026-04-10', valor: 397, status: 'aberta' };
  const acesso = calcularAcesso({ assinatura: ASSINATURA, cobrancasAbertas: [futura], hoje: HOJE });
  assert.equal(acesso.diasAtraso, 0);
  assert.equal(acesso.widget, true);
});

test('cobranca que vence hoje nao e atraso', () => {
  const acesso = acessoNoDia(0);
  assert.equal(acesso.diasAtraso, 0);
  assert.equal(acesso.rastreamento, true);
});

test('o atraso conta pela fatura mais antiga em aberto, nao pela mais nova', () => {
  // Duas faturas em aberto. Se contasse pela mais nova, a conta com 40 dias de
  // atraso apareceria como 2 e nunca chegaria a degrau nenhum.
  const abertas = [venceuHa(40), venceuHa(2)];
  assert.equal(diasDeAtraso(abertas, HOJE), 40);
  const acesso = calcularAcesso({ assinatura: ASSINATURA, cobrancasAbertas: abertas, hoje: HOJE });
  assert.equal(acesso.widget, false);
});

test('rastreamento e do Crescimento para cima, mesmo com a conta em dia', () => {
  const emDia = { cobrancasAbertas: [], hoje: HOJE };
  assert.equal(calcularAcesso({ assinatura: { status: 'ativa', plano: 'essencial' }, ...emDia }).rastreamento, false);
  assert.equal(calcularAcesso({ assinatura: { status: 'ativa', plano: 'crescimento' }, ...emDia }).rastreamento, true);
  assert.equal(calcularAcesso({ assinatura: { status: 'ativa', plano: 'escala' }, ...emDia }).rastreamento, true);
});

test('assinatura cancelada derruba widget mas nao apaga lead', () => {
  const acesso = calcularAcesso({
    assinatura: { status: 'cancelada', plano: 'escala' }, cobrancasAbertas: [], hoje: HOJE,
  });
  assert.equal(acesso.widget, false);
  assert.equal(acesso.painel, 'leitura');
  assert.equal(acesso.leadsPreservados, true);
});

test('conta em implantacao, ainda sem assinatura, nao nasce trancada', () => {
  // O lojista e cadastrado antes da cobranca existir. Tratar ausencia de
  // assinatura como inadimplencia trancaria o painel dele no primeiro dia.
  const acesso = calcularAcesso({ hoje: HOJE });
  assert.equal(acesso.widget, true);
  assert.equal(acesso.painel, 'total');
  assert.equal(acesso.rastreamento, false, 'sem plano nao ha rastreamento');
  assert.equal(acesso.diasAtraso, 0);
  assert.equal(acesso.leadsPreservados, true);
});

test('o aviso muda antes de cada corte', () => {
  assert.equal(avisoDeCobranca(acessoNoDia(0)), null);
  assert.match(avisoDeCobranca(acessoNoDia(3)).texto, /dia 7 o rastreamento/);
  assert.match(avisoDeCobranca(acessoNoDia(8)).texto, /dia 10 o widget/);
  assert.match(avisoDeCobranca(acessoNoDia(12)).texto, /leads continuam guardados/);
});

test('o anual custa dez meses', () => {
  assert.equal(precoDoPlano('essencial'), 197);
  assert.equal(precoDoPlano('crescimento'), 397);
  assert.equal(precoDoPlano('escala'), 797);
  assert.equal(precoDoPlano('crescimento', 'anual'), 3970);
  assert.equal(precoDoPlano('escala', 'anual'), 7970);
});

test('todo plano declara rastreamento de forma explicita', () => {
  for (const [nome, plano] of Object.entries(PLANOS)) {
    assert.equal(typeof plano.rastreamento, 'boolean', `plano ${nome}`);
    assert.equal(planoTemRastreamento(nome), plano.rastreamento);
  }
});
