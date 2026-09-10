import { pedir } from './http.js';

/**
 * A pior das quatro, e e onde estao os clientes.
 *
 * Precisa de duas chaves. A Chave de API o lojista gera sozinho, mas so
 * existe em plano pago. A Chave de Aplicacao a equipe deles emite por
 * formulario, em 3 a 5 dias uteis, o que coloca a venda em espera e precisa
 * estar claro no painel desde o primeiro dia.
 */

const BASE = 'https://api.awsli.com.br/v1';

function cabecalhos(credenciais) {
  return {
    Authorization: `chave_api ${credenciais.chave_api} aplicacao ${credenciais.chave_aplicacao}`,
    'Content-Type': 'application/json',
  };
}

export const lojaIntegrada = {
  plataforma: 'loja_integrada',
  tokenExpira: false,

  // Nao ha endpoint de cupom na v1 publica. O cupom sai de um lote que o
  // lojista cadastra antes, e quem distribui e o fluxo-lead, nao o adaptador.
  criaCupomPorApi: false,

  // Nao ha webhook de pedido. A atribuicao de faturamento roda por varredura.
  temWebhookDePedido: false,

  async criarCupom() {
    throw new Error(
      'Loja Integrada nao cria cupom por API. O codigo sai do lote cadastrado pelo lojista.',
    );
  },

  /**
   * A insercao e manual, em Visual e Incluir codigo HTML. O bloqueio grave e
   * que esse campo nao existe nas lojas com o tema padrao novo: nelas o
   * produto nao instala, e isso precisa virar pergunta de qualificacao antes
   * da venda, nao descoberta depois da implantacao cobrada.
   */
  async instalarScript(credenciais, urlScript) {
    if (credenciais.tema_permite_html === false) {
      return {
        modo: 'bloqueado',
        motivo: 'A loja usa o tema padrao novo da Loja Integrada, que nao tem o campo Incluir codigo HTML. Nao existe onde inserir o widget.',
        saida: 'Migrar para um tema que aceite HTML personalizado, ou trocar de plataforma.',
      };
    }
    return {
      modo: 'manual',
      instrucoes: [
        'No painel da Loja Integrada, entre em Visual e Incluir codigo HTML.',
        'Cole a tag abaixo no campo de codigo do rodape e salve.',
        'Publique o tema para o codigo valer na loja.',
      ],
      tag: `<script async src="${urlScript}"></script>`,
      urlScript,
    };
  },

  async listarPedidos(credenciais, desde) {
    const busca = new URLSearchParams({
      since_atualizado: desde.toISOString(),
      limit: '100',
    });
    const resposta = await pedir(`${BASE}/pedido/search?${busca}`, {
      headers: cabecalhos(credenciais),
    }, { plataforma: 'loja_integrada' });

    return (resposta?.objects || []).map((p) => ({
      idExterno: String(p.numero ?? p.id),
      valor: Number(p.valor_total || 0),
      cupomCodigo: p.cupom_desconto || null,
      feitoEm: p.data_criacao,
    }));
  },
};
