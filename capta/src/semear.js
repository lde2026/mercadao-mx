import { pool } from './db.js';
import * as repo from './repositorio.js';

/**
 * Semeia a MX Kids com o fluxo real de motocross infantil. Conteudo de
 * verdade revela problema de layout que "Pergunta 1" e "Joao da Silva"
 * escondem.
 */

const EMAIL = 'pierre@mxkids.com.br';
const SENHA = 'trilha-de-teste-2026';

let conta = await repo.buscarContaPorEmail(EMAIL);
if (!conta) {
  conta = await repo.criarConta({ nome: 'MX Kids', email: EMAIL, senha: SENHA });
}

const jaTem = (await repo.listarConexoes(conta.id))[0];
const conexao = jaTem || await repo.criarConexao({
  contaId: conta.id,
  plataforma: 'nuvemshop',
  nomeLoja: 'MX Kids',
  dominio: 'mxkids.com.br',
  credenciais: { access_token: 'token-de-desenvolvimento', store_id: '99123' },
  modoInstalacao: 'auto',
});

await repo.salvarFluxo(conta.id, conexao.id, {
  convite: 'Ganhe 10% na primeira compra',
  consentimento: 'Ao continuar, voce concorda que a MX Kids use seus dados para entrar em contato sobre esta compra.',
  desconto: 10,
  perguntas: [
    { texto: 'Pra quem voce esta comprando?', opcoes: ['Meu filho', 'Minha filha', 'Presente', 'Pra mim'] },
    { texto: 'Que idade ele tem?', opcoes: ['Ate 4 anos', '5 a 8', '9 a 12', 'Acima de 12'] },
    { texto: 'Ele ja anda de moto?', opcoes: ['Ja anda', 'Esta comecando', 'Ainda nao'] },
  ],
});

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
