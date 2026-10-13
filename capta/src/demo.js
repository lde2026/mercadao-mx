import { MODELOS } from './modelos.js';

/**
 * Demonstracao publica, sem cadastro.
 *
 * A pessoa abre /demo, responde o chat como visitante de uma loja ficticia e
 * ve o proprio lead chegar no painel do lojista. O widget que roda ali e o
 * mesmo arquivo que vai para a loja dos clientes, nao uma imitacao: e a unica
 * forma de a demonstracao continuar verdadeira quando o widget mudar.
 *
 * Nada e gravado, e isso nao e economia de codigo.
 *
 * Quem experimenta nao e cliente nosso e nao assinou nada. Guardar o nome e o
 * WhatsApp que ele digita ali seria tratar dado pessoal de um estranho sem
 * base legal, e encher o banco de contato que ninguem vai usar. O lead da
 * demonstracao existe so no navegador de quem respondeu.
 *
 * Pela mesma razao o cupom e inventado aqui: criar cupom de verdade exigiria
 * uma loja de verdade conectada.
 */

export const CHAVE_DEMO = 'demo';

const MODELO = MODELOS.find((m) => m.id === 'moda');

export const LOJA_DEMO = 'Aurora Boutique';

export function fluxoDemo() {
  return {
    convite: 'Ganhe 10% de desconto',
    consentimento: `Ao continuar, você concorda que a ${LOJA_DEMO} use seus dados para entrar em contato sobre esta compra.`,
    perguntas: MODELO.perguntas.map((p) => ({ texto: p.texto, opcoes: p.opcoes.slice() })),
    recompensa: 'cupom',
    modo: 'painel',
    abrirApos: 0,
    cor: '#ff5a1f',
    botaoFormato: 'retangular',
    botaoPosicao: 'direita-inferior',
    loja: LOJA_DEMO,
    // Rastreamento desligado: sem conta, nao ha para onde mandar evento, e
    // carregar o rastreador so para a demonstracao seria pedir permissao de
    // navegacao a quem veio olhar uma pagina de venda.
    rastrear: false,
    whatsapp: null,
  };
}

/** Codigo no formato que a loja veria, mas que nao existe em plataforma nenhuma. */
export function cupomDemo() {
  const sorteio = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return `AURORA-${sorteio.padEnd(6, 'X')}`;
}
