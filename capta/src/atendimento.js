import { consultar, emTransacao } from './db.js';
import { log } from './log.js';

/**
 * A base de conhecimento do atendimento no WhatsApp.
 *
 * O agente que fala com o cliente final e servico separado e nao vive aqui:
 * ele le esta base por uma rota interna e monta o proprio prompt. O que o
 * Capta guarda e a fonte, e quem edita passa a ser o lojista, em vez de
 * alguem da nossa equipe mexendo na mao a cada mudanca de prazo.
 *
 * O SQL fica neste arquivo, e nao no repositorio, pelo mesmo motivo do
 * eventos.js: o modulo e fechado em si, e empilhar mais trezentas linhas num
 * arquivo que ja tem oitocentas so dificulta a leitura. A regra do projeto
 * continua valendo em cada consulta: contaId na frente, e `conta_id = $1` em
 * todo where. Id que chega da URL ou do corpo nunca decide de quem e a base.
 */

/**
 * Os campos da base, em um lugar so.
 *
 * Esta lista e a autoridade sobre o que existe: o formulario, a normalizacao,
 * o retrato guardado na versao e o JSON que o agente le saem todos daqui. Um
 * campo novo entra aqui e aparece nos quatro, em vez de aparecer em tres e
 * sumir no quarto meses depois.
 */
export const CAMPOS = {
  nomeLoja: { coluna: 'nome_loja', tipo: 'texto', teto: 120, rotulo: 'Nome da loja' },
  segmento: { coluna: 'segmento', tipo: 'texto', teto: 120, rotulo: 'Segmento' },
  prazosEntrega: { coluna: 'prazos_entrega', tipo: 'prazos', rotulo: 'Prazos de entrega por região' },
  formasPagamento: { coluna: 'formas_pagamento', tipo: 'lista', teto: 60, itens: 20, rotulo: 'Formas de pagamento' },
  politicaTroca: { coluna: 'politica_troca', tipo: 'texto', teto: 2000, rotulo: 'Política de troca e devolução' },
  horarioAtendimento: { coluna: 'horario_atendimento', tipo: 'texto', teto: 300, rotulo: 'Horário de atendimento' },
  linkSite: { coluna: 'link_site', tipo: 'texto', teto: 300, rotulo: 'Link do site' },
  freteGratisAcima: { coluna: 'frete_gratis_acima', tipo: 'dinheiro', rotulo: 'Frete grátis a partir de' },
  tomDeVoz: { coluna: 'tom_de_voz', tipo: 'texto', teto: 2000, rotulo: 'Tom de voz' },
  perguntasFrequentes: { coluna: 'perguntas_frequentes', tipo: 'texto', teto: 8000, rotulo: 'Perguntas frequentes' },
  observacoes: { coluna: 'observacoes', tipo: 'texto', teto: 4000, rotulo: 'Observações' },
};

/*
 * O minimo para o agente atender sem passar vergonha.
 *
 * Antes a regra era "quatro campos quaisquer", e isso deixava uma loja entrar
 * no ar sabendo o tom de voz e as observacoes e nao sabendo o que vende. Os
 * dois primeiros sao quem a loja e; dos outros, bastam dois, porque sao os
 * assuntos que o cliente pergunta na primeira mensagem.
 */
export const BASE_OBRIGATORIA = ['nomeLoja', 'segmento'];
export const BASE_OPERACIONAL = [
  'horarioAtendimento', 'prazosEntrega', 'politicaTroca', 'formasPagamento', 'linkSite',
];
export const OPERACIONAIS_MINIMOS = 2;

function cheio(valor) {
  if (Array.isArray(valor)) return valor.length > 0;
  return valor !== '' && valor !== null && valor !== undefined;
}

/**
 * O que ainda falta na base, por nome de campo. Vazio quer dizer pronta.
 *
 * Devolve a lista, e nao um booleano, porque as duas telas que usam isto
 * precisam dizer ao lojista o que falta: "falta o basico" sem dizer qual e
 * o motivo de ele achar que a tela esta quebrada.
 */
export function faltaNaBase(conteudo = {}) {
  const faltando = BASE_OBRIGATORIA.filter((nome) => !cheio(conteudo[nome]));
  const operacionais = BASE_OPERACIONAL.filter((nome) => cheio(conteudo[nome]));
  return {
    obrigatorios: faltando,
    operacionaisQueFaltam: Math.max(0, OPERACIONAIS_MINIMOS - operacionais.length),
    pronta: faltando.length === 0 && operacionais.length >= OPERACIONAIS_MINIMOS,
  };
}

/** Os que o chat pode apontar campo a campo. O resto e texto corrido. */
export const ESTRUTURADOS = [
  'nomeLoja', 'segmento', 'prazosEntrega', 'formasPagamento', 'politicaTroca',
  'horarioAtendimento', 'linkSite', 'freteGratisAcima',
];

const COLUNAS = Object.values(CAMPOS).map((c) => c.coluna).join(', ');

function texto(valor, teto) {
  return String(valor ?? '').trim().slice(0, teto);
}

/**
 * Normaliza o que chega de fora.
 *
 * Vale para os dois caminhos de entrada, o formulario e a proposta do chat,
 * e por um motivo so: nenhum dos dois e confiavel. O formulario chega do
 * navegador e a proposta chega de um modelo de linguagem, e os dois podem
 * mandar campo que nao existe, lista gigante ou numero que nao e numero.
 *
 * Campo que nao esta em CAMPOS some aqui. Nao da erro: a ideia e que uma
 * chave a mais no corpo nunca vire coluna gravada por acidente.
 */
export function normalizar(entrada = {}) {
  const limpo = {};
  for (const [nome, campo] of Object.entries(CAMPOS)) {
    if (!(nome in entrada)) continue;
    const valor = entrada[nome];

    if (campo.tipo === 'texto') {
      limpo[nome] = texto(valor, campo.teto);
      continue;
    }
    if (campo.tipo === 'dinheiro') {
      // Nulo e "nao tem frete gratis". Zero seria frete gratis em qualquer
      // valor, que e outra promessa: os dois precisam continuar diferentes.
      if (valor === null || valor === '' || valor === undefined) { limpo[nome] = null; continue; }
      const numero = Number(String(valor).replace(',', '.'));
      limpo[nome] = Number.isFinite(numero) && numero >= 0
        ? Math.round(numero * 100) / 100
        : null;
      continue;
    }
    if (campo.tipo === 'lista') {
      limpo[nome] = (Array.isArray(valor) ? valor : [])
        .map((item) => texto(item, campo.teto))
        .filter(Boolean)
        .slice(0, campo.itens);
      continue;
    }
    if (campo.tipo === 'prazos') {
      limpo[nome] = (Array.isArray(valor) ? valor : [])
        .map((item) => ({
          regiao: texto(item && item.regiao, 80),
          prazo: texto(item && item.prazo, 120),
        }))
        .filter((item) => item.regiao || item.prazo)
        .slice(0, 30);
    }
  }
  return limpo;
}

/** A base como o painel, a versao e o agente leem. Formato unico, de proposito. */
export function conteudo(linha) {
  if (!linha) return null;
  const saida = {};
  for (const [nome, campo] of Object.entries(CAMPOS)) saida[nome] = linha[campo.coluna];
  return saida;
}

/**
 * A base da conta, criada vazia na primeira visita.
 *
 * Criar na leitura em vez de exigir um "criar base" antes: a tela nunca
 * aparece quebrada, e o lojista comeca preenchendo em vez de clicando.
 */
export async function base(contaId) {
  const { rows } = await consultar(
    `insert into bases_conhecimento (conta_id) values ($1)
     on conflict (conta_id) do update set conta_id = excluded.conta_id
     returning id, conta_id, ${COLUNAS}, atualizado_em, criado_em`,
    [contaId],
  );
  return rows[0];
}

/**
 * Grava, guardando antes o que havia.
 *
 * A versao leva o conteudo ANTERIOR, nao o novo: e o que permite voltar. E
 * tudo numa transacao, porque gravar sem registrar a versao deixaria o
 * historico mentindo, e registrar sem gravar mostraria no historico uma
 * mudanca que nunca aconteceu.
 */
export async function salvar(contaId, campos, { autorEmail = null, operadorId = null, origem = 'formulario' } = {}) {
  const limpo = normalizar(campos);
  const nomes = Object.keys(limpo);

  return emTransacao(async (cliente) => {
    // `for update` segura a linha ate o fim: duas abas salvando ao mesmo
    // tempo gravariam duas versoes com o mesmo "anterior", e uma das duas
    // mudancas sumiria do historico.
    const { rows: atuais } = await cliente.query(
      `select id, ${COLUNAS} from bases_conhecimento where conta_id = $1 for update`,
      [contaId],
    );
    let atual = atuais[0];

    if (!atual) {
      /*
       * Primeira gravacao antes da primeira leitura.
       *
       * Acontece de verdade: o chat propoe uma mudanca e o lojista confirma
       * sem nunca ter aberto o formulario. A base nasce aqui, vazia, e a
       * versao guardada logo abaixo registra esse estado vazio, que e
       * exatamente o "antes" correto.
       *
       * A conta e conferida antes de inserir, e nao depois pelo erro de
       * chave estrangeira: dentro de uma transacao, um insert recusado
       * aborta tudo o que vier depois, e devolver null ali deixaria o commit
       * estourando em outro lugar.
       */
      const { rows: donas } = await cliente.query('select 1 from contas where id = $1', [contaId]);
      if (!donas[0]) return null;
      const { rows: criadas } = await cliente.query(
        `insert into bases_conhecimento (conta_id) values ($1) returning id, ${COLUNAS}`,
        [contaId],
      );
      atual = criadas[0];
    }

    await cliente.query(
      `insert into base_versoes (conta_id, base_id, conteudo, autor_email, autor_operador_id, origem)
       values ($1, $2, $3, $4, $5, $6)`,
      [contaId, atual.id, JSON.stringify(conteudo(atual)), autorEmail, operadorId, origem],
    );

    if (!nomes.length) {
      const { rows } = await cliente.query(
        `select id, conta_id, ${COLUNAS}, atualizado_em, criado_em
           from bases_conhecimento where conta_id = $1`,
        [contaId],
      );
      return rows[0];
    }

    const valores = [contaId];
    const partes = nomes.map((nome) => {
      // jsonb precisa do texto JSON. Mandar o array direto faz o driver
      // escrever um array do Postgres, que o jsonb recusa: e um erro que so
      // aparece na primeira lista salva, nunca no campo de texto ao lado.
      const ehJson = ['lista', 'prazos'].includes(CAMPOS[nome].tipo);
      valores.push(ehJson ? JSON.stringify(limpo[nome]) : limpo[nome]);
      return `${CAMPOS[nome].coluna} = $${valores.length}`;
    });
    const { rows } = await cliente.query(
      `update bases_conhecimento set ${partes.join(', ')}, atualizado_em = now()
        where conta_id = $1
        returning id, conta_id, ${COLUNAS}, atualizado_em, criado_em`,
      valores,
    );
    log.info('base.salva', { conta_id: contaId, origem, campos: nomes.length });
    return rows[0];
  });
}

export async function versoes(contaId, limite = 30) {
  const { rows } = await consultar(
    `select id, autor_email, origem, criado_em, conteudo
       from base_versoes
      where conta_id = $1
      order by criado_em desc
      limit $2`,
    [contaId, Math.min(Math.max(Number(limite) || 30, 1), 100)],
  );
  return rows;
}

/**
 * Restaurar nao apaga nada.
 *
 * O estado de agora vira uma versao antes de ser substituido, entao voltar
 * uma restauracao errada e outra restauracao. Historico que perde linha e
 * historico em que ninguem confia na hora do aperto.
 */
export async function restaurar(contaId, versaoId, { autorEmail = null, operadorId = null } = {}) {
  const { rows } = await consultar(
    `select conteudo from base_versoes where id = $1 and conta_id = $2`,
    [versaoId, contaId],
  );
  if (!rows[0]) return null;
  const salva = await salvar(contaId, rows[0].conteudo, {
    autorEmail, operadorId, origem: 'restauracao',
  });
  log.info('base.restaurada', { conta_id: contaId, versao_id: versaoId });
  return salva;
}

// ----------------------------------------------------------- conversa ---

/**
 * A conversa do chat de comando.
 *
 * A proposta vive no banco e nao na memoria do servidor por dois motivos:
 * ela precisa sobreviver a um F5 entre o "proponho isto" e o "confirmo", e
 * precisa de rastro. Mudanca na base vira resposta dada a cliente de
 * verdade, entao "quem mandou mudar isso" tem que ter resposta depois.
 */
export async function mensagens(contaId, limite = 40) {
  const { rows } = await consultar(
    `select id, papel, texto, proposta, estado, autor_email, criado_em
       from base_mensagens
      where conta_id = $1
      order by criado_em desc
      limit $2`,
    [contaId, Math.min(Math.max(Number(limite) || 40, 1), 100)],
  );
  return rows.reverse();
}

export async function registrarMensagem(contaId, {
  papel, texto, proposta = null, estado = 'conversa', autorEmail = null,
}) {
  const { rows } = await consultar(
    `insert into base_mensagens (conta_id, papel, texto, proposta, estado, autor_email)
     values ($1, $2, $3, $4, $5, $6)
     returning id, papel, texto, proposta, estado, autor_email, criado_em`,
    [contaId, papel, texto, proposta ? JSON.stringify(proposta) : null, estado, autorEmail],
  );
  return rows[0];
}

/**
 * Proposta pendente morre quando a conversa segue.
 *
 * E a regra que o lojista espera sem saber que espera: ele pediu uma coisa,
 * leu a proposta, nao gostou e escreveu outra. Se a primeira continuasse
 * valendo, um clique distraido em "confirmar" aplicaria a mudanca que ele ja
 * tinha abandonado.
 */
export async function descartarPendentes(contaId) {
  const { rowCount } = await consultar(
    `update base_mensagens set estado = 'descartada'
      where conta_id = $1 and estado = 'pendente'`,
    [contaId],
  );
  return rowCount;
}

export async function propostaPendente(contaId) {
  const { rows } = await consultar(
    `select id, texto, proposta, criado_em
       from base_mensagens
      where conta_id = $1 and estado = 'pendente'
      order by criado_em desc
      limit 1`,
    [contaId],
  );
  return rows[0] || null;
}

/**
 * Confirma e grava, numa transacao so.
 *
 * Tres travas antes de escrever, e cada uma existe por um jeito diferente de
 * gravar o que ninguem pediu:
 *
 * A proposta tem que ser a pendente mais recente da conta, senao um botao
 * velho aberto noutra aba aplicaria a mudanca de meia hora atras.
 *
 * O valor atual de cada campo tem que ser o mesmo de quando a proposta foi
 * montada. Se alguem salvou pelo formulario no meio do caminho, o "de X para
 * Y" que o lojista leu na tela ja nao descreve o que aconteceria, e
 * confirmar as cegas apagaria a edicao do outro.
 *
 * E a gravacao passa por salvar(), que normaliza de novo e cria a versao: o
 * historico precisa registrar a mudanca do chat igual a do formulario.
 */
export async function confirmar(contaId, mensagemId, { autorEmail = null, operadorId = null } = {}) {
  const pendente = await propostaPendente(contaId);
  if (!pendente) return { erro: 'sem_proposta' };
  if (pendente.id !== mensagemId) return { erro: 'proposta_vencida' };

  const mudancas = (pendente.proposta && pendente.proposta.mudancas) || {};
  const antes = (pendente.proposta && pendente.proposta.antes) || {};
  const nomes = Object.keys(mudancas);
  if (!nomes.length) return { erro: 'sem_proposta' };

  const atual = conteudo(await base(contaId));
  const mudouPorFora = nomes.filter(
    (nome) => JSON.stringify(atual[nome] ?? null) !== JSON.stringify(antes[nome] ?? null),
  );
  if (mudouPorFora.length) return { erro: 'base_mudou', campos: mudouPorFora };

  const salva = await salvar(contaId, mudancas, { autorEmail, operadorId, origem: 'chat' });
  if (!salva) return { erro: 'sem_proposta' };

  await consultar(
    `update base_mensagens set estado = 'confirmada' where id = $1 and conta_id = $2`,
    [mensagemId, contaId],
  );
  log.info('base.confirmada_pelo_chat', { conta_id: contaId, campos: nomes.length });
  return { base: salva };
}

/**
 * Fecha uma pendencia que nao e mudanca de base.
 *
 * O chat tambem propoe acao, como voltar a atender, e acao nao passa por
 * salvar(): nao e conhecimento e nao cria versao. Quem aplica e a rota, e o
 * que sobra aqui e marcar a mensagem como resolvida, para o botao sumir.
 */
export async function marcarConfirmada(contaId, mensagemId) {
  const { rowCount } = await consultar(
    `update base_mensagens set estado = 'confirmada'
      where id = $1 and conta_id = $2 and estado = 'pendente'`,
    [mensagemId, contaId],
  );
  return rowCount > 0;
}

export async function descartar(contaId, mensagemId) {
  const { rowCount } = await consultar(
    `update base_mensagens set estado = 'descartada'
      where id = $1 and conta_id = $2 and estado = 'pendente'`,
    [mensagemId, contaId],
  );
  return rowCount > 0;
}

/* ------------------------------------------------------------- o medidor ---
 *
 * Quem conta e o agente, porque e ele que fala com o cliente final: o Capta
 * guarda a base e nao ve a conversa. A cada resposta enviada ele soma aqui, e
 * o lojista passa a ver no painel quanto usou no mes.
 *
 * A competencia sai do banco, com date_trunc, e nao do relogio do servidor
 * que chamou: fuso diferente na virada do mes jogaria mensagem de marco
 * dentro de fevereiro, e a fatura sairia errada uma vez por mes, sempre.
 *
 * Nao ha protecao contra contar duas vezes, e e escolha. O numero decide em
 * que faixa a conta esta, nao o valor de cada mensagem, e uma reentrega do
 * agente nao muda de faixa ninguem. No dia em que a cobranca for por mensagem
 * excedente, entra chave de idempotencia; hoje seria tabela a mais para um
 * problema que nao existe.
 */

export async function somarConsumo(contaId, enviadas = 1) {
  const n = Math.min(Math.max(Math.trunc(Number(enviadas) || 0), 1), 500);
  const { rows } = await consultar(
    `insert into consumo_atendimento (conta_id, competencia, enviadas)
     values ($1, date_trunc('month', now())::date, $2)
     on conflict (conta_id, competencia)
       do update set enviadas = consumo_atendimento.enviadas + excluded.enviadas,
                     atualizado_em = now()
     returning enviadas, competencia`,
    [contaId, n],
  );
  return rows[0];
}

export async function consumoDoMes(contaId) {
  const { rows } = await consultar(
    `select enviadas, competencia, atualizado_em
       from consumo_atendimento
      where conta_id = $1 and competencia = date_trunc('month', now())::date`,
    [contaId],
  );
  return rows[0] || { enviadas: 0, competencia: null, atualizado_em: null };
}
