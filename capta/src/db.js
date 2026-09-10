import pg from 'pg';

// numeric volta como string por padrao no pg, e valor de pedido somado como
// string vira concatenacao silenciosa no relatorio de faturamento.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
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
