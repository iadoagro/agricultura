/* Página pública da apuração do 2º turno (eleicao/index.html): sem login, sem menu, sem telas internas.
   1) pergunta ao banco, pela única função aberta ao público
   (apuracao_publica_ativa), se o link está ativo; 2) só então carrega os scripts da apuração, um a um. Sem token válido
   nada da apuração é carregado. Os scripts abaixo são os únicos que esta página usa — não há admin-auth, admin-gate,
   nav nem qualquer chave além da publicável. Veja database/apuracao-links.sql. */
(function () {
  'use strict';
  window.APURACAO_PUBLICA = true;   // eleicoes-2turno.js: sem botão de gerar link
  window.MODO_PUBLICO = true;
  var aviso = document.getElementById('apPubAviso'), app = document.getElementById('apPubApp');
  // raiz do site (…/agricultura/): calculada a partir deste próprio script, então vale em qualquer pasta
  var BASE = new URL('../', document.currentScript ? document.currentScript.src : location.href).href;
  var SCRIPTS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    BASE + 'js/tse-limite.js',
    BASE + 'js/dados-tche-2026.js',
    BASE + 'js/dados-governo-2026.js',
    BASE + 'js/dados-governo-2turno-2026.js',
    BASE + 'js/dados-governo-1turno-secoes.js',
    BASE + 'js/dados-perfil-2026.js',
    BASE + 'js/eleicao-painel.js?v=2026101810',
    BASE + 'js/eleicoes-2turno.js',
    BASE + 'js/eleicoes-2turno-secoes.js',
    BASE + 'js/eleicao-mobile.js?v=2026101823'
  ];

  function negar(texto) {
    if (app) app.remove();
    if (aviso) { aviso.hidden = false; aviso.className = 'ap-aviso ap-negado'; aviso.innerHTML = '<h1>Acesso não autorizado</h1><p>' + texto + '</p><p class="ap-peq">Peça um novo link a quem compartilhou esta página.</p>'; }
    document.title = 'Acesso não autorizado';
  }

  /* Senha da página: "eleicao" (sem acento) abre e depois pergunta o nome de quem entrou; o código do responsável abre direto.
     Só o hash fica aqui. A conferência é no navegador: serve para filtrar quem recebe o link, não como proteção forte. */
  var HASH_SENHA = '20afa897941ac6c338a675e327cb4421d5a559ef921d6c80ef54a79ee233d59b';
  var HASH_ROOT = '4e1d2e77e667141b73b1f9774a10eaeec75ce75b8fc4cb710f4595f35f1c8ca0';
  function sha(t) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function entrou() { try { return sessionStorage.getItem('ap_pub_ok') === '1'; } catch (e) { return false; } }
  function lembrar(nome) {
    try {
      sessionStorage.setItem('ap_pub_ok', '1');
      if (nome) { sessionStorage.setItem('ap_pub_visitante', '1'); localStorage.setItem('ap_pub_nome', nome); }
      else sessionStorage.removeItem('ap_pub_visitante');
    } catch (e) { /* sem armazenamento */ }
  }
  /** Quem entrou com a senha da página (não é o responsável) vê, no alto à direita, há quanto tempo está na sessão.
      O contador volta a zero a cada carregamento da página e quando entra outra pessoa. */
  function mostrarContador() {
    var visitante = false;
    try { visitante = sessionStorage.getItem('ap_pub_visitante') === '1'; } catch (e) { /* sem armazenamento */ }
    if (!visitante) return;
    var nome = ''; try { nome = localStorage.getItem('ap_pub_nome') || ''; } catch (e) { /* sem armazenamento */ }
    var el = document.createElement('div');
    el.setAttribute('role', 'timer');
    el.className = 'ap-sessao';
    // fica dentro do cabeçalho azul (#etBarra); o cabeçalho é redesenhado pela apuração, então o contador é recolocado quando some
    function encaixar() {
      if (document.documentElement.classList.contains('ap-m')) { if (!el.parentNode) document.body.appendChild(el); return; }   // celular: o contador mora no placar (js/eleicao-mobile.js)
      var barra = document.getElementById('etBarra');
      if (barra && el.parentNode !== barra) barra.appendChild(el);
      else if (!barra && !el.parentNode) document.body.appendChild(el);
    }
    encaixar();
    var b0 = document.getElementById('etBarra');
    if (b0 && window.MutationObserver) new MutationObserver(encaixar).observe(b0, { childList: true });
    var ini = Date.now();
    function p2(n) { return String(n).padStart(2, '0'); }
    function tique() {
      var t = Math.floor((Date.now() - ini) / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
      el.innerHTML = (nome ? '<span class="ap-sessao-nome"></span>' : '') + '<span class="ap-sessao-t"></span>';
      if (nome) el.firstChild.textContent = nome.split(' ')[0] + ' · ';
      el.lastChild.textContent = '⏱ ' + (h ? h + ':' + p2(m) : p2(m)) + ':' + p2(t % 60);
    }
    tique(); setInterval(tique, 1000);
  }
  /** Mostra o formulário (senha e, se não for o responsável, o nome) e resolve quando a pessoa pode entrar. */
  function pedirSenha() {
    return new Promise(function (ok) {
      if (entrou()) { ok(); return; }
      if (!aviso) { ok(); return; }
      aviso.hidden = false; aviso.className = 'ap-aviso';
      aviso.innerHTML = '<h1>Apuração do 2º turno</h1><p id="apTxt">Digite a senha para continuar.</p>' +
        '<form id="apForm" autocomplete="off"><input id="apCampo" type="password" required autofocus aria-label="Senha" placeholder="Senha" ' +
        'style="width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1.5px solid #cbd5e1;border-radius:10px;margin:8px 0">' +
        '<p id="apErro" class="ap-peq" style="color:#b42318;min-height:18px;margin:0 0 8px"></p>' +
        '<button type="submit" style="padding:11px 28px;font-size:15px;font-weight:700;border:0;border-radius:10px;background:#2563eb;color:#fff;cursor:pointer">Entrar</button></form>';
      var form = document.getElementById('apForm'), campo = document.getElementById('apCampo'), erro = document.getElementById('apErro'), etapa = 'senha';
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (etapa === 'nome') {
          var nome = campo.value.trim().replace(/\s+/g, ' ');
          if (nome.length < 2) { erro.textContent = 'Informe seu nome.'; return; }
          lembrar(nome); ok(); return;
        }
        sha(campo.value.trim().toLowerCase()).then(function (h) {
          if (h === HASH_ROOT) { lembrar(''); ok(); return; }
          if (h !== HASH_SENHA) { erro.textContent = 'Senha incorreta.'; campo.value = ''; campo.focus(); return; }
          etapa = 'nome'; erro.textContent = '';
          document.getElementById('apTxt').textContent = 'Qual é o seu nome?';
          campo.type = 'text'; campo.value = ''; campo.placeholder = 'Seu nome'; campo.setAttribute('aria-label', 'Seu nome'); campo.autocomplete = 'name'; campo.focus();
        });
      });
    });
  }

  function carrega(i) {
    return new Promise(function (ok, falha) {
      if (i >= SCRIPTS.length) { ok(); return; }
      var s = document.createElement('script'); s.src = SCRIPTS[i]; s.async = false; if (/^https:/.test(SCRIPTS[i])) s.crossOrigin = 'anonymous';
      s.onload = function () { carrega(i + 1).then(ok, falha); };
      s.onerror = function () { falha(new Error('Não foi possível carregar ' + SCRIPTS[i])); };
      document.head.appendChild(s);
    });
  }


  /* O layout de tela cheia (html.et-fs) prende tudo na altura da tela e rola só dentro das abas: no desktop é o que se quer,
     mas no celular o cabeçalho e os placares ocupam a tela inteira e as abas ficam escondidas. Até 900 px a página rola normal. */
  var MQ_TELA = window.matchMedia ? window.matchMedia('(max-width: 900px)') : null;
  /* Telefone (até 760 px): versão própria da página, com placar fixo e navegação por baixo (css/eleicao-mobile.css, js/eleicao-mobile.js). */
  var MQ_CEL = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  function ajustarLayout() {
    document.documentElement.classList.toggle('et-fs', !(MQ_TELA && MQ_TELA.matches));
    document.documentElement.classList.toggle('ap-m', !!(MQ_CEL && MQ_CEL.matches));
  }
  ajustarLayout();
  if (MQ_CEL) { if (MQ_CEL.addEventListener) MQ_CEL.addEventListener('change', ajustarLayout); else if (MQ_CEL.addListener) MQ_CEL.addListener(ajustarLayout); }
  if (MQ_TELA) { if (MQ_TELA.addEventListener) MQ_TELA.addEventListener('change', ajustarLayout); else if (MQ_TELA.addListener) MQ_TELA.addListener(ajustarLayout); }

  /* a fileira de abas do celular rola para o lado: mantém a aba ativa à vista quando a apuração redesenha a página */
  var ultimaAba = '';
  function centrarAbaAtiva() {
    var l = document.querySelector('.t26-abas-lista'), a = l && l.querySelector('[aria-selected="true"]');
    if (!a || l.scrollWidth <= l.clientWidth) return;
    if (a.dataset.visto === '1' && a.offsetLeft >= l.scrollLeft && a.offsetLeft + a.offsetWidth <= l.scrollLeft + l.clientWidth) return;   // já à vista: não mexe em quem está deslizando
    if (a.textContent === ultimaAba) return;   // só quando a aba ativa muda
    ultimaAba = a.textContent;
    l.scrollLeft = a.offsetLeft - (l.clientWidth - a.offsetWidth) / 2;
  }
  if (window.MutationObserver && app) {
    var tmAba = 0;
    new MutationObserver(function () { clearTimeout(tmAba); tmAba = setTimeout(centrarAbaAtiva, 80); }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  }

  var cfg = window.BANCO_CONFIG;
  if (!cfg || !cfg.url) { negar('Não foi possível verificar o link agora.'); return; }

  // O link é fixo (…/pages/publico). O responsável liga e desliga no botão "Link público"; aqui só se pergunta se está ativo.
  fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/apuracao_publica_ativa', {
    method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json' },
    body: '{}'
  }).then(function (r) {
    if (!r.ok) throw new Error('verificação');
    return r.json();
  }).then(function (ativo) {
    if (ativo !== true) { negar('Este link foi desativado ou ainda não foi liberado.'); return; }
    return pedirSenha().then(function () {
      if (aviso) aviso.hidden = true;
      if (app) app.hidden = false;
      mostrarContador();
      return carrega(0);
    });
  }).catch(function () {
    negar('Não foi possível verificar o link agora. Confira sua conexão e tente novamente.');
  });
})();
