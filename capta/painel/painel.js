/**
 * Painel do lojista. Sem framework, pela mesma razao do widget: cada
 * dependencia e superficie de ataque e de manutencao.
 *
 * Todo texto vindo da API entra por textContent e nunca por innerHTML. O nome
 * do lead e digitado por um visitante anonimo na loja do cliente, entao e
 * entrada de terceiro nao confiavel dentro do painel de quem paga.
 */
(function () {
  'use strict';

  /*
   * A marca do painel depende da porta de entrada.
   *
   * O modulo de atendimento e vendido com nome proprio, e quem assina so ele
   * entra pelo Atende Ai: em /atendeai/app enquanto o produto mora dentro do
   * dominio do painel, e em /app quando ele tiver endereco proprio. Esse
   * lojista nao comprou Captapp e nao deve ler Captapp no topo da tela. E o
   * mesmo painel; o que muda e o nome na porta.
   */
  var CAMINHO = window.location.pathname;
  var MARCA = (CAMINHO.indexOf('/app/') === 0 || CAMINHO.indexOf('/atendeai/') === 0)
    ? 'atende aí' : 'captapp';

  function vestirMarca() {
    var marcas = document.querySelectorAll('.marca-grande, .marca');
    for (var i = 0; i < marcas.length; i += 1) marcas[i].textContent = MARCA;
    document.title = MARCA === 'captapp' ? 'Captapp' : 'Atende Aí';

    // O icone da aba segue a marca junto. No dominio proprio o /favicon.svg
    // ja e o verde do Atende Ai; embaixo do /atendeai ele viria da pasta do
    // painel, que e o laranja do Captapp, e a aba contaria outra historia da
    // que a tela conta.
    if (CAMINHO.indexOf('/atendeai/') === 0) {
      var icone = document.querySelector('link[rel="icon"]');
      if (icone) icone.href = '/atendeai/favicon.svg';
    }
  }

  var eu = null;
  var cacheLeads = null;
  var abaLeads = 'a_contatar';
  var filtro = '';

  function api(caminho, opcoes) {
    var config = opcoes || {};
    config.credentials = 'same-origin';
    config.headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers || {});
    if (config.corpo) { config.body = JSON.stringify(config.corpo); delete config.corpo; }
    return fetch('/api' + caminho, config).then(function (r) {
      if (r.status === 401) { mostrarEntrada(); throw new Error('sem sessao'); }
      return r.json().then(function (dados) {
        if (!r.ok) throw Object.assign(new Error(dados.erro || 'falhou'), { dados: dados });
        return dados;
      });
    });
  }

  function el(tag, texto, classe) {
    var n = document.createElement(tag);
    if (texto != null) n.textContent = texto;
    if (classe) n.className = classe;
    return n;
  }

  var TRACOS = {
    leads: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    cupom: '<path d="M4 8V6h16v2a2 2 0 0 0 0 4v2H4v-2a2 2 0 0 0 0-4Z"/><path d="M12 6v12" stroke-dasharray="2 3"/>',
    alerta: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4"/><path d="M12 17.5v.5"/>',
    loja: '<path d="M4 9h16v11H4z"/><path d="M4 9 6 4h12l2 5"/>',
    dinheiro: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M14.5 9.5h-4a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3h-4"/>',
    pedido: '<path d="M6 2h12l2 6H4z"/><path d="M5 8v12h14V8"/>',
    plano: '<path d="M4 4h16v16H4z"/><path d="M8 9h8"/><path d="M8 13h5"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    // Faltava: os cartoes do Atende Ai ja pediam 'chat' e vinham com a bolha
    // vazia, um circulo sem desenho nenhum no meio do painel.
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8"/><path d="M8 12h5"/>',
  };

  function icone(nome) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = TRACOS[nome] || '';
    return svg;
  }

  /**
   * Cartao de numero no formato do painel da Loja Integrada: icone em circulo,
   * numero grande, legenda curta, e um rodape separado com a acao.
   */
  function cartaoNumero({ rotulo, valor, detalhe, nomeIcone, tom, rodape, aoClicarRodape }) {
    var cartao = el('div', null, 'cartao-num');
    cartao.appendChild(el('div', rotulo, 'rotulo'));
    var linha = el('div', null, 'linha-num');
    var bolha = el('span', null, 'bolha' + (tom ? ' ' + tom : ''));
    bolha.appendChild(icone(nomeIcone));
    linha.appendChild(bolha);
    var texto = el('div');
    texto.appendChild(el('div', valor, 'numero'));
    if (detalhe) texto.appendChild(el('div', detalhe, 'hora'));
    linha.appendChild(texto);
    cartao.appendChild(linha);
    if (rodape) {
      var pe = el('div', null, 'pe-cartao');
      pe.appendChild(el('span', rodape.texto, 'hora'));
      if (rodape.acao) {
        var link = el('a', rodape.acao, 'link-acao');
        link.href = '#';
        link.addEventListener('click', function (evento) {
          evento.preventDefault(); aoClicarRodape();
        });
        pe.appendChild(link);
      }
      cartao.appendChild(pe);
    }
    return cartao;
  }

  function dinheiro(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function quando(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  function horasDesde(iso) {
    return (Date.now() - new Date(iso).getTime()) / 3600000;
  }

  function tempoRelativo(iso) {
    var horas = horasDesde(iso);
    if (horas < 1) return 'agora ha pouco';
    if (horas < 24) return 'ha ' + Math.floor(horas) + 'h';
    var dias = Math.floor(horas / 24);
    return dias === 1 ? 'ontem' : 'ha ' + dias + ' dias';
  }

  /** wa.me exige so digitos, com o 55 na frente. */
  function linkWhatsapp(telefone, nome, loja) {
    var digitos = String(telefone || '').replace(/\D/g, '');
    if (!digitos) return null;
    if (digitos.length <= 11) digitos = '55' + digitos;
    var texto = 'Oi ' + String(nome).split(' ')[0] + ', aqui e da ' + loja
      + '. Vi que você pegou um cupom no nosso site e vim ver se posso ajudar.';
    return 'https://wa.me/' + digitos + '?text=' + encodeURIComponent(texto);
  }

  function tabela(colunas, linhas, aoClicar) {
    var caixa = el('div', null, 'rolagem');
    var t = el('table');
    var thead = el('thead');
    var tr = el('tr');
    colunas.forEach(function (c) { tr.appendChild(el('th', c)); });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = el('tbody');
    linhas.forEach(function (linha) {
      var l = el('tr', null, linha.classe || '');
      if (aoClicar) {
        l.classList.add('clicavel');
        l.addEventListener('click', function () { aoClicar(linha.item); });
      }
      linha.celulas.forEach(function (celula) {
        var td = el('td');
        if (celula instanceof Node) td.appendChild(celula);
        else td.textContent = celula == null ? '' : String(celula);
        l.appendChild(td);
      });
      tbody.appendChild(l);
    });
    t.appendChild(tbody);
    caixa.appendChild(t);
    return caixa;
  }

  function selo(texto, tipo) { return el('span', texto, 'selo ' + tipo); }

  /**
   * A url vem do navegador do visitante, entao so vira link se for http ou
   * https. Qualquer outra coisa aparece como texto, sem virar clique.
   */
  function linkExterno(url, texto) {
    if (!/^https?:\/\//i.test(url || '')) return el('span', texto || url || '');
    var a = el('a', texto || url, 'link-loja');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }

  function resumoNavegacao(lead) {
    var produtos = Number(lead.produtos_vistos) || 0;
    var paginas = Number(lead.paginas_vistas) || 0;
    if (!produtos && !paginas) return null;
    var partes = [];
    if (produtos) partes.push('viu ' + produtos + (produtos === 1 ? ' produto' : ' produtos'));
    if (paginas > produtos) partes.push((paginas - produtos) + (paginas - produtos === 1 ? ' página' : ' páginas'));
    if (lead.foi_ao_carrinho) partes.push('foi ao carrinho');
    return partes.join(', ');
  }
  function tela() { return document.getElementById('tela'); }

  function pintar(titulo, legenda) {
    var alvo = tela();
    alvo.textContent = '';
    alvo.appendChild(el('h2', titulo));
    if (legenda) alvo.appendChild(el('p', legenda, 'legenda'));
    return alvo;
  }

  // ---------------------------------------------------------------- entrada ---

  function mostrarEntrada() {
    // Quem sai depois de criar conta volta para o login, nao para o cadastro.
    modoEntrada(false);
    mostrarFormularioDeEntrada('form-entrada');
  }

  var criando = false;
  function modoEntrada(criar) {
    criando = criar;
    document.getElementById('campo-nome').hidden = !criando;
    document.querySelector('#campo-nome input').required = criando;
    // O aceite so existe no cadastro: quem ja tem conta aceitou quando criou.
    /*
     * No cadastro a senha e "new-password", e nao "current-password".
     *
     * Sem isso o gerenciador de senhas trata a tela como login, oferece a
     * senha gerada e acaba preenchendo o campo de texto que estiver por
     * perto: ja aconteceu de uma conta nascer chamada com a propria senha.
     * O nome e o WhatsApp tambem vem antes do par e-mail e senha, pelo mesmo
     * motivo: campo de texto depois da senha e campo que o gerenciador
     * confunde.
     */
    document.getElementById('campo-senha').autocomplete = criando ? 'new-password' : 'current-password';
    document.getElementById('campo-whatsapp').hidden = !criando;
    document.querySelector('#campo-whatsapp input').required = criando;
    document.getElementById('campo-aceite').hidden = !criando;
    document.querySelector('#campo-aceite input').required = criando;
    document.getElementById('botao-entrada').textContent = criando ? 'Criar conta' : 'Entrar';
    document.getElementById('alternar').textContent = criando ? 'Já tenho conta' : 'Não tenho conta ainda';
  }
  document.getElementById('alternar').addEventListener('click', function (evento) {
    evento.preventDefault();
    modoEntrada(!criando);
  });

  /*
   * A landing manda para /app#/criar.
   *
   * Sem isso o botao "Criar conta" do site caia numa tela de login, e o
   * visitante tinha que achar o link pequeno embaixo para conseguir se
   * cadastrar. O endereco sai da barra assim que lido, para um F5 depois de
   * criar a conta nao devolver o formulario de cadastro.
   */
  function abrirCadastroSePedido() {
    if (location.hash !== '#/criar') return false;
    history.replaceState(null, '', location.pathname);
    modoEntrada(true);
    mostrarFormularioDeEntrada('form-entrada');
    return true;
  }

  document.getElementById('form-entrada').addEventListener('submit', function (evento) {
    evento.preventDefault();
    var dados = new FormData(this);
    var erro = document.getElementById('erro-entrada');
    erro.hidden = true;
    var corpo = { email: dados.get('email'), senha: dados.get('senha') };
    if (criando) {
      corpo.nome = dados.get('nome');
      corpo.whatsapp = dados.get('whatsapp');
      corpo.aceite = dados.get('aceite') === 'on';
    }
    api(criando ? '/cadastro' : '/login', { method: 'POST', corpo: corpo })
      .then(function () { iniciar(); })
      .catch(function (e) {
        erro.textContent = e.message === 'sem sessao' ? 'E-mail ou senha inválidos' : e.message;
        erro.hidden = false;
      });
  });

  document.getElementById('sair').addEventListener('click', function () {
    api('/sair', { method: 'POST' }).then(mostrarEntrada).catch(mostrarEntrada);
  });

  // ------------------------------------------------- esqueci e senha nova ---

  function mostrarFormularioDeEntrada(id) {
    ['form-entrada', 'form-esqueci', 'form-nova-senha'].forEach(function (nome) {
      document.getElementById(nome).hidden = nome !== id;
    });
    document.getElementById('app').hidden = true;
    document.getElementById('entrada').hidden = false;
  }

  document.getElementById('esqueci').addEventListener('click', function (evento) {
    evento.preventDefault();
    mostrarFormularioDeEntrada('form-esqueci');
  });
  document.getElementById('voltar-entrada').addEventListener('click', function (evento) {
    evento.preventDefault();
    mostrarFormularioDeEntrada('form-entrada');
  });

  document.getElementById('form-esqueci').addEventListener('submit', function (evento) {
    evento.preventDefault();
    var erro = document.getElementById('erro-esqueci');
    var ok = document.getElementById('ok-esqueci');
    erro.hidden = true; ok.hidden = true;
    var botao = this.querySelector('button[type=submit]');
    botao.disabled = true;
    api('/senha/esqueci', { method: 'POST', corpo: { email: new FormData(this).get('email') } })
      .then(function (r) { ok.textContent = r.mensagem; ok.hidden = false; })
      .catch(function (e) { erro.textContent = e.message; erro.hidden = false; })
      .then(function () { botao.disabled = false; });
  });

  /** O token vem do link do e-mail, em #/nova-senha?token=... Sai do endereco assim que lido. */
  function tokenDeNovaSenha() {
    var partes = location.hash.split('?');
    if (partes[0] !== '#/nova-senha') return null;
    var token = partes[1] ? new URLSearchParams(partes[1]).get('token') : null;
    history.replaceState(null, '', location.pathname);
    return token;
  }

  document.getElementById('form-nova-senha').addEventListener('submit', function (evento) {
    evento.preventDefault();
    var erro = document.getElementById('erro-nova-senha');
    erro.hidden = true;
    var dados = new FormData(this);
    if (dados.get('senha') !== dados.get('confirma')) {
      erro.textContent = 'As duas senhas não batem.'; erro.hidden = false; return;
    }
    var form = this;
    api('/senha/nova', { method: 'POST', corpo: { token: form.dataset.token, senha: dados.get('senha') } })
      .then(function () {
        mostrarFormularioDeEntrada('form-entrada');
        var aviso = document.getElementById('erro-entrada');
        aviso.textContent = 'Senha trocada. Entre com a senha nova.';
        aviso.className = 'ok'; aviso.hidden = false;
      })
      .catch(function (e) { erro.textContent = e.message; erro.hidden = false; });
  });

  document.getElementById('sino').addEventListener('click', function () {
    location.hash = '#/resumo';
  });

  document.getElementById('busca').addEventListener('input', function () {
    filtro = this.value.trim().toLowerCase();
    if (location.hash !== '#/leads') { location.hash = '#/leads'; return; }
    desenharLeads();
  });

  // ------------------------------------------------------------------ hoje ---

  /*
   * Os cartoes do Atende Ai, na frente de tudo.
   *
   * O que o lojista precisa saber ao abrir o painel e se o atendimento esta
   * de pe e quanto do plano ele ja gastou. Descobrir que a franquia acabou
   * pela fatura do mes seguinte e a pior hora de descobrir, entao o aviso sai
   * aos 80% e ja leva para onde se resolve.
   */
  function cartoesDoAtendeAi(dados, conversas) {
    var c = dados.consumo || {};
    var pausado = dados.pausa && dados.pausa.pausado;
    var cartoes = [];

    // As conversas vem antes do consumo: quem precisa do lojista hoje e mais
    // urgente que quanto sobrou do plano.
    if (conversas) {
      cartoes.push(cartaoNumero({
        rotulo: 'Atendimentos hoje', valor: String(conversas.hoje || 0), nomeIcone: 'chat',
        tom: conversas.comigo ? 'ruim' : 'acento',
        detalhe: conversas.comigo
          ? conversas.comigo + ' esperando você'
          : (conversas.total || 0) + ' conversas no total',
        rodape: { texto: 'Ver os atendimentos', acao: 'Abrir' },
        aoClicarRodape: function () { location.hash = '#/atendimentos'; },
      }));
    }

    /*
     * "No ar" so quando esta mesmo no ar.
     *
     * Antes este cartao olhava so a pausa, entao dizia "o agente responde com
     * a sua base" para uma conta sem numero confirmado e sem base: o lojista
     * mandava a mensagem de teste, nao recebia nada, e a tela continuava
     * jurando que estava funcionando. Falta o numero ou falta a base, isto
     * tem que dizer qual.
     */
    var p = dados.prontidao || {};
    var falta = !p.numero ? 'numero' : !p.base ? 'base' : null;
    cartoes.push(cartaoNumero({
      rotulo: 'Atendimento',
      valor: pausado ? 'Parado' : falta ? 'Ainda não' : 'No ar',
      nomeIcone: 'chat',
      tom: pausado ? 'ruim' : falta ? '' : 'bom',
      detalhe: pausado
        ? 'o agente não está respondendo'
        : falta === 'numero'
          ? (p.solicitado
            ? 'o número está em verificação, ainda não recebe mensagem'
            : 'nenhum número de WhatsApp conectado')
          : falta === 'base'
            ? 'falta contar como a sua loja funciona'
            : 'o agente responde com a sua base',
      rodape: {
        texto: pausado ? 'Voltar a atender' : falta ? 'Terminar a ativação' : 'Abrir o assistente',
        acao: 'Ir',
      },
      aoClicarRodape: function () { location.hash = falta ? '#/comecar' : '#/assistente'; },
    }));

    if (!c.atualizadoEm) {
      cartoes.push(cartaoNumero({
        rotulo: 'Conversas no mês', valor: '—', nomeIcone: 'leads',
        detalhe: 'ainda não recebi contagem do atendimento',
        rodape: { texto: 'A contagem vem do agente' },
      }));
      return cartoes;
    }

    var estourou = c.excedente && c.excedente.mensagens > 0;
    cartoes.push(cartaoNumero({
      rotulo: 'Mensagens no mês',
      valor: c.enviadas.toLocaleString('pt-BR') + ' de ' + c.incluidas.toLocaleString('pt-BR'),
      nomeIcone: 'leads', tom: estourou ? 'ruim' : c.avisar ? '' : 'bom',
      detalhe: estourou
        ? c.excedente.mensagens.toLocaleString('pt-BR') + ' acima, ' + dinheiro(c.excedente.valor) + ' no mês'
        : 'faltam ' + c.sobrando.toLocaleString('pt-BR') + ' no plano ' + c.nome,
      rodape: { texto: c.avisar ? 'Aumentar o plano' : 'Plano ' + c.nome, acao: c.avisar ? 'Ver' : null },
      aoClicarRodape: c.avisar ? function () { location.hash = '#/financeiro'; } : null,
    }));
    return cartoes;
  }

  function verHoje() {
    var alvo = pintar('Resumo', 'O que entrou, o que saiu e o que precisa de você.');
    var comAtendeAi = eu && eu.modulos && eu.modulos.atendimento;
    var temCapta = !eu || !eu.modulos || eu.modulos.capta !== false;
    Promise.all([
      api('/hoje'), api('/alertas'), api('/leads?situacao=a_contatar&limite=1'),
      comAtendeAi ? api('/atendimento').catch(function () { return null; }) : null,
      comAtendeAi ? api('/atendimentos').catch(function () { return null; }) : null,
    ])
      .then(function (r) {
        var lojas = r[0].lojas || [];
        var alertas = r[1] || [];
        var contagem = r[2].contagem;
        var atende = r[3];
        var conversas = r[4] ? r[4].contagem : null;
        var soma = function (c) { return lojas.reduce(function (t, l) { return t + Number(l[c] || 0); }, 0); };

        // O aviso de franquia perto do fim vem antes dos numeros: ele e o
        // unico que pede uma decisao hoje.
        if (atende && atende.consumo && atende.consumo.avisar) {
          var c = atende.consumo;
          var faixa = el('div', null, 'faixa-aviso' + (c.excedente.mensagens ? ' ruim' : ''));
          faixa.appendChild(el('span', c.excedente.mensagens
            ? 'Você passou do plano ' + c.nome + ': ' + c.excedente.mensagens.toLocaleString('pt-BR')
              + ' mensagens a mais, ' + dinheiro(c.excedente.valor) + ' neste mês.'
            : 'O plano ' + c.nome + ' está acabando: faltam '
              + c.sobrando.toLocaleString('pt-BR') + ' mensagens este mês.'));
          var ir = el('button', 'Aumentar o plano', 'secundario');
          ir.type = 'button';
          ir.addEventListener('click', function () { location.hash = '#/financeiro'; });
          faixa.appendChild(ir);
          alvo.appendChild(faixa);
        }

        // Ativacao por terminar vem antes de qualquer numero de desempenho:
        // sem numero e sem base, todo cartao abaixo e zero. A tela propria e
        // que conduz; aqui so fica o caminho para ela, para nao existirem
        // dois lugares de conectar o mesmo WhatsApp.
        if (eu.atendeAi && !eu.atendeAi.ativado) {
          var pendente = el('div', null, 'faixa-aviso');
          pendente.appendChild(el('span', eu.atendeAi.numero || eu.atendeAi.solicitado
            ? 'Falta contar para o assistente como a sua loja funciona.'
            : 'O seu WhatsApp ainda não está conectado.'));
          var irComecar = el('button', 'Terminar a ativação', 'secundario');
          irComecar.type = 'button';
          irComecar.addEventListener('click', function () { location.hash = '#/comecar'; });
          pendente.appendChild(irComecar);
          alvo.appendChild(pendente);
        }

        var grade = el('div', null, 'grade-num');
        if (atende) {
          cartoesDoAtendeAi(atende, conversas).forEach(function (c) { grade.appendChild(c); });
        }
        /*
         * Os cartoes de cupom e de loja so aparecem para quem tem loja
         * conectada. Numa conta que assina so o Atende Ai eles seriam quatro
         * zeros contando a historia de um produto que ela nao comprou.
         */
        if (temCapta) {
          grade.appendChild(cartaoNumero({
            rotulo: 'Leads hoje', valor: String(soma('leads')), nomeIcone: 'leads', tom: 'acento',
            detalhe: contagem.novos + ' nas últimas 24h',
            rodape: { texto: contagem.a_contatar + ' esperando contato', acao: 'Ver a fila' },
            aoClicarRodape: function () { abaLeads = 'a_contatar'; location.hash = '#/leads'; },
          }));
          grade.appendChild(cartaoNumero({
            rotulo: 'Cupons entregues', valor: String(soma('cupons_ok')), nomeIcone: 'cupom', tom: 'bom',
            detalhe: 'de ' + (soma('cupons_ok') + soma('cupons_falhos')) + ' tentativas hoje',
            rodape: { texto: 'Um cupom único por pessoa' },
          }));
          grade.appendChild(cartaoNumero({
            rotulo: 'Cupons que falharam', valor: String(soma('cupons_falhos')),
            nomeIcone: 'alerta', tom: soma('cupons_falhos') ? 'ruim' : '',
            detalhe: soma('cupons_falhos') ? 'lead sem a recompensa prometida' : 'nenhum problema hoje',
            rodape: { texto: 'Nova tentativa a cada 15 min' },
          }));
          grade.appendChild(cartaoNumero({
            rotulo: 'Lojas conectadas', valor: String(lojas.length), nomeIcone: 'loja',
            detalhe: 'com o widget publicado',
            rodape: { texto: 'Modos de instalação', acao: 'Ver integrações' },
            aoClicarRodape: function () { location.hash = '#/integracoes'; },
          }));
        }
        alvo.appendChild(grade);
        if (!temCapta) return;

        if (alertas.length) {
          var caixa = el('div', null, 'cartao');
          caixa.appendChild(el('div', 'Alertas em aberto', 'rotulo'));
          var lista = el('ul', null, 'respostas');
          alertas.slice(0, 8).forEach(function (a) {
            var item = el('li');
            item.appendChild(el('b', quando(a.criado_em)));
            item.appendChild(document.createTextNode(a.mensagem));
            lista.appendChild(item);
          });
          caixa.appendChild(lista);
          alvo.appendChild(caixa);
        }

        var painelLojas = el('div', null, 'cartao');
        painelLojas.appendChild(el('div', 'Por loja, hoje', 'rotulo'));
        if (lojas.length) {
          painelLojas.appendChild(tabela(
            ['Loja', 'Plataforma', 'Leads', 'Cupons ok', 'Falhos'],
            lojas.map(function (l) {
              return { celulas: [l.nome_loja, l.plataforma, l.leads, l.cupons_ok, l.cupons_falhos] };
            }),
          ));
        } else {
          painelLojas.appendChild(el('p', 'Nenhuma loja conectada ainda.', 'vazio'));
        }
        alvo.appendChild(painelLojas);
      });
  }

  // ----------------------------------------------------------------- leads ---

  function verLeads() {
    pintar('Leads', 'Lead capturado não é lead trabalhado. Comece pela fila de quem ainda espera.');
    api('/leads?limite=200').then(function (dados) {
      // count() do Postgres chega como texto, e "5" - 1 vira "5-1" na aba.
      Object.keys(dados.contagem).forEach(function (chave) {
        dados.contagem[chave] = Number(dados.contagem[chave]);
      });
      cacheLeads = dados;
      desenharLeads();
    });
  }

  function desenharLeads() {
    if (!cacheLeads || location.hash !== '#/leads') return;
    var alvo = tela();
    var antigo = alvo.querySelector('.area-leads');
    if (antigo) antigo.remove();
    var area = el('div', null, 'area-leads');

    var abas = el('div', null, 'abas');
    [
      ['a_contatar', 'A contatar', cacheLeads.contagem.a_contatar],
      ['contatados', 'Já contatados', cacheLeads.contagem.contatados],
    ].forEach(function (par) {
      var aba = el('button', null, 'aba' + (abaLeads === par[0] ? ' ativa' : ''));
      aba.type = 'button';
      aba.appendChild(document.createTextNode(par[1]));
      aba.appendChild(el('span', String(par[2]), 'conta-aba'));
      aba.addEventListener('click', function () { abaLeads = par[0]; desenharLeads(); });
      abas.appendChild(aba);
    });
    var exportar = el('a', 'Exportar planilha', 'link-acao exportar');
    exportar.href = '/api/leads.csv' + (abaLeads === 'contatados' ? '?situacao=contatados' : '?situacao=a_contatar');
    exportar.setAttribute('download', '');
    abas.appendChild(exportar);
    area.appendChild(abas);

    var lista = cacheLeads.leads.filter(function (l) {
      var casa = abaLeads === 'a_contatar' ? !l.contatado_em : Boolean(l.contatado_em);
      if (!casa) return false;
      if (!filtro) return true;
      return [l.nome, l.email, l.telefone, l.cupom].some(function (campo) {
        return String(campo || '').toLowerCase().indexOf(filtro) >= 0;
      });
    });

    if (!lista.length) {
      area.appendChild(el('p', filtro
        ? 'Nenhum lead bate com "' + filtro + '".'
        : abaLeads === 'a_contatar'
          ? 'Fila zerada. Todo mundo que chegou já foi contatado.'
          : 'Ninguem foi marcado como contatado ainda.', 'vazio'));
      alvo.appendChild(area);
      return;
    }

    lista.forEach(function (lead) { area.appendChild(cartaoLead(lead)); });
    alvo.appendChild(area);
  }

  function cartaoLead(lead) {
    var novo = !lead.contatado_em && horasDesde(lead.criado_em) < 24;
    var cartao = el('article', null, 'lead' + (novo ? ' novo' : '') + (lead.contatado_em ? ' feito' : ''));

    var topo = el('div', null, 'lead-topo');
    var nome = el('button', lead.nome, 'lead-nome');
    nome.type = 'button';
    nome.addEventListener('click', function () { location.hash = '#/lead/' + lead.id; });
    topo.appendChild(nome);
    if (novo) topo.appendChild(el('span', 'novo', 'selo novo'));
    topo.appendChild(el('span', tempoRelativo(lead.criado_em), 'hora'));
    topo.appendChild(el('span', lead.nome_loja, 'hora'));
    if (Number(lead.faturado) > 0) topo.appendChild(selo('comprou ' + dinheiro(lead.faturado), 'criado'));
    cartao.appendChild(topo);

    var meio = el('div', null, 'lead-meio');
    (lead.respostas || []).forEach(function (r) {
      var pedaco = el('span', null, 'resposta-chip');
      pedaco.appendChild(el('b', r.pergunta));
      pedaco.appendChild(document.createTextNode(r.resposta));
      meio.appendChild(pedaco);
    });
    cartao.appendChild(meio);

    var navegou = resumoNavegacao(lead);
    if (navegou) {
      var trilha = el('button', null, 'lead-navegacao');
      trilha.type = 'button';
      trilha.appendChild(el('b', 'Navegação'));
      trilha.appendChild(document.createTextNode(navegou + '. Ver o que acessou'));
      trilha.addEventListener('click', function () { location.hash = '#/lead/' + lead.id; });
      cartao.appendChild(trilha);
    }

    var pe = el('div', null, 'lead-pe');
    var contato = el('span', null, 'hora');
    contato.textContent = [lead.telefone, lead.email].filter(Boolean).join('  |  ');
    pe.appendChild(contato);
    if (lead.cupom) {
      pe.appendChild(selo(lead.cupom, lead.cupom_status === 'criado' ? 'criado' : 'falhou'));
    }

    var acoes = el('div', null, 'lead-acoes');
    var zap = linkWhatsapp(lead.telefone, lead.nome, lead.nome_loja);
    if (zap) {
      var botaoZap = el('a', 'Chamar no WhatsApp', 'botao-link');
      botaoZap.href = zap;
      botaoZap.target = '_blank';
      botaoZap.rel = 'noopener';
      acoes.appendChild(botaoZap);
    }

    var alternar = el('button', lead.contatado_em ? 'Devolver para a fila' : 'Marcar como contatado',
      lead.contatado_em ? 'secundario' : '');
    alternar.type = 'button';
    alternar.addEventListener('click', function () {
      alternar.disabled = true;
      api('/leads/' + lead.id + '/contato', {
        method: 'POST', corpo: { contatado: !lead.contatado_em },
      }).then(function (atualizado) {
        lead.contatado_em = atualizado.contatado_em;
        cacheLeads.contagem.a_contatar += atualizado.contatado_em ? -1 : 1;
        cacheLeads.contagem.contatados += atualizado.contatado_em ? 1 : -1;
        desenharLeads();
      }).catch(function (e) {
        alternar.disabled = false;
        alternar.textContent = e.dados && e.dados.motivo ? 'Painel em leitura' : 'Não deu, tente de novo';
      });
    });
    acoes.appendChild(alternar);
    pe.appendChild(acoes);
    cartao.appendChild(pe);

    if (lead.contatado_em) {
      cartao.appendChild(el('div', 'Contatado em ' + quando(lead.contatado_em), 'marca-feito'));
    }
    return cartao;
  }

  var NOME_EVENTO = {
    pagina: 'pagina', produto: 'produto', carrinho: 'carrinho',
    identificado: 'contato', saida: 'saiu',
  };

  /** Lista de enderecos acessados, com quantas vezes e quando foi a ultima. */
  function listaDeAcessos(itens, vazio) {
    if (!itens.length) return el('p', vazio, 'legenda');
    var lista = el('ul', null, 'acessos');
    itens.forEach(function (item) {
      var li = el('li');
      li.appendChild(linkExterno(item.url, item.titulo || item.url));
      li.appendChild(el('div', (item.vezes > 1 ? item.vezes + ' vezes, última ' : '') + tempoRelativo(item.ultimaVez), 'hora'));
      lista.appendChild(li);
    });
    return lista;
  }

  function verLead(id) {
    var alvo = pintar('Perfil do lead');
    api('/leads/' + id).then(function (perfil) {
      var lead = perfil.lead;
      alvo.querySelector('h2').textContent = lead.nome;
      alvo.appendChild(el('p', [lead.nome_loja, lead.telefone, lead.email].filter(Boolean).join('  |  '), 'legenda'));

      var respostas = el('div', null, 'cartao');
      respostas.appendChild(el('div', 'O que respondeu no chat', 'rotulo'));
      var lista = el('ul', null, 'respostas');
      (lead.respostas || []).forEach(function (r) {
        var item = el('li');
        item.appendChild(el('b', r.pergunta));
        item.appendChild(document.createTextNode(r.resposta));
        lista.appendChild(item);
      });
      respostas.appendChild(lista);
      if (perfil.cupom) {
        respostas.appendChild(el('div', 'Cupom', 'rotulo'));
        if (perfil.cupom.status === 'criado') {
          respostas.appendChild(el('div', perfil.cupom.codigo, 'cupom-grande'));
        } else {
          respostas.appendChild(el('p', 'Falhou: ' + (perfil.cupom.erro || 'motivo não registrado')));
        }
      }
      respostas.appendChild(el('div', 'Consentimento em ' + quando(lead.consentido_em), 'hora'));
      alvo.appendChild(respostas);

      var navegacao = el('div', null, 'cartao');
      var produtos = perfil.produtos || [];
      var paginas = perfil.paginas || [];
      if (produtos.length || paginas.length) {
        // Primeiro o que interessa a quem vai ligar: os produtos, do mais
        // recente para o mais antigo, cada um com o link da loja.
        navegacao.appendChild(el('div', 'Produtos que acessou (' + produtos.length + ')', 'rotulo'));
        navegacao.appendChild(listaDeAcessos(produtos, 'Nenhum produto aberto, só páginas.'));
        navegacao.appendChild(el('div', 'Páginas que acessou (' + paginas.length + ')', 'rotulo'));
        navegacao.appendChild(listaDeAcessos(paginas, 'Nenhuma página alem dos produtos.'));
      }
      // A saida de pagina e ruido para quem le. O momento do contato entra
      // como passo proprio, vindo do lead, para a historia ter comeco e fim.
      var passos = perfil.linhaDoTempo.filter(function (evento) { return evento.tipo !== 'saida'; });
      passos.push({ tipo: 'identificado', criado_em: lead.criado_em });
      passos.sort(function (a, b) { return new Date(a.criado_em) - new Date(b.criado_em); });
      navegacao.appendChild(el('div', 'Linha do tempo de navegação', 'rotulo'));
      if (passos.length) {
        var tempo = el('ul', null, 'linha-tempo');
        passos.forEach(function (evento) {
          var item = el('li');
          if (evento.tipo === 'identificado') {
            item.appendChild(el('div', 'Deixou o contato no chat'));
          } else {
            item.appendChild(linkExterno(evento.url, evento.titulo || evento.url || evento.tipo));
          }
          item.appendChild(el('div', quando(evento.criado_em) + '  |  ' + (NOME_EVENTO[evento.tipo] || evento.tipo), 'hora'));
          tempo.appendChild(item);
        });
        navegacao.appendChild(tempo);
      } else {
        navegacao.appendChild(el('p',
          'Sem navegação registrada. O rastreamento está nos dois planos e só começa depois que a pessoa aceita a conversa no chat.',
          'vazio'));
      }
      alvo.appendChild(navegacao);

      if (perfil.pedidos.length) {
        var compras = el('div', null, 'cartao');
        compras.appendChild(el('div', 'Comprou ' + dinheiro(perfil.faturado), 'rotulo'));
        compras.appendChild(tabela(['Pedido', 'Valor', 'Cupom', 'Quando'],
          perfil.pedidos.map(function (p) {
            return { celulas: [p.id_externo, dinheiro(p.valor), p.cupom_codigo, quando(p.feito_em)] };
          })));
        alvo.appendChild(compras);
      }

      var acoes = el('div', null, 'acoes');
      var zap = linkWhatsapp(lead.telefone, lead.nome, lead.nome_loja);
      if (zap) {
        var botaoZap = el('a', 'Chamar no WhatsApp', 'botao-link');
        botaoZap.href = zap; botaoZap.target = '_blank'; botaoZap.rel = 'noopener';
        acoes.appendChild(botaoZap);
      }
      var voltar = el('button', 'Voltar para a fila', 'secundario');
      voltar.addEventListener('click', function () { location.hash = '#/leads'; });
      var apagar = el('button', 'Apagar por pedido do titular (LGPD)', 'secundario');
      apagar.addEventListener('click', function () {
        if (!confirm('Apagar este lead e toda a navegação dele? Não tem volta.')) return;
        api('/leads/' + id, { method: 'DELETE' }).then(function () {
          cacheLeads = null;
          location.hash = '#/leads';
        });
      });
      acoes.appendChild(voltar);
      acoes.appendChild(apagar);
      alvo.appendChild(acoes);
    }).catch(function () {
      alvo.appendChild(el('p', 'Lead não encontrado nesta conta.', 'vazio'));
    });
  }

  // ------------------------------------------------------------------ chat ---

  /**
   * Construtor do fluxo. Cartoes ligados em linha, um por etapa, no formato
   * de ferramenta de automacao que o lojista ja conhece. E linear de
   * proposito: tres perguntas configuraveis, a de contato fixa no fim, e o
   * cupom. Ramificacao e mais pergunta derrubam a taxa de resposta, e o
   * lojista cancela culpando a ferramenta.
   */
  var construtor = null;
  var modelos = null;

  // Teto de perguntas do lojista. A de contato nao entra na conta: ela vem
  // sempre junto e nao se remove.
  var TETO_PERGUNTAS = 6;

  var FLUXO_VAZIO = {
    convite: 'Ganhe cupom',
    consentimento: '',
    desconto: 10,
    recompensa: 'cupom',
    // Popup no meio da tela por padrao. A janela do canto nao interrompe
    // nada, e por isso tambem nao e respondida: quem esta olhando produto nao
    // para para clicar nela. Lojista que prefira o canto troca no seletor.
    modo: 'chat',
    abrirApos: 0,
    cor: '',
    botaoFormato: 'retangular',
    botaoPosicao: 'direita-inferior',
    perguntas: [],
  };

  // Lado e altura viram as mesmas classes do widget, para a previa mostrar o
  // lugar de verdade e nao uma aproximacao.
  var CLASSES_POSICAO = {
    direita: 'lr', esquerda: 'll', inferior: 'vb', central: 'vc', superior: 'vt',
  };
  function classesDePosicao(posicao) {
    var partes = String(posicao || '').split('-');
    return ' ' + (CLASSES_POSICAO[partes[0]] || 'lr') + ' ' + (CLASSES_POSICAO[partes[1]] || 'vb');
  }

  var RECOMPENSAS = [
    ['Loja virtual', [
      ['cupom', 'Cupom de desconto'],
      ['frete_gratis', 'Frete grátis na primeira compra'],
    ]],
    ['Outro tipo de operação', [
      ['diagnostico', 'Diagnóstico gratuito'],
      ['especialista', 'Fale com um especialista'],
      ['consultoria', 'Ganhe uma consultoria'],
    ]],
  ];
  var NOME_RECOMPENSA = {};
  RECOMPENSAS.forEach(function (g) { g[1].forEach(function (r) { NOME_RECOMPENSA[r[0]] = r[1]; }); });

  function verChat() {
    var alvo = pintar('Chat', 'Monte as perguntas que o visitante responde antes de ganhar o cupom.');
    Promise.all([api('/conexoes'), modelos ? Promise.resolve(modelos) : api('/modelos')])
      .then(function (r) {
        var conexoes = r[0];
        modelos = r[1];
        if (!conexoes.length) {
          alvo.appendChild(el('p', 'Conecte uma loja em Integrações antes de montar o chat.', 'vazio'));
          return;
        }
        var atual = construtor && conexoes.some(function (c) { return c.id === construtor.conexaoId; })
          ? construtor.conexaoId : conexoes[0].id;
        carregarConstrutor(alvo, conexoes, atual);
      });
  }

  function carregarConstrutor(alvo, conexoes, conexaoId) {
    var conexao = conexoes.filter(function (c) { return c.id === conexaoId; })[0];
    api('/conexoes/' + conexaoId + '/fluxo').then(function (fluxo) {
      var vazio = !fluxo;
      construtor = {
        conexaoId: conexaoId,
        nomeLoja: conexao.nome_loja,
        fluxo: fluxo ? {
          convite: fluxo.convite, consentimento: fluxo.consentimento,
          desconto: fluxo.desconto, recompensa: fluxo.recompensa || 'cupom',
          modo: fluxo.modo || 'chat', abrirApos: fluxo.abrir_apos || 0, cor: fluxo.cor || '',
          botaoFormato: fluxo.botao_formato || 'retangular',
          botaoPosicao: fluxo.botao_posicao || 'direita-inferior',
          perguntas: (fluxo.perguntas || []).map(function (p) {
            return { texto: p.texto, opcoes: (p.opcoes || []).slice() };
          }),
        } : JSON.parse(JSON.stringify(FLUXO_VAZIO)),
        selecionado: 'convite',
        sujo: false,
      };
      if (vazio) {
        construtor.fluxo.consentimento = 'Ao continuar, você concorda que a ' + conexao.nome_loja
          + ' use seus dados para entrar em contato sobre esta compra.';
      }
      desenharConstrutor(alvo, conexoes);
      if (vazio) abrirModelos();
    });
  }

  function desenharConstrutor(alvo, conexoes) {
    var antigo = alvo.querySelector('.construtor');
    if (antigo) antigo.remove();
    var caixa = el('div', null, 'construtor');

    var topo = el('div', null, 'construtor-topo');
    if (conexoes.length > 1) {
      var escolha = el('select');
      conexoes.forEach(function (c) {
        var op = el('option', c.nome_loja);
        op.value = c.id;
        if (c.id === construtor.conexaoId) op.selected = true;
        escolha.appendChild(op);
      });
      escolha.addEventListener('change', function () {
        if (construtor.sujo && !confirm('Ha mudanças não publicadas. Trocar de loja e perder?')) {
          escolha.value = construtor.conexaoId; return;
        }
        carregarConstrutor(alvo, conexoes, escolha.value);
      });
      topo.appendChild(escolha);
    } else {
      topo.appendChild(el('strong', construtor.nomeLoja));
    }
    var usarModelo = el('button', 'Usar um modelo', 'secundario');
    usarModelo.type = 'button';
    usarModelo.addEventListener('click', abrirModelos);
    topo.appendChild(usarModelo);

    var estado = el('span', '', 'hora estado-publicacao');
    var publicar = el('button', 'Publicar no widget');
    publicar.type = 'button';
    publicar.addEventListener('click', function () {
      var f = construtor.fluxo;
      if (!f.consentimento.trim()) { estado.textContent = 'A linha de consentimento é obrigatória.'; return; }
      var semTexto = f.perguntas.some(function (p) { return !p.texto.trim(); });
      if (semTexto) { estado.textContent = 'Tem pergunta sem texto.'; return; }
      publicar.disabled = true;
      estado.textContent = 'Publicando...';
      api('/conexoes/' + construtor.conexaoId + '/fluxo', { method: 'PUT', corpo: Object.assign({}, f, { cor: f.cor || null }) })
        .then(function () {
          construtor.sujo = false;
          publicar.disabled = false;
          estado.textContent = 'Publicado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. O widget já mostra assim.';
        })
        .catch(function (e) {
          publicar.disabled = false;
          estado.textContent = e.dados && e.dados.explicacao ? e.dados.explicacao : e.message;
        });
    });
    topo.appendChild(estado);
    topo.appendChild(publicar);
    caixa.appendChild(topo);

    if (eu && eu.redator) caixa.appendChild(cartaoAssistente());

    var corpo = el('div', null, 'construtor-corpo');
    corpo.appendChild(el('div', null, 'quadro'));
    corpo.appendChild(el('aside', null, 'previa'));
    caixa.appendChild(corpo);
    alvo.appendChild(caixa);

    desenharQuadro();
    desenharPrevia();
  }

  /**
   * O assistente que monta o quadro a partir da descricao da loja.
   *
   * A tela em branco e onde o lojista desiste: ele sabe o que vende, mas
   * escrever tres perguntas de qualificacao com opcoes fechadas e trabalho de
   * redator. Aqui ele conta o que vende, por escrito ou falando, e corrige o
   * que voltou. Nada vai para a loja sem ele publicar.
   */
  function cartaoAssistente() {
    var cartao = el('div', null, 'assistente');
    cartao.appendChild(el('div', 'Monte com o assistente', 'rotulo'));
    cartao.appendChild(el('p', 'Conte o que a loja vende, para quem, e a faixa de preço. Ele escreve as três perguntas e você corrige o que quiser antes de publicar.', 'legenda'));

    var campo = el('textarea');
    campo.rows = 3;
    campo.maxLength = 1500;
    campo.placeholder = 'Ex: vendo aliança de ouro e anel de noivado, ticket de dois a cinco mil, o cliente chega indeciso e quer ver no dedo antes.';
    campo.addEventListener('click', function (e) { e.stopPropagation(); });
    cartao.appendChild(campo);

    var acoes = el('div', null, 'assistente-acoes');
    var estado = el('span', '', 'hora');

    var montar = el('button', 'Montar o chat');
    montar.type = 'button';
    montar.addEventListener('click', function () {
      var descricao = campo.value.trim();
      if (descricao.length < 12) { estado.textContent = 'Escreva uma frase a mais sobre a loja.'; return; }
      montar.disabled = true;
      estado.textContent = 'Montando...';
      api('/conexoes/' + construtor.conexaoId + '/fluxo/sugerir', { method: 'POST', corpo: { descricao: descricao } })
        .then(function (sugestao) {
          var f = construtor.fluxo;
          // So o conteudo. Cor, formato do botao e posicao sao escolha dele e
          // nao tem nada a ver com o que a loja vende.
          f.convite = sugestao.convite;
          f.consentimento = sugestao.consentimento;
          f.desconto = sugestao.desconto;
          f.recompensa = sugestao.recompensa;
          f.perguntas = sugestao.perguntas;
          construtor.selecionado = 0;
          montar.disabled = false;
          estado.textContent = 'Pronto. Confira as perguntas e publique.';
          marcarSujo(); desenharQuadro(); desenharPrevia();
        })
        .catch(function (e) {
          montar.disabled = false;
          estado.textContent = e.dados && e.dados.explicacao ? e.dados.explicacao : e.message;
        });
    });

    /*
     * O microfone e o do proprio navegador.
     *
     * Gravar o audio e mandar para um servico de transcricao custaria dinheiro
     * e carregaria voz de gente no nosso servidor, que e dado pessoal que nao
     * precisamos ter. O reconhecimento nativo roda na maquina dele e so o
     * texto chega aqui. Onde nao existe, o botao nao aparece e o campo de
     * texto continua.
     */
    var Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Reconhecimento) {
      var ouvindo = null;
      var falar = el('button', 'Falar', 'secundario');
      falar.type = 'button';
      falar.addEventListener('click', function () {
        if (ouvindo) { ouvindo.stop(); return; }
        var r = new Reconhecimento();
        r.lang = 'pt-BR';
        r.continuous = true;
        r.interimResults = false;
        r.addEventListener('result', function (evento) {
          var novo = '';
          for (var i = evento.resultIndex; i < evento.results.length; i += 1) {
            novo += evento.results[i][0].transcript;
          }
          campo.value = (campo.value.trim() + ' ' + novo.trim()).trim();
        });
        r.addEventListener('error', function (evento) {
          estado.textContent = evento.error === 'not-allowed'
            ? 'O navegador bloqueou o microfone. Libere e tente de novo.'
            : 'Não consegui ouvir. Pode escrever.';
        });
        r.addEventListener('end', function () {
          ouvindo = null;
          falar.textContent = 'Falar';
          falar.classList.remove('ouvindo');
        });
        r.start();
        ouvindo = r;
        falar.textContent = 'Ouvindo, toque para parar';
        falar.classList.add('ouvindo');
        estado.textContent = '';
      });
      acoes.appendChild(falar);
    }

    acoes.appendChild(montar);
    acoes.appendChild(estado);
    cartao.appendChild(acoes);
    return cartao;
  }

  function marcarSujo() {
    construtor.sujo = true;
    var estado = document.querySelector('.estado-publicacao');
    if (estado) estado.textContent = 'Mudanças não publicadas';
  }

  function no(tipo, titulo, chave) {
    var cartao = el('section', null, 'no ' + tipo + (construtor.selecionado === chave ? ' selecionado' : ''));
    var cab = el('header');
    cab.appendChild(el('span', titulo));
    cartao.appendChild(cab);
    cartao.addEventListener('click', function () {
      if (construtor.selecionado === chave) return;
      construtor.selecionado = chave;
      document.querySelectorAll('.no').forEach(function (n) { n.classList.remove('selecionado'); });
      cartao.classList.add('selecionado');
      desenharPrevia();
    });
    return cartao;
  }

  function ligacao() {
    var l = el('div', null, 'ligacao');
    l.setAttribute('aria-hidden', 'true');
    return l;
  }

  function desenharQuadro() {
    var quadro = document.querySelector('.quadro');
    if (!quadro) return;
    quadro.textContent = '';
    var f = construtor.fluxo;

    // Convite
    var convite = no('convite', 'Convite', 'convite');
    var corpoConvite = el('div', null, 'no-corpo');
    var rotuloConvite = el('label', 'Texto do botão flutuante');
    var campoConvite = el('input');
    campoConvite.value = f.convite;
    campoConvite.maxLength = 60;
    campoConvite.addEventListener('input', function () { f.convite = campoConvite.value; marcarSujo(); desenharPrevia(); });
    rotuloConvite.appendChild(campoConvite);
    corpoConvite.appendChild(rotuloConvite);

    var linhaCor = el('label', 'Cor do botão e do cabeçalho');
    var caixaCor = el('div', null, 'cor-linha');
    var campoCor = el('input');
    campoCor.type = 'color'; campoCor.value = f.cor || '#15803d';
    campoCor.addEventListener('input', function () { f.cor = campoCor.value; marcarSujo(); desenharPrevia(); });
    var padrao = el('button', 'Padrão', 'secundario');
    padrao.type = 'button';
    padrao.addEventListener('click', function (e) { e.stopPropagation(); f.cor = ''; marcarSujo(); desenharQuadro(); desenharPrevia(); });
    caixaCor.appendChild(campoCor); caixaCor.appendChild(padrao);
    linhaCor.appendChild(caixaCor);
    corpoConvite.appendChild(linhaCor);

    var rotuloFormato = el('label', 'Formato do botão');
    var campoFormato = el('select');
    [['retangular', 'Retangular, com o texto'], ['redondo', 'Redondo, só o ícone']].forEach(function (par) {
      var op = el('option', par[1]); op.value = par[0];
      if (f.botaoFormato === par[0]) op.selected = true;
      campoFormato.appendChild(op);
    });
    campoFormato.addEventListener('click', function (e) { e.stopPropagation(); });
    campoFormato.addEventListener('change', function () {
      f.botaoFormato = campoFormato.value; marcarSujo(); desenharPrevia();
    });
    rotuloFormato.appendChild(campoFormato);
    corpoConvite.appendChild(rotuloFormato);

    /*
     * Posicao como seis celulas no desenho da tela, e nao lista suspensa.
     * "direita-central" numa lista obriga a pessoa a imaginar onde fica; a
     * grade ja e o mapa, e a escolha errada cobre o botao de comprar do tema,
     * que e o motivo de a opcao existir.
     */
    var rotuloPosicao = el('label', 'Posição na tela');
    var grade = el('div', null, 'posicao-grade');
    if (f.cor) grade.style.setProperty('--cor-widget', f.cor);
    [['esquerda-superior', 'Esquerda, topo'], ['direita-superior', 'Direita, topo'],
      ['esquerda-central', 'Esquerda, meio'], ['direita-central', 'Direita, meio'],
      ['esquerda-inferior', 'Esquerda, base'], ['direita-inferior', 'Direita, base'],
    ].forEach(function (par) {
      var cel = el('button', par[1]);
      cel.type = 'button';
      cel.setAttribute('aria-pressed', f.botaoPosicao === par[0] ? 'true' : 'false');
      cel.addEventListener('click', function (e) {
        e.stopPropagation();
        f.botaoPosicao = par[0];
        grade.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        cel.setAttribute('aria-pressed', 'true');
        marcarSujo(); desenharPrevia();
      });
      grade.appendChild(cel);
    });
    rotuloPosicao.appendChild(grade);
    corpoConvite.appendChild(rotuloPosicao);
    corpoConvite.appendChild(el('p', 'Em alguns temas o canto inferior direito cobre o botão de comprar. Se acontecer, mude o lado aqui.', 'hora'));

    var rotuloModo = el('label', 'Formato da conversa');
    var campoModo = el('select');
    [['chat', 'Chat em popup, no meio da tela'], ['painel', 'Janela compacta no canto']].forEach(function (par) {
      var op = el('option', par[1]); op.value = par[0]; if (f.modo === par[0]) op.selected = true; campoModo.appendChild(op);
    });
    campoModo.addEventListener('click', function (e) { e.stopPropagation(); });
    campoModo.addEventListener('change', function () { f.modo = campoModo.value; marcarSujo(); desenharQuadro(); desenharPrevia(); });
    rotuloModo.appendChild(campoModo);
    corpoConvite.appendChild(rotuloModo);

    var rotuloAbrir = el('label', 'Abrir sozinho após (segundos, 0 desliga)');
    var campoAbrir = el('input');
    campoAbrir.type = 'number'; campoAbrir.min = 0; campoAbrir.max = 120; campoAbrir.value = f.abrirApos;
    campoAbrir.addEventListener('input', function () { f.abrirApos = Math.max(0, Math.min(120, Number(campoAbrir.value) || 0)); marcarSujo(); });
    rotuloAbrir.appendChild(campoAbrir);
    corpoConvite.appendChild(rotuloAbrir);
    corpoConvite.appendChild(el('p', 'O botão treme como um telefone tocando até o primeiro clique.', 'hora'));
    convite.appendChild(corpoConvite);
    quadro.appendChild(convite);

    // Perguntas
    f.perguntas.forEach(function (pergunta, indice) {
      quadro.appendChild(ligacao());
      var cartao = no('pergunta', 'Pergunta ' + (indice + 1), indice);
      var acoes = el('span', null, 'no-acoes');
      [['↑', 'Mover para cima', function () { mover(indice, -1); }],
       ['↓', 'Mover para baixo', function () { mover(indice, 1); }],
       ['×', 'Remover pergunta', function () { remover(indice); }]].forEach(function (a) {
        var b = el('button', a[0], 'no-botao');
        b.type = 'button'; b.title = a[1];
        b.addEventListener('click', function (e) { e.stopPropagation(); a[2](); });
        acoes.appendChild(b);
      });
      cartao.querySelector('header').appendChild(acoes);

      var corpo = el('div', null, 'no-corpo');
      var rotulo = el('label', 'Pergunta');
      var texto = el('textarea');
      texto.rows = 2; texto.maxLength = 160;
      texto.value = pergunta.texto;
      texto.placeholder = 'Ex.: Qual o seu tamanho?';
      texto.addEventListener('input', function () { pergunta.texto = texto.value; marcarSujo(); desenharPrevia(); });
      rotulo.appendChild(texto);
      corpo.appendChild(rotulo);

      corpo.appendChild(el('div', pergunta.opcoes.length ? 'Respostas' : 'Resposta livre, o visitante escreve', 'rotulo'));
      var chips = el('div', null, 'chips');
      pergunta.opcoes.forEach(function (opcao, i) {
        var chip = el('span', null, 'chip');
        chip.appendChild(document.createTextNode(opcao));
        var tirar = el('button', '×', 'chip-x');
        tirar.type = 'button'; tirar.title = 'Remover resposta';
        tirar.addEventListener('click', function (e) {
          e.stopPropagation(); pergunta.opcoes.splice(i, 1); marcarSujo(); desenharQuadro(); desenharPrevia();
        });
        chip.appendChild(tirar);
        chips.appendChild(chip);
      });
      corpo.appendChild(chips);

      if (pergunta.opcoes.length < 8) {
        var nova = el('input');
        nova.placeholder = pergunta.opcoes.length ? 'Nova resposta e Enter' : 'Adicionar resposta e Enter';
        nova.maxLength = 60;
        nova.className = 'nova-opcao';
        nova.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          var v = nova.value.trim();
          if (!v) return;
          pergunta.opcoes.push(v); marcarSujo(); desenharQuadro(); desenharPrevia();
          var campos = document.querySelectorAll('.no.pergunta .nova-opcao');
          if (campos[indice]) campos[indice].focus();
        });
        corpo.appendChild(nova);
      }
      cartao.appendChild(corpo);
      quadro.appendChild(cartao);
    });

    // Adicionar
    if (f.perguntas.length < TETO_PERGUNTAS) {
      quadro.appendChild(ligacao());
      var adicionar = el('button', null, 'no adicionar');
      adicionar.type = 'button';
      adicionar.appendChild(el('strong', '+ Adicionar pergunta'));
      /*
       * O aviso aparece a partir da quarta porque ele e verdade medida: cada
       * pergunta a mais derruba quantos chegam ao fim. O teto existe para o
       * lojista nao montar um formulario de dez campos achando que esta
       * qualificando melhor, mas quem quer mais pode ir ate seis.
       */
      adicionar.appendChild(el('span', f.perguntas.length >= 3
        ? f.perguntas.length + ' de ' + TETO_PERGUNTAS + ', cada uma a mais derruba a taxa de resposta'
        : f.perguntas.length + ' de ' + TETO_PERGUNTAS, 'hora'));
      adicionar.addEventListener('click', function () {
        f.perguntas.push({ texto: '', opcoes: [] });
        construtor.selecionado = f.perguntas.length - 1;
        marcarSujo(); desenharQuadro(); desenharPrevia();
        var areas = document.querySelectorAll('.no.pergunta textarea');
        if (areas.length) areas[areas.length - 1].focus();
      });
      quadro.appendChild(adicionar);
    }

    // Contato, fixo
    quadro.appendChild(ligacao());
    var contato = no('contato', 'Contato', 'contato');
    contato.querySelector('header').appendChild(el('span', 'fixo, sempre o último', 'no-fixo'));
    var corpoContato = el('div', null, 'no-corpo');
    corpoContato.appendChild(el('div', 'O visitante deixa', 'rotulo'));
    var fixos = el('div', null, 'chips');
    ['Nome', 'WhatsApp', 'E-mail'].forEach(function (c) { fixos.appendChild(el('span', c, 'chip fixo')); });
    corpoContato.appendChild(fixos);
    var rotuloLgpd = el('label', 'Linha de consentimento (LGPD)');
    var lgpd = el('textarea');
    lgpd.rows = 3; lgpd.maxLength = 300;
    lgpd.value = f.consentimento;
    lgpd.addEventListener('input', function () { f.consentimento = lgpd.value; marcarSujo(); desenharPrevia(); });
    rotuloLgpd.appendChild(lgpd);
    corpoContato.appendChild(rotuloLgpd);
    contato.appendChild(corpoContato);
    quadro.appendChild(contato);

    // Beneficio
    quadro.appendChild(ligacao());
    var beneficio = no('cupom', 'Benefício', 'cupom');
    var corpoBen = el('div', null, 'no-corpo');
    var rotuloTipo = el('label', 'O que o visitante ganha');
    var tipo = el('select');
    RECOMPENSAS.forEach(function (grupo) {
      var og = document.createElement('optgroup');
      og.label = grupo[0];
      grupo[1].forEach(function (r) {
        var op = el('option', r[1]);
        op.value = r[0];
        if (f.recompensa === r[0]) op.selected = true;
        og.appendChild(op);
      });
      tipo.appendChild(og);
    });
    tipo.addEventListener('click', function (e) { e.stopPropagation(); });
    tipo.addEventListener('change', function () {
      f.recompensa = tipo.value;
      // Quem troca o beneficio quer ver como ele aparece, entao a previa vai junto.
      construtor.selecionado = 'cupom';
      marcarSujo(); desenharQuadro(); desenharPrevia();
    });
    rotuloTipo.appendChild(tipo);
    corpoBen.appendChild(rotuloTipo);

    if (f.recompensa === 'cupom') {
      var rotuloDesc = el('label', 'Desconto em %');
      var desc = el('input');
      desc.type = 'number'; desc.min = 1; desc.max = 90; desc.value = f.desconto;
      desc.addEventListener('input', function () { f.desconto = Number(desc.value) || 10; marcarSujo(); desenharPrevia(); });
      rotuloDesc.appendChild(desc);
      corpoBen.appendChild(rotuloDesc);
      corpoBen.appendChild(el('p', 'Um código único por pessoa, criado na hora na sua plataforma.', 'hora'));
    } else if (f.recompensa === 'frete_gratis') {
      corpoBen.appendChild(el('p', 'Um cupom único de frete grátis, criado na hora na sua plataforma.', 'hora'));
    } else {
      corpoBen.appendChild(el('p', 'Não cria nada na loja. O lead entra na fila para você chamar no WhatsApp.', 'hora'));
    }
    beneficio.appendChild(corpoBen);
    quadro.appendChild(beneficio);
  }

  function mover(indice, passo) {
    var p = construtor.fluxo.perguntas;
    var destino = indice + passo;
    if (destino < 0 || destino >= p.length) return;
    var tmp = p[indice]; p[indice] = p[destino]; p[destino] = tmp;
    construtor.selecionado = destino;
    marcarSujo(); desenharQuadro(); desenharPrevia();
  }

  function remover(indice) {
    construtor.fluxo.perguntas.splice(indice, 1);
    construtor.selecionado = 'convite';
    marcarSujo(); desenharQuadro(); desenharPrevia();
  }

  /** O que o visitante ve, na etapa selecionada. */
  // Os mesmos desenhos do public/widget.js. Duplicar dois caminhos de SVG
  // custa menos do que fazer o painel baixar o widget so para mostrar um
  // icone, e o widget nao pode ganhar peso por causa do painel.
  var ICONES_BOTAO = {
    presente: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    balao: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.9A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 2.6h.5A8.4 8.4 0 0 1 21 11z',
  };
  function iconeDoBotao(nome) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var caminho = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    caminho.setAttribute('d', ICONES_BOTAO[nome]);
    svg.appendChild(caminho);
    return svg;
  }

  function desenharPrevia() {
    var previa = document.querySelector('.previa');
    if (!previa) return;
    previa.textContent = '';
    var f = construtor.fluxo;
    var sel = construtor.selecionado;
    previa.appendChild(el('div', 'Como o visitante ve', 'rotulo'));

    var tela = el('div', null, 'previa-tela');
    if (f.cor) tela.style.setProperty('--cor-widget', f.cor);
    if (sel === 'convite') {
      var redondo = f.botaoFormato === 'redondo';
      var botao = el('div', redondo ? null : (f.convite || 'Ganhe cupom'),
        'previa-botao' + classesDePosicao(f.botaoPosicao) + (redondo ? ' rd' : ''));
      if (redondo) {
        var comBeneficio = f.recompensa === 'cupom' || f.recompensa === 'frete_gratis';
        botao.appendChild(iconeDoBotao(comBeneficio ? 'presente' : 'balao'));
        botao.title = f.convite || 'Ganhe cupom';
      }
      tela.appendChild(el('div', null, 'previa-loja'));
      tela.appendChild(botao);
      previa.appendChild(tela);
      previa.appendChild(el('p', redondo
        ? 'Botão redondo no canto escolhido. Sem texto na loja: o convite vira o nome do botão para leitor de tela.'
        : 'Botão flutuante no canto escolhido. Clicar abre o chat.', 'hora'));
      return;
    }

    var painel = el('div', null, 'previa-painel');
    var cab = el('div', null, 'previa-cab');
    cab.appendChild(el('strong', f.convite || 'Ganhe cupom'));
    cab.appendChild(el('span', '×'));
    painel.appendChild(cab);
    var corpo = el('div', null, 'previa-corpo');

    var total = f.perguntas.length + 1;
    var passo = typeof sel === 'number' ? sel : sel === 'contato' ? f.perguntas.length : total;
    var barra = el('div', null, 'previa-barra');
    var dentro = el('i');
    dentro.style.width = Math.round((passo / total) * 100) + '%';
    barra.appendChild(dentro);
    corpo.appendChild(barra);

    if (typeof sel === 'number') {
      var p = f.perguntas[sel];
      corpo.appendChild(el('div', p.texto || 'Sua pergunta aqui', 'previa-q'));
      if (p.opcoes.length) {
        p.opcoes.forEach(function (o) { corpo.appendChild(el('div', o, 'previa-op')); });
      } else {
        var campo = el('div', 'Escreva aqui', 'previa-campo');
        corpo.appendChild(campo);
        corpo.appendChild(el('div', 'Continuar', 'previa-enviar'));
      }
    } else if (sel === 'contato') {
      var comCupom = f.recompensa === 'cupom' || f.recompensa === 'frete_gratis';
      corpo.appendChild(el('div', comCupom ? 'Onde eu te mando o cupom?' : 'Onde a gente fala com você?', 'previa-q'));
      [['Seu nome', 'Renata'], ['WhatsApp', '(41) 99999-0000'], ['E-mail', 'renata@email.com.br']].forEach(function (c) {
        corpo.appendChild(el('div', c[0], 'previa-rotulo'));
        corpo.appendChild(el('div', c[1], 'previa-campo'));
      });
      corpo.appendChild(el('p', f.consentimento || 'Linha de consentimento', 'previa-lgpd'));
      var cta = { cupom: 'Quero meu cupom', frete_gratis: 'Quero frete grátis', diagnostico: 'Quero meu diagnóstico',
        especialista: 'Falar com especialista', consultoria: 'Quero a consultoria' };
      corpo.appendChild(el('div', cta[f.recompensa] || cta.cupom, 'previa-enviar'));
    } else if (f.recompensa === 'cupom' || f.recompensa === 'frete_gratis') {
      corpo.appendChild(el('p', f.recompensa === 'cupom' ? 'Pronto! Use este cupom no carrinho:' : 'Pronto! Use este cupom e o frete sai de graça:', 'previa-msg'));
      var prefixo = String(construtor.nomeLoja).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'CUPOM';
      corpo.appendChild(el('div', prefixo + '-7K2QXR', 'previa-cupom'));
      corpo.appendChild(el('p', f.recompensa === 'cupom' ? 'Ele é só seu e vale uma vez. ' + f.desconto + '% de desconto.' : 'Ele é só seu e vale uma vez.', 'previa-msg'));
    } else {
      var finais = {
        diagnostico: 'Recebemos suas respostas. Em breve um especialista manda seu diagnóstico no WhatsApp.',
        especialista: 'Recebemos seus dados. Um especialista vai falar com você no WhatsApp em breve.',
        consultoria: 'Recebemos suas respostas. Vamos combinar sua consultoria pelo WhatsApp em breve.',
      };
      corpo.appendChild(el('p', finais[f.recompensa], 'previa-msg'));
      corpo.appendChild(el('p', 'Sem cupom: o benefício é o contato humano.', 'hora'));
    }
    painel.appendChild(corpo);
    tela.appendChild(painel);
    previa.appendChild(tela);
    previa.appendChild(el('p', 'Clique num cartao do quadro para ver aquela etapa.', 'hora'));
  }

  /** Modal de modelos, em sanfona por nicho como a ferramenta que o lojista ja usa. */
  function abrirModelos() {
    var existente = document.querySelector('.sobreposicao');
    if (existente) existente.remove();
    var fundo = el('div', null, 'sobreposicao');
    var modal = el('div', null, 'modal');
    var cab = el('div', null, 'modal-cab');
    cab.appendChild(el('strong', 'Selecione um modelo'));
    var fechar = el('button', '×', 'icone');
    fechar.type = 'button'; fechar.setAttribute('aria-label', 'Fechar');
    fechar.addEventListener('click', function () { fundo.remove(); });
    cab.appendChild(fechar);
    modal.appendChild(cab);
    modal.appendChild(el('p', 'Comece por um padrão do seu nicho e ajuste o texto do seu jeito.', 'legenda'));

    var nichos = {};
    modelos.forEach(function (m) { (nichos[m.nicho] = nichos[m.nicho] || []).push(m); });
    Object.keys(nichos).forEach(function (nicho, i) {
      var grupo = el('div', null, 'sanfona' + (i === 0 ? ' aberta' : ''));
      var cabGrupo = el('button', null, 'sanfona-cab');
      cabGrupo.type = 'button';
      cabGrupo.appendChild(el('span', nicho));
      cabGrupo.appendChild(el('span', '⌄', 'seta'));
      cabGrupo.addEventListener('click', function () { grupo.classList.toggle('aberta'); });
      grupo.appendChild(cabGrupo);
      var itens = el('div', null, 'sanfona-itens');
      nichos[nicho].forEach(function (m) {
        var item = el('button', null, 'modelo');
        item.type = 'button';
        item.appendChild(el('strong', m.nome));
        item.appendChild(el('span', NOME_RECOMPENSA[m.recompensa] || 'Cupom de desconto', 'selo criado'));
        item.appendChild(el('span', m.perguntas.map(function (p) { return p.texto; }).join('  \u00b7  '), 'hora'));
        item.addEventListener('click', function () { aplicarModelo(m); fundo.remove(); });
        itens.appendChild(item);
      });
      grupo.appendChild(itens);
      modal.appendChild(grupo);
    });

    fundo.appendChild(modal);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fundo.remove(); });
    document.body.appendChild(fundo);
  }

  function aplicarModelo(m) {
    var f = construtor.fluxo;
    f.convite = m.convite;
    f.consentimento = m.consentimento.replace(/\{loja\}/g, construtor.nomeLoja);
    f.desconto = m.desconto;
    f.recompensa = m.recompensa || 'cupom';
    f.perguntas = m.perguntas.map(function (p) { return { texto: p.texto, opcoes: p.opcoes.slice() }; });
    construtor.selecionado = 0;
    marcarSujo(); desenharQuadro(); desenharPrevia();
  }

  window.addEventListener('beforeunload', function (e) {
    if (construtor && construtor.sujo) { e.preventDefault(); e.returnValue = ''; }
  });

  // ----------------------------------------------------------- integracoes ---

  var TEXTO_MODO = {
    auto: 'Instalação automática. Nada a fazer na loja.',
    manual: 'Precisa colar o código no painel da loja.',
    bloqueado: 'Não instala nesta loja.',
    pendente: 'Ainda não resolvido.',
  };

  var NOME_PLATAFORMA = { nuvemshop: 'Nuvemshop', tray: 'Tray', woocommerce: 'WooCommerce', loja_integrada: 'Loja Integrada', outra: 'Outra plataforma' };

  var PLATAFORMAS = [
    { id: 'nuvemshop', nome: 'Nuvemshop', resumo: 'Instalação automática e cupom por API.' },
    { id: 'tray', nome: 'Tray', resumo: 'Instalação automática e cupom por API.' },
    { id: 'woocommerce', nome: 'WooCommerce', resumo: 'Cupom por API. O widget entra pelo nosso plugin.' },
    { id: 'loja_integrada', nome: 'Loja Integrada', resumo: 'Código colado no tema e cupons em lote.' },
    // Fecha a lista em vez de deixar quem nao usa as quatro sem saida. O
    // widget e uma tag de script: funciona em Shopify, VTEX, Magento, Wix e
    // site feito a mao. O que falta nessas e API, nao o chat.
    { id: 'outra', nome: 'Outra plataforma', resumo: 'Shopify, VTEX, Wix, site próprio. Você cola o código no tema.' },
  ];

  /** Campos que cada plataforma pede na conexao manual. */
  var CAMPOS_CONEXAO = {
    nuvemshop: [
      ['store_id', 'ID da loja (user_id)', 'text', 'Ex.: 1234567'],
      ['access_token', 'Access token', 'password', ''],
    ],
    tray: [
      ['api_address', 'Endereço da API (api_address)', 'url', 'https://sualoja.commercesuite.com.br/web_api'],
      ['access_token', 'Access token', 'password', ''],
      ['refresh_token', 'Refresh token', 'password', ''],
      ['store_id', 'Código da loja (store_id)', 'text', 'Ex.: 391250'],
    ],
    woocommerce: [
      ['url', 'Endereço da loja', 'url', 'https://sualoja.com.br'],
      ['consumer_key', 'Consumer key', 'text', 'ck_...'],
      ['consumer_secret', 'Consumer secret', 'password', 'cs_...'],
    ],
    loja_integrada: [
      ['chave_api', 'Chave de API', 'password', ''],
      ['chave_aplicacao', 'Chave de aplicacao', 'password', ''],
    ],
    // Sem API, sem credencial. O endereco serve so para identificar a loja
    // na lista; nada e chamado com ele.
    outra: [
      ['url', 'Endereço da loja', 'url', 'https://sualoja.com.br'],
    ],
  };

  var AJUDA_CONEXAO = {
    nuvemshop: 'Sem o app na loja de aplicativos, o token sai do painel de parceiros da Nuvemshop.',
    tray: 'Os tokens vem da autorizacao do aplicativo. Sem o botão acima, gere o code em Meus aplicativos e troque pelos tokens conforme docs/tray-api.md.',
    woocommerce: 'Em WooCommerce, Configurações, Avancado e REST API, crie uma chave com permissao de leitura e escrita.',
    loja_integrada: 'A chave de API sai do painel da Loja Integrada (só em plano pago). A chave de aplicacao a equipe deles emite em 3 a 5 dias úteis.',
    outra: 'Não pedimos senha nem token: o chat entra por uma tag de script que você cola no tema. Depois de conectar, o código aparece aqui pronto para copiar.',
  };

  /**
   * Bilhete de OAuth: a callback da plataforma trocou o code por token e
   * mandou o resultado cifrado no endereco. Aqui ele vira conexao da conta
   * logada. O endereco e limpo antes de qualquer coisa, para um F5 nao
   * tentar usar o bilhete de novo.
   */
  function bilheteNoEndereco() {
    var partes = location.hash.split('?');
    if (partes.length < 2) return null;
    var bilhete = new URLSearchParams(partes[1]).get('bilhete');
    history.replaceState(null, '', location.pathname + partes[0]);
    return bilhete;
  }

  function verIntegracoes() {
    var alvo = pintar('Integrações', 'Conecte a loja, resolva a instalação e o chat entra no ar.');
    var bilhete = bilheteNoEndereco();
    if (bilhete) perguntarAntesDeConectar(alvo, bilhete);
    listarConexoes(alvo);
  }

  /**
   * Chegar com um bilhete no endereço não conecta nada sozinho.
   *
   * Sem esta confirmação, bastaria induzir um lojista logado a abrir um link
   * de callback para que a loja de outra pessoa fosse plantada na conta dele,
   * queimando a cota e misturando os leads. Aqui ele vê de qual loja se trata
   * e decide.
   */
  function perguntarAntesDeConectar(alvo, bilhete) {
    var cartao = el('div', null, 'cartao confirmar-loja');
    alvo.appendChild(cartao);
    cartao.appendChild(el('p', 'Conferindo o pedido de conexão...', 'legenda'));

    api('/conexoes/oauth/pendente?bilhete=' + encodeURIComponent(bilhete)).then(function (p) {
      cartao.textContent = '';
      cartao.appendChild(el('div', 'Uma loja quer se conectar', 'rotulo'));
      cartao.appendChild(el('p', 'Uma loja ' + (NOME_PLATAFORMA[p.plataforma] || p.plataforma)
        + (p.loja ? ' (' + String(p.loja).replace(/^https?:\/\//, '') + ')' : '')
        + ' autorizou o Captapp. Conectar à conta ' + (eu && eu.conta ? eu.conta.nome : 'atual') + '?', 'legenda'));
      cartao.appendChild(el('p', 'Se você não começou esta conexão agora, descarte.', 'hora'));

      var erro = el('p', null, 'erro'); erro.hidden = true;
      var acoes = el('div', null, 'acoes');
      var conectar = el('button', 'Conectar esta loja');
      var descartar = el('button', 'Descartar', 'secundario');
      conectar.type = 'button'; descartar.type = 'button';
      conectar.addEventListener('click', function () {
        conectar.disabled = true; descartar.disabled = true; erro.hidden = true;
        api('/conexoes/oauth', { method: 'POST', corpo: { bilhete: bilhete } })
          .then(function (r) {
            cartao.textContent = '';
            cartao.appendChild(el('p', r.conexao.nome_loja + ' conectada'
              + (r.instalacao && r.instalacao.modo === 'auto' ? ' e widget instalado.' : '.'), 'ok'));
            listarConexoes(alvo);
          })
          .catch(function (e) {
            erro.textContent = e.message; erro.hidden = false;
            conectar.disabled = false; descartar.disabled = false;
          });
      });
      descartar.addEventListener('click', function () { cartao.remove(); });
      acoes.appendChild(conectar); acoes.appendChild(descartar);
      cartao.appendChild(erro);
      cartao.appendChild(acoes);
    }).catch(function (e) {
      cartao.textContent = '';
      cartao.appendChild(el('p', 'Não foi possível conectar: ' + e.message, 'erro'));
    });
  }

  function listarConexoes(alvo) {
    var area = alvo.querySelector('.area-conexoes');
    if (area) area.remove();
    area = el('div', null, 'area-conexoes');
    alvo.appendChild(area);
    Promise.all([api('/conexoes'), api('/conexoes/oauth')]).then(function (r) {
      var conexoes = r[0];
      area.appendChild(cartaoConectar(r[1], function () { listarConexoes(alvo); }));
      if (!conexoes.length) area.appendChild(el('p', 'Nenhuma loja conectada ainda. Comece pelo cartao acima.', 'vazio'));
      conexoes.forEach(function (conexao) {
        var cartao = el('div', null, 'cartao');
        var topo = el('div', null, 'titulo-conexao');
        topo.appendChild(el('strong', conexao.nome_loja));
        topo.appendChild(el('span', NOME_PLATAFORMA[conexao.plataforma] || conexao.plataforma, 'rotulo'));
        topo.appendChild(selo(conexao.modo_instalacao, conexao.modo_instalacao));
        cartao.appendChild(topo);
        cartao.appendChild(el('p', TEXTO_MODO[conexao.modo_instalacao] || '', 'legenda'));

        if (conexao.status === 'pausada') {
          cartao.appendChild(el('p', 'Chat pausado por você. O widget não aparece na loja até reativar. Os leads continuam aqui.', 'erro'));
        }
        if (conexao.status === 'inadimplente_plataforma') {
          cartao.appendChild(el('p', 'Esta loja esta inadimplente com a propria plataforma. Enquanto isso durar, script e webhook ficam fora do ar por decisao dela, não nossa.', 'erro'));
        }
        if (conexao.detalhe_status) cartao.appendChild(el('p', conexao.detalhe_status, 'hora detalhe'));
        if (conexao.lote) {
          // Lote baixo e o problema que so aparece quando ja doeu: o lead
          // ouve a promessa e nao recebe codigo. Por isso vira alerta em
          // vermelho, e nao mais uma linha de legenda.
          var restam = Number(conexao.lote.disponiveis);
          var baixo = restam <= 10;
          cartao.appendChild(el('p', restam === 0
            ? 'Lote de cupons zerado. Quem responder o chat fica sem o cupom prometido. Reponha abaixo.'
            : 'Lote de cupons: ' + restam + ' disponíveis de ' + conexao.lote.total
              + (baixo ? '. Está acabando, reponha abaixo.' : '. Esta plataforma não cria cupom por API, então o código sai deste lote.'),
          baixo ? 'erro' : 'legenda'));
        }

        var acoes = el('div', null, 'acoes');
        var instalar = el('button', 'Resolver instalação');
        instalar.addEventListener('click', function () {
          instalar.disabled = true;
          api('/conexoes/' + conexao.id + '/instalacao', { method: 'POST' })
            .then(function (r) { mostrarInstrucoes(cartao, r); instalar.disabled = false; })
            .catch(function (e) {
              cartao.appendChild(el('p', e.dados && e.dados.explicacao ? e.dados.explicacao : e.message, 'erro'));
              instalar.disabled = false;
            });
        });
        acoes.appendChild(instalar);
        var verChave = el('button', 'Chave e código da loja', 'secundario');
        verChave.type = 'button';
        verChave.addEventListener('click', function () { mostrarChave(cartao, conexao); });
        acoes.appendChild(verChave);
        if (conexao.status === 'ativa' || conexao.status === 'pausada') {
          var pausada = conexao.status === 'pausada';
          var pausar = el('button', pausada ? 'Reativar o chat nesta loja' : 'Pausar o chat nesta loja', 'secundario');
          pausar.type = 'button';
          pausar.addEventListener('click', function () {
            pausar.disabled = true;
            api('/conexoes/' + conexao.id, { method: 'PUT', corpo: { status: pausada ? 'ativa' : 'pausada' } })
              .then(function () { listarConexoes(alvo); })
              .catch(function (e) { cartao.appendChild(el('p', e.message, 'erro')); pausar.disabled = false; });
          });
          acoes.appendChild(pausar);
        }
        cartao.appendChild(acoes);
        if (conexao.lote) cartao.appendChild(formularioLote(conexao, function () { listarConexoes(alvo); }));
        area.appendChild(cartao);
      });
    }).catch(function (e) { area.appendChild(el('p', e.message, 'erro')); });
  }

  /**
   * A tag que o lojista cola no tema.
   *
   * A tag de fechamento e montada em pedacos porque este arquivo pode ser
   * lido dentro de um HTML: escrita inteira, ela fecharia o script do painel
   * antes da hora e a tela ficaria em branco.
   */
  function tagDaLoja(chave) {
    return '<script async src="' + location.origin + '/widget.js?k=' + chave + '"><' + '/script>';
  }

  /** A chave publica identifica a loja no widget e no plugin. Nao e segredo, mas so aparece quando pedida. */
  function mostrarChave(cartao, conexao) {
    var antigo = cartao.querySelector('.chave-loja');
    if (antigo) { antigo.remove(); return; }
    var caixa = el('div', null, 'chave-loja instrucoes');
    caixa.appendChild(el('div', 'Chave da loja (para o plugin do WordPress)', 'rotulo'));
    caixa.appendChild(blocoDeCodigo(conexao.chave_publica));
    caixa.appendChild(el('div', 'Tag para colar no HTML da loja', 'rotulo'));
    caixa.appendChild(blocoDeCodigo(tagDaLoja(conexao.chave_publica)));
    caixa.appendChild(el('p', 'Cole antes do </body>, no rodapé de todas as páginas. Uma vez só: o resto muda pelo painel, sem mexer no tema de novo.', 'hora'));

    caixa.appendChild(el('div', 'Prompt para pedir a instalação a uma IA', 'rotulo'));
    caixa.appendChild(blocoDeCodigo(promptDeInstalacao(conexao)));
    caixa.appendChild(el('p', 'Cole este texto na Claude, ou em outra IA, junto com o HTML do tema da loja. Ele devolve o arquivo com a tag no lugar certo, sem mexer em mais nada.', 'hora'));

    cartao.appendChild(caixa);
  }

  /**
   * Texto pronto para pedir a instalação a uma IA.
   *
   * Implantação manual é onde o erro acontece: a tag vai parar dentro do
   * <head>, ou só na página inicial, ou colada duas vezes. O prompt diz o
   * lugar exato, proíbe o resto e pede a conferência, para quem implanta não
   * depender de lembrar disso tudo em cada loja.
   */
  function promptDeInstalacao(conexao) {
    // "numa loja Outra plataforma" nao e frase. Quando a plataforma nao tem
    // nome proprio, o prompt fala da loja sem tentar nomea-la.
    var nome = NOME_PLATAFORMA[conexao.plataforma];
    var onde = conexao.plataforma === 'outra' || !nome
      ? 'no tema de uma loja virtual'
      : 'no tema de uma loja ' + nome;
    return [
      'Você vai inserir uma tag de script ' + onde + '.',
      '',
      'A tag, exatamente como está, sem alterar nada:',
      '',
      tagDaLoja(conexao.chave_publica),
      '',
      'Regras:',
      '1. Cole a tag imediatamente antes do fechamento de </body>.',
      '2. Se o arquivo não tiver </body>, use o rodapé que aparece em todas as páginas.',
      '3. Não mexa em nenhuma outra linha do arquivo. Nada de formatar, indentar ou reorganizar.',
      '4. Se já existir uma tag apontando para widget.js, substitua a antiga em vez de somar outra.',
      '5. Mantenha o atributo async.',
      '',
      'Devolva o arquivo inteiro, pronto para colar de volta no editor de tema,',
      'e depois me diga em qual linha a tag ficou.',
      '',
      'Vou colar o HTML do tema na próxima mensagem.',
    ].join('\n');
  }

  /**
   * Conectar loja. Nuvemshop e Tray entram pelo OAuth quando o servidor tem
   * as chaves do aplicativo; o formulario manual fica como saida para as
   * outras duas e para quem ja tem o token em maos.
   */
  function cartaoConectar(oauth, aoConectar) {
    var cartao = el('div', null, 'cartao conectar');
    cartao.appendChild(el('div', 'Conectar uma loja', 'rotulo'));
    cartao.appendChild(el('p', 'Escolha a plataforma. O que cada uma pede aparece em seguida.', 'legenda'));
    var grade = el('div', null, 'plataformas');
    var formulario = el('div', null, 'form-conexao');
    formulario.hidden = true;
    PLATAFORMAS.forEach(function (p) {
      var botao = el('button', null, 'plataforma');
      botao.type = 'button';
      botao.appendChild(el('strong', p.nome));
      botao.appendChild(el('span', p.resumo, 'hora'));
      botao.addEventListener('click', function () {
        grade.querySelectorAll('.plataforma').forEach(function (b) { b.classList.remove('ativa'); });
        botao.classList.add('ativa');
        desenharFormConexao(formulario, p, oauth, aoConectar);
        formulario.hidden = false;
      });
      grade.appendChild(botao);
    });
    cartao.appendChild(grade);
    cartao.appendChild(formulario);
    return cartao;
  }

  function desenharFormConexao(caixa, plataforma, oauth, aoConectar) {
    caixa.textContent = '';
    if (plataforma.id === 'tray' && oauth.tray) {
      var passoTray = el('div', null, 'oauth-passo');
      passoTray.appendChild(el('strong', 'Pelo painel da Tray, sem copiar token'));
      passoTray.appendChild(el('p', 'Na sua loja Tray, entre em Meus aplicativos, procure Captapp e clique em Instalar. A Tray pede sua autorizacao e devolve você para esta tela com a loja conectada.', 'legenda'));
      caixa.appendChild(passoTray);
    }
    if (plataforma.id === 'nuvemshop' && oauth.nuvemshop) {
      var passoNs = el('div', null, 'oauth-passo');
      passoNs.appendChild(el('strong', 'Pela Nuvemshop, sem copiar token'));
      var irNs = el('a', 'Conectar pela Nuvemshop', 'botao-link');
      irNs.href = oauth.nuvemshopUrl; irNs.rel = 'noopener';
      passoNs.appendChild(irNs);
      caixa.appendChild(passoNs);
    }

    // "Conexao manual" so faz sentido onde existe a automatica para comparar.
    // Em Outra plataforma nao ha as duas, e chamar de manual sugere que a
    // pessoa perdeu um caminho melhor em algum lugar.
    var semApi = plataforma.id === 'outra';
    var form = el('form');
    form.appendChild(el('div', semApi ? 'Dados da loja' : 'Conexão manual', 'rotulo'));
    var nome = el('label', 'Nome da loja');
    var inputNome = el('input'); inputNome.name = 'nomeLoja'; inputNome.required = true; inputNome.placeholder = 'Como aparece para você no painel';
    nome.appendChild(inputNome);
    form.appendChild(nome);
    CAMPOS_CONEXAO[plataforma.id].forEach(function (c) {
      var rotulo = el('label', c[1]);
      var input = el('input');
      input.name = c[0]; input.type = c[2]; input.required = true; input.placeholder = c[3]; input.autocomplete = 'off';
      rotulo.appendChild(input);
      form.appendChild(rotulo);
    });
    if (plataforma.id === 'loja_integrada') {
      var tema = el('label', 'O tema da loja tem o campo "Incluir código HTML"?');
      var sel = el('select'); sel.name = 'tema_permite_html';
      [['true', 'Sim, tem o campo'], ['false', 'Não, e o tema padrão novo']].forEach(function (o) {
        var op = el('option', o[1]); op.value = o[0]; sel.appendChild(op);
      });
      tema.appendChild(sel);
      form.appendChild(tema);
    }
    form.appendChild(el('p', AJUDA_CONEXAO[plataforma.id], 'hora'));
    var erro = el('p', null, 'erro'); erro.hidden = true;
    form.appendChild(erro);
    var acoes = el('div', null, 'acoes');
    // Aqui nao instalamos nada: quem instala e o lojista, colando a tag. O
    // botao promete o que a tela entrega em seguida.
    var enviar = el('button', semApi ? 'Conectar e ver o código' : 'Conectar e instalar');
    enviar.type = 'submit';
    acoes.appendChild(enviar);
    form.appendChild(acoes);
    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      erro.hidden = true;
      enviar.disabled = true;
      var dados = new FormData(form);
      var credenciais = {};
      CAMPOS_CONEXAO[plataforma.id].forEach(function (c) { credenciais[c[0]] = String(dados.get(c[0]) || '').trim(); });
      if (plataforma.id === 'loja_integrada') credenciais.tema_permite_html = dados.get('tema_permite_html') === 'true';
      var dominio = credenciais.url || credenciais.api_address || null;
      if (dominio) dominio = dominio.replace(/^https?:\/\//, '').split('/')[0];
      // Sem API nao ha credencial a guardar. O endereco ja virou o dominio
      // acima, e cifrar uma copia dele no lugar de um token seria guardar
      // dado por inercia.
      if (plataforma.id === 'outra') credenciais = {};
      api('/conexoes', { method: 'POST', corpo: {
        plataforma: plataforma.id, nomeLoja: String(dados.get('nomeLoja')).trim(), dominio: dominio, credenciais: credenciais,
      } }).then(function (conexao) {
        // Instalacao logo em seguida: quem conecta quer ver o chat no ar.
        return api('/conexoes/' + conexao.id + '/instalacao', { method: 'POST' })
          .catch(function () { return null; })
          .then(function (resultado) { return { conexao: conexao, resultado: resultado }; });
      }).then(function (feito) {
        /*
         * Instalacao manual termina aqui, com o codigo na tela.
         *
         * Voltar para a lista mandaria o lojista procurar um botao para achar
         * o que ele precisa colar agora, e e nesse pulo que a instalacao fica
         * pela metade. Nas automaticas nao ha o que copiar, entao a lista e o
         * destino certo.
         */
        if (feito.resultado && feito.resultado.tag) {
          form.remove();
          var pronto = el('div', null, 'instrucoes');
          pronto.appendChild(el('div', 'Loja conectada. Falta colar o código.', 'rotulo'));
          var passos = el('ol', null, 'passos');
          (feito.resultado.instrucoes || []).forEach(function (t) { passos.appendChild(el('li', t)); });
          pronto.appendChild(passos);
          pronto.appendChild(blocoDeCodigo(feito.resultado.tag));
          var fechar = el('button', 'Já colei, ver minhas lojas', 'secundario');
          fechar.type = 'button';
          fechar.addEventListener('click', function () { aoConectar(); });
          pronto.appendChild(fechar);
          caixa.appendChild(pronto);
          return;
        }
        aoConectar();
      }).catch(function (e) {
        // A explicacao e a metade util quando o servidor recusa por regra de
        // negocio: "limite atingido" sozinho manda o lojista abrir chamado,
        // "o plano Escala permite 10, troque em Financeiro" resolve sozinho.
        erro.textContent = e.dados && e.dados.explicacao ? e.message + ' ' + e.dados.explicacao : e.message;
        erro.hidden = false;
        enviar.disabled = false;
      });
    });
    caixa.appendChild(form);
  }

  /** Lote de cupons: um codigo por linha, para a plataforma que nao cria cupom por API. */
  function formularioLote(conexao, aoSalvar) {
    var caixa = el('div', null, 'instrucoes');
    caixa.appendChild(el('div', 'Repor o lote de cupons', 'rotulo'));
    caixa.appendChild(el('p', 'Crie os cupons no painel da plataforma (uso único cada) e cole os códigos aqui, um por linha.', 'legenda'));
    var area = el('textarea'); area.rows = 4; area.placeholder = 'CUPOM-001\nCUPOM-002';
    caixa.appendChild(area);
    var acoes = el('div', null, 'acoes');
    var salvar = el('button', 'Adicionar ao lote'); salvar.type = 'button';
    var retorno = el('span', null, 'hora');
    salvar.addEventListener('click', function () {
      var codigos = area.value.split(/[\n,;\s]+/).map(function (c) { return c.trim(); }).filter(Boolean);
      if (!codigos.length) { retorno.textContent = 'Cole ao menos um código.'; return; }
      salvar.disabled = true;
      api('/conexoes/' + conexao.id + '/lote', { method: 'POST', corpo: { codigos: codigos } })
        .then(function (r) {
          retorno.textContent = r.inseridos + ' adicionados. Agora sao ' + r.saldo.disponiveis + ' disponíveis.';
          area.value = '';
          salvar.disabled = false;
          if (aoSalvar) setTimeout(aoSalvar, 1200);
        })
        .catch(function (e) { retorno.textContent = e.message; salvar.disabled = false; });
    });
    acoes.appendChild(salvar);
    acoes.appendChild(retorno);
    caixa.appendChild(acoes);
    return caixa;
  }

  /**
   * Bloco de codigo com botao de copiar.
   *
   * A tag do widget e longa e tem a chave da loja no meio: selecionar com o
   * mouse erra um caractere e o lojista instala algo que nao funciona, sem
   * mensagem de erro nenhuma na loja dele. O botao tira esse risco.
   */
  function blocoDeCodigo(texto) {
    var caixa = el('div', null, 'codigo');
    caixa.appendChild(el('pre', texto));
    var copiar = el('button', 'Copiar', 'secundario');
    copiar.type = 'button';
    copiar.addEventListener('click', function (e) {
      e.stopPropagation();
      var pronto = function () {
        copiar.textContent = 'Copiado';
        setTimeout(function () { copiar.textContent = 'Copiar'; }, 1600);
      };
      // navigator.clipboard so existe em https (ou localhost). Sem ele, a
      // selecao do texto ja deixa o Ctrl+C a um toque.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(pronto, function () { selecionar(caixa); });
      } else {
        selecionar(caixa);
      }
    });
    caixa.appendChild(copiar);
    return caixa;
  }

  function selecionar(caixa) {
    var faixa = document.createRange();
    faixa.selectNodeContents(caixa.querySelector('pre'));
    var selecao = window.getSelection();
    selecao.removeAllRanges();
    selecao.addRange(faixa);
  }

  function mostrarInstrucoes(cartao, resultado) {
    var antigo = cartao.querySelector('.instrucoes');
    if (antigo) antigo.remove();
    // O motivo guardado na conexao e o mesmo que volta agora, entao mostrar os
    // dois repete a mesma frase na cara do lojista.
    var detalhe = cartao.querySelector('.detalhe');
    if (detalhe) detalhe.remove();

    var caixa = el('div', null, 'instrucoes');
    if (resultado.modo === 'bloqueado') {
      caixa.appendChild(el('p', resultado.motivo, 'erro'));
      caixa.appendChild(el('p', 'Saida: ' + resultado.saida, 'legenda'));
    } else if (resultado.modo === 'auto') {
      caixa.appendChild(el('p', 'Instalado. O widget já esta no ar.'));
      if (resultado.ressalva) caixa.appendChild(el('p', resultado.ressalva, 'legenda'));
    } else {
      var passos = el('ol', null, 'passos');
      (resultado.instrucoes || []).forEach(function (p) { passos.appendChild(el('li', p)); });
      caixa.appendChild(passos);
      if (resultado.tag) caixa.appendChild(blocoDeCodigo(resultado.tag));
    }
    cartao.appendChild(caixa);
  }

  // ------------------------------------------------------------ financeiro ---

  var cicloEscolhido = 'mensal';

  function verFinanceiro() {
    var alvo = pintar('Financeiro', 'Seus planos, o que você já usou no mês e as cobranças.');
    var comAtendeAi = eu && eu.modulos && eu.modulos.atendimento;
    Promise.all([
      api('/financeiro'),
      comAtendeAi ? api('/atendimento').catch(function () { return null; }) : null,
    ]).then(function (r) {
      if (r[1]) alvo.appendChild(planoDoAtendeAi(r[1]));
      desenharFinanceiro(alvo, r[0]);
    });
  }

  /*
   * O plano do Atende Ai.
   *
   * Vem antes do plano do Captapp porque e o que o lojista assina primeiro
   * agora. Os precos sao os do codigo, e nao numeros escritos na tela: preco
   * que a pagina mostra diferente do que a fatura cobra e problema de
   * consumidor, nao de layout.
   */
  function planoDoAtendeAi(dados) {
    var c = dados.consumo || {};
    var faixas = dados.faixas || {};
    var caixa = el('div', null, 'cartao');
    caixa.appendChild(el('div', 'Atende Aí', 'rotulo'));
    caixa.appendChild(el('p', 'O plano é por mensagem que o agente envia no mês. Passou do teto, o excedente entra na fatura, e o atendimento não para.', 'legenda'));

    if (c.atualizadoEm) {
      var resumo = el('div', null, 'consumo');
      var topo = el('div', null, 'topo');
      topo.appendChild(el('strong', c.enviadas.toLocaleString('pt-BR')));
      topo.appendChild(el('span', 'de ' + c.incluidas.toLocaleString('pt-BR')
        + ' mensagens no plano ' + c.nome, 'hora'));
      resumo.appendChild(topo);
      var medidor = el('div', null, 'medidor' + (c.avisar ? ' cheio' : ''));
      var dentro = el('span');
      dentro.style.width = Math.min(100, Math.round((c.fatia || 0) * 100)) + '%';
      medidor.appendChild(dentro);
      resumo.appendChild(medidor);
      if (c.excedente && c.excedente.mensagens) {
        resumo.appendChild(el('span', c.excedente.mensagens.toLocaleString('pt-BR')
          + ' acima do plano, ' + dinheiro(c.excedente.valor)
          + ' a mais nesta fatura, a ' + dinheiro(dados.excedente) + ' por mensagem', 'hora'));
      }
      caixa.appendChild(resumo);
    }

    var linhas = Object.keys(faixas).map(function (nome) {
      var f = faixas[nome];
      var atual = nome === c.faixa;
      return { celulas: [
        atual ? selo(f.nome, 'criado') : f.nome,
        f.mensagens.toLocaleString('pt-BR') + ' mensagens',
        dinheiro(f.mensal) + '/mês',
        dinheiro(Math.round(f.mensal * (1 - (dados.descontoAnual || 0)) * 100) / 100) + '/mês no anual',
      ] };
    });
    caixa.appendChild(tabela(['Plano', 'Inclui', 'Mensal', 'Anual'], linhas));

    var ativacoes = dados.ativacoes || {};
    if (ativacoes.simples) {
      caixa.appendChild(el('p', 'Ativação: ' + dinheiro(ativacoes.simples.valor)
        + ', ou ' + dinheiro(ativacoes.acompanhada.valor) + ' com '
        + ativacoes.acompanhada.dias + ' dias de acompanhamento. Cobrança única, no começo.', 'legenda'));
    }
    caixa.appendChild(el('p', 'Para mudar de plano, fale com a gente. A troca vale a partir da próxima fatura.', 'legenda'));
    return caixa;
  }

  function desenharFinanceiro(alvo, dados) {
    var antigo = alvo.querySelector('.area-fin');
    if (antigo) antigo.remove();
    var area = el('div', null, 'area-fin');
    var a = dados.assinatura;
    var plano = a ? dados.planos[a.plano] : null;
    var uso = dados.uso;
    var pct = uso.cota ? Math.min(100, Math.round((uso.leadsMes / uso.cota) * 100)) : 0;
    var estourou = uso.cota != null && uso.leadsMes >= uso.cota;
    var abertas = dados.cobrancas.filter(function (c) { return c.status === 'aberta'; });
    var proxima = abertas.slice().sort(function (x, y) { return x.vence_em < y.vence_em ? -1 : 1; })[0];

    var grade = el('div', null, 'grade-num');
    grade.appendChild(cartaoNumero({
      rotulo: 'Plano atual', valor: plano ? plano.nome : 'Nenhum', nomeIcone: 'plano', tom: 'acento',
      detalhe: a ? dinheiro(dados.precos[a.plano][a.ciclo]) + (a.ciclo === 'anual' ? ' por ano' : ' por mês') : 'escolha um plano abaixo',
      rodape: { texto: a ? (a.ciclo === 'anual' ? 'Cobrança anual' : 'Cobrança mensal') : 'Sem cobrança ativa' },
    }));
    grade.appendChild(cartaoNumero({
      rotulo: 'Leads no mês', valor: uso.cota ? uso.leadsMes + ' de ' + uso.cota : String(uso.leadsMes),
      nomeIcone: 'leads', tom: estourou ? 'ruim' : pct >= 80 ? '' : 'bom',
      detalhe: uso.cota ? pct + '% da cota' : 'sem limite no seu plano',
      rodape: { texto: estourou ? 'Cota atingida: o chat saiu do ar na loja.' : (uso.cota ? 'A cota zera todo dia 1' : 'Plano sem teto de leads') },
    }));
    // Quantas lojas cabem no plano fica ao lado dos leads, e nao escondido na
    // lista de beneficios: e o numero que decide se o lojista consegue
    // conectar a proxima loja hoje.
    var lojasCheias = uso.cotaLojas != null && uso.lojas >= uso.cotaLojas;
    grade.appendChild(cartaoNumero({
      rotulo: 'Lojas conectadas', valor: uso.lojas + ' de ' + uso.cotaLojas,
      nomeIcone: 'loja', tom: uso.lojas > uso.cotaLojas ? 'ruim' : lojasCheias ? '' : 'bom',
      detalhe: uso.lojas > uso.cotaLojas
        ? 'acima do teto do plano'
        : lojasCheias ? 'teto do plano atingido' : 'cabem mais ' + (uso.cotaLojas - uso.lojas),
      rodape: {
        texto: uso.lojas > uso.cotaLojas
          ? 'As lojas continuam no ar. Para conectar outra, mude de plano.'
          : lojasCheias ? 'Para conectar outra, mude de plano' : 'Cada loja tem seu próprio chat',
      },
    }));
    grade.appendChild(cartaoNumero({
      rotulo: 'Próxima cobrança', valor: proxima ? dinheiro(proxima.valor) : 'Nada em aberto',
      nomeIcone: 'relogio', tom: dados.acesso.diasAtraso > 0 ? 'ruim' : '',
      detalhe: proxima ? 'vence em ' + new Date(proxima.vence_em).toLocaleDateString('pt-BR') : (a ? 'em dia' : ''),
      rodape: { texto: dados.acesso.diasAtraso > 0 ? dados.acesso.diasAtraso + ' dias de atraso' : 'Seus leads ficam guardados sempre' },
    }));
    area.appendChild(grade);

    // Planos
    var planosCx = el('div', null, 'cartao');
    var topo = el('div', null, 'planos-topo');
    topo.appendChild(el('div', 'Planos', 'rotulo'));
    var alternador = el('div', null, 'alternador');
    [['mensal', 'Mensal'], ['anual', 'Anual, ' + Math.round(dados.descontoAnual * 100) + '% off']].forEach(function (par) {
      var b = el('button', par[1], 'aba' + (cicloEscolhido === par[0] ? ' ativa' : ''));
      b.type = 'button';
      b.addEventListener('click', function () { cicloEscolhido = par[0]; desenharFinanceiro(alvo, dados); });
      alternador.appendChild(b);
    });
    topo.appendChild(alternador);
    planosCx.appendChild(topo);

    var colunas = el('div', null, 'planos');
    Object.keys(dados.planos).forEach(function (id) {
      var p = dados.planos[id];
      var atual = a && a.plano === id && a.ciclo === cicloEscolhido;
      var col = el('div', null, 'plano' + (atual ? ' atual' : ''));
      col.appendChild(el('div', p.nome, 'plano-nome'));
      var preco = el('div', null, 'plano-preco');
      preco.appendChild(el('span', dinheiro(cicloEscolhido === 'anual' ? dados.precos[id].anual / 12 : dados.precos[id].mensal)));
      preco.appendChild(el('small', '/mês'));
      col.appendChild(preco);
      if (cicloEscolhido === 'anual') col.appendChild(el('div', dinheiro(dados.precos[id].anual) + ' por ano', 'hora'));
      // A implantacao e uma vez so, entao quem ja pagou nao precisa reler o
      // preco dela em cada cartao de plano.
      if (dados.implantacao.cobrada) {
        col.appendChild(el('div', 'Implantação já cobrada', 'plano-implantacao'));
      } else {
        var imp = el('div', null, 'plano-implantacao');
        imp.appendChild(el('div', '+ implantação, uma vez só:'));
        imp.appendChild(el('strong', dinheiro(dados.implantacao.avista.total) + ' à vista'));
        imp.appendChild(el('div', 'ou ' + dados.implantacao.parcelado.parcelas + 'x de '
          + dinheiro(dados.implantacao.parcelado.valorParcela) + ' sem juros'));
        col.appendChild(imp);
      }
      var lista = el('ul', null, 'plano-lista');
      lista.appendChild(el('li', p.leadsMes ? 'Até ' + p.leadsMes.toLocaleString('pt-BR') + ' leads por mês' : 'Leads ilimitados'));
      lista.appendChild(el('li', p.lojas === 1 ? 'Uma loja ou site' : 'Até ' + p.lojas + ' lojas ou sites'));
      lista.appendChild(el('li', 'Chat com cupom único por pessoa'));
      lista.appendChild(el('li', 'Fila de leads e WhatsApp'));
      if (p.rastreamento) {
        lista.appendChild(el('li', 'Rastreamento de navegação'));
        // O que o rastreamento entrega na pratica. "Rastreamento de navegação"
        // sozinho e nome de funcionalidade, e ninguem compra funcionalidade.
        lista.appendChild(el('li', 'Veja o que cada lead olhou antes de responder'));
      } else {
        lista.appendChild(el('li', 'Sem rastreamento de navegação'));
      }
      col.appendChild(lista);
      var botao = el('button', atual ? 'Plano atual' : (a ? 'Mudar para este' : 'Escolher'), atual ? 'secundario' : '');
      botao.type = 'button';
      botao.disabled = atual;
      botao.addEventListener('click', function () { escolherPlano(alvo, dados, id); });
      col.appendChild(botao);
      colunas.appendChild(col);
    });
    planosCx.appendChild(colunas);
    if (!dados.cobrancaAutomatica) {
      planosCx.appendChild(el('p', 'A cobrança automática ainda não está ligada nesta conta. A troca de plano vale na hora e a cobrança é combinada com a equipe do Captapp.', 'hora'));
    }
    area.appendChild(planosCx);

    // Cobrancas
    var cobr = el('div', null, 'cartao');
    cobr.appendChild(el('div', 'Cobranças', 'rotulo'));
    if (dados.cobrancas.length) {
      cobr.appendChild(tabela(['Tipo', 'Valor', 'Vencimento', 'Situação', 'Origem'],
        dados.cobrancas.map(function (c) {
          return { celulas: [
            c.tipo === 'implantacao' ? 'Implantação' : 'Mensalidade',
            dinheiro(c.valor),
            new Date(c.vence_em).toLocaleDateString('pt-BR'),
            selo(c.status === 'paga' ? 'paga' : c.status === 'aberta' ? 'em aberto' : c.status,
              c.status === 'paga' ? 'criado' : c.status === 'aberta' ? 'manual' : 'pendente'),
            c.origem,
          ] };
        })));
    } else {
      cobr.appendChild(el('p', 'Nenhuma cobrança ainda.', 'vazio'));
    }
    area.appendChild(cobr);
    alvo.appendChild(area);
  }

  function escolherPlano(alvo, dados, plano) {
    var corpo = { plano: plano, ciclo: cicloEscolhido };

    /*
     * A forma da implantacao so e perguntada enquanto ela nao foi cobrada.
     * Depois disso a pergunta nao tem resposta util: a cobranca ja existe e
     * nao e a troca de plano que vai refaze-la.
     */
    if (!dados.implantacao.cobrada) {
      var a = dados.implantacao.avista;
      var pc = dados.implantacao.parcelado;
      var avista = confirm(
        'Implantação, cobrada uma vez só.\n\n'
        + 'OK para ' + dinheiro(a.total) + ' à vista (economia de ' + dinheiro(a.economia) + ').\n'
        + 'Cancelar para ' + pc.parcelas + 'x de ' + dinheiro(pc.valorParcela) + ' sem juros, total '
        + dinheiro(pc.total) + '.',
      );
      corpo.implantacao = avista ? 'avista' : 'parcelado';
    }

    if (dados.cobrancaAutomatica && !(dados.assinatura && dados.assinatura.origem === 'asaas')) {
      var doc = prompt('CPF ou CNPJ para a cobrança:');
      if (!doc) return;
      corpo.documento = doc;
    }
    api('/assinatura', { method: 'POST', corpo: corpo })
      .then(function () { return api('/financeiro'); })
      .then(function (novos) { desenharFinanceiro(alvo, novos); })
      .catch(function (e) {
        // Mesma razao do formulario de conexao: a recusa por regra de negocio
        // vem com o caminho da saida, e so a primeira frase nao basta.
        alert(e.dados && e.dados.explicacao ? e.message + '\n\n' + e.dados.explicacao : e.message);
      });
  }

  // ----------------------------------------------------------------- admin ---

  /**
   * A senha sorteada aparece uma vez, aqui, e nao volta.
   *
   * Em modal e nao numa linha da tabela de proposito: e a unica chance de
   * copiar, e uma tabela que rola leva isso para fora da tela sem aviso.
   */
  function mostrarSenhaNova(r) {
    var existente = document.querySelector('.sobreposicao');
    if (existente) existente.remove();
    var fundo = el('div', null, 'sobreposicao');
    var modal = el('div', null, 'modal');
    var cab = el('div', null, 'modal-cab');
    cab.appendChild(el('strong', 'Senha nova de ' + r.conta.nome));
    var fechar = el('button', '×', 'icone');
    fechar.type = 'button'; fechar.setAttribute('aria-label', 'Fechar');
    fechar.addEventListener('click', function () { fundo.remove(); });
    cab.appendChild(fechar);
    modal.appendChild(cab);
    modal.appendChild(el('p', 'Mande estes dados ao cliente. A senha antiga parou de valer e quem estava logado nessa conta caiu.', 'legenda'));
    modal.appendChild(blocoDeCodigo(
      'Acesso ao Captapp\n\n'
      + 'Endereço: ' + location.origin + '\n'
      + 'E-mail: ' + r.conta.email + '\n'
      + 'Senha: ' + r.senhaNova + '\n\n'
      + 'Troque a senha no primeiro acesso, em Configurações.',
    ));
    modal.appendChild(el('p', 'Ela aparece uma vez só: não fica guardada em texto em lugar nenhum. Se fechar sem copiar, sorteie outra.', 'hora'));
    fundo.appendChild(modal);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fundo.remove(); });
    document.body.appendChild(fundo);
  }

  /**
   * Criar conta de cliente com o teste rodando.
   *
   * E para a venda assistida: você fecha no WhatsApp e entrega o acesso na
   * hora, em vez de mandar a pessoa se cadastrar sozinha. A senha é sorteada
   * pelo servidor e aparece uma vez só, aqui, para você copiar e mandar.
   */
  /*
   * Abrir a cobranca do Atende Ai de um cliente.
   *
   * Fica num cartao proprio, e nao num botao na linha da conta, porque a
   * linha ja carrega modulo, faixa e numero e nao cabe mais nada sem virar
   * armadilha de clique. Aqui o operador escolhe a conta, a faixa, o ciclo e
   * a ativacao, ve o valor antes e confirma.
   */
  /*
   * Por que um numero nao esta atendendo.
   *
   * A pergunta "mandei mensagem de teste e nao aconteceu nada" tem quatro
   * respostas possiveis, e todas moravam no banco: numero nao confirmado,
   * modulo desligado, base vazia, ou o agente nunca tendo chamado a gente.
   * Aqui o operador digita o numero e ve o que o agente veria.
   */
  /*
   * Conectar o WhatsApp de uma conta.
   *
   * O que entra aqui e o token que fala em nome da loja na Meta. Por isso a
   * tela e do operador e nao do lojista, e por isso o campo nunca mostra o
   * que ja esta guardado: ele diz que existe, e so.
   */
  function cartaoConectarWhatsapp(contas, aoConectar) {
    var cartao = el('div', null, 'cartao');
    cartao.appendChild(el('div', 'Conectar o WhatsApp de uma conta', 'rotulo'));
    cartao.appendChild(el('p', 'O phone number id e o token vêm do app da Meta. O token fica cifrado e nunca mais aparece aqui.', 'legenda'));

    var form = el('form', null, 'form-config');

    var rotConta = el('label', 'Conta');
    var conta = el('select');
    contas.filter(function (c) { return c.modulo_atendimento; }).forEach(function (c) {
      var op = el('option', c.nome + (c.whatsapp_phone_id ? ' (já conectada)' : ''));
      op.value = c.id;
      conta.appendChild(op);
    });
    rotConta.appendChild(conta);
    form.appendChild(rotConta);

    var rotId = el('label', 'Phone number id');
    var phoneId = el('input');
    phoneId.type = 'text';
    phoneId.placeholder = 'Só números, do painel da Meta';
    rotId.appendChild(phoneId);
    form.appendChild(rotId);

    var rotNumero = el('label', 'WhatsApp da loja, com DDD');
    var numero = el('input');
    numero.type = 'tel';
    numero.placeholder = 'O mesmo número desse phone id';
    rotNumero.appendChild(numero);
    form.appendChild(rotNumero);

    var rotToken = el('label', 'Token da Meta');
    var token = el('input');
    token.type = 'password';
    token.autocomplete = 'off';
    token.placeholder = 'Deixe em branco para manter o que já está guardado';
    rotToken.appendChild(token);
    form.appendChild(rotToken);

    var erro = el('p', null, 'erro'); erro.hidden = true; form.appendChild(erro);
    var pronto = el('p', null, 'ok'); pronto.hidden = true; form.appendChild(pronto);

    var acoes = el('div', null, 'acoes');
    var salvar = el('button', 'Conectar');
    salvar.type = 'submit';
    acoes.appendChild(salvar);
    form.appendChild(acoes);

    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      erro.hidden = true; pronto.hidden = true;
      salvar.disabled = true;
      api('/admin/contas/' + conta.value + '/whatsapp', {
        method: 'POST',
        corpo: { phoneId: phoneId.value, token: token.value, numero: numero.value },
      })
        .then(function (r) {
          pronto.textContent = r.temToken
            ? 'Conectado. As mensagens desse número já caem nesta conta.'
            : 'Phone id salvo, mas ainda falta o token: sem ele o agente lê e não responde.';
          pronto.hidden = false;
          // O token sai da tela assim que vai para o servidor.
          token.value = '';
          if (aoConectar) aoConectar();
        })
        .catch(function (e) {
          erro.textContent = e.dados && e.dados.explicacao ? e.dados.explicacao : e.message;
          erro.hidden = false;
        })
        .then(function () { salvar.disabled = false; });
    });

    cartao.appendChild(form);
    return cartao;
  }

  function cartaoDiagnostico() {
    var cartao = el('div', null, 'cartao');
    cartao.appendChild(el('div', 'Por que um número não está atendendo', 'rotulo'));
    cartao.appendChild(el('p', 'Digite o WhatsApp da loja e eu mostro exatamente o que o agente recebe quando uma mensagem chega nesse número.', 'legenda'));

    var linha = el('div', null, 'passo-linha');
    var campo = el('input');
    campo.type = 'tel';
    campo.placeholder = 'WhatsApp com DDD';
    var botao = el('button', 'Conferir', 'secundario');
    botao.type = 'button';
    linha.appendChild(campo);
    linha.appendChild(botao);
    cartao.appendChild(linha);

    var saida = el('div');
    cartao.appendChild(saida);

    function conferir() {
      if (!campo.value.trim()) return;
      botao.disabled = true;
      saida.textContent = '';
      api('/admin/diagnostico?numero=' + encodeURIComponent(campo.value))
        .then(function (d) {
          var caixa = el('div', null, 'diagnostico' + (d.achou && d.basePronta && d.modulo && !d.pausado ? ' bom' : ''));
          caixa.appendChild(el('div', d.diagnostico, 'rotulo'));

          var itens = [];
          itens.push(['Número', d.numero]);
          itens.push(['Conta', d.achou ? d.conta.nome : (d.solicitado ? d.solicitado.nome + ' (só informado, falta confirmar)' : 'nenhuma')]);
          if (d.achou) {
            itens.push(['Módulo', d.modulo ? 'ligado' : 'desligado']);
            itens.push(['Pausado', d.pausado ? 'sim' : 'não']);
            itens.push(['Base', d.camposCheios + ' campo(s), ' + (d.basePronta ? 'pronta' : 'incompleta')]);
            itens.push(['WhatsApp conectado', d.whatsapp ? 'sim' : 'FALTA phone id ou token']);
            itens.push(['Webhook da Meta no servidor', d.webhook ? 'configurado' : 'FALTA META_APP_SECRET']);
            itens.push(['Conversas registradas', String(d.conversas)]);
            itens.push(['Última fala do agente', d.ultimaFala ? quando(d.ultimaFala) : 'nunca']);
            itens.push(['Última contagem de mensagens', d.ultimoConsumo ? quando(d.ultimoConsumo) : 'nunca']);
          }
          itens.push(['CHAVE_SERVICO no servidor', d.chaveServico ? 'configurada' : 'FALTANDO']);

          caixa.appendChild(tabela(['O quê', 'Como está'], itens.map(function (par) {
            return { celulas: [par[0], par[1]] };
          })));
          saida.appendChild(caixa);
        })
        .catch(function (e) {
          saida.appendChild(el('p', e.message, 'erro'));
        })
        .then(function () { botao.disabled = false; });
    }

    botao.addEventListener('click', conferir);
    campo.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); conferir(); }
    });
    return cartao;
  }

  function cartaoCobrancaAtendeAi(contas, faixas, ativacoes, aoAbrir) {
    var cartao = el('div', null, 'cartao');
    cartao.appendChild(el('div', 'Abrir cobrança do Atende Aí', 'rotulo'));
    cartao.appendChild(el('p', 'Cria o cliente no Asaas, abre a assinatura da faixa e lança a ativação. A ativação só é cobrada uma vez por conta.', 'legenda'));

    var form = el('form', null, 'form-config');

    var rotConta = el('label', 'Conta');
    var conta = el('select');
    contas.filter(function (c) { return c.modulo_atendimento; }).forEach(function (c) {
      var op = el('option', c.nome + ' (' + c.email + ')');
      op.value = c.id;
      conta.appendChild(op);
    });
    rotConta.appendChild(conta);
    form.appendChild(rotConta);

    var rotFaixa = el('label', 'Faixa');
    var faixa = el('select');
    Object.keys(faixas).forEach(function (id) {
      var op = el('option', faixas[id].nome + ' · ' + dinheiro(faixas[id].mensal) + '/mês · '
        + faixas[id].mensagens.toLocaleString('pt-BR') + ' mensagens');
      op.value = id;
      faixa.appendChild(op);
    });
    rotFaixa.appendChild(faixa);
    form.appendChild(rotFaixa);

    var rotCiclo = el('label', 'Ciclo');
    var ciclo = el('select');
    [['mensal', 'Mensal'], ['anual', 'Anual, com 20% de desconto']].forEach(function (par) {
      var op = el('option', par[1]);
      op.value = par[0];
      ciclo.appendChild(op);
    });
    rotCiclo.appendChild(ciclo);
    form.appendChild(rotCiclo);

    var rotAtiv = el('label', 'Ativação');
    var ativacao = el('select');
    [
      ['simples', (ativacoes.simples || {}).nome + ' · ' + dinheiro((ativacoes.simples || {}).valor)],
      ['acompanhada', (ativacoes.acompanhada || {}).nome + ' · ' + dinheiro((ativacoes.acompanhada || {}).valor)],
      ['nenhuma', 'Sem ativação'],
    ].forEach(function (par) {
      var op = el('option', par[1]);
      op.value = par[0];
      ativacao.appendChild(op);
    });
    rotAtiv.appendChild(ativacao);
    form.appendChild(rotAtiv);

    var rotDoc = el('label', 'CPF ou CNPJ, se a conta ainda não tem');
    var doc = el('input');
    doc.type = 'text';
    doc.placeholder = 'Só números';
    rotDoc.appendChild(doc);
    form.appendChild(rotDoc);

    var erro = el('p', null, 'erro'); erro.hidden = true; form.appendChild(erro);
    var pronto = el('p', null, 'ok'); pronto.hidden = true; form.appendChild(pronto);

    var acoes = el('div', null, 'acoes');
    var abrir = el('button', 'Abrir cobrança');
    abrir.type = 'submit';
    acoes.appendChild(abrir);
    form.appendChild(acoes);

    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      erro.hidden = true; pronto.hidden = true;
      var nome = conta.options[conta.selectedIndex].textContent;
      var aviso = 'Abrir cobrança para ' + nome + '?\n\n'
        + faixas[faixa.value].nome + ', ' + ciclo.value
        + (ativacao.value === 'nenhuma' ? ', sem ativação'
          : ', com ' + dinheiro(ativacoes[ativacao.value].valor) + ' de ativação')
        + '.\n\nIsso cria cobrança de verdade no Asaas.';
      if (!confirm(aviso)) return;
      abrir.disabled = true;
      api('/admin/contas/' + conta.value + '/cobranca', {
        method: 'POST',
        corpo: {
          faixa: faixa.value, ciclo: ciclo.value,
          ativacao: ativacao.value, documento: doc.value,
        },
      })
        .then(function (r) {
          pronto.textContent = 'Cobrança aberta: ' + faixas[r.faixa].nome + ' ' + r.ciclo
            + (r.ativacao ? ', com ativação de ' + dinheiro(r.ativacao.valor)
              + ' vencendo em ' + r.ativacao.venceEm : ', sem nova ativação');
          pronto.hidden = false;
          doc.value = '';
          if (aoAbrir) aoAbrir();
        })
        .catch(function (e) {
          erro.textContent = e.dados && e.dados.explicacao
            ? e.dados.explicacao + ' (' + e.message + ')' : e.message;
          erro.hidden = false;
        })
        .then(function () { abrir.disabled = false; });
    });

    cartao.appendChild(form);
    return cartao;
  }

  function cartaoNovaConta(aoCriar) {
    var cartao = el('div', null, 'cartao');
    cartao.appendChild(el('div', 'Criar conta de cliente', 'rotulo'));
    cartao.appendChild(el('p', 'A conta nasce com o teste rodando. Enquanto ele durar, o cliente usa tudo; depois o chat sai do ar na loja e o painel continua.', 'legenda'));

    var form = el('form');
    form.className = 'form-config';

    var rotuloNome = el('label', 'Nome da loja ou do cliente');
    var campoNome = el('input');
    campoNome.name = 'nome'; campoNome.required = true; campoNome.maxLength = 120;
    rotuloNome.appendChild(campoNome);
    form.appendChild(rotuloNome);

    var rotuloEmail = el('label', 'E-mail de acesso');
    var campoEmail = el('input');
    campoEmail.name = 'email'; campoEmail.type = 'email'; campoEmail.required = true;
    rotuloEmail.appendChild(campoEmail);
    form.appendChild(rotuloEmail);

    var rotuloDias = el('label', 'Dias de teste');
    var campoDias = el('input');
    campoDias.name = 'dias'; campoDias.type = 'number'; campoDias.min = 1; campoDias.max = 90;
    campoDias.value = 7;
    rotuloDias.appendChild(campoDias);
    form.appendChild(rotuloDias);

    var erro = el('p', null, 'erro'); erro.hidden = true;
    form.appendChild(erro);

    var acoes = el('div', null, 'acoes');
    var enviar = el('button', 'Criar conta'); enviar.type = 'submit';
    acoes.appendChild(enviar);
    form.appendChild(acoes);

    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      erro.hidden = true;
      enviar.disabled = true;
      var dados = new FormData(form);
      api('/admin/contas', {
        method: 'POST',
        corpo: {
          nome: String(dados.get('nome')).trim(),
          email: String(dados.get('email')).trim(),
          dias: Number(dados.get('dias')) || 7,
        },
      }).then(function (r) {
        form.remove();
        var pronto = el('div', null, 'instrucoes');
        pronto.appendChild(el('div', 'Conta criada. Mande estes dados ao cliente.', 'rotulo'));
        pronto.appendChild(blocoDeCodigo(
          'Acesso ao Captapp\n\n'
          + 'Endereço: ' + location.origin + '\n'
          + 'E-mail: ' + r.conta.email + '\n'
          + 'Senha: ' + r.senhaInicial + '\n\n'
          + 'Troque a senha no primeiro acesso, em Configurações.\n'
          + 'Seu teste vale ' + r.dias + ' dias.',
        ));
        pronto.appendChild(el('p', 'A senha aparece uma vez só: ela não fica guardada em texto em lugar nenhum. Se perder, use "Esqueci minha senha".', 'hora'));
        var voltar = el('button', 'Criar outra', 'secundario');
        voltar.type = 'button';
        voltar.addEventListener('click', function () { aoCriar(); });
        pronto.appendChild(voltar);
        cartao.appendChild(pronto);
      }).catch(function (e) {
        erro.textContent = e.dados && e.dados.explicacao ? e.message + ' ' + e.dados.explicacao : e.message;
        erro.hidden = false;
        enviar.disabled = false;
      });
    });

    cartao.appendChild(form);
    return cartao;
  }

  /** Visao do operador: o Captapp inteiro, nao uma conta. */
  function verAdmin() {
    var alvo = pintar('Admin', 'O Captapp inteiro: assinantes, receita, inadimplência e o que precisa de atenção.');
    alvo.appendChild(cartaoNovaConta(function () { verAdmin(); }));
    Promise.all([api('/admin/resumo'), api('/admin/contas')]).then(function (r) {
      var resumo = r[0];
      var contas = r[1];
      var assinantes = resumo.assinantes.reduce(function (t, a) { return t + a.n; }, 0);

      var grade = el('div', null, 'grade-num');
      grade.appendChild(cartaoNumero({
        rotulo: 'Assinantes', valor: String(assinantes), nomeIcone: 'plano', tom: 'acento',
        detalhe: resumo.contas + ' contas no total',
        rodape: { texto: (resumo.contas - assinantes) + ' sem plano ativo' },
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Receita mensal recorrente', valor: dinheiro(resumo.mrr), nomeIcone: 'dinheiro', tom: 'bom',
        detalhe: 'Capta, anual contado por doze avos',
        // O Atende Ai aparece ao lado, e nao somado: ele ainda nao passa pelo
        // Asaas, entao somar daria um total com cara de faturado.
        rodape: { texto: dinheiro(resumo.mrrAtendimento || 0) + ' em Atende Aí, fora da cobrança automática' },
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Inadimplentes', valor: String(resumo.inadimplentes), nomeIcone: 'alerta',
        tom: resumo.inadimplentes ? 'ruim' : 'bom',
        detalhe: 'com fatura vencida em aberto',
        rodape: { texto: 'Dia 7 corta rastreamento, dia 10 o chat' },
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Leads hoje', valor: String(resumo.leadsHoje), nomeIcone: 'leads',
        detalhe: resumo.leadsMes + ' no mês, todas as lojas',
        rodape: { texto: resumo.cuponsFalhosHoje + ' cupons falharam hoje' },
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Alertas abertos', valor: String(resumo.alertasAbertos), nomeIcone: 'alerta',
        tom: resumo.alertasAbertos ? '' : 'bom',
        detalhe: 'cupom falho, webhook, cota',
        rodape: { texto: 'Um por conta, na tela Resumo de cada uma' },
      }));
      alvo.appendChild(grade);

      alvo.appendChild(cartaoConectarWhatsapp(contas, function () { verAdmin(); }));
      alvo.appendChild(cartaoDiagnostico());

      if (resumo.faixas && resumo.ativacoes) {
        alvo.appendChild(cartaoCobrancaAtendeAi(contas, resumo.faixas, resumo.ativacoes, function () { verAdmin(); }));
      }

      var porFaixa = el('div', null, 'cartao');
      porFaixa.appendChild(el('div', 'Atende Aí por faixa', 'rotulo'));
      var contasAtende = (resumo.atendimento || []).reduce(function (t, f) { return t + f.n; }, 0);
      if (contasAtende) {
        porFaixa.appendChild(tabela(['Faixa', 'Mensalidade', 'Mensagens no plano', 'Contas'],
          Object.keys(resumo.faixas || {}).map(function (id) {
            var linha = (resumo.atendimento || []).filter(function (f) { return f.faixa === id; })
              .reduce(function (t, f) { return t + f.n; }, 0);
            return { celulas: [
              resumo.faixas[id].nome,
              dinheiro(resumo.faixas[id].mensal) + '/mês',
              resumo.faixas[id].mensagens.toLocaleString('pt-BR'),
              linha,
            ] };
          })));
      } else {
        porFaixa.appendChild(el('p', 'Nenhuma conta com o Atende Aí ligado ainda.', 'vazio'));
      }
      alvo.appendChild(porFaixa);

      var porPlano = el('div', null, 'cartao');
      porPlano.appendChild(el('div', 'Capta: assinantes por plano', 'rotulo'));
      var linhasPlano = Object.keys(resumo.planos).map(function (id) {
        var mensal = resumo.assinantes.filter(function (a) { return a.plano === id && a.ciclo === 'mensal'; }).reduce(function (t, a) { return t + a.n; }, 0);
        var anual = resumo.assinantes.filter(function (a) { return a.plano === id && a.ciclo === 'anual'; }).reduce(function (t, a) { return t + a.n; }, 0);
        return { celulas: [resumo.planos[id].nome, dinheiro(resumo.planos[id].mensal) + '/mês', mensal, anual, mensal + anual] };
      });
      porPlano.appendChild(tabela(['Plano', 'Mensalidade', 'Mensal', 'Anual', 'Total'], linhasPlano));
      alvo.appendChild(porPlano);

      var lojas = el('div', null, 'cartao');
      lojas.appendChild(el('div', 'Lojas conectadas por plataforma', 'rotulo'));
      if (resumo.conexoes.length) {
        lojas.appendChild(tabela(['Plataforma', 'Instalação', 'Lojas'], resumo.conexoes.map(function (c) {
          return { celulas: [c.plataforma, selo(c.modo_instalacao, c.modo_instalacao), c.n] };
        })));
      } else {
        lojas.appendChild(el('p', 'Nenhuma loja conectada ainda.', 'vazio'));
      }
      alvo.appendChild(lojas);

      var lista = el('div', null, 'cartao');
      lista.appendChild(el('div', 'Contas', 'rotulo'));
      lista.appendChild(tabela(
        ['Conta', 'Plano', 'Leads no mês', 'Total', 'Último lead', 'Lojas', 'Atraso', 'Atende Aí', ''],
        contas.map(function (c) {
          var entrar = el('button', 'Entrar como', 'secundario');
          entrar.type = 'button';
          entrar.style.padding = '6px 10px';
          entrar.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!confirm('Entrar na conta ' + c.nome + ' como operador? Fica registrado.')) return;
            api('/admin/contas/' + c.id + '/entrar', { method: 'POST' }).then(function () {
              cacheLeads = null; construtor = null;
              location.hash = '#/resumo';
              iniciar();
            });
          });

          var senha = el('button', 'Nova senha', 'secundario');
          senha.type = 'button';
          senha.style.padding = '6px 10px';
          senha.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!confirm('Sortear uma senha nova para ' + c.nome + '?\n\nA senha de agora para de valer e quem estiver logado nessa conta cai.')) return;
            senha.disabled = true;
            api('/admin/contas/' + c.id + '/senha', { method: 'POST' })
              .then(function (r) { mostrarSenhaNova(r); })
              .catch(function (erro) { alert(erro.message); })
              .then(function () { senha.disabled = false; });
          });

          // Modulo vendido a parte. O botao mostra o estado e troca ele, em
          // vez de abrir o banco para rodar um update na mao.
          var modulo = el('button', c.modulo_atendimento ? 'Ligado' : 'Desligado', 'secundario');
          modulo.type = 'button';
          modulo.style.padding = '6px 10px';
          if (c.modulo_atendimento) modulo.style.borderColor = 'var(--acento)';
          modulo.addEventListener('click', function (e) {
            e.stopPropagation();
            var ligar = !c.modulo_atendimento;
            var aviso = ligar
              ? 'Ligar o Atende Aí para ' + c.nome + '?\n\nEle passa a ver a tela na hora.'
              : 'Desligar o Atende Aí de ' + c.nome + '?\n\nA tela some na hora. A base fica guardada.';
            if (!confirm(aviso)) return;
            modulo.disabled = true;
            api('/admin/contas/' + c.id + '/modulo', { method: 'POST', corpo: { ligado: ligar } })
              .then(function (r) {
                c.modulo_atendimento = r.atendimento;
                c.faixa_atendimento = r.faixa;
                modulo.textContent = r.atendimento ? 'Ligado' : 'Desligado';
                modulo.style.borderColor = r.atendimento ? 'var(--acento)' : '';
                faixa.hidden = !r.atendimento;
                numero.hidden = !r.atendimento;
                if (confirmar) confirmar.hidden = !r.atendimento;
                if (r.faixa) faixa.value = r.faixa;
              })
              .catch(function (erro) { alert(erro.message); })
              .then(function () { modulo.disabled = false; });
          });

          // A faixa so faz sentido com o modulo ligado, entao ela aparece
          // junto e some junto.
          var faixa = el('select');
          faixa.style.width = 'auto';
          faixa.style.margin = '0';
          faixa.style.padding = '5px 26px 5px 9px';
          faixa.style.fontSize = '12.5px';
          [['essencial', 'Essencial'], ['crescimento', 'Crescimento'], ['escala', 'Escala']]
            .forEach(function (par) {
              var op = el('option', par[1]);
              op.value = par[0];
              faixa.appendChild(op);
            });
          faixa.value = c.faixa_atendimento || 'essencial';
          faixa.hidden = !c.modulo_atendimento;
          faixa.addEventListener('click', function (e) { e.stopPropagation(); });
          faixa.addEventListener('change', function () {
            faixa.disabled = true;
            api('/admin/contas/' + c.id + '/modulo', {
              method: 'POST', corpo: { ligado: true, faixa: faixa.value },
            })
              .then(function (r) { c.faixa_atendimento = r.faixa; })
              .catch(function (erro) { alert(erro.message); faixa.value = c.faixa_atendimento; })
              .then(function () { faixa.disabled = false; });
          });

          var celulaModulo = el('div');
          celulaModulo.style.display = 'flex';
          celulaModulo.style.gap = '6px';
          celulaModulo.style.alignItems = 'center';
          celulaModulo.style.flexWrap = 'wrap';

          // O numero decide de quem e a conversa que chega, entao ele fica
          // aqui, junto da chave do modulo, e nao na tela do lojista.
          var numero = el('input');
          numero.type = 'text';
          numero.placeholder = 'WhatsApp, com DDD';
          numero.value = c.numero_atendimento || '';
          var pendente = Boolean(!c.numero_atendimento && c.numero_solicitado);
          if (pendente) {
            // O que o lojista informou aparece pronto para confirmar: a
            // ativacao e nossa, e digitar de novo e so chance de errar.
            numero.value = c.numero_solicitado;
            numero.style.borderColor = 'var(--atencao)';
            numero.title = 'O lojista informou este número. Confirme para ligar.';
          }
          numero.style.width = '150px';
          numero.style.margin = '0';
          numero.style.padding = '5px 9px';
          numero.style.fontSize = '12.5px';
          numero.hidden = !c.modulo_atendimento;
          numero.addEventListener('click', function (e) { e.stopPropagation(); });

          // O botao existe porque change so dispara quando o campo e editado:
          // o numero que ja veio preenchido pelo lojista ficaria para sempre
          // em ambar, com cara de salvo, sem nunca ter sido gravado.
          var confirmar = pendente ? el('button', 'Confirmar', 'secundario') : null;

          function gravarNumero() {
            numero.disabled = true;
            if (confirmar) confirmar.disabled = true;
            api('/admin/contas/' + c.id + '/numero', {
              method: 'POST', corpo: { numero: numero.value },
            })
              .then(function (r) {
                c.numero_atendimento = r.numero;
                numero.value = r.numero || '';
                numero.style.borderColor = '';
                numero.title = r.numero
                  ? 'Número ligado. As conversas dele chegam nesta conta.'
                  : '';
                if (confirmar) { confirmar.remove(); confirmar = null; }
              })
              .catch(function (erro) {
                alert(erro.dados && erro.dados.explicacao ? erro.dados.explicacao : erro.message);
                numero.value = c.numero_atendimento || (pendente ? c.numero_solicitado : '');
              })
              .then(function () {
                numero.disabled = false;
                if (confirmar) confirmar.disabled = false;
              });
          }

          numero.addEventListener('change', gravarNumero);

          if (confirmar) {
            confirmar.type = 'button';
            confirmar.style.padding = '6px 10px';
            confirmar.style.borderColor = 'var(--atencao)';
            confirmar.hidden = !c.modulo_atendimento;
            confirmar.addEventListener('click', function (e) {
              e.stopPropagation();
              gravarNumero();
            });
          }

          celulaModulo.appendChild(modulo);
          celulaModulo.appendChild(faixa);
          celulaModulo.appendChild(numero);
          if (confirmar) celulaModulo.appendChild(confirmar);

          var acoesConta = el('div');
          acoesConta.style.display = 'flex';
          acoesConta.style.gap = '6px';
          acoesConta.appendChild(entrar);
          acoesConta.appendChild(senha);
          var nome = el('div');
          nome.appendChild(el('strong', c.nome));
          nome.appendChild(el('div', c.email, 'hora'));
          return { celulas: [
            nome,
            c.plano ? selo(resumo.planos[c.plano].nome + (c.ciclo === 'anual' ? ' anual' : ''), 'criado') : selo('sem plano', 'pendente'),
            c.leads_mes, c.leads_total,
            c.ultimo_lead ? tempoRelativo(c.ultimo_lead) : 'nunca',
            c.conexoes,
            c.diasAtraso ? selo(c.diasAtraso + ' dias', 'falhou') : selo('em dia', 'criado'),
            celulaModulo,
            acoesConta,
          ] };
        }),
      ));
      alvo.appendChild(lista);
    }).catch(function (e) {
      alvo.appendChild(el('p', e.message === 'somente operador' ? 'Esta tela é só do operador do Captapp.' : e.message, 'vazio'));
    });
  }

  // ------------------------------------------------------------- navegacao ---

  // --------------------------------------------------------------- atendimento ---

  /*
   * A base de conhecimento do atendimento no WhatsApp.
   *
   * Quem responde o cliente final e um agente que roda fora do Capta; esta
   * tela e a fonte que ele le. Entao cada campo aqui vira resposta dada a um
   * cliente de verdade, e e por isso que a tela mostra quando foi a ultima
   * mudanca e quem fez: numa informacao errada, a primeira pergunta e "quem
   * mexeu nisso e quando".
   */
  var atendimento = null;

  /*
   * A tela de ativacao: dois passos, e nada alem deles.
   *
   * Quem acabou de assinar nao quer painel: quer o WhatsApp respondendo. A
   * tela anterior misturava conectar o numero, formulario de base, medidor
   * de consumo e historico de versoes, e a pessoa nao sabia por onde
   * comecar. Aqui so existem dois cartoes, e o segundo so abre depois do
   * primeiro.
   */
  function verComecar() {
    var alvo = pintar('Começar', 'Dois passos e o seu WhatsApp começa a atender.');
    var corpo = el('div');
    alvo.appendChild(corpo);
    corpo.appendChild(el('p', 'Carregando...', 'vazio'));

    api('/atendimento').then(function (dados) {
      atendimento = dados;
      desenharComecar(corpo);
    }).catch(function (e) {
      corpo.textContent = '';
      corpo.appendChild(el('p', e.message, 'vazio'));
    });
  }

  function desenharComecar(corpo) {
    corpo.textContent = '';
    var p = atendimento.prontidao || {};
    var passo1 = Boolean(p.numero || p.solicitado);
    var passo2 = Boolean(p.base);

    var passos = el('div', null, 'passos');
    passos.appendChild(passoUm(corpo, p, passo1));
    passos.appendChild(passoDois(corpo, passo1, passo2));
    corpo.appendChild(passos);

    // Terminou os dois: a tela diz para onde ir, em vez de ficar sendo a
    // primeira tela de uma conta que ja esta no ar.
    if (passo1 && passo2) {
      var fim = el('div', null, 'passo-fim');
      fim.appendChild(el('div', 'Pronto. A sua loja está ativada.', 'rotulo'));
      fim.appendChild(el('p', p.numero
        ? 'O agente está respondendo no ' + numeroBonito(p.numero) + '.'
        : 'Assim que terminarmos a verificação do número com a Meta, o agente começa a responder.', 'legenda'));
      var ir = el('button', 'Ir para o Assistente');
      ir.type = 'button';
      ir.addEventListener('click', function () { location.hash = '#/assistente'; });
      fim.appendChild(ir);
      corpo.appendChild(fim);
    }
  }

  var MINIMO_DA_BASE = 4;

  function preenchidos() {
    var base = atendimento.base || {};
    var campos = atendimento.campos || {};
    return Object.keys(campos).filter(function (nome) {
      var v = base[nome];
      if (Array.isArray(v)) return v.length > 0;
      return v !== '' && v !== null && v !== undefined;
    });
  }

  function oQueJaSei() {
    var campos = atendimento.campos || {};
    var tem = preenchidos();
    var caixa = el('div', null, 'ja-sei');
    if (!tem.length) {
      caixa.appendChild(el('span', 'Ainda não gravei nada da sua loja. O que o assistente propuser só entra depois que você confirmar.', 'hora'));
      return caixa;
    }
    caixa.appendChild(el('span', 'Já gravei: ' + tem.map(function (n) {
      return campos[n] ? campos[n].rotulo : n;
    }).join(', ') + '.', 'hora'));
    var faltam = MINIMO_DA_BASE - tem.length;
    caixa.appendChild(el('span', faltam > 0
      ? (faltam === 1
        ? 'Falta mais uma informação para o atendimento começar.'
        : 'Faltam mais ' + faltam + ' informações para o atendimento começar.')
      : 'Já dá para começar.', 'hora'));
    return caixa;
  }

  function cabecaDoPasso(numero, titulo, feito, travado) {
    var cab = el('div', null, 'passo-cab');
    cab.appendChild(el('span', feito ? '✓' : String(numero), 'passo-n' + (feito ? ' feito' : '')));
    var textos = el('div');
    textos.appendChild(el('div', 'Passo ' + numero, 'passo-rot'));
    textos.appendChild(el('div', titulo, 'passo-tit'));
    cab.appendChild(textos);
    if (travado) cab.appendChild(el('span', 'Depois do passo 1', 'passo-selo'));
    return cab;
  }

  /*
   * Passo 1: o numero.
   *
   * A barra enche de verdade enquanto a chamada acontece e para no estado
   * real. Ela nao vai ate "conectado" sozinha porque conectado quem decide e
   * a verificacao com a Meta, do nosso lado: barra que completa aqui faria o
   * lojista mandar mensagem para um numero que ainda nao atende e achar que
   * o produto esta quebrado.
   */
  function passoUm(corpo, p, feito) {
    var cartao = el('div', null, 'passo' + (feito ? ' feito' : ''));
    cartao.appendChild(cabecaDoPasso(1, 'Conecte o seu WhatsApp', feito, false));

    if (p.numero) {
      cartao.appendChild(el('p', 'Conectado: ' + numeroBonito(p.numero)
        + '. É esse número que atende os seus clientes.', 'legenda'));
      return cartao;
    }

    if (p.solicitado) {
      cartao.appendChild(el('p', 'Recebemos o ' + numeroBonito(p.solicitado)
        + '. Estamos fazendo a verificação com a Meta e avisamos quando ele estiver atendendo.'
        + ' Você já pode seguir para o passo 2.', 'legenda'));
      var trocar = el('button', 'Informar outro número', 'secundario');
      trocar.type = 'button';
      trocar.addEventListener('click', function () {
        atendimento.prontidao.solicitado = null;
        desenharComecar(corpo);
      });
      cartao.appendChild(trocar);
      return cartao;
    }

    cartao.appendChild(el('p', 'É o número que vai responder os seus clientes. Informe aqui e a gente cuida da verificação com a Meta.', 'legenda'));
    var linha = el('div', null, 'passo-linha');
    var campo = el('input');
    campo.type = 'tel';
    campo.placeholder = 'WhatsApp com DDD, ex: 41 99999-8888';
    campo.autocomplete = 'tel';
    if (p.sugerido) campo.value = numeroBonito(p.sugerido);
    var botao = el('button', 'Conectar');
    botao.type = 'button';
    linha.appendChild(campo);
    linha.appendChild(botao);
    cartao.appendChild(linha);

    var erro = el('p', null, 'erro');
    erro.hidden = true;
    cartao.appendChild(erro);

    var barra = el('div', null, 'passo-barra');
    var dentro = el('span');
    barra.appendChild(dentro);
    barra.hidden = true;
    cartao.appendChild(barra);

    function enviar() {
      erro.hidden = true;
      botao.disabled = true;
      campo.disabled = true;
      barra.hidden = false;
      // Enche ate 90% enquanto espera: o resto so depois da resposta, para a
      // barra nunca dizer "pronto" antes de o servidor ter gravado.
      dentro.style.width = '12%';
      var passo = setTimeout(function () { dentro.style.width = '90%'; }, 60);
      api('/atendimento/numero', { method: 'POST', corpo: { numero: campo.value } })
        .then(function (r) {
          clearTimeout(passo);
          dentro.style.width = '100%';
          atendimento.prontidao.solicitado = r.solicitado;
          setTimeout(function () { desenharComecar(corpo); }, 450);
        })
        .catch(function (e) {
          clearTimeout(passo);
          barra.hidden = true;
          dentro.style.width = '0%';
          botao.disabled = false;
          campo.disabled = false;
          erro.textContent = e.dados && e.dados.explicacao ? e.dados.explicacao : e.message;
          erro.hidden = false;
          campo.focus();
        });
    }

    botao.addEventListener('click', enviar);
    campo.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); enviar(); }
    });
    return cartao;
  }

  /*
   * Passo 2: o assistente pergunta.
   *
   * Nao e formulario. O lojista conta a loja dele escrevendo, e o assistente
   * propoe a base no fim, com a confirmacao de sempre. Formulario de onze
   * campos na segunda tela de uso e onde a ativacao morre.
   */
  function passoDois(corpo, liberado, feito) {
    var cartao = el('div', null, 'passo' + (feito ? ' feito' : '') + (liberado ? '' : ' travado'));
    cartao.appendChild(cabecaDoPasso(2, 'Conte como a sua loja funciona', feito, !liberado));

    if (!liberado) {
      cartao.appendChild(el('p', 'Assim que o número estiver com a gente, o assistente começa a te perguntar sobre a loja.', 'legenda'));
      return cartao;
    }

    if (feito) {
      cartao.appendChild(el('p', 'O assistente já tem o básico da sua loja. Daqui para a frente é só ir ajustando por aqui mesmo.', 'legenda'));
    } else {
      cartao.appendChild(el('p', 'Responda o que o assistente perguntar. No fim ele mostra tudo o que entendeu e você confirma antes de gravar.', 'legenda'));
      // Dizer o que ja entrou, e quanto falta, em vez de so repetir que
      // falta: lojista que respondeu e confirmou e continua vendo "falta
      // contar como a loja funciona" acha que a tela esta quebrada.
      cartao.appendChild(oQueJaSei());
    }

    cartao.appendChild(chatDoAssistente(corpo, true, function () { verComecar(); }));
    return cartao;
  }

  /*
   * Os atendimentos que chegaram pelo WhatsApp.
   *
   * Sem esta tela o lojista nao tem como saber quem a IA ja atendeu, quem
   * ficou pela metade e onde ele precisa entrar: a conversa acontece no
   * celular dele e some na lista do WhatsApp junto com todo o resto.
   */
  function verAtendimentos() {
    var alvo = pintar('Atendimentos', 'As conversas que o agente teve no seu WhatsApp.');
    var corpo = el('div');
    alvo.appendChild(corpo);
    corpo.appendChild(el('p', 'Carregando...', 'vazio'));

    api('/atendimentos').then(function (dados) {
      corpo.textContent = '';
      var c = dados.contagem || {};

      var grade = el('div', null, 'grade-num');
      grade.appendChild(cartaoNumero({
        rotulo: 'Conversas hoje', valor: String(c.hoje || 0), nomeIcone: 'chat', tom: 'acento',
        detalhe: (c.total || 0) + ' no total',
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Com você', valor: String(c.comigo || 0), nomeIcone: 'alerta',
        tom: c.comigo ? 'ruim' : 'bom',
        detalhe: c.comigo ? 'o agente parou nessas' : 'nenhuma esperando você',
      }));
      corpo.appendChild(grade);

      if (!dados.atendimentos.length) {
        corpo.appendChild(el('p', 'Nenhuma conversa ainda. Assim que o seu número estiver atendendo, elas aparecem aqui.', 'vazio'));
        return;
      }

      var lista = el('div', null, 'conversas');
      dados.atendimentos.forEach(function (a) {
        lista.appendChild(cartaoDaConversa(a));
      });
      corpo.appendChild(lista);
    }).catch(function (e) {
      corpo.textContent = '';
      corpo.appendChild(el('p', e.message, 'vazio'));
    });
  }

  var SELO_ATENDIMENTO = {
    ia: ['IA respondendo', 'criado'],
    humano: ['Você assumiu', 'pendente'],
    fechado: ['Fechado', 'manual'],
  };

  function cartaoDaConversa(a) {
    var cartao = el('button', null, 'conversa');
    cartao.type = 'button';
    var topo = el('div', null, 'conversa-topo');
    topo.appendChild(el('strong', a.nome || numeroBonito(a.cliente)));
    var marca = SELO_ATENDIMENTO[a.estado] || SELO_ATENDIMENTO.ia;
    topo.appendChild(selo(marca[0], marca[1]));
    cartao.appendChild(topo);
    cartao.appendChild(el('p', a.ultima_fala || '', 'conversa-fala'));
    var pe = el('div', null, 'conversa-pe');
    pe.appendChild(el('span', quando(a.ultima_em), 'hora'));
    pe.appendChild(el('span', a.falas + (a.falas === 1 ? ' mensagem' : ' mensagens'), 'hora'));
    cartao.appendChild(pe);
    cartao.addEventListener('click', function () { location.hash = '#/conversa/' + a.id; });
    return cartao;
  }

  /*
   * Uma conversa aberta.
   *
   * Assumir nao manda mensagem: o lojista responde pelo WhatsApp dele, como
   * ja faria. O que este botao faz e calar o agente naquela conversa, e so
   * nela, em vez de parar a loja inteira para atender um cliente.
   */
  function verConversa(id) {
    var alvo = pintar('Conversa', 'O que o agente falou com esse cliente.');
    var corpo = el('div');
    alvo.appendChild(corpo);
    corpo.appendChild(el('p', 'Carregando...', 'vazio'));

    api('/atendimentos/' + id).then(function (a) {
      corpo.textContent = '';

      var voltar = el('button', 'Voltar para os atendimentos', 'secundario');
      voltar.type = 'button';
      voltar.addEventListener('click', function () { location.hash = '#/atendimentos'; });
      corpo.appendChild(voltar);

      var cabeca = el('div', null, 'cartao conversa-cab');
      var linha = el('div', null, 'conversa-topo');
      linha.appendChild(el('strong', a.nome || numeroBonito(a.cliente)));
      var marca = SELO_ATENDIMENTO[a.estado] || SELO_ATENDIMENTO.ia;
      linha.appendChild(selo(marca[0], marca[1]));
      cabeca.appendChild(linha);
      cabeca.appendChild(el('p', a.nome ? numeroBonito(a.cliente) : '', 'hora'));

      var acoes = el('div', null, 'conversa-acoes');
      if (a.estado === 'humano') {
        acoes.appendChild(el('p', 'O agente não responde este cliente enquanto estiver com você.', 'legenda'));
        acoes.appendChild(botaoDeEstado(a, 'ia', 'Devolver para a IA', ''));
      } else {
        acoes.appendChild(botaoDeEstado(a, 'humano', 'Assumir este atendimento', ''));
        acoes.appendChild(botaoDeEstado(a, 'fechado', 'Marcar como fechado', 'secundario'));
      }
      cabeca.appendChild(acoes);
      corpo.appendChild(cabeca);

      var falas = el('div', null, 'falas');
      if (!a.falas.length && !(a.fila || []).length) {
        falas.appendChild(el('p', 'Sem mensagens guardadas nesta conversa.', 'vazio'));
      }
      a.falas.forEach(function (f) {
        var caixa = el('div', null, 'fala ' + f.direcao);
        caixa.appendChild(el('div', f.texto, 'fala-texto'));
        caixa.appendChild(el('div', (f.direcao === 'cliente' ? 'Cliente'
          : f.direcao === 'humano' ? 'Você' : 'Agente') + ' · ' + quando(f.criado_em), 'hora'));
        falas.appendChild(caixa);
      });
      // O que esta na fila ainda nao chegou no cliente. Fica marcado assim
      // ate o agente confirmar a entrega.
      (a.fila || []).forEach(function (f) {
        var caixa = el('div', null, 'fala humano aguardando');
        caixa.appendChild(el('div', f.texto, 'fala-texto'));
        caixa.appendChild(el('div', 'Você · aguardando envio', 'hora'));
        falas.appendChild(caixa);
      });
      corpo.appendChild(falas);

      corpo.appendChild(responderNaConversa(a));
    }).catch(function (e) {
      corpo.textContent = '';
      corpo.appendChild(el('p', e.message === 'nao encontrado'
        ? 'Essa conversa não existe nesta conta.' : e.message, 'vazio'));
    });
  }

  /*
   * Escrever para o cliente de dentro do painel.
   *
   * Quem envia e o agente: isto enfileira. Por isso o botao diz "Enviar pelo
   * agente" e nao "Enviar", e a mensagem aparece como aguardando ate sair de
   * verdade. Se o agente nao estiver ligado, a fila acumula e o lojista ve
   * que nada saiu, em vez de achar que respondeu.
   */
  function responderNaConversa(a) {
    var caixa = el('div', null, 'cartao responder');
    caixa.appendChild(el('div', 'Responder este cliente', 'rotulo'));
    caixa.appendChild(el('p', 'A mensagem sai pelo WhatsApp da loja, pelo mesmo agente. Ao enviar, o atendimento passa para você.', 'legenda'));

    var linha = el('div', null, 'responder-linha');
    var campo = el('textarea');
    campo.placeholder = 'Escreva a resposta';
    campo.maxLength = 4000;
    var enviar = el('button', 'Enviar pelo agente');
    enviar.type = 'button';
    linha.appendChild(campo);
    linha.appendChild(enviar);
    caixa.appendChild(linha);

    var erro = el('p', null, 'erro');
    erro.hidden = true;
    caixa.appendChild(erro);

    enviar.addEventListener('click', function () {
      var texto = campo.value.trim();
      if (!texto) return;
      erro.hidden = true;
      enviar.disabled = true;
      api('/atendimentos/' + a.id + '/mensagem', { method: 'POST', corpo: { texto: texto } })
        .then(function () { verConversa(a.id); })
        .catch(function (e) {
          enviar.disabled = false;
          erro.textContent = e.dados && e.dados.explicacao ? e.dados.explicacao : e.message;
          erro.hidden = false;
        });
    });
    return caixa;
  }

  function botaoDeEstado(a, estado, rotulo, classe) {
    var b = el('button', rotulo, classe);
    b.type = 'button';
    b.addEventListener('click', function () {
      b.disabled = true;
      api('/atendimentos/' + a.id + '/estado', { method: 'POST', corpo: { estado: estado } })
        .then(function () { verConversa(a.id); })
        .catch(function (e) { b.disabled = false; alert(e.message); });
    });
    return b;
  }

  function verAtendimento() {
    var alvo = pintar('Atende Aí', 'A base que o Atende Aí usa para responder os seus clientes no WhatsApp.');
    var corpo = el('div');
    alvo.appendChild(corpo);
    corpo.appendChild(el('p', 'Carregando...', 'vazio'));

    api('/atendimento').then(function (dados) {
      atendimento = dados;
      desenharAtendimento(corpo);
    }).catch(function (e) {
      corpo.textContent = '';
      corpo.appendChild(el('p', e.message, 'vazio'));
    });
  }

  /*
   * A tela que e so a conversa.
   *
   * O formulario continua existindo, mas quem usa isto todo dia fala, nao
   * preenche campo: "o prazo do Nordeste mudou", "pare, eu assumo agora".
   * Por isso ela nao divide espaco com mais nada.
   */
  function verAssistente() {
    var alvo = pintar('Assistente', 'Diga o que mudou, mande parar o atendimento, ou cole o histórico de um dia para eu aprender com ele.');
    var corpo = el('div');
    alvo.appendChild(corpo);
    corpo.appendChild(el('p', 'Carregando...', 'vazio'));

    api('/atendimento').then(function (dados) {
      atendimento = dados;
      corpo.textContent = '';
      corpo.appendChild(chatDoAssistente(corpo, true));
    }).catch(function (e) {
      corpo.textContent = '';
      corpo.appendChild(el('p', e.message, 'vazio'));
    });
  }

  function desenharAtendimento(corpo) {
    corpo.textContent = '';
    corpo.appendChild(freioDeMao(corpo));
    if (!(atendimento.prontidao || {}).numero) {
      corpo.appendChild(conectarWhatsapp(function () { desenharAtendimento(corpo); }));
    }
    var falta = prontidao();
    if (falta) corpo.appendChild(falta);
    corpo.appendChild(consumoDoMes());
    corpo.appendChild(historicoDeVersoes(corpo));

    var colunas = el('div', null, 'atendimento');
    colunas.appendChild(formularioDaBase(corpo));
    colunas.appendChild(chatDoAssistente(corpo));
    corpo.appendChild(colunas);
  }

  /*
   * Quantas mensagens o atendimento mandou no mes.
   *
   * Quem conta e o agente, que roda fora do Capta. Enquanto ele nao reportar,
   * o numero e zero, e dizer "0 mensagens" seria mentir por omissao: parece
   * atendimento parado quando na verdade e medidor desligado. Por isso o
   * texto muda em vez do numero.
   */
  /*
   * A primeira coisa que o lojista ve, enquanto nao tiver numero.
   *
   * O Atende Ai e so WhatsApp: sem numero conectado nao existe produto, e
   * qualquer outro numero na tela seria enfeite. Ele informa o dele; quem
   * confirma somos nos, na ativacao, porque e o numero que decide de quem e
   * a conversa que chega.
   */
  function conectarWhatsapp(aoMudar) {
    var p = atendimento.prontidao || {};
    var caixa = el('div', null, 'conectar');
    caixa.appendChild(el('div', 'Conecte o seu WhatsApp', 'rotulo'));

    if (p.solicitado) {
      caixa.appendChild(el('p', 'Recebemos o número ' + numeroBonito(p.solicitado)
        + '. Vamos fazer a verificação com a Meta e avisar quando ele estiver atendendo.', 'legenda'));
      var trocar = el('button', 'Informar outro número', 'secundario');
      trocar.type = 'button';
      trocar.addEventListener('click', function () {
        atendimento.prontidao.solicitado = null;
        aoMudar();
      });
      caixa.appendChild(trocar);
      return caixa;
    }

    caixa.appendChild(el('p', 'É o número que vai atender os seus clientes. Informe aqui e a gente faz a verificação com a Meta para colocar no ar.', 'legenda'));
    var linha = el('div', null, 'linha');
    var campo = el('input');
    campo.type = 'tel';
    campo.inputMode = 'tel';
    campo.placeholder = 'DDD + número';
    var enviar = el('button', 'Conectar meu WhatsApp');
    enviar.type = 'button';
    var erro = el('p', '', 'erro');
    erro.hidden = true;

    enviar.addEventListener('click', function () {
      erro.hidden = true;
      enviar.disabled = true;
      api('/atendimento/numero', { method: 'POST', corpo: { numero: campo.value } })
        .then(function (r) {
          atendimento.prontidao.solicitado = r.solicitado;
          aoMudar();
        })
        .catch(function (e) {
          enviar.disabled = false;
          erro.textContent = e.message;
          erro.hidden = false;
        });
    });
    campo.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') enviar.click(); });

    linha.appendChild(campo);
    linha.appendChild(enviar);
    caixa.appendChild(linha);
    caixa.appendChild(erro);
    return caixa;
  }

  /*
   * O freio de mao.
   *
   * Estoque errado no ar, promocao que saiu torta, ou um dia em que ele quer
   * atender a mao: o lojista precisa conseguir parar o atendimento sozinho,
   * na hora, sem falar com a gente. Fica no topo da tela porque e a coisa
   * que se procura com pressa.
   */
  function freioDeMao(corpo) {
    var p = atendimento.pausa || {};
    var caixa = el('div', null, 'freio' + (p.pausado ? ' parado' : ''));

    // Sem numero conectado nao chega conversa nenhuma, entao dizer que o
    // agente esta respondendo seria promessa que a tela nao cumpre.
    var ligado = Boolean((atendimento.prontidao || {}).numero);
    var texto = el('div', null, 'dizer');
    texto.appendChild(el('div', p.pausado ? 'Atendimento pausado'
      : ligado ? 'Atendimento no ar' : 'Aguardando a conexão', 'rotulo'));
    texto.appendChild(el('p', p.pausado
      ? 'O agente não está respondendo ninguém no WhatsApp.'
      : ligado
        ? 'O agente está respondendo os seus clientes com a base desta tela.'
        : 'Assim que o número estiver conectado, o agente começa a responder com a base desta tela.', 'hora'));
    caixa.appendChild(texto);

    var botao = el('button', p.pausado ? 'Voltar a atender' : 'Pausar atendimento',
      p.pausado ? '' : 'secundario');
    botao.type = 'button';
    // Pausar o que ainda nao comecou e botao que nao faz nada visivel.
    botao.hidden = !ligado && !p.pausado;
    botao.addEventListener('click', function () {
      var parar = !p.pausado;
      if (parar && !confirm('Pausar o atendimento?\n\nO agente para de responder no WhatsApp até você religar. Nada da base é apagado.')) return;
      botao.disabled = true;
      api('/atendimento/pausa', { method: 'POST', corpo: { pausado: parar } })
        .then(function (r) {
          atendimento.pausa = r;
          desenharAtendimento(corpo);
        })
        .catch(function (e) { botao.disabled = false; alert(e.message); });
    });
    caixa.appendChild(botao);

    if (p.pausado) {
      // O recado so aparece parado: perguntar o que dizer enquanto esta
      // parado para quem nao parou e pergunta sem assunto.
      var rot = el('label', 'O que responder enquanto estiver parado');
      var campo = el('textarea');
      campo.placeholder = 'Ex.: Estamos em manutenção hoje. Respondemos amanhã pela manhã.';
      campo.maxLength = 300;
      campo.value = p.recado || '';
      campo.addEventListener('change', function () {
        api('/atendimento/pausa', { method: 'POST', corpo: { pausado: true, recado: campo.value } })
          .then(function (r) { atendimento.pausa = r; })
          .catch(function (e) { alert(e.message); });
      });
      rot.appendChild(campo);
      caixa.appendChild(rot);
    }
    return caixa;
  }

  /** 5541999998888 vira +55 41 99999-8888, que e como ele reconhece o proprio numero. */
  function numeroBonito(cru) {
    var d = String(cru || '').replace(/\D/g, '');
    if (d.length < 12) return cru;
    var pais = d.slice(0, d.length - 11);
    var ddd = d.slice(-11, -9);
    var meio = d.slice(-9, -4);
    return '+' + pais + ' ' + ddd + ' ' + meio + '-' + d.slice(-4);
  }

  /*
   * O que ainda falta para o atendimento entrar no ar.
   *
   * Some quando estiver tudo de pe, de proposito: lista de pendencia que
   * nunca zera vira enfeite e para de ser lida. E cada linha diz de quem e a
   * pendencia, porque conectar o numero nao e tarefa do lojista e cobrar
   * dele uma coisa que ele nao pode fazer e o jeito rapido de perder a
   * confianca na tela.
   */
  function prontidao() {
    var p = atendimento.prontidao || {};
    var itens = [
      { ok: Boolean(p.numero), texto: p.numero
        ? 'Número conectado: ' + numeroBonito(p.numero)
        : p.solicitado
          ? 'Número informado. Falta a nossa verificação com a Meta.'
          : 'O número de WhatsApp ainda não está conectado.' },
      { ok: Boolean(p.base), texto: p.base
        ? 'Base preenchida'
        : 'Falta o básico da base: nome da loja, prazo de entrega, pagamento e troca.' },
      { ok: Boolean(p.atendendo), texto: p.atendendo
        ? 'O atendimento já está respondendo'
        : 'O atendimento ainda não respondeu ninguém por aqui.' },
    ];
    var pronto = itens.every(function (i) { return i.ok; });
    if (pronto) return null;

    var caixa = el('div', null, 'prontidao');
    caixa.appendChild(el('div', 'Para entrar no ar', 'rotulo'));
    var lista = el('ul');
    itens.forEach(function (i) {
      var li = el('li', null, i.ok ? 'feito' : 'falta');
      // Nome proprio e nao 'marca': aquela classe e a do logotipo no topo,
      // com um ::after que desenha a bolinha da marca, e cada item da lista
      // herdava a bolinha junto.
      li.appendChild(el('span', i.ok ? '✓' : '•', 'sinal'));
      li.appendChild(el('span', i.texto));
      lista.appendChild(li);
    });
    caixa.appendChild(lista);
    return caixa;
  }

  function consumoDoMes() {
    var caixa = el('div', null, 'consumo');
    var c = atendimento.consumo || {};

    if (!c.atualizadoEm) {
      caixa.appendChild(el('span', 'Ainda não recebi contagem do atendimento este mês.', 'hora'));
      return caixa;
    }

    var topo = el('div', null, 'topo');
    topo.appendChild(el('strong', c.enviadas.toLocaleString('pt-BR')));
    topo.appendChild(el('span', 'de ' + c.incluidas.toLocaleString('pt-BR')
      + ' mensagens no plano ' + c.nome, 'hora'));
    caixa.appendChild(topo);

    var barra = el('div', null, 'medidor' + (c.avisar ? ' cheio' : ''));
    var dentro = el('span');
    dentro.style.width = Math.min(100, Math.round((c.fatia || 0) * 100)) + '%';
    barra.appendChild(dentro);
    caixa.appendChild(barra);

    // O excedente aparece em reais, e nao so em contagem: o lojista precisa
    // ver o que ja entrou na fatura dele, nao descobrir no mes seguinte.
    if (c.excedente && c.excedente.mensagens) {
      caixa.appendChild(el('span', c.excedente.mensagens.toLocaleString('pt-BR')
        + ' acima do plano, ' + dinheiro(c.excedente.valor) + ' no mês', 'hora'));
    } else if (c.avisar) {
      caixa.appendChild(el('span', 'Faltam ' + c.sobrando.toLocaleString('pt-BR')
        + ' para o limite do plano.', 'hora'));
    }
    return caixa;
  }

  /*
   * O historico fica no topo, e nao escondido numa aba.
   *
   * Ele e o que tira o medo de editar: o lojista mexe sabendo que da para
   * voltar. Escondido, ele so e descoberto depois do estrago.
   */
  function historicoDeVersoes(corpo) {
    var caixa = el('div', null, 'versoes');
    caixa.appendChild(el('div', 'Histórico', 'rotulo'));

    if (!atendimento.versoes.length) {
      caixa.appendChild(el('p', 'Nenhuma alteração ainda. A primeira gravação já cria um ponto de volta.', 'vazio'));
      return caixa;
    }

    var escolha = el('select');
    atendimento.versoes.forEach(function (v) {
      var ORIGEM = { formulario: 'formulário', chat: 'assistente', restauracao: 'restauração' };
      var rotulo = quando(v.criadoEm) + '  ·  ' + (ORIGEM[v.origem] || v.origem)
        + (v.autor ? '  ·  ' + v.autor : '');
      var op = el('option', rotulo);
      op.value = v.id;
      escolha.appendChild(op);
    });
    caixa.appendChild(escolha);

    var restaurar = el('button', 'Restaurar', 'secundario');
    restaurar.type = 'button';
    var estado = el('span', '', 'hora');
    restaurar.addEventListener('click', function () {
      if (!confirm('Voltar a base para esta versão?\n\nO conteúdo de agora vira mais um ponto no histórico, então dá para desfazer.')) return;
      restaurar.disabled = true;
      estado.textContent = 'Restaurando...';
      api('/atendimento/versoes/' + escolha.value + '/restaurar', { method: 'POST' })
        .then(function () { return api('/atendimento'); })
        .then(function (dados) {
          atendimento = dados;
          desenharAtendimento(corpo);
        })
        .catch(function (e) {
          restaurar.disabled = false;
          estado.textContent = e.message;
        });
    });
    caixa.appendChild(restaurar);
    caixa.appendChild(estado);
    return caixa;
  }

  /*
   * A base em blocos, nao num formulario corrido de onze campos.
   *
   * Os blocos seguem a cabeca de quem atende: a loja, a entrega, o dinheiro,
   * as regras, e por fim como falar. Assim o lojista acha o campo pelo
   * assunto, sem ler todos os rotulos de cima a baixo.
   */
  var BLOCOS = [
    { titulo: 'A loja', legenda: 'O basico que o atendimento diz logo na primeira mensagem.',
      campos: ['nomeLoja', 'segmento', 'linkSite', 'horarioAtendimento'] },
    { titulo: 'Entrega', legenda: 'A pergunta que mais chega no WhatsApp.',
      campos: ['prazosEntrega', 'freteGratisAcima'] },
    { titulo: 'Pagamento e trocas', legenda: 'O que decide a compra e o que evita reclamacao depois.',
      campos: ['formasPagamento', 'politicaTroca'] },
    { titulo: 'Como o atendimento fala', legenda: 'Texto livre. O agente usa isto para escrever como a sua loja escreveria.',
      campos: ['tomDeVoz', 'perguntasFrequentes', 'observacoes'] },
  ];

  function formularioDaBase(corpo) {
    var area = el('div');
    var base = atendimento.base;
    // Cópia de trabalho: o que o lojista digita só vira a base de verdade
    // quando ele salva, e descartar é fechar a tela.
    var rascunho = JSON.parse(JSON.stringify(base));

    BLOCOS.forEach(function (bloco) {
      var caixa = el('div', null, 'bloco');
      caixa.appendChild(el('div', bloco.titulo, 'rotulo'));
      caixa.appendChild(el('p', bloco.legenda, 'legenda'));
      bloco.campos.forEach(function (nome) {
        caixa.appendChild(campoDaBase(nome, rascunho));
      });
      area.appendChild(caixa);
    });

    var acoes = el('div', null, 'acoes');
    var salvar = el('button', 'Salvar');
    salvar.type = 'button';
    var estado = el('span', '', 'hora');
    estado.style.marginLeft = '10px';
    if (atendimento.atualizadoEm) {
      estado.textContent = 'Última mudança em ' + quando(atendimento.atualizadoEm);
    }
    salvar.addEventListener('click', function () {
      salvar.disabled = true;
      estado.textContent = 'Salvando...';
      api('/atendimento', { method: 'PUT', corpo: rascunho })
        .then(function () { return api('/atendimento'); })
        .then(function (dados) {
          atendimento = dados;
          desenharAtendimento(corpo);
        })
        .catch(function (e) {
          salvar.disabled = false;
          estado.textContent = e.dados && e.dados.explicacao ? e.dados.explicacao : e.message;
        });
    });
    acoes.appendChild(salvar);
    acoes.appendChild(estado);
    area.appendChild(acoes);
    return area;
  }

  function campoDaBase(nome, rascunho) {
    var campo = atendimento.campos[nome];
    if (!campo) return el('span');

    if (campo.tipo === 'prazos') return campoDeLinhas(nome, rascunho, campo, true);
    if (campo.tipo === 'lista') return campoDeLinhas(nome, rascunho, campo, false);

    var rotulo = el('label', campo.rotulo);
    var entrada;
    if (campo.tipo === 'texto' && campo.teto > 300) {
      entrada = el('textarea');
    } else {
      entrada = el('input');
      entrada.type = campo.tipo === 'dinheiro' ? 'number' : 'text';
      if (campo.tipo === 'dinheiro') { entrada.step = '0.01'; entrada.min = '0'; }
    }
    if (campo.teto) entrada.maxLength = campo.teto;
    entrada.value = rascunho[nome] == null ? '' : rascunho[nome];
    if (campo.tipo === 'dinheiro') {
      entrada.placeholder = 'Deixe vazio se a loja não tem frete grátis';
    }
    entrada.addEventListener('input', function () {
      // Vazio no campo de dinheiro e nulo, nao zero: um diz "nao tem frete
      // gratis" e o outro diz "frete gratis em qualquer valor".
      rascunho[nome] = campo.tipo === 'dinheiro'
        ? (entrada.value === '' ? null : entrada.value)
        : entrada.value;
    });
    rotulo.appendChild(entrada);
    return rotulo;
  }

  /** Prazo por regiao e forma de pagamento: lista que cresce e encolhe. */
  function campoDeLinhas(nome, rascunho, campo, comRegiao) {
    var rotulo = el('label', campo.rotulo);
    var lista = el('div', null, 'linhas');
    rotulo.appendChild(lista);

    function desenhar() {
      lista.textContent = '';
      var itens = rascunho[nome] || [];
      itens.forEach(function (item, i) {
        var linha = el('div', null, 'linha');
        if (comRegiao) {
          linha.appendChild(entradaDeLinha(item.regiao, 'Região', function (v) { itens[i].regiao = v; }));
          linha.appendChild(entradaDeLinha(item.prazo, 'Prazo', function (v) { itens[i].prazo = v; }));
        } else {
          linha.appendChild(entradaDeLinha(item, 'Ex.: Pix', function (v) { itens[i] = v; }));
        }
        var tirar = el('button', '×', 'tirar');
        tirar.type = 'button';
        tirar.setAttribute('aria-label', 'Remover');
        tirar.addEventListener('click', function () { itens.splice(i, 1); desenhar(); });
        linha.appendChild(tirar);
        lista.appendChild(linha);
      });

      var mais = el('button', '+ Adicionar', 'secundario');
      mais.type = 'button';
      mais.addEventListener('click', function () {
        rascunho[nome] = itens.concat([comRegiao ? { regiao: '', prazo: '' } : '']);
        desenhar();
      });
      lista.appendChild(mais);
    }

    desenhar();
    return rotulo;
  }

  function entradaDeLinha(valor, dica, aoMudar) {
    var i = el('input');
    i.type = 'text';
    i.value = valor || '';
    i.placeholder = dica;
    i.addEventListener('input', function () { aoMudar(i.value); });
    return i;
  }

  /*
   * A coluna do assistente.
   *
   * O lojista escreve o que quer mudar; o que volta e uma proposta, nunca uma
   * gravacao. A proposta aparece campo por campo, com o valor de agora ao
   * lado do valor novo, e precisa de um clique em confirmar para virar base.
   *
   * Mostrar o "de X para Y" nao e enfeite: e o unico momento em que o lojista
   * consegue pegar o modelo entendendo "7 dias" como "7 meses" antes de o
   * atendimento comecar a responder isso para cliente de verdade.
   */
  function chatDoAssistente(corpo, grande, aoMudar) {
    var caixa = el('div', null, 'assistente-chat' + (grande ? ' grande' : ''));
    function redesenhar() {
      if (aoMudar) return aoMudar();
      if (grande) return verAssistente();
      return desenharAtendimento(corpo);
    }
    var cab = el('div', null, 'cab');
    cab.appendChild(el('div', 'Assistente', 'rotulo'));
    cab.appendChild(el('div', 'Descreva a mudança e confirme antes de gravar.', 'hora'));
    caixa.appendChild(cab);

    var mensagens = el('div', null, 'ac-ms');
    caixa.appendChild(mensagens);

    var pe = el('div', null, 'ac-pe');
    var campo = el('textarea');
    // Na ativacao o lojista esta respondendo pergunta, nao pedindo alteracao:
    // "diga o que mudou" ali nao faz sentido nenhum para quem acabou de entrar.
    campo.placeholder = (atendimento.prontidao || {}).base
      ? 'Diga o que mudou, cole o link da loja, ou mande parar o atendimento'
      : 'Responda aqui, ou cole o link da sua loja';
    campo.maxLength = 8000;
    var enviar = el('button', 'Enviar');
    enviar.type = 'button';
    pe.appendChild(campo);
    pe.appendChild(microfone(campo));
    pe.appendChild(enviar);
    caixa.appendChild(pe);

    if (!atendimento.assistente) {
      // Sem chave no servidor o campo fica desligado e diz o porque, em vez
      // de aceitar o texto e devolver erro depois de o lojista escrever.
      mensagens.appendChild(el('p', 'O assistente não está ligado nesta instalação. Por enquanto, edite pelo formulário ao lado.', 'ac-vazio'));
      campo.disabled = true;
      enviar.disabled = true;
      return caixa;
    }

    var aviso = el('div', '', 'ac-aviso');
    aviso.hidden = true;
    caixa.appendChild(aviso);

    function falhou(e) {
      aviso.hidden = false;
      aviso.textContent = e.dados && e.dados.explicacao ? e.dados.explicacao : e.message;
    }

    function desenhar() {
      mensagens.textContent = '';
      var conversa = atendimento.conversa || [];
      if (!conversa.length) {
        /*
         * Com a base vazia, quem comeca a conversa e o assistente.
         *
         * Lojista que acabou de conectar o numero nao sabe que tem que pedir
         * alguma coisa: ele olharia um campo em branco e sairia. Esta fala e
         * nossa, nao do modelo, entao ela nao custa chamada nem demora, e e
         * sempre a mesma primeira pergunta.
         */
        if (!(atendimento.prontidao || {}).base) {
          mensagens.appendChild(el('div', 'Oi! Vou montar o atendimento da sua loja, e vou te'
            + ' perguntar o mínimo. Para começar: qual é o nome da loja, o que ela vende, e qual'
            + ' é o link do site? Com o link eu leio o site e tiro de lá o que der.',
          'ac-bb assistente'));
        } else {
          mensagens.appendChild(el('p', 'Cole o link da sua loja e eu leio o site para adiantar o que der. Ou escreva o que mudou. Você confirma antes de gravar.', 'ac-vazio'));
        }
      }
      conversa.forEach(function (m) {
        mensagens.appendChild(el('div', m.texto, 'ac-bb ' + m.papel));
        if (m.proposta && (m.proposta.mudancas || m.proposta.acao)) {
          mensagens.appendChild(cartaoDaProposta(m));
        }
      });
      mensagens.scrollTop = mensagens.scrollHeight;
    }

    /*
     * Acao nao e proposta de campo: nao tem "de X para Y" para comparar,
     * porque o que ela mexe e o interruptor do atendimento, nao a base.
     * Parar ja aconteceu quando este cartao aparece; voltar espera o clique.
     */
    function cartaoDaAcao(m) {
      var cartao = el('div', null, 'ac-prop acao' + (m.estado === 'pendente' ? '' : ' passada'));

      if (m.proposta.acao === 'pausar') {
        cartao.appendChild(el('div', 'Atendimento parado', 'ac-cp'));
        cartao.appendChild(el('div', 'O agente não responde ninguém até você mandar voltar.', 'hora'));
        return cartao;
      }

      cartao.appendChild(el('div', 'Voltar a atender', 'ac-cp'));
      if (m.estado !== 'pendente') {
        cartao.appendChild(el('div', m.estado === 'confirmada'
          ? 'O agente voltou a responder.'
          : 'Descartada. O atendimento seguiu parado.', 'hora'));
        return cartao;
      }
      cartao.appendChild(el('div', 'O agente volta a responder os seus clientes no WhatsApp.', 'hora'));

      var acoes = el('div', null, 'ac-acoes');
      var sim = el('button', 'Voltar a atender');
      sim.type = 'button';
      var nao = el('button', 'Agora não', 'secundario');
      nao.type = 'button';

      sim.addEventListener('click', function () {
        sim.disabled = true; nao.disabled = true;
        aviso.hidden = true;
        api('/atendimento/chat/' + m.id + '/confirmar', { method: 'POST' })
          .then(function () { return api('/atendimento'); })
          .then(function (dados) { atendimento = dados; redesenhar(); })
          .catch(function (e) { sim.disabled = false; nao.disabled = false; falhou(e); });
      });
      nao.addEventListener('click', function () {
        sim.disabled = true; nao.disabled = true;
        api('/atendimento/chat/' + m.id + '/descartar', { method: 'POST' })
          .then(function () { m.estado = 'descartada'; desenhar(); })
          .catch(function (e) { sim.disabled = false; nao.disabled = false; falhou(e); });
      });
      acoes.appendChild(sim);
      acoes.appendChild(nao);
      cartao.appendChild(acoes);
      return cartao;
    }

    /** A proposta: os campos que mudam, o valor de agora e o valor novo. */
    function cartaoDaProposta(m) {
      if (m.proposta.acao) return cartaoDaAcao(m);
      var cartao = el('div', null, 'ac-prop' + (m.estado === 'pendente' ? '' : ' passada'));
      Object.keys(m.proposta.mudancas).forEach(function (nome) {
        var campoDef = atendimento.campos[nome];
        var linha = el('div', null, 'ac-mud');
        linha.appendChild(el('div', campoDef ? campoDef.rotulo : nome, 'ac-cp'));
        linha.appendChild(el('div', valorLegivel(nome, (m.proposta.antes || {})[nome]), 'ac-de'));
        linha.appendChild(el('div', valorLegivel(nome, m.proposta.mudancas[nome]), 'ac-para'));
        cartao.appendChild(linha);
      });

      if (m.estado === 'confirmada') {
        cartao.appendChild(el('div', 'Aplicada em ' + quando(m.criadoEm), 'hora'));
        return cartao;
      }
      if (m.estado !== 'pendente') {
        cartao.appendChild(el('div', 'Descartada. A conversa seguiu depois dela.', 'hora'));
        return cartao;
      }

      var acoes = el('div', null, 'ac-acoes');
      var confirmar = el('button', 'Confirmar e gravar');
      confirmar.type = 'button';
      var descartar = el('button', 'Descartar', 'secundario');
      descartar.type = 'button';

      confirmar.addEventListener('click', function () {
        confirmar.disabled = true;
        descartar.disabled = true;
        aviso.hidden = true;
        api('/atendimento/chat/' + m.id + '/confirmar', { method: 'POST' })
          .then(function () { return api('/atendimento'); })
          .then(function (dados) {
            // Recarrega a tela toda: a base mudou, e com ela o formulario e o
            // historico de versoes, nao so a bolha do chat.
            atendimento = dados;
            redesenhar();
          })
          .catch(function (e) {
            confirmar.disabled = false;
            descartar.disabled = false;
            falhou(e);
          });
      });

      descartar.addEventListener('click', function () {
        confirmar.disabled = true;
        descartar.disabled = true;
        api('/atendimento/chat/' + m.id + '/descartar', { method: 'POST' })
          .then(function () { m.estado = 'descartada'; desenhar(); })
          .catch(function (e) {
            confirmar.disabled = false;
            descartar.disabled = false;
            falhou(e);
          });
      });

      acoes.appendChild(confirmar);
      acoes.appendChild(descartar);
      cartao.appendChild(acoes);
      return cartao;
    }

    function mandar() {
      var texto = campo.value.trim();
      if (texto.length < 3) return;
      campo.disabled = true;
      enviar.disabled = true;
      aviso.hidden = true;

      // A proposta anterior morre no servidor assim que chega outro pedido. A
      // tela acompanha isso na hora para o lojista nao ficar olhando um botao
      // de confirmar que ja nao vale.
      (atendimento.conversa || []).forEach(function (m) {
        if (m.estado === 'pendente') m.estado = 'descartada';
      });
      atendimento.conversa = (atendimento.conversa || []).concat([
        { id: 'enviando', papel: 'lojista', texto: texto, estado: 'conversa' },
      ]);
      campo.value = '';
      desenhar();

      api('/atendimento/chat', { method: 'POST', corpo: { texto: texto } })
        .then(function (dados) {
          atendimento.conversa = atendimento.conversa
            .filter(function (m) { return m.id !== 'enviando'; })
            .concat([dados.minha, dados.resposta]);
          // Parar acontece na hora, entao o resto da tela precisa saber.
          if (dados.pausa) { atendimento.pausa = dados.pausa; redesenhar(); return; }
          campo.disabled = false;
          enviar.disabled = false;
          desenhar();
          campo.focus();
        })
        .catch(function (e) {
          atendimento.conversa = atendimento.conversa.filter(function (m) { return m.id !== 'enviando'; });
          campo.value = texto;
          campo.disabled = false;
          enviar.disabled = false;
          desenhar();
          falhou(e);
        });
    }

    enviar.addEventListener('click', mandar);
    campo.addEventListener('keydown', function (ev) {
      // Enter manda, Shift+Enter quebra linha: e o que a mao do lojista ja faz
      // em qualquer outro chat.
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); mandar(); }
    });

    desenhar();
    return caixa;
  }

  /*
   * Ditar em vez de digitar.
   *
   * Quem esta no balcao com cliente na frente nao para para escrever. Usa o
   * reconhecimento do proprio navegador: sem biblioteca nova e sem audio
   * passando pelo nosso servidor. Fora do Chrome ele nao existe, e ai o botao
   * nem aparece, em vez de aparecer e nao funcionar.
   *
   * Vale dizer ao lojista: no Chrome, o que ele fala vai para o servico de
   * reconhecimento do Google, que e quem transcreve.
   */
  function microfone(campo) {
    var Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Reconhecimento) return el('span');

    var botao = el('button', '', 'ac-mic');
    botao.type = 'button';
    botao.title = 'Ditar';
    botao.setAttribute('aria-label', 'Ditar');
    botao.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">'
      + '<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/>'
      + '<path d="M18 11a6 6 0 0 1-12 0"/><path d="M12 17v4"/></svg>';

    var ouvindo = null;
    botao.addEventListener('click', function () {
      if (ouvindo) { ouvindo.stop(); return; }

      var r = new Reconhecimento();
      r.lang = 'pt-BR';
      r.continuous = true;
      r.interimResults = true;
      var jaTinha = campo.value ? campo.value + ' ' : '';
      var fechado = '';

      r.onresult = function (ev) {
        var aberto = '';
        for (var i = ev.resultIndex; i < ev.results.length; i += 1) {
          var trecho = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) fechado += trecho; else aberto += trecho;
        }
        campo.value = jaTinha + fechado + aberto;
      };
      r.onerror = function () { parar(); };
      r.onend = function () { parar(); };

      function parar() {
        ouvindo = null;
        botao.classList.remove('ouvindo');
        campo.focus();
      }

      try {
        r.start();
        ouvindo = r;
        botao.classList.add('ouvindo');
      } catch (e) { parar(); }
    });
    return botao;
  }

  /** O valor de um campo escrito como gente le, para o "de X para Y". */
  function valorLegivel(nome, valor) {
    var campoDef = atendimento.campos[nome] || {};
    if (campoDef.tipo === 'prazos') {
      var prazos = (valor || []).map(function (p) { return (p.regiao || '?') + ': ' + (p.prazo || '?'); });
      return prazos.length ? prazos.join('  ·  ') : 'vazio';
    }
    if (campoDef.tipo === 'lista') {
      return (valor || []).length ? (valor || []).join(', ') : 'vazio';
    }
    if (valor == null || valor === '') return 'vazio';
    if (campoDef.tipo === 'dinheiro') {
      return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
    }
    return String(valor);
  }

  // ---------------------------------------------------------- configuracoes ---

  function verConfiguracoes() {
    var alvo = pintar('Configurações', 'Quem recebe os avisos, o WhatsApp da loja e a sua senha.');
    api('/conta').then(function (conta) {
      var cartao = el('div', null, 'cartao');
      cartao.appendChild(el('div', 'Conta e avisos', 'rotulo'));
      var form = el('form', null, 'form-config');
      function campo(rotulo, nome, valor, tipo, placeholder) {
        var l = el('label', rotulo);
        var i = el('input'); i.name = nome; i.type = tipo || 'text'; i.value = valor || ''; i.placeholder = placeholder || '';
        i.autocomplete = 'off';
        l.appendChild(i); form.appendChild(l); return i;
      }
      campo('Nome da conta ou da loja', 'nome', conta.nome).required = true;
      campo('CPF ou CNPJ (para a cobrança)', 'documento', conta.documento, 'text', 'Somente números');
      campo('E-mail de login (não muda por aqui)', 'email', conta.email, 'email').disabled = true;
      campo('E-mail que recebe os avisos de lead e cobrança', 'emailAviso', conta.email_aviso, 'email', 'Vazio = o e-mail de login');
      campo('WhatsApp da loja, com DDD', 'whatsapp', conta.whatsapp, 'tel', 'Ex.: 41999990000');
      form.appendChild(el('p', 'O WhatsApp aparece como botão na tela final do chat quando o benefício e diagnóstico, especialista ou consultoria.', 'hora'));
      var linha = el('label', null, 'linha-check');
      var check = el('input'); check.type = 'checkbox'; check.name = 'avisarLead'; check.checked = conta.avisar_lead !== false;
      linha.appendChild(check);
      linha.appendChild(document.createTextNode('Receber um e-mail a cada lead novo'));
      form.appendChild(linha);
      var erro = el('p', null, 'erro'); erro.hidden = true; form.appendChild(erro);
      var ok = el('p', null, 'ok'); ok.hidden = true; form.appendChild(ok);
      var acoes = el('div', null, 'acoes');
      var salvar = el('button', 'Salvar'); salvar.type = 'submit';
      acoes.appendChild(salvar); form.appendChild(acoes);
      form.addEventListener('submit', function (evento) {
        evento.preventDefault();
        erro.hidden = true; ok.hidden = true; salvar.disabled = true;
        var d = new FormData(form);
        api('/conta', { method: 'PUT', corpo: {
          nome: d.get('nome'), documento: d.get('documento'), emailAviso: d.get('emailAviso'),
          whatsapp: d.get('whatsapp'), avisarLead: check.checked,
        } }).then(function (atualizada) {
          ok.textContent = 'Salvo.'; ok.hidden = false; salvar.disabled = false;
          document.getElementById('nome-conta').textContent = atualizada.nome;
          document.getElementById('avatar').textContent = iniciais(atualizada.nome);
        }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; salvar.disabled = false; });
      });
      cartao.appendChild(form);
      alvo.appendChild(cartao);

      var senha = el('div', null, 'cartao');
      senha.appendChild(el('div', 'Trocar a senha', 'rotulo'));
      var formSenha = el('form', null, 'form-config');
      var atual = el('label', 'Senha atual'); var iAtual = el('input'); iAtual.type = 'password'; iAtual.name = 'atual'; iAtual.required = true; iAtual.autocomplete = 'current-password'; atual.appendChild(iAtual);
      var nova = el('label', 'Senha nova, no mínimo 8 caracteres'); var iNova = el('input'); iNova.type = 'password'; iNova.name = 'nova'; iNova.required = true; iNova.minLength = 8; iNova.autocomplete = 'new-password'; nova.appendChild(iNova);
      formSenha.appendChild(atual); formSenha.appendChild(nova);
      var erroSenha = el('p', null, 'erro'); erroSenha.hidden = true; formSenha.appendChild(erroSenha);
      var okSenha = el('p', null, 'ok'); okSenha.hidden = true; formSenha.appendChild(okSenha);
      var acoesSenha = el('div', null, 'acoes');
      var trocar = el('button', 'Trocar senha', 'secundario'); trocar.type = 'submit';
      acoesSenha.appendChild(trocar); formSenha.appendChild(acoesSenha);
      formSenha.addEventListener('submit', function (evento) {
        evento.preventDefault();
        erroSenha.hidden = true; okSenha.hidden = true;
        api('/conta/senha', { method: 'POST', corpo: { atual: iAtual.value, nova: iNova.value } })
          .then(function () { okSenha.textContent = 'Senha trocada. As outras sessões desta conta foram encerradas.'; okSenha.hidden = false; formSenha.reset(); })
          .catch(function (e) { erroSenha.textContent = e.message === 'sem sessao' ? 'Senha atual não confere' : e.message; erroSenha.hidden = false; });
      });
      senha.appendChild(formSenha);
      alvo.appendChild(senha);
    });
  }

  var ROTAS = {
    // '#/hoje' continua valendo: a tela virou Resumo, mas quem tem o endereco
    // antigo salvo nao pode cair numa tela em branco por causa de um rotulo.
    '#/resumo': verHoje, '#/hoje': verHoje, '#/leads': verLeads, '#/chat': verChat,
    '#/integracoes': verIntegracoes, '#/financeiro': verFinanceiro, '#/admin': verAdmin,
    '#/comecar': verComecar, '#/atendimentos': verAtendimentos,
    '#/atendimento': verAtendimento, '#/assistente': verAssistente,
    '#/configuracoes': verConfiguracoes,
  };

  function navegar() {
    if (!eu) { abrirNovaSenhaSePedido(); return; }
    var hash = (location.hash || '#/resumo').split('?')[0];
    document.querySelectorAll('nav a').forEach(function (a) {
      a.classList.toggle('ativo', a.getAttribute('href') === hash);
    });
    if (hash.indexOf('#/lead/') === 0) return verLead(hash.slice(7));
    if (hash.indexOf('#/conversa/') === 0) return verConversa(hash.slice(11));
    if (hash !== '#/leads') cacheLeads = null;
    (ROTAS[hash] || verHoje)();
  }

  window.addEventListener('hashchange', navegar);

  function iniciais(nome) {
    return String(nome).trim().split(/\s+/).slice(0, 2)
      .map(function (p) { return p[0]; }).join('').toUpperCase();
  }

  /** Link do e-mail de recuperacao: mostra o formulario de senha nova em vez do login. */
  function abrirNovaSenhaSePedido() {
    var token = tokenDeNovaSenha();
    if (!token) return false;
    document.getElementById('form-nova-senha').dataset.token = token;
    mostrarFormularioDeEntrada('form-nova-senha');
    return true;
  }

  function iniciar() {
    if (abrirNovaSenhaSePedido()) return;
    if (abrirCadastroSePedido()) return;
    api('/eu').then(function (dados) {
      eu = dados;
      document.getElementById('entrada').hidden = true;
      document.getElementById('app').hidden = false;
      document.getElementById('nome-conta').textContent = dados.conta.nome;
      document.getElementById('avatar').textContent = iniciais(dados.conta.nome);
      document.getElementById('menu-admin').hidden = !dados.conta.operador;
      // Modulo vendido a parte: quem nao assina nao ve o item no menu, e a
      // rota responde 404 de qualquer jeito.
      document.getElementById('menu-atendimento').hidden = !(dados.modulos && dados.modulos.atendimento);
      // O Comecar some sozinho quando a ativacao termina: item de menu que
      // continua la depois de pronto vira lembrete de tarefa ja feita.
      document.getElementById('menu-comecar').hidden = !(dados.atendeAi && !dados.atendeAi.ativado);
      document.getElementById('menu-atendimentos').hidden = !(dados.modulos && dados.modulos.atendimento);
      document.getElementById('menu-assistente').hidden = !(dados.modulos && dados.modulos.atendimento);
      // Quem assina so o Atende Ai nao tem loja conectada: tela de widget e
      // de cupom ali e menu que nunca leva a lugar nenhum.
      var temCapta = !dados.modulos || dados.modulos.capta !== false;
      document.getElementById('grupo-capta').hidden = !temCapta;
      var doCapta = document.querySelectorAll('.item-capta');
      for (var i = 0; i < doCapta.length; i += 1) doCapta[i].hidden = !temCapta;

      var faixa = document.getElementById('faixa');
      if (dados.aviso) {
        faixa.textContent = dados.aviso.texto;
        faixa.className = dados.aviso.gravidade;
        faixa.hidden = false;
      } else {
        faixa.hidden = true;
      }

      var plano = dados.assinatura ? dados.planos[dados.assinatura.plano] : null;
      if (plano) {
        document.getElementById('rotulo-plano').textContent = 'Plano ' + plano.nome;
        document.getElementById('texto-plano').textContent = plano.rastreamento
          ? 'Rastreamento de navegação ligado.'
          : 'Rastreamento de navegação desligado no seu plano.';
        document.getElementById('cartao-plano').hidden = false;
      }

      api('/alertas').then(function (alertas) {
        var badge = document.getElementById('badge-alertas');
        badge.textContent = String(alertas.length);
        badge.hidden = alertas.length === 0;
      }).catch(function () {});

      // Quem entra sem endereco e ainda nao ativou cai no Comecar. Quem
      // digitou um endereco vai para onde pediu: a tela nao sequestra.
      if (!location.hash && dados.atendeAi && !dados.atendeAi.ativado) {
        location.hash = '#/comecar';
      }
      navegar();
    }).catch(function () { /* mostrarEntrada ja foi chamado no 401 */ });
  }

  vestirMarca();
  iniciar();
}());
