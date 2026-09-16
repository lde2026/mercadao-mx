/**
 * Qualquer loja que não é uma das quatro que integram.
 *
 * Shopify, VTEX, Magento, Wix, site feito à mão: o widget funciona em todas,
 * porque é uma tag de script e nada mais. O que não existe é API, e este
 * adaptador diz isso de forma explícita em vez de tentar e falhar depois.
 *
 * Na prática, para o lojista:
 *
 * - O chat funciona igual. Mesma captação, mesmas perguntas, mesmo lead.
 * - O cupom sai de um lote que ele cadastra antes, como na Loja Integrada.
 * - A instalação é colar a tag no tema, uma vez.
 * - O faturamento atribuído não aparece: sem API de pedidos, não há como
 *   saber que a venda veio do cupom. Por isso nem existe `listarPedidos`
 *   aqui, e a varredura pula esta loja em vez de rodar à toa a cada meia
 *   hora.
 *
 * E no dia 45 da régua de inadimplência o script não é removido de fora,
 * porque não fomos nós que o colocamos. Quem tira é o lojista.
 */

export const outra = {
  plataforma: 'outra',
  tokenExpira: false,
  criaCupomPorApi: false,
  temWebhookDePedido: false,

  async criarCupom() {
    throw new Error(
      'Esta loja não tem integração de API. O código sai do lote cadastrado pelo lojista.',
    );
  },

  async instalarScript(_credenciais, urlScript) {
    return {
      modo: 'manual',
      instrucoes: [
        'Abra o editor de tema ou de código da sua loja.',
        'Cole a tag abaixo antes do </body>, no rodapé de todas as páginas.',
        'Salve e publique. Recarregue a loja: o botão aparece no canto que você escolheu.',
      ],
      tag: `<script async src="${urlScript}"></script>`,
      urlScript,
    };
  },
};
