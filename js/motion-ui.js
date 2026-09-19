/* Kit de movimento (JS) — adaptado do beUI para JS puro, sem dependências.
   - Number Animation: contagem nos KPIs
   - Scroll Animation: barra de progresso de leitura
   - Input: tremida do cartão quando aparece uma mensagem de erro
   - Tooltip (window.MoTooltip + [data-tip]/[title]) e Loader ("Carregando…") */
(function () {
  'use strict';
  var reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NUM = /^(\s*)(-?\d{1,3}(?:\.\d{3})+|-?\d+)(?:,(\d+))?(\s*%?\s*)$/;
  var SEL_NUM = '.kpi-val:not([data-mo]),.indicador-val:not([data-mo])';

  /* ---------- Number Animation ---------- */
  function formatar(v, casas) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  function contar(el) {
    var no = el.firstChild;
    if (!no || no.nodeType !== 3) return;
    var m = NUM.exec(no.nodeValue);
    if (!m) return;
    var casas = m[3] ? m[3].length : 0;
    var alvo = parseFloat(m[2].replace(/\./g, '') + (m[3] ? '.' + m[3] : ''));
    if (!isFinite(alvo) || alvo === 0) { el.setAttribute('data-mo', '1'); return; }
    el.setAttribute('data-mo', '1');
    var dur = Math.min(1100, 500 + Math.log10(Math.abs(alvo) + 1) * 110);
    var ini = null;
    function quadro(t) {
      if (ini === null) ini = t;
      var p = Math.min(1, (t - ini) / dur);
      var e = 1 - Math.pow(1 - p, 4);
      no.nodeValue = m[1] + formatar(alvo * e, casas) + m[4];
      if (p < 1) requestAnimationFrame(quadro);
      else no.nodeValue = m[1] + formatar(alvo, casas) + m[4];
    }
    no.nodeValue = m[1] + formatar(0, casas) + m[4];
    requestAnimationFrame(quadro);
  }

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (en.isIntersecting) { io.unobserve(en.target); contar(en.target); }
    });
  }, { threshold: 0.2 }) : null;

  function varrer() {
    Array.prototype.forEach.call(document.querySelectorAll(SEL_NUM), function (el) {
      if (el.closest('.relatorio-kpi,.relatorio-modal')) { el.setAttribute('data-mo', '1'); return; } // impressão
      var no = el.firstChild;
      if (!no || no.nodeType !== 3 || !NUM.test(no.nodeValue)) return;
      if (reduzir) { el.setAttribute('data-mo', '1'); return; }
      el.setAttribute('data-mo', 'p');
      if (io) io.observe(el); else contar(el);
    });
  }

  /* ---------- Scroll Animation: progresso de leitura ---------- */
  function progresso() {
    var barra = document.createElement('div');
    barra.className = 'mo-progress';
    barra.setAttribute('aria-hidden', 'true');
    document.body.appendChild(barra);
    var pend = false;
    function atualizar() {
      pend = false;
      var doc = document.documentElement;
      var total = doc.scrollHeight - window.innerHeight;
      if (total < window.innerHeight * 0.4) { barra.classList.remove('on'); return; }
      barra.classList.add('on');
      barra.style.transform = 'scaleX(' + Math.min(1, Math.max(0, window.scrollY / total)) + ')';
    }
    function agendar() { if (!pend) { pend = true; requestAnimationFrame(atualizar); } }
    window.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    atualizar();
    setTimeout(atualizar, 1200);
  }


  /* ---------- Tooltip: blur + mola na entrada; dispara em [data-tip] e [title] ---------- */
  var tip = null, tipChave = '', tipTimer = 0;
  function criarTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'mo-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    return tip;
  }
  function posTip(x, y) {
    var t = criarTip(), w = t.offsetWidth, h = t.offsetHeight;
    var px = x + 14, py = y + 18;
    if (px + w > window.innerWidth - 8) px = Math.max(8, x - w - 14);
    if (py + h > window.innerHeight - 8) py = Math.max(8, y - h - 14);
    t.style.left = px + 'px';
    t.style.top = py + 'px';
  }
  window.MoTooltip = {
    mostrar: function (conteudo, x, y, html) {
      var t = criarTip();
      var chave = (html ? 'h:' : 't:') + conteudo;
      if (chave !== tipChave) {
        tipChave = chave;
        if (html) t.innerHTML = conteudo; else t.textContent = conteudo;
      }
      posTip(x, y);
      t.classList.add('on');
    },
    esconder: function () {
      clearTimeout(tipTimer);
      if (tip) tip.classList.remove('on');
      tipChave = '';
    }
  };
  function alvoTip(n) {
    return n && n.closest ? n.closest('[data-tip],[title]') : null;
  }
  function textoTip(el) {
    var t = el.getAttribute('data-tip');
    if (t == null && el.hasAttribute('title')) {
      t = el.getAttribute('title');
      el.removeAttribute('title');            // some o balão nativo do navegador
      el.setAttribute('data-tip', t);
      if (!el.getAttribute('aria-label') && !(el.textContent || '').trim()) el.setAttribute('aria-label', t);
    }
    return (t || '').trim();
  }
  function ligarTooltip() {
    document.addEventListener('mouseover', function (e) {
      var el = alvoTip(e.target);
      if (!el || el.closest('.mo-tip')) return;
      var texto = textoTip(el);
      if (!texto) return;
      var x = e.clientX, y = e.clientY;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { window.MoTooltip.mostrar(texto, x, y); }, 220);
    });
    document.addEventListener('mousemove', function (e) {
      if (tip && tip.classList.contains('on') && alvoTip(e.target) && !e.target.closest('svg')) posTip(e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('mouseout', function (e) {
      var el = alvoTip(e.target);
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) window.MoTooltip.esconder();
    });
    document.addEventListener('focusin', function (e) {
      var el = alvoTip(e.target);
      if (!el) return;
      var texto = textoTip(el);
      if (!texto) return;
      var r = el.getBoundingClientRect();
      window.MoTooltip.mostrar(texto, r.left + r.width / 2, r.bottom - 10);
    });
    document.addEventListener('focusout', function () { window.MoTooltip.esconder(); });
    window.addEventListener('scroll', function () { window.MoTooltip.esconder(); }, { passive: true, capture: true });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.MoTooltip.esconder(); });
  }

  /* ---------- Loader: gira ao lado dos textos "Carregando…" ---------- */
  var SEL_LOAD = '[role="status"]:not([data-mo-load]),.nota:not([data-mo-load]),#lancEditarContexto:not([data-mo-load])';
  function loaders() {
    Array.prototype.forEach.call(document.querySelectorAll(SEL_LOAD), function (el) {
      if (!/^\s*Carregando/i.test(el.textContent || '')) return;
      el.setAttribute('data-mo-load', '1');
      var l = document.createElement('span');
      l.className = 'mo-loader';
      l.setAttribute('aria-hidden', 'true');
      el.insertBefore(l, el.firstChild);
    });
  }

  /* ---------- Input: tremida no erro ---------- */
  function observarErros() {
    var obs = new MutationObserver(function (lista) {
      lista.forEach(function (m) {
        var el = m.target;
        if (!el.classList || !el.classList.contains('erro') || !el.classList.contains('admin-msg')) return;
        var cartao = el.closest('.admin-card') || el;
        cartao.classList.remove('mo-shake');
        void cartao.offsetWidth;
        cartao.classList.add('mo-shake');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.admin-msg'), function (el) {
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /* Cor que o elemento terá quando as transições acabarem: um clone recém-criado
     não transiciona, então já nasce com o valor final. */
  function corFinal(el) {
    var c = el.cloneNode(false);
    c.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;transition:none';
    el.parentNode.appendChild(c);
    var cor = getComputedStyle(c).color;
    c.remove();
    return cor;
  }

  /* ---------- Tabs: o traço da aba ativa desliza até a nova aba ---------- */
  function glide(hostSel, itemSel) {
    Array.prototype.forEach.call(document.querySelectorAll(hostSel), function (host) {
      if (host.__moGlide) return;
      host.__moGlide = true;
      var ind = document.createElement('span');
      ind.className = 'mo-glide';
      ind.setAttribute('aria-hidden', 'true');
      host.classList.add('mo-glide-host');
      host.appendChild(ind);
      var primeira = true;
      function posicionar() {
        var ativo = host.querySelector(itemSel + '.ativa');
        if (!ativo || !ativo.offsetWidth) { ind.style.opacity = '0'; return; }
        var cs = getComputedStyle(ativo);
        var esp = parseFloat(cs.borderBottomWidth) || 3;
        if (primeira) ind.style.transition = 'none';
        ind.style.width = ativo.offsetWidth + 'px';
        ind.style.height = esp + 'px';
        ind.style.top = (ativo.offsetTop + ativo.offsetHeight - esp) + 'px';
        ind.style.translate = ativo.offsetLeft + 'px 0';
        ind.style.backgroundColor = corFinal(ativo);
        ind.style.opacity = '1';
        if (primeira) {
          primeira = false;
          void ind.offsetWidth;
          ind.style.transition = '';
        }
      }
      var rele = 0;
      new MutationObserver(function () {
        posicionar();
        clearTimeout(rele);
        rele = setTimeout(posicionar, 450);   // relê a cor quando a transição de cor da aba termina
      }).observe(host, { subtree: true, attributes: true, attributeFilter: ['class'] });
      host.addEventListener('transitionend', function (e) { if (e.propertyName === 'color') posicionar(); });
      if ('ResizeObserver' in window) new ResizeObserver(posicionar).observe(host);
      window.addEventListener('resize', posicionar);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(posicionar);
      posicionar();
    });
  }

  /* ---------- Página: sai deslizando antes de abrir o link ---------- */
  function saidaSuave() {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(h)) return;
      var u;
      try { u = new URL(a.href, location.href); } catch (x) { return; }
      if (u.protocol !== location.protocol || u.host !== location.host) return;
      if (!/\.html?$/i.test(u.pathname)) return;                       // só páginas do sistema (PDFs abrem direto)
      if (u.pathname === location.pathname && u.search === location.search) return;
      e.preventDefault();
      document.documentElement.classList.add('mo-saindo');
      setTimeout(function () { location.href = a.href; }, 220);
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) document.documentElement.classList.remove('mo-saindo');
    });
  }

  function iniciar() {
    varrer();
    loaders();
    ligarTooltip();
    glide('.abas-pista', '.aba');
    glide('.abas-eleicoes', '.aba-el');
    if (!reduzir) {
      saidaSuave();
      var pend = false;
      new MutationObserver(function () {
        if (pend) return;
        pend = true;
        requestAnimationFrame(function () {
          pend = false; varrer(); loaders();
          glide('.abas-pista', '.aba'); glide('.abas-eleicoes', '.aba-el');
        });
      }).observe(document.body, { childList: true, subtree: true });
      observarErros();
    }
    progresso();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
