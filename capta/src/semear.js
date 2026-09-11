import { pool } from './db.js';
import * as repo from './repositorio.js';

/**
 * Semeia a Bella Moda com o fluxo padrao de moda. Conteudo de
 * verdade revela problema de layout que "Pergunta 1" e "Joao da Silva"
 * escondem.
 */

const EMAIL = 'pierre@bellamoda.com.br';
const SENHA = 'moda-de-teste-2026';

let conta = await repo.buscarContaPorEmail(EMAIL);
if (!conta) {
  conta = await repo.criarConta({ nome: 'Bella Moda', email: EMAIL, senha: SENHA });
}

const jaTem = (await repo.listarConexoes(conta.id))[0];
const conexao = jaTem || await repo.criarConexao({
  contaId: conta.id,
  plataforma: 'nuvemshop',
  nomeLoja: 'Bella Moda',
  dominio: 'bellamoda.com.br',
  credenciais: { access_token: 'token-de-desenvolvimento', store_id: '99123' },
  modoInstalacao: 'auto',
});

await repo.salvarFluxo(conta.id, conexao.id, {
  convite: 'Ganhe 10% na primeira compra',
  consentimento: 'Ao continuar, você concorda que a Bella Moda use seus dados para entrar em contato sobre esta compra.',
  desconto: 10,
  perguntas: [
    { texto: 'Qual o seu tamanho?', opcoes: ['PP', 'P', 'M', 'G', 'GG', 'Plus Size'] },
    { texto: 'Qual produto você se interessa mais?', opcoes: [] },
    { texto: 'Qual faixa de preço você costuma procurar?',
      opcoes: ['Até R$ 100', 'R$ 100 a R$ 200', 'R$ 200 a R$ 400', 'Acima de R$ 400'] },
  ],
});

/**
 * As outras duas existem para a tela de integracoes mostrar os tres modos.
 * Sem elas so da para conferir o caminho automatico, que e justamente o unico
 * que nao da trabalho a ninguem.
 */
const outras = [
  {
    plataforma: 'tray', nomeLoja: 'Casa Verde Decor', dominio: 'casaverdedecor.com.br',
    credenciais: {
      api_address: 'https://casaverdedecor.commercesuite.com.br/web_api',
      access_token: 'token-de-desenvolvimento', refresh_token: 'refresh-de-desenvolvimento',
    },
  },
  {
    // Tema padrao novo: o campo Incluir codigo HTML nao existe, entao o
    // produto nao instala. E a pergunta de qualificacao antes da venda.
    plataforma: 'loja_integrada', nomeLoja: 'Pet Cia', dominio: 'petcia.com.br',
    credenciais: {
      chave_api: 'chave-de-desenvolvimento', chave_aplicacao: 'aplicacao-de-desenvolvimento',
      tema_permite_html: false,
    },
  },
];

const existentes = await repo.listarConexoes(conta.id);
for (const nova of outras) {
  if (existentes.some((c) => c.plataforma === nova.plataforma)) continue;
  const criada = await repo.criarConexao({ contaId: conta.id, ...nova });
  const resolvida = await (await import('./adapters/index.js'))
    .adaptador(nova.plataforma)
    .instalarScript(nova.credenciais, 'https://cdn.capta.com.br/widget.js');
  await repo.atualizarConexao(conta.id, criada.id, {
    modo_instalacao: resolvida.modo,
    detalhe_status: resolvida.motivo || null,
  });
  await repo.salvarFluxo(conta.id, criada.id, {
    convite: 'Ganhe 10% na primeira compra',
    consentimento: `Ao continuar, voce concorda que a ${nova.nomeLoja} use seus dados para entrar em contato sobre esta compra.`,
    desconto: 10,
    perguntas: [{ texto: 'O que você procura hoje?', opcoes: ['Sala', 'Quarto', 'Cozinha', 'Presente'] }],
  });
}

// Lote de cupons da Loja Integrada, que nao cria cupom por API.
const li = (await repo.listarConexoes(conta.id)).find((c) => c.plataforma === 'loja_integrada');
if (li) await repo.adicionarAoLote(conta.id, li.id, ['PETCIA-A1', 'PETCIA-B2', 'PETCIA-C3']);

const { consultar } = await import('./db.js');
await consultar(
  `insert into assinaturas (conta_id, plano, ciclo, status, origem)
   select $1, 'crescimento', 'mensal', 'ativa', 'asaas'
    where not exists (select 1 from assinaturas where conta_id = $1)`,
  [conta.id],
);

console.log(JSON.stringify({
  conta: conta.id,
  email: EMAIL,
  senha: SENHA,
  conexao: conexao.id,
  chave: conexao.chave_publica,
}, null, 2));

await pool.end();
