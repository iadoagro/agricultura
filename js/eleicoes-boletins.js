/* Aba "Boletins" de eleicoes.html: boletim de urna (1º turno de 2026) das seções selecionadas da zona rural de Rio Branco, para Presidente,
   Governador, Senador (2 vagas), Deputado Federal e Deputado Estadual. Dados: js/dados-boletins-rural-2026.js (gerado por
   tools/gerar_boletins_rural_2026.py); municípios, regionais e locais vêm de js/dados-tche-2026.js. Filtros em cascata por
   nível (regional, município, zona, bairro, local de votação, seção) e exportação em PDF (jsPDF, baixado só no clique). */
(function () {
  'use strict';
  var raiz = document.getElementById('boletinsRaiz');
  var B = window.BOLETINS_RURAL_2026, T = window.TCHE_2026;
  if (!raiz) return;
  if (!B || !T) { raiz.innerHTML = '<p class="resultados-dica">Não foi possível carregar os dados dos boletins.</p>'; return; }

  var POR_PAGINA = 10;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('pt-BR'); }
  function pad(n, l) { return String(n).padStart(l, '0'); }
  function cap(t) { return String(t).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (D[aeo]s?|E) /g, function (x) { return x.toLowerCase(); }); }
  function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }

  /* ---------- registros: uma seção = um boletim ---------- */
  var BU = B.secoes.map(function (a) {
    var lc = B.locais[a[3]] || [], li = T.locais[a[0] + '|' + a[1] + '|' + a[3]] || [];
    var nome = lc[0] || li[0] || 'Local ' + a[3];
    return { mun: a[0], zona: a[1], secao: a[2], local: a[3], cargos: a[4], agreg: a[5] || [], aptos: a[6] || 0,
      munNome: cap(T.municipios[a[0]] || a[0]), reg: T.regional[a[0]] || 'Outras',
      localNome: cap(nome).replace(/^Instituto Federal do Acre \(ifac\)/i, 'IFAC').replace(/Ii/, 'II'), bairro: li[1] && li[1].trim() ? li[1].trim() : 'ZONA RURAL', end: cap(lc[1] || li[2] || '') };
  }).sort(function (x, y) { return x.munNome.localeCompare(y.munNome, 'pt-BR') || x.zona - y.zona || x.secao - y.secao; });

  var NIVEIS = [
    { k: 'reg', rot: 'Regional', todos: 'Todas', val: function (b) { return b.reg; }, lab: function (b) { return b.reg; } },
    { k: 'mun', rot: 'Município', todos: 'Todos', val: function (b) { return b.mun; }, lab: function (b) { return b.munNome; } },
    { k: 'zona', rot: 'Zona', todos: 'Todas', val: function (b) { return String(b.zona); }, lab: function (b) { return 'Zona ' + pad(b.zona, 4); } },
    { k: 'bairro', rot: 'Bairro', todos: 'Todos', val: function (b) { return b.bairro; }, lab: function (b) { return cap(b.bairro); } },
    { k: 'local', rot: 'Local de votação', todos: 'Todos', val: function (b) { return b.localNome; }, lab: function (b) { return b.localNome; } },
    { k: 'sec', rot: 'Seção', todos: 'Todas', val: function (b) { return b.mun + '|' + b.zona + '|' + b.secao; }, lab: function (b) { return b.munNome + ' · Zona ' + pad(b.zona, 4) + ' · Seção ' + pad(b.secao, 4); } }
  ];
  var st = { cargo: '', f: {}, pag: 0, vista: 'lista' };

  function passa(b, ate) {   // aplica os filtros dos níveis anteriores a "ate" (para as opções em cascata)
    for (var i = 0; i < NIVEIS.length; i++) {
      var n = NIVEIS[i]; if (ate != null && i >= ate) break;
      if (st.f[n.k] && n.val(b) !== st.f[n.k]) return false;
    }
    return true;
  }
  function filtrados() { return BU.filter(function (b) { return passa(b); }); }
  function cargosSel() { return B.cargos.map(function (c, i) { return i; }).filter(function (i) { return st.cargo === '' || String(i) === st.cargo; }); }

  /* ---------- filtros ---------- */
  function montaFiltros() {
    var h = '<label class="bol-cargo">Cargo<select data-bol="cargo"><option value="">Todos os cargos</option>' +
      B.cargos.map(function (c, i) { return '<option value="' + i + '"' + (st.cargo === String(i) ? ' selected' : '') + '>' + esc(c.nome) + (c.vagas > 1 && c.nome === 'Senador' ? ' (2 vagas)' : '') + '</option>'; }).join('') + '</select></label>';
    NIVEIS.forEach(function (n, i) {
      var vistos = new Map();
      BU.filter(function (b) { return passa(b, i); }).forEach(function (b) { vistos.set(n.val(b), n.lab(b)); });
      var ops = Array.from(vistos.entries()).sort(function (a, b) { return a[1].localeCompare(b[1], 'pt-BR', { numeric: true }); });
      h += '<label>' + n.rot + '<select data-bol="' + n.k + '"><option value="">' + n.todos + '</option>' +
        ops.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (st.f[n.k] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    });
    document.getElementById('bolFiltros').innerHTML = h;
  }

  /* ---------- lista ---------- */
  function totais(d) { var v = d[0].reduce(function (s, p) { return s + p[1]; }, 0); return { nom: v, b: d[1], n: d[2], tot: v + d[1] + d[2] }; }
  function tabelaCargo(b, i) {
    var d = b.cargos[i]; if (!d) return '';
    var c = B.cargos[i], t = totais(d);
    return '<details class="bol-cargo-det"' + (st.cargo !== '' ? ' open' : '') + '><summary><b>' + esc(c.nome) + '</b> <span>' + fmt(t.tot) + ' votos apurados</span></summary>' +
      '<div class="tabela-scroll"><table class="relatorio-tabela bol-tab"><thead><tr><th>Nº</th><th>Candidato</th><th class="n">Votos</th></tr></thead><tbody>' +
      d[0].map(function (p) { return '<tr><td>' + p[0] + '</td><td>' + esc(cap(c.cand[p[0]] || '')) + '</td><td class="n">' + fmt(p[1]) + '</td></tr>'; }).join('') +
      '<tr class="bol-sub"><td colspan="2">Votos nominais</td><td class="n">' + fmt(t.nom) + '</td></tr>' +
      '<tr class="bol-sub"><td colspan="2">Brancos</td><td class="n">' + fmt(t.b) + '</td></tr>' +
      '<tr class="bol-sub"><td colspan="2">Nulos</td><td class="n">' + fmt(t.n) + '</td></tr>' +
      '<tr class="bol-total"><td colspan="2">Total apurado</td><td class="n">' + fmt(t.tot) + '</td></tr></tbody></table></div></details>';
  }
  function extra(b) {
    var t = [];
    if (b.aptos) t.push(fmt(b.aptos) + ' eleitores aptos');
    if (b.agreg.length) t.push('inclui as seções agregadas ' + b.agreg.map(function (n) { return pad(n, 4); }).join(' e '));
    return t.length ? '<p>' + esc(t.join(' · ')) + '</p>' : '';
  }
  function desenha() {
    var lista = filtrados(), cs = cargosSel();
    var paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    if (st.pag >= paginas) st.pag = paginas - 1;
    var pg = lista.slice(st.pag * POR_PAGINA, (st.pag + 1) * POR_PAGINA);
    document.getElementById('bolStatus').textContent = fmt(lista.length) + ' boletim' + (lista.length === 1 ? '' : 's') + ' de urna (seções selecionadas da zona rural)' +
      (st.cargo === '' ? ' · todos os cargos' : ' · ' + B.cargos[+st.cargo].nome);
    document.getElementById('bolPdf').disabled = !lista.length;
    document.getElementById('bolLista').innerHTML = pg.length ? pg.map(function (b) {
      return '<article class="bol-card"><header><h3>Zona ' + pad(b.zona, 4) + ' · Seção ' + pad(b.secao, 4) + '</h3>' +
        '<p><b>' + esc(b.munNome) + '</b> · Regional ' + esc(b.reg) + '</p><p>' + esc(b.localNome) + (b.end ? ' — ' + esc(b.end) : '') + '</p>' + extra(b) + '</header>' +
        cs.map(function (i) { return tabelaCargo(b, i); }).join('') + '</article>';
    }).join('') : '<p class="resultados-dica">Nenhum boletim para os filtros escolhidos.</p>';
    document.getElementById('bolPaginas').hidden = paginas <= 1;
    document.getElementById('bolPagina').textContent = 'Página ' + (st.pag + 1) + ' de ' + paginas;
    document.getElementById('bolAnt').disabled = st.pag === 0;
    document.getElementById('bolProx').disabled = st.pag >= paginas - 1;
    if (st.vista === 'dash') desenhaDash();
  }

  /* ---------- PDF ---------- */
  var JSPDF = ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
  function carregaPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    var i = 0;
    return new Promise(function (ok, falha) {
      (function tenta() {
        if (i >= JSPDF.length) { falha(new Error('não foi possível carregar a biblioteca de PDF (verifique a internet)')); return; }
        var s = document.createElement('script'); s.src = JSPDF[i++];
        s.onload = function () { if (window.jspdf) ok(window.jspdf); else tenta(); };
        s.onerror = function () { s.remove(); tenta(); };
        document.head.appendChild(s);
      })();
    });
  }
  function pausa() { return new Promise(function (r) { setTimeout(r, 0); }); }

  async function exportarPdf() {
    var lista = filtrados(), cs = cargosSel(), msg = document.getElementById('bolMsg'), btn = document.getElementById('bolPdf');
    if (!lista.length) return;
    btn.disabled = true;
    try {
      msg.textContent = 'Carregando a biblioteca de PDF…';
      var lib = await carregaPdf(), doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, PH = 297, M = 12, GAP = 6, CW = (PW - 2 * M - GAP) / 2, RH = 3.7;
      var col, y, y0, primeira = true;
      function txt(t, x, yy, o) { doc.text(String(t), x, yy, o || {}); }
      function fonte(sz, neg, cor) { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(cor[0], cor[1], cor[2]); }
      function corte(t, larg) { t = String(t); if (doc.getTextWidth(t) <= larg) return t; while (t.length > 1 && doc.getTextWidth(t + '...') > larg) t = t.slice(0, -1); return t + '...'; }
      function cabecalhoCont(b) {
        fonte(7.5, true, [21, 62, 117]); txt('Boletim de urna - ' + b.munNome + ' - Zona ' + pad(b.zona, 4) + ' - Secao ' + pad(b.secao, 4) + ' (continuacao)', M, 12);
        doc.setDrawColor(207, 216, 227); doc.line(M, 14, PW - M, 14); y0 = 18;
      }
      function precisa(h, b) {
        if (y + h <= PH - 16) return;
        if (col === 0) { col = 1; y = y0; return; }
        doc.addPage(); col = 0; cabecalhoCont(b); y = y0;
      }
      var X = function () { return M + col * (CW + GAP); };
      for (var n = 0; n < lista.length; n++) {
        var b = lista[n];
        if (!primeira) doc.addPage();
        primeira = false;
        doc.setFillColor(21, 62, 117); doc.rect(0, 0, PW, 26, 'F');
        fonte(8, false, [191, 212, 242]); txt('BOLETIM DE URNA - 1o TURNO DE 2026 - ZONA RURAL', M, 8);
        fonte(15, true, [255, 255, 255]); txt('Zona ' + pad(b.zona, 4) + ' - Secao ' + pad(b.secao, 4), M, 16);
        fonte(9, false, [255, 255, 255]); txt(corte(b.munNome + ' - Regional ' + b.reg + ' - ' + b.localNome + (b.end ? ' - ' + b.end : ''), PW - 2 * M), M, 21);
        var ex = []; if (b.aptos) ex.push(fmt(b.aptos) + ' eleitores aptos'); if (b.agreg.length) ex.push('inclui as secoes agregadas ' + b.agreg.map(function (n) { return pad(n, 4); }).join(' e '));
        if (ex.length) { fonte(8, false, [191, 212, 242]); txt(ex.join(' - '), M, 24.5); }
        y0 = 32; col = 0; y = y0;
        for (var k = 0; k < cs.length; k++) {
          var d = b.cargos[cs[k]]; if (!d) continue;
          var c = B.cargos[cs[k]], t = totais(d);
          precisa(RH * 5 + 8, b);
          doc.setFillColor(232, 238, 249); doc.rect(X(), y - 3.4, CW, 5, 'F');
          fonte(8.5, true, [21, 62, 117]); txt(c.nome.toUpperCase() + (c.nome === 'Senador' ? ' - 2 VAGAS' : ''), X() + 1.5, y);
          fonte(7, false, [102, 112, 133]); txt(fmt(t.tot) + ' votos', X() + CW - 1.5, y, { align: 'right' });
          y += 4.6;
          d[0].forEach(function (p) {
            precisa(RH, b);
            fonte(7.2, false, [27, 35, 51]); txt(p[0], X() + 1, y);
            txt(corte(cap(c.cand[p[0]] || ''), CW - 24), X() + 12, y);
            fonte(7.2, true, [27, 35, 51]); txt(fmt(p[1]), X() + CW - 1, y, { align: 'right' });
            doc.setDrawColor(238, 240, 243); doc.line(X(), y + 1.1, X() + CW, y + 1.1);
            y += RH;
          });
          [['Votos nominais', t.nom, false], ['Brancos', t.b, false], ['Nulos', t.n, false], ['Total apurado', t.tot, true]].forEach(function (r) {
            precisa(RH, b);
            fonte(7.2, r[2], [21, 62, 117]); txt(r[0], X() + 12, y); txt(fmt(r[1]), X() + CW - 1, y, { align: 'right' });
            y += RH;
          });
          y += 3.5;
        }
        if (n % 8 === 7) { msg.textContent = 'Montando o PDF... ' + (n + 1) + ' de ' + lista.length + ' boletins'; await pausa(); }
      }
      var total = doc.getNumberOfPages(), quando = new Date().toLocaleString('pt-BR');
      for (var p = 1; p <= total; p++) {
        doc.setPage(p); doc.setDrawColor(207, 216, 227); doc.line(M, PH - 12, PW - M, PH - 12);
        fonte(6.5, false, [102, 112, 133]);
        txt('Fonte: TSE (Tribunal Superior Eleitoral) - votacao por secao, 1o turno de 2026. Gerado em ' + quando + '.', M, PH - 8);
        txt('Pagina ' + p + ' de ' + total, PW - M, PH - 8, { align: 'right' });
      }
      var nome = 'boletins-zona-rural-2026' + (st.cargo !== '' ? '-' + slug(B.cargos[+st.cargo].nome) : '') + (st.f.mun ? '-' + slug(T.municipios[st.f.mun] || st.f.mun) : '') + '.pdf';
      var a = document.createElement('a'); a.href = URL.createObjectURL(doc.output('blob')); a.download = nome;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      msg.textContent = 'PDF gerado: ' + lista.length + ' boletim(ns), ' + total + ' página(s).';
    } catch (e) { msg.textContent = 'Erro ao gerar o PDF: ' + e.message; }
    finally { btn.disabled = false; }
  }

  /* ---------- dashboard: números agregados do filtro atual ---------- */
  var CORES = ['#153e75', '#e08a00', '#0f9d8a', '#b42318', '#7c3aed'], COR_OUTROS = '#b7c0cf';
  function agrega(lista, i) {
    var m = new Map(), b = 0, n = 0, c = B.cargos[i];
    lista.forEach(function (x) {
      var d = x.cargos[i]; if (!d) return;
      d[0].forEach(function (p) { m.set(p[0], (m.get(p[0]) || 0) + p[1]); });
      b += d[1]; n += d[2];
    });
    var cands = Array.from(m.entries()).map(function (p) { return { num: p[0], nome: cap(c.cand[p[0]] || ''), v: p[1] }; }).sort(function (x, y) { return y.v - x.v; });
    var nom = cands.reduce(function (s, x) { return s + x.v; }, 0);
    return { cands: cands, b: b, n: n, nom: nom, tot: nom + b + n };
  }
  function escolas(lista) {
    var g = new Map();
    lista.forEach(function (x) {
      var e = g.get(x.localNome) || { nome: x.localNome, secs: [], aptos: 0 };
      e.secs.push(x); e.aptos += x.aptos; g.set(x.localNome, e);
    });
    return Array.from(g.values()).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  }
  function pct1(a, b) { return b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '–'; }
  function curto(n) { return String(n).replace(/^Escola (Estadual|Rural|Mun|Municipal|Est\.) ?/i, '').replace(/ \(.*$/, '').replace(/^Instituto Federal do Acre.*/i, 'IFAC'); }
  function dadosDash(lista) {
    var esc_ = escolas(lista), pres = agrega(lista, 0), aptos = lista.reduce(function (s, x) { return s + x.aptos; }, 0);
    return { lista: lista, escolas: esc_, aptos: aptos, pres: pres,
      comp: esc_.map(function (e) { var p = agrega(e.secs, 0), a = e.aptos; return { nome: e.nome, aptos: a, tot: p.tot, secs: e.secs.length }; }) };
  }
  function barraH(rot, v, max, cor, txt) {
    return '<div class="bd-linha"><span class="bd-rot" title="' + esc(rot) + '">' + esc(rot) + '</span><span class="bd-trilho"><i style="width:' + (max ? Math.max(1, v / max * 100).toFixed(1) : 0) + '%;background:' + cor + '"></i></span><span class="bd-val">' + txt + '</span></div>';
  }
  function desenhaDash() {
    var lista = filtrados(), el = document.getElementById('bolDash');
    if (!lista.length) { el.innerHTML = '<p class="resultados-dica">Nenhum boletim para os filtros escolhidos.</p>'; return; }
    var D = dadosDash(lista), cs = cargosSel(), pres = D.pres;
    var semPres = !pres.tot;
    var h = '<div class="bd-kpis">' +
      kpi('Seções (boletins)', fmt(lista.length), 'em ' + D.escolas.length + ' escola' + (D.escolas.length === 1 ? '' : 's')) +
      kpi('Eleitores aptos', fmt(D.aptos), 'nas seções selecionadas') +
      kpi('Comparecimento', semPres ? '–' : pct1(pres.tot, D.aptos), fmt(pres.tot) + ' votos apurados (Presidente)') +
      kpi('Brancos + nulos', semPres ? '–' : pct1(pres.b + pres.n, pres.tot), fmt(pres.b) + ' brancos · ' + fmt(pres.n) + ' nulos (Presidente)') + '</div>';
    var maxC = Math.max.apply(null, D.comp.map(function (e) { return e.tot; }).concat([1]));
    h += '<section class="bd-card"><h3>Comparecimento por escola <small>votos apurados para Presidente ÷ eleitores aptos</small></h3>' +
      D.comp.map(function (e) { return barraH(curto(e.nome), e.tot, Math.max.apply(null, D.comp.map(function (x) { return x.aptos; }).concat([1])), '#0f9d8a', pct1(e.tot, e.aptos) + ' <small>' + fmt(e.tot) + ' de ' + fmt(e.aptos) + '</small>'); }).join('') + '</section>';
    h += '<div class="bd-grade">' + cs.map(function (i) {
      var c = B.cargos[i], a = agrega(lista, i), top = a.cands.slice(0, 8), max = top.length ? top[0].v : 1;
      var top4 = a.cands.slice(0, 4).map(function (x) { return x.num; });
      var leg = top4.map(function (num, k) { var x = a.cands.find(function (y) { return y.num === num; }); return '<span><i style="background:' + CORES[k] + '"></i>' + esc(x.nome.split(' ').slice(0, 2).join(' ')) + '</span>'; }).join('') + '<span><i style="background:' + COR_OUTROS + '"></i>Outros</span>';
      var porEsc = D.escolas.map(function (e) {
        var ea = agrega(e.secs, i), segs = top4.map(function (num) { var x = ea.cands.find(function (y) { return y.num === num; }); return x ? x.v : 0; });
        var out = ea.nom - segs.reduce(function (s, v) { return s + v; }, 0), partes = segs.concat([out]);
        return '<div class="bd-linha"><span class="bd-rot" title="' + esc(e.nome) + '">' + esc(curto(e.nome)) + '</span><span class="bd-pilha">' + partes.map(function (v, k) {
          return v ? '<i style="width:' + (v / ea.nom * 100).toFixed(2) + '%;background:' + (k < 4 ? CORES[k] : COR_OUTROS) + '" title="' + (k < 4 ? esc(a.cands.find(function (y) { return y.num === top4[k]; }).nome) : 'Outros') + ': ' + fmt(v) + ' (' + pct1(v, ea.nom) + ')"></i>' : '';
        }).join('') + '</span></div>';
      }).join('');
      return '<section class="bd-card"><h3>' + esc(c.nome) + (c.nome === 'Senador' ? ' <small>2 vagas</small>' : '') + '</h3>' +
        '<h4>Mais votados <small>% dos votos nominais</small></h4>' +
        top.map(function (x, k) { return barraH(x.nome, x.v, max, k < 4 ? CORES[k] : COR_OUTROS, fmt(x.v) + ' <small>' + pct1(x.v, a.nom) + '</small>'); }).join('') +
        '<p class="bd-nota">' + fmt(a.b) + ' brancos (' + pct1(a.b, a.tot) + ') · ' + fmt(a.n) + ' nulos (' + pct1(a.n, a.tot) + ')</p>' +
        (D.escolas.length > 1 ? '<h4>Votos por escola <small>fatias dos 4 mais votados</small></h4><div class="bd-leg">' + leg + '</div>' + porEsc : '') + '</section>';
    }).join('') + '</div>';
    el.innerHTML = h;
  }
  function kpi(r, v, s) { return '<div class="bd-kpi"><span>' + r + '</span><b>' + v + '</b><small>' + s + '</small></div>'; }

  /* ---------- PDF visual do dashboard ---------- */
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  async function exportarPdfDash() {
    var lista = filtrados(), cs = cargosSel(), msg = document.getElementById('bolMsg'), btn = document.getElementById('bolPdfDash');
    if (!lista.length) return;
    btn.disabled = true;
    try {
      msg.textContent = 'Carregando a biblioteca de PDF…';
      var lib = await carregaPdf(), doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, PH = 297, M = 14, W = PW - 2 * M, D = dadosDash(lista);
      function txt(t, x, y, o) { doc.text(String(t), x, y, o || {}); }
      function fonte(sz, neg, cor) { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(cor[0], cor[1], cor[2]); }
      function fill(c) { var r = hex(c); doc.setFillColor(r[0], r[1], r[2]); }
      function corte(t, larg) { t = String(t); if (doc.getTextWidth(t) <= larg) return t; while (t.length > 1 && doc.getTextWidth(t + '...') > larg) t = t.slice(0, -1); return t + '...'; }
      function sem(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
      function faixa(tit, sub) {
        fill('#153e75'); doc.rect(0, 0, PW, 30, 'F');
        fonte(8, false, [191, 212, 242]); txt('ELEICOES 2026 - 1o TURNO - ZONA RURAL DE RIO BRANCO', M, 10);
        fonte(18, true, [255, 255, 255]); txt(sem(tit), M, 20);
        if (sub) { fonte(9, false, [191, 212, 242]); txt(sem(sub), M, 26); }
      }
      function tile(x, y, w, rot, val, sub, cor) {
        fill('#f1f4fa'); doc.roundedRect(x, y, w, 24, 2, 2, 'F'); fill(cor); doc.rect(x, y, 1.6, 24, 'F');
        fonte(7, false, [102, 112, 133]); txt(sem(rot).toUpperCase(), x + 5, y + 6);
        fonte(17, true, [27, 35, 51]); txt(val, x + 5, y + 15);
        fonte(6.8, false, [102, 112, 133]); txt(corte(sem(sub), w - 8), x + 5, y + 20.5);
      }
      function hbar(x, y, wTot, rot, v, max, cor, rotVal, wRot) {
        fonte(7.5, false, [27, 35, 51]); txt(corte(sem(rot), wRot - 2), x, y + 3.4);
        var wb = wTot - wRot - 30; fill('#e8ecf2'); doc.roundedRect(x + wRot, y, wb, 4.4, 1, 1, 'F');
        if (v > 0) { fill(cor); doc.roundedRect(x + wRot, y, Math.max(1.2, wb * v / max), 4.4, 1, 1, 'F'); }
        fonte(7.5, true, [27, 35, 51]); txt(rotVal, x + wTot, y + 3.4, { align: 'right' });
      }
      var pres = D.pres, semPres = !pres.tot;
      /* pagina 1: visao geral */
      faixa('Dashboard dos boletins de urna', fmt(lista.length) + ' secoes em ' + D.escolas.length + ' escola(s) - ' + (st.cargo === '' ? 'todos os cargos' : B.cargos[+st.cargo].nome));
      var tw = (W - 9) / 4, y = 38;
      tile(M, y, tw, 'Secoes', fmt(lista.length), D.escolas.length + ' escola(s)', '#153e75');
      tile(M + tw + 3, y, tw, 'Eleitores aptos', fmt(D.aptos), 'nas secoes', '#e08a00');
      tile(M + 2 * (tw + 3), y, tw, 'Comparecimento', semPres ? '-' : pct1(pres.tot, D.aptos), fmt(pres.tot) + ' votos apurados', '#0f9d8a');
      tile(M + 3 * (tw + 3), y, tw, 'Brancos + nulos', semPres ? '-' : pct1(pres.b + pres.n, pres.tot), 'Presidente', '#b42318');
      y = 72; fonte(11, true, [21, 62, 117]); txt('Comparecimento por escola', M, y); y += 7;
      var maxA = Math.max.apply(null, D.comp.map(function (e) { return e.aptos; }).concat([1]));
      D.comp.forEach(function (e) {
        hbar(M, y, W, curto(e.nome), e.tot, maxA, '#0f9d8a', pct1(e.tot, e.aptos), 52); y += 8;
      });
      fonte(7, false, [102, 112, 133]); txt('Barra = votos apurados (Presidente) em relacao ao maior numero de eleitores aptos entre as escolas.', M, y + 2);
      y += 14; fonte(11, true, [21, 62, 117]); txt('Votos apurados e aptos por escola', M, y); y += 6;
      var colW = [W - 78, 26, 26, 26];
      fill('#e8eef9'); doc.rect(M, y - 4, W, 6, 'F'); fonte(7.5, true, [21, 62, 117]);
      txt('Escola', M + 2, y); txt('Secoes', M + colW[0] + 26, y, { align: 'right' }); txt('Aptos', M + colW[0] + 52, y, { align: 'right' }); txt('Apurados', M + W - 2, y, { align: 'right' }); y += 6;
      D.comp.forEach(function (e, k) {
        if (k % 2) { fill('#f7f9fc'); doc.rect(M, y - 3.6, W, 5.4, 'F'); }
        fonte(7.5, false, [27, 35, 51]); txt(corte(sem(e.nome), colW[0] - 3), M + 2, y);
        txt(e.secs, M + colW[0] + 26, y, { align: 'right' }); txt(fmt(e.aptos), M + colW[0] + 52, y, { align: 'right' }); txt(fmt(e.tot), M + W - 2, y, { align: 'right' }); y += 5.4;
      });
      /* votos por secao, candidato a candidato — uma pagina (ou mais) por cargo, em mapa de calor */
      var secs = lista.slice().sort(function (x, y) { return x.localNome.localeCompare(y.localNome, 'pt-BR') || x.secao - y.secao; });
      function matrizSecoes(i, c, ag) {
        var MAXC = 18, ROW = 5, nomeW = 46, totW = 13;
        var nTop = i >= 3 ? 15 : 12, top = ag.cands.slice(0, nTop);
        var dados = secs.map(function (sc) { var d = sc.cargos[i]; var m = {}; d[0].forEach(function (p) { m[p[0]] = p[1]; }); var nom = d[0].reduce(function (t, p) { return t + p[1]; }, 0); return { sc: sc, m: m, b: d[1], n: d[2], nom: nom, tot: nom + d[1] + d[2] }; });
        for (var ini = 0; ini < dados.length; ini += MAXC) {
          var fat = dados.slice(ini, ini + MAXC), cw = (W - nomeW - totW) / MAXC, y;
          doc.addPage(); faixa('Votos por secao - ' + c.nome, 'Cada celula = votos do candidato na secao; cor mais forte = maior fatia dos votos nominais da secao' + (dados.length > MAXC ? ' (parte ' + (ini / MAXC + 1) + ' de ' + Math.ceil(dados.length / MAXC) + ')' : ''));
          y = 38;
          // faixa de escolas
          var x0 = M + nomeW, g = 0;
          while (g < fat.length) {
            var h2 = g; while (h2 < fat.length && fat[h2].sc.localNome === fat[g].sc.localNome) h2++;
            fill(g % 2 ? '#dbe5f5' : '#e8eef9'); doc.rect(x0 + g * cw, y, (h2 - g) * cw, 6, 'F');
            fonte(5.6, true, [21, 62, 117]); doc.text(doc.splitTextToSize(sem(curto(fat[g].sc.localNome)), (h2 - g) * cw - 1).slice(0, 2), x0 + g * cw + 0.7, y + 2.4);
            g = h2;
          }
          y += 6;
          fill('#153e75'); doc.rect(M, y, W, 6, 'F'); fonte(6.5, true, [255, 255, 255]);
          txt('Candidato', M + 1.5, y + 4);
          fat.forEach(function (d, j) { txt(pad(d.sc.secao, 3), x0 + j * cw + cw / 2, y + 4, { align: 'center' }); });
          txt('Total', M + W - 1.2, y + 4, { align: 'right' });
          y += 6;
          function linha(rot, vals, tot, negrito, fundo) {
            if (fundo) { fill(fundo); doc.rect(M, y, W, ROW, 'F'); }
            fonte(6.8, negrito, [27, 35, 51]); txt(corte(sem(rot), nomeW - 2), M + 1.5, y + 3.6);
            vals.forEach(function (v, j) { txt(fmt(v), x0 + j * cw + cw / 2, y + 3.6, { align: 'center' }); });
            fonte(6.8, true, [27, 35, 51]); txt(fmt(tot), M + W - 1.2, y + 3.6, { align: 'right' });
            y += ROW;
          }
          top.forEach(function (cd, r) {
            var vals = fat.map(function (d) { return d.m[cd.num] || 0; });
            fonte(6.8, false, [27, 35, 51]); fill(r % 2 ? '#fbfcfe' : '#ffffff'); doc.rect(M, y, W, ROW, 'F');
            txt(corte(sem(cd.nome) + ' (' + cd.num + ')', nomeW - 2), M + 1.5, y + 3.6);
            vals.forEach(function (v, j) {
              var sh = fat[j].nom ? v / fat[j].nom : 0, al = Math.min(1, sh / 0.7);
              if (v) { var rr = Math.round(255 - (255 - 21) * al), gg = Math.round(255 - (255 - 62) * al), bb = Math.round(255 - (255 - 117) * al); doc.setFillColor(rr, gg, bb); doc.rect(x0 + j * cw + 0.2, y + 0.2, cw - 0.4, ROW - 0.4, 'F'); }
              fonte(6.8, al > 0.5, al > 0.5 ? [255, 255, 255] : [27, 35, 51]); txt(fmt(v), x0 + j * cw + cw / 2, y + 3.6, { align: 'center' });
            });
            fonte(6.8, true, [27, 35, 51]); txt(fmt(vals.reduce(function (t, v) { return t + v; }, 0)), M + W - 1.2, y + 3.6, { align: 'right' });
            y += ROW;
          });
          var outros = fat.map(function (d) { return d.nom - top.reduce(function (t, cd) { return t + (d.m[cd.num] || 0); }, 0); });
          if (ag.cands.length > nTop) linha('Demais candidatos (' + (ag.cands.length - nTop) + ')', outros, outros.reduce(function (t, v) { return t + v; }, 0), false, '#f1f4fa');
          linha('Brancos', fat.map(function (d) { return d.b; }), fat.reduce(function (t, d) { return t + d.b; }, 0), false, '#fff4e5');
          linha('Nulos', fat.map(function (d) { return d.n; }), fat.reduce(function (t, d) { return t + d.n; }, 0), false, '#fde8e6');
          linha('Total apurado', fat.map(function (d) { return d.tot; }), fat.reduce(function (t, d) { return t + d.tot; }, 0), true, '#e8eef9');
        }
      }
      /* uma pagina por cargo */
      for (var k = 0; k < cs.length; k++) {
        var i = cs[k], c = B.cargos[i], a = agrega(lista, i);
        doc.addPage(); faixa(c.nome + (c.nome === 'Senador' ? ' (2 vagas)' : ''), 'Resultado nas secoes selecionadas - ' + fmt(a.tot) + ' votos apurados');
        y = 40; fonte(11, true, [21, 62, 117]); txt('Mais votados', M, y); y += 6;
        var top = a.cands.slice(0, 8), max = top.length ? top[0].v : 1;
        top.forEach(function (x, j) { hbar(M, y, W, x.nome, x.v, max, j < 4 ? CORES[j] : COR_OUTROS, fmt(x.v) + '  (' + pct1(x.v, a.nom) + ')', 62); y += 8; });
        y += 2; var bn = a.b + a.n, wb = W;
        fonte(8, false, [102, 112, 133]); txt('Brancos: ' + fmt(a.b) + ' (' + pct1(a.b, a.tot) + ')   -   Nulos: ' + fmt(a.n) + ' (' + pct1(a.n, a.tot) + ')', M, y);
        y += 12;
        if (D.escolas.length > 1) {
          fonte(11, true, [21, 62, 117]); txt('Votos por escola', M, y); y += 5;
          var top4 = a.cands.slice(0, 4).map(function (x) { return x.num; }), lx = M;
          top4.concat([-1]).forEach(function (num, j) {
            var nome = num === -1 ? 'Outros' : sem(a.cands.find(function (x) { return x.num === num; }).nome.split(' ').slice(0, 2).join(' '));
            fill(j < 4 ? CORES[j] : COR_OUTROS); doc.rect(lx, y - 2.6, 3, 3, 'F'); fonte(7.5, false, [27, 35, 51]); txt(nome, lx + 4.5, y); lx += doc.getTextWidth(nome) + 12;
          });
          y += 6;
          D.escolas.forEach(function (e) {
            var ea = agrega(e.secs, i), xx = M + 52, ww = W - 52;
            fonte(7.5, false, [27, 35, 51]); txt(corte(sem(curto(e.nome)), 50), M, y + 3.4);
            var segs = top4.map(function (num) { var x = ea.cands.find(function (z) { return z.num === num; }); return x ? x.v : 0; });
            segs.push(ea.nom - segs.reduce(function (s, v) { return s + v; }, 0));
            segs.forEach(function (v, j) {
              if (!v) return; var w = ww * v / ea.nom; fill(j < 4 ? CORES[j] : COR_OUTROS); doc.rect(xx, y, w, 5, 'F');
              if (w > 9) { fonte(6.5, true, [255, 255, 255]); txt(pct1(v, ea.nom), xx + w / 2, y + 3.5, { align: 'center' }); }
              xx += w;
            });
            y += 8.5;
          });
        }
        matrizSecoes(i, c, a);
      }
      var total = doc.getNumberOfPages(), quando = new Date().toLocaleString('pt-BR');
      for (var p = 1; p <= total; p++) {
        doc.setPage(p); doc.setDrawColor(207, 216, 227); doc.line(M, PH - 12, PW - M, PH - 12);
        fonte(6.5, false, [102, 112, 133]);
        txt('Fonte: TSE - votacao por secao, 1o turno de 2026; eleitores aptos: lista oficial de locais de votacao. Gerado em ' + quando + '.', M, PH - 8);
        txt('Pagina ' + p + ' de ' + total, PW - M, PH - 8, { align: 'right' });
      }
      var a2 = document.createElement('a'); a2.href = URL.createObjectURL(doc.output('blob')); a2.download = 'dashboard-boletins-zona-rural-2026.pdf';
      document.body.appendChild(a2); a2.click(); setTimeout(function () { URL.revokeObjectURL(a2.href); a2.remove(); }, 4000);
      msg.textContent = 'PDF do dashboard gerado: ' + total + ' página(s).';
    } catch (e) { msg.textContent = 'Erro ao gerar o PDF: ' + e.message; }
    finally { btn.disabled = false; }
  }

  /* ---------- montagem ---------- */
  raiz.innerHTML = '<div class="mapa-topo"><div><h2>Boletins de urna — zona rural</h2><p>Votos por candidato, brancos e nulos de cada uma das seções selecionadas da zona rural de Rio Branco no 1º turno de 2026: Presidente, Governador, Senador (2 vagas), Deputado Federal e Deputado Estadual. Filtre por nível e exporte em PDF.</p></div></div>' +
    '<div class="bol-vistas" role="tablist"><button type="button" role="tab" class="ativa" data-vista="lista" aria-selected="true">Boletins</button><button type="button" role="tab" data-vista="dash" aria-selected="false">Dashboard</button></div>' +
    '<div id="bolFiltros" class="bol-filtros"></div>' +
    '<div class="relatorio-acoes"><button id="bolPdf" type="button">Exportar PDF dos boletins</button><button id="bolPdfDash" type="button" hidden>Exportar PDF do dashboard</button><button id="bolLimpar" type="button" class="relatorio-limpar">Limpar filtros</button></div>' +
    '<p id="bolStatus" class="relatorio-status" role="status"></p><p id="bolMsg" class="relatorio-status" role="status"></p>' +
    '<div id="bolDash" class="bol-dash" hidden></div>' +
    '<div id="bolLista" class="bol-lista"></div>' +
    '<div class="busca-global-paginas" id="bolPaginas" hidden><button type="button" id="bolAnt" aria-label="Página anterior">←</button><span id="bolPagina" aria-live="polite"></span><button type="button" id="bolProx" aria-label="Próxima página">→</button></div>' +
    '<p class="fonte-eleitoral">Fonte: TSE, votação por seção do 1º turno de 2026. A fonte dos votos não traz comparecimento nem o partido dos candidatos; o total apurado é a soma de votos nominais, brancos e nulos da seção. Eleitores aptos e seções agregadas vêm da lista oficial de locais de votação.</p>';

  raiz.addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-bol'); if (!k) return;
    if (k === 'cargo') st.cargo = e.target.value;
    else {
      st.f[k] = e.target.value;
      var i = NIVEIS.findIndex(function (n) { return n.k === k; });
      for (var j = i + 1; j < NIVEIS.length; j++) st.f[NIVEIS[j].k] = '';   // níveis abaixo recomeçam
    }
    st.pag = 0; montaFiltros(); desenha();
  });
  function vista(v) {
    st.vista = v;
    raiz.querySelectorAll('[data-vista]').forEach(function (b) { var on = b.dataset.vista === v; b.classList.toggle('ativa', on); b.setAttribute('aria-selected', String(on)); });
    var dash = v === 'dash';
    document.getElementById('bolDash').hidden = !dash;
    document.getElementById('bolLista').hidden = dash;
    document.getElementById('bolPdf').hidden = dash;
    document.getElementById('bolPdfDash').hidden = !dash;
    if (dash) { document.getElementById('bolPaginas').hidden = true; desenhaDash(); } else desenha();
  }
  raiz.querySelectorAll('[data-vista]').forEach(function (b) { b.addEventListener('click', function () { vista(b.dataset.vista); }); });
  document.getElementById('bolPdfDash').addEventListener('click', exportarPdfDash);
  document.getElementById('bolPdf').addEventListener('click', exportarPdf);
  document.getElementById('bolLimpar').addEventListener('click', function () { st = { cargo: '', f: {}, pag: 0, vista: st.vista }; montaFiltros(); desenha(); });
  document.getElementById('bolAnt').addEventListener('click', function () { st.pag--; desenha(); raiz.scrollIntoView({ block: 'start' }); });
  document.getElementById('bolProx').addEventListener('click', function () { st.pag++; desenha(); raiz.scrollIntoView({ block: 'start' }); });
  montaFiltros(); desenha();
})();
