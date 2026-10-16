/* Ferramentas das tabelas do painel de mecanização: toda table.dados ganha,
   sozinha, uma barra com FILTRAR, ORDENAR e AGRUPAR — e o clique no título
   da coluna também ordena.

   As tabelas do painel são refeitas (innerHTML) a cada filtro da lateral, por
   isso nada aqui é guardado fora da própria tabela: um MutationObserver
   enxerga a tabela nova e monta a barra de novo. A linha "Total" fica sempre
   no fim, fora do filtro, da ordem e dos grupos.

   Ficam de fora tabelas que já têm o próprio controle: Registros
   (table.registros, com busca, ordem e paginação), o agrupamento por
   município do Beneficiário (tr.ben-grupo), o relatório de exportação e as
   janelas (dialog). */
(function () {
  'use strict';

  var SEM_SOMA = /%|média|por |variação|part|ritmo|primeiro|último|data|^#$|dia\b/i;

  function txt(c) { return (c.textContent || '').replace(/\s+/g, ' ').trim(); }

  /** Número de uma célula pt-BR ("1.234,5", "12%", "▲ +7 (47%)"), ou null. */
  function numero(s) {
    var m = /^[▲▼=\s+]*(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)/.exec(s);
    if (!m) return null;
    var v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  /** Chave de ordenação: data dd/mm/aaaa vira aaaammdd; número vira número. */
  function chave(s) {
    var d = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    if (d) return { n: +(d[3] + d[2] + d[1]), t: s };
    if (s === '' || s === '—' || s === '=') return { n: null, t: '' };
    var n = /^[▲▼=\s+]*-?[\d.,]+\s*(%|ha|h)?\b/.test(s) ? numero(s) : null;
    return { n: n, t: s };
  }

  function comparar(a, b) {
    if (a.n != null && b.n != null) return a.n - b.n;
    if (a.n != null) return -1;      // número antes de texto; vazio por último
    if (b.n != null) return 1;
    if (!a.t && b.t) return 1;
    if (!b.t && a.t) return -1;
    return a.t.localeCompare(b.t, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  function ehTotal(tr) {
    for (var i = 0; i < tr.cells.length && i < 3; i++) {
      if (/^total\b/i.test(txt(tr.cells[i]))) return true;
    }
    return false;
  }

  function elegivel(t) {
    if (t.getAttribute('data-tf')) return false;
    if (t.classList.contains('registros') || t.classList.contains('relatorio-tbl')) return false;
    if (t.closest('dialog, .relatorio-registros, .relatorio-tbl, [data-aba="lancamento"], [data-aba="relatorio"]')) return false;
    if (t.querySelector('.ben-grupo')) return false;
    if (!t.tBodies.length || !t.tHead || !t.tHead.rows.length) return false;
    var th = t.tHead.rows[0].cells;
    if (th.length < 2 && !t.tBodies[0].rows.length) return false;
    // célula com colspan no corpo (linha de aviso "nenhum resultado") = sem dados
    var linhas = t.tBodies[0].rows;
    for (var i = 0; i < linhas.length; i++) {
      if (linhas[i].cells.length === 1 && linhas[i].cells[0].colSpan > 1) return false;
    }
    return linhas.length >= 2;
  }

  function montar(t) {
    t.setAttribute('data-tf', '1');
    var corpo = t.tBodies[0];
    var ths = Array.prototype.slice.call(t.tHead.rows[0].cells);
    var todas = Array.prototype.slice.call(corpo.rows);
    var fixas = todas.filter(ehTotal);                 // Total: sempre no fim
    var dados = todas.filter(function (r) { return fixas.indexOf(r) < 0; });
    var ncols = ths.length;

    // por coluna: é numérica? (todas as linhas com número) e soma-se no grupo?
    var colNum = ths.map(function (th, c) {
      var ok = dados.length > 0;
      dados.forEach(function (r) {
        var cel = r.cells[c];
        if (!cel) { ok = false; return; }
        var s = txt(cel);
        if (s === '—' || s === '') return;
        if (numero(s) == null || !/^[▲▼=\s+]*-?[\d.,]+\s*%?$/.test(s.split('(')[0].trim())) ok = false;
      });
      return ok;
    });
    var colSoma = ths.map(function (th, c) { return colNum[c] && !SEM_SOMA.test(txt(th)); });
    var colTexto = ths.map(function (th, c) { return !colNum[c] && txt(th) !== ''; });

    var rot = function (i) { return txt(ths[i]) || ('Coluna ' + (i + 1)); };
    var estado = { q: '', col: -1, dir: 1, grupo: -1 };
    var fechados = {};

    // ---- barra
    var bar = document.createElement('div');
    bar.className = 'tf-bar';
    var temBusca = !!(t.closest('.painel') && t.closest('.painel').querySelector('.tabela-cab input[type=search]'));
    var h = '';
    if (!temBusca) h += '<input type="search" class="tf-busca" placeholder="Filtrar linhas&hellip;" aria-label="Filtrar linhas da tabela">';
    h += '<label class="tf-campo">Ordenar por <select class="tf-ord"><option value="-1">Ordem original</option>';
    ths.forEach(function (th, i) { if (txt(th)) h += '<option value="' + i + '">' + rot(i).replace(/</g, '&lt;') + '</option>'; });
    h += '</select></label>';
    h += '<button type="button" class="tf-dir" title="Inverter a ordem" aria-label="Inverter a ordem">&darr;</button>';
    if (colTexto.some(Boolean)) {
      h += '<label class="tf-campo">Agrupar por <select class="tf-grp"><option value="-1">Sem grupos</option>';
      ths.forEach(function (th, i) { if (colTexto[i]) h += '<option value="' + i + '">' + rot(i).replace(/</g, '&lt;') + '</option>'; });
      h += '</select></label>';
    }
    h += '<span class="tf-cont" aria-live="polite"></span>';
    bar.innerHTML = h;
    var alvo = t.closest('.tabela-scroll') || t;
    alvo.parentNode.insertBefore(bar, alvo);

    var inBusca = bar.querySelector('.tf-busca'), selOrd = bar.querySelector('.tf-ord'),
        btnDir = bar.querySelector('.tf-dir'), selGrp = bar.querySelector('.tf-grp'),
        cont = bar.querySelector('.tf-cont');

    // cache de chaves de ordenação
    var cache = new Map();
    function chaveDe(r, c) {
      var m = cache.get(r);
      if (!m) cache.set(r, m = {});
      return m[c] || (m[c] = chave(r.cells[c] ? txt(r.cells[c]) : ''));
    }

    function numFmt(v) {
      return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    }

    function desenhar() {
      var q = estado.q.toLowerCase();
      var vis = dados.filter(function (r) { return !q || txt(r).toLowerCase().indexOf(q) >= 0; });
      if (estado.col >= 0) {
        vis = vis.slice().sort(function (a, b) {
          return comparar(chaveDe(a, estado.col), chaveDe(b, estado.col)) * estado.dir;
        });
      }
      while (corpo.firstChild) corpo.removeChild(corpo.firstChild);
      if (estado.grupo < 0) {
        vis.forEach(function (r) { corpo.appendChild(r); });
      } else {
        var grupos = new Map();
        vis.forEach(function (r) {
          var k = txt(r.cells[estado.grupo]) || '—';
          if (!grupos.has(k)) grupos.set(k, []);
          grupos.get(k).push(r);
        });
        Array.from(grupos.keys()).sort(function (a, b) { return a.localeCompare(b, 'pt-BR', { numeric: true }); })
          .forEach(function (k) {
            var lin = grupos.get(k), aberto = !fechados[k];
            var g = document.createElement('tr');
            g.className = 'tf-grupo';
            g.tabIndex = 0;
            g.setAttribute('aria-expanded', aberto ? 'true' : 'false');
            var cel = '';
            for (var c = 0; c < ncols; c++) {
              if (c === 0) {
                cel += '<td><span class="tf-seta">' + (aberto ? '&#9662;' : '&#9656;') + '</span> ' +
                  '<b></b> <span class="tf-n">(' + lin.length + ')</span></td>';
              } else if (colSoma[c]) {
                var s = lin.reduce(function (a, r) { return a + (numero(txt(r.cells[c])) || 0); }, 0);
                cel += '<td class="num">' + numFmt(s) + '</td>';
              } else cel += '<td></td>';
            }
            g.innerHTML = cel;
            g.cells[0].querySelector('b').textContent = k;
            var alt = function () { fechados[k] = !fechados[k]; desenhar(); };
            g.addEventListener('click', alt);
            g.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alt(); }
            });
            corpo.appendChild(g);
            if (aberto) lin.forEach(function (r) { corpo.appendChild(r); });
          });
      }
      fixas.forEach(function (r) { corpo.appendChild(r); });
      cont.textContent = vis.length === dados.length
        ? dados.length + ' linhas'
        : vis.length + ' de ' + dados.length + ' linhas';
      ths.forEach(function (th, i) {
        th.setAttribute('aria-sort', i === estado.col ? (estado.dir > 0 ? 'ascending' : 'descending') : 'none');
        th.classList.toggle('tf-ord-ativa', i === estado.col);
        th.setAttribute('data-tf-dir', i === estado.col ? (estado.dir > 0 ? '▲' : '▼') : '');
      });
      selOrd.value = String(estado.col);
      btnDir.innerHTML = estado.dir > 0 ? '&uarr;' : '&darr;';
    }

    if (inBusca) {
      var tm;
      inBusca.addEventListener('input', function () {
        clearTimeout(tm);
        tm = setTimeout(function () { estado.q = inBusca.value.trim(); desenhar(); }, 140);
      });
    }
    selOrd.addEventListener('change', function () { estado.col = +selOrd.value; desenhar(); });
    btnDir.addEventListener('click', function () { estado.dir = -estado.dir; desenhar(); });
    if (selGrp) selGrp.addEventListener('change', function () { estado.grupo = +selGrp.value; desenhar(); });

    // clique no título: ordena; de novo inverte
    ths.forEach(function (th, i) {
      if (!txt(th)) return;
      th.classList.add('tf-ord-th');
      th.tabIndex = 0;
      th.setAttribute('role', 'button');
      var ir = function () {
        if (estado.col === i) estado.dir = -estado.dir;
        else { estado.col = i; estado.dir = colNum[i] ? -1 : 1; }
        desenhar();
      };
      th.addEventListener('click', ir);
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
      });
    });

    desenhar();
  }

  var agendado = false;
  function varrer() {
    agendado = false;
    var ts = document.querySelectorAll('table.dados:not([data-tf])');
    for (var i = 0; i < ts.length; i++) {
      if (elegivel(ts[i])) montar(ts[i]);
    }
  }
  function agendar() {
    if (agendado) return;
    agendado = true;
    setTimeout(varrer, 30);   // não rAF: não dispara em aba em segundo plano
  }

  function iniciar() {
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    varrer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
