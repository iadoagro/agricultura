/* Select "de aplicativo" no celular: em vez do seletor nativo do navegador,
   abre uma janela central com a lista de opções e um marcador de escolha à
   direita. O <select> continua sendo a fonte da verdade (valor, required,
   change); só a forma de escolher muda. Ativo em telas até 768px, para todo
   <select> simples da página (incluindo os criados depois). */
(function () {
  var movel = window.matchMedia('(max-width:768px)');
  var aberto = null;

  function fechar() {
    if (!aberto) return;
    aberto.fundo.remove();
    document.removeEventListener('keydown', aberto.tecla, true);
    var sel = aberto.sel;
    aberto = null;
    try { sel.focus({ preventScroll: true }); } catch (e) {}
  }

  function abrir(sel) {
    fechar();
    var fundo = document.createElement('div');
    fundo.className = 'sa-fundo';
    var janela = document.createElement('ul');
    janela.className = 'sa-janela';
    janela.setAttribute('role', 'listbox');
    var atual = null;
    Array.prototype.forEach.call(sel.options, function (o, i) {
      if (o.hidden) return;
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      var ativo = i === sel.selectedIndex;
      li.className = (ativo ? 'sa-atual ' : '') + (o.disabled ? 'sa-desab' : '');
      li.setAttribute('aria-selected', ativo ? 'true' : 'false');
      var txt = document.createElement('span');
      txt.textContent = o.textContent;
      var marca = document.createElement('i');
      marca.className = 'sa-radio';
      li.append(txt, marca);
      if (ativo) atual = li;
      li.addEventListener('click', function () {
        if (o.disabled) return;
        var mudou = sel.selectedIndex !== i;
        sel.selectedIndex = i;
        fechar();
        if (mudou) {
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      janela.append(li);
    });
    fundo.append(janela);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    var tecla = function (e) { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', tecla, true);
    document.body.append(fundo);
    aberto = { fundo: fundo, sel: sel, tecla: tecla };
    if (atual) janela.scrollTop = Math.max(0, atual.offsetTop - janela.clientHeight / 2 + atual.offsetHeight / 2);
  }

  function elegivel(el) {
    return el && el.tagName === 'SELECT' && !el.multiple && !(el.size > 1) && !el.disabled && movel.matches;
  }

  // Impede o seletor nativo e abre o nosso.
  document.addEventListener('mousedown', function (e) {
    var sel = e.target.closest && e.target.closest('select');
    if (!elegivel(sel)) return;
    e.preventDefault();
    sel.focus({ preventScroll: true });
    abrir(sel);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (aberto || (e.key !== 'Enter' && e.key !== ' ')) return;
    var sel = e.target;
    if (!elegivel(sel)) return;
    e.preventDefault();
    abrir(sel);
  }, true);
})();
