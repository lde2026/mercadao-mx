import { consultar } from './db.js';
import { log } from './log.js';

/**
 * Guarda a rede, nunca o IP inteiro. IP completo amarrado a pessoa
 * identificada e dado pessoal que nao precisamos para nada: /24 no IPv4 e
 * /48 no IPv6 bastam para separar ruido de trafego real.
 */
export function mascararIp(ip) {
  if (!ip) return null;
  const limpo = String(ip).replace(/^::ffff:/, '').split(',')[0].trim();

  if (limpo.includes(':')) {
    const blocos = limpo.split(':');
    return `${blocos.slice(0, 3).join(':')}::/48`;
  }
  const partes = limpo.split('.');
  if (partes.length !== 4) return null;
  return `${partes[0]}.${partes[1]}.${partes[2]}.0/24`;
}

const TIPOS = new Set(['pagina', 'produto', 'carrinho', 'busca', 'saida']);

export function tipoValido(tipo) {
  return TIPOS.has(tipo);
}

/**
 * Grava um evento de navegacao. Chega do rastreador no navegador do visitante,
 * entao nada aqui confia no corpo: tipo e da lista fechada, texto e cortado, e
 * conta e conexao saem da chave da loja, nunca do que o cliente mandou.
 */
export async function registrarEvento({ conexao, anonimoId, tipo, url, titulo, dados, ip }) {
  if (!tipoValido(tipo)) return null;

  const { rows } = await consultar(
    `insert into eventos (conta_id, conexao_id, anonimo_id, tipo, url, titulo, dados, rede_mascarada, lead_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8,
             (select id from leads
               where conexao_id = $2 and anonimo_id = $3
               order by criado_em desc limit 1))
     returning id`,
    [
      conexao.conta_id, conexao.id, anonimoId, tipo,
      String(url || '').slice(0, 500),
      String(titulo || '').slice(0, 200),
      JSON.stringify(dados || {}),
      mascararIp(ip),
    ],
  );
  return rows[0];
}

/**
 * Costura a navegacao anonima com o lead que acabou de se identificar.
 *
 * As tres condicoes do where sao a diferenca entre funcionar e vazar:
 *
 * conexao_id fecha o escopo na loja. O anonimo_id nasce no navegador do
 * visitante e nao e segredo nosso, entao casar so por ele deixaria a
 * navegacao de uma pessoa na loja A aparecer no perfil de outra na loja B.
 *
 * conta_id e conferido junto porque a conexao pode ter trocado de dono por
 * engano de operacao, e a consulta nao pode depender disso estar certo.
 *
 * lead_id is null impede roubo de evento ja atribuido. Sem isso, um segundo
 * lead reaproveitando o mesmo navegador levaria embora o historico do
 * primeiro, que e exatamente o vazamento entre pessoas.
 */
export async function costurarEventos({ conexaoId, anonimoId, leadId, contaId }) {
  if (!conexaoId || !anonimoId || !leadId || !contaId) {
    throw new Error('costurarEventos exige conexaoId, anonimoId, leadId e contaId');
  }

  const { rowCount } = await consultar(
    `update eventos set lead_id = $1
      where conexao_id = $2
        and anonimo_id = $3
        and conta_id = $4
        and lead_id is null`,
    [leadId, conexaoId, anonimoId, contaId],
  );

  log.info('eventos.costurados', {
    conta_id: contaId, conexao_id: conexaoId, lead_id: leadId, eventos: rowCount,
  });
  return rowCount;
}

/**
 * Linha do tempo de navegacao do lead. Recebe contaId porque saber o id de um
 * lead nao prova ser dono dele, e aqui o que sai e o historico de uma pessoa.
 */
export async function perfilDoLead(contaId, leadId, { limite = 200 } = {}) {
  const { rows: leads } = await consultar(
    `select l.id, l.nome, l.email, l.telefone, l.respostas, l.criado_em,
            l.consentido_em, l.anonimo_id, cx.nome_loja, cx.plataforma
       from leads l join conexoes cx on cx.id = l.conexao_id
      where l.id = $1 and l.conta_id = $2`,
    [leadId, contaId],
  );
  const lead = leads[0];
  if (!lead) return null;

  const { rows: linha } = await consultar(
    `select tipo, url, titulo, dados, criado_em
       from eventos
      where lead_id = $1 and conta_id = $2
      order by criado_em`,
    [leadId, contaId],
  );

  const { rows: cupons } = await consultar(
    `select codigo, desconto, status, erro, criado_em
       from cupons where lead_id = $1 and conta_id = $2`,
    [leadId, contaId],
  );

  const { rows: pedidos } = await consultar(
    `select id_externo, valor, cupom_codigo, feito_em
       from pedidos where lead_id = $1 and conta_id = $2 order by feito_em`,
    [leadId, contaId],
  );

  return {
    lead,
    cupom: cupons[0] || null,
    linhaDoTempo: linha.slice(0, limite),
    pedidos,
    faturado: pedidos.reduce((soma, p) => soma + Number(p.valor), 0),
  };
}

/** Exclusao por titular. A cascade do banco leva evento e cupom junto. */
export async function esquecerLead(contaId, leadId) {
  const { rowCount } = await consultar(
    `delete from leads where id = $1 and conta_id = $2`, [leadId, contaId],
  );
  if (rowCount) log.info('lead.esquecido', { conta_id: contaId, lead_id: leadId });
  return rowCount > 0;
}
