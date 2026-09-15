import { pedir } from './adapters/http.js';

/**
 * Confere a integracao com o Asaas usando a chave do .env.
 *
 * Com chave de sandbox, monta o fluxo inteiro: cria um cliente de teste,
 * uma assinatura e cancela em seguida. Com chave de producao, faz so
 * leitura, porque cliente e cobranca criados em producao sao reais.
 */

const chave = process.env.ASAAS_API_KEY || '';
if (!chave) {
  console.error('ASAAS_API_KEY ausente no .env');
  process.exit(1);
}

const producao = chave.startsWith('$aact_prod');
const base = process.env.ASAAS_BASE || (producao ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3');
const cabecalhos = { access_token: chave, 'Content-Type': 'application/json' };

console.log(`ambiente: ${producao ? 'PRODUCAO (so leitura)' : 'sandbox'}`);
console.log(`base: ${base}`);

const conta = await pedir(`${base}/myAccount`, { headers: cabecalhos }, { plataforma: 'asaas' });
console.log(`conta: ${conta.name || conta.email || '(sem nome)'}`);

if (producao) {
  const clientes = await pedir(`${base}/customers?limit=1`, { headers: cabecalhos }, { plataforma: 'asaas' });
  console.log(`clientes cadastrados: ${clientes.totalCount ?? '?'}`);
  console.log('ok: chave de producao valida. Nada foi criado.');
  process.exit(0);
}

const cliente = await pedir(`${base}/customers`, {
  method: 'POST', headers: cabecalhos,
  body: JSON.stringify({ name: 'Teste Capta', email: 'teste@capta.local', cpfCnpj: '24971563792' }),
}, { plataforma: 'asaas' });
console.log(`cliente criado: ${cliente.id}`);

const proximo = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const assinatura = await pedir(`${base}/subscriptions`, {
  method: 'POST', headers: cabecalhos,
  body: JSON.stringify({
    customer: cliente.id, billingType: 'UNDEFINED', value: 99, nextDueDate: proximo,
    cycle: 'MONTHLY', description: 'Capta essencial mensal (teste)',
  }),
}, { plataforma: 'asaas' });
console.log(`assinatura criada: ${assinatura.id} (${assinatura.cycle}, R$ ${assinatura.value})`);

await pedir(`${base}/subscriptions/${assinatura.id}`, { method: 'DELETE', headers: cabecalhos }, { plataforma: 'asaas' });
console.log('assinatura cancelada. ok: o fluxo que o painel usa funciona neste ambiente.');
