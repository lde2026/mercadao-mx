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
