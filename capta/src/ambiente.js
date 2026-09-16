import { log } from './log.js';

/**
 * Conferencia do ambiente antes de aceitar a primeira requisicao.
 *
 * Sem isso, chave ausente so aparece quando alguem usa a funcionalidade: o
 * deploy sobe verde, o monitoramento diz que esta tudo bem, e o defeito
 * estoura no primeiro login de cliente, ou pior, na primeira entrega de
 * cupom de madrugada. Falhar no boot troca esse susto por um deploy que nao
 * completa.
 *
 * A separacao entre parar e avisar e deliberada: falta o que cifra credencial
 * ou assina sessao, o processo nao sobe. Falta o que so desliga um recurso,
 * como e-mail ou cobranca automatica, ele sobe e registra o que ficou de fora.
 */

function exigido(nome, valida, comoResolver) {
  const valor = process.env[nome];
  if (!valor) return `${nome} ausente. ${comoResolver}`;
  const erro = valida ? valida(valor) : null;
  return erro ? `${nome}: ${erro}` : null;
}

export function conferirAmbiente({ producao = process.env.NODE_ENV === 'production' } = {}) {
  const paradas = [
    exigido('DATABASE_URL', null, 'Aponte para o Postgres.'),
    exigido(
      'CHAVE_CREDENCIAIS',
      (v) => (/^[0-9a-f]{64}$/i.test(v)
        ? null
        : 'esperado 32 bytes em hexadecimal, 64 caracteres. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'),
      'E ela que cifra a credencial das lojas dos clientes.',
    ),
    exigido(
      'SEGREDO_SESSAO',
      (v) => (v.length >= 32 ? null : 'curto demais, use pelo menos 32 caracteres aleatorios'),
      'E ele que assina o cookie de sessao do painel.',
    ),
  ].filter(Boolean);

  const avisos = [];
  if (!process.env.URL_PUBLICA) {
    avisos.push('URL_PUBLICA ausente: os links de e-mail e o callback de OAuth vao sair apontando para localhost.');
  } else if (producao && !process.env.URL_PUBLICA.startsWith('https://')) {
    paradas.push('URL_PUBLICA: em producao precisa ser https, senao o cookie de sessao sai sem Secure e o widget e bloqueado por conteudo misto.');
  }
  if (producao && process.env.CHAVE_CREDENCIAIS === process.env.SEGREDO_SESSAO) {
    paradas.push('CHAVE_CREDENCIAIS e SEGREDO_SESSAO estao iguais: uma vaza a outra. Gere duas.');
  }
  if (!process.env.OPERADOR_EMAILS) {
    avisos.push('OPERADOR_EMAILS vazio: ninguem tem acesso ao painel de operador nem recebe alerta de falha.');
  }
  if (!process.env.EMAIL_PROVEDOR) {
    avisos.push('EMAIL_PROVEDOR vazio: nenhum e-mail sai. Cupom atrasado, aviso de lead, cobranca e recuperacao de senha viram linha de log.');
  }
  if (!process.env.ASAAS_CHAVE) {
    avisos.push('ASAAS_CHAVE vazio: a cobranca fica manual, a troca de plano vale na hora mas nao gera fatura.');
  } else if (!process.env.ASAAS_WEBHOOK_TOKEN) {
    paradas.push('ASAAS_WEBHOOK_TOKEN ausente com ASAAS_CHAVE presente: o webhook de pagamento recusaria tudo, e conta paga ficaria como inadimplente.');
  }

  return { paradas, avisos };
}

/** Chamado no boot. Registra os avisos e derruba o processo nas paradas. */
export function exigirAmbiente(opcoes) {
  const { paradas, avisos } = conferirAmbiente(opcoes);
  for (const aviso of avisos) log.aviso('ambiente.incompleto', { detalhe: aviso });
  if (!paradas.length) return;
  for (const parada of paradas) log.erro('ambiente.invalido', { detalhe: parada });
  throw new Error(`ambiente invalido, o servidor nao sobe:\n  - ${paradas.join('\n  - ')}`);
}
