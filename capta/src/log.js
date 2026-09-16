/**
 * Log estruturado. Nunca receba email, telefone ou nome completo aqui: id
 * resolve para investigar e nao transforma o destino do log num deposito de
 * dado pessoal de cliente de cliente.
 */

const PROIBIDOS = new Set([
  'email', 'telefone', 'whatsapp', 'nome', 'senha', 'senha_hash', 'credenciais',
  'access_token', 'refresh_token', 'consumer_key', 'consumer_secret',
  'client_secret', 'chave_api', 'chave_aplicacao', 'segredo_webhook',
  'bilhete', 'token', 'token_hash', 'cookie', 'authorization',
]);

/**
 * A limpeza desce nos objetos aninhados. Antes ela so olhava o primeiro
 * nivel, entao um `{ dados: { access_token } }` passava inteiro para o log.
 * Nenhuma chamada fazia isso hoje, mas a proxima faria, e log e para sempre.
 */
function limpar(campos, profundidade = 0) {
  const saida = {};
  for (const [chave, valor] of Object.entries(campos || {})) {
    if (PROIBIDOS.has(chave.toLowerCase())) {
      saida[chave] = '[removido]';
      continue;
    }
    if (valor instanceof Error) {
      saida[chave] = valor.message;
    } else if (valor && typeof valor === 'object' && !Array.isArray(valor) && profundidade < 3) {
      saida[chave] = limpar(valor, profundidade + 1);
    } else {
      saida[chave] = valor;
    }
  }
  return saida;
}

function emitir(nivel, evento, campos) {
  const linha = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    evento,
    ...limpar(campos),
  });
  if (nivel === 'erro') console.error(linha);
  else console.log(linha);
}

export const log = {
  info: (evento, campos) => emitir('info', evento, campos),
  aviso: (evento, campos) => emitir('aviso', evento, campos),
  erro: (evento, campos) => emitir('erro', evento, campos),
};
