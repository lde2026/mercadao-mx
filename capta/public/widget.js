/**
 * Widget de captacao do Captapp.
 *
 * Este arquivo e baixado por todo visitante de toda loja cliente. Ele mexe no
 * tempo de carregamento do site de outra pessoa, e isso afeta o Google dela.
 * Por isso: nenhuma dependencia, Shadow DOM para o CSS do tema nao vazar nem
 * para dentro nem para fora, prazo de 3 segundos com desistencia em silencio,
 * e nada nosso no console da loja.
 *
 * Dois formatos, escolhidos pelo lojista: "painel", a janela compacta com o
 * contato no fim; e "chat", o popup em baloes no formato do projeto original,
 * com nome e WhatsApp como primeiras perguntas.
 *
 * O try catch de fora nao e preguica. E a garantia de que um erro nosso nunca
 * quebra a pagina de venda de ninguem.
 */
(function () {
  'use strict';
  try {
    var script = document.currentScript;
    if (!script) {
      var todos = document.querySelectorAll('script[src*="widget.js"]');
      script = todos[todos.length - 1];
    }
    if (!script) return;

    var origem = new URL(script.src, location.href);
    var chave = origem.searchParams.get('k');
    if (!chave) return;
    var api = origem.origin;

    var CHAVE_ANON = 'capta_anon';
    var CHAVE_FEITO = 'capta_feito_' + chave;
    var CHAVE_VISTO = 'capta_visto_' + chave;
    var CHAVE_CLICOU = 'capta_clicou_' + chave;

    function guardado(nome) {
      try { return localStorage.getItem(nome); } catch (e) { return null; }
    }
    function guardar(nome, valor) {
      try { localStorage.setItem(nome, valor); } catch (e) { /* modo anonimo */ }
    }

    function anonimo() {
      var id = guardado(CHAVE_ANON);
      if (!id) {
        id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        guardar(CHAVE_ANON, id);
      }
      return id;
    }

    function buscar(caminho, opcoes) {
      var config = opcoes || {};
      config.signal = AbortSignal.timeout(3000);
      config.mode = 'cors';
      return fetch(api + caminho, config);
    }

    // O rastreador e carregado daqui, e nao por uma segunda tag na loja, para
    // a instalacao ser uma linha so em qualquer plataforma. Quem decide se
    // ele entra e o servidor, pelo plano da conta, entao o script nem e
    // baixado onde o rastreamento esta desligado.
    function carregarRastreador() {
      if (window.__captaRastreando) return;
      var tag = document.createElement('script');
      tag.async = true;
      tag.src = api + '/rastreador.js?k=' + encodeURIComponent(chave);
      (document.head || document.body).appendChild(tag);
    }

    buscar('/w/fluxo/' + chave)
      .then(function (r) { return r.ok && r.status !== 204 ? r.json() : null; })
      .then(function (fluxo) {
        if (!fluxo) return;
        if (fluxo.rastrear) carregarRastreador();
        // Quem ja pegou o beneficio nao ve o convite de novo. Ele e unico por
        // pessoa, entao insistir so gasta a paciencia de quem ja converteu.
        // A navegacao dessa pessoa continua valendo, por isso o rastreador
        // sobe antes desta trava.
        if (guardado(CHAVE_FEITO)) return;
        montar(fluxo);
      })
      .catch(function () { /* API fora do ar: a loja segue como se nada existisse */ });

    // O que muda por beneficio: a pergunta de contato, o botao e a tela final.
    var TEXTOS = {
      cupom: ['Onde eu te mando o cupom?', 'Quero meu cupom', 'Pronto! Use este cupom no carrinho:'],
      frete_gratis: ['Onde eu te mando o cupom?', 'Quero frete grátis', 'Pronto! Use este cupom e o frete sai de graça:'],
      diagnostico: ['Onde a gente fala com você?', 'Quero meu diagnóstico', 'Recebemos suas respostas. Em breve um especialista manda seu diagnóstico no WhatsApp.'],
      especialista: ['Onde a gente fala com você?', 'Falar com especialista', 'Recebemos seus dados. Um especialista vai falar com você no WhatsApp em breve.'],
      consultoria: ['Onde a gente fala com você?', 'Quero a consultoria', 'Recebemos suas respostas. Vamos combinar sua consultoria pelo WhatsApp em breve.'],
    };

    var ESTILO = [
      ':host{all:initial}',
      '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
      /* botao flutuante */
      '.b{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:0;border-radius:999px;',
      'padding:14px 20px;font-size:15px;font-weight:600;color:#fff;background:var(--cor,#15803d);',
      'box-shadow:0 8px 26px rgba(21,128,61,.38);cursor:pointer;line-height:1.2;max-width:calc(100vw - 32px);',
      'text-align:left;transition:transform .15s ease;transform-origin:70% 70%}',
      '.b:hover{transform:translateY(-2px)}',
      /* treme como telefone tocando ate o primeiro clique */
      '@keyframes toca{0%,100%{transform:rotate(0)}8%{transform:rotate(-9deg)}16%{transform:rotate(9deg)}24%{transform:rotate(-7deg)}',
      '32%{transform:rotate(7deg)}40%{transform:rotate(-3deg)}48%{transform:rotate(3deg)}56%{transform:rotate(0)}}',
      '.b.toca{animation:toca 2.6s ease-in-out infinite}',
      '@media(prefers-reduced-motion:reduce){.b.toca{animation:none}}',
      /* formato painel */
      '.p{position:fixed;right:16px;bottom:16px;z-index:2147483001;width:340px;max-width:calc(100vw - 32px);',
      'background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.3);overflow:hidden;',
      'display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 32px))}',
      '.h{background:var(--cor,#15803d);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}',
      '.h strong{font-size:15px;font-weight:600;flex:1;line-height:1.3}',
      '.x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;opacity:.85;padding:0 2px}',
      '.c{padding:16px;overflow-y:auto;flex:1}',
      '.q{font-size:15px;color:#111;margin-bottom:12px;line-height:1.4;font-weight:500}',
      '.o{display:block;width:100%;text-align:left;padding:11px 14px;margin-bottom:8px;border:1px solid #dcdcdc;',
      'border-radius:10px;background:#fff;font-size:14px;color:#111;cursor:pointer;line-height:1.3}',
      '.o:hover{border-color:var(--cor,#15803d);background:#fafafa}',
      'label{display:block;font-size:12px;color:#666;margin:10px 0 4px}',
      'input{width:100%;padding:11px 12px;border:1px solid #dcdcdc;border-radius:10px;font-size:16px;color:#111;background:#fff}',
      'input:focus{outline:2px solid var(--cor,#15803d);outline-offset:-1px;border-color:transparent}',
      '.lgpd{font-size:11px;color:#777;line-height:1.45;margin:12px 0 10px}',
      '.s{width:100%;padding:13px;border:0;border-radius:10px;background:var(--cor,#15803d);color:#fff;font-size:15px;font-weight:600;cursor:pointer}',
      '.s[disabled]{opacity:.55;cursor:default}',
      '.cup{text-align:center;padding:8px 0}',
      '.cod{font-size:26px;font-weight:700;letter-spacing:2px;color:#111;margin:12px 0;padding:14px;',
      'border:2px dashed var(--cor,#15803d);border-radius:12px;word-break:break-all}',
      '.msg{font-size:14px;color:#444;line-height:1.5}',
      '.pr{height:3px;background:#eee;border-radius:2px;overflow:hidden;margin-bottom:14px}',
      '.pr i{display:block;height:100%;background:var(--cor,#15803d);transition:width .25s ease}',
      /* formato chat */
      '.ov{position:fixed;inset:0;z-index:2147483001;background:rgba(20,22,40,.55);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.cx{width:100%;max-width:440px;height:min(640px,92vh);background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35)}',
      '.ch{background:var(--cor,#15803d);color:#fff;padding:13px 16px;display:flex;align-items:center;gap:10px}',
      '.ch .av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.22);display:grid;place-items:center;font-weight:700;font-size:15px;flex:none}',
      '.ch div{flex:1;min-width:0}.ch b{font-size:15px;display:block;line-height:1.2}.ch small{font-size:12px;opacity:.85}',
      '.ch small::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;margin-right:5px}',
      '.ms{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#f5f6f8}',
      '.bb{max-width:86%;padding:11px 14px;border-radius:16px;font-size:14px;line-height:1.45;animation:sobe .2s ease-out}',
      '.bb.bot{align-self:flex-start;background:#fff;color:#111;border-bottom-left-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.06)}',
      '.bb.eu{align-self:flex-end;background:var(--cor,#15803d);color:#fff;border-bottom-right-radius:4px;font-weight:600}',
      '.bb.lgpd{font-size:11px;color:#777;background:transparent;box-shadow:none;padding:0 4px;max-width:100%;margin:0}',
      '.bb .cod{font-size:22px;margin:8px 0 4px}',
      '@keyframes sobe{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '.dg{align-self:flex-start;background:#fff;padding:12px 14px;border-radius:16px;border-bottom-left-radius:4px;display:flex;gap:4px}',
      '.dg i{width:6px;height:6px;border-radius:50%;background:#aaa;animation:pisca 1s infinite}.dg i:nth-child(2){animation-delay:.15s}.dg i:nth-child(3){animation-delay:.3s}',
      '@keyframes pisca{0%,80%,100%{opacity:.25}40%{opacity:1}}',
      '.rs{padding:12px 16px;background:#fff;border-top:1px solid #eee}',
      '.ps{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}',
      '.ps button{border:1.5px solid var(--cor,#15803d);background:#fff;color:var(--cor,#15803d);border-radius:999px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer}',
      '.ps button:hover{background:var(--cor,#15803d);color:#fff}',
      '.ps button.leve{border-color:#dcdcdc;color:#666}',
      '.cp{display:flex;gap:8px}.cp input{border-radius:999px;padding:11px 14px}',
      '.cp button{border:0;border-radius:999px;background:var(--cor,#15803d);color:#fff;font-weight:700;padding:0 18px;cursor:pointer;font-size:14px}',
      '.zap{display:block;margin-top:12px;text-align:center;background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:999px}',
      '.er{font-size:12px;color:#c0392b;min-height:16px;margin-top:6px}',
      '@media(max-width:480px){.ov{padding:0}.cx{max-width:none;height:100%;border-radius:0}',
      '.p{right:8px;left:8px;bottom:8px;width:auto;max-width:none}',
      '.b{right:8px;left:8px;bottom:8px;max-width:none;text-align:center}}',
    ].join('');

    function el(tag, classe, texto) {
      var n = document.createElement(tag);
      if (classe) n.className = classe;
      if (texto != null) n.textContent = texto;
      return n;
    }

    function chamar(nome, arg) {
      if (typeof window[nome] === 'function') {
        try { window[nome](arg); } catch (e) { /* codigo do lojista, nao nosso */ }
      }
    }

    function enviarLead(dados) {
      return buscar('/w/lead/' + chave, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: dados.nome, email: dados.email || '', telefone: dados.telefone || '',
          respostas: dados.respostas, anonimoId: anonimo(), consentimento: true,
        }),
      }).then(function (r) { return r.json(); });
    }

    function montar(fluxo) {
      var textos = TEXTOS[fluxo.recompensa] || TEXTOS.cupom;
      var hospedeiro = document.createElement('div');
      hospedeiro.setAttribute('data-capta', '');
      // Aberto e nao fechado: o isolamento de CSS e identico, e fechado so
      // cega o suporte e o dono da loja na hora de investigar.
      var raiz = hospedeiro.attachShadow({ mode: 'open' });
      var estilo = document.createElement('style');
      estilo.textContent = ESTILO;
      raiz.appendChild(estilo);
      document.body.appendChild(hospedeiro);

      var perguntas = (fluxo.perguntas || []).slice(0, 3);
      var comCupom = fluxo.recompensa === 'cupom' || fluxo.recompensa === 'frete_gratis';

      var botao = el('button', 'b', fluxo.convite || 'Ganhe benefícios');
      botao.type = 'button';
      if (fluxo.cor) botao.style.setProperty('--cor', fluxo.cor);
      // Treme ate o primeiro clique, e nunca mais nas proximas visitas.
      if (!guardado(CHAVE_CLICOU)) botao.classList.add('toca');
      botao.addEventListener('click', function () {
        guardar(CHAVE_CLICOU, '1');
        botao.classList.remove('toca');
        abrir();
      });
      raiz.appendChild(botao);

      var aberto = null;
      function abrir() {
        if (aberto) return;
        guardar(CHAVE_VISTO, '1');
        botao.style.display = 'none';
        aberto = fluxo.modo === 'chat' ? abrirChat() : abrirPainel();
      }
      function fechar() {
        if (!aberto) return;
        aberto.remove();
        aberto = null;
        document.body.style.overflow = '';
        botao.style.display = '';
      }

      // Abre sozinho uma vez por navegador, como o popup original fazia.
      if (fluxo.abrirApos > 0 && !guardado(CHAVE_VISTO)) {
        setTimeout(function () {
          guardar(CHAVE_CLICOU, '1');
          botao.classList.remove('toca');
          abrir();
        }, fluxo.abrirApos * 1000);
      }

      function telaFinal(area, dados, primeiro) {
        area.textContent = '';
        var caixa = el('div', 'cup');
        if (dados && dados.cupom) {
          caixa.appendChild(el('p', 'msg', textos[2]));
          caixa.appendChild(el('div', 'cod', dados.cupom));
          caixa.appendChild(el('p', 'msg', 'Ele é só seu e vale uma vez.'));
        } else {
          caixa.appendChild(el('p', 'msg', !comCupom
            ? textos[2]
            : 'Recebemos seus dados' + (primeiro ? ', ' + primeiro : '') + '. Seu cupom chega em instantes no WhatsApp e no e-mail que você deixou.'));
        }
        // Beneficio de contato humano com WhatsApp da loja: quem quer falar
        // agora nao precisa esperar a loja ligar.
        if (!comCupom && /^\d{10,15}$/.test(String(fluxo.whatsapp || ''))) {
          var zap = el('a', 'zap', 'Falar agora no WhatsApp');
          zap.href = 'https://wa.me/' + (fluxo.whatsapp.length <= 11 ? '55' : '') + fluxo.whatsapp
            + '?text=' + encodeURIComponent('Oi! Acabei de responder o chat no site e quero ' + textos[1].toLowerCase().replace(/^quero /, '') + '.');
          zap.target = '_blank'; zap.rel = 'noopener';
          caixa.appendChild(zap);
        }
        area.appendChild(caixa);
      }

      // ------------------------------------------------------------ painel ---

      function abrirPainel() {
        var painel = el('div', 'p');
        painel.setAttribute('role', 'dialog');
        painel.setAttribute('aria-label', fluxo.convite || 'Ganhe benefícios');
        if (fluxo.cor) painel.style.setProperty('--cor', fluxo.cor);
        var cab = el('div', 'h');
        cab.appendChild(el('strong', null, fluxo.convite || 'Ganhe benefícios'));
        var x = el('button', 'x', '×');
        x.type = 'button'; x.setAttribute('aria-label', 'Fechar');
        x.addEventListener('click', fechar);
        cab.appendChild(x);
        painel.appendChild(cab);
        var area = el('div', 'c');
        painel.appendChild(area);
        raiz.appendChild(painel);

        var respostas = [];
        var passo = 0;

        function desenhar() {
          area.textContent = '';
          var barra = el('div', 'pr');
          var dentro = document.createElement('i');
          dentro.style.width = Math.round((passo / (perguntas.length + 1)) * 100) + '%';
          barra.appendChild(dentro);
          area.appendChild(barra);
          if (passo < perguntas.length) desenharPergunta(perguntas[passo]);
          else desenharContato();
        }

        function desenharPergunta(pergunta) {
          area.appendChild(el('div', 'q', pergunta.texto));
          var opcoes = pergunta.opcoes || [];
          if (!opcoes.length) {
            var campo = document.createElement('input');
            campo.type = 'text'; campo.maxLength = 120; campo.placeholder = 'Escreva aqui';
            var seguir = el('button', 's', 'Continuar');
            seguir.type = 'button'; seguir.style.marginTop = '10px';
            var responder = function () {
              var valor = campo.value.trim();
              if (!valor) { campo.focus(); return; }
              respostas.push({ pergunta: pergunta.texto, resposta: valor });
              passo += 1; desenhar();
            };
            seguir.addEventListener('click', responder);
            campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') responder(); });
            area.appendChild(campo); area.appendChild(seguir); campo.focus();
            return;
          }
          opcoes.forEach(function (opcao) {
            var escolha = el('button', 'o', opcao);
            escolha.type = 'button';
            escolha.addEventListener('click', function () {
              respostas.push({ pergunta: pergunta.texto, resposta: opcao });
              passo += 1; desenhar();
            });
            area.appendChild(escolha);
          });
        }

        function desenharContato() {
          area.appendChild(el('div', 'q', textos[0]));
          var entradas = {};
          [['nome', 'Seu nome', 'text', 'Renata'], ['telefone', 'WhatsApp', 'tel', '(41) 99999-0000'], ['email', 'E-mail', 'email', 'renata@email.com.br']]
            .forEach(function (campo) {
              var rotulo = el('label', null, campo[1]);
              var entrada = document.createElement('input');
              entrada.type = campo[2]; entrada.placeholder = campo[3];
              entrada.autocomplete = campo[0] === 'nome' ? 'name' : campo[0];
              rotulo.appendChild(entrada); area.appendChild(rotulo);
              entradas[campo[0]] = entrada;
            });
          // A linha de consentimento fica antes do botao e o clique nele e o
          // aceite, que e o que o texto diz.
          area.appendChild(el('p', 'lgpd', fluxo.consentimento));
          var enviar = el('button', 's', textos[1]);
          enviar.type = 'button';
          enviar.addEventListener('click', function () {
            var nome = entradas.nome.value.trim();
            var email = entradas.email.value.trim();
            var telefone = entradas.telefone.value.trim();
            if (!nome || (!email && !telefone)) { entradas.nome.focus(); return; }
            enviar.disabled = true; enviar.textContent = 'Só um instante...';
            chamar('__captaConsentir');
            enviarLead({ nome: nome, email: email, telefone: telefone, respostas: respostas })
              .then(function (dados) {
                guardar(CHAVE_FEITO, '1');
                if (dados && dados.leadId) chamar('__captaIdentificar', dados.leadId);
                telaFinal(area, dados, nome.split(' ')[0]);
              })
              .catch(function () {
                // O lead pode ter sido gravado mesmo com a resposta perdida no
                // caminho, entao a mensagem nao promete nem nega o cupom.
                enviar.disabled = false; enviar.textContent = 'Tentar de novo';
              });
          });
          area.appendChild(enviar);
          entradas.nome.focus();
        }

        desenhar();
        return painel;
      }

      // -------------------------------------------------------------- chat ---

      function abrirChat() {
        var ov = el('div', 'ov');
        var cx = el('div', 'cx');
        cx.setAttribute('role', 'dialog');
        if (fluxo.cor) cx.style.setProperty('--cor', fluxo.cor);
        var cab = el('div', 'ch');
        var av = el('div', 'av', (fluxo.loja || 'C').charAt(0).toUpperCase());
        var tit = document.createElement('div');
        tit.appendChild(el('b', null, fluxo.convite || 'Ganhe benefícios'));
        tit.appendChild(el('small', null, 'Online agora'));
        var x = el('button', 'x', '×');
        x.type = 'button'; x.setAttribute('aria-label', 'Fechar');
        x.addEventListener('click', fechar);
        cab.appendChild(av); cab.appendChild(tit); cab.appendChild(x);
        var ms = el('div', 'ms');
        var rs = el('div', 'rs');
        cx.appendChild(cab); cx.appendChild(ms); cx.appendChild(rs);
        ov.appendChild(cx);
        ov.addEventListener('click', function (e) { if (e.target === ov) fechar(); });
        raiz.appendChild(ov);
        document.body.style.overflow = 'hidden';

        var dados = { nome: '', telefone: '', email: '', respostas: [] };
        var rolar = function () { ms.scrollTop = ms.scrollHeight; };

        function bot(texto, classe) {
          return new Promise(function (ok) {
            var dg = el('div', 'dg');
            dg.appendChild(document.createElement('i')); dg.appendChild(document.createElement('i')); dg.appendChild(document.createElement('i'));
            ms.appendChild(dg); rolar();
            setTimeout(function () {
              dg.remove();
              ms.appendChild(el('div', 'bb bot' + (classe ? ' ' + classe : ''), texto)); rolar(); ok();
            }, Math.min(900, 300 + texto.length * 6));
          });
        }
        function eu(texto) { ms.appendChild(el('div', 'bb eu', texto)); rolar(); }

        function perguntar(config) {
          return new Promise(function (ok) {
            rs.textContent = '';
            var linha = el('div', 'cp');
            var campo = document.createElement('input');
            campo.type = config.tipo || 'text'; campo.placeholder = config.dica || ''; campo.maxLength = 120;
            if (config.tipo === 'tel') campo.inputMode = 'tel';
            var btn = el('button', null, 'Enviar'); btn.type = 'button';
            linha.appendChild(campo); linha.appendChild(btn);
            var erro = el('div', 'er');
            rs.appendChild(linha); rs.appendChild(erro);
            if (config.pular) {
              var ps = el('div', 'ps');
              var pular = el('button', 'leve', config.pular); pular.type = 'button';
              pular.addEventListener('click', function () { rs.textContent = ''; ok(''); });
              ps.appendChild(pular); rs.appendChild(ps);
            }
            var ir = function () {
              var v = campo.value.trim();
              if (!v) { campo.focus(); return; }
              if (config.validar) { var e = config.validar(v); if (e) { erro.textContent = e; return; } }
              if (config.formatar) v = config.formatar(v);
              rs.textContent = ''; eu(v); ok(v);
            };
            btn.addEventListener('click', ir);
            campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') ir(); });
            campo.focus();
          });
        }

        function escolher(opcoes) {
          return new Promise(function (ok) {
            rs.textContent = '';
            var ps = el('div', 'ps');
            opcoes.forEach(function (o) {
              var b = el('button', null, o); b.type = 'button';
              b.addEventListener('click', function () { rs.textContent = ''; eu(o); ok(o); });
              ps.appendChild(b);
            });
            rs.appendChild(ps); rolar();
          });
        }

        var telefoneOk = function (v) {
          var d = v.replace(/\D/g, '');
          return d.length === 10 || d.length === 11 ? null : 'Digite DDD e número, 10 ou 11 dígitos.';
        };
        var telefoneFmt = function (v) {
          var d = v.replace(/\D/g, '');
          return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
        };
        var emailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? null : 'Confere o e-mail? Precisa ter @ e um domínio.'; };

        (async function fluxoChat() {
          await bot('Oi! ' + (fluxo.convite || 'Ganhe benefícios') + '. Leva menos de um minuto.');
          ms.appendChild(el('div', 'bb lgpd', fluxo.consentimento)); rolar();
          await bot('Pra começar, qual é o seu nome?');
          dados.nome = await perguntar({ dica: 'Seu nome' });
          // O aceite e a primeira resposta, dada com a linha de consentimento
          // a vista logo acima.
          chamar('__captaConsentir');
          var primeiro = dados.nome.split(' ')[0];
          await bot('Prazer, ' + primeiro + '! E o seu WhatsApp?');
          dados.telefone = await perguntar({ dica: 'DDD + número', tipo: 'tel', validar: telefoneOk, formatar: telefoneFmt });

          for (var i = 0; i < perguntas.length; i += 1) {
            await bot(perguntas[i].texto);
            var resposta = perguntas[i].opcoes && perguntas[i].opcoes.length
              ? await escolher(perguntas[i].opcoes)
              : await perguntar({ dica: 'Escreva aqui' });
            dados.respostas.push({ pergunta: perguntas[i].texto, resposta: resposta });
          }

          await bot(comCupom
            ? 'Se quiser, deixe um e-mail para receber o cupom também por lá.'
            : 'Se quiser, deixe um e-mail para a gente falar com você também por lá.');
          dados.email = await perguntar({ dica: 'seu@email.com.br', tipo: 'email', validar: emailOk, pular: 'Pular' });

          var dg = el('div', 'dg');
          dg.appendChild(document.createElement('i')); dg.appendChild(document.createElement('i')); dg.appendChild(document.createElement('i'));
          ms.appendChild(dg); rolar();
          var retorno = null;
          try { retorno = await enviarLead(dados); } catch (e) { retorno = null; }
          dg.remove();
          guardar(CHAVE_FEITO, '1');
          if (retorno && retorno.leadId) chamar('__captaIdentificar', retorno.leadId);

          if (retorno && retorno.cupom) {
            var balao = el('div', 'bb bot');
            balao.appendChild(el('div', null, textos[2]));
            balao.appendChild(el('div', 'cod', retorno.cupom));
            balao.appendChild(el('div', null, 'Ele é só seu e vale uma vez.'));
            ms.appendChild(balao); rolar();
          } else {
            await bot(!comCupom
              ? textos[2]
              : 'Recebemos seus dados, ' + primeiro + '. Seu cupom chega em instantes no WhatsApp' + (dados.email ? ' e no e-mail' : '') + '.');
          }
          var ps = el('div', 'ps');
          var fecharB = el('button', null, 'Fechar'); fecharB.type = 'button';
          fecharB.addEventListener('click', fechar);
          ps.appendChild(fecharB); rs.appendChild(ps);
        }()).catch(function () { /* silencio: nada nosso no console da loja */ });

        return ov;
      }
    }
  } catch (e) {
    // Silencio proposital. Nenhum erro nosso aparece no console da loja.
  }
}());
