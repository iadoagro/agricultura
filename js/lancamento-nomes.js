/* Capitalização automática dos campos de texto do lançamento de mecanização.
   Enquanto a pessoa digita (ou cola), o texto vira "João Silva de Souza": primeira letra de cada
   palavra em maiúsculo, o resto em minúsculo, e "de/da/do/das/dos/e" em minúsculo no meio do nome.
   Texto todo em maiúsculo não é aceito: é convertido na hora. Só muda a caixa das letras, então o
   cursor não sai do lugar. Vale para o formulário do dashboard e para a tela de edição. */
(function () {
  'use strict';

  var PARTICULAS = { 'de': 1, 'da': 1, 'do': 1, 'das': 1, 'dos': 1, 'e': 1 };

  /* modo 'nome': tudo em Nome Próprio.
     modo 'livre': Nome Próprio, mas siglas de até 2 letras (BR, AC, PA) são mantidas.
     modo 'frase': só a 1ª letra do texto e a de cada frase; palavras TODAS em maiúsculo viram minúsculo. */
  var CAMPOS = {
    nome_beneficiario: 'nome',
    nome_propriedade: 'nome',
    etnia: 'nome',
    associacao_cooperativa: 'livre',
    endereco: 'livre',
    tipo_trator: 'livre',
    observacao: 'frase'
  };

  var RE_PALAVRA = /[A-Za-zÀ-ÖØ-öø-ÿ]+/g;

  function primeiraMaiuscula(p) { return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); }

  function formatar(texto, modo) {
    if (!texto) return texto;
    var n = 0;
    if (modo === 'frase') {
      var s = texto.replace(RE_PALAVRA, function (p) {
        var sigla = p.length <= 2;
        return (p === p.toUpperCase() && !sigla) ? p.toLowerCase() : p;
      });
      return s.replace(/(^|[.!?]\s+)([a-zà-öø-ÿ])/g, function (_, ini, c) { return ini + c.toUpperCase(); });
    }
    return texto.replace(RE_PALAVRA, function (p) {
      var primeira = n++ === 0;
      if (modo === 'livre' && p.length <= 2 && p === p.toUpperCase() && !PARTICULAS[p.toLowerCase()]) return p;
      if (!primeira && PARTICULAS[p.toLowerCase()]) return p.toLowerCase();
      return primeiraMaiuscula(p);
    });
  }

  function modoDe(el) {
    if (!el || el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return null;
    if (el.readOnly || el.disabled) return null;
    if (el.name && CAMPOS[el.name]) return CAMPOS[el.name];
    if (el.id === 'lancPessoasLoteNome' || el.classList.contains('lanc-pessoa-nome')) return 'nome';
    if (el.classList.contains('lc-outra-texto')) return 'livre';
    return null;
  }

  function aplicar(el) {
    var modo = modoDe(el);
    if (!modo) return;
    var antes = el.value, depois = formatar(antes, modo);
    if (antes === depois) return;
    var ini = null, fim = null;
    try { ini = el.selectionStart; fim = el.selectionEnd; } catch (e) { /* tipo sem seleção */ }
    el.value = depois;   // só troca a caixa das letras: o tamanho é o mesmo
    try { if (ini !== null) el.setSelectionRange(ini, fim); } catch (e) { /* ignora */ }
  }

  document.addEventListener('input', function (e) {
    if (e.isComposing) return;
    aplicar(e.target);
  }, true);

  // valores colocados por script (edição, preenchimento) e envio do formulário
  document.addEventListener('focusout', function (e) { aplicar(e.target); }, true);
  document.addEventListener('submit', function (e) {
    var campos = e.target && e.target.querySelectorAll ? e.target.querySelectorAll('input,textarea') : [];
    Array.prototype.forEach.call(campos, aplicar);
  }, true);

  window.LANC_NOMES = { formatar: formatar };
})();
