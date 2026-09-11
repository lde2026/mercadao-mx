/**
 * Widget de captacao do Capta.
 *
 * Este arquivo e baixado por todo visitante de toda loja cliente. Ele mexe no
 * tempo de carregamento do site de outra pessoa, e isso afeta o Google dela.
 * Por isso: nenhuma dependencia, Shadow DOM para o CSS do tema nao vazar nem
 * para dentro nem para fora, prazo de 3 segundos com desistencia em silencio,
 * e nada nosso no console da loja.
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

    function guardado(nome) {
      try { return localStorage.getItem(nome); } catch (e) { return null; }
    }
    function guardar(nome, valor) {
      try { localStorage.setItem(nome, valor); } catch (e) { /* modo anonimo */ }
    }

    // Quem ja pegou o cupom nao ve o convite de novo. Cupom e unico por
    // pessoa, entao insistir so gasta a paciencia de quem ja converteu.
    if (guardado(CHAVE_FEITO)) return;

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

    buscar('/w/fluxo/' + chave)
      .then(function (r) { return r.ok && r.status !== 204 ? r.json() : null; })
      .then(function (fluxo) { if (fluxo) montar(fluxo); })
      .catch(function () { /* API fora do ar: a loja segue como se nada existisse */ });

    // ------------------------------------------------------------ interface ---

    var ESTILO = [
      ':host{all:initial}',
      '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
      '.b{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:0;border-radius:999px;',
      'padding:14px 20px;font-size:15px;font-weight:600;color:#fff;background:var(--cor,#111);',
      'box-shadow:0 6px 24px rgba(0,0,0,.28);cursor:pointer;line-height:1.2;max-width:calc(100vw - 32px);',
      'text-align:left;transition:transform .15s ease}',
      '.b:hover{transform:translateY(-2px)}',
      '.p{position:fixed;right:16px;bottom:16px;z-index:2147483001;width:340px;max-width:calc(100vw - 32px);',
      'background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.3);overflow:hidden;',
      'display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 32px))}',
      '.h{background:var(--cor,#111);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}',
      '.h strong{font-size:15px;font-weight:600;flex:1;line-height:1.3}',
      '.x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;',
      'opacity:.85;padding:0 2px}',
      '.c{padding:16px;overflow-y:auto;flex:1}',
      '.q{font-size:15px;color:#111;margin-bottom:12px;line-height:1.4;font-weight:500}',
      '.o{display:block;width:100%;text-align:left;padding:11px 14px;margin-bottom:8px;border:1px solid #dcdcdc;',
      'border-radius:10px;background:#fff;font-size:14px;color:#111;cursor:pointer;line-height:1.3}',
      '.o:hover{border-color:var(--cor,#111);background:#fafafa}',
      'label{display:block;font-size:12px;color:#666;margin:10px 0 4px}',
      'input{width:100%;padding:11px 12px;border:1px solid #dcdcdc;border-radius:10px;font-size:16px;color:#111;background:#fff}',
      'input:focus{outline:2px solid var(--cor,#111);outline-offset:-1px;border-color:transparent}',
      '.lgpd{font-size:11px;color:#777;line-height:1.45;margin:12px 0 10px}',
      '.s{width:100%;padding:13px;border:0;border-radius:10px;background:var(--cor,#111);color:#fff;',
      'font-size:15px;font-weight:600;cursor:pointer}',
      '.s[disabled]{opacity:.55;cursor:default}',
      '.cup{text-align:center;padding:8px 0}',
      '.cod{font-size:26px;font-weight:700;letter-spacing:2px;color:#111;margin:12px 0;',
      'padding:14px;border:2px dashed var(--cor,#111);border-radius:12px;word-break:break-all}',
      '.msg{font-size:14px;color:#444;line-height:1.5}',
      '.pr{height:3px;background:#eee;border-radius:2px;overflow:hidden;margin-bottom:14px}',
      '.pr i{display:block;height:100%;background:var(--cor,#111);transition:width .25s ease}',
      '@media(max-width:420px){.p{right:8px;left:8px;bottom:8px;width:auto;max-width:none}',
      '.b{right:8px;left:8px;bottom:8px;max-width:none;text-align:center}}',
    ].join('');

    // O que muda por beneficio: a pergunta de contato, o botao e a tela final.
    var TEXTOS = {
      cupom: ['Onde eu te mando o cupom?', 'Quero meu cupom', 'Pronto! Use este cupom no carrinho:'],
      frete_gratis: ['Onde eu te mando o cupom?', 'Quero frete gr\u00e1tis', 'Pronto! Use este cupom e o frete sai de gra\u00e7a:'],
      diagnostico: ['Onde a gente fala com voc\u00ea?', 'Quero meu diagn\u00f3stico', 'Recebemos suas respostas. Em breve um especialista manda seu diagn\u00f3stico no WhatsApp.'],
      especialista: ['Onde a gente fala com voc\u00ea?', 'Falar com especialista', 'Recebemos seus dados. Um especialista vai falar com voc\u00ea no WhatsApp em breve.'],
      consultoria: ['Onde a gente fala com voc\u00ea?', 'Quero a consultoria', 'Recebemos suas respostas. Vamos combinar sua consultoria pelo WhatsApp em breve.'],
    };

    function montar(fluxo) {
      var textos = TEXTOS[fluxo.recompensa] || TEXTOS.cupom;
      var hospedeiro = document.createElement('div');
      hospedeiro.setAttribute('data-capta', '');
      // Aberto e nao fechado: o isolamento de CSS e identico, porque nenhum
      // seletor do tema atravessa shadow DOM nos dois casos. O que muda e que
      // fechado tambem cega o suporte e o dono da loja na hora de investigar
      // um problema na loja dele, e isso custa mais do que protege.
      var raiz = hospedeiro.attachShadow({ mode: 'open' });
      var estilo = document.createElement('style');
      estilo.textContent = ESTILO;
      raiz.appendChild(estilo);
      document.body.appendChild(hospedeiro);

      var perguntas = (fluxo.perguntas || []).slice(0, 3);
      var respostas = [];
      var passo = 0;

      var botao = document.createElement('button');
      botao.className = 'b';
      botao.type = 'button';
      botao.textContent = fluxo.convite || 'Ganhe cupom';
      if (fluxo.cor) botao.style.setProperty('--cor', fluxo.cor);
      botao.addEventListener('click', abrir);
      raiz.appendChild(botao);

      var painel = null;

      function abrir() {
        botao.style.display = 'none';
        painel = document.createElement('div');
        painel.className = 'p';
        painel.setAttribute('role', 'dialog');
        painel.setAttribute('aria-label', fluxo.convite || 'Ganhe cupom');
        if (fluxo.cor) painel.style.setProperty('--cor', fluxo.cor);
        painel.innerHTML = '<div class="h"><strong></strong>'
          + '<button class="x" type="button" aria-label="Fechar">&times;</button></div>'
          + '<div class="c"></div>';
        painel.querySelector('strong').textContent = fluxo.convite || 'Ganhe cupom';
        painel.querySelector('.x').addEventListener('click', fechar);
        raiz.appendChild(painel);
        desenhar();
      }

      function fechar() {
        if (painel) painel.remove();
        painel = null;
        botao.style.display = '';
      }

      function corpo() { return painel.querySelector('.c'); }

      function progresso() {
        var total = perguntas.length + 1;
        var barra = document.createElement('div');
        barra.className = 'pr';
        var dentro = document.createElement('i');
        dentro.style.width = Math.round((passo / total) * 100) + '%';
        barra.appendChild(dentro);
        return barra;
      }

      function desenhar() {
        var area = corpo();
        area.textContent = '';
        area.appendChild(progresso());
        if (passo < perguntas.length) desenharPergunta(area, perguntas[passo]);
        else desenharContato(area);
      }

      function desenharPergunta(area, pergunta) {
        var titulo = document.createElement('div');
        titulo.className = 'q';
        titulo.textContent = pergunta.texto;
        area.appendChild(titulo);

        var opcoes = pergunta.opcoes || [];

        // Pergunta sem opcoes e de resposta livre: um campo e um botao.
        if (!opcoes.length) {
          var campo = document.createElement('input');
          campo.type = 'text';
          campo.maxLength = 120;
          campo.placeholder = 'Escreva aqui';
          var seguir = document.createElement('button');
          seguir.className = 's';
          seguir.type = 'button';
          seguir.textContent = 'Continuar';
          seguir.style.marginTop = '10px';
          var responder = function () {
            var valor = campo.value.trim();
            if (!valor) { campo.focus(); return; }
            respostas.push({ pergunta: pergunta.texto, resposta: valor });
            passo += 1;
            desenhar();
          };
          seguir.addEventListener('click', responder);
          campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') responder(); });
          area.appendChild(campo);
          area.appendChild(seguir);
          campo.focus();
          return;
        }

        opcoes.forEach(function (opcao) {
          var escolha = document.createElement('button');
          escolha.className = 'o';
          escolha.type = 'button';
          escolha.textContent = opcao;
          escolha.addEventListener('click', function () {
            respostas.push({ pergunta: pergunta.texto, resposta: opcao });
            passo += 1;
            desenhar();
          });
          area.appendChild(escolha);
        });
      }

      function desenharContato(area) {
        var titulo = document.createElement('div');
        titulo.className = 'q';
        titulo.textContent = textos[0];
        area.appendChild(titulo);

        var campos = [
          ['nome', 'Seu nome', 'text', 'Renata'],
          ['telefone', 'WhatsApp', 'tel', '(41) 99999-0000'],
          ['email', 'E-mail', 'email', 'renata@email.com.br'],
        ];
        var entradas = {};
        campos.forEach(function (campo) {
          var rotulo = document.createElement('label');
          rotulo.textContent = campo[1];
          var entrada = document.createElement('input');
          entrada.type = campo[2];
          entrada.placeholder = campo[3];
          entrada.autocomplete = campo[0] === 'nome' ? 'name' : campo[0];
          rotulo.appendChild(entrada);
          area.appendChild(rotulo);
          entradas[campo[0]] = entrada;
        });

        // A linha de consentimento fica antes do botao e o clique nele e o
        // aceite, que e o que o texto diz. Caixa de marcar a mais aqui derruba
        // conversao sem acrescentar base legal.
        var lgpd = document.createElement('p');
        lgpd.className = 'lgpd';
        lgpd.textContent = fluxo.consentimento;
        area.appendChild(lgpd);

        var enviar = document.createElement('button');
        enviar.className = 's';
        enviar.type = 'button';
        enviar.textContent = textos[1];
        enviar.addEventListener('click', function () {
          var nome = entradas.nome.value.trim();
          var email = entradas.email.value.trim();
          var telefone = entradas.telefone.value.trim();
          if (!nome || (!email && !telefone)) {
            entradas.nome.focus();
            return;
          }
          enviar.disabled = true;
          enviar.textContent = 'Gerando seu cupom...';

          if (typeof window.__captaConsentir === 'function') {
            try { window.__captaConsentir(); } catch (e) { /* do lojista, nao nosso */ }
          }

          buscar('/w/lead/' + chave, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nome: nome, email: email, telefone: telefone,
              respostas: respostas, anonimoId: anonimo(), consentimento: true,
            }),
          })
            .then(function (r) { return r.json(); })
            .then(function (dados) {
              guardar(CHAVE_FEITO, '1');
              if (dados && dados.leadId && typeof window.__captaIdentificar === 'function') {
                try { window.__captaIdentificar(dados.leadId); } catch (e) { /* do lojista */ }
              }
              mostrarCupom(dados);
            })
            .catch(function () {
              // O lead pode ter sido gravado mesmo com a resposta perdida no
              // caminho, entao a mensagem nao promete nem nega o cupom.
              enviar.disabled = false;
              enviar.textContent = 'Tentar de novo';
            });
        });
        area.appendChild(enviar);
        entradas.nome.focus();
      }

      function mostrarCupom(dados) {
        var area = corpo();
        area.textContent = '';
        var caixa = document.createElement('div');
        caixa.className = 'cup';

        if (dados && dados.cupom) {
          var msg = document.createElement('p');
          msg.className = 'msg';
          msg.textContent = textos[2];
          var cod = document.createElement('div');
          cod.className = 'cod';
          cod.textContent = dados.cupom;
          var rodape = document.createElement('p');
          rodape.className = 'msg';
          rodape.textContent = 'Ele e so seu e vale uma vez.';
          caixa.appendChild(msg);
          caixa.appendChild(cod);
          caixa.appendChild(rodape);
        } else {
          // Cupom que falhou no ato nao vira erro na cara de quem acabou de
          // deixar o contato: o lead esta gravado e o envio sai depois.
          var aviso = document.createElement('p');
          aviso.className = 'msg';
          var semCupom = fluxo.recompensa && fluxo.recompensa !== 'cupom' && fluxo.recompensa !== 'frete_gratis';
          aviso.textContent = semCupom
            ? textos[2]
            : 'Recebemos seus dados. Seu cupom chega em instantes no WhatsApp e no e-mail que voc\u00ea deixou.';
          caixa.appendChild(aviso);
        }
        area.appendChild(caixa);
      }
    }
  } catch (e) {
    // Silencio proposital. Nenhum erro nosso aparece no console da loja.
  }
}());
