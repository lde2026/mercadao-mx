import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepararBanco } from './ajuda.js';

process.env.NODE_ENV = 'test';
// Definido antes de importar o servidor: o host da landing e lido na carga.
process.env.HOST_LANDING = 'capta.teste';

const { pool } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');

const servidor = app.listen(0);
const porta = servidor.address().port;

/**
 * A landing e o painel moram no mesmo servidor, separados pelo Host.
 *
 * O que se testa aqui e a separacao, nao o texto da pagina: errar o lado faz
 * o visitante que veio pela propaganda cair na tela de login, ou pior, o
 * painel ser servido num dominio onde ninguem espera por ele.
 */

/*
 * node:http e nao fetch porque Host e cabecalho proibido no fetch: o undici
 * reescreve com o endereco real e o teste passaria a medir outra coisa.
 */
function pedir(caminho, host) {
  return new Promise((ok, falhou) => {
    const pedido = http.request(
      { host: '127.0.0.1', port: porta, path: caminho, headers: { Host: host } },
      (resposta) => {
        let corpo = '';
        resposta.on('data', (p) => { corpo += p; });
        resposta.on('end', () => ok({
          status: resposta.statusCode,
          cabecalhos: resposta.headers,
          corpo,
        }));
      },
    );
    pedido.on('error', falhou);
    pedido.end();
  });
}

test('quem chega pelo dominio da landing ve a pagina de venda', async () => {
  const r = await pedir('/', 'capta.teste');
  assert.equal(r.status, 200);
  assert.match(r.corpo, /Experimentar agora/);
  assert.match(r.corpo, /captapp\.lojadoecommerce\.com\.br\/demo/);
});

test('as paginas juridicas respondem nos enderecos que a landing linka', async () => {
  for (const [caminho, trecho] of [['/termos', /[Tt]ermos/], ['/privacidade', /[Pp]rivacidade/]]) {
    const r = await pedir(caminho, 'capta.teste');
    assert.equal(r.status, 200, caminho);
    assert.match(r.corpo, trecho);
  }
});

test('endereco errado na landing volta para a oferta, nao para uma tela de erro', async () => {
  const r = await pedir('/pagina-que-nao-existe', 'capta.teste');
  assert.equal(r.status, 302);
  assert.equal(r.cabecalhos.location, '/');
});

test('o mesmo caminho no dominio do painel continua sendo o painel', async () => {
  const r = await pedir('/', 'captapp.teste');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.corpo, /Experimentar agora/, 'a landing nao pode vazar para o dominio do painel');
});

test('a landing abre a fonte do Google, e o painel nao', async () => {
  // A landing nao tem sessao nem formulario, entao a folha de estilo externa
  // nao amplia o que um atacante alcanca. O painel nao ganha essa folga.
  const landing = await pedir('/', 'capta.teste');
  assert.match(landing.cabecalhos['content-security-policy'], /fonts\.googleapis\.com/);
  assert.match(landing.cabecalhos['content-security-policy'], /script-src 'self'/);

  const painel = await pedir('/', 'captapp.teste');
  assert.doesNotMatch(painel.cabecalhos['content-security-policy'], /googleapis/);
});

test('o /saude responde nos dois dominios', async () => {
  // O Railway bate no /saude pelo dominio que ele escolher. Respondendo so
  // num deles, o servico apareceria fora do ar sem estar.
  const r = await pedir('/saude', 'capta.teste');
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.corpo).ok, true);
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
