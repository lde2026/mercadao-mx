import { pool } from './db.js';
import { hashSenha } from './cripto.js';
import * as repo from './repositorio.js';

/**
 * Cria ou atualiza a conta do operador.
 *
 *   npm run operador -- contato@lojadoecommerce.com.br 'senha'
 *   OPERADOR_EMAIL=... OPERADOR_SENHA_INICIAL=... node src/operador.js --se-configurado
 *
 * A segunda forma roda na subida do container: se as variaveis existirem, a
 * conta passa a existir no primeiro deploy sem ninguem abrir terminal. A
 * senha inicial e para o primeiro acesso; troque no painel depois.
 *
 * Ser operador de verdade depende do e-mail estar em OPERADOR_EMAILS; este
 * comando so cuida da conta e da senha.
 */

const seConfigurado = process.argv.includes('--se-configurado');
const email = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.env.OPERADOR_EMAIL || '').trim().toLowerCase();
const senha = process.argv[3] || process.env.OPERADOR_SENHA_INICIAL || '';
const nome = process.argv[4] || process.env.OPERADOR_NOME || 'Loja do E-commerce';

if (!email || !senha) {
  if (seConfigurado) process.exit(0);
  console.error('uso: npm run operador -- <email> <senha> [nome]');
  process.exit(1);
}
if (senha.length < 8) {
  console.error('senha de no minimo 8 caracteres');
  process.exit(1);
}

const existente = await repo.buscarContaPorEmail(email);
if (existente) {
  if (seConfigurado) {
    // Na subida do container a senha do ambiente e so a inicial: se a conta
    // ja existe, quem manda e a senha que o operador trocou no painel.
    console.log(`operador ${existente.id} ja existe, senha mantida`);
  } else {
    await repo.atualizarSenha(existente.id, senha);
    console.log(`operador ${existente.id} atualizado, senha trocada`);
  }
} else {
  const conta = await repo.criarConta({ nome, email, senha });
  console.log(`operador ${conta.id} criado`);
}

const lista = (process.env.OPERADOR_EMAILS || '').toLowerCase();
if (!lista.split(',').map((e) => e.trim()).includes(email)) {
  console.log(`aviso: ${email} nao esta em OPERADOR_EMAILS; sem isso a conta entra como lojista comum`);
}
await pool.end();
