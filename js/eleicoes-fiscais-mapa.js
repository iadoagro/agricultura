/* Pinta o mapa da aba "Fiscais" (#mapa, desenhado por js/eleicoes.js) por %
   de cobertura de fiscal, com dica ao passar o mouse — mesma ideia do mapa
   de votos em js/eleicoes-resultados.js, mas mostrando "onde falta fiscal"
   em vez de "onde teve voto". Não mexe no desenho do mapa nem nos cliques
   (isso continua sendo de js/eleicoes.js); só pinta e escuta os elementos
   que ele já cria (path[data-id]), usando addEventListener para não
   substituir os manipuladores que js/eleicoes.js já atribui via .onclick
   etc. em cada path. */
(function () {
  'use strict';
  var svg = document.getElementById('mapa');
  var dica = document.getElementById('mapaFiscaisDica');
  if (!svg || !window.CoberturaFiscais || !window.MAPA_ACRE || !window.BANCO_ELEICOES) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var nomesMun = new Map(window.MAPA_ACRE.localidades.map(function (m) { return [String(m.id), m.nome]; }));
  var oficiaisPorMun = window.CoberturaFiscais.oficiaisPorMun();
  var comFiscalPorMun = new Map();

  // 0% = vermelho, 100% = verde, mesma família de cor do resto da página.
  function corCobertura(pct) {
    var matiz = (pct / 100) * 122, luz = 78 - (pct / 100) * 36;
    return 'hsl(' + matiz.toFixed(0) + ' 55% ' + luz.toFixed(0) + '%)';
  }

  function pintar() {
    var dados = window.CoberturaFiscais.calcular();
    comFiscalPorMun = dados.comFiscalPorMun;
    svg.querySelectorAll('path[data-id]').forEach(function (path) {
      var oficiais = oficiaisPorMun.get(path.dataset.id) || 0;
      path.style.fill = oficiais ? corCobertura(Math.min(100, (comFiscalPorMun.get(path.dataset.id) || 0) / oficiais * 100)) : '';
    });
  }

  function mostrarDica(id) {
    if (!dica) return;
    var oficiais = oficiaisPorMun.get(id) || 0;
    var comFiscal = comFiscalPorMun.get(id) || 0;
    var pct = oficiais ? (comFiscal / oficiais * 100) : 0;
    dica.innerHTML = '<strong>' + esc(nomesMun.get(id) || id) + '</strong>' +
      '<div class="linha"><span>Cobertura</span><span>' + pct.toFixed(1).replace('.', ',') + '%</span></div>' +
      '<div class="linha com"><span>Seções com fiscal</span><span>' + comFiscal + '</span></div>' +
      '<div class="linha sem"><span>Seções sem fiscal</span><span>' + Math.max(0, oficiais - comFiscal) + '</span></div>';
    dica.hidden = false;
  }
  function esconderDica() { if (dica) dica.hidden = true; }

  if (dica) {
    svg.addEventListener('mousemove', function (e) {
      if (dica.hidden) return;
      var margem = 16, x = e.clientX + margem, y = e.clientY + margem;
      if (x + 250 > window.innerWidth) x = e.clientX - 250 - margem;
      if (y + 110 > window.innerHeight) y = e.clientY - 110 - margem;
      dica.style.left = x + 'px'; dica.style.top = y + 'px';
    });
  }

  function ligarInteracao() {
    svg.querySelectorAll('path[data-id]').forEach(function (path) {
      path.addEventListener('mouseenter', function () { mostrarDica(path.dataset.id); });
      path.addEventListener('focus', function () { mostrarDica(path.dataset.id); });
      path.addEventListener('mouseleave', esconderDica);
      path.addEventListener('blur', esconderDica);
    });
  }

  function aoDesenhar() { pintar(); ligarInteracao(); }

  if (svg.querySelector('path[data-id]')) {
    aoDesenhar();
  } else {
    var obs = new MutationObserver(function () {
      if (svg.querySelector('path[data-id]')) { obs.disconnect(); aoDesenhar(); }
    });
    obs.observe(svg, { childList: true });
  }

  window.addEventListener('banco-atualizado', pintar);
})();
