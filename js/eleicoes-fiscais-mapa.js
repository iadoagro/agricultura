/* Pinta o mapa da aba "Fiscais" (#mapa, desenhado por js/eleicoes.js) pela
   quantidade de fiscais cadastrados em cada município, com dica ao passar o
   mouse — mesma ideia do mapa de votos em js/eleicoes-resultados.js, mas
   mostrando "onde já tem fiscal" em vez de "onde teve voto". A cor é por
   contagem de fiscais (visível desde o 1º cadastro), não por % de seções
   cobertas — com centenas de seções oficiais por município, 1 ou 2 fiscais
   dariam uma % quase invisível no mapa; a % de cobertura ainda aparece na
   dica, como detalhe. Não mexe no desenho do mapa nem nos cliques (isso
   continua sendo de js/eleicoes.js); só pinta e escuta os elementos que ele
   já cria (path[data-id]), usando addEventListener para não substituir os
   manipuladores que js/eleicoes.js já atribui via .onclick etc. em cada
   path. */
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
  var totalFiscaisPorMun = new Map();
  var TETO_ESCALA = 10; // a partir de 10 fiscais já usa o tom mais escuro da escala.

  // Sem fiscal = cinza (cor padrão do mapa); 1 fiscal já aparece em verde
  // claro, ficando mais escuro conforme mais fiscais são cadastrados.
  function corPresenca(qtd) {
    var matiz = 140, luz = 88 - Math.min(qtd, TETO_ESCALA) / TETO_ESCALA * 48;
    return 'hsl(' + matiz + ' 45% ' + luz.toFixed(0) + '%)';
  }

  function pintar() {
    // No modo online, window.BANCO_ELEICOES.ler() lança enquanto o banco
    // ainda está buscando os cadastros na 1ª carga da página; o evento
    // "banco-atualizado" (abaixo) chama pintar() de novo quando terminar.
    var dados;
    try { dados = window.CoberturaFiscais.calcular(); } catch (e) { return; }
    comFiscalPorMun = dados.comFiscalPorMun;
    totalFiscaisPorMun = new Map();
    dados.registros.forEach(function (r) {
      if (!r.municipio) return;
      totalFiscaisPorMun.set(r.municipio, (totalFiscaisPorMun.get(r.municipio) || 0) + 1);
    });
    svg.querySelectorAll('path[data-id]').forEach(function (path) {
      var qtd = totalFiscaisPorMun.get(path.dataset.id) || 0;
      path.style.fill = qtd ? corPresenca(qtd) : '';
    });
  }

  function mostrarDica(id) {
    if (!dica) return;
    var oficiais = oficiaisPorMun.get(id) || 0;
    var comFiscal = comFiscalPorMun.get(id) || 0;
    var totalFiscais = totalFiscaisPorMun.get(id) || 0;
    var pct = oficiais ? (comFiscal / oficiais * 100) : 0;
    dica.innerHTML = '<strong>' + esc(nomesMun.get(id) || id) + '</strong>' +
      '<div class="linha com"><span>Fiscais cadastrados</span><span>' + totalFiscais + '</span></div>' +
      '<div class="linha"><span>Cobertura de seções</span><span>' + pct.toFixed(1).replace('.', ',') + '%</span></div>' +
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
