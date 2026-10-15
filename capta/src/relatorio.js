import { consultar } from './db.js';

/**
 * O resumo da semana da conta.
 *
 * Existe por um motivo de retencao, nao de produto: o lojista instala o
 * Captapp, o chat passa a captar sozinho e ele para de abrir o painel. Dois
 * meses depois ele ve a cobranca e nao lembra o que aquilo faz. O relatorio
 * chega na caixa dele dizendo quantas pessoas o chat trouxe e quanto delas
 * virou pedido, que e a unica pergunta que importa na hora de renovar.
 *
 * Tudo aqui e filtrado por conta, como o resto do repositorio: um relatorio
 * que some uma loja de outro cliente seria o pior vazamento possivel, porque
 * sai por e-mail e nao da para voltar atras.
 */

export const DIAS = 7;

/**
 * Numeros da semana, com a semana anterior do lado para dar sentido a eles.
 *
 * "12 leads" sozinho nao diz nada. "12 leads, contra 7 na semana passada"
 * diz, e e o que faz o lojista continuar lendo ate a linha do faturamento.
 */
export async function resumoDaSemana(contaId, agora = new Date()) {
  const fim = agora;
  const inicio = new Date(fim.getTime() - DIAS * 24 * 3600 * 1000);
  const inicioAnterior = new Date(inicio.getTime() - DIAS * 24 * 3600 * 1000);

  const { rows } = await consultar(
    `with janela as (
       select $2::timestamptz as inicio, $3::timestamptz as fim, $4::timestamptz as inicio_anterior
     )
     select
       (select count(*) from leads l, janela j
         where l.conta_id = $1 and l.criado_em >= j.inicio and l.criado_em < j.fim)::int as leads,
       (select count(*) from leads l, janela j
         where l.conta_id = $1 and l.criado_em >= j.inicio_anterior and l.criado_em < j.inicio)::int as leads_antes,
       (select count(*) from leads l, janela j
         where l.conta_id = $1 and l.criado_em >= j.inicio and l.criado_em < j.fim
           and l.contatado_em is null)::int as sem_contato,
       (select count(*) from cupons c, janela j
         where c.conta_id = $1 and c.criado_em >= j.inicio and c.criado_em < j.fim
           and c.status in ('criado','usado'))::int as cupons,
       (select count(*) from pedidos p, janela j
         where p.conta_id = $1 and p.lead_id is not null
           and p.feito_em >= j.inicio and p.feito_em < j.fim)::int as pedidos,
       (select coalesce(sum(p.valor), 0) from pedidos p, janela j
         where p.conta_id = $1 and p.lead_id is not null
           and p.feito_em >= j.inicio and p.feito_em < j.fim) as faturamento`,
    [contaId, inicio.toISOString(), fim.toISOString(), inicioAnterior.toISOString()],
  );

  const linha = rows[0];
  return {
    inicio,
    fim,
    leads: linha.leads,
    leadsAntes: linha.leads_antes,
    semContato: linha.sem_contato,
    cupons: linha.cupons,
    pedidos: linha.pedidos,
    faturamento: Number(linha.faturamento) || 0,
  };
}

/**
 * Vale a pena mandar?
 *
 * Semana parada acontece, e um relatorio de zero com um empurrao do lado e
 * util. Duas semanas paradas seguidas e outra coisa: a loja nao esta usando o
 * produto, e insistir por e-mail so ensina a pessoa a marcar como spam.
 */
export function valeMandar(resumo) {
  return resumo.leads > 0 || resumo.leadsAntes > 0;
}
