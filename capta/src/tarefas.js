import { consultar } from './db.js';
import { log } from './log.js';
import { adaptador } from './adapters/index.js';
import { calcularAcesso, DEGRAUS } from './billing/acesso.js';
import * as repo from './repositorio.js';

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

      const credenciais = await repo.credenciaisDaConexao(conexao.conta_id, conexao.id);
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
      const credenciais = await repo.credenciaisDaConexao(conexao.conta_id, conexao.id);
      const api = adaptador(conexao.plataforma);
      if (api.removerScript && credenciais.id_script) {
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
  setInterval(() => { removerScriptsVencidos().catch(() => {}); }, 6 * 3600 * 1000).unref();
  setInterval(() => { repo.limparLimites().catch(() => {}); }, 3600 * 1000).unref();
  log.info('tarefas.agendadas', { varredura_minutos: MINUTOS_VARREDURA });
}
