import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { tray } from '../src/adapters/tray.js';

/**
 * A API da Tray nao e alcancavel daqui, entao o teste sobe um servidor falso
 * que grava o que recebeu e devolve o que a documentacao oficial promete.
 * O que se confere e o nosso lado do contrato: caminho, metodo, corpo e
 * leitura da resposta, exatamente como docs/tray-api.md descreve.
 */

const chamadas = [];
const respostas = {
  'POST /web_api/discount_coupons': { message: 'Created', id: '77', code: 201 },
  'POST /web_api/discount_coupons/create_relationship/77': { message: 'Created', id: '77', code: 201 },
  'GET /web_api/shippings': { Shippings: [
    { Shipping: { id: '1', name: 'Sedex', status: '1' } },
    { Shipping: { id: '2', name: 'PAC', status: '1' } },
    { Shipping: { id: '9', name: 'Retirada', status: '0' } },
  ] },
  'POST /web_api/external_scripts': { message: 'Created', id: '123', code: 201 },
  'DELETE /web_api/external_scripts/123': { message: 'Deleted', id: '123', code: 200 },
  'GET /web_api/orders': {
    paging: { total: 2, page: 1, limit: 50 },
    Orders: [
      { Order: { id: '5', date: '2026-09-10', total: '270.50', has_payment: '1', coupon: { code: 'BELLAM-AAA111', discount: '27.05' }, discount_coupon: 'BELLAM-AAA111/27.05' } },
      { Order: { id: '6', date: '2026-09-11', total: '99.00', has_payment: '0', discount_coupon: '' } },
    ],
  },
  'GET /web_api/orders/5': { Order: { id: '5', date: '2026-09-10', hour: '11:28:21', total: '270.50', has_payment: '1', discount_coupon: 'BELLAM-AAA111/27.05' } },
  'GET /web_api/orders/6': { Order: { id: '6', date: '2026-09-11', total: '99.00', has_payment: '0' } },
  'GET /web_api/auth': { access_token: 'novo-token', refresh_token: 'novo-refresh', date_expiration_access_token: '2030-01-01 12:00:00', date_expiration_refresh_token: '2030-01-30 12:00:00', store_id: '391250' },
  'POST /web_api/auth': { access_token: 'tok', refresh_token: 'ref', date_expiration_access_token: '2030-01-01 12:00:00', date_expiration_refresh_token: '2030-01-30 12:00:00', api_host: 'https://loja.commercesuite.com.br/web_api', store_id: '391250' },
  'GET /web_api/info': { id: '391250', name: 'Casa Verde Decor', secure_uri: 'https://casaverde.commercesuite.com.br' },
};

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const chave = `${req.method} ${url.pathname}`;
    chamadas.push({ metodo: req.method, caminho: url.pathname, busca: url.searchParams, corpo, tipo: req.headers['content-type'] || '' });
    const resposta = respostas[chave];
    res.writeHead(resposta ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(resposta || { erro: 'nao mapeado' }));
  });
});
await new Promise((ok) => servidor.listen(0, ok));
const porta = servidor.address().port;

const credenciais = {
  api_address: `http://127.0.0.1:${porta}/web_api`,
  access_token: 'token-atual',
  refresh_token: 'refresh-atual',
  expira_em: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  store_id: '391250',
};

test.after(() => servidor.close());
test.beforeEach(() => { chamadas.length = 0; });

test('cupom percentual vai em form-urlencoded com as chaves e valores da documentacao', async () => {
  const retorno = await tray.criarCupom(credenciais, { codigo: 'BELLAM-AAA111', desconto: 10 });
  assert.equal(retorno.idExterno, '77');
  assert.equal(chamadas.length, 1);
  const [c] = chamadas;
  assert.equal(c.caminho, '/web_api/discount_coupons');
  assert.equal(c.busca.get('access_token'), 'token-atual');
  assert.match(c.tipo, /x-www-form-urlencoded/);
  const campos = new URLSearchParams(c.corpo);
  assert.equal(campos.get('["DiscountCoupon"]["code"]'), 'BELLAM-AAA111');
  assert.equal(campos.get('["DiscountCoupon"]["type"]'), '%');
  assert.equal(campos.get('["DiscountCoupon"]["value"]'), '10.00');
  assert.ok(campos.get('["DiscountCoupon"]["description"]'));
  assert.equal(campos.get('["DiscountCoupon"]["usage_counter_limit"]'), '1');
  assert.equal(campos.get('["DiscountCoupon"]["usage_counter_limit_customer"]'), '1');
  assert.equal(campos.has('["DiscountCoupon"]["active"]'), false);
});

test('frete gratis cria cupom de zero reais e vincula so as formas de envio ativas', async () => {
  await tray.criarCupom(credenciais, { codigo: 'BELLAM-FRETE1', desconto: 0, frete: true });
  assert.deepEqual(chamadas.map((c) => `${c.metodo} ${c.caminho}`), [
    'POST /web_api/discount_coupons',
    'GET /web_api/shippings',
    'POST /web_api/discount_coupons/create_relationship/77',
  ]);
  const campos = new URLSearchParams(chamadas[0].corpo);
  assert.equal(campos.get('["DiscountCoupon"]["type"]'), '$');
  assert.equal(campos.get('["DiscountCoupon"]["value"]'), '0.00');
  const vinculo = JSON.parse(chamadas[2].corpo);
  assert.deepEqual(vinculo, { DiscountCouponShipping: [{ shipping_id: '1' }, { shipping_id: '2' }] });
});

test('instalacao usa external_scripts e devolve o id para a remocao do dia 45', async () => {
  const r = await tray.instalarScript(credenciais, 'https://captapp.lojadoecommerce.com.br/widget.js?k=pk_x');
  assert.equal(r.modo, 'auto');
  assert.equal(r.idScript, '123');
  assert.deepEqual(JSON.parse(chamadas[0].corpo), { ExternalScript: { source: 'https://captapp.lojadoecommerce.com.br/widget.js?k=pk_x' } });
  await tray.removerScript(credenciais, '123');
  assert.equal(chamadas[1].metodo, 'DELETE');
  assert.equal(chamadas[1].caminho, '/web_api/external_scripts/123');
});

test('varredura filtra por modified e so devolve pedido pago, com o cupom limpo', async () => {
  const pedidos = await tray.listarPedidos(credenciais, new Date('2026-09-01T00:00:00Z'));
  assert.equal(chamadas[0].busca.get('modified'), '2026-09-01');
  assert.equal(chamadas[0].busca.get('limit'), '50');
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].idExterno, '5');
  assert.equal(pedidos[0].valor, 270.5);
  assert.equal(pedidos[0].cupomCodigo, 'BELLAM-AAA111');
});

test('webhook so passa com seller_id da propria loja e escopo de pedido', async () => {
  const corpo = 'seller_id=391250&scope_id=5&scope_name=order&act=update&app_code=718';
  assert.equal(tray.verificarWebhook(credenciais, corpo), true);
  assert.equal(tray.verificarWebhook(credenciais, corpo.replace('391250', '1')), false);
  assert.equal(tray.verificarWebhook(credenciais, corpo.replace('scope_name=order', 'scope_name=product')), false);
  assert.equal(tray.idDoWebhook(corpo), '5');
  const pago = await tray.lerPedido(credenciais, '5');
  assert.equal(pago.cupomCodigo, 'BELLAM-AAA111');
  assert.equal(await tray.lerPedido(credenciais, '6'), null);
});

test('token vencido e renovado pelo refresh e o novo par volta com a data em UTC', async () => {
  const vencido = { ...credenciais, expira_em: new Date(Date.now() - 1000).toISOString() };
  const { credenciais: novas, renovou } = await tray.garantirToken(vencido);
  assert.equal(renovou, true);
  assert.equal(chamadas[0].busca.get('refresh_token'), 'refresh-atual');
  assert.equal(novas.access_token, 'novo-token');
  assert.equal(novas.expira_em, '2030-01-01T15:00:00.000Z');
  const { renovou: deNovo } = await tray.garantirToken(novas);
  assert.equal(deNovo, false);
});

test('troca do code pelo token guarda api_address com /web_api e o store_id', async () => {
  const cred = await tray.trocarCodigo({
    apiAddress: `http://127.0.0.1:${porta}/web_api/`, code: 'abc', consumerKey: 'ck', consumerSecret: 'cs',
  });
  const campos = new URLSearchParams(chamadas[0].corpo);
  assert.equal(campos.get('consumer_secret'), 'cs');
  assert.equal(campos.get('code'), 'abc');
  assert.equal(cred.api_address, 'https://loja.commercesuite.com.br/web_api');
  assert.equal(cred.store_id, '391250');
  assert.equal(cred.access_token, 'tok');
  const loja = await tray.dadosDaLoja(credenciais);
  assert.equal(loja.nome, 'Casa Verde Decor');
  assert.equal(loja.dominio, 'casaverde.commercesuite.com.br');
});
