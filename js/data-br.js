/* Datas sempre em dia/mês/ano.

   O <input type="date"> do navegador mostra a data no formato do idioma do
   sistema — num Windows em inglês vira mês/dia/ano. Este arquivo troca
   todo <input type="date"> da página por um campo de texto com máscara
   "dd/mm/aaaa", que é igual em qualquer computador.

   O campo passa a ter o valor em dd/mm/aaaa; quem precisa do ISO
   (aaaa-mm-dd) converte com DATA_BR.brParaIso(). Carregar ANTES dos scripts
   que leem esses campos. */
(function () {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** "2026-09-25" (ou "2026-09-25T10:00…") → "25/09/2026"; vazio se inválido. */
  function isoParaBr(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /** "25/09/2026" → "2026-09-25"; vazio se não for uma data que existe. */
  function brParaIso(br) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
    if (!m) return '';
    var d = +m[1], mes = +m[2], ano = +m[3];
    var dt = new Date(ano, mes - 1, d);
    if (dt.getFullYear() !== ano || dt.getMonth() !== mes - 1 || dt.getDate() !== d) return '';
    return ano + '-' + pad(mes) + '-' + pad(d);
  }

  /** Data (Date ou ISO) com hora: "25/09/2026 14:05:09". */
  function dataHoraBr(v) {
    if (!v) return '—';
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d)) return '—';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* Máscara enquanto digita: só números, barras entram sozinhas. */
  function mascarar(e) {
    var campo = e.target;
    var digitos = campo.value.replace(/\D/g, '').slice(0, 8);
    var v = digitos.slice(0, 2);
    if (digitos.length > 2) v += '/' + digitos.slice(2, 4);
    if (digitos.length > 4) v += '/' + digitos.slice(4);
    if (campo.value !== v) campo.value = v;
    validar(campo);
  }

  /** Hoje, no relógio de quem digita (o dia em que o lançamento está sendo inserido). */
  function hojeIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Mensagem de erro logo abaixo do campo (some quando a data está certa). */
  function mostrarErro(campo, msg) {
    var no = campo.nextElementSibling;
    if (!no || !no.classList || !no.classList.contains('data-erro')) {
      if (!msg) return;
      no = document.createElement('small');
      no.className = 'data-erro';
      no.setAttribute('role', 'alert');
      campo.parentNode.insertBefore(no, campo.nextSibling);
    }
    no.textContent = msg || '';
    no.hidden = !msg;
  }

  function validar(campo) {
    var v = campo.value, msg = '';
    if (v) {
      var iso = brParaIso(v);
      if (!iso) {
        // só reclama de data incompleta quando a pessoa já saiu do campo ou completou os 10 caracteres
        if (v.length === 10 || document.activeElement !== campo) msg = 'Data inválida — use dia/mês/ano (ex.: 25/09/2026).';
      } else if (campo.hasAttribute('data-sem-futuro') && iso > hojeIso()) {
        msg = 'A data não pode ser futura (hoje é ' + isoParaBr(hojeIso()) + ').';
      }
    }
    campo.setCustomValidity(msg);
    mostrarErro(campo, msg);
  }

  /** Converte um <input type="date"> em campo de texto dd/mm/aaaa. */
  function aplicar(campo) {
    if (!campo || campo.getAttribute('data-data-br') === '1') return;
    var valorIso = campo.value;
    campo.type = 'text';
    campo.setAttribute('data-data-br', '1');
    campo.setAttribute('inputmode', 'numeric');
    campo.setAttribute('autocomplete', 'off');
    campo.setAttribute('maxlength', '10');
    if (!campo.placeholder) campo.placeholder = 'dd/mm/aaaa';
    campo.value = isoParaBr(valorIso);
    campo.addEventListener('input', mascarar);
    campo.addEventListener('blur', function () { validar(campo); });
    campo.addEventListener('change', function () { validar(campo); });
  }

  function aplicarTodos(raiz) {
    Array.prototype.forEach.call((raiz || document).querySelectorAll('input[type="date"]'), aplicar);
  }

  window.DATA_BR = { isoParaBr: isoParaBr, brParaIso: brParaIso, dataHoraBr: dataHoraBr, aplicar: aplicar, aplicarTodos: aplicarTodos };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { aplicarTodos(); });
  else aplicarTodos();
})();
