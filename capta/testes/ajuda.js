import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Definido antes de qualquer import de src, porque cripto.js le a chave na
// primeira cifra e o pool le a URL na criacao.
process.env.CHAVE_CREDENCIAIS ||= crypto.randomBytes(32).toString('hex');
process.env.DATABASE_URL ||= 'postgres://postgres@localhost:5432/capta_teste';
process.env.SEGREDO_SESSAO ||= 'segredo-de-teste';
process.env.URL_PUBLICA ||= 'http://localhost:3000';

const aqui = path.dirname(fileURLToPath(import.meta.url));

export async function prepararBanco() {
  const { pool } = await import('../src/db.js');
  const sql = fs.readFileSync(path.join(aqui, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(`drop schema public cascade; create schema public;`);
  await pool.query(sql);
  return pool;
}

export async function contaDeTeste(nome, email) {
  const repo = await import('../src/repositorio.js');
  return repo.criarConta({ nome, email, senha: 'senha-de-teste-123' });
}

export async function conexaoDeTeste(contaId, plataforma, nomeLoja, credenciais = {}) {
  const repo = await import('../src/repositorio.js');
  return repo.criarConexao({
    contaId, plataforma, nomeLoja,
    credenciais: { access_token: 'token-de-teste', ...credenciais },
    modoInstalacao: 'auto',
  });
}
