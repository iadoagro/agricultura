/* FX — injeta os elementos das camadas de css/fx-ui.css (Aceternity / Magic UI / Eldora / Animate UI).
   Sem dependências; tudo é decorativo (aria-hidden) e não interfere na lógica das páginas. */
(function () {
  'use strict';
  var calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var login = document.body && document.body.classList.contains('login-page');

  function el(tag, cls) {
    var e = document.createElement(tag);
    e.className = cls;
    e.setAttribute('aria-hidden', 'true');
    return e;
  }

  /* ---------- Cabeçalho: orbes + meteoros ---------- */
  function cabecalho() {
    if (calmo || login) return;
    var h = document.querySelector('body > header');
    if (!h || h.querySelector('.fx-cab')) return;
    var c = el('span', 'fx-cab');
    c.appendChild(el('i', 'fx-orbe a'));
    c.appendChild(el('i', 'fx-orbe b'));
    for (var i = 0; i < 4; i++) c.appendChild(el('i', 'fx-meteoro'));
    h.insertBefore(c, h.firstChild);
    if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
  }

  /* ---------- Border Beam nos cartões ---------- */
  var ALVOS = '.card,.painel,.mapa-card,.resultados-card,.instantaneo-card,.ch-cartao,.portaria-card,.card-contato,.kpi,.ch-kpi,.admin-card,.permissoes-tabela,.permissoes-novo,.ch-col';
  function feixes(raiz) {
    if (calmo) return;
    var lista = (raiz || document).querySelectorAll(ALVOS);
    for (var i = 0; i < lista.length && i < 400; i++) {
      var c = lista[i];
      if (c.__fx || c.querySelector(':scope > .fx-beam')) { c.__fx = 1; continue; }
      c.__fx = 1;
      c.classList.add('fx-beam-host');
      var cs = getComputedStyle(c);
      if (cs.position === 'static') c.style.position = 'relative';
      c.appendChild(el('span', 'fx-beam'));
    }
  }

  /* ---------- Floating Dock ---------- */
  function dock() {
    if (login || pagina === 'index.html' && !document.querySelector('.cards')) return;
    var noIndex = pagina === 'index.html' && document.querySelector('.cards');
    if (document.querySelector('.fx-dock')) return;
    var d = el('nav', 'fx-dock');
    d.setAttribute('aria-hidden', 'false');
    d.setAttribute('aria-label', 'Atalhos');
    var ico = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10.5 9-7 9 7"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>',
      topo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>'
    };
    if (!noIndex) {
      var a = document.createElement('a');
      a.href = /\/pages\//.test(location.pathname) ? 'index.html' : 'pages/index.html';
      a.title = 'Início'; a.setAttribute('aria-label', 'Ir para o início');
      a.innerHTML = ico.home;
      d.appendChild(a);
      d.appendChild(el('i', 'fx-sep'));
    }
    var b = document.createElement('button');
    b.type = 'button'; b.title = 'Voltar ao topo'; b.setAttribute('aria-label', 'Voltar ao topo');
    b.innerHTML = ico.topo;
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: calmo ? 'auto' : 'smooth' }); });
    d.appendChild(b);
    document.body.appendChild(d);

    var ultimo = window.scrollY, ticking = false;
    function atualizar() {
      ticking = false;
      var y = window.scrollY, sobe = y < ultimo - 4;
      var rolavel = document.documentElement.scrollHeight > window.innerHeight * 1.4;
      d.classList.toggle('on', rolavel && y > 260 && sobe);
      if (Math.abs(y - ultimo) > 4) ultimo = y;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(atualizar); }
    }, { passive: true });
  }

  function iniciar() {
    cabecalho();
    feixes();
    dock();
    /* conteúdo montado depois (painéis, listas): reaplica sem custo perceptível */
    if ('MutationObserver' in window && !calmo) {
      var t = 0;
      new MutationObserver(function () {
        clearTimeout(t);
        t = setTimeout(function () { feixes(); }, 350);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
