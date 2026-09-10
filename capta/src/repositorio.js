import crypto from 'node:crypto';
import { consultar, emTransacao } from './db.js';
import { cifrar, decifrar, gerarChavePublica, hashSenha } from './cripto.js';

/**
 * Regra unica desta camada: id vindo da URL nunca e autorizacao. Toda funcao
 * que le ou escreve lead, evento, conexao ou cobranca recebe contaId e filtra
 * por ele na propria consulta. Nao existe buscarLead(id).
 */

// ---------------------------------------------------------------- contas ---

export async function criarConta({ nome, email, senha }) {
  return emTransacao(async (cliente) => {
    const { rows } = await cliente.query(
      `insert into contas (nome, email, senha_hash)
       values ($1, lower($2), $3)
       returning id, nome, email, criado_em`,
      [nome, email, hashSenha(senha)],
    );
    const conta = rows[0];
    await cliente.query(
      `insert into modulos_conta (conta_id, modulo) values ($1, 'captacao')`,
      [conta.id],
    );
    return conta;
  });
}

export async function buscarContaPorEmail(email) {
  const { rows } = await consultar(
    `select id, nome, email, senha_hash from contas where email = lower($1)`,
    [email],
  );
  return rows[0] || null;
}

export async function buscarConta(contaId) {
  const { rows } = await consultar(
    `select id, nome, email, criado_em from contas where id = $1`,
    [contaId],
  );
  return rows[0] || null;
}

// --------------------------------------------------------------- sessoes ---

export async function criarSessao(contaId, duracaoDias = 14) {
  const id = crypto.randomBytes(32).toString('base64url');
  await consultar(
    `insert into sessoes (id, conta_id, expira_em)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [id, contaId, String(duracaoDias)],
  );
  return id;
}

export async function buscarSessao(id) {
  if (!id) return null;
  const { rows } = await consultar(
    `select s.conta_id, c.nome, c.email
       from sessoes s join contas c on c.id = s.conta_id
      where s.id = $1 and s.expira_em > now()`,
    [id],
  );
  return rows[0] || null;
}

export async function apagarSessao(id) {
  await consultar(`delete from sessoes where id = $1`, [id]);
}

// -------------------------------------------------------------- conexoes ---

/**
 * Cria a conexao com a loja do lojista. As credenciais chegam em claro e sao
 * cifradas aqui, no unico ponto de escrita, para que nao exista caminho que
 * grave token em claro por esquecimento.
 *
 * O modo de instalacao nao e escolha nossa: e o que a plataforma permite.
 * Nuvemshop injeta por API (auto), Tray e Loja Integrada com tema antigo
 * pedem colar a mao (manual), Loja Integrada com tema padrao novo nao tem
 * onde colar (bloqueado), e WooCommerce depende do plugin.
 */
export async function criarConexao({
  contaId,
  plataforma,
  nomeLoja,
  dominio = null,
  credenciais,
  modoInstalacao = 'pendente',
}) {
  if (!contaId) throw new Error('criarConexao exige contaId');
  if (!plataforma) throw new Error('criarConexao exige plataforma');
  if (!credenciais || typeof credenciais !== 'object') {
    throw new Error('criarConexao exige credenciais');
  }

  const { rows } = await consultar(
    `insert into conexoes
       (conta_id, plataforma, nome_loja, dominio, credenciais, chave_publica, modo_instalacao)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, conta_id, plataforma, nome_loja, dominio, chave_publica,
               modo_instalacao, status, criado_em`,
    [contaId, plataforma, nomeLoja, dominio, cifrar(credenciais), gerarChavePublica(), modoInstalacao],
  );
  return rows[0];
}

const CAMPOS_CONEXAO = `id, conta_id, plataforma, nome_loja, dominio, chave_publica,
                        modo_instalacao, status, detalhe_status, varrido_em, criado_em`;

export async function listarConexoes(contaId) {
  const { rows } = await consultar(
    `select ${CAMPOS_CONEXAO} from conexoes where conta_id = $1 order by criado_em`,
    [contaId],
  );
  return rows;
}

export async function buscarConexao(contaId, conexaoId) {
  const { rows } = await consultar(
    `select ${CAMPOS_CONEXAO} from conexoes where id = $1 and conta_id = $2`,
    [conexaoId, contaId],
  );
  return rows[0] || null;
}

/** Usada pelos endpoints publicos, onde a chave e a unica identificacao. */
export async function buscarConexaoPorChave(chave) {
  const { rows } = await consultar(
    `select ${CAMPOS_CONEXAO} from conexoes where chave_publica = $1`,
    [chave],
  );
  return rows[0] || null;
}

/**
 * Decifra sob demanda e fora do objeto de conexao, para que o retorno das
 * funcoes de listagem nunca carregue token que possa vazar num JSON de rota
 * ou num log.
 */
export async function credenciaisDaConexao(contaId, conexaoId) {
  const { rows } = await consultar(
    `select credenciais from conexoes where id = $1 and conta_id = $2`,
    [conexaoId, contaId],
  );
  if (!rows[0]) return null;
  return decifrar(rows[0].credenciais);
}

export async function salvarCredenciais(contaId, conexaoId, credenciais) {
  await consultar(
    `update conexoes set credenciais = $1, atualizado_em = now()
      where id = $2 and conta_id = $3`,
    [cifrar(credenciais), conexaoId, contaId],
  );
}

export async function atualizarConexao(contaId, conexaoId, campos) {
  const permitidos = ['modo_instalacao', 'status', 'detalhe_status', 'varrido_em', 'dominio'];
  const partes = [];
  const valores = [conexaoId, contaId];
  for (const [chave, valor] of Object.entries(campos)) {
    if (!permitidos.includes(chave)) continue;
    valores.push(valor);
    partes.push(`${chave} = $${valores.length}`);
  }
  if (!partes.length) return;
  await consultar(
    `update conexoes set ${partes.join(', ')}, atualizado_em = now()
      where id = $1 and conta_id = $2`,
    valores,
  );
}

export async function conexoesParaVarrer(minutos = 30) {
  const { rows } = await consultar(
    `select ${CAMPOS_CONEXAO} from conexoes
      where plataforma = 'loja_integrada' and status = 'ativa'
        and (varrido_em is null or varrido_em < now() - ($1 || ' minutes')::interval)`,
    [String(minutos)],
  );
  return rows;
}

// ----------------------------------------------------------------- fluxo ---

export async function salvarFluxo(contaId, conexaoId, { convite, consentimento, desconto, perguntas }) {
  if (perguntas.length > 3) {
    // A quarta pergunta e a de contato, fixa. Tres configuraveis e o teto.
    throw new Error('maximo de tres perguntas configuraveis antes da de contato');
  }
  return emTransacao(async (cliente) => {
    const { rows } = await cliente.query(
      `insert into fluxos (conta_id, conexao_id, convite, consentimento, desconto)
       select $1, $2, $3, $4, $5
        where exists (select 1 from conexoes where id = $2 and conta_id = $1)
       on conflict (conexao_id) do update
          set convite = excluded.convite,
              consentimento = excluded.consentimento,
              desconto = excluded.desconto,
              atualizado_em = now()
       returning id`,
      [contaId, conexaoId, convite, consentimento, desconto],
    );
    if (!rows[0]) return null;
    const fluxoId = rows[0].id;
    await cliente.query(`delete from perguntas where fluxo_id = $1`, [fluxoId]);
    for (const [indice, pergunta] of perguntas.entries()) {
      await cliente.query(
        `insert into perguntas (fluxo_id, ordem, texto, opcoes) values ($1, $2, $3, $4)`,
        [fluxoId, indice + 1, pergunta.texto, JSON.stringify(pergunta.opcoes || [])],
      );
    }
    return fluxoId;
  });
}

export async function fluxoPorChave(chave) {
  const { rows } = await consultar(
    `select f.id, f.conta_id, f.conexao_id, f.convite, f.consentimento,
            f.desconto, f.ativo, c.plataforma, c.status as status_conexao,
            coalesce(
              (select json_agg(json_build_object('texto', p.texto, 'opcoes', p.opcoes)
                               order by p.ordem)
                 from perguntas p where p.fluxo_id = f.id),
              '[]'::json
            ) as perguntas
       from fluxos f
       join conexoes c on c.id = f.conexao_id
      where c.chave_publica = $1 and f.ativo = true`,
    [chave],
  );
  return rows[0] || null;
}

export async function fluxoDaConexao(contaId, conexaoId) {
  const { rows } = await consultar(
    `select f.id, f.convite, f.consentimento, f.desconto, f.ativo,
            coalesce(
              (select json_agg(json_build_object('texto', p.texto, 'opcoes', p.opcoes)
                               order by p.ordem)
                 from perguntas p where p.fluxo_id = f.id),
              '[]'::json
            ) as perguntas
       from fluxos f
      where f.conexao_id = $1 and f.conta_id = $2`,
    [conexaoId, contaId],
  );
  return rows[0] || null;
}

// ----------------------------------------------------------------- leads ---

export async function criarLead({
  contaId, conexaoId, nome, email, telefone, respostas, anonimoId, redeMascarada,
}) {
  const { rows } = await consultar(
    `insert into leads (conta_id, conexao_id, nome, email, telefone, respostas,
                        anonimo_id, consentido_em, rede_mascarada)
     values ($1, $2, $3, $4, $5, $6, $7, now(), $8)
     returning id, conta_id, conexao_id, criado_em`,
    [contaId, conexaoId, nome, email, telefone, JSON.stringify(respostas || []),
     anonimoId, redeMascarada],
  );
  return rows[0];
}

export async function listarLeads(contaId, { limite = 50, deslocamento = 0, conexaoId = null } = {}) {
  const { rows } = await consultar(
    `select l.id, l.nome, l.email, l.telefone, l.respostas, l.criado_em,
            l.conexao_id, cx.nome_loja,
            cp.codigo as cupom, cp.status as cupom_status,
            (select coalesce(sum(p.valor), 0) from pedidos p where p.lead_id = l.id) as faturado
       from leads l
       join conexoes cx on cx.id = l.conexao_id
       left join cupons cp on cp.lead_id = l.id
      where l.conta_id = $1
        and ($2::uuid is null or l.conexao_id = $2)
      order by l.criado_em desc
      limit $3 offset $4`,
    [contaId, conexaoId, limite, deslocamento],
  );
  return rows;
}

export async function buscarLead(contaId, leadId) {
  const { rows } = await consultar(
    `select l.*, cx.nome_loja, cx.plataforma,
            cp.codigo as cupom, cp.status as cupom_status, cp.erro as cupom_erro
       from leads l
       join conexoes cx on cx.id = l.conexao_id
       left join cupons cp on cp.lead_id = l.id
      where l.id = $1 and l.conta_id = $2`,
    [leadId, contaId],
  );
  return rows[0] || null;
}

/** Exclusao por titular (LGPD). Eventos e cupons caem por cascade. */
export async function apagarLead(contaId, leadId) {
  const { rowCount } = await consultar(
    `delete from leads where id = $1 and conta_id = $2`,
    [leadId, contaId],
  );
  return rowCount > 0;
}

// ---------------------------------------------------------------- cupons ---

export async function registrarCupomPendente({ contaId, conexaoId, leadId, codigo, desconto }) {
  const { rows } = await consultar(
    `insert into cupons (conta_id, conexao_id, lead_id, codigo, desconto)
     values ($1, $2, $3, $4, $5) returning id`,
    [contaId, conexaoId, leadId, codigo, desconto],
  );
  return rows[0];
}

export async function marcarCupom(cupomId, status, erro = null) {
  await consultar(`update cupons set status = $1, erro = $2 where id = $3`,
    [status, erro, cupomId]);
}

export async function adicionarAoLote(contaId, conexaoId, codigos) {
  let inseridos = 0;
  for (const codigo of codigos) {
    const { rowCount } = await consultar(
      `insert into lote_cupons (conta_id, conexao_id, codigo)
       select $1, $2, $3
        where exists (select 1 from conexoes where id = $2 and conta_id = $1)
       on conflict (conexao_id, codigo) do nothing`,
      [contaId, conexaoId, codigo],
    );
    inseridos += rowCount;
  }
  return inseridos;
}

/**
 * Tira um codigo do lote de forma atomica. O update com subselect e for update
 * skip locked evita que dois leads simultaneos levem o mesmo codigo.
 */
export async function tirarDoLote(conexaoId, leadId) {
  const { rows } = await consultar(
    `update lote_cupons set lead_id = $2, usado_em = now()
      where id = (
        select id from lote_cupons
         where conexao_id = $1 and lead_id is null
         order by criado_em
         limit 1 for update skip locked
      )
      returning codigo`,
    [conexaoId, leadId],
  );
  return rows[0]?.codigo || null;
}

export async function saldoDoLote(contaId, conexaoId) {
  const { rows } = await consultar(
    `select count(*) filter (where lead_id is null) as disponiveis,
            count(*) as total
       from lote_cupons where conexao_id = $1 and conta_id = $2`,
    [conexaoId, contaId],
  );
  return rows[0];
}

// --------------------------------------------------------------- pedidos ---

export async function registrarPedido({ contaId, conexaoId, idExterno, valor, cupomCodigo, feitoEm }) {
  const { rows } = await consultar(
    `insert into pedidos (conta_id, conexao_id, id_externo, valor, cupom_codigo, lead_id, feito_em)
     values ($1, $2, $3, $4, $5,
             (select lead_id from cupons where conexao_id = $2 and codigo = $5),
             $6)
     on conflict (conexao_id, id_externo) do nothing
     returning id, lead_id`,
    [contaId, conexaoId, idExterno, valor, cupomCodigo, feitoEm],
  );
  return rows[0] || null;
}

// -------------------------------------------------------------- cobranca ---

export async function assinaturaDaConta(contaId) {
  const { rows } = await consultar(
    `select * from assinaturas
      where conta_id = $1 and status = 'ativa'
      order by criado_em desc limit 1`,
    [contaId],
  );
  return rows[0] || null;
}

export async function cobrancasEmAberto(contaId) {
  const { rows } = await consultar(
    `select id, tipo, valor, vence_em, origem, id_externo
       from cobrancas
      where conta_id = $1 and status = 'aberta'
      order by vence_em`,
    [contaId],
  );
  return rows;
}

export async function registrarCobranca({
  contaId, assinaturaId = null, tipo = 'assinatura', valor, origem, idExterno, venceEm, status = 'aberta',
}) {
  const { rows } = await consultar(
    `insert into cobrancas (conta_id, assinatura_id, tipo, valor, origem, id_externo, vence_em, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (origem, id_externo) do update
        set valor = excluded.valor, vence_em = excluded.vence_em,
            atualizado_em = now()
     returning id`,
    [contaId, assinaturaId, tipo, valor, origem, idExterno, venceEm, status],
  );
  return rows[0];
}

export async function quitarCobranca(origem, idExterno) {
  const { rows } = await consultar(
    `update cobrancas set status = 'paga', pago_em = now(), atualizado_em = now()
      where origem = $1 and id_externo = $2
      returning conta_id`,
    [origem, idExterno],
  );
  return rows[0] || null;
}

// -------------------------------------------------------------- operacao ---

export async function alertar({ contaId = null, tipo, gravidade = 'aviso', mensagem, dados = {} }) {
  await consultar(
    `insert into alertas (conta_id, tipo, gravidade, mensagem, dados)
     values ($1, $2, $3, $4, $5)`,
    [contaId, tipo, gravidade, mensagem, JSON.stringify(dados)],
  );
}

export async function alertasAbertos(limite = 50) {
  const { rows } = await consultar(
    `select * from alertas where resolvido = false order by criado_em desc limit $1`,
    [limite],
  );
  return rows;
}

/**
 * Contador por janela em banco, e nao em memoria, porque o limite precisa
 * valer com mais de um processo e sobreviver a restart. A janela vira parte
 * da chave primaria, entao contar e um unico insert.
 */
export async function consumirLimite(chave, janelaSegundos, teto) {
  const janela = Math.floor(Date.now() / 1000 / janelaSegundos);
  const { rows } = await consultar(
    `insert into limites (chave, janela, contagem) values ($1, $2, 1)
     on conflict (chave, janela) do update set contagem = limites.contagem + 1
     returning contagem`,
    [chave, janela],
  );
  return rows[0].contagem <= teto;
}

export async function limparLimites() {
  const janela = Math.floor(Date.now() / 1000 / 60) - 120;
  await consultar(`delete from limites where janela < $1`, [janela]);
}

export async function cancelarCobranca(origem, idExterno) {
  await consultar(
    `update cobrancas set status = 'cancelada', atualizado_em = now()
      where origem = $1 and id_externo = $2`,
    [origem, idExterno],
  );
}

/**
 * Estorno e chargeback devolvem a cobranca para aberta com o vencimento
 * original, para a regua recomecar de onde estava e nao do zero.
 */
export async function reabrirCobranca(origem, idExterno) {
  await consultar(
    `update cobrancas set status = 'aberta', pago_em = null, atualizado_em = now()
      where origem = $1 and id_externo = $2`,
    [origem, idExterno],
  );
}
