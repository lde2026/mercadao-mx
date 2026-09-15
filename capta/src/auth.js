import { assinar, compararConstante, conferirSenha, hashSenha } from './cripto.js';
import * as repo from './repositorio.js';
import { calcularAcesso } from './billing/acesso.js';
import { log } from './log.js';

const COOKIE = 'capta_sessao';

function segredo() {
  const valor = process.env.SEGREDO_SESSAO;
  if (!valor) throw new Error('SEGREDO_SESSAO ausente');
  return valor;
}

/**
 * O cookie leva id e assinatura. A assinatura nao substitui a consulta no
 * banco, ela poupa a consulta quando o cookie foi adulterado: sessao revogada
 * precisa morrer na hora, entao o banco continua sendo a autoridade.
 */
export function montarCookie(sessaoId) {
  const valor = `${sessaoId}.${assinar(sessaoId, segredo())}`;
  const producao = process.env.NODE_ENV === 'production';
  return [
    `${COOKIE}=${valor}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${14 * 24 * 3600}`,
    producao ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function limparCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`;
}

function lerCookie(req) {
  const cru = req.headers.cookie || '';
  for (const parte of cru.split(';')) {
    const [nome, ...resto] = parte.trim().split('=');
    if (nome !== COOKIE) continue;
    const valor = resto.join('=');
    const corte = valor.lastIndexOf('.');
    if (corte < 1) return null;
    const id = valor.slice(0, corte);
    if (!compararConstante(valor.slice(corte + 1), assinar(id, segredo()))) return null;
    return id;
  }
  return null;
}

export async function carregarConta(req, _res, proximo) {
  const sessaoId = lerCookie(req);
  if (sessaoId) {
    const sessao = await repo.buscarSessao(sessaoId);
    if (sessao) {
      req.conta = { id: sessao.conta_id, nome: sessao.nome, email: sessao.email };
      req.sessaoId = sessaoId;
    }
  }
  proximo();
}

/**
 * Operador e quem administra o Captapp, nao o lojista. A lista vem do ambiente
 * e nao de coluna no banco, para nao existir rota capaz de promover alguem.
 */
export function ehOperador(email) {
  const lista = (process.env.OPERADOR_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return lista.includes(String(email || '').toLowerCase());
}

export function exigirOperador(req, res, proximo) {
  if (!req.conta || !ehOperador(req.conta.email)) {
    return res.status(403).json({ erro: 'somente operador' });
  }
  proximo();
}

export function exigirConta(req, res, proximo) {
  if (!req.conta) return res.status(401).json({ erro: 'nao autenticado' });
  proximo();
}

/**
 * No dia 10 de atraso o painel fica so leitura. Bloquear por metodo, e nao
 * rota a rota, evita que uma rota nova nasca sem a trava por esquecimento.
 */
export async function aplicarRegua(req, res, proximo) {
  if (!req.conta) return proximo();
  const [assinatura, abertas, leadsNoMes] = await Promise.all([
    repo.assinaturaDaConta(req.conta.id),
    repo.cobrancasEmAberto(req.conta.id),
    repo.leadsNoMes(req.conta.id),
  ]);
  req.acesso = calcularAcesso({ assinatura, cobrancasAbertas: abertas, leadsNoMes });

  const escrita = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (escrita && req.acesso.painel === 'leitura' && !req.path.startsWith('/api/sair')) {
    return res.status(402).json({
      erro: 'painel em leitura por pendencia financeira',
      motivo: req.acesso.motivo,
      diasAtraso: req.acesso.diasAtraso,
    });
  }
  proximo();
}

// Hash descartavel de um scrypt real, usado quando o email nao existe.
const HASH_FALSO = hashSenha('conta-inexistente');

export async function entrar(email, senha) {
  const conta = await repo.buscarContaPorEmail(email);

  // O scrypt roda sempre, inclusive quando o email nao existe. Pular a
  // verificacao no caminho sem conta responderia em microssegundos em vez de
  // dezenas de milissegundos, e o formulario de login viraria uma lista de
  // quem tem conta aqui.
  const senhaConfere = conferirSenha(senha, conta ? conta.senha_hash : HASH_FALSO);

  if (!conta || !senhaConfere) {
    log.aviso('login.negado', {});
    return null;
  }
  const sessaoId = await repo.criarSessao(conta.id);
  log.info('login.aceito', { conta_id: conta.id });
  return { conta, sessaoId };
}
