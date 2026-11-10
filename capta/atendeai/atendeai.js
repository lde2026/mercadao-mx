/*
 * A conversa do hero acontece sozinha.
 *
 * E a pergunta que mais chega numa loja virtual, respondida com o prazo da
 * base. Mostrar o produto funcionando vale mais que a frase dizendo que ele
 * funciona, e quem abre a pagina no celular ve a mesma cena.
 */
(function () {
  var alvo = document.getElementById('conversa');
  if (!alvo) return;

  var cena = [
    { quem: 'cliente', texto: 'oi, comprei ontem. qual o prazo pra Fortaleza?', hora: '23:14' },
    { digita: 900 },
    { quem: 'loja', texto: 'Oi! Para o Nordeste o prazo é de 8 dias úteis depois da postagem.', hora: '23:14' },
    { quem: 'cliente', texto: 'e se não servir, consigo trocar?', hora: '23:15' },
    { digita: 1000 },
    { quem: 'loja', texto: 'Consegue sim. A troca vale por 30 dias corridos, com a etiqueta na peça.', hora: '23:15' },
  ];

  var parado = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function bolha(passo) {
    var d = document.createElement('div');
    d.className = 'bb ' + passo.quem;
    d.textContent = passo.texto;
    var h = document.createElement('span');
    h.className = 'hora';
    h.textContent = passo.hora;
    d.appendChild(h);
    alvo.appendChild(d);
  }

  if (parado) { cena.forEach(function (p) { if (p.texto) bolha(p); }); return; }

  var i = 0;
  function seguir() {
    if (i >= cena.length) return;
    var passo = cena[i++];
    if (passo.digita) {
      var p = document.createElement('div');
      p.className = 'digitando';
      p.innerHTML = '<i></i><i></i><i></i>';
      alvo.appendChild(p);
      setTimeout(function () { p.remove(); seguir(); }, passo.digita);
      return;
    }
    bolha(passo);
    setTimeout(seguir, passo.quem === 'cliente' ? 700 : 1400);
  }
  setTimeout(seguir, 500);
}());
