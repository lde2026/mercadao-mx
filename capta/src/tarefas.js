import { consultar } from './db.js';
import { log } from './log.js';
import { adaptador } from './adapters/index.js';
import { calcularAcesso, DEGRAUS } from './billing/acesso.js';
import { gerarCodigo } from './cupom.js';
import { enviar, cupomAtrasado, clienteEsperando } from './email.js';
import * as repo from './repositorio.js';
import { credenciaisProntas } from './credenciais.js';
import { avisarCobranca } from './avisos.js';
import * as asaas from './billing/asaas.js';
import * as atendeai from './billing/atendeai.js';

/**
 * Trabalho de fundo. Duas tarefas, as duas por falta de alternativa:
 *
 * A Loja Integrada nao tem webhook de pedido, entao a atribuicao de
 * faturamento dela so existe se alguem for buscar de tempos em tempos.
 *
 * O dia 45 da regua remove o script da loja, e remocao e acao nossa na API da
 * plataforma, nao um estado que o painel possa so exibir.
 */

const MINUTOS_VARREDURA = 30;

export async function varrerPedidos() {
  const conexoes = await repo.conexoesParaVarrer(MINUTOS_VARREDURA);

  for (const conexao of conexoes) {
    try {
      // Hoje a consulta ja traz so quem tem API de pedidos. Esta linha e a
      // rede: o dia em que alguem acrescentar uma plataforma aquela lista sem
      // reparar nisso, a varredura pula em vez de estourar no meio do lote e
      // deixar as outras lojas sem varrer.
      const api = adaptador(conexao.plataforma);
      if (!api.listarPedidos) continue;

      const acesso = await acessoDaConta(conexao.conta_id);
      // Conta cortada nao gera trabalho de varredura, mas o que ja foi
      // atribuido continua no painel.
      if (!acesso.widget) continue;

      const credenciais = await credenciaisProntas(conexao);
      const desde = conexao.varrido_em
        ? new Date(conexao.varrido_em)
        : new Date(Date.now() - 7 * 24 * 3600 * 1000);

      const pedidos = await api.listarPedidos(credenciais, desde);
      let atribuidos = 0;
      for (const pedido of pedidos) {
        if (!pedido.cupomCodigo) continue;
        const gravado = await repo.registrarPedido({
          contaId: conexao.conta_id, conexaoId: conexao.id, ...pedido,
        });
        if (gravado?.lead_id) atribuidos += 1;
      }

      await repo.atualizarConexao(conexao.conta_id, conexao.id, {
        varrido_em: new Date().toISOString(),
      });
      log.info('varredura.concluida', {
        conta_id: conexao.conta_id, conexao_id: conexao.id,
        pedidos: pedidos.length, atribuidos,
      });
    } catch (erro) {
      log.erro('varredura.falhou', {
        conta_id: conexao.conta_id, conexao_id: conexao.id, motivo: erro.message,
      });
    }
  }
}

/**
 * Dia 45: o script sai da loja. So faz sentido onde a instalacao foi
 * automatica, porque nas manuais o codigo foi colado pelo lojista e sair de
 * la nao esta na nossa mao.
 */
export async function removerScriptsVencidos() {
  const { rows } = await consultar(
    `select distinct cx.id, cx.conta_id, cx.plataforma, cx.nome_loja
       from conexoes cx
      where cx.modo_instalacao = 'auto' and cx.status = 'ativa'
        and exists (
          select 1 from cobrancas c
           where c.conta_id = cx.conta_id and c.status = 'aberta'
             and c.vence_em < current_date - $1
        )`,
    [DEGRAUS.SCRIPT],
  );

  for (const conexao of rows) {
    try {
      const credenciais = await credenciaisProntas(conexao);
      const api = adaptador(conexao.plataforma);
      if (api.removerScript && credenciais?.id_script) {
        await api.removerScript(credenciais, credenciais.id_script);
      }
      await repo.atualizarConexao(conexao.conta_id, conexao.id, {
        modo_instalacao: 'pendente',
        detalhe_status: 'Script removido por inadimplencia. Volta na hora do pagamento, sem reimplantacao.',
      });
      log.aviso('script.removido', { conta_id: conexao.conta_id, conexao_id: conexao.id });
    } catch (erro) {
      log.erro('script.remocao_falhou', {
        conta_id: conexao.conta_id, conexao_id: conexao.id, motivo: erro.message,
      });
    }
  }
}

/**
 * Cupom que falhou na hora e lead que ouviu uma promessa e nao recebeu nada.
 * A API da loja costuma voltar sozinha, entao tentar de novo e entregar por
 * e-mail resolve a maioria dos casos antes do lojista ficar sabendo.
 *
 * A tentativa e limitada por idade: cupom que falha ha dois dias nao e
 * instabilidade, e configuracao errada, e insistir so gasta chamada.
 */
export async function reenviarCuponsFalhos() {
  const { rows } = await consultar(
    `select cp.id, cp.codigo, cp.desconto, cp.tipo, cp.conta_id, cp.conexao_id,
            l.id as lead_id, l.nome, l.email,
            cx.plataforma, cx.nome_loja
       from cupons cp
       join leads l on l.id = cp.lead_id
       join conexoes cx on cx.id = cp.conexao_id
      where cp.status = 'falhou'
        and cp.criado_em > now() - interval '2 days'
        and l.email is not null
      order by cp.criado_em
      limit 50`,
  );

  for (const cupom of rows) {
    try {
      const api = adaptador(cupom.plataforma);

      let codigo = cupom.codigo;
      if (api.criaCupomPorApi === false) {
        // No lote a falha anterior foi lote vazio, entao a segunda chance so
        // existe se o lojista tiver reposto os codigos.
        codigo = await repo.tirarDoLote(cupom.conta_id, cupom.conexao_id, cupom.lead_id);
        if (!codigo) continue;
      } else {
        const credenciais = await credenciaisProntas({
          conta_id: cupom.conta_id, id: cupom.conexao_id, plataforma: cupom.plataforma,
        });
        codigo = codigo || gerarCodigo(cupom.nome_loja);
        await api.criarCupom(credenciais, {
          codigo, desconto: cupom.desconto, frete: cupom.tipo === 'frete',
        });
      }

      await consultar(`update cupons set status = 'criado', erro = null, codigo = $1 where id = $2`,
        [codigo, cupom.id]);

      const mensagem = cupomAtrasado({
        nomeLead: cupom.nome.split(' ')[0],
        nomeLoja: cupom.nome_loja,
        codigo,
        desconto: cupom.desconto,
      });
      await enviar({ para: cupom.email, contaId: cupom.conta_id, ...mensagem });

      log.info('cupom.recuperado', {
        conta_id: cupom.conta_id, conexao_id: cupom.conexao_id, lead_id: cupom.lead_id,
      });
    } catch (erro) {
      log.aviso('cupom.recuperacao_falhou', {
        conta_id: cupom.conta_id, conexao_id: cupom.conexao_id,
        lead_id: cupom.lead_id, motivo: erro.message,
      });
    }
  }
}

/**
 * Aviso de cobranca por e-mail, um por degrau da regua. A regua em si nao
 * depende disto: o corte acontece pelo calculo de acesso em cada requisicao.
 * Isto e so o lojista ficar sabendo antes de descobrir pelo widget sumido.
 */
export async function avisarInadimplentes() {
  const contas = await repo.contasComAtraso();
  let enviados = 0;
  for (const conta of contas) {
    try {
      const acesso = await acessoDaConta(conta.id);
      if (await avisarCobranca({ conta, acesso })) enviados += 1;
    } catch (erro) {
      log.aviso('aviso.cobranca_falhou', { conta_id: conta.id, motivo: erro.message });
    }
  }
  if (contas.length) log.info('avisos.cobranca', { contas: contas.length, enviados });
}

async function acessoDaConta(contaId) {
  const [assinatura, abertas, conta] = await Promise.all([
    repo.assinaturaDaConta(contaId),
    repo.cobrancasEmAberto(contaId),
    repo.buscarConta(contaId),
  ]);
  return calcularAcesso({ assinatura, cobrancasAbertas: abertas, testeAte: conta?.teste_ate });
}

export function agendar() {
  const meiaHora = MINUTOS_VARREDURA * 60 * 1000;
  setInterval(() => { varrerPedidos().catch(() => {}); }, meiaHora).unref();
  setInterval(() => { reenviarCuponsFalhos().catch(() => {}); }, 15 * 60 * 1000).unref();
  setInterval(() => { removerScriptsVencidos().catch(() => {}); }, 6 * 3600 * 1000).unref();
  setInterval(() => { avisarInadimplentes().catch(() => {}); }, 6 * 3600 * 1000).unref();
  setInterval(() => { repo.limparLimites().catch(() => {}); }, 3600 * 1000).unref();
  setInterval(() => { repo.limparConexoesPendentes().catch(() => {}); }, 6 * 3600 * 1000).unref();
  // De seis em seis horas, e nao uma vez por mes: o processo reinicia a cada
  // deploy, e um agendamento mensal em memoria nunca chegaria no dia certo.
  // A marca no consumo e que garante uma fatura so.
  setInterval(() => { fecharExcedentes().catch(() => {}); }, 6 * 3600 * 1000).unref();
  setInterval(() => { repo.limparVistas().catch(() => {}); }, 12 * 3600 * 1000).unref();
  // De dez em dez minutos: quem esta do outro lado e um consumidor esperando
  // resposta, e meia hora de atraso ja e uma venda perdida.
  setInterval(() => { avisarConversasParadas().catch(() => {}); }, 10 * 60 * 1000).unref();
  log.info('tarefas.agendadas', { varredura_minutos: MINUTOS_VARREDURA });
}

/**
 * Fecha o excedente do mes anterior e manda para a fatura.
 *
 * O excedente nao pode ser assinatura: o valor muda todo mes e quase sempre e
 * zero. Entao ele vira cobranca avulsa, uma vez, depois que o mes fechou, e a
 * marca no consumo garante que rodar de novo nao cria a segunda.
 *
 * So fecha mes que ja acabou. Cobrar o mes corrente seria cobrar por
 * mensagem que ainda vai ser enviada.
 */
export async function fecharExcedentes(hoje = new Date()) {
  if (!asaas.configurado()) return { fechados: 0, motivo: 'asaas nao configurado' };

  const competencia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1))
    .toISOString().slice(0, 10);
  const contas = await repo.contasComAtendimentoCobravel();
  let fechados = 0;

  for (const conta of contas) {
    try {
      const marca = await repo.consumoDoMesDaConta(conta.id, competencia);
      if (!marca || marca.excedente_cobrado) continue;

      const situacao = atendeai.situacao(marca.enviadas, conta.faixa_atendimento);
      if (!situacao.excedente.mensagens) {
        // Sem excedente tambem se marca: evita reler o mesmo mes para sempre.
        await repo.marcarExcedenteCobrado(conta.id, competencia);
        continue;
      }

      const venceEm = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const cobranca = await asaas.cobrarExcedente({
        clienteExterno: conta.cliente_externo,
        venceEm,
        mensagens: situacao.excedente.mensagens,
        valor: situacao.excedente.valor,
        competencia: competencia.slice(0, 7),
      });
      await repo.registrarCobranca({
        contaId: conta.id, tipo: 'excedente', valor: situacao.excedente.valor,
        origem: 'asaas', idExterno: cobranca.id, venceEm,
      });
      await repo.marcarExcedenteCobrado(conta.id, competencia);
      fechados += 1;
      log.info('excedente.cobrado', { conta_id: conta.id, competencia });
    } catch (erro) {
      // Uma conta que falha nao pode travar o fecho das outras.
      log.erro('excedente.falhou', { conta_id: conta.id, motivo: erro.message });
    }
  }

  return { fechados, competencia };
}

/**
 * Avisa o lojista quando um cliente ficou esperando por ele.
 *
 * Isto so acontece em conversa que ele mesmo assumiu: ele mandou o agente
 * calar e depois nao voltou. Do lado de fora, quem espera e uma pessoa que
 * acha que falou com a loja, e o pior caso do produto e exatamente esse
 * silencio, porque nenhuma tela nossa grita sozinha.
 *
 * Um aviso por mensagem nova do cliente, nao um por rodada: a marca guarda
 * quando avisamos e so volta a avisar se ele escrever de novo.
 */
export async function avisarConversasParadas(minutos = 15) {
  const paradas = await repo.conversasEsperandoLojista(minutos);
  let avisadas = 0;

  for (const conversa of paradas) {
    const para = conversa.email_aviso || conversa.email;
    if (!para) continue;
    try {
      const espera = Math.round((Date.now() - new Date(conversa.ultima_em).getTime()) / 60000);
      const mensagem = clienteEsperando({
        nomeConta: conversa.conta_nome,
        quem: conversa.nome || conversa.cliente,
        ultimaFala: conversa.ultima_fala || '',
        minutos: espera,
        urlPainel: `${process.env.URL_PUBLICA || ''}/#/conversa/${conversa.id}`,
      });
      await enviar({ para, contaId: conversa.conta_id, ...mensagem });
      await repo.marcarConversaAvisada(conversa.conta_id, conversa.id);
      avisadas += 1;
    } catch (erro) {
      // Uma conta sem e-mail configurado nao pode travar o aviso das outras.
      log.aviso('conversa.aviso_falhou', { conta_id: conversa.conta_id, motivo: erro.message });
    }
  }

  return { avisadas };
}
