import { log } from './log.js';

/**
 * Monta o fluxo do chat a partir de uma descricao da loja.
 *
 * O lojista trava na tela em branco. Ele sabe o que vende e sabe o que
 * pergunta ao cliente no balcao, mas escrever tres perguntas de qualificacao
 * com opcoes fechadas e trabalho de redator, e o quadro vazio e onde a maioria
 * abandona a configuracao e nunca publica nada.
 *
 * Entao ele descreve a loja, por texto ou falando, e recebe o quadro
 * preenchido para corrigir. Nada e publicado aqui: a sugestao cai no
 * construtor do painel e so vai para a loja quando ele clicar em publicar.
 *
 * Sem biblioteca: um POST com JSON resolve, e o projeto inteiro tem duas
 * dependencias de producao de proposito.
 */

const MODELO = 'claude-opus-5-5';
const VERSAO = '2023-06-01';

/** Limites iguais aos da rota que publica, senao a sugestao chega e e recusada. */
const TETO = { convite: 60, consentimento: 300, pergunta: 160, opcao: 60, opcoes: 8, perguntas: 3 };

const RECOMPENSAS = new Set(['cupom', 'frete_gratis', 'diagnostico', 'especialista', 'consultoria']);

export function temRedator() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function endereco() {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  return `${base}/v1/messages`;
}

/*
 * As regras do produto vao no system, nao no texto do lojista.
 *
 * Isso importa por dois motivos. O primeiro e cache: o system e identico em
 * toda chamada, e o que muda fica depois dele. O segundo e que o que o lojista
 * digita e entrada de usuario, e entrada de usuario nao manda nas regras: ele
 * descreve a loja dele, nao decide quantas perguntas o chat faz.
 */
const INSTRUCOES = [
  'Você escreve o chat de captação de leads de uma loja virtual brasileira.',
  '',
  'Devolva SOMENTE um objeto JSON, sem texto antes ou depois, com estas chaves:',
  '{"convite": "...", "consentimento": "...", "desconto": 10, "recompensa": "cupom",',
  ' "perguntas": [{"texto": "...", "opcoes": ["...", "..."]}]}',
  '',
  'Regras que não se negociam:',
  '- Exatamente 3 perguntas. A pergunta de contato não entra aqui: ela é fixa e vem depois.',
  '- Cada pergunta tem de 2 a 6 opções de resposta, curtas, que a pessoa escolhe com um toque.',
  '- As perguntas qualificam para a venda: o que ela procura, para quem, faixa de preço,',
  '  momento da compra. Nunca pergunte nome, telefone, e-mail ou CPF.',
  '- A última pergunta separa quem quer ser atendido por uma pessoa de quem prefere comprar',
  '  sozinho, porque é ela que diz em qual lead a equipe deve gastar a próxima hora.',
  '- "convite" é o texto do botão flutuante, até 4 palavras, e promete o benefício.',
  '- "consentimento" é uma frase de LGPD citando o nome da loja, dizendo que os dados são',
  '  usados para entrar em contato sobre esta compra.',
  '- "recompensa" é uma de: cupom, frete_gratis, diagnostico, especialista, consultoria.',
  '- "desconto" é o percentual do cupom, entre 5 e 20. Em loja de ticket alto use 5 ou 10.',
  '',
  'Português do Brasil, segunda pessoa, sem emoji, sem travessão e sem ponto de exclamação.',
  'Escreva como a vendedora da loja falaria, não como um anúncio.',
].join('\n');

/**
 * Extrai o JSON da resposta.
 *
 * O modelo foi instruido a devolver so o objeto, mas instrucao nao e garantia,
 * e uma linha de conversa antes do JSON quebraria o parse. Entao recortamos do
 * primeiro abre-chaves ao ultimo fecha-chaves.
 */
function recortarJson(texto) {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) throw new Error('resposta sem json');
  return JSON.parse(texto.slice(inicio, fim + 1));
}

/**
 * Normaliza o que voltou.
 *
 * Nada do que vem do modelo entra no painel sem passar por aqui. Nao e
 * desconfianca do modelo, e a mesma regra de toda entrada externa: o formato
 * e nosso, e o que nao couber nele vira o padrao em vez de virar erro na cara
 * do lojista.
 */
function normalizar(cru, loja) {
  const perguntas = (Array.isArray(cru.perguntas) ? cru.perguntas : [])
    .map((p) => ({
      texto: String(p && p.texto ? p.texto : '').trim().slice(0, TETO.pergunta),
      opcoes: (Array.isArray(p && p.opcoes) ? p.opcoes : [])
        .map((o) => String(o).trim().slice(0, TETO.opcao))
        .filter(Boolean)
        .slice(0, TETO.opcoes),
    }))
    .filter((p) => p.texto && p.opcoes.length >= 2)
    .slice(0, TETO.perguntas);

  if (!perguntas.length) throw new Error('sugestao sem pergunta aproveitavel');

  const recompensa = RECOMPENSAS.has(cru.recompensa) ? cru.recompensa : 'cupom';
  const desconto = Math.min(Math.max(Number(cru.desconto) || 10, 1), 90);

  return {
    convite: String(cru.convite || 'Ganhe cupom').trim().slice(0, TETO.convite),
    consentimento: String(cru.consentimento || `Ao continuar, você concorda que a ${loja} use seus dados para entrar em contato sobre esta compra.`)
      .trim().slice(0, TETO.consentimento),
    desconto,
    recompensa,
    perguntas,
  };
}

/**
 * Pede o fluxo e devolve ele pronto para o construtor do painel.
 *
 * Nenhum dado de lead sai daqui: vai o nome da loja e o que o lojista
 * escreveu sobre o proprio negocio, mais nada. O historico de quem respondeu
 * o chat nunca entra na chamada.
 */
export async function sugerirFluxo({ loja, descricao, contaId = null }) {
  if (!temRedator()) throw new Error('redator nao configurado');

  const corpo = {
    model: MODELO,
    max_tokens: 2000,
    system: INSTRUCOES,
    // Tarefa curta e de formato fechado: esforco baixo responde em segundos e
    // custa uma fracao, e o lojista esta esperando na tela.
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: `Loja: ${loja}\n\nO lojista descreveu assim:\n${descricao}`,
    }],
  };

  const resposta = await fetch(endereco(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': VERSAO,
    },
    body: JSON.stringify(corpo),
    // O painel mostra "montando"; passar disso e melhor desistir e deixar ele
    // escrever a mao do que travar a tela.
    signal: AbortSignal.timeout(40_000),
  });

  if (!resposta.ok) {
    log.erro('redator.recusado', { conta_id: contaId, http: resposta.status });
    throw new Error(`http ${resposta.status}`);
  }

  const dados = await resposta.json();
  // Pedido recusado por politica volta 200 com stop_reason refusal, e sem
  // isto o parse falharia com uma mensagem que nao ajuda ninguem.
  if (dados.stop_reason === 'refusal') throw new Error('pedido recusado');

  const texto = (dados.content || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('');

  const fluxo = normalizar(recortarJson(texto), loja);
  log.info('redator.sugeriu', { conta_id: contaId, perguntas: fluxo.perguntas.length });
  return fluxo;
}
