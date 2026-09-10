import { pool, consultar } from './db.js';

/**
 * Responde, sem abrir navegador: quantos leads entraram hoje, em quais lojas,
 * e quantos cupons falharam.
 */

const { rows: lojas } = await consultar(
  `select ct.nome as conta, cx.nome_loja, cx.plataforma,
          count(l.id) as leads,
          count(*) filter (where cp.status = 'criado') as cupons_ok,
          count(*) filter (where cp.status = 'falhou') as cupons_falhos
     from conexoes cx
     join contas ct on ct.id = cx.conta_id
     left join leads l on l.conexao_id = cx.id and l.criado_em >= current_date
     left join cupons cp on cp.lead_id = l.id
    group by ct.nome, cx.id, cx.nome_loja, cx.plataforma
    order by leads desc, cx.nome_loja`,
);

const { rows: alertas } = await consultar(
  `select tipo, count(*) as total from alertas
    where resolvido = false and criado_em >= current_date
    group by tipo order by total desc`,
);

console.log(`\nCapta, ${new Date().toLocaleDateString('pt-BR')}\n`);
console.log('LOJA                  PLATAFORMA        LEADS  CUPONS OK  FALHOS');
console.log('-'.repeat(66));
for (const l of lojas) {
  console.log(
    l.nome_loja.padEnd(22)
    + l.plataforma.padEnd(18)
    + String(l.leads).padStart(5)
    + String(l.cupons_ok).padStart(11)
    + String(l.cupons_falhos).padStart(8),
  );
}
const soma = (campo) => lojas.reduce((t, l) => t + Number(l[campo]), 0);
console.log('-'.repeat(66));
console.log('TOTAL'.padEnd(40) + String(soma('leads')).padStart(5)
  + String(soma('cupons_ok')).padStart(11) + String(soma('cupons_falhos')).padStart(8));

if (alertas.length) {
  console.log('\nAlertas abertos hoje:');
  for (const a of alertas) console.log(`  ${a.total}x ${a.tipo}`);
} else {
  console.log('\nNenhum alerta aberto hoje.');
}
console.log();

await pool.end();
