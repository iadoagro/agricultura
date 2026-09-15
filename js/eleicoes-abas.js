/* Alterna entre as abas "Resultados" e "Fiscais" de eleicoes.html.
   A aba abre pelo hash da URL (#fiscais), e volta para "resultados" — a
   principal, como esta página já abria antes de ter abas — quando não há
   hash reconhecido. Não mexe em nada dentro de cada aba: js/eleicoes.js e
   js/eleicoes-resultados.js continuam donos do que está dentro da sua. */
(function () {
  'use strict';
  var nav = document.querySelector('.abas-eleicoes');
  if (!nav) return;
  var botoes = document.querySelectorAll('.aba-el');
  var paineis = document.querySelectorAll('.aba-conteudo');

  function abrir(nome) {
    var valido = Array.prototype.some.call(botoes, function (b) { return b.getAttribute('data-aba') === nome; });
    if (!valido) nome = 'resultados';
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
  }

  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.aba-el');
    if (b) abrir(b.getAttribute('data-aba'));
  });

  abrir(location.hash.slice(1));
})();
