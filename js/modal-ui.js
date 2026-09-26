/* Janela de confirmação no centro da tela, no lugar do confirm() do navegador
   ("localhost diz…"). Uso:

     Modal.confirmar({ titulo: 'Excluir lançamento', mensagem: 'Não tem como desfazer.',
                       confirmar: 'Excluir', cancelar: 'Cancelar', perigo: true })
       .then(function (ok) { if (ok) … });

   Resolve true (confirmou) ou false (cancelou, Esc, clique fora). A mensagem
   respeita quebras de linha (\n) e entra como texto, nunca como HTML. Com
   perigo:true o foco começa em "Cancelar", para um Enter sem querer não apagar
   nada. O visual está em css/modal-ui.css. */
(function () {
  'use strict';
  var ICONE_PERIGO = '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>';
  var ICONE_PERGUNTA = '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>';
  var aberta = null;

  function criar(op) {
    var raiz = document.createElement('div');
    raiz.className = 'mdl-fundo';
    raiz.innerHTML =
      '<div class="mdl-caixa' + (op.perigo ? ' mdl-perigo' : '') + '" role="alertdialog" aria-modal="true" aria-labelledby="mdlTitulo" aria-describedby="mdlTexto">' +
        '<div class="mdl-icone" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          (op.perigo ? ICONE_PERIGO : ICONE_PERGUNTA) + '</svg></div>' +
        '<h2 class="mdl-titulo" id="mdlTitulo"></h2>' +
        '<p class="mdl-texto" id="mdlTexto"></p>' +
        '<div class="mdl-acoes">' +
          '<button type="button" class="mdl-btn mdl-cancelar"></button>' +
          '<button type="button" class="mdl-btn mdl-ok"></button>' +
        '</div>' +
      '</div>';
    raiz.querySelector('.mdl-titulo').textContent = op.titulo;
    raiz.querySelector('.mdl-texto').textContent = op.mensagem;
    raiz.querySelector('.mdl-cancelar').textContent = op.cancelar;
    raiz.querySelector('.mdl-ok').textContent = op.confirmar;
    return raiz;
  }

  function confirmar(op) {
    op = op || {};
    op = {
      titulo: op.titulo || 'Confirmar',
      mensagem: op.mensagem || '',
      confirmar: op.confirmar || 'Confirmar',
      cancelar: op.cancelar || 'Cancelar',
      perigo: !!op.perigo
    };
    if (aberta) aberta(false);   // uma janela por vez
    return new Promise(function (resolve) {
      var anterior = document.activeElement;
      var raiz = criar(op);
      var ok = raiz.querySelector('.mdl-ok'), cancelar = raiz.querySelector('.mdl-cancelar');

      function fechar(valor) {
        if (aberta !== fechar) return;
        aberta = null;
        document.removeEventListener('keydown', teclas, true);
        raiz.classList.add('mdl-saindo');
        setTimeout(function () { raiz.remove(); document.documentElement.classList.remove('mdl-aberto'); }, 160);
        if (anterior && anterior.focus) { try { anterior.focus({ preventScroll: true }); } catch (e) { /* elemento saiu da página */ } }
        resolve(valor);
      }
      function teclas(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); return; }
        if (e.key === 'Tab') {   // o foco fica preso nos dois botões
          var alvo = e.shiftKey ? (document.activeElement === cancelar ? ok : cancelar) : (document.activeElement === ok ? cancelar : ok);
          e.preventDefault();
          alvo.focus();
        }
      }
      aberta = fechar;
      ok.addEventListener('click', function () { fechar(true); });
      cancelar.addEventListener('click', function () { fechar(false); });
      raiz.addEventListener('mousedown', function (e) { if (e.target === raiz) fechar(false); });
      document.addEventListener('keydown', teclas, true);
      document.body.appendChild(raiz);
      document.documentElement.classList.add('mdl-aberto');
      (op.perigo ? cancelar : ok).focus();
    });
  }

  window.Modal = { confirmar: confirmar };
})();
