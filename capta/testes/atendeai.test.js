import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepararBanco } from './ajuda.js';

process.env.NODE_ENV = 'test';
// Lidos na carga do servidor, entao antes do import.
process.env.HOST_LANDING = 'capta.teste';
process.env.HOST_ATENDEAI = 'atendeai.teste';
process.env.MARCA_ATENDEAI = 'segredo-que-so-o-cloudflare-sabe';

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
function pedir(caminho, host, extras = {}) {
  return new Promise((ok, falhou) => {
    const pedido = http.request(
      { host: '127.0.0.1', port: porta, path: caminho, headers: { Host: host, ...extras } },
      (resposta) => {
        let corpo = '';
        resposta.on('data', (p) => { corpo += p; });
        resposta.on('end', () => ok({
          status: resposta.statusCode, destino: resposta.headers.location,
          vary: resposta.headers.vary, csp: resposta.headers['content-security-policy'], corpo,
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

test('o agente alcanca as rotas internas pelo dominio do Atende Ai', async () => {
  // O lojista da ao agente o dominio que ele conhece. Se o /interno caisse
  // na pagina de venda, o agente leria HTML no lugar da base e responderia o
  // cliente com nada, sem erro nenhum aparecer em lugar nenhum.
  const r = await pedir('/interno/numero/5541900000000', 'atendeai.teste');
  assert.notEqual(r.status, 302, 'nao pode virar redirecionamento para a oferta');
  assert.equal(r.status, 401, 'sem a chave de servico, recusa de autorizacao');

  const base = await pedir('/interno/base/00000000-0000-0000-0000-000000000000', 'atendeai.teste');
  assert.equal(base.status, 401);
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
  assert.match(js.corpo, /'atende aí'/);
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

/*
 * O Railway so aceita dois dominios proprios e os dois ja estao ocupados,
 * entao o atendeai entra pelo Cloudflare com o Host reescrito para um que o
 * Railway conhece. Com o Host trocado, quem conta por onde o visitante entrou
 * e o cabecalho, e e esse caminho que estes testes cobrem.
 */
test('o cabecalho do Cloudflare vale quando o Host chegou reescrito', async () => {
  const r = await pedir('/', 'captapp.teste', { 'X-Capta-Marca': 'segredo-que-so-o-cloudflare-sabe' });
  assert.equal(r.status, 200);
  assert.match(r.corpo, /<title>Atende Aí<\/title>/);
  // Sem o Vary, um cache guarda a resposta de um dominio e entrega no outro.
  assert.match(String(r.vary || ''), /x-capta-marca/i);
});

test('o painel continua atras do /app mesmo com o Host reescrito', async () => {
  const marca = { 'X-Capta-Marca': 'segredo-que-so-o-cloudflare-sabe' };
  const app = await pedir('/app/', 'captapp.teste', marca);
  assert.equal(app.status, 200);
  assert.match(app.corpo, /painel\.js/);

  const api = await pedir('/api/eu', 'captapp.teste', marca);
  assert.equal(api.status, 401);
});

test('cabecalho sem o segredo certo nao troca o produto da tela', async () => {
  for (const valor of ['atendeai', 'true', 'segredo-errado', '']) {
    const r = await pedir('/', 'captapp.teste', { 'X-Capta-Marca': valor });
    assert.equal(r.status, 200, valor);
    assert.match(r.corpo, /painel\.js/, `"${valor}" nao deveria valer`);
    assert.doesNotMatch(r.corpo, /<title>Atende Aí<\/title>/);
  }
});

/*
 * Ate o endereco proprio existir, o Atende Ai atende embaixo do /atendeai no
 * dominio do painel. O que se testa aqui e que a mesma pagina serve nos dois
 * lugares: e o mesmo arquivo, e manter duas versoes seria manter uma delas
 * desatualizada sem ninguem ver.
 */
test('o Atende Ai tambem atende por caminho no dominio do painel', async () => {
  const semBarra = await pedir('/atendeai', 'captapp.teste');
  assert.equal(semBarra.status, 302);
  assert.equal(semBarra.destino, '/atendeai/');

  const pagina = await pedir('/atendeai/', 'captapp.teste');
  assert.equal(pagina.status, 200);
  assert.match(pagina.corpo, /<title>Atende Aí<\/title>/);

  for (const arquivo of ['/atendeai/atendeai.js', '/atendeai/favicon.svg']) {
    const r = await pedir(arquivo, 'captapp.teste');
    assert.equal(r.status, 200, arquivo);
  }
});

test('o painel do Atende Ai abre embaixo do caminho', async () => {
  const semBarra = await pedir('/atendeai/app', 'captapp.teste');
  assert.equal(semBarra.status, 302);
  assert.equal(semBarra.destino, '/atendeai/app/#/atendimento');

  const comBarra = await pedir('/atendeai/app/', 'captapp.teste');
  assert.equal(comBarra.status, 200);
  assert.match(comBarra.corpo, /painel\.js/);

  // Rota interna recarregada na mao continua devolvendo o painel.
  const fundo = await pedir('/atendeai/app/seja-la-o-que-for', 'captapp.teste');
  assert.equal(fundo.status, 200);
  assert.match(fundo.corpo, /painel\.js/);
});

test('a pagina usa endereco relativo, senao ela so serve num lugar', async () => {
  const pagina = await pedir('/atendeai/', 'captapp.teste');
  // href="/app" levaria para o painel do Captapp quando a pagina esta
  // embaixo do /atendeai, e src="/atendeai.js" daria 404 no dominio proprio.
  assert.doesNotMatch(pagina.corpo, /(href|src)="\/(app|atendeai\.js|favicon\.svg)/);
  assert.match(pagina.corpo, /href="app"/);
  assert.match(pagina.corpo, /src="atendeai\.js"/);
});

test('o painel embaixo do caminho tambem troca a marca', async () => {
  const js = await pedir('/painel.js', 'captapp.teste');
  assert.match(js.corpo, /'\/atendeai\/'/);
});

test('a vitrine carrega a fonte, e o painel continua fechado', async () => {
  // A pagina de venda usa fonte do Google e precisa da regra mais frouxa da
  // landing. O painel tem sessao e dado de cliente, e nao afrouxa junto.
  const pagina = await pedir('/atendeai/', 'captapp.teste');
  assert.match(pagina.csp, /fonts\.googleapis\.com/);

  for (const caminho of ['/atendeai/app/', '/painel.js', '/']) {
    const r = await pedir(caminho, 'captapp.teste');
    assert.doesNotMatch(r.csp, /fonts\.googleapis\.com/, caminho);
  }
});

test('o dominio da landing nao serve o Atende Ai', async () => {
  // Quem chega por capta veio pela propaganda do Captapp. Endereco errado
  // ali volta para a oferta, como qualquer outro.
  const r = await pedir('/atendeai/', 'capta.teste');
  assert.equal(r.status, 302);
  assert.equal(r.destino, '/');
});

/*
 * As juridicas sao linkadas de fora e sao obrigacao legal, nao enfeite.
 * Amarrar as duas a um dominio so significa que o dia em que esse dominio
 * sair do ar e o dia em que a loja fica sem contrato publicado.
 */
test('termos e privacidade respondem em qualquer dominio', async () => {
  for (const host of ['atendeai.teste', 'captapp.teste', 'capta.teste']) {
    for (const caminho of ['/termos', '/privacidade']) {
      const r = await pedir(caminho, host);
      assert.equal(r.status, 200, `${host}${caminho}`);
      assert.match(r.corpo, /[Tt]ermos|[Pp]rivacidade/);
    }
    const css = await pedir('/legal.css', host);
    assert.equal(css.status, 200, `${host}/legal.css`);
  }
});

test('a pagina do Atende Ai linka as juridicas do proprio dominio', async () => {
  // Link absoluto para outro dominio morre junto com aquele dominio, e um
  // deles pode sair para liberar vaga no plano.
  const pagina = await pedir('/atendeai/', 'captapp.teste');
  assert.doesNotMatch(pagina.corpo, /capta\.lojadoecommerce\.com\.br/);
  assert.match(pagina.corpo, /href="\/termos"/);
  assert.match(pagina.corpo, /href="\/privacidade"/);
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
