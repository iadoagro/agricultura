/* Sub-abas "1º Turno" / "2º Turno" dentro da aba "Eleições" de eleicoes.html.
   1º Turno = o conteúdo que antes era a aba "Resultados" (Governo, Deputado Estadual, Vereador, Outro político);
   2º Turno = apuração ao vivo do Governo (js/eleicoes-2turno.js e js/eleicoes-2turno-secoes.js).
   Abre o 2º turno por padrão; #resultados ou #turno1 abrem o 1º. Só alterna a visibilidade — não mexe no que há dentro. */
(function () {
  'use strict';
  var nav = document.querySelector('.turnos-eleicao');
  if (!nav) return;
  var botoes = nav.querySelectorAll('.turno-el'), paineis = document.querySelectorAll('.et-turno');

  function abrir(t) {
    t = t === '1' ? '1' : '2';
    botoes.forEach(function (b) {
      var on = b.getAttribute('data-turno') === t;
      b.classList.toggle('ativa', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    });
    paineis.forEach(function (p) { p.hidden = p.getAttribute('data-turno') !== t; });
    // mapas (Leaflet) criados com o painel escondido precisam recalcular o tamanho
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new CustomEvent('turno-eleicoes', { detail: t }));
  }
  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.turno-el'); if (b) abrir(b.getAttribute('data-turno'));
  });
  abrir(/^#(resultados|turno1)$/.test(location.hash) ? '1' : '2');
})();
