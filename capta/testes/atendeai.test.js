import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepararBanco } from './ajuda.js';

process.env.NODE_ENV = 'test';
// Lidos na carga do servidor, entao antes do import.
process.env.HOST_LANDING = 'capta.teste';
process.env.HOST_ATENDEAI = 'atendeai.teste';

const { pool } = await import('../src/db.js');
await prepararBanco();
const { app } = await import('../src/server.js');

const servidor = app.listen(0);
const porta = servidor.address().port;

/**
 * O Atende Ai e a mesma aplicacao atras de outro dominio.
 *
 * O que se testa aqui e a separacao, nao o texto da pagina. Errar o lado faz
 * o lojista que veio pelo anuncio cair na tela de login, ou o painel abrir
 * sem conseguir falar com a API, que e o jeito mais rapido de parecer que o
 * produto esta fora do ar sem estar.
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
          status: resposta.statusCode, destino: resposta.headers.location, corpo,
        }));
      },
    );
    pedido.on('error', falhou);
    pedido.end();
  });
}

test('a raiz do atendeai e a pagina de venda do Atende Ai', async () => {
  const r = await pedir('/', 'atendeai.teste');
  assert.equal(r.status, 200);
  assert.match(r.corpo, /<title>Atende Aí<\/title>/);
  assert.match(r.corpo, /responde no WhatsApp/);
  // E nao a landing do Captapp, que mora no mesmo servidor.
  assert.doesNotMatch(r.corpo, /Experimentar agora/);
});

test('/app abre o painel, com a barra que os arquivos dele precisam', async () => {
  const semBarra = await pedir('/app', 'atendeai.teste');
  assert.equal(semBarra.status, 302);
  assert.equal(semBarra.destino, '/app/#/atendimento');

  const comBarra = await pedir('/app/', 'atendeai.teste');
  assert.equal(comBarra.status, 200);
  assert.match(comBarra.corpo, /painel\.js/);

  // Rota interna do painel recarregada na mao continua devolvendo o painel.
  const fundo = await pedir('/app/qualquer-coisa', 'atendeai.teste');
  assert.equal(fundo.status, 200);
  assert.match(fundo.corpo, /painel\.js/);
});

test('o painel neste dominio acha os proprios arquivos e a API', async () => {
  for (const arquivo of ['/painel.js', '/painel.css']) {
    const r = await pedir(arquivo, 'atendeai.teste');
    assert.equal(r.status, 200, arquivo);
  }

  // Sem sessao a API responde 401, e nao a pagina de venda: o painel precisa
  // de uma resposta de API para saber que tem que pedir login.
  const api = await pedir('/api/eu', 'atendeai.teste');
  assert.equal(api.status, 401);

  const saude = await pedir('/saude', 'atendeai.teste');
  assert.equal(saude.status, 200);
});

test('endereco errado volta para a oferta, nao para uma tela de erro', async () => {
  const r = await pedir('/promocao-que-nao-existe', 'atendeai.teste');
  assert.equal(r.status, 302);
  assert.equal(r.destino, '/');
});

test('termos e privacidade sao os mesmos da casa', async () => {
  for (const caminho of ['/termos', '/privacidade']) {
    const r = await pedir(caminho, 'atendeai.teste');
    assert.equal(r.status, 200, caminho);
    assert.match(r.corpo, /[Tt]ermos|[Pp]rivacidade/);
  }
  // A folha de estilo das juridicas mora na pasta da landing e continua
  // servida aqui, senao as duas paginas abrem sem formatacao nenhuma.
  const css = await pedir('/legal.css', 'atendeai.teste');
  assert.equal(css.status, 200);
});

test('o painel entrado pelo Atende Ai nao se apresenta como Captapp', async () => {
  // O lojista que assina so o modulo entra por aqui. Ele nao comprou Captapp
  // e nao deve ler Captapp no topo da tela: e o mesmo painel, outra porta.
  const js = await pedir('/painel.js', 'atendeai.teste');
  assert.match(js.corpo, /\/app\/'\) === 0 \? 'atende aí'/);
  assert.match(js.corpo, /vestirMarca\(\);/);
});

test('http neste dominio vira https antes de qualquer coisa', async () => {
  // Foi exatamente aqui que a landing do Captapp carimbou "nao seguro" com o
  // certificado valido: o dominio apontado direto para o Railway chega em
  // http e o servidor precisa mandar de volta.
  const r = await new Promise((ok, falhou) => {
    const pedido = http.request(
      { host: '127.0.0.1', port: porta, path: '/', headers: { Host: 'atendeai.teste', 'X-Forwarded-Proto': 'http' } },
      (resposta) => { resposta.resume(); ok({ status: resposta.statusCode, destino: resposta.headers.location }); },
    );
    pedido.on('error', falhou);
    pedido.end();
  });
  assert.equal(r.status, 301);
  assert.equal(r.destino, 'https://atendeai.teste/');
});

test('os outros dominios nao mudaram de lado', async () => {
  const capta = await pedir('/', 'capta.teste');
  assert.equal(capta.status, 200);
  assert.match(capta.corpo, /Experimentar agora/);

  // No dominio do painel o Atende Ai nao existe como pagina: /app e so o
  // painel servido em /, e /app cairia no estatico.
  const painel = await pedir('/', 'captapp.teste');
  assert.equal(painel.status, 200);
  assert.match(painel.corpo, /painel\.js/);
});

test.after(async () => {
  servidor.close();
  await pool.end();
});
