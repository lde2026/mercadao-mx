/**
 * Painel do lojista. Sem framework, pela mesma razao do widget: cada
 * dependencia e superficie de ataque e de manutencao, e aqui nao ha nada que
 * justifique uma.
 *
 * Todo texto vindo da API entra por textContent e nunca por innerHTML. O nome
 * do lead e digitado por um visitante anonimo na loja do cliente, entao e
 * entrada de terceiro nao confiavel dentro do painel de quem paga.
 */
(function () {
  'use strict';

  var eu = null;

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

  function dinheiro(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
    });
  }

  function quando(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
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
      var l = el('tr');
      if (aoClicar) {
        l.className = 'clicavel';
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
    document.getElementById('app').hidden = true;
    document.getElementById('entrada').hidden = false;
  }

  var criando = false;
  document.getElementById('alternar').addEventListener('click', function (evento) {
    evento.preventDefault();
    criando = !criando;
    document.getElementById('campo-nome').hidden = !criando;
    document.querySelector('#campo-nome input').required = criando;
    document.getElementById('botao-entrada').textContent = criando ? 'Criar conta' : 'Entrar';
    this.textContent = criando ? 'Ja tenho conta' : 'Nao tenho conta ainda';
  });

  document.getElementById('form-entrada').addEventListener('submit', function (evento) {
    evento.preventDefault();
    var dados = new FormData(this);
    var erro = document.getElementById('erro-entrada');
    erro.hidden = true;
    var corpo = { email: dados.get('email'), senha: dados.get('senha') };
    if (criando) corpo.nome = dados.get('nome');

    api(criando ? '/cadastro' : '/login', { method: 'POST', corpo: corpo })
      .then(function () { iniciar(); })
      .catch(function (e) {
        erro.textContent = e.message === 'sem sessao' ? 'E-mail ou senha invalidos' : e.message;
        erro.hidden = false;
      });
  });

  document.getElementById('sair').addEventListener('click', function () {
    api('/sair', { method: 'POST' }).then(mostrarEntrada).catch(mostrarEntrada);
  });

  // ------------------------------------------------------------------ hoje ---

  function verHoje() {
    var alvo = pintar('Hoje', 'Quantos leads entraram, em quais lojas, e quantos cupons falharam.');
    Promise.all([api('/hoje'), api('/alertas')]).then(function (r) {
      var lojas = r[0].lojas || [];
      var alertas = r[1] || [];

      var soma = function (campo) {
        return lojas.reduce(function (t, l) { return t + Number(l[campo] || 0); }, 0);
      };
      var cartoes = el('div', null, 'cartoes');
      [
        ['Leads hoje', soma('leads')],
        ['Cupons entregues', soma('cupons_ok')],
        ['Cupons que falharam', soma('cupons_falhos')],
        ['Lojas conectadas', lojas.length],
      ].forEach(function (par) {
        var c = el('div', null, 'cartao');
        c.appendChild(el('div', par[0], 'rotulo'));
        c.appendChild(el('div', String(par[1]), 'numero'));
        cartoes.appendChild(c);
      });
      alvo.appendChild(cartoes);

      if (alertas.length) {
        var caixa = el('div', null, 'cartao');
        caixa.appendChild(el('div', 'Alertas em aberto', 'rotulo'));
        var lista = el('ul', null, 'respostas');
        lista.style.marginTop = '10px';
        alertas.slice(0, 10).forEach(function (a) {
          var item = el('li');
          item.appendChild(el('b', quando(a.criado_em)));
          item.appendChild(document.createTextNode(a.mensagem));
          lista.appendChild(item);
        });
        caixa.appendChild(lista);
        alvo.appendChild(caixa);
      }

      alvo.appendChild(tabela(
        ['Loja', 'Plataforma', 'Leads hoje', 'Cupons ok', 'Cupons falhos'],
        lojas.map(function (l) {
          return {
            celulas: [l.nome_loja, l.plataforma, l.leads, l.cupons_ok, l.cupons_falhos],
          };
        }),
      ));
      if (!lojas.length) alvo.appendChild(el('p', 'Nenhuma loja conectada ainda.', 'vazio'));
    });
  }

  // ----------------------------------------------------------------- leads ---

  function verLeads() {
    var alvo = pintar('Leads', 'Quem conversou com o chat e o que respondeu.');
    api('/leads').then(function (leads) {
      if (!leads.length) {
        alvo.appendChild(el('p', 'Nenhum lead ainda. Assim que o widget entrar no ar na loja, eles aparecem aqui.', 'vazio'));
        return;
      }
      alvo.appendChild(tabela(
        ['Nome', 'Contato', 'Loja', 'Cupom', 'Faturado', 'Quando'],
        leads.map(function (l) {
          return {
            item: l,
            celulas: [
              l.nome,
              l.telefone || l.email || '',
              l.nome_loja,
              l.cupom ? selo(l.cupom, l.cupom_status === 'criado' ? 'criado' : 'falhou') : selo('sem cupom', 'falhou'),
              dinheiro(l.faturado),
              quando(l.criado_em),
            ],
          };
        }),
        function (lead) { location.hash = '#/lead/' + lead.id; },
      ));
    });
  }

  function verLead(id) {
    var alvo = pintar('Perfil do lead');
    api('/leads/' + id).then(function (perfil) {
      var lead = perfil.lead;
      alvo.querySelector('h2').textContent = lead.nome;
      alvo.appendChild(el('p', lead.nome_loja + ' | ' + (lead.telefone || '') + ' | ' + (lead.email || ''), 'legenda'));

      var respostas = el('div', null, 'cartao');
      respostas.appendChild(el('div', 'O que respondeu no chat', 'rotulo'));
      var lista = el('ul', null, 'respostas');
      lista.style.marginTop = '12px';
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
          respostas.appendChild(el('p', 'Falhou: ' + (perfil.cupom.erro || 'motivo nao registrado')));
        }
      }
      respostas.appendChild(el('div', 'Consentimento em ' + quando(lead.consentido_em), 'hora'));
      alvo.appendChild(respostas);

      var navegacao = el('div', null, 'cartao');
      navegacao.appendChild(el('div', 'Linha do tempo de navegacao', 'rotulo'));
      if (perfil.linhaDoTempo.length) {
        var tempo = el('ul', null, 'linha-tempo');
        tempo.style.marginTop = '14px';
        perfil.linhaDoTempo.forEach(function (evento) {
          var item = el('li');
          item.appendChild(el('div', evento.titulo || evento.tipo));
          item.appendChild(el('div', quando(evento.criado_em) + ' | ' + evento.tipo, 'hora'));
          tempo.appendChild(item);
        });
        navegacao.appendChild(tempo);
      } else {
        navegacao.appendChild(el('p',
          'Sem navegacao registrada. O rastreamento e do plano Crescimento para cima e depende do consentimento no chat.',
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
      var voltar = el('button', 'Voltar', 'secundario');
      voltar.addEventListener('click', function () { location.hash = '#/leads'; });
      var apagar = el('button', 'Apagar por pedido do titular (LGPD)', 'secundario');
      apagar.addEventListener('click', function () {
        if (!confirm('Apagar este lead e toda a navegacao dele? Nao tem volta.')) return;
        api('/leads/' + id, { method: 'DELETE' }).then(function () { location.hash = '#/leads'; });
      });
      acoes.appendChild(voltar);
      acoes.appendChild(apagar);
      alvo.appendChild(acoes);
    }).catch(function () {
      alvo.appendChild(el('p', 'Lead nao encontrado nesta conta.', 'vazio'));
    });
  }

  // ----------------------------------------------------------- integracoes ---

  var TEXTO_MODO = {
    auto: 'Instalacao automatica. Nada a fazer na loja.',
    manual: 'Precisa colar o codigo no painel da loja.',
    bloqueado: 'Nao instala nesta loja.',
    pendente: 'Ainda nao resolvido.',
  };

  function verIntegracoes() {
    var alvo = pintar('Integracoes', 'Cada plataforma instala de um jeito. O caminho certo aparece aqui.');
    api('/conexoes').then(function (conexoes) {
      if (!conexoes.length) {
        alvo.appendChild(el('p', 'Nenhuma loja conectada ainda.', 'vazio'));
      }
      conexoes.forEach(function (conexao) {
        var cartao = el('div', null, 'cartao');
        var topo = el('div');
        topo.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';
        topo.appendChild(el('strong', conexao.nome_loja));
        topo.appendChild(el('span', conexao.plataforma, 'rotulo'));
        topo.appendChild(selo(conexao.modo_instalacao, conexao.modo_instalacao));
        cartao.appendChild(topo);
        cartao.appendChild(el('p', TEXTO_MODO[conexao.modo_instalacao] || '', 'legenda'));

        if (conexao.status === 'inadimplente_plataforma') {
          var alerta = el('p', 'Esta loja esta inadimplente com a propria plataforma. Enquanto isso durar, script e webhook ficam fora do ar por decisao dela, nao nossa.');
          alerta.className = 'erro';
          cartao.appendChild(alerta);
        }
        if (conexao.detalhe_status) cartao.appendChild(el('p', conexao.detalhe_status, 'hora detalhe'));

        if (conexao.lote) {
          cartao.appendChild(el('p',
            'Lote de cupons: ' + conexao.lote.disponiveis + ' disponiveis de ' + conexao.lote.total
            + '. Esta plataforma nao cria cupom por API, entao o codigo sai deste lote.', 'legenda'));
        }

        var acoes = el('div', null, 'acoes');
        var instalar = el('button', 'Resolver instalacao');
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
        cartao.appendChild(acoes);
        alvo.appendChild(cartao);
      });
    });
  }

  function mostrarInstrucoes(cartao, resultado) {
    var antigo = cartao.querySelector('.instrucoes');
    if (antigo) antigo.remove();
    // O motivo guardado na conexao e o mesmo que volta agora, entao mostrar
    // os dois repete a mesma frase na cara do lojista.
    var detalhe = cartao.querySelector('.detalhe');
    if (detalhe) detalhe.remove();
    var caixa = el('div', null, 'instrucoes');

    if (resultado.modo === 'bloqueado') {
      caixa.appendChild(el('p', resultado.motivo, 'erro'));
      caixa.appendChild(el('p', 'Saida: ' + resultado.saida, 'legenda'));
    } else if (resultado.modo === 'auto') {
      caixa.appendChild(el('p', 'Instalado. O widget ja esta no ar.'));
      if (resultado.ressalva) caixa.appendChild(el('p', resultado.ressalva, 'legenda'));
    } else {
      var passos = el('ol', null, 'passos');
      (resultado.instrucoes || []).forEach(function (p) { passos.appendChild(el('li', p)); });
      caixa.appendChild(passos);
      if (resultado.tag) caixa.appendChild(el('pre', resultado.tag));
    }
    cartao.appendChild(caixa);
  }

  // ------------------------------------------------------------ financeiro ---

  function verFinanceiro() {
    var alvo = pintar('Financeiro', 'Quanto o chat faturou, e o que a sua conta deve.');
    api('/financeiro').then(function (dados) {
      var total = (dados.porMes || []).reduce(function (t, m) { return t + Number(m.faturado || 0); }, 0);
      var pedidos = (dados.porMes || []).reduce(function (t, m) { return t + Number(m.pedidos || 0); }, 0);

      var cartoes = el('div', null, 'cartoes');
      [
        ['Faturado pelo chat', dinheiro(total)],
        ['Pedidos atribuidos', String(pedidos)],
        ['Sua mensalidade', dados.mensalidade ? dinheiro(dados.mensalidade) : 'sem assinatura'],
        ['Plano', dados.assinatura ? dados.assinatura.plano : 'nenhum'],
      ].forEach(function (par) {
        var c = el('div', null, 'cartao');
        c.appendChild(el('div', par[0], 'rotulo'));
        c.appendChild(el('div', par[1], 'numero'));
        cartoes.appendChild(c);
      });
      alvo.appendChild(cartoes);

      if ((dados.porMes || []).length) {
        alvo.appendChild(tabela(['Mes', 'Pedidos', 'Faturado'],
          dados.porMes.map(function (m) {
            return {
              celulas: [
                new Date(m.mes).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                m.pedidos, dinheiro(m.faturado),
              ],
            };
          })));
      } else {
        alvo.appendChild(el('p', 'Nenhum pedido atribuido ao chat ainda.', 'vazio'));
      }

      if ((dados.cobrancasEmAberto || []).length) {
        var titulo = el('h2', 'Cobrancas em aberto');
        titulo.style.marginTop = '24px';
        alvo.appendChild(titulo);
        alvo.appendChild(tabela(['Tipo', 'Valor', 'Vence em', 'Origem'],
          dados.cobrancasEmAberto.map(function (c) {
            return {
              celulas: [c.tipo, dinheiro(c.valor), new Date(c.vence_em).toLocaleDateString('pt-BR'), c.origem],
            };
          })));
      }
    });
  }

  // ------------------------------------------------------------- navegacao ---

  var ROTAS = {
    '#/hoje': verHoje,
    '#/leads': verLeads,
    '#/integracoes': verIntegracoes,
    '#/financeiro': verFinanceiro,
  };

  function navegar() {
    if (!eu) return;
    var hash = location.hash || '#/hoje';
    document.querySelectorAll('nav a').forEach(function (a) {
      a.classList.toggle('ativo', a.getAttribute('href') === hash);
    });
    if (hash.indexOf('#/lead/') === 0) return verLead(hash.slice(7));
    (ROTAS[hash] || verHoje)();
  }

  window.addEventListener('hashchange', navegar);

  function iniciar() {
    api('/eu').then(function (dados) {
      eu = dados;
      document.getElementById('entrada').hidden = true;
      document.getElementById('app').hidden = false;
      document.getElementById('nome-conta').textContent = dados.conta.nome;

      var faixa = document.getElementById('faixa');
      if (dados.aviso) {
        faixa.textContent = dados.aviso.texto;
        faixa.className = dados.aviso.gravidade;
        faixa.hidden = false;
      } else {
        faixa.hidden = true;
      }
      navegar();
    }).catch(function () { /* mostrarEntrada ja foi chamado no 401 */ });
  }

  iniciar();
}());
