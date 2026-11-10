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
