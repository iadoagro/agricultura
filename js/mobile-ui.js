/* Celular: recolhe a barra de filtros dos painéis atrás de um botão, para os
   números aparecerem logo na primeira tela. No computador o botão fica oculto
   e os filtros continuam sempre visíveis na lateral. */
(function () {
  'use strict';
  var caixa = document.querySelector('.wrap > .filtros');
  if (!caixa) return;
  var botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'filtros-toggle';
  botao.setAttribute('aria-expanded', 'false');
  botao.innerHTML = '<span class="filtros-toggle-ico" aria-hidden="true">⚙</span><span class="filtros-toggle-txt">Filtros</span><span class="filtros-toggle-seta" aria-hidden="true">▾</span>';
  caixa.classList.add('recolhivel', 'recolhido');
  caixa.parentNode.insertBefore(botao, caixa);
  botao.addEventListener('click', function () {
    var aberto = caixa.classList.toggle('recolhido') === false;
    botao.setAttribute('aria-expanded', String(aberto));
    botao.classList.toggle('aberto', aberto);
    if (aberto) caixa.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  // Mostra quantos filtros estão ativos (algum <select>/lista fora do valor padrão)
  function contar() {
    var n = 0;
    caixa.querySelectorAll('select').forEach(function (s) { if (s.value) n++; });
    caixa.querySelectorAll('.multi input[type="checkbox"]:checked').forEach(function () { n++; });
    var t = botao.querySelector('.filtros-toggle-txt');
    t.textContent = n ? 'Filtros (' + n + ')' : 'Filtros';
  }
  caixa.addEventListener('change', contar);
  contar();
})();
