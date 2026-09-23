/* Inclinação 3D com brilho que segue o cursor nos cartões de módulos.
   Desligado em toque e em prefers-reduced-motion. Aplica em todo ".cards .card".
   Sem loop de requestAnimationFrame: cada mousemove só escreve o alvo (no
   máximo uma vez por quadro) e uma transition do CSS (.tilt no CSS do
   card) cuida de suavizar — nenhum JS roda continuamente enquanto o mouse
   está parado ou entre um movimento e outro. */
(function () {
  'use strict';
  var MAX = 7;           // graus de inclinação máxima
  var LEVANTAR = -6;      // mantém o "levantar" do :hover em px

  var mq = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
  if (mq('(prefers-reduced-motion: reduce)') || !mq('(hover: hover) and (pointer: fine)')) return;

  function ligar(card) {
    if (card.__tilt) return;
    card.__tilt = true;
    card.classList.add('tilt');

    var brilho = document.createElement('span');
    brilho.className = 'tilt-glare';
    brilho.setAttribute('aria-hidden', 'true');
    card.appendChild(brilho);

    var pendente = null, quadroPedido = false;
    function aplicar() {
      quadroPedido = false;
      if (!pendente) return;
      var r = card.getBoundingClientRect();
      var px = (pendente.clientX - r.left) / r.width;
      var py = (pendente.clientY - r.top) / r.height;
      var rx = (0.5 - py) * MAX, ry = (px - 0.5) * MAX;
      card.style.transform = 'perspective(1000px) translateY(' + LEVANTAR + 'px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
      brilho.style.background = 'radial-gradient(circle at ' + (px * 100).toFixed(1) + '% ' + (py * 100).toFixed(1) + '%, rgba(255,255,255,.55), transparent 55%)';
      brilho.style.opacity = '1';
    }

    card.addEventListener('mousemove', function (e) {
      pendente = e;
      if (!quadroPedido) { quadroPedido = true; requestAnimationFrame(aplicar); }
    });
    card.addEventListener('mouseleave', function () {
      pendente = null;
      card.style.transform = '';
      brilho.style.opacity = '0';
    });
  }

  function iniciar() {
    Array.prototype.forEach.call(document.querySelectorAll('.cards .card'), ligar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
