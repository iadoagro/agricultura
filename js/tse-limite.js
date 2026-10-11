/* Limitador de requisições ao TSE (resultados.tse.jus.br) para a aba "Eleições".
   O TSE documenta no máximo 100 requisições por IP por segundo (acima disso há bloqueio de 10 minutos). Todas as consultas
   da página passam por window.tseFetch, que nunca ultrapassa MAX por segundo (janela deslizante) e enfileira o excedente. */
(function () {
  'use strict';
  var MAX = 80, fila = [], janela = [], agendado = false;
  function drena() {
    agendado = false;
    var agora = Date.now();
    while (janela.length && agora - janela[0] >= 1000) janela.shift();
    while (fila.length && janela.length < MAX) {
      var it = fila.shift(); janela.push(Date.now());
      fetch(it[0], it[1]).then(it[2], it[3]);
    }
    if (fila.length && !agendado) { agendado = true; setTimeout(drena, Math.max(5, 1000 - (agora - (janela[0] || agora)))); }
  }
  window.tseFetch = function (url, opt) { return new Promise(function (ok, no) { fila.push([url, opt, ok, no]); drena(); }); };
  window.tseLimite = { max: MAX };
})();
