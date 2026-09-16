import pg from 'pg';

// numeric volta como string por padrao no pg, e valor de pedido somado como
// string vira concatenacao silenciosa no relatorio de faturamento.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

/**
 * TLS na conexao com o banco.
 *
 * Banco gerenciado fora da plataforma (Supabase, Neon, RDS) atravessa a
 * internet publica e exige TLS. Banco na rede privada da propria plataforma
 * (Postgres do Railway, por exemplo) nao usa, e forcar quebraria a subida.
 *
 * Por isso a escolha e explicita em vez de adivinhada: um deploy que conecta
 * em claro por causa de um `sslmode` esquecido na string e o tipo de erro que
 * ninguem percebe, porque funciona.
 */
function tls() {
  const escolha = (process.env.DATABASE_SSL || '').toLowerCase();
  if (escolha === '1' || escolha === 'sim') return { rejectUnauthorized: true };
  // Certificado proprio ou cadeia que o Node nao conhece. Ainda cifra, mas
  // nao prova com quem esta falando: use so se nao houver alternativa.
  if (escolha === 'sem-verificar') return { rejectUnauthorized: false };
  // Vazio: quem manda e a string de conexao (sslmode=require e afins).
  return undefined;
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: tls(),
  max: Number(process.env.BANCO_CONEXOES) || 10,
  idleTimeoutMillis: 30_000,
  // Banco gerenciado longe do app pode demorar a responder no primeiro aperto
  // de mao; sem teto, a requisicao fica pendurada em vez de falhar e reiniciar.
  connectionTimeoutMillis: 10_000,
});

export function consultar(texto, valores) {
  return pool.query(texto, valores);
}

export async function emTransacao(trabalho) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const resultado = await trabalho(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (erro) {
    await cliente.query('rollback');
    throw erro;
  } finally {
    cliente.release();
  }
}
