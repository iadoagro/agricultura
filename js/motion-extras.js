/* Extras de movimento — Magic UI (Magic Card, Ripple), em JS puro.
   - Spotlight: brilho suave que segue o cursor nos cartões (só com mouse)
   - Ripple: onda a partir do ponto do toque em botões (retorno tátil no celular)
   Tudo desliga com prefers-reduced-motion. */
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var CARTOES = '.painel,.mapa-card,.resultados-card,.instantaneo-card,.ch-cartao,.card-contato,.portaria-card,.kpi,.ch-kpi';
  var BOTOES = 'button:not(:disabled),.btn,.ch-btn,a.portaria-link,.aba,.aba-el,.filtro-btn';

  /* ---------- Spotlight (só ponteiro fino = mouse) ---------- */
  if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    var ultimo = null;
    document.addEventListener('pointermove', function (e) {
      var c = e.target.closest && e.target.closest(CARTOES);
      if (ultimo && ultimo !== c) { ultimo.classList.remove('mo-spot'); ultimo = null; }
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      c.classList.add('mo-spot');
      ultimo = c;
    }, { passive: true });
    document.addEventListener('pointerleave', function () {
      if (ultimo) { ultimo.classList.remove('mo-spot'); ultimo = null; }
    });
  }

  /* ---------- Ripple ---------- */
  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    var b = e.target.closest && e.target.closest(BOTOES);
    if (!b || b.matches('[aria-disabled="true"]')) return;
    var cs = getComputedStyle(b);
    if (cs.display === 'inline') return;
    var r = b.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) return;
    var tam = Math.max(r.width, r.height) * 2;
    var o = document.createElement('span');
    o.className = 'mo-ripple';
    o.setAttribute('aria-hidden', 'true');
    o.style.cssText = 'width:' + tam + 'px;height:' + tam + 'px;left:' + (e.clientX - r.left - tam / 2) + 'px;top:' + (e.clientY - r.top - tam / 2) + 'px';
    if (cs.position === 'static') b.style.position = 'relative';
    b.classList.add('mo-ripple-host');
    b.appendChild(o);
    setTimeout(function () {
      if (o.parentNode) o.parentNode.removeChild(o);
      if (!b.querySelector('.mo-ripple')) b.classList.remove('mo-ripple-host');
    }, 650);
  }, { passive: true });
})();
