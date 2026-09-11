/**
 * Modelos de fluxo por nicho. O lojista comeca por um deles e ajusta o texto,
 * em vez de encarar uma tela em branco. Cada um tem tres perguntas no maximo,
 * porque a quarta e sempre a de contato e mais que isso derruba a taxa de
 * resposta.
 *
 * {loja} vira o nome da loja na hora de aplicar. Pergunta sem opcoes e de
 * resposta livre.
 */
export const MODELOS = [
  {
    id: 'moda',
    nicho: 'Moda e vestuario',
    nome: 'Oferta de cupom',
    convite: 'Ganhe 10% na primeira compra',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato sobre esta compra.',
    desconto: 10,
    recompensa: 'cupom',
    perguntas: [
      { texto: 'Qual o seu tamanho?', opcoes: ['PP', 'P', 'M', 'G', 'GG', 'Plus Size'] },
      { texto: 'Qual produto você se interessa mais?', opcoes: [] },
      { texto: 'Qual faixa de preço você costuma procurar?',
        opcoes: ['Até R$ 100', 'R$ 100 a R$ 200', 'R$ 200 a R$ 400', 'Acima de R$ 400'] },
    ],
  },
  {
    id: 'motocross_infantil',
    nicho: 'Motocross e trilha',
    nome: 'Equipamento infantil',
    convite: 'Ganhe 10% na primeira compra',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato sobre esta compra.',
    desconto: 10,
    recompensa: 'cupom',
    perguntas: [
      { texto: 'Pra quem você está comprando?', opcoes: ['Meu filho', 'Minha filha', 'Presente', 'Pra mim'] },
      { texto: 'Que idade ele tem?', opcoes: ['Até 4 anos', '5 a 8', '9 a 12', 'Acima de 12'] },
      { texto: 'Ele já anda de moto?', opcoes: ['Já anda', 'Está começando', 'Ainda não'] },
    ],
  },
  {
    id: 'skate',
    nicho: 'Skate e surf',
    nome: 'Primeira compra',
    convite: 'Ganhe 10% no seu primeiro pedido',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato sobre esta compra.',
    desconto: 10,
    recompensa: 'cupom',
    perguntas: [
      { texto: 'O que você procura hoje?', opcoes: ['Shape', 'Truck e rodas', 'Tênis', 'Roupa', 'Skate completo'] },
      { texto: 'Há quanto tempo você anda?', opcoes: ['Estou começando', 'Menos de 1 ano', '1 a 3 anos', 'Mais de 3 anos'] },
      { texto: 'Qual seu estilo?', opcoes: ['Street', 'Park', 'Vert', 'Só pra passear'] },
    ],
  },
  {
    id: 'generico',
    nicho: 'Qualquer loja',
    nome: 'Cupom de boas-vindas',
    convite: 'Ganhe um cupom',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato sobre esta compra.',
    desconto: 10,
    recompensa: 'cupom',
    perguntas: [
      { texto: 'É a sua primeira vez aqui?', opcoes: ['Sim, primeira vez', 'Já comprei antes', 'Só olhando'] },
      { texto: 'O que você está procurando?', opcoes: [] },
      { texto: 'Qual faixa de preço você costuma procurar?',
        opcoes: ['Até R$ 100', 'R$ 100 a R$ 300', 'R$ 300 a R$ 600', 'Acima de R$ 600'] },
    ],
  },
  {
    id: 'frete_gratis',
    nicho: 'Qualquer loja',
    nome: 'Frete grátis na primeira compra',
    convite: 'Frete grátis na primeira compra',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato sobre esta compra.',
    desconto: 0,
    recompensa: 'frete_gratis',
    perguntas: [
      { texto: 'É a sua primeira vez aqui?', opcoes: ['Sim, primeira vez', 'Já comprei antes', 'Só olhando'] },
      { texto: 'O que você está procurando?', opcoes: [] },
    ],
  },
  {
    id: 'diagnostico',
    nicho: 'Serviços e agências',
    nome: 'Diagnóstico gratuito',
    convite: 'Diagnóstico gratuito da sua loja',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato sobre este diagnóstico.',
    desconto: 0,
    recompensa: 'diagnostico',
    perguntas: [
      { texto: 'Qual descreve melhor o momento da sua operação?',
        opcoes: ['Só loja física', 'Só loja virtual', 'Física e virtual', 'Ainda não tenho loja'] },
      { texto: 'O que você precisa agora?',
        opcoes: ['Implantação completa', 'Serviços para minha loja', 'Migração de plataforma', 'Mentoria'] },
      { texto: 'Quanto pretende investir no projeto?',
        opcoes: ['Até R$ 1 mil', 'Até R$ 5 mil', 'Até R$ 10 mil', 'Acima de R$ 10 mil'] },
    ],
  },
  {
    id: 'especialista',
    nicho: 'Serviços e agências',
    nome: 'Fale com um especialista',
    convite: 'Fale com um especialista',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato.',
    desconto: 0,
    recompensa: 'especialista',
    perguntas: [
      { texto: 'Sobre o que você quer conversar?', opcoes: ['Abrir minha loja', 'Vender mais', 'Trocar de plataforma', 'Outro assunto'] },
      { texto: 'Qual o site ou Instagram do seu negócio?', opcoes: [] },
    ],
  },
  {
    id: 'consultoria',
    nicho: 'Serviços e agências',
    nome: 'Ganhe uma consultoria',
    convite: 'Ganhe uma consultoria gratuita',
    consentimento: 'Ao continuar, você concorda que a {loja} use seus dados para entrar em contato sobre a consultoria.',
    desconto: 0,
    recompensa: 'consultoria',
    perguntas: [
      { texto: 'Qual o tamanho da sua operação hoje?', opcoes: ['Estou começando', 'Até R$ 10 mil por mês', 'R$ 10 a 50 mil por mês', 'Acima de R$ 50 mil por mês'] },
      { texto: 'Qual o maior desafio agora?', opcoes: ['Tráfego', 'Conversão', 'Operação e logística', 'Plataforma'] },
      { texto: 'Qual o site ou Instagram do seu negócio?', opcoes: [] },
    ],
  },
];
