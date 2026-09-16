import { enviar, leadQuente, avisoDeCobranca, alertaOperador, recuperacaoSenha, loteAcabando } from './email.js';
import { ehOperador } from './auth.js';
import { log } from './log.js';
import * as repo from './repositorio.js';

/**
 * Quem recebe e-mail de que. Os textos vivem em email.js; aqui fica a
 * decisao de mandar ou nao, para quem, e a trava contra enxurrada.
 *
 * Nada aqui pode derrubar o fluxo principal: lead gravado e cupom entregue
 * valem mais do que qualquer aviso, entao toda funcao engole o proprio erro
 * e deixa uma linha de log.
 */

const URL_PUBLICA = () => process.env.URL_PUBLICA || 'http://localhost:3000';

/** Lead novo com contato: o lojista recebe na hora, se quiser. */
export async function avisarLeadNovo({ conexao, lead }) {
  try {
    const conta = await repo.buscarConta(conexao.conta_id);
    if (!conta || conta.avisar_lead === false) return;
    const para = conta.email_aviso || conta.email;
    if (!para) return;
    const mensagem = leadQuente({
      nomeConta: conta.nome,
      nomeLead: lead.nome,
      nomeLoja: conexao.nome_loja,
      telefone: lead.telefone || lead.email || 'nao informado',
      respostas: lead.respostas || [],
      urlPainel: `${URL_PUBLICA()}/#/lead/${lead.id}`,
    });
    await enviar({ para, contaId: conta.id, ...mensagem });
  } catch (erro) {
    log.aviso('aviso.lead_falhou', { conta_id: conexao.conta_id, motivo: erro.message });
  }
}

/**
 * Lote de cupons acabando, na plataforma que nao cria cupom por API. Avisa
 * antes de zerar, porque depois de zerado o estrago ja aconteceu: o lead
 * ouviu a promessa e nao recebeu codigo.
 */
const PISO_DO_LOTE = 10;

export async function avisarLoteBaixo({ conexao, disponiveis }) {
  try {
    if (disponiveis > PISO_DO_LOTE) return false;
    const inedito = await repo.alertarLoteBaixo({
      contaId: conexao.conta_id,
      conexaoId: conexao.id,
      mensagem: disponiveis > 0
        ? `Lote de cupons da ${conexao.nome_loja} em ${disponiveis} código(s). Reponha antes de zerar.`
        : `Lote de cupons da ${conexao.nome_loja} zerado. O próximo lead fica sem o cupom prometido.`,
      dados: { disponiveis, plataforma: conexao.plataforma },
    });
    if (!inedito) return false;

    const conta = await repo.buscarConta(conexao.conta_id);
    if (!conta) return false;
    const mensagem = loteAcabando({
      nomeConta: conta.nome,
      nomeLoja: conexao.nome_loja,
      disponiveis,
      urlPainel: `${URL_PUBLICA()}/#/integracoes`,
    });
    await enviar({ para: conta.email_aviso || conta.email, contaId: conta.id, ...mensagem });
    return true;
  } catch (erro) {
    log.aviso('aviso.lote_falhou', { conta_id: conexao.conta_id, motivo: erro.message });
    return false;
  }
}

/**
 * Operador avisado de falha que vira chamado: cupom que nao saiu, loja
 * inadimplente com a plataforma, webhook recusado em serie. Uma vez por
 * conta e tipo a cada hora, para uma loja com API fora do ar nao virar
 * cinquenta e-mails.
 */
const ultimosAvisos = new Map();
const INTERVALO_OPERADOR_MS = 60 * 60 * 1000;

export async function avisarOperador({ contaId = null, tipo, mensagem, dados = {} }) {
  try {
    const destinos = (process.env.OPERADOR_EMAILS || '')
      .split(',').map((e) => e.trim()).filter((e) => e && ehOperador(e));
    if (!destinos.length) return;

    const chave = `${tipo}:${contaId || 'geral'}`;
    const ultimo = ultimosAvisos.get(chave) || 0;
    if (Date.now() - ultimo < INTERVALO_OPERADOR_MS) return;
    ultimosAvisos.set(chave, Date.now());

    const conta = contaId ? await repo.buscarConta(contaId) : null;
    const texto = alertaOperador({
      tipo, mensagem, nomeConta: conta?.nome || null, dados,
      urlPainel: `${URL_PUBLICA()}/#/admin`,
    });
    await Promise.all(destinos.map((para) => enviar({ para, contaId, ...texto })));
  } catch (erro) {
    log.aviso('aviso.operador_falhou', { conta_id: contaId, tipo, motivo: erro.message });
  }
}

/**
 * Aviso de cobranca por degrau da regua. Roda em tarefa de fundo; a memoria
 * de "ja avisei" e a tabela de alertas, um por degrau por mes, que e o mesmo
 * lugar onde o painel mostra o aviso.
 */
export async function avisarCobranca({ conta, acesso }) {
  try {
    const aviso = avisoDeCobrancaTexto(acesso);
    if (!aviso) return false;
    const inedito = await repo.alertarUmaVezNoMes({
      contaId: conta.id,
      tipo: `cobranca_degrau_${aviso.degrau}`,
      gravidade: aviso.gravidade,
      mensagem: aviso.texto,
    });
    if (!inedito) return false;
    const mensagem = avisoDeCobranca({
      nomeConta: conta.nome, aviso: aviso.texto, diasAtraso: acesso.diasAtraso,
    });
    await enviar({ para: conta.email_aviso || conta.email, contaId: conta.id, ...mensagem });
    return true;
  } catch (erro) {
    log.aviso('aviso.cobranca_falhou', { conta_id: conta.id, motivo: erro.message });
    return false;
  }
}

/** Mesmo texto do painel, com o degrau atual para servir de chave do "ja avisei". */
function avisoDeCobrancaTexto(acesso) {
  const dias = acesso.diasAtraso || 0;
  if (dias <= 0) return null;
  if (dias < 7) return { degrau: 1, gravidade: 'aviso', texto: `Fatura em aberto há ${dias} dia(s). No dia 7 o rastreamento de navegação é desligado.` };
  if (dias < 10) return { degrau: 7, gravidade: 'aviso', texto: 'Rastreamento desligado por atraso. No dia 10 o widget sai do ar da loja.' };
  if (dias < 45) return { degrau: 10, gravidade: 'erro', texto: 'Widget fora do ar e painel em leitura. Seus leads continuam guardados. No dia 45 o script é removido da loja.' };
  return { degrau: 45, gravidade: 'erro', texto: 'Script removido da loja. Seus leads continuam guardados e voltam no mesmo minuto do pagamento.' };
}

/** Link de recuperacao de senha. O token so existe neste e-mail e no hash do banco. */
export async function enviarRecuperacaoSenha({ conta, token }) {
  const mensagem = recuperacaoSenha({
    nomeConta: conta.nome,
    url: `${URL_PUBLICA()}/#/nova-senha?token=${encodeURIComponent(token)}`,
  });
  return enviar({ para: conta.email, contaId: conta.id, ...mensagem });
}
