/* Aba "Comparativo" do painel de Mecanização: ano × ano ou mês × mês (dentro de um ano),
   com variação, maiores crescimentos e quedas e municípios que deixaram de ser atendidos.
   Respeita os filtros da lateral (serviço, regional, município, escritório, cultura, técnico);
   o Período e o período livre não valem aqui — quem escolhe os dois recortes é esta aba.
   Usa window.PAINEL_API (js/dashboard.js). */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A) return;
  var G = A.G;
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var E = { modo: 'ano', a: '', b: '', ano: '', mesA: '', mesB: '' };

  function el(id) { return document.getElementById(id); }
  function nada() { return '<span class="nada">—</span>'; }

  function mesesDoAno(ano) {
    var s = {};
    A.registros().forEach(function (r) { if (A.anoDe(r) === ano) s[A.dataRef(r).slice(5, 7)] = true; });
    return Object.keys(s).sort();
  }

  function padroes() {
    var anos = A.anos();
    if (!E.a || anos.indexOf(E.a) < 0) E.a = anos[0] || '';
    if (!E.b || anos.indexOf(E.b) < 0) E.b = anos[1] || anos[0] || '';
    if (!E.ano || anos.indexOf(E.ano) < 0) E.ano = anos[0] || '';
    var ms = mesesDoAno(E.ano);
    if (!E.mesA || ms.indexOf(E.mesA) < 0) E.mesA = ms[ms.length - 1] || '01';
    if (!E.mesB || ms.indexOf(E.mesB) < 0) E.mesB = ms[ms.length - 2] || ms[ms.length - 1] || '01';
  }

  function rotulo(ref) {
    // o mês é o da vistoria dentro do exercício (um serviço de dez/2025 lançado na planilha de 2026 conta em 2026)
    return E.modo === 'ano' ? ref : MESES_LONGO[+ref - 1] + ' (exerc. ' + E.ano + ')';
  }
  function subconjunto(ref) {
    if (E.modo === 'ano') return A.filtrar(null, ref);
    return A.filtrar('mes', E.ano).filter(function (r) { return A.dataRef(r).slice(5, 7) === ref; });
  }

  function resumo(D) {
    var mec = D.filter(function (r) { return r.pc === A.MEC; });
    var mun = {};
    D.forEach(function (r) { if (r.mun) mun[r.mun] = true; });
    return {
      n: D.length,
      ha: A.soma(mec, function (r) { return r.ha; }),
      hrs: A.soma(D, function (r) { return r.hrs; }),
      ac: A.soma(D, function (r) { return r.ac; }),
      prod: A.nProdutores(D),
      mun: Object.keys(mun).length
    };
  }

  /** "▲ +7 (47%)" / "▼ -3 (-20%)" / "=" — o formato que as ferramentas de tabela sabem ordenar. */
  function delta(a, b, dec) {
    var d = a - b;
    if (Math.abs(d) < 1e-9) return { txt: '=', cls: '' };
    var pct = b ? ' (' + (d > 0 ? '+' : '') + G.num(d / b * 100, 0) + '%)' : '';
    return d > 0
      ? { txt: '▲ +' + G.num(d, dec || 0) + pct, cls: 'cmp-sobe' }
      : { txt: '▼ -' + G.num(Math.abs(d), dec || 0) + pct, cls: 'cmp-desce' };
  }
  function celDelta(a, b, dec) {
    var d = delta(a, b, dec);
    return '<td class="num ' + d.cls + '">' + d.txt + '</td>';
  }

  function controles(la, lb) {
    var anos = A.anos(), h = '';
    var opAnos = function (sel) {
      return anos.map(function (a) { return '<option value="' + a + '"' + (a === sel ? ' selected' : '') + '>' + a + '</option>'; }).join('');
    };
    var opMeses = function (sel) {
      return mesesDoAno(E.ano).map(function (m) {
        return '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + MESES_LONGO[+m - 1] + '</option>';
      }).join('');
    };
    h += '<div class="cmp-linha">';
    h += '<label>Comparar <select id="cmpModo"><option value="ano"' + (E.modo === 'ano' ? ' selected' : '') + '>Ano × ano</option>' +
      '<option value="mes"' + (E.modo === 'mes' ? ' selected' : '') + '>Mês × mês (dentro de um ano)</option></select></label>';
    if (E.modo === 'ano') {
      h += '<label>Atual (A) <select id="cmpA">' + opAnos(E.a) + '</select></label>';
      h += '<label>Referência (B) <select id="cmpB">' + opAnos(E.b) + '</select></label>';
    } else {
      h += '<label>Ano <select id="cmpAno">' + opAnos(E.ano) + '</select></label>';
      h += '<label>Atual (A) <select id="cmpMesA">' + opMeses(E.mesA) + '</select></label>';
      h += '<label>Referência (B) <select id="cmpMesB">' + opMeses(E.mesB) + '</select></label>';
    }
    h += '<button type="button" class="btn" id="cmpTroca" title="Trocar A por B">⇄ Trocar</button>';
    h += '</div>';
    h += '<p class="cmp-nota">Comparando <b>' + G.esc(la) + '</b> (A) com <b>' + G.esc(lb) + '</b> (B), com os filtros da lateral.</p>';
    el('cmpControles').innerHTML = h;
  }

  /** extrator: registro -> [[chave, atendimentos, hectares]] */
  var EXTR = {
    mun: function (r) { return r.mun ? [[r.mun, 1, r.pc === A.MEC ? r.ha : 0]] : []; },
    esc: function (r) { return r.esc ? [[r.esc, 1, r.pc === A.MEC ? r.ha : 0]] : []; },
    pc: function (r) { return r.pc ? [[r.pc, 1, r.pc === A.MEC ? r.ha : 0]] : []; },
    cult: function (r) { return r.cult.map(function (c) { return [c[0], 1, c[1] || 0]; }); }
  };
  function agrupar(D, ext) {
    var m = new Map();
    D.forEach(function (r) {
      ext(r).forEach(function (t) {
        var o = m.get(t[0]);
        if (!o) m.set(t[0], o = { n: 0, ha: 0 });
        o.n += t[1];
        o.ha += t[2];
      });
    });
    return m;
  }
  function uniao(ma, mb) {
    var ks = new Set();
    ma.forEach(function (_, k) { ks.add(k); });
    mb.forEach(function (_, k) { ks.add(k); });
    return Array.from(ks);
  }

  function tabela(alvo, rotChave, ext, DA, DB, la, lb) {
    var ma = agrupar(DA, ext), mb = agrupar(DB, ext), z = { n: 0, ha: 0 };
    var ks = uniao(ma, mb);
    if (!ks.length) return G.vazio(el(alvo));
    ks.sort(function (x, y) {
      var a = ma.get(x) || z, b = ma.get(y) || z, c = mb.get(x) || z, d = mb.get(y) || z;
      return (b.ha - a.ha) || (b.n - a.n) || ((d.ha + d.n) - (c.ha + c.n));
    });
    var totA = { n: 0, ha: 0 }, totB = { n: 0, ha: 0 };
    var linhas = ks.map(function (k) {
      var a = ma.get(k) || z, b = mb.get(k) || z;
      totA.n += a.n; totA.ha += a.ha; totB.n += b.n; totB.ha += b.ha;
      return '<tr><td class="forte">' + G.esc(k) + '</td>' +
        '<td class="num">' + (a.n ? G.num(a.n) : nada()) + '</td><td class="num">' + (b.n ? G.num(b.n) : nada()) + '</td>' + celDelta(a.n, b.n, 0) +
        '<td class="num">' + (a.ha ? G.num(a.ha, 1) : nada()) + '</td><td class="num">' + (b.ha ? G.num(b.ha, 1) : nada()) + '</td>' + celDelta(a.ha, b.ha, 1) + '</tr>';
    }).join('');
    el(alvo).innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr><th>' + G.esc(rotChave) + '</th>' +
      '<th>Atend. ' + G.esc(la) + '</th><th>Atend. ' + G.esc(lb) + '</th><th>Variação</th>' +
      '<th>Hectares ' + G.esc(la) + '</th><th>Hectares ' + G.esc(lb) + '</th><th>Variação ha</th></tr></thead><tbody>' + linhas +
      '<tr class="total"><td>Total</td><td class="num">' + G.num(totA.n) + '</td><td class="num">' + G.num(totB.n) + '</td>' + celDelta(totA.n, totB.n, 0) +
      '<td class="num">' + G.num(totA.ha, 1) + '</td><td class="num">' + G.num(totB.ha, 1) + '</td>' + celDelta(totA.ha, totB.ha, 1) + '</tr>' +
      '</tbody></table></div>';
  }

  function destaques(DA, DB, la, lb) {
    var ma = agrupar(DA, EXTR.mun), mb = agrupar(DB, EXTR.mun), z = { n: 0, ha: 0 };
    var l = uniao(ma, mb).map(function (k) {
      var a = ma.get(k) || z, b = mb.get(k) || z;
      return { k: k, a: a.ha, b: b.ha, d: a.ha - b.ha };
    });
    var linhaT = function (lista) {
      if (!lista.length) return '<p class="vazio">Nada a destacar neste recorte.</p>';
      return '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Município</th><th>' + G.esc(la) + '</th><th>' + G.esc(lb) + '</th><th>Variação ha</th></tr></thead><tbody>' +
        lista.map(function (x) {
          return '<tr><td class="forte">' + G.esc(x.k) + '</td><td class="num">' + G.num(x.a, 1) + '</td><td class="num">' + G.num(x.b, 1) + '</td>' + celDelta(x.a, x.b, 1) + '</tr>';
        }).join('') + '</tbody></table></div>';
    };
    el('cmpCresc').innerHTML = linhaT(l.filter(function (x) { return x.d > 0; }).sort(function (x, y) { return y.d - x.d; }).slice(0, 5));
    el('cmpQueda').innerHTML = linhaT(l.filter(function (x) { return x.d < 0; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 5));

    var sem = Array.from(mb.keys()).filter(function (k) { return !(ma.get(k) && ma.get(k).n); })
      .sort(function (x, y) { return mb.get(y).n - mb.get(x).n; });
    el('cmpSem').innerHTML = sem.length
      ? '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Município</th><th>Regional</th><th>Atend. ' + G.esc(lb) + '</th><th>Hectares ' + G.esc(lb) + '</th></tr></thead><tbody>' +
        sem.map(function (k) {
          return '<tr><td class="forte">' + G.esc(k) + '</td><td>' + G.esc(A.regionalDe(k) || '—') + '</td><td class="num">' + G.num(mb.get(k).n) +
            '</td><td class="num">' + G.num(mb.get(k).ha, 1) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="vazio">Todo município atendido em ' + G.esc(lb) + ' também teve atendimento em ' + G.esc(la) + '.</p>';
  }

  function serieHectares(DA, DB, la, lb) {
    var porMes = E.modo === 'ano';
    var n = porMes ? 12 : 31;
    var chave = function (r) { return porMes ? +A.dataRef(r).slice(5, 7) - 1 : +A.dataRef(r).slice(8, 10) - 1; };
    var vals = function (D) {
      var v = new Array(n).fill(0);
      D.forEach(function (r) {
        if (r.pc !== A.MEC) return;
        var i = chave(r);
        if (i >= 0 && i < n) v[i] += r.ha || 0;
      });
      return v.map(function (x) { return x || null; });
    };
    var rot = porMes ? MESES : Array.apply(null, Array(31)).map(function (_, i) { return String(i + 1); });
    el('cmpSubMes').textContent = porMes ? 'Cada mês de ' + la + ' ao lado do mesmo mês de ' + lb + '.' : 'Dia a dia de ' + la + ' e de ' + lb + '.';
    A.pintarSerie('gCmpMes', rot, [
      { nome: la, slot: 0, valores: vals(DA) },
      { nome: lb, slot: 1, valores: vals(DB) }
    ]);
  }

  function desenhar() {
    padroes();
    var la = rotulo(E.modo === 'ano' ? E.a : E.mesA), lb = rotulo(E.modo === 'ano' ? E.b : E.mesB);
    var DA = subconjunto(E.modo === 'ano' ? E.a : E.mesA), DB = subconjunto(E.modo === 'ano' ? E.b : E.mesB);
    controles(la, lb);
    var ra = resumo(DA), rb = resumo(DB);
    var k = function (rot, a, b, dec, un, cls) {
      var d = delta(a, b, dec);
      return { rot: rot, val: G.num(a, dec), un: un, cls: cls || '',
        sub: '<span class="' + d.cls + '">' + d.txt + '</span> · ' + G.esc(lb) + ': ' + G.num(b, dec) };
    };
    A.tiles('kpisCmp', [
      { _sec: la + ' × ' + lb },
      k('Atendimentos', ra.n, rb.n, 0),
      k('Hectares mecanizados', ra.ha, rb.ha, 1, 'ha', 'mec'),
      k('Horas de máquina', ra.hrs, rb.hrs, 1, 'h', 'acu'),
      k('Tanques / açudes', ra.ac, rb.ac, 0, '', 'acu'),
      k('Produtores atendidos', ra.prod, rb.prod, 0),
      k('Municípios atendidos', ra.mun, rb.mun, 0)
    ]);
    serieHectares(DA, DB, la, lb);
    tabela('tCmpMun', 'Município', EXTR.mun, DA, DB, la, lb);
    tabela('tCmpEsc', 'Escritório', EXTR.esc, DA, DB, la, lb);
    tabela('tCmpCult', 'Cultura', EXTR.cult, DA, DB, la, lb);
    tabela('tCmpPc', 'Serviço', EXTR.pc, DA, DB, la, lb);
    destaques(DA, DB, la, lb);
  }

  var raiz = el('cmpControles');
  if (raiz) raiz.addEventListener('change', function (e) {
    var id = e.target.id, v = e.target.value;
    if (id === 'cmpModo') E.modo = v;
    else if (id === 'cmpA') E.a = v;
    else if (id === 'cmpB') E.b = v;
    else if (id === 'cmpAno') { E.ano = v; E.mesA = ''; E.mesB = ''; }
    else if (id === 'cmpMesA') E.mesA = v;
    else if (id === 'cmpMesB') E.mesB = v;
    else return;
    desenhar();
  });
  if (raiz) raiz.addEventListener('click', function (e) {
    if (!e.target.closest('#cmpTroca')) return;
    var t;
    if (E.modo === 'ano') { t = E.a; E.a = E.b; E.b = t; } else { t = E.mesA; E.mesA = E.mesB; E.mesB = t; }
    desenhar();
  });

  A.registrarAba('comparativo', function () { desenhar(); });
})();
