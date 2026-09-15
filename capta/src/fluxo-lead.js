import { adaptador } from './adapters/index.js';
import { gerarCodigo } from './cupom.js';
import { log } from './log.js';
import { costurarEventos } from './eventos.js';
import * as repo from './repositorio.js';
import { credenciaisProntas } from './credenciais.js';
import { avisarLeadNovo, avisarOperador, avisarLoteBaixo } from './avisos.js';

/**
 * O que acontece quando o lead termina o chat.
 *
 * A ordem aqui e a decisao mais cara do produto: o lead e gravado antes de
 * qualquer tentativa de cupom. Se a API da loja cair, o cupom falha e vira
 * chamado de suporte, que se resolve. Lead perdido nao se resolve, e dinheiro
 * que ja entrou na loja e sumiu.
 */
export async function concluirLead({
  conexao, fluxo, nome, email, telefone, respostas, anonimoId, redeMascarada,
}) {
  const lead = await repo.criarLead({
    contaId: conexao.conta_id,
    conexaoId: conexao.id,
    nome, email, telefone, respostas, anonimoId, redeMascarada,
  });

  log.info('lead.criado', {
    conta_id: conexao.conta_id, conexao_id: conexao.id, lead_id: lead.id,
    plataforma: conexao.plataforma, respostas: (respostas || []).length,
  });

  // A costura roda mesmo se o cupom falhar: a navegacao ja aconteceu e o
  // consentimento acabou de ser dado.
  if (anonimoId) {
    await costurarEventos({
      conexaoId: conexao.id, anonimoId, leadId: lead.id, contaId: conexao.conta_id,
    });
  }

  const recompensa = fluxo.recompensa || 'cupom';

  // Diagnostico, especialista e consultoria nao criam nada na plataforma: a
  // recompensa e o contato humano, e o lead ja esta na fila para isso.
  const cupom = CRIAM_CUPOM.has(recompensa)
    ? await entregarCupom({ conexao, fluxo, lead })
    : { status: 'sem_cupom' };

  // O aviso ao lojista nao segura a resposta ao visitante: o chat mostra o
  // cupom agora e o e-mail chega em seguida.
  avisarLeadNovo({ conexao, lead: { ...lead, nome, email, telefone, respostas } });

  return { lead, cupom, recompensa };
}

const CRIAM_CUPOM = new Set(['cupom', 'frete_gratis']);

async function entregarCupom({ conexao, fluxo, lead }) {
  const api = adaptador(conexao.plataforma);
  const frete = fluxo.recompensa === 'frete_gratis';
  const desconto = frete ? 0 : fluxo.desconto;
  const tipo = frete ? 'frete' : 'percentual';

  // Na Loja Integrada o codigo sai do lote que o lojista cadastrou antes,
  // porque a v1 publica nao expoe endpoint de cupom.
  if (api.criaCupomPorApi === false) {
    const codigo = await repo.tirarDoLote(conexao.id, lead.id);
    if (!codigo) {
      await avisarLoteBaixo({ conexao, disponiveis: 0 });
      await falhou({ conexao, lead, desconto, motivo: 'lote de cupons vazio' });
      return { status: 'falhou', motivo: 'lote_vazio' };
    }
    const registro = await repo.registrarCupomPendente({
      contaId: conexao.conta_id, conexaoId: conexao.id, leadId: lead.id, codigo, desconto, tipo,
    });
    await repo.marcarCupom(registro.id, 'criado');
    log.info('cupom.entregue', {
      conta_id: conexao.conta_id, conexao_id: conexao.id, lead_id: lead.id, origem: 'lote',
    });
    // O aviso sai depois de o cupom estar entregue: avisar o lojista nunca
    // pode atrasar a resposta ao visitante.
    const saldo = await repo.saldoDoLote(conexao.conta_id, conexao.id);
    avisarLoteBaixo({ conexao, disponiveis: Number(saldo.disponiveis) });
    return { status: 'criado', codigo, desconto };
  }

  let codigo;
  let registro;
  try {
    ({ codigo, registro } = await reservarCodigo(conexao, lead, desconto, tipo));
  } catch (erro) {
    await falhou({ conexao, lead, desconto, motivo: erro.message });
    return { status: 'falhou', motivo: erro.message };
  }

  try {
    const credenciais = await credenciaisProntas(conexao);
    await api.criarCupom(credenciais, { codigo, desconto, frete });
    await repo.marcarCupom(registro.id, 'criado');
    log.info('cupom.entregue', {
      conta_id: conexao.conta_id, conexao_id: conexao.id, lead_id: lead.id, origem: 'api',
    });
    return { status: 'criado', codigo, desconto, frete };
  } catch (erro) {
    await repo.marcarCupom(registro.id, 'falhou', erro.message);

    // 402 da Nuvemshop nao e defeito nosso: e a loja inadimplente com a
    // propria plataforma. Marcar na conexao evita o lojista abrir chamado
    // conosco e evita a equipe caçar erro que nao existe.
    if (erro.inadimplenteNaPlataforma) {
      await repo.atualizarConexao(conexao.conta_id, conexao.id, {
        status: 'inadimplente_plataforma',
        detalhe_status: erro.message,
      });
    }

    await falhou({ conexao, lead, desconto, motivo: erro.message });
    return { status: 'falhou', motivo: erro.message };
  }
}

/**
 * O codigo e sorteado em 31^6, entao colisao e rara mas existe, e o banco tem
 * unique por conexao. Repetir o sorteio custa nada; deixar estourar custa um
 * lead sem cupom e um alerta que ninguem precisa investigar.
 */
async function reservarCodigo(conexao, lead, desconto, tipo = 'percentual', tentativas = 5) {
  for (let i = 0; i < tentativas; i += 1) {
    const codigo = gerarCodigo(conexao.nome_loja);
    try {
      const registro = await repo.registrarCupomPendente({
        contaId: conexao.conta_id, conexaoId: conexao.id, leadId: lead.id, codigo, desconto, tipo,
      });
      return { codigo, registro };
    } catch (erro) {
      if (erro.code !== '23505') throw erro;
    }
  }
  throw new Error('nao foi possivel gerar codigo de cupom unico');
}

/**
 * Cupom que falha e lead que recebeu a promessa e nao recebeu a recompensa.
 * Vira reclamacao direta com o lojista, entao precisa de alerta e nao so de
 * linha de log.
 */
async function falhou({ conexao, lead, desconto, motivo }) {
  log.erro('cupom.falhou', {
    conta_id: conexao.conta_id, conexao_id: conexao.id, lead_id: lead.id,
    plataforma: conexao.plataforma, motivo,
  });
  await repo.alertar({
    contaId: conexao.conta_id,
    tipo: 'cupom_falhou',
    gravidade: 'erro',
    mensagem: `Cupom nao criado na loja ${conexao.nome_loja}: ${motivo}`,
    dados: { conexao_id: conexao.id, lead_id: lead.id, plataforma: conexao.plataforma, desconto },
  });
  avisarOperador({
    contaId: conexao.conta_id,
    tipo: 'cupom_falhou',
    mensagem: `Cupom nao criado na loja ${conexao.nome_loja}: ${motivo}`,
    dados: { plataforma: conexao.plataforma, conexao_id: conexao.id },
  });
}
