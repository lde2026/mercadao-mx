import { consultar } from './db.js';
import { log } from './log.js';
import { adaptador } from './adapters/index.js';
import { calcularAcesso, DEGRAUS } from './billing/acesso.js';
import { gerarCodigo } from './cupom.js';
import { enviar, cupomAtrasado } from './email.js';
import * as repo from './repositorio.js';
import { credenciaisProntas } from './credenciais.js';

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
      const acesso = await acessoDaConta(conexao.conta_id);
      // Conta cortada nao gera trabalho de varredura, mas o que ja foi
      // atribuido continua no painel.
      if (!acesso.widget) continue;

      const credenciais = await credenciaisProntas(conexao);
      const desde = conexao.varrido_em
        ? new Date(conexao.varrido_em)
        : new Date(Date.now() - 7 * 24 * 3600 * 1000);

      const pedidos = await adaptador(conexao.plataforma).listarPedidos(credenciais, desde);
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
        codigo = await repo.tirarDoLote(cupom.conexao_id, cupom.lead_id);
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

async function acessoDaConta(contaId) {
  const [assinatura, abertas] = await Promise.all([
    repo.assinaturaDaConta(contaId),
    repo.cobrancasEmAberto(contaId),
  ]);
  return calcularAcesso({ assinatura, cobrancasAbertas: abertas });
}

export function agendar() {
  const meiaHora = MINUTOS_VARREDURA * 60 * 1000;
  setInterval(() => { varrerPedidos().catch(() => {}); }, meiaHora).unref();
  setInterval(() => { reenviarCuponsFalhos().catch(() => {}); }, 15 * 60 * 1000).unref();
  setInterval(() => { removerScriptsVencidos().catch(() => {}); }, 6 * 3600 * 1000).unref();
  setInterval(() => { repo.limparLimites().catch(() => {}); }, 3600 * 1000).unref();
  log.info('tarefas.agendadas', { varredura_minutos: MINUTOS_VARREDURA });
}
