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
    document.getElementById('botao-entrada').textContent = criando ? 'Criar conta' : 'Entrar';
    document.getElementById('alternar').textContent = criando ? 'Já tenho conta' : 'Não tenho conta ainda';
  }
  document.getElementById('alternar').addEventListener('click', function (evento) {
    evento.preventDefault();
    modoEntrada(!criando);
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
    location.hash = '#/hoje';
  });

  document.getElementById('busca').addEventListener('input', function () {
    filtro = this.value.trim().toLowerCase();
    if (location.hash !== '#/leads') { location.hash = '#/leads'; return; }
    desenharLeads();
  });

  // ------------------------------------------------------------------ hoje ---

  function verHoje() {
    var alvo = pintar('Hoje', 'O que entrou, o que saiu e o que precisa de você.');
    Promise.all([api('/hoje'), api('/alertas'), api('/leads?situacao=a_contatar&limite=1')])
      .then(function (r) {
        var lojas = r[0].lojas || [];
        var alertas = r[1] || [];
        var contagem = r[2].contagem;
        var soma = function (c) { return lojas.reduce(function (t, l) { return t + Number(l[c] || 0); }, 0); };

        var grade = el('div', null, 'grade-num');
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
          'Sem navegação registrada. O rastreamento é do plano Crescimento para cima e depende do consentimento no chat.',
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

  var FLUXO_VAZIO = {
    convite: 'Ganhe cupom',
    consentimento: '',
    desconto: 10,
    recompensa: 'cupom',
    modo: 'painel',
    abrirApos: 0,
    cor: '',
    perguntas: [],
  };

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
          modo: fluxo.modo || 'painel', abrirApos: fluxo.abrir_apos || 0, cor: fluxo.cor || '',
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

    var corpo = el('div', null, 'construtor-corpo');
    corpo.appendChild(el('div', null, 'quadro'));
    corpo.appendChild(el('aside', null, 'previa'));
    caixa.appendChild(corpo);
    alvo.appendChild(caixa);

    desenharQuadro();
    desenharPrevia();
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

    var rotuloModo = el('label', 'Formato');
    var campoModo = el('select');
    [['painel', 'Janela compacta, contato no fim'], ['chat', 'Chat em popup, nome e WhatsApp primeiro']].forEach(function (par) {
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
    if (f.perguntas.length < 3) {
      quadro.appendChild(ligacao());
      var adicionar = el('button', null, 'no adicionar');
      adicionar.type = 'button';
      adicionar.appendChild(el('strong', '+ Adicionar pergunta'));
      adicionar.appendChild(el('span', f.perguntas.length + ' de 3', 'hora'));
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
    contato.querySelector('header').appendChild(el('span', f.modo === 'chat' ? 'fixo, vem primeiro' : 'fixo, sempre o último', 'no-fixo'));
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
      var botao = el('div', f.convite || 'Ganhe cupom', 'previa-botao');
      tela.appendChild(el('div', null, 'previa-loja'));
      tela.appendChild(botao);
      previa.appendChild(tela);
      previa.appendChild(el('p', 'Botao flutuante no canto da loja. Clicar abre o chat.', 'hora'));
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

  var NOME_PLATAFORMA = { nuvemshop: 'Nuvemshop', tray: 'Tray', woocommerce: 'WooCommerce', loja_integrada: 'Loja Integrada' };

  var PLATAFORMAS = [
    { id: 'nuvemshop', nome: 'Nuvemshop', resumo: 'Instalação automática e cupom por API.' },
    { id: 'tray', nome: 'Tray', resumo: 'Instalação automática e cupom por API.' },
    { id: 'woocommerce', nome: 'WooCommerce', resumo: 'Cupom por API. O widget entra pelo nosso plugin.' },
    { id: 'loja_integrada', nome: 'Loja Integrada', resumo: 'Código colado no tema e cupons em lote.' },
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
  };

  var AJUDA_CONEXAO = {
    nuvemshop: 'Sem o app na loja de aplicativos, o token sai do painel de parceiros da Nuvemshop.',
    tray: 'Os tokens vem da autorizacao do aplicativo. Sem o botão acima, gere o code em Meus aplicativos e troque pelos tokens conforme docs/tray-api.md.',
    woocommerce: 'Em WooCommerce, Configurações, Avancado e REST API, crie uma chave com permissao de leitura e escrita.',
    loja_integrada: 'A chave de API sai do painel da Loja Integrada (só em plano pago). A chave de aplicacao a equipe deles emite em 3 a 5 dias úteis.',
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
    if (bilhete) {
      var aviso = el('p', 'Fechando a conexão com a loja autorizada...', 'legenda');
      alvo.appendChild(aviso);
      api('/conexoes/oauth', { method: 'POST', corpo: { bilhete: bilhete } })
        .then(function (r) {
          aviso.textContent = r.conexao.nome_loja + ' conectada' + (r.instalacao && r.instalacao.modo === 'auto' ? ' e widget instalado.' : '.');
          aviso.className = 'ok';
          listarConexoes(alvo);
        })
        .catch(function (e) { aviso.textContent = 'Não deu para fechar a conexão: ' + e.message; aviso.className = 'erro'; listarConexoes(alvo); });
      return;
    }
    listarConexoes(alvo);
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

        if (conexao.status === 'inadimplente_plataforma') {
          cartao.appendChild(el('p', 'Esta loja esta inadimplente com a propria plataforma. Enquanto isso durar, script e webhook ficam fora do ar por decisao dela, não nossa.', 'erro'));
        }
        if (conexao.detalhe_status) cartao.appendChild(el('p', conexao.detalhe_status, 'hora detalhe'));
        if (conexao.lote) {
          cartao.appendChild(el('p', 'Lote de cupons: ' + conexao.lote.disponiveis + ' disponíveis de '
            + conexao.lote.total + '. Esta plataforma não cria cupom por API, entao o código sai deste lote.', 'legenda'));
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
        cartao.appendChild(acoes);
        if (conexao.lote) cartao.appendChild(formularioLote(conexao, function () { listarConexoes(alvo); }));
        area.appendChild(cartao);
      });
    }).catch(function (e) { area.appendChild(el('p', e.message, 'erro')); });
  }

  /** A chave publica identifica a loja no widget e no plugin. Nao e segredo, mas so aparece quando pedida. */
  function mostrarChave(cartao, conexao) {
    var antigo = cartao.querySelector('.chave-loja');
    if (antigo) { antigo.remove(); return; }
    var caixa = el('div', null, 'chave-loja instrucoes');
    caixa.appendChild(el('div', 'Chave da loja (para o plugin do WordPress)', 'rotulo'));
    caixa.appendChild(el('pre', conexao.chave_publica));
    caixa.appendChild(el('div', 'Tag para colar no tema, quando a instalação for manual', 'rotulo'));
    caixa.appendChild(el('pre', '<script async src="' + location.origin + '/widget.js?k=' + conexao.chave_publica + '"></script>'));
    cartao.appendChild(caixa);
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

    var form = el('form');
    form.appendChild(el('div', 'Conexão manual', 'rotulo'));
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
    var enviar = el('button', 'Conectar e instalar'); enviar.type = 'submit';
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
      api('/conexoes', { method: 'POST', corpo: {
        plataforma: plataforma.id, nomeLoja: String(dados.get('nomeLoja')).trim(), dominio: dominio, credenciais: credenciais,
      } }).then(function (conexao) {
        // Instalacao logo em seguida: quem conecta quer ver o chat no ar.
        return api('/conexoes/' + conexao.id + '/instalacao', { method: 'POST' }).catch(function () { return null; });
      }).then(function () { aoConectar(); })
        .catch(function (e) { erro.textContent = e.message; erro.hidden = false; enviar.disabled = false; });
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
      if (resultado.tag) caixa.appendChild(el('pre', resultado.tag));
    }
    cartao.appendChild(caixa);
  }

  // ------------------------------------------------------------ financeiro ---

  var cicloEscolhido = 'mensal';

  function verFinanceiro() {
    var alvo = pintar('Financeiro', 'Seu plano, sua cota de leads e as cobranças do Captapp.');
    api('/financeiro').then(function (dados) { desenharFinanceiro(alvo, dados); });
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
      col.appendChild(el('div', dados.implantacao.cobrada
        ? 'Implantação já cobrada'
        : '+ ' + dinheiro(dados.implantacao.valor) + ' de implantação, uma vez', 'plano-implantacao'));
      var lista = el('ul', null, 'plano-lista');
      lista.appendChild(el('li', p.leadsMes ? 'Até ' + p.leadsMes.toLocaleString('pt-BR') + ' leads por mês' : 'Leads ilimitados'));
      lista.appendChild(el('li', 'Chat com cupom único por pessoa'));
      lista.appendChild(el('li', 'Fila de leads e WhatsApp'));
      lista.appendChild(el('li', p.rastreamento ? 'Rastreamento de navegação' : 'Sem rastreamento de navegação'));
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
    if (dados.cobrancaAutomatica && !(dados.assinatura && dados.assinatura.origem === 'asaas')) {
      var doc = prompt('CPF ou CNPJ para a cobrança:');
      if (!doc) return;
      corpo.documento = doc;
    }
    api('/assinatura', { method: 'POST', corpo: corpo })
      .then(function () { return api('/financeiro'); })
      .then(function (novos) { desenharFinanceiro(alvo, novos); })
      .catch(function (e) { alert(e.message); });
  }

  // ----------------------------------------------------------------- admin ---

  /** Visao do operador: o Captapp inteiro, nao uma conta. */
  function verAdmin() {
    var alvo = pintar('Admin', 'O Captapp inteiro: assinantes, receita, inadimplência e o que precisa de atenção.');
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
        detalhe: 'anual contado por doze avos',
        rodape: { texto: 'Só mensalidades, sem implantação' },
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
        rodape: { texto: 'Um por conta, na tela Hoje de cada uma' },
      }));
      alvo.appendChild(grade);

      var porPlano = el('div', null, 'cartao');
      porPlano.appendChild(el('div', 'Assinantes por plano', 'rotulo'));
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
        ['Conta', 'Plano', 'Leads no mês', 'Total', 'Último lead', 'Lojas', 'Atraso', ''],
        contas.map(function (c) {
          var entrar = el('button', 'Entrar como', 'secundario');
          entrar.type = 'button';
          entrar.style.padding = '6px 10px';
          entrar.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!confirm('Entrar na conta ' + c.nome + ' como operador? Fica registrado.')) return;
            api('/admin/contas/' + c.id + '/entrar', { method: 'POST' }).then(function () {
              cacheLeads = null; construtor = null;
              location.hash = '#/hoje';
              iniciar();
            });
          });
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
            entrar,
          ] };
        }),
      ));
      alvo.appendChild(lista);
    }).catch(function (e) {
      alvo.appendChild(el('p', e.message === 'somente operador' ? 'Esta tela é só do operador do Captapp.' : e.message, 'vazio'));
    });
  }

  // ------------------------------------------------------------- navegacao ---

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
    '#/hoje': verHoje, '#/leads': verLeads, '#/chat': verChat,
    '#/integracoes': verIntegracoes, '#/financeiro': verFinanceiro, '#/admin': verAdmin,
    '#/configuracoes': verConfiguracoes,
  };

  function navegar() {
    if (!eu) { abrirNovaSenhaSePedido(); return; }
    var hash = (location.hash || '#/hoje').split('?')[0];
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
    api('/eu').then(function (dados) {
      eu = dados;
      document.getElementById('entrada').hidden = true;
      document.getElementById('app').hidden = false;
      document.getElementById('nome-conta').textContent = dados.conta.nome;
      document.getElementById('avatar').textContent = iniciais(dados.conta.nome);
      document.getElementById('menu-admin').hidden = !dados.conta.operador;

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
