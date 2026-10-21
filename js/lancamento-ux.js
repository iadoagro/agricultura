/* Agilidade e conforto no formulário de lançamento (e na edição).
   Nada aqui muda o que é gravado: só ajuda a pessoa a chegar lá com menos
   cliques e menos idas e vindas.

   - Barra de ações fixa no rodapé, com o progresso dos campos obrigatórios e a
     lista do que falta (cada item leva ao campo);
   - Enter passa para o próximo campo (não envia o formulário sem querer) e
     Ctrl+Enter salva;
   - máscara do telefone;
   - seção concluída ganha um "visto";
   - depois de escolher o serviço, vai direto ao primeiro campo da seção seguinte. */
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function rotuloDe(campo) {
    var lbl = campo.closest('label');
    if (!lbl) return campo.name || 'campo';
    var c = lbl.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('input,select,textarea,button,small,.lanc-obrig,.lanc-seg,.data-erro,option'),
      function (n) { n.remove(); });
    return c.textContent.replace(/\s+/g, ' ').replace(/\*/g, '').trim() || campo.name || 'campo';
  }

  function ligar(form, opc) {
    if (!form || form.getAttribute('data-ux') === '1') return null;
    form.setAttribute('data-ux', '1');
    opc = opc || {};

    var barra = form.querySelector('.upload-acoes');
    var progresso = null, fill = null, txt = null, lista = null, btnProg = null;

    /* ------------------------------------------------ campos obrigatórios */
    function pendencias() {
      var itens = [], vistos = {};
      Array.prototype.forEach.call(form.querySelectorAll('input[required], select[required], textarea[required]'), function (c) {
        if (c.disabled || c.closest('[hidden]')) return;
        if (c.type === 'radio') {
          if (vistos[c.name]) return;
          vistos[c.name] = true;
          itens.push({ campo: c, rotulo: 'Tipo de serviço', ok: !!form.elements[c.name].value, secao: c.closest('section') });
          return;
        }
        // preenchido de verdade: não vazio, válido para o navegador (data
        // incompleta, número fora do mínimo...) e, no CPF, com os 11 dígitos
        var ok = String(c.value).trim() !== '' && !(c.validity && !c.validity.valid);
        if (ok && c.name === 'cpf') ok = c.value.replace(/\D/g, '').length === 11;
        itens.push({ campo: c, rotulo: rotuloDe(c), ok: ok, secao: c.closest('section') });
      });
      var tipo = form.elements['tipo_servico'] ? form.elements['tipo_servico'].value : '';
      if (tipo === 'Mecanização') {
        // ao menos uma cultura com área e sistema de cultivo preenchidos
        var linhas = Array.prototype.slice.call(form.querySelectorAll('.lanc-cultura-linha'));
        var completa = function (l) {
          return !!l.querySelector('.lc-cultura').value && parseFloat(l.querySelector('.lc-area').value) > 0 && !!l.querySelector('.lc-sistema').value;
        };
        var alvo = linhas.filter(completa)[0] || linhas[0];
        if (alvo) {
          var faltaCampo = ['.lc-cultura', '.lc-area', '.lc-sistema'].map(function (q) { return alvo.querySelector(q); })
            .filter(function (c) { return !c.value || (c.classList.contains('lc-area') && !(parseFloat(c.value) > 0)); })[0];
          itens.push({ campo: faltaCampo || alvo.querySelector('.lc-cultura'), rotulo: 'Cultura, área e sistema de cultivo',
            ok: linhas.some(completa), secao: alvo.closest('section') });
        }
      } else if (tipo === 'Açudagem' && form.elements['quantidade_acudes']) {
        var q = form.elements['quantidade_acudes'];
        itens.push({ campo: q, rotulo: 'Quantidade de tanques/açudes', ok: parseInt(q.value, 10) >= 1, secao: q.closest('section') });
        var h = form.elements['horas_maquina'];
        if (h) itens.push({ campo: h, rotulo: 'Horas de máquina', ok: parseFloat(String(h.value).replace(',', '.')) > 0, secao: h.closest('section') });
      }
      // máquina utilizada: obrigatória nos dois serviços
      var hostMaq = el('lancMaquinas');
      if (tipo && hostMaq && !hostMaq.closest('[hidden]')) {
        var marcada = Array.prototype.some.call(hostMaq.querySelectorAll('input[type=checkbox]:checked'), function (i) {
          if (!i.classList.contains('lc-outra-check')) return true;
          var t = hostMaq.querySelector('.lc-outra-texto');
          return !!(t && t.value.trim());
        });
        itens.push({ campo: hostMaq.querySelector('input[type=checkbox]') || hostMaq, rotulo: 'Máquina utilizada', ok: marcada, secao: hostMaq.closest('section') });
      }
      return itens;
    }

    function irPara(campo) {
      // seção bloqueada não recebe foco: leva ao primeiro pendente já liberado
      if (campo.closest && campo.closest('.lanc-bloqueada')) {
        var livre = pendencias().filter(function (i) { return !i.ok && !(i.campo.closest && i.campo.closest('.lanc-bloqueada')); })[0];
        if (livre) campo = livre.campo;
      }
      var alvo = campo;
      // select virou botões: o foco vai para o primeiro botão do grupo
      if (campo.classList && campo.classList.contains('lanc-seg-oculto')) {
        var g = campo.nextElementSibling;
        if (g) alvo = g.querySelector('.lanc-seg-op') || campo;
      }
      alvo.scrollIntoView({ behavior: 'auto', block: 'center' });
      try { alvo.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
    }

    /* Libera as seções em ordem: cada uma só abre quando os obrigatórios da
       anterior estão preenchidos (seção sem obrigatório não trava a próxima). */
    function bloquearSecoes(itens) {
      var porSecao = new Map();
      itens.forEach(function (i) {
        if (!i.secao) return;
        var r = porSecao.get(i.secao) || { n: 0, ok: 0 };
        r.n++; if (i.ok) r.ok++;
        porSecao.set(i.secao, r);
      });
      var liberada = true;
      Array.prototype.forEach.call(form.querySelectorAll('section.painel'), function (s) {
        if (s.hidden) return;
        s.classList.toggle('lanc-bloqueada', !liberada);
        if (liberada) s.removeAttribute('inert'); else s.setAttribute('inert', '');
        var r = porSecao.get(s);
        var completa = !(r && r.ok !== r.n);
        // rótulo no cabeçalho: bloqueada, em preenchimento, concluída ou opcional
        s.setAttribute('data-estado', !liberada ? 'bloqueada' : !completa ? 'atual' : (r ? 'ok' : 'opcional'));
        if (!completa) liberada = false;
      });
    }

    var ultimoResumo = '';
    function atualizar() {
      var itens = pendencias();
      bloquearSecoes(itens);
      var feitos = itens.filter(function (i) { return i.ok; }).length;
      var faltam = itens.filter(function (i) { return !i.ok; });
      var total = itens.length;
      var resumo = feitos + '/' + total + '|' + faltam.map(function (f) { return f.rotulo; }).join(',');
      if (resumo !== ultimoResumo) {
        ultimoResumo = resumo;
        if (progresso) {
          fill.style.width = (total ? Math.round(feitos / total * 100) : 100) + '%';
          progresso.classList.toggle('completo', total > 0 && !faltam.length);
          txt.textContent = faltam.length
            ? feitos + ' de ' + total + ' obrigatórios'
            : 'Tudo preenchido';
          lista.innerHTML = faltam.length
            ? '<p>Falta preencher:</p><ul>' + faltam.map(function (f, i) {
              return '<li><button type="button" data-i="' + i + '">' + f.rotulo.replace(/[&<>"]/g, '') + '</button></li>';
            }).join('') + '</ul>'
            : '<p>Todos os campos obrigatórios estão preenchidos.</p>';
          lista._faltam = faltam;
        }
        // "visto" nas seções cujos obrigatórios estão completos
        var porSecao = new Map();
        itens.forEach(function (i) {
          if (!i.secao) return;
          var r = porSecao.get(i.secao) || { n: 0, ok: 0 };
          r.n++; if (i.ok) r.ok++;
          porSecao.set(i.secao, r);
        });
        Array.prototype.forEach.call(form.querySelectorAll('section.painel'), function (s) {
          var r = porSecao.get(s);
          s.classList.toggle('lanc-ok', !!(r && r.n && r.ok === r.n));
        });
      }
    }

    /* ----------------------------------------------- barra: progresso */
    if (barra) {
      progresso = document.createElement('div');
      progresso.className = 'lanc-progresso';
      progresso.innerHTML =
        '<button type="button" class="lanc-prog-btn" aria-expanded="false" aria-label="Campos obrigatórios">' +
        '<span class="lanc-prog-barra"><i></i></span><span class="lanc-prog-txt">0 de 0 obrigatórios</span></button>' +
        '<div class="lanc-prog-lista" hidden></div>';
      barra.insertBefore(progresso, barra.firstChild);
      btnProg = progresso.querySelector('.lanc-prog-btn');
      fill = progresso.querySelector('.lanc-prog-barra i');
      txt = progresso.querySelector('.lanc-prog-txt');
      lista = progresso.querySelector('.lanc-prog-lista');
      btnProg.addEventListener('click', function () {
        var abrir = lista.hidden;
        lista.hidden = !abrir;
        btnProg.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      });
      lista.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]');
        if (!b || !lista._faltam) return;
        var item = lista._faltam[+b.getAttribute('data-i')];
        lista.hidden = true;
        btnProg.setAttribute('aria-expanded', 'false');
        if (item) irPara(item.campo);
      });
      document.addEventListener('click', function (e) {
        if (!lista.hidden && !e.target.closest('.lanc-progresso')) { lista.hidden = true; btnProg.setAttribute('aria-expanded', 'false'); }
      });
    }

    /* -------------------------------------------- Enter → próximo campo */
    function focaveis() {
      return Array.prototype.filter.call(
        form.querySelectorAll('input, select, textarea, button.lanc-seg-op, button.lanc-add-mais'),
        function (c) {
          if (c.disabled || c.closest('[inert]') || c.tabIndex < 0 && !c.classList.contains('lanc-seg-op')) return false;
          if (c.type === 'hidden' || c.type === 'radio' || c.type === 'checkbox') return false;
          if (c.classList.contains('lanc-seg-oculto')) return false;
          return !!(c.offsetWidth || c.offsetHeight || c.getClientRects().length);
        });
    }
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      var t = e.target;
      if (e.ctrlKey || e.metaKey) {           // Ctrl+Enter: salva
        e.preventDefault();
        var padrao = el('lancSalvar');
        if (padrao && !padrao.disabled && form.requestSubmit) form.requestSubmit(padrao);
        return;
      }
      if (t.tagName !== 'INPUT' || t.type === 'submit' || t.type === 'button') return;
      e.preventDefault();
      var lista2 = focaveis(), i = lista2.indexOf(t);
      if (i >= 0 && lista2[i + 1]) { lista2[i + 1].focus(); if (lista2[i + 1].select) { try { lista2[i + 1].select(); } catch (er) { /* tipo sem seleção */ } } }
    });

    /* Escolheu uma opção nos botões (sexo, CAF...) → o foco já vai ao próximo
       campo. Só no clique/Enter/espaço: as setas só passeiam entre as opções. */
    form.addEventListener('click', function (e) {
      var op = e.target.closest && e.target.closest('.lanc-seg-op');
      if (!op) return;
      var grupo = op.closest('.lanc-seg');
      setTimeout(function () {
        if (!op.classList.contains('on')) return;   // clicou de novo e desmarcou: fica
        var proximo = focaveis().filter(function (c) {
          return !grupo.contains(c) && (grupo.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
        })[0];
        if (proximo) { proximo.focus(); if (proximo.select) { try { proximo.select(); } catch (er) { /* sem seleção */ } } }
      }, 60);
    });

    /* ----------------------------------------------- telefone: máscara */
    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t.name !== 'telefone') return;
      var d = t.value.replace(/\D/g, '').slice(0, 11), v = '';
      if (d.length) v = '(' + d.slice(0, 2);
      if (d.length >= 2) v += ') ';
      if (d.length > 2) v += d.slice(2, d.length > 10 ? 7 : 6);
      if (d.length > (d.length > 10 ? 7 : 6)) v += '-' + d.slice(d.length > 10 ? 7 : 6);
      if (t.value !== v) t.value = v;
    });

    /* --------------------------------- serviço escolhido → próxima seção */
    form.addEventListener('change', function (e) {
      if (!e.target || e.target.name !== 'tipo_servico' || !e.target.checked) return;
      setTimeout(function () {
        var sec = el('lancSecMecanizacao') && !el('lancSecMecanizacao').hidden ? el('lancSecMecanizacao')
          : el('lancSecAcudagem') && !el('lancSecAcudagem').hidden ? el('lancSecAcudagem') : null;
        if (!sec) return;
        var primeiro = sec.querySelector('select, input:not([type=hidden])');
        sec.scrollIntoView({ behavior: 'auto', block: 'start' });
        if (primeiro) { try { primeiro.focus({ preventScroll: true }); } catch (er) { /* sem foco */ } }
      }, 80);
    });

    /* ------------------------------------------------------ atualização */
    ['input', 'change'].forEach(function (ev) { form.addEventListener(ev, function () { requestAnimationFrame(atualizar); }); });
    form.addEventListener('reset', function () { setTimeout(atualizar, 0); });
    var rel = setInterval(function () {
      if (!document.body.contains(form)) { clearInterval(rel); return; }
      if (form.offsetParent !== null) atualizar();   // só enquanto o formulário está à vista
    }, 600);
    atualizar();

    /** Cursor no primeiro campo que falta (ou no nome do beneficiário, com o lote já preenchido). */
    function focarPrimeiro() {
      var falta = pendencias().filter(function (i) { return !i.ok; })[0];
      var alvo = falta ? falta.campo : form.elements['nome_beneficiario'];
      if (!alvo) return;
      if (alvo.classList && alvo.classList.contains('lanc-seg-oculto') && alvo.nextElementSibling) {
        alvo = alvo.nextElementSibling.querySelector('.lanc-seg-op') || alvo;
      }
      try { alvo.focus({ preventScroll: false }); } catch (e) { /* sem foco */ }
    }

    return { atualizar: atualizar, focarPrimeiro: focarPrimeiro, pendencias: pendencias };
  }

  window.LANCAMENTO_UX = { ligar: ligar };
})();
