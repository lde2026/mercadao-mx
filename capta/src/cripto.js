import crypto from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const PREFIXO = 'v1';

let chaveCache = null;

function chave() {
  if (chaveCache) return chaveCache;
  const hex = process.env.CHAVE_CREDENCIAIS || '';
  if (hex.length !== 64) {
    throw new Error(
      'CHAVE_CREDENCIAIS ausente ou invalida. Esperado 32 bytes em hexadecimal.',
    );
  }
  chaveCache = Buffer.from(hex, 'hex');
  return chaveCache;
}

/**
 * O IV vai junto do texto cifrado porque precisa ser diferente a cada escrita
 * e nao e segredo. O prefixo de versao existe para permitir rotacao de chave
 * sem precisar adivinhar o formato do que ja esta gravado.
 */
export function cifrar(valor) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv(ALGORITMO, chave(), iv);
  const texto = Buffer.concat([
    cifra.update(JSON.stringify(valor), 'utf8'),
    cifra.final(),
  ]);
  const tag = cifra.getAuthTag();
  return [PREFIXO, iv.toString('base64'), tag.toString('base64'), texto.toString('base64')].join('.');
}

export function decifrar(guardado) {
  if (typeof guardado !== 'string') throw new Error('credenciais em formato inesperado');
  const [versao, iv, tag, texto] = guardado.split('.');
  if (versao !== PREFIXO) throw new Error('versao de cifra desconhecida');
  const decifra = crypto.createDecipheriv(ALGORITMO, chave(), Buffer.from(iv, 'base64'));
  decifra.setAuthTag(Buffer.from(tag, 'base64'));
  const aberto = Buffer.concat([
    decifra.update(Buffer.from(texto, 'base64')),
    decifra.final(),
  ]);
  return JSON.parse(aberto.toString('utf8'));
}

export function gerarChavePublica() {
  return 'pk_' + crypto.randomBytes(16).toString('hex');
}

/** Hash de senha com scrypt, que ja vem no Node e nao adiciona dependencia. */
export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const derivada = crypto.scryptSync(senha, sal, 64, { N: 16384, r: 8, p: 1 });
  return ['scrypt', sal.toString('base64'), derivada.toString('base64')].join('$');
}

export function conferirSenha(senha, guardado) {
  try {
    const [algoritmo, sal, esperada] = String(guardado).split('$');
    if (algoritmo !== 'scrypt') return false;
    const alvo = Buffer.from(esperada, 'base64');
    const derivada = crypto.scryptSync(senha, Buffer.from(sal, 'base64'), alvo.length, {
      N: 16384, r: 8, p: 1,
    });
    return crypto.timingSafeEqual(alvo, derivada);
  } catch {
    return false;
  }
}

export function assinar(valor, segredo) {
  return crypto.createHmac('sha256', segredo).update(valor).digest('base64url');
}

export function compararConstante(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
