/**
 * Rastreamento de navegacao no navegador do visitante.
 *
 * Trava principal: nada e enviado sem consentimento. O rastreador acumula os
 * eventos em memoria e so comeca a mandar depois que a pessoa aceita no
 * widget, momento em que window.__captaConsentir e chamado. Antes disso nada
 * sai deste arquivo.
 */
(function () {
  'use strict';
  try {
    // O widget carrega este arquivo sozinho. Se a loja tambem colocou a tag
    // a mao, a segunda copia para aqui, senao cada pagina viraria dois eventos.
    if (window.__captaRastreando) return;
    window.__captaRastreando = true;

    var script = document.currentScript;
    if (!script) return;
    var origem = new URL(script.src, location.href);
    var chave = origem.searchParams.get('k');
    if (!chave) return;
    var api = origem.origin;

    var CHAVE_ANON = 'capta_anon';
    var CHAVE_OK = 'capta_ok_' + chave;

    function guardado(nome) {
      try { return localStorage.getItem(nome); } catch (e) { return null; }
    }
    function guardar(nome, valor) {
      try { localStorage.setItem(nome, valor); } catch (e) { /* modo anonimo */ }
    }

    var consentido = guardado(CHAVE_OK) === '1';
    var fila = [];

    function anonimo() {
      var id = guardado(CHAVE_ANON);
      if (!id) {
        id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        guardar(CHAVE_ANON, id);
      }
      return id;
    }

    function mandar(evento) {
      var corpo = JSON.stringify({
        chave: chave, anonimoId: anonimo(), tipo: evento.tipo,
        url: evento.url, titulo: evento.titulo, dados: evento.dados || {},
      });
      // sendBeacon sobrevive a navegacao, que e justamente quando a maioria
      // dos eventos acontece. fetch sem ele perde o ultimo evento da visita.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(api + '/e', new Blob([corpo], { type: 'application/json' }));
        return;
      }
      fetch(api + '/e', {
        method: 'POST', mode: 'cors', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: corpo,
      }).catch(function () { /* silencio */ });
    }

    function registrar(tipo, dados) {
      var evento = {
        tipo: tipo, url: location.href,
        titulo: document.title, dados: dados,
      };
      // Sem consentimento o evento fica na memoria desta aba e nada sai daqui.
      // A fila tem teto para nao crescer sem limite numa sessao longa.
      if (!consentido) {
        if (fila.length < 50) fila.push(evento);
        return;
      }
      mandar(evento);
    }

    window.__captaConsentir = function () {
      if (consentido) return;
      consentido = true;
      guardar(CHAVE_OK, '1');
      // A navegacao anterior ao aceite so sobe agora, que e quando existe base
      // legal para ela existir do nosso lado.
      for (var i = 0; i < fila.length; i += 1) mandar(fila[i]);
      fila = [];
    };

    window.__captaIdentificar = function () {
      // A costura acontece no servidor, pelo anonimo_id que ja viaja em todo
      // evento. Esta funcao existe porque o widget a chama e para o lojista
      // poder encaixar o proprio rastreio no mesmo momento.
      registrar('identificado');
    };

    function ehProduto() {
      return Boolean(
        document.querySelector('[itemtype*="schema.org/Product"]')
        || document.querySelector('meta[property="product:price:amount"]')
        || /\/(produto|product|p)\//i.test(location.pathname),
      );
    }

    registrar(ehProduto() ? 'produto' : 'pagina');

    var ultima = location.href;
    setInterval(function () {
      if (location.href === ultima) return;
      ultima = location.href;
      registrar(ehProduto() ? 'produto' : 'pagina');
    }, 1000);

    document.addEventListener('click', function (evento) {
      try {
        var alvo = evento.target.closest('[name="add-to-cart"],.add-to-cart,[href*="carrinho"],[href*="cart"]');
        if (alvo) registrar('carrinho');
      } catch (e) { /* seletor recusado por tema antigo */ }
    }, true);

    addEventListener('pagehide', function () { registrar('saida'); });
  } catch (e) {
    // Nenhum erro nosso no console da loja.
  }
}());
