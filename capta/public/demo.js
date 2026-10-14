(function () {
  'use strict';

  /*
   * Cada visita e uma demonstracao nova.
   *
   * O widget guarda no navegador quem ja pegou o beneficio, para nao insistir
   * com quem ja converteu. Numa loja de verdade isso esta certo; aqui faria a
   * pagina parecer quebrada para quem voltasse, porque o botao simplesmente
   * nao apareceria.
   *
   * Tambem limpamos a marca de "ja abriu sozinho", senao a abertura
   * automatica so aconteceria na primeira visita de cada pessoa.
   */
  try {
    localStorage.removeItem('capta_feito_demo');
    localStorage.removeItem('capta_visto_demo');
    localStorage.removeItem('capta_clicou_demo');
  } catch (e) { /* modo anonimo, e aqui nao faz falta */ }

  /*
   * O widget posta o lead direto para o servidor. Em vez de mexer no widget
   * para ele avisar a pagina, que seria carregar peso de demonstracao no
   * arquivo que vai para a loja de todo cliente, a demonstracao escuta a
   * propria chamada aqui.
   */
  var fetchOriginal = window.fetch;
  window.fetch = function (recurso, config) {
    var url = typeof recurso === 'string' ? recurso : (recurso && recurso.url) || '';
    var resposta = fetchOriginal.apply(this, arguments);
    if (url.indexOf('/w/lead/demo') === -1) return resposta;
    return resposta.then(function (r) {
      // O corpo so pode ser lido uma vez, entao a copia e para nos.
      r.clone().json().then(function (dados) { mostrarPainel(dados); }).catch(function () {});
      return r;
    });
  };

  function texto(tag, classe, conteudo) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (conteudo != null) n.textContent = conteudo;
    return n;
  }

  function primeiroNome(nome) {
    return String(nome || '').trim().split(/\s+/)[0] || 'Visitante';
  }

  function mostrarPainel(dados) {
    var lead = (dados && dados.lead) || {};
    var caixa = document.getElementById('lead');
    caixa.textContent = '';

    var topo = texto('div', 'lead-topo');
    topo.appendChild(texto('span', 'lead-nome', lead.nome || 'Visitante'));
    topo.appendChild(texto('span', 'selo', 'novo'));
    caixa.appendChild(topo);

    var contato = [lead.telefone, lead.email].filter(Boolean).join('  ·  ');
    caixa.appendChild(texto('div', 'lead-contato', contato || 'sem contato informado'));

    /*
     * A resposta sobre atendimento ganha destaque proprio.
     *
     * Ela e a que decide onde a vendedora gasta a proxima hora: entre dez
     * leads, o que pediu para ser chamado vale mais que os outros nove. Numa
     * lista de chips iguais essa informacao se perde.
     */
    var pediuAjuda = (lead.respostas || []).some(function (r) {
      return /quer ajuda/i.test(r.pergunta) && /^sim/i.test(r.resposta);
    });
    if (pediuAjuda) {
      var faixa = texto('div', 'pediu-ajuda');
      faixa.appendChild(texto('b', null, 'Pediu atendimento'));
      faixa.appendChild(texto('span', null, 'Esta pessoa quer falar com alguém da equipe antes de comprar.'));
      caixa.appendChild(faixa);
    }

    var respostas = texto('div', 'respostas');
    (lead.respostas || []).forEach(function (r) {
      var bloco = texto('div', 'resposta');
      bloco.appendChild(texto('b', null, r.pergunta));
      bloco.appendChild(texto('span', null, r.resposta));
      respostas.appendChild(bloco);
    });
    if (respostas.children.length) caixa.appendChild(respostas);

    var linha = texto('div', 'cupom-linha');
    linha.appendChild(texto('span', 'cupom', dados.cupom || 'AURORA-XXXXXX'));
    var zap = document.createElement('a');
    zap.className = 'zap';
    zap.href = '#';
    zap.textContent = 'Chamar ' + primeiroNome(lead.nome) + ' no WhatsApp';
    zap.addEventListener('click', function (e) {
      e.preventDefault();
      alert('Na sua conta, este botão abre a conversa com o lead, com a primeira mensagem já escrita.');
    });
    linha.appendChild(zap);
    caixa.appendChild(linha);

    document.getElementById('passo').innerHTML =
      '<b>Passo 2 de 2.</b> Este é o painel do lojista. O lead é o que você acabou de responder.';

    // Um respiro antes de chamar para a segunda metade: o widget ainda esta
    // mostrando o cupom, e cortar isso no meio tira o fecho da experiencia.
    setTimeout(convidarParaOPainel, 2400);
  }

  /*
   * A passagem de uma tela para a outra e o momento que explica o produto.
   *
   * Trocar sozinho fazia a pessoa perder o fio: ela acabava de receber um
   * cupom e de repente estava noutra tela, sem saber que agora esta vendo o
   * outro lado. O convite com mascara escura para tudo, diz o que vem a
   * seguir e deixa ela clicar.
   */
  function convidarParaOPainel() {
    var mascara = texto('div', 'convite-mascara');
    var caixa = texto('div', 'convite-caixa');

    caixa.appendChild(texto('div', 'convite-selo', 'Lead capturado'));
    caixa.appendChild(texto('h2', null, 'Você acabou de virar um lead.'));
    caixa.appendChild(texto('p', null,
      'Do outro lado, a loja recebeu o seu nome, o seu WhatsApp e tudo o que você respondeu. Agora veja como o lojista recebe isso.'));

    var botao = texto('button', 'convite-botao', 'Ver painel do lojista');
    botao.type = 'button';
    botao.addEventListener('click', function () {
      mascara.remove();
      document.getElementById('loja').style.display = 'none';
      document.getElementById('painel').classList.add('aberto');
      // O widget sai junto com a loja. Deixado no ar, ele fica flutuando por
      // cima do painel e tapa justamente o botao de criar conta.
      var hospedeiro = document.querySelector('div[data-capta]');
      if (hospedeiro) hospedeiro.remove();
      // Em popup o widget trava a rolagem da pagina enquanto esta aberto, e
      // quem destrava e o botao de fechar dele, que aqui nunca e clicado.
      // Sem isto o painel abriria preso no topo, sem rolar.
      document.body.style.overflow = '';
      window.scrollTo(0, 0);
    });
    caixa.appendChild(botao);

    mascara.appendChild(caixa);
    document.body.appendChild(mascara);
    botao.focus();
  }

  // A home tem varios botoes de comprar, um por produto e um no banner.
  // Com querySelector so o primeiro respondia, e clicar nos outros parecia
  // pagina travada.
  Array.prototype.forEach.call(document.querySelectorAll('.comprar'), function (botao) {
    botao.addEventListener('click', function () {
      alert('A loja é de mentira. O que funciona de verdade aqui é o chat.');
    });
  });
}());
