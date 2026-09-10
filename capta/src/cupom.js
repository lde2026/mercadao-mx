import crypto from 'node:crypto';

/**
 * Alfabeto sem 0, O, 1, I e L. O cupom e lido em voz alta e digitado a mao no
 * checkout, e cada caractere ambiguo vira chamado de suporte.
 */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TAMANHO = 6;

/**
 * randomInt do crypto e nao Math.random: cupom adivinhavel e desconto de graca
 * para quem descobrir o padrao, e sequencial entrega o volume de vendas da
 * loja de brinde.
 */
function sorteio(tamanho) {
  let saida = '';
  for (let i = 0; i < tamanho; i += 1) {
    saida += ALFABETO[crypto.randomInt(ALFABETO.length)];
  }
  return saida;
}

function normalizarPrefixo(nomeLoja) {
  const limpo = String(nomeLoja || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return (limpo.slice(0, 6) || 'CUPOM');
}

/**
 * O prefixo com o nome da loja existe para o lojista reconhecer o cupom no
 * relatorio dele sem precisar consultar nosso painel.
 */
export function gerarCodigo(nomeLoja) {
  return `${normalizarPrefixo(nomeLoja)}-${sorteio(TAMANHO)}`;
}

/** Espaco de 31^6, cerca de 887 milhoes, mas colisao existe e o banco recusa. */
export function gerarCodigoUnico(nomeLoja, jaExiste, tentativas = 5) {
  for (let i = 0; i < tentativas; i += 1) {
    const codigo = gerarCodigo(nomeLoja);
    if (!jaExiste(codigo)) return codigo;
  }
  throw new Error('nao foi possivel gerar codigo de cupom unico');
}
