/* Adiciona um campo de busca a todo <select> da página: em vez do menu
   nativo do navegador, abre um painel flutuante com campo de texto que
   filtra as opções — útil pra listas longas (municípios, locais de
   votação, bairros etc.).

   Não esconde nem substitui o <select> original (continua exatamente como
   já é: mesmo id/name/value, mesmo CSS específico de cada tela, required
   nativo funcionando) — só intercepta o clique/teclado que abriria o menu
   nativo do navegador e abre o painel de busca no lugar. Ao escolher uma
   opção, muda select.value e dispara 'change' normalmente, então o resto
   do sistema nem percebe a diferença.

   Aplica a todo <select> já existente e observa o <body> pra pegar também
   os criados depois (ex.: o campo "Bairro" de js/eleicoes.js, que troca
   entre <input> e <select> dependendo do município). */
(function () {
  'use strict';
  let aberto = null; // { select, painel }
  // No celular quem abre a lista é js/select-app.js (janela central de escolha).
  const celular = window.matchMedia('(max-width:768px)');

  // "egrecio" acha "Egrécio"; "placido" acha "Plácido de Castro"
  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function fechar() {
    if (!aberto) return;
    aberto.painel.remove();
    aberto = null;
    document.removeEventListener('mousedown', aoClicarFora, true);
    document.removeEventListener('scroll', reposicionar, true);
    window.removeEventListener('resize', reposicionar);
  }
  function aoClicarFora(e) {
    if (aberto && e.target !== aberto.select && !aberto.painel.contains(e.target)) fechar();
  }
  function reposicionar() {
    if (aberto) posicionar(aberto.select, aberto.painel);
  }
  function posicionar(select, painel) {
    const r = select.getBoundingClientRect();
    painel.style.width = Math.max(r.width, 200) + 'px';
    let top = r.bottom + 4;
    if (top + painel.offsetHeight > window.innerHeight && r.top - 4 - painel.offsetHeight > 0) {
      top = r.top - 4 - painel.offsetHeight;
    }
    painel.style.left = Math.max(4, Math.min(r.left, window.innerWidth - painel.offsetWidth - 4)) + 'px';
    painel.style.top = top + 'px';
  }

  function abrir(select) {
    if (select.disabled || (aberto && aberto.select === select)) return;
    fechar();

    const painel = document.createElement('div');
    painel.className = 'select-busca-painel';
    const campo = document.createElement('input');
    campo.type = 'search';
    campo.className = 'select-busca-campo';
    campo.placeholder = 'Buscar…';
    campo.setAttribute('aria-label', 'Buscar');
    const lista = document.createElement('ul');
    lista.className = 'select-busca-lista';
    lista.setAttribute('role', 'listbox');
    painel.append(campo, lista);
    // Dentro de um <dialog> aberto (modal), o painel precisa ficar DENTRO
    // dele: solto no body ficaria atrás da camada do modal, sem clique.
    (select.closest('dialog[open]') || document.body).append(painel);

    function escolher(op) {
      if (select.value !== op.value) {
        select.value = op.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      fechar();
      select.focus();
    }
    function renderizar(filtro) {
      const termo = semAcento(filtro).trim();
      lista.replaceChildren();
      let alguma = false;
      [...select.options].forEach(op => {
        const texto = op.textContent;
        if (termo && !semAcento(texto).includes(termo)) return;
        alguma = true;
        const li = document.createElement('li');
        li.textContent = texto || ' ';
        li.setAttribute('role', 'option');
        li.tabIndex = -1;
        li.className = 'select-busca-opcao' + (op.value === select.value ? ' selecionada' : '');
        li.addEventListener('mousedown', e => { e.preventDefault(); escolher(op); });
        lista.append(li);
      });
      if (!alguma) {
        const li = document.createElement('li');
        li.className = 'select-busca-vazio';
        li.textContent = 'Nada encontrado.';
        lista.append(li);
      }
      posicionar(select, painel);
    }
    campo.addEventListener('input', () => renderizar(campo.value));
    campo.addEventListener('keydown', e => {
      if (e.key === 'Escape') { fechar(); select.focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); const op = lista.querySelector('.select-busca-opcao'); if (op) op.dispatchEvent(new MouseEvent('mousedown')); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); const op = lista.querySelector('.select-busca-opcao'); if (op) op.focus(); }
    });
    lista.addEventListener('keydown', e => {
      const atual = document.activeElement;
      if (e.key === 'ArrowDown') { e.preventDefault(); const p = atual && atual.nextElementSibling; if (p) p.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); const p = atual && atual.previousElementSibling; if (p) p.focus(); else campo.focus(); }
      else if (e.key === 'Escape') { fechar(); select.focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (atual && atual.classList.contains('select-busca-opcao')) atual.dispatchEvent(new MouseEvent('mousedown')); }
    });

    aberto = { select, painel };
    renderizar('');
    campo.focus();
    document.addEventListener('mousedown', aoClicarFora, true);
    document.addEventListener('scroll', reposicionar, true);
    window.addEventListener('resize', reposicionar);
  }

  function transformar(select) {
    if (select.dataset.buscaAplicada) return;
    select.dataset.buscaAplicada = '1';
    select.addEventListener('mousedown', e => {
      if (celular.matches) return;
      e.preventDefault();
      select.focus();
      abrir(select);
    });
    select.addEventListener('keydown', e => {
      if (celular.matches) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrir(select);
      }
    });
  }

  function aplicarATodos(raiz) {
    (raiz || document).querySelectorAll('select').forEach(transformar);
  }

  aplicarATodos();
  new MutationObserver(mutacoes => {
    mutacoes.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'SELECT') transformar(node);
      else if (node.querySelectorAll) aplicarATodos(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });

  window.SelectBusca = { aplicarATodos };
})();
