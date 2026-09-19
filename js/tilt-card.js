/* Inclinação 3D com brilho que segue o cursor nos cartões de módulos.
   Equivalente vanilla do TiltCard: mola suave, desligado em toque e em
   prefers-reduced-motion. Aplica em todo ".cards .card". */
(function () {
  'use strict';
  var MAX = 8;          // graus de inclinação máxima
  var RIGIDEZ = 0.16;   // quanto o cartão persegue o alvo por frame
  var LEVANTAR = -6;    // mantém o "levantar" do :hover em px

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

    var rx = 0, ry = 0, alvoX = 0, alvoY = 0, y = 0, alvoLev = 0, raf = 0;

    function quadro() {
      rx += (alvoX - rx) * RIGIDEZ;
      ry += (alvoY - ry) * RIGIDEZ;
      y += (alvoLev - y) * RIGIDEZ;
      var parado = Math.abs(alvoX - rx) < 0.02 && Math.abs(alvoY - ry) < 0.02 && Math.abs(alvoLev - y) < 0.05;
      if (parado && alvoX === 0 && alvoY === 0 && alvoLev === 0) {
        card.style.transform = '';
        raf = 0;
        return;
      }
      card.style.transform = 'perspective(1000px) translateY(' + y.toFixed(2) + 'px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
      raf = requestAnimationFrame(quadro);
    }
    function animar() { if (!raf) raf = requestAnimationFrame(quadro); }

    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      alvoY = (px - 0.5) * MAX;
      alvoX = (0.5 - py) * MAX;
      alvoLev = LEVANTAR;
      brilho.style.background = 'radial-gradient(circle at ' + (px * 100).toFixed(1) + '% ' + (py * 100).toFixed(1) + '%, rgba(255,255,255,.55), transparent 55%)';
      brilho.style.opacity = '1';
      animar();
    });
    card.addEventListener('mouseleave', function () {
      alvoX = alvoY = alvoLev = 0;
      brilho.style.opacity = '0';
      animar();
    });
  }

  function iniciar() {
    Array.prototype.forEach.call(document.querySelectorAll('.cards .card'), ligar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
