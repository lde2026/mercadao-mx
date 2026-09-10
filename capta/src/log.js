/**
 * Log estruturado. Nunca receba email, telefone ou nome completo aqui: id
 * resolve para investigar e nao transforma o destino do log num deposito de
 * dado pessoal de cliente de cliente.
 */

const PROIBIDOS = new Set([
  'email', 'telefone', 'whatsapp', 'nome', 'senha', 'credenciais',
  'access_token', 'refresh_token', 'consumer_secret', 'chave_api',
]);

function limpar(campos) {
  const saida = {};
  for (const [chave, valor] of Object.entries(campos || {})) {
    if (PROIBIDOS.has(chave)) {
      saida[chave] = '[removido]';
      continue;
    }
    saida[chave] = valor instanceof Error ? valor.message : valor;
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
