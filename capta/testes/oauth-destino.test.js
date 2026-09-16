import test from 'node:test';
import assert from 'node:assert/strict';

const { enderecoDeLojaTray } = await import('../src/oauth.js');

/**
 * O consumer_secret do nosso aplicativo vai no corpo do POST para o endereco
 * que chega na query da callback da Tray. Esse segredo vale para TODAS as
 * lojas conectadas, entao o destino e uma lista fechada. Os testes aqui sao
 * quase todos sobre o que precisa ser recusado.
 */

const producao = { exigirHttps: true };

test('loja Tray de verdade e aceita', () => {
  const url = enderecoDeLojaTray('https://trayparceiros.commercesuite.com.br/web_api', producao);
  assert.equal(url.hostname, 'trayparceiros.commercesuite.com.br');
});

test('servidor do atacante e recusado, que e o ponto todo', () => {
  for (const destino of [
    'https://atacante.com/web_api',
    'https://commercesuite.com.br.atacante.com/web_api',
    'https://atacante.com/?x=.commercesuite.com.br',
    'https://atacante.com#.commercesuite.com.br',
  ]) {
    assert.equal(enderecoDeLojaTray(destino, producao), null, `${destino} tinha que ser recusado`);
  }
});

test('rede interna e servico de metadados sao recusados', () => {
  for (const destino of [
    'http://127.0.0.1:3000/web_api',
    'https://169.254.169.254/latest/meta-data/',
    'http://localhost/web_api',
    'http://banco.internal/web_api',
    'http://servidor.local/web_api',
    'http://[::1]/web_api',
    'https://10.0.0.5/web_api',
  ]) {
    assert.equal(enderecoDeLojaTray(destino, producao), null, `${destino} tinha que ser recusado`);
  }
});

test('esquema, porta e credencial embutida nao passam', () => {
  for (const destino of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'gopher://loja.commercesuite.com.br/',
    'https://loja.commercesuite.com.br:2222/web_api',
    'https://usuario:senha@loja.commercesuite.com.br/web_api',
    'http://loja.commercesuite.com.br/web_api',
    '', null, undefined, 'nao e url',
  ]) {
    assert.equal(enderecoDeLojaTray(destino, producao), null, `${JSON.stringify(destino)} tinha que ser recusado`);
  }
});

test('dominio proprio so passa depois de liberado em TRAY_DOMINIOS', () => {
  const destino = 'https://www.lojadocliente.com.br/web_api';
  assert.equal(enderecoDeLojaTray(destino, producao), null);

  const guardado = process.env.TRAY_DOMINIOS;
  process.env.TRAY_DOMINIOS = 'lojadocliente.com.br, outra.com.br';
  try {
    assert.equal(enderecoDeLojaTray(destino, producao).hostname, 'www.lojadocliente.com.br');
    // Liberar um dominio nao pode liberar quem apenas termina parecido.
    assert.equal(enderecoDeLojaTray('https://malolojadocliente.com.br/web_api', producao), null);
  } finally {
    if (guardado === undefined) delete process.env.TRAY_DOMINIOS;
    else process.env.TRAY_DOMINIOS = guardado;
  }
});

test('fora de producao o http local continua servindo para desenvolvimento', () => {
  const url = enderecoDeLojaTray('http://loja.commercesuite.com.br/web_api', { exigirHttps: false });
  assert.equal(url.protocol, 'http:');
});
