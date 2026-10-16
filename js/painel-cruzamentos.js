/* Aba "Cruzamentos": tabela dinâmica (linhas × colunas) sobre a seleção atual, com células
   sombreadas pelo valor. Combine município, escritório, técnico, regional, cultura, serviço,
   máquina, implemento, mês ou sistema de cultivo com atendimentos, hectares, horas, tanques,
   DAE ou produtores. Exporta em CSV/Excel. Usa window.PAINEL_API (js/dashboard.js). */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A) return;
  var G = A.G;
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var NI = A.NI;

  /** cada dimensão devolve [[chave, pesoHa]] por registro; pesoHa só importa para cultura */
  var DIMS = {
    mun: { rot: 'Município', k: function (r) { return r.mun ? [[r.mun]] : []; } },
    reg: { rot: 'Regional', k: function (r) { var g = A.regionalDe(r.mun); return g ? [[g]] : []; } },
    esc: { rot: 'Escritório local', k: function (r) { return r.esc && r.esc !== NI ? [[r.esc]] : []; } },
    tec: { rot: 'Responsável técnico', k: function (r) { return r.rt && r.rt !== NI ? [[r.rt]] : []; } },
    pc: { rot: 'Serviço', k: function (r) { return r.pc ? [[r.pc]] : []; } },
    cult: { rot: 'Cultura', k: function (r) { return r.cult.map(function (c) { return [c[0], c[1]]; }); } },
    sis: { rot: 'Sistema de cultivo', k: function (r) { return r.cult.filter(function (c) { return c[2]; }).map(function (c) { return [c[2], c[1]]; }); } },
    maq: { rot: 'Máquina', k: function (r) { return r.maq.map(function (m) { return [m]; }); } },
    impl: { rot: 'Implemento', k: function (r) { return r.impl.map(function (m) { return [m]; }); } },
    mes: { rot: 'Mês', k: function (r) { var m = +A.dataRef(r).slice(5, 7) - 1; return m >= 0 && m < 12 ? [[MESES[m]]] : []; } },
    ano: { rot: 'Exercício', k: function (r) { return [[A.anoDe(r)]]; } }
  };
  var METS = {
    n: { rot: 'Atendimentos', dec: 0, v: function () { return 1; } },
    ha: { rot: 'Hectares mecanizados', dec: 1, v: function (r, w) { return w != null ? w : (r.pc === A.MEC ? (r.ha || 0) : 0); } },
    hrs: { rot: 'Horas de máquina', dec: 1, v: function (r) { return r.hrs || 0; } },
    ac: { rot: 'Tanques / açudes', dec: 0, v: function (r) { return r.ac || 0; } },
    dae: { rot: 'DAE arrecadada (R$)', dec: 0, v: function (r) { return r.dae || 0; } },
    prod: { rot: 'Produtores distintos', dec: 0, distinto: true }
  };
  var E = { lin: 'mun', col: 'pc', met: 'n', maxL: 25, maxC: 10 };
  var ULTIMA = null;

  function el(id) { return document.getElementById(id); }

  function montarSeletores() {
    var raiz = el('cruzControles');
    if (!raiz || raiz.getAttribute('data-ok')) return;
    raiz.setAttribute('data-ok', '1');
    var op = function (o, sel) {
      return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + G.esc(o[k].rot) + '</option>'; }).join('');
    };
    raiz.innerHTML =
      '<label>Linhas <select id="cruzLin">' + op(DIMS, E.lin) + '</select></label>' +
      '<label>Colunas <select id="cruzCol">' + op(DIMS, E.col) + '</select></label>' +
      '<label>Valor <select id="cruzMet">' + op(METS, E.met) + '</select></label>' +
      '<button type="button" class="btn" id="cruzTroca" title="Trocar linhas por colunas">⇄ Trocar</button>' +
      '<button type="button" class="btn" id="cruzCsv">Baixar CSV</button>';
    raiz.addEventListener('change', function (e) {
      if (e.target.id === 'cruzLin') E.lin = e.target.value;
      else if (e.target.id === 'cruzCol') E.col = e.target.value;
      else if (e.target.id === 'cruzMet') E.met = e.target.value;
      else return;
      A.redesenhar();
    });
    raiz.addEventListener('click', function (e) {
      if (e.target.closest('#cruzTroca')) {
        var t = E.lin; E.lin = E.col; E.col = t;
        el('cruzLin').value = E.lin; el('cruzCol').value = E.col;
        A.redesenhar();
      } else if (e.target.closest('#cruzCsv') && ULTIMA && window.PainelExport) {
        window.PainelExport.baixar('cruzamento-' + E.lin + '-x-' + E.col, ULTIMA.cab, ULTIMA.linhas, 'csv');
      }
    });
  }

  function desenhar(C) {
    montarSeletores();
    var met = METS[E.met], dl = DIMS[E.lin], dc = DIMS[E.col];
    var cel = new Map();   // "l\u0001c" -> valor | Set (produtores)
    var totL = new Map(), totC = new Map();
    function add(m, k, r, w) {
      if (met.distinto) {
        var s = m.get(k) || new Set();
        s.add(A.chaveProdutor(r));
        m.set(k, s);
      } else m.set(k, (m.get(k) || 0) + met.v(r, w));
    }
    C.D.forEach(function (r) {
      var ls = dl.k(r), cs = dc.k(r);
      ls.forEach(function (l) {
        add(totL, l[0], r, l[1]);
        cs.forEach(function (c) {
          // para hectares por cultura, o peso vem da dimensão de cultura (linha ou coluna)
          var w = E.met === 'ha' ? (E.lin === 'cult' || E.lin === 'sis' ? l[1] : (E.col === 'cult' || E.col === 'sis' ? c[1] : undefined)) : undefined;
          add(cel, l[0] + '\u0001' + c[0], r, w);
        });
      });
      cs.forEach(function (c) { add(totC, c[0], r, E.met === 'ha' && (E.col === 'cult' || E.col === 'sis') ? c[1] : undefined); });
    });
    var val = function (v) { return v instanceof Set ? v.size : (v || 0); };
    var linhas = Array.from(totL.keys()).sort(function (a, b) { return val(totL.get(b)) - val(totL.get(a)) || a.localeCompare(b, 'pt-BR'); });
    var cols = Array.from(totC.keys()).sort(function (a, b) { return val(totC.get(b)) - val(totC.get(a)) || a.localeCompare(b, 'pt-BR'); });
    if (E.lin === 'mes') linhas.sort(function (a, b) { return MESES.indexOf(a) - MESES.indexOf(b); });
    if (E.col === 'mes') cols.sort(function (a, b) { return MESES.indexOf(a) - MESES.indexOf(b); });
    var maisL = linhas.length - E.maxL, maisC = cols.length - E.maxC;
    var vl = linhas.slice(0, E.maxL), vc = cols.slice(0, E.maxC);
    var alvo = el('tCruz');
    if (!vl.length || !vc.length) { alvo.innerHTML = '<p class="vazio">Nada para cruzar nesta seleção.</p>'; ULTIMA = null; return; }
    var max = 0;
    vl.forEach(function (l) { vc.forEach(function (c) { max = Math.max(max, val(cel.get(l + '\u0001' + c))); }); });
    var f = function (v) { return v ? G.num(v, met.dec) : '<span class="nada">—</span>'; };
    var cab = [dl.rot].concat(vc, ['Total']);
    var dados = [];
    var h = '<div class="tabela-scroll"><table class="dados cruz"><thead><tr>' + cab.map(function (c) { return '<th>' + G.esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    vl.forEach(function (l) {
      var linhaCsv = [l];
      h += '<tr><td class="forte">' + G.esc(l) + '</td>';
      vc.forEach(function (c) {
        var v = val(cel.get(l + '\u0001' + c));
        var a = max ? Math.min(0.85, v / max * 0.85) : 0;
        h += '<td class="num" style="' + (v ? 'background:rgba(37,99,235,' + a.toFixed(2) + ');' + (a > 0.45 ? 'color:#fff' : '') : '') + '">' + f(v) + '</td>';
        linhaCsv.push(v ? String(+v.toFixed(met.dec)).replace('.', ',') : '');
      });
      var t = val(totL.get(l));
      h += '<td class="num"><b>' + G.num(t, met.dec) + '</b></td></tr>';
      linhaCsv.push(String(+t.toFixed(met.dec)).replace('.', ','));
      dados.push(linhaCsv);
    });
    h += '</tbody></table></div>';
    var aviso = [];
    if (maisL > 0) aviso.push(maisL + ' linha(s) a mais fora da tabela');
    if (maisC > 0) aviso.push(maisC + ' coluna(s) a mais fora da tabela');
    h += '<p class="cmp-nota">' + G.esc(met.rot) + ' por ' + G.esc(dl.rot.toLowerCase()) + ' × ' + G.esc(dc.rot.toLowerCase()) + ' (seleção atual).' +
      (aviso.length ? ' ' + G.esc(aviso.join('; ')) + ': use os filtros para focar.' : '') +
      (E.met !== 'n' && E.met !== 'prod' && (dl.k === DIMS.maq.k || dc.k === DIMS.maq.k || dl.k === DIMS.impl.k || dc.k === DIMS.impl.k)
        ? ' Um atendimento com várias máquinas conta em cada uma.' : '') + '</p>';
    alvo.innerHTML = h;
    ULTIMA = { cab: cab, linhas: dados };
  }

  A.registrarAba('cruzamentos', function (C) { desenhar(C); });
})();
