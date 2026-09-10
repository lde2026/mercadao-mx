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
      + '. Vi que voce pegou um cupom no nosso site e vim ver se posso ajudar.';
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

  document.getElementById('sino').addEventListener('click', function () {
    location.hash = '#/hoje';
  });

  document.getElementById('busca').addEventListener('input', function () {
    filtro = this.value.trim().toLowerCase();
    if (location.hash !== '#/leads') { location.hash = '#/leads'; return; }
    desenharLeads();
  });

  // ------------------------------------------------------------------ hoje ---

  function verHoje() {
    var alvo = pintar('Hoje', 'O que entrou, o que saiu e o que precisa de voce.');
    Promise.all([api('/hoje'), api('/alertas'), api('/leads?situacao=a_contatar&limite=1')])
      .then(function (r) {
        var lojas = r[0].lojas || [];
        var alertas = r[1] || [];
        var contagem = r[2].contagem;
        var soma = function (c) { return lojas.reduce(function (t, l) { return t + Number(l[c] || 0); }, 0); };

        var grade = el('div', null, 'grade-num');
        grade.appendChild(cartaoNumero({
          rotulo: 'Leads hoje', valor: String(soma('leads')), nomeIcone: 'leads', tom: 'acento',
          detalhe: contagem.novos + ' nas ultimas 24h',
          rodape: { texto: contagem.a_contatar + ' esperando contato', acao: 'Ver a fila' },
          aoClicarRodape: function () { abaLeads = 'a_contatar'; location.hash = '#/leads'; },
        }));
        grade.appendChild(cartaoNumero({
          rotulo: 'Cupons entregues', valor: String(soma('cupons_ok')), nomeIcone: 'cupom', tom: 'bom',
          detalhe: 'de ' + (soma('cupons_ok') + soma('cupons_falhos')) + ' tentativas hoje',
          rodape: { texto: 'Um cupom unico por pessoa' },
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
          rodape: { texto: 'Modos de instalacao', acao: 'Ver integracoes' },
          aoClicarRodape: function () { location.hash = '#/integracoes'; },
        }));
        alvo.appendChild(grade);

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
    pintar('Leads', 'Lead capturado nao e lead trabalhado. Comece pela fila de quem ainda espera.');
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
      ['contatados', 'Ja contatados', cacheLeads.contagem.contatados],
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
          ? 'Fila zerada. Todo mundo que chegou ja foi contatado.'
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
        alternar.textContent = e.dados && e.dados.motivo ? 'Painel em leitura' : 'Nao deu, tente de novo';
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
          respostas.appendChild(el('p', 'Falhou: ' + (perfil.cupom.erro || 'motivo nao registrado')));
        }
      }
      respostas.appendChild(el('div', 'Consentimento em ' + quando(lead.consentido_em), 'hora'));
      alvo.appendChild(respostas);

      var navegacao = el('div', null, 'cartao');
      navegacao.appendChild(el('div', 'Linha do tempo de navegacao', 'rotulo'));
      if (perfil.linhaDoTempo.length) {
        var tempo = el('ul', null, 'linha-tempo');
        perfil.linhaDoTempo.forEach(function (evento) {
          var item = el('li');
          item.appendChild(el('div', evento.titulo || evento.tipo));
          item.appendChild(el('div', quando(evento.criado_em) + '  |  ' + evento.tipo, 'hora'));
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
        if (!confirm('Apagar este lead e toda a navegacao dele? Nao tem volta.')) return;
        api('/leads/' + id, { method: 'DELETE' }).then(function () {
          cacheLeads = null;
          location.hash = '#/leads';
        });
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
      if (!conexoes.length) alvo.appendChild(el('p', 'Nenhuma loja conectada ainda.', 'vazio'));
      conexoes.forEach(function (conexao) {
        var cartao = el('div', null, 'cartao');
        var topo = el('div', null, 'titulo-conexao');
        topo.appendChild(el('strong', conexao.nome_loja));
        topo.appendChild(el('span', conexao.plataforma, 'rotulo'));
        topo.appendChild(selo(conexao.modo_instalacao, conexao.modo_instalacao));
        cartao.appendChild(topo);
        cartao.appendChild(el('p', TEXTO_MODO[conexao.modo_instalacao] || '', 'legenda'));

        if (conexao.status === 'inadimplente_plataforma') {
          cartao.appendChild(el('p', 'Esta loja esta inadimplente com a propria plataforma. Enquanto isso durar, script e webhook ficam fora do ar por decisao dela, nao nossa.', 'erro'));
        }
        if (conexao.detalhe_status) cartao.appendChild(el('p', conexao.detalhe_status, 'hora detalhe'));
        if (conexao.lote) {
          cartao.appendChild(el('p', 'Lote de cupons: ' + conexao.lote.disponiveis + ' disponiveis de '
            + conexao.lote.total + '. Esta plataforma nao cria cupom por API, entao o codigo sai deste lote.', 'legenda'));
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
    // O motivo guardado na conexao e o mesmo que volta agora, entao mostrar os
    // dois repete a mesma frase na cara do lojista.
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
      var meses = dados.porMes || [];
      var total = meses.reduce(function (t, m) { return t + Number(m.faturado || 0); }, 0);
      var pedidos = meses.reduce(function (t, m) { return t + Number(m.pedidos || 0); }, 0);

      var grade = el('div', null, 'grade-num');
      grade.appendChild(cartaoNumero({
        rotulo: 'Faturado pelo chat', valor: dinheiro(total), nomeIcone: 'dinheiro', tom: 'bom',
        detalhe: 'atribuido por cupom', rodape: { texto: 'Nos ultimos 12 meses' },
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Pedidos atribuidos', valor: String(pedidos), nomeIcone: 'pedido',
        detalhe: pedidos ? 'ticket medio ' + dinheiro(total / pedidos) : 'nenhum ainda',
        rodape: { texto: 'Cupom usado no carrinho' },
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Sua mensalidade', valor: dados.mensalidade ? dinheiro(dados.mensalidade) : 'sem assinatura',
        nomeIcone: 'plano', tom: 'acento',
        detalhe: dados.assinatura ? 'plano ' + dados.assinatura.plano + ', ' + dados.assinatura.ciclo : 'nenhum plano ativo',
        rodape: { texto: 'Implantacao ' + dinheiro(dados.implantacao) },
      }));
      grade.appendChild(cartaoNumero({
        rotulo: 'Situacao da conta',
        valor: dados.acesso.diasAtraso > 0 ? dados.acesso.diasAtraso + ' dias' : 'em dia',
        nomeIcone: 'relogio', tom: dados.acesso.diasAtraso > 0 ? 'ruim' : 'bom',
        detalhe: dados.acesso.motivo || 'nada em aberto',
        rodape: { texto: 'Seus leads ficam guardados sempre' },
      }));
      alvo.appendChild(grade);

      var painelMeses = el('div', null, 'cartao');
      painelMeses.appendChild(el('div', 'Faturamento por mes', 'rotulo'));
      if (meses.length) {
        painelMeses.appendChild(tabela(['Mes', 'Pedidos', 'Faturado'], meses.map(function (m) {
          return {
            celulas: [
              new Date(m.mes).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
              m.pedidos, dinheiro(m.faturado),
            ],
          };
        })));
      } else {
        painelMeses.appendChild(el('p', 'Nenhum pedido atribuido ao chat ainda.', 'vazio'));
      }
      alvo.appendChild(painelMeses);

      if ((dados.cobrancasEmAberto || []).length) {
        var abertas = el('div', null, 'cartao');
        abertas.appendChild(el('div', 'Cobrancas em aberto', 'rotulo'));
        abertas.appendChild(tabela(['Tipo', 'Valor', 'Vence em', 'Origem'],
          dados.cobrancasEmAberto.map(function (c) {
            return { celulas: [c.tipo, dinheiro(c.valor), new Date(c.vence_em).toLocaleDateString('pt-BR'), c.origem] };
          })));
        alvo.appendChild(abertas);
      }
    });
  }

  // ------------------------------------------------------------- navegacao ---

  var ROTAS = {
    '#/hoje': verHoje, '#/leads': verLeads,
    '#/integracoes': verIntegracoes, '#/financeiro': verFinanceiro,
  };

  function navegar() {
    if (!eu) return;
    var hash = location.hash || '#/hoje';
    document.querySelectorAll('nav a').forEach(function (a) {
      a.classList.toggle('ativo', a.getAttribute('href') === hash);
    });
    if (hash.indexOf('#/lead/') === 0) return verLead(hash.slice(7));
    if (hash !== '#/leads') cacheLeads = null;
    (ROTAS[hash] || verHoje)();
  }

  window.addEventListener('hashchange', navegar);

  function iniciais(nome) {
    return String(nome).trim().split(/\s+/).slice(0, 2)
      .map(function (p) { return p[0]; }).join('').toUpperCase();
  }

  function iniciar() {
    api('/eu').then(function (dados) {
      eu = dados;
      document.getElementById('entrada').hidden = true;
      document.getElementById('app').hidden = false;
      document.getElementById('nome-conta').textContent = dados.conta.nome;
      document.getElementById('avatar').textContent = iniciais(dados.conta.nome);

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
          ? 'Rastreamento de navegacao ligado.'
          : 'Rastreamento e do Crescimento para cima.';
        document.getElementById('cartao-plano').hidden = false;
      }

      api('/alertas').then(function (alertas) {
        var badge = document.getElementById('badge-alertas');
        badge.textContent = String(alertas.length);
        badge.hidden = alertas.length === 0;
      }).catch(function () {});

      navegar();
    }).catch(function () { /* mostrarEntrada ja foi chamado no 401 */ });
  }

  iniciar();
}());
