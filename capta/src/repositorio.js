import crypto from 'node:crypto';
import { consultar, emTransacao } from './db.js';
import { cifrar, decifrar, gerarChavePublica, hashSenha, conferirSenha } from './cripto.js';

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

export async function atualizarSenha(contaId, senha) {
  await consultar(
    `update contas set senha_hash = $2, atualizado_em = now() where id = $1`,
    [contaId, hashSenha(senha)],
  );
}

/** Troca pelo painel: exige a senha atual e derruba as outras sessoes. */
export async function trocarSenha(contaId, sessaoAtual, { atual, nova }) {
  const { rows } = await consultar(`select senha_hash from contas where id = $1`, [contaId]);
  if (!rows[0] || !conferirSenha(atual, rows[0].senha_hash)) return false;
  await atualizarSenha(contaId, nova);
  await consultar(`delete from sessoes where conta_id = $1 and id <> $2`, [contaId, sessaoAtual]);
  return true;
}

export async function buscarConta(contaId) {
  const { rows } = await consultar(
    `select id, nome, email, documento, cliente_externo, criado_em from contas where id = $1`,
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

export async function salvarFluxo(contaId, conexaoId, {
  convite, consentimento, desconto, perguntas, recompensa = 'cupom', modo = 'painel', abrirApos = 0, cor = null,
}) {
  if (perguntas.length > 3) {
    // A quarta pergunta e a de contato, fixa. Tres configuraveis e o teto.
    throw new Error('maximo de tres perguntas configuraveis antes da de contato');
  }
  return emTransacao(async (cliente) => {
    const { rows } = await cliente.query(
      `insert into fluxos (conta_id, conexao_id, convite, consentimento, desconto, recompensa, modo, abrir_apos, cor)
       select $1, $2, $3, $4, $5, $6, $7, $8, $9
        where exists (select 1 from conexoes where id = $2 and conta_id = $1)
       on conflict (conexao_id) do update
          set convite = excluded.convite,
              consentimento = excluded.consentimento,
              desconto = excluded.desconto,
              recompensa = excluded.recompensa,
              modo = excluded.modo,
              abrir_apos = excluded.abrir_apos,
              cor = excluded.cor,
              atualizado_em = now()
       returning id`,
      [contaId, conexaoId, convite, consentimento, desconto, recompensa, modo, abrirApos, cor],
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
            f.desconto, f.recompensa, f.modo, f.abrir_apos, f.cor, f.ativo, c.plataforma, c.nome_loja, c.status as status_conexao,
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
    `select f.id, f.convite, f.consentimento, f.desconto, f.recompensa, f.modo, f.abrir_apos, f.cor, f.ativo,
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

export async function listarLeads(contaId, {
  limite = 50, deslocamento = 0, conexaoId = null, situacao = null,
} = {}) {
  const { rows } = await consultar(
    `select l.id, l.nome, l.email, l.telefone, l.respostas, l.criado_em,
            l.contatado_em, l.resultado,
            l.conexao_id, cx.nome_loja,
            cp.codigo as cupom, cp.status as cupom_status,
            (select coalesce(sum(p.valor), 0) from pedidos p where p.lead_id = l.id) as faturado,
            (select count(distinct e.url) from eventos e
              where e.lead_id = l.id and e.tipo = 'produto') as produtos_vistos,
            (select count(distinct e.url) from eventos e
              where e.lead_id = l.id and e.tipo in ('pagina', 'produto')) as paginas_vistas,
            exists (select 1 from eventos e
              where e.lead_id = l.id and e.tipo = 'carrinho') as foi_ao_carrinho
       from leads l
       join conexoes cx on cx.id = l.conexao_id
       left join cupons cp on cp.lead_id = l.id
      where l.conta_id = $1
        and ($2::uuid is null or l.conexao_id = $2)
        and ($5::text is null
             or ($5 = 'a_contatar' and l.contatado_em is null)
             or ($5 = 'contatados' and l.contatado_em is not null))
      order by l.criado_em desc
      limit $3 offset $4`,
    [contaId, conexaoId, limite, deslocamento, situacao],
  );
  return rows;
}

/** Quantos esperam contato, para o painel dizer o tamanho da fila sem carregar tudo. */
export async function contagemDeLeads(contaId) {
  const { rows } = await consultar(
    `select count(*) filter (where contatado_em is null) as a_contatar,
            count(*) filter (where contatado_em is not null) as contatados,
            count(*) filter (where criado_em >= now() - interval '24 hours') as novos,
            count(*) as total
       from leads where conta_id = $1`,
    [contaId],
  );
  return rows[0];
}

/**
 * O resultado e opcional de proposito: exigir que o lojista classifique a
 * venda na hora do contato faz ele nao marcar nada, e a fila volta a mentir.
 */
export async function marcarContato(contaId, leadId, { contatado, resultado = null }) {
  const { rows } = await consultar(
    `update leads
        set contatado_em = case when $3 then coalesce(contatado_em, now()) else null end,
            resultado = case when $3 then $4 else null end
      where id = $1 and conta_id = $2
      returning id, contatado_em, resultado`,
    [leadId, contaId, contatado, resultado],
  );
  return rows[0] || null;
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

export async function registrarCupomPendente({
  contaId, conexaoId, leadId, codigo, desconto, tipo = 'percentual',
}) {
  const { rows } = await consultar(
    `insert into cupons (conta_id, conexao_id, lead_id, codigo, desconto, tipo)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [contaId, conexaoId, leadId, codigo, desconto, tipo],
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

export async function leadsNoMes(contaId) {
  const { rows } = await consultar(
    `select count(*)::int as total from leads
      where conta_id = $1 and criado_em >= date_trunc('month', now())`,
    [contaId],
  );
  return rows[0].total;
}

export async function cobrancasDaConta(contaId, limite = 12) {
  const { rows } = await consultar(
    `select id, tipo, valor, status, origem, vence_em, pago_em
       from cobrancas where conta_id = $1
      order by vence_em desc limit $2`,
    [contaId, limite],
  );
  return rows;
}

export async function salvarClienteExterno(contaId, { clienteExterno, documento }) {
  await consultar(
    `update contas set cliente_externo = coalesce($2, cliente_externo),
                       documento = coalesce($3, documento),
                       atualizado_em = now()
      where id = $1`,
    [contaId, clienteExterno || null, documento || null],
  );
}

export async function contaPorClienteExterno(clienteExterno) {
  const { rows } = await consultar(
    `select id, nome from contas where cliente_externo = $1`, [clienteExterno],
  );
  return rows[0] || null;
}

/** Troca de plano encerra a assinatura anterior; nunca ha duas ativas. */
export async function trocarAssinatura({ contaId, plano, ciclo, origem, idExterno = null }) {
  return emTransacao(async (cliente) => {
    await cliente.query(
      `update assinaturas set status = 'cancelada', fim_em = now(), atualizado_em = now()
        where conta_id = $1 and status = 'ativa'`,
      [contaId],
    );
    const { rows } = await cliente.query(
      `insert into assinaturas (conta_id, plano, ciclo, status, origem, id_externo)
       values ($1, $2, $3, 'ativa', $4, $5)
       returning *`,
      [contaId, plano, ciclo, origem, idExterno],
    );
    return rows[0];
  });
}

export async function jaPagouImplantacao(contaId) {
  const { rows } = await consultar(
    `select 1 from cobrancas where conta_id = $1 and tipo = 'implantacao' limit 1`,
    [contaId],
  );
  return rows.length > 0;
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

export async function alertarUmaVezNoMes(alerta) {
  const { rows } = await consultar(
    `select 1 from alertas
      where conta_id = $1 and tipo = $2 and criado_em >= date_trunc('month', now()) limit 1`,
    [alerta.contaId, alerta.tipo],
  );
  if (rows.length) return false;
  await alertar(alerta);
  return true;
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

// --------------------------------------------------------------- operador ---

/** Visao geral do Captapp inteiro. So o operador chama. */
export async function resumoGeral() {
  const [contas, assinantes, inadimplentes, leadsHoje, leadsMes, conexoes, cuponsFalhos, alertas] =
    await Promise.all([
      consultar(`select count(*)::int as n from contas`),
      consultar(`select plano, ciclo, count(*)::int as n from assinaturas where status = 'ativa' group by 1, 2`),
      consultar(`select count(distinct conta_id)::int as n from cobrancas where status = 'aberta' and vence_em < current_date`),
      consultar(`select count(*)::int as n from leads where criado_em >= current_date`),
      consultar(`select count(*)::int as n from leads where criado_em >= date_trunc('month', now())`),
      consultar(`select plataforma, modo_instalacao, count(*)::int as n from conexoes group by 1, 2 order by 1, 2`),
      consultar(`select count(*)::int as n from cupons where status = 'falhou' and criado_em >= current_date`),
      consultar(`select count(*)::int as n from alertas where resolvido = false`),
    ]);
  return {
    contas: contas.rows[0].n,
    assinantes: assinantes.rows,
    inadimplentes: inadimplentes.rows[0].n,
    leadsHoje: leadsHoje.rows[0].n,
    leadsMes: leadsMes.rows[0].n,
    conexoes: conexoes.rows,
    cuponsFalhosHoje: cuponsFalhos.rows[0].n,
    alertasAbertos: alertas.rows[0].n,
  };
}

export async function listarContas() {
  const { rows } = await consultar(
    `select c.id, c.nome, c.email, c.criado_em,
            a.plano, a.ciclo, a.origem,
            (select count(*)::int from leads l where l.conta_id = c.id
               and l.criado_em >= date_trunc('month', now())) as leads_mes,
            (select count(*)::int from leads l where l.conta_id = c.id) as leads_total,
            (select max(criado_em) from leads l where l.conta_id = c.id) as ultimo_lead,
            (select count(*)::int from conexoes x where x.conta_id = c.id) as conexoes,
            (select min(vence_em) from cobrancas b where b.conta_id = c.id
               and b.status = 'aberta' and b.vence_em < current_date) as vencida_desde
       from contas c
       left join assinaturas a on a.conta_id = c.id and a.status = 'ativa'
      order by c.criado_em desc`,
  );
  return rows;
}
