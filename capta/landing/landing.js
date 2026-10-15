(function () {
  'use strict';

  /*
   * O quadro do video so existe quando ha video.
   *
   * O link entra em data-url. Enquanto ele nao existe, o quadro sai da pagina
   * inteiro: um play que nao toca nada e pior que nenhum play, e quem clica
   * sai com a impressao de que o site esta quebrado. As duas acoes do topo ja
   * levam para a demonstracao, que mostra o produto melhor que um video.
   */
  var caixa = document.getElementById('video');
  if (!caixa) return;

  var url = caixa.getAttribute('data-url');
  if (!url) { caixa.remove(); return; }

  caixa.querySelector('.play').addEventListener('click', function () {
    var iframe = document.createElement('iframe');
    iframe.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.title = 'Captapp na prática';
    caixa.textContent = '';
    caixa.appendChild(iframe);
  });
}());

(function () {
  'use strict';

  /*
   * A conversa acontecendo no topo da pagina.
   *
   * Explicar um chat por escrito custa tres paragrafos e convence menos que
   * dez segundos vendo um. O roteiro abaixo e o fluxo de verdade do produto,
   * na mesma ordem: convite, linha de consentimento, perguntas da loja,
   * contato, cupom. Se a ordem mudar no widget, muda aqui tambem, senao a
   * pagina passa a prometer uma coisa e o produto a entregar outra.
   *
   * Nada disso e video: sao nos de texto entrando num cartao. Pesa nada,
   * funciona sem rede depois que a pagina abriu e da para corrigir uma
   * virgula sem reexportar arquivo nenhum.
   */
  var ROTEIRO = [
    { bot: 'Oi! Ganhe 10% de desconto. Leva menos de um minuto.' },
    { lgpd: 'Ao continuar, você concorda que a Aurora Boutique use seus dados para entrar em contato sobre esta compra.' },
    { bot: 'O que você está procurando hoje?' },
    { opcoes: ['Vestido', 'Blusa', 'Calça', 'Bolsa'], escolha: 'Vestido' },
    { bot: 'Qual o seu tamanho?' },
    { opcoes: ['PP', 'P', 'M', 'G', 'GG'], escolha: 'M' },
    { bot: 'Quer ajuda de alguém da equipe para escolher?' },
    { opcoes: ['Sim, me chamem no WhatsApp', 'Prefiro sozinha'], escolha: 'Sim, me chamem no WhatsApp' },
    { bot: 'Para eu te mandar o cupom, como é o seu nome?' },
    { campo: 'Renata' },
    { bot: 'Prazer, Renata! E o seu WhatsApp?' },
    { campo: '(41) 99999-0000' },
    { cupom: 'AURORA-7K2QXR' },
  ];

  var caixa = document.getElementById('demo-chat');
  var ms = document.getElementById('dc-ms');
  var rs = document.getElementById('dc-rs');
  if (!caixa || !ms || !rs) return;
  caixa.hidden = false;

  var paradinha = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function no(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function balao(classe, texto) {
    var b = no('div', 'dc-bb ' + classe, texto);
    ms.appendChild(b);
    // O cartao tem altura fixa: sem isto o balao novo nasce fora da vista.
    ms.scrollTop = ms.scrollHeight;
    return b;
  }

  function cupom(codigo) {
    var b = no('div', 'dc-bb cupom');
    b.appendChild(no('div', null, 'Pronto! Use este cupom no carrinho:'));
    b.appendChild(no('b', null, codigo));
    b.appendChild(no('span', null, 'Ele é só seu e vale uma vez.'));
    ms.appendChild(b);
    ms.scrollTop = ms.scrollHeight;
  }

  var tempos = [];
  function daqui(ms_, fn) { tempos.push(setTimeout(fn, ms_)); }
  function limpar() { tempos.forEach(clearTimeout); tempos = []; }

  function digitando() {
    var d = no('div', 'dc-dg');
    d.appendChild(no('i')); d.appendChild(no('i')); d.appendChild(no('i'));
    ms.appendChild(d);
    ms.scrollTop = ms.scrollHeight;
    return d;
  }

  function tocar(i) {
    if (i >= ROTEIRO.length) {
      // Um respiro com o cupom na tela antes de recomecar: e o quadro que a
      // pessoa precisa levar embora.
      daqui(5200, comecar);
      return;
    }
    var passo = ROTEIRO[i];

    if (passo.bot) {
      var pontos = digitando();
      // O tempo acompanha o tamanho da frase, como no widget de verdade.
      daqui(Math.min(1100, 420 + passo.bot.length * 11), function () {
        pontos.remove();
        balao('bot', passo.bot);
        daqui(520, function () { tocar(i + 1); });
      });
      return;
    }

    if (passo.lgpd) {
      balao('lgpd', passo.lgpd);
      daqui(700, function () { tocar(i + 1); });
      return;
    }

    if (passo.opcoes) {
      rs.textContent = '';
      var botoes = passo.opcoes.map(function (texto) {
        var b = no('span', 'dc-op', texto);
        rs.appendChild(b);
        return b;
      });
      var escolhido = botoes[passo.opcoes.indexOf(passo.escolha)];
      daqui(1500, function () {
        if (escolhido) escolhido.classList.add('escolhida');
        daqui(420, function () {
          rs.textContent = '';
          balao('eu', passo.escolha);
          daqui(620, function () { tocar(i + 1); });
        });
      });
      return;
    }

    if (passo.campo) {
      rs.textContent = '';
      var campo = no('div', 'dc-campo');
      var escrito = no('b', null, '');
      campo.appendChild(escrito);
      rs.appendChild(campo);
      rs.appendChild(no('span', 'dc-enviar', 'Enviar'));
      // Letra por letra: e o detalhe que faz parecer alguem respondendo, e
      // nao um slide trocando.
      var letras = 0;
      var escrever = function () {
        letras += 1;
        escrito.textContent = passo.campo.slice(0, letras);
        if (letras < passo.campo.length) { daqui(55, escrever); return; }
        daqui(520, function () {
          rs.textContent = '';
          balao('eu', passo.campo);
          daqui(600, function () { tocar(i + 1); });
        });
      };
      daqui(500, escrever);
      return;
    }

    if (passo.cupom) {
      rs.textContent = '';
      rs.appendChild(no('span', 'dc-op escolhida', 'Fechar'));
      var pontosFim = digitando();
      daqui(900, function () {
        pontosFim.remove();
        cupom(passo.cupom);
        tocar(i + 1);
      });
    }
  }

  function comecar() {
    limpar();
    ms.textContent = '';
    rs.textContent = '';
    tocar(0);
  }

  /*
   * Quem pediu menos movimento ve a conversa inteira, parada. O conteudo e o
   * argumento; a animacao e so o jeito de entrega-lo.
   */
  if (paradinha) {
    ROTEIRO.forEach(function (passo) {
      if (passo.bot) balao('bot', passo.bot);
      else if (passo.lgpd) balao('lgpd', passo.lgpd);
      else if (passo.escolha) balao('eu', passo.escolha);
      else if (passo.campo) balao('eu', passo.campo);
      else if (passo.cupom) cupom(passo.cupom);
    });
    return;
  }

  /*
   * So roda com o cartao a vista. Deixar a animacao girando numa aba
   * esquecida no fundo gasta bateria de celular para ninguem ver.
   */
  if (!window.IntersectionObserver) { comecar(); return; }
  var vendo = false;
  new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (entrada.isIntersecting && !vendo) { vendo = true; comecar(); }
      else if (!entrada.isIntersecting && vendo) { vendo = false; limpar(); }
    });
  }, { threshold: 0.25 }).observe(caixa);
}());
