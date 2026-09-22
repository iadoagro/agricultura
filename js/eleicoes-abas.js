/* Alterna entre as abas "Fiscais", "Resultados" e "Relatório" de
   eleicoes.html. A aba abre pelo hash da URL (#resultados, #relatorio) e,
   sem hash reconhecido, abre "fiscais" — a principal. Não mexe em nada
   dentro de cada aba: js/eleicoes.js, js/eleicoes-resultados.js e
   js/eleicoes-relatorio.js continuam donos do que está dentro da sua. */
(function () {
  'use strict';
  var nav = document.querySelector('.abas-eleicoes');
  if (!nav) return;
  var PADRAO = 'fiscais';
  var botoes = document.querySelectorAll('.aba-el');
  var paineis = document.querySelectorAll('.aba-conteudo');

  function abrir(nome) {
    var valido = Array.prototype.some.call(botoes, function (b) { return b.getAttribute('data-aba') === nome; });
    if (!valido) nome = PADRAO;
    botoes.forEach(function (b) {
      var on = b.getAttribute('data-aba') === nome;
      b.classList.toggle('ativa', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    paineis.forEach(function (p) {
      p.classList.toggle('ativa', p.getAttribute('data-aba') === nome);
    });
    if (location.hash.slice(1) !== nome) {
      try { history.replaceState(null, '', '#' + nome); } catch (e) { /* file:// */ }
    }
    // Mapas (Leaflet) criados com a aba escondida ficam com tamanho zero —
    // o "resize" faz eles se ajustarem quando a aba aparece.
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new CustomEvent('aba-eleicoes', { detail: nome }));
  }

  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.aba-el');
    if (b) abrir(b.getAttribute('data-aba'));
  });

  abrir(location.hash.slice(1));
})();
