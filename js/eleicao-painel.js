/* Resultados dos candidatos Tchê (Deputado Estadual José Luis Schafer, PDT 12123: painéis 2022, 2026 e comparativo 2022 × 2026)
   e Felipe Tchê (Vereador de Rio Branco, PP 11123: painel 2024). Mesmo nível de informação do dashboard de boletins de urna:
   resumo, mapa com detalhamento (município → zona → bairro → local → seção), tabelas por regional, município, zona, bairro,
   local de votação e seção. Dados: js/dados-tche-2026.js e js/dados-felipe-2024.js. A fábrica abaixo monta um painel por candidato. */
(function () {
  'use strict';
  function fabrica(D, modosIds) {
  var MUN = D.municipios, MAPA = D.mapa || (window.TCHE_2026 && window.TCHE_2026.mapa), COORDS = D.coords, LOCAIS = D.locais, E = D.estado, E22 = D.estado22, C = D.cand, RK = D.rk || {};
  var SEC = D.secoes.map(function (a) { return { mun: a[0], zona: a[1], secao: a[2], local: a[3], apt: a[4], comp: a[5], q26: a[6], t: a[7], b: a[8], n: a[9], q22: a[10], lid: a[11] }; });
  var PAGE = 15, SEM_BAIRRO = '(sem bairro informado)';
  var RAMP = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026', '#6a0014'];
  var GANHO = ['#c6dbef', '#6baed6', '#08519c'], PERDA = ['#fdd0a2', '#fd8d3c', '#a63603'];
  var LV = { reg: 'Regional', mun: 'Município', zona: 'Zona', bairro: 'Bairro', local: 'Local de votação', sec: 'Seção' };
  // candidato de um município só (vereador): o "estado" dos textos passa a ser o município
  var MUNC = C.municipio || '', ANO = C.ano || 2026;
  var NOESTADO = MUNC ? 'em ' + MUNC : 'no estado', TODOESTADO = MUNC ? 'Todo o município' : 'Todo o estado', ACRE = MUNC || 'Acre';
  var SEM_APTOS = !SEC.some(function (s) { return s.apt > 0; });
  var ABAS = [['resumo', 'Resumo'], ['mapa', 'Mapa'], ['reg', 'Regional'], ['mun', 'Município'], ['zona', 'Zona'], ['bairro', 'Bairro'], ['local', 'Local de votação'], ['sec', 'Seção'], ['exportar', 'Exportar']]
    .filter(function (a) { return !(MUNC && (a[0] === 'reg' || a[0] === 'mun')); });
  var MUN0 = MUNC ? Object.keys(MUN)[0] : '', REG0 = MUNC ? (D.regional[MUN0] || '') : '';   // vereador: o recorte já nasce dentro do município

  function vg(n) { return n === 1 ? '1 vaga' : n + ' vagas'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('pt-BR'); }
  function sgn(n) { return (n > 0 ? '+' : '') + fmt(n); }
  function pct(a, b) { return b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '–'; }
  function pad(n, l) { return String(n).padStart(l, '0'); }
  function cap(t) { return String(t).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (D[aeo]s?|E) /g, function (x) { return x.toLowerCase(); }); }
  function regionOf(cod) { return D.regional[cod] || 'Outras'; }
  function localInfo(s) { return LOCAIS[s.mun + '|' + s.zona + '|' + s.local]; }
  function bairroRaw(s) { var li = localInfo(s); return li && li[1] && li[1].trim() ? li[1].trim() : SEM_BAIRRO; }
  function bairroTxt(raw) { return raw === SEM_BAIRRO ? raw : cap(raw); }
  function munRings(cod) {
    var P = MAPA.proj;
    return MAPA.mun[cod].d.split('M').filter(Boolean).map(function (r) {
      return r.replace('Z', '').split('L').map(function (pt) { var xy = pt.split(' ').map(Number); return [(P.maxy - xy[1]) / P.K, (xy[0] + P.minx) / (P.kx * P.K)]; });
    });
  }

  /* ---------- escalas de cor ---------- */
  function breaks(vals, n) {
    var v = vals.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    if (!v.length) return [];
    var k = Math.min(n, new Set(v).size), br = [];
    for (var i = 1; i < k; i++) br.push(v[Math.floor(i * v.length / k)]);
    return Array.from(new Set(br)).filter(function (x) { return x > v[0]; });
  }
  function classe(x, br) { var c = 0; while (c < br.length && x >= br[c]) c++; return c; }
  function mkEscala(vals, tipo) {
    if (tipo === 'div') {
      var pos = vals.filter(function (x) { return x > 0; }), neg = vals.filter(function (x) { return x < 0; }).map(function (x) { return -x; });
      var bp = breaks(pos, 3), bn = breaks(neg, 3);
      var idx = function (c, br) { return br.length ? Math.round(c * 2 / br.length) : 1; };
      var cor = function (x) { return x === 0 ? '#d9d9d9' : x > 0 ? GANHO[idx(classe(x, bp), bp)] : PERDA[idx(classe(-x, bn), bn)]; };
      var rows = function () {
        var out = [], mk = function (arr, br, cores, sinal, lbl) {
          var cnt = new Array(br.length + 1).fill(0); arr.forEach(function (x) { cnt[classe(x, br)]++; });
          var mn = arr.length ? Math.min.apply(null, arr) : 0, mx = arr.length ? Math.max.apply(null, arr) : 0;
          for (var c = 0; c <= br.length && arr.length; c++) {
            var a = c === 0 ? mn : br[c - 1], b = c === br.length ? mx : br[c] - 1;
            out.push({ cor: cores[idx(c, br)], txt: lbl + ' ' + sinal + fmt(a) + ' a ' + sinal + fmt(b), n: cnt[c] });
          }
        };
        mk(neg.slice().reverse(), bn, PERDA, '−', 'perdeu'); mk(pos, bp, GANHO, '+', 'ganhou');
        var z = vals.filter(function (x) { return x === 0; }).length; if (z) out.push({ cor: '#d9d9d9', txt: 'sem variação', n: z });
        return out;
      };
      return { cor: cor, rows: rows, titulo: 'diferença de votos (2026 − 2022)' };
    }
    var br = breaks(vals, RAMP.length);
    return {
      cor: function (x) { return x <= 0 ? '#8b929c' : RAMP[br.length ? Math.round(classe(x, br) * (RAMP.length - 1) / br.length) : 3]; },
      rows: function () {
        var pos = vals.filter(function (x) { return x > 0; }); if (!pos.length) return [];
        var cnt = new Array(br.length + 1).fill(0); pos.forEach(function (x) { cnt[classe(x, br)]++; });
        var mn = Math.min.apply(null, pos), mx = Math.max.apply(null, pos), out = [];
        for (var c = 0; c <= br.length; c++) { var a = c === 0 ? mn : br[c - 1], b = c === br.length ? mx : br[c] - 1; out.push({ cor: RAMP[br.length ? Math.round(c * (RAMP.length - 1) / br.length) : 3], txt: fmt(a) + ' – ' + fmt(b), n: cnt[c] }); }
        return out;
      },
      titulo: 'votos'
    };
  }

  /* ---------- agregação por nível (compartilhada) ---------- */
  function unitRows(lv, F) {
    F = typeof F === 'string' ? { mun: F } : (F || {});
    var U = {}, JC = {};
    SEC.forEach(function (s) {
      if (F.reg && regionOf(s.mun) !== F.reg) return;
      if (F.mun && s.mun !== F.mun) return;
      if (F.zona !== '' && F.zona != null && String(s.zona) !== String(F.zona)) return;
      if (F.local && String(s.local) !== String(F.local)) return;
      if (F.secao != null && F.secao !== '' && String(s.secao) !== String(F.secao)) return;
      var li = localInfo(s), mn = cap(MUN[s.mun] || s.mun), br = bairroRaw(s);
      if (F.bairro && br !== F.bairro) return;
      var k, lab, ctx = '', f = null;
      if (lv === 'reg') { k = regionOf(s.mun); lab = 'Regional ' + k; f = { reg: k }; }
      else if (lv === 'mun') { k = s.mun; lab = esc(mn); ctx = 'Regional ' + esc(regionOf(s.mun)); f = { mun: s.mun }; }
      else if (lv === 'zona') { k = s.mun + '|' + s.zona; lab = 'Zona ' + pad(s.zona, 4); ctx = MUNC ? '' : esc(mn); f = { mun: s.mun, zona: s.zona }; }
      else if (lv === 'bairro') { k = s.mun + '|' + br; lab = esc(bairroTxt(br)); ctx = MUNC ? '' : esc(mn); f = { mun: s.mun, bairro: br }; }
      else if (lv === 'local') { k = s.mun + '|' + s.zona + '|' + s.local; lab = li ? esc(li[0]) : 'Local ' + s.local; ctx = (MUNC ? '' : esc(mn) + ' · ') + 'zona ' + pad(s.zona, 4) + (li && li[1] ? ' · ' + esc(cap(li[1])) : '') + (li && li[2] ? ' · ' + esc(li[2]) : ''); f = { mun: s.mun, zona: s.zona, local: s.local }; }
      else { k = s.mun + '|' + s.zona + '|' + s.secao; f = { mun: s.mun, zona: s.zona, secao: s.secao }; lab = 'Seção ' + pad(s.secao, 4); ctx = (MUNC ? '' : esc(mn) + ' · ') + 'zona ' + pad(s.zona, 4) + (li ? ' · ' + esc(li[0]) + (li[1] ? ' (' + esc(cap(li[1])) + ')' : '') : ''); }
      var o = U[k] = U[k] || { k: k, f: f, lab: lab, ctx: ctx, n: 0, c26: 0, c22: 0, q26: 0, q22: 0, t: 0, b: 0, nn: 0, apt: 0, comp: 0, la: 0, lo: 0, w: 0, muns: new Set() };
      o.muns.add(s.mun);
      var cc = COORDS[s.mun + '|' + s.zona + '|' + s.local];
      if (cc) {
        var la = cc[0], lo = cc[1];
        if (lv === 'sec') { var kk = s.mun + '|' + s.zona + '|' + s.local, i = (JC[kk] = (JC[kk] || 0) + 1) - 1; if (i) { var r = 0.00012 * Math.sqrt(i), an = i * 2.4; la += r * Math.sin(an); lo += r * Math.cos(an); } }
        o.la += la; o.lo += lo; o.w++;
      }
      o.n++; o.apt += s.apt; o.comp += s.comp; o.q26 += s.q26; o.q22 += s.q22; o.t += s.t; o.b += s.b; o.nn += s.n;
      if (s.q26 > 0) o.c26++; if (s.q22 > 0) o.c22++;
    });
    return Object.keys(U).map(function (k) {
      var o = U[k]; o.lat = o.w ? o.la / o.w : null; o.lon = o.w ? o.lo / o.w : null; o.dif = o.q26 - o.q22;
      var r = RK[lv] && RK[lv][k]; o.pos = r ? r[0] : 0; o.nc = r ? r[1] : 0;
      return o;
    });
  }
  var SECS_ALL = null;
  function secInfo(F) {
    return SEC.filter(function (s) { return (!F.reg || regionOf(s.mun) === F.reg) && (!F.mun || s.mun === F.mun) && (F.zona === '' || F.zona == null || String(s.zona) === String(F.zona)) && (!F.local || String(s.local) === String(F.local)) && (F.secao == null || F.secao === '' || String(s.secao) === String(F.secao)) && (!F.bairro || bairroRaw(s) === F.bairro); });
  }

  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  var _IDX = null;
  function indiceBusca() {
    if (_IDX) return _IDX;
    var I = [], vistos = {};
    var add = function (p, t, lab, ctx, f) { I.push({ p: p, t: t, lab: lab, ctx: ctx, f: f, n: semAcento(lab + ' ' + ctx) }); };
    if (!MUNC) {
      Object.keys(D.regionais).forEach(function (r) { add(0, 'Regional', 'Regional ' + r, '', { reg: r }); });
      Object.keys(MUN).forEach(function (m) { add(1, 'Município', cap(MUN[m]), 'Regional ' + regionOf(m), { mun: m }); });
    }
    SEC.forEach(function (s) {
      var mn = cap(MUN[s.mun]), li = localInfo(s), br = bairroRaw(s);
      var kb = s.mun + '|' + br; if (!vistos[kb]) { vistos[kb] = 1; add(2, 'Bairro', bairroTxt(br), mn, { mun: s.mun, bairro: br }); }
      var kl = s.mun + '|' + s.zona + '|' + s.local; if (!vistos[kl]) { vistos[kl] = 1; add(3, 'Local', li ? li[0] : 'Local ' + s.local, mn + ' · zona ' + pad(s.zona, 4) + (li && li[2] ? ' · ' + li[2] : ''), { mun: s.mun, zona: s.zona, local: s.local }); }
      add(4, 'Seção', 'Seção ' + pad(s.secao, 4), mn + ' · zona ' + pad(s.zona, 4) + (li ? ' · ' + li[0] : ''), { mun: s.mun, zona: s.zona, secao: s.secao });
    });
    return _IDX = I;
  }

  /* =========================================================================================== */
  function criaPainel(root, modo) {
    var cmp = modo === 'cmp', a22 = modo === '2022', a26 = modo === '2026';
    var campo = a22 ? 'q22' : 'q26', comT = a26;           // 2026 tem total apurado, brancos, nulos, comparecimento, ranking
    var st = { aba: 'resumo', dr: { reg: REG0, mun: MUN0, zona: '', bairro: '', local: '', secao: '' }, lv: 'auto', base: 'hib', mun: '', zero: false, pag: 0, psec: 0, zsec: false, ord: 'dif', met: 'dif', filtAberto: true };
    var mapa = null, iniciado = false, semTam = false;
    var Q = function (u) { return u[campo]; };
    var Cn = function (u) { return a22 ? u.c22 : u.c26; };
    var nome = C.nome;
    // Todo percentual é sobre o total de votos do candidato no estado (nunca contra outros candidatos); no comparativo, cada ano usa o seu total.
    var T22 = E22.q, T26 = E.q, TB = a22 ? T22 : T26;
    function pc(v, t) { if (!t) return '–'; var x = v / t * 100; return x.toFixed(x > 0 && x < 0.1 ? 2 : 1).replace('.', ',') + '%'; }
    function pspan(s) { return ' <span class="t26-p">' + s + '</span>'; }
    function vp(v, t) { return fmt(v) + pspan(pc(v, t == null ? TB : t)); }                 // votos + % do estado
    function vt(v, t) { return fmt(v) + ' (' + pc(v, t == null ? TB : t) + ')'; }          // o mesmo, em texto puro
    function cp(n, t) { return fmt(n) + pspan(pc(n, t)); }                                       // contagem + % do total de unidades
    function cn(n, t) { return fmt(n) + ' de ' + fmt(t) + pspan(pc(n, t)); }                          // "x de y" + %
    function vv(a, b) { return b ? ((a - b) / b * 100).toFixed(1).replace('.', ',').replace(/^(\d)/, '+$1') + '%' : (a ? 'novo' : '–'); }   // variação sobre 2022
    function dv(a, b) { return sgn(a - b) + pspan(vv(a, b)); }                              // diferença + variação sobre 2022
    var $ = function (sel) { return root.querySelector(sel); };

    function kpi(l, v, s) { return '<div class="t26-kpi"><span class="t26-kl">' + l + '</span><b>' + v + '</b><small>' + s + '</small></div>'; }
    function barras(itens, max) {
      return itens.map(function (i) { return '<div class="t26-bar"><span class="t26-bn" title="' + esc(i.t || '') + '">' + i.l + '</span><span class="t26-bt"><i style="width:' + (max ? Math.min(100, i.q / max * 100).toFixed(1) : 0) + '%' + (i.neg ? ';background:#d94801' : '') + '"></i></span><span class="t26-bv">' + (i.txt || vp(i.q)) + '</span></div>'; }).join('');
    }
    var secComVoto = function (campoQ) { return SEC.filter(function (s) { return s[campoQ] > 0; }).length; };

    /* ----- cabeçalho e contadores ----- */
    function montar() {
      var kp;
      var tit = cmp ? 'Comparativo 2022 × 2026' : (a22 ? 'Eleição 2022' : 'Eleição ' + ANO + ' · 1º turno');
      if (a26) kp =
        kpi('Votos ' + NOESTADO, vp(E.q), C.eleito ? 'eleito' : 'total dele nas urnas') +
        (MUNC ? kpi('Bairros com voto', cp(unitRows('bairro', {}).filter(function (u) { return u.q26 > 0; }).length, unitRows('bairro', {}).length), 'de ' + unitRows('bairro', {}).length)
          : kpi('Municípios com voto', cp(unitRows('mun', {}).filter(function (u) { return u.q26 > 0; }).length, Object.keys(MUN).length), 'de ' + Object.keys(MUN).length)) +
        kpi('Posição ' + NOESTADO, E.pos + 'º', 'de ' + E.nCand + ' candidatos · ' + vg(C.vagas) + '' + (C.eleito ? ' · eleito' : '')) +
        (C.majoritario ? kpi('% dos votos válidos', pc(E.q, E.validos), 'de ' + fmt(E.validos) + ' votos válidos') : kpi('Votos do partido (' + C.partido + ')', fmt(E.partidoNominais + E.partidoLegenda), 'nominais + legenda')) +
        kpi('Seções com voto', cp(secComVoto('q26'), SEC.length), 'de ' + fmt(SEC.length) + ' seções') +
        kpi('Seções em que foi o mais votado', cp(SEC.filter(function (s) { return s.lid === 1; }).length, SEC.length), 'de ' + fmt(SEC.length) + ' seções');
      else if (a22) kp =
        kpi('Votos ' + NOESTADO, vp(E22.q), 'Deputado Estadual 2022 · nº ' + C.numero) +
        kpi('Seções com voto', cp(secComVoto('q22'), SEC.length), 'de ' + fmt(SEC.length) + ' seções (desenho 2026)') +
        kpi('Municípios com voto', cp(unitRows('mun', {}).filter(function (u) { return u.q22 > 0; }).length, Object.keys(MUN).length), 'de ' + Object.keys(MUN).length) +
        kpi('Locais de votação com voto', cp(unitRows('local', {}).filter(function (u) { return u.q22 > 0; }).length, unitRows('local', {}).length), 'de ' + unitRows('local', {}).length + ' (em 2026 há ' + unitRows('local', {}).filter(function (u) { return u.q26 > 0; }).length + ')') +
        kpi('Votos sem seção em 2026', vp(E22.q - E22.qMapeado), E22.semCorresp.length + ' seção(ões) que deixaram de existir') +
        kpi('Posição / % válidos', '—', 'a votação 2022 do arquivo traz só os votos do candidato');
      else {
        var d = E.q - E22.q;
        var sv22 = secComVoto('q22'), sv26 = secComVoto('q26');
        kp = kpi('Votos 2022', vp(E22.q, T22), 'Deputado Estadual') + kpi('Votos 2026', vp(E.q, T26), vv(E.q, E22.q) + ' sobre 2022') +
          kpi('Diferença', dv(E.q, E22.q), 'sobre 2022') +
          kpi('Seções com voto', cp(sv22, SEC.length) + ' → ' + cp(sv26, SEC.length), '2022 → 2026 (de ' + fmt(SEC.length) + ') · ' + vv(sv26, sv22) + ' sobre 2022') +
          kpi('Seções ganhas / perdidas', cp(SEC.filter(function (s) { return s.q22 === 0 && s.q26 > 0; }).length, SEC.length) + ' / ' + cp(SEC.filter(function (s) { return s.q22 > 0 && s.q26 === 0; }).length, SEC.length), 'passou a ter voto / deixou de ter') +
          kpi('Posição 2026', E.pos + 'º', 'de ' + E.nCand + ' candidatos · ' + vg(C.vagas) + '');
      }
      root.innerHTML =
        '<div class="t26-cab"><div><span class="t26-sub">' + C.cargo + ' · ' + tit + '</span><h2>' + esc(C.nome) + ' <small>' + (cmp ? 'José Luis Schafer · ' : '') + 'nº ' + C.numero + ' · ' + C.partido + '</small>' + (C.eleito ? ' <span class="t26-tag ok">Eleito</span>' : (C.tag ? ' <span class="t26-tag ok">' + esc(C.tag) + '</span>' : '')) + '</h2></div>' +
        (a22 ? '<button type="button" class="t26-antigo" data-antigo>Mostrar visão anterior (mapa de 2022)</button>' : '') + '</div>' +
        '<section class="t26-kpis">' + kp + '</section>' +
        (cmp ? '<p class="t26-sub t26-nota">As seções de 2022 foram associadas às de 2026 pelo município, zona e número da seção (inclusive seções agregadas). ' + (E22.q - E22.qMapeado) + ' voto(s) de 2022 ficaram sem seção correspondente e não entram nas unidades.</p>' : '') +
        '<div class="t26-abas" role="tablist">' + ABAS.map(function (a) { return '<button type="button" role="tab" data-t26="' + a[0] + '" aria-selected="' + (a[0] === st.aba) + '">' + a[1] + '</button>'; }).join('') + '</div>' +
        '<div class="t26-corpo"></div>';
    }
    function marcaAba() { root.querySelectorAll('[data-t26]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.t26 === st.aba)); }); }

    /* ----- resumo ----- */
    function topo(R, l, n, fn, desc) {
      return R[l].filter(function (r) { return fn(r) !== 0; }).sort(function (a, b) { return desc * (fn(b) - fn(a)); }).slice(0, n);
    }
    function cardTop(titulo, itens, fn, neg, ctxLv) {
      var mx = itens.length ? Math.abs(fn(itens[0])) : 1;
      return '<div class="t26-card"><h3>' + titulo + '</h3>' + (barras(itens.map(function (r) { var v = fn(r); return { q: Math.abs(v), l: '<b>' + r.lab + '</b>' + (r.ctx && ctxLv !== 'mun' ? ' <small>' + r.ctx + '</small>' : ''), t: r.lab, txt: cmp ? sgn(v) + pspan(varPct(r)) + '<br>' + pspan('estado: ' + pc(r.q22, T22) + ' → ' + pc(r.q26, T26)) : vp(v), neg: neg }; }), mx) || '<p class="t26-sub">Sem dados.</p>') + '</div>';
    }
    function resumo() {
      var R = {}; Object.keys(LV).forEach(function (l) { R[l] = unitRows(l, {}); });
      if (cmp) {
        var mkp = function (l) { return R[l].filter(function (r) { return r.dif > 0; }).length; }, mkn = function (l) { return R[l].filter(function (r) { return r.dif < 0; }).length; };
        var manti = SEC.filter(function (s) { return s.q22 > 0 && s.q26 > 0; }).length;
        var linhas = [
          ['Votos 2022 → 2026', vp(E22.q, T22) + ' → ' + vp(E.q, T26) + ' (' + dv(E.q, E22.q) + ' sobre 2022)'],
          ['Seções com voto em 2022 / em 2026', cp(secComVoto('q22'), SEC.length) + ' / ' + cp(secComVoto('q26'), SEC.length) + ' (' + vv(secComVoto('q26'), secComVoto('q22')) + ' sobre 2022)'],
          ['Seções com voto nas duas eleições', cp(manti, SEC.length)],
          ['Seções que passaram a ter voto', cp(SEC.filter(function (s) { return s.q22 === 0 && s.q26 > 0; }).length, SEC.length)],
          ['Seções que deixaram de ter voto', cp(SEC.filter(function (s) { return s.q22 > 0 && s.q26 === 0; }).length, SEC.length)],
          ['Municípios que cresceram / caíram', cp(mkp('mun'), R.mun.length) + ' / ' + cp(mkn('mun'), R.mun.length)],
          ['Regionais que cresceram / caíram', cp(mkp('reg'), R.reg.length) + ' / ' + cp(mkn('reg'), R.reg.length)],
          ['Bairros que cresceram / caíram', cp(mkp('bairro'), R.bairro.length) + ' / ' + cp(mkn('bairro'), R.bairro.length)],
          ['Locais que cresceram / caíram', cp(mkp('local'), R.local.length) + ' / ' + cp(mkn('local'), R.local.length)],
          ['Seções que cresceram / caíram', cp(mkp('sec'), R.sec.length) + ' / ' + cp(mkn('sec'), R.sec.length)],
          ['Votos de 2022 sem seção em 2026', vp(E22.q - E22.qMapeado, T22)]
        ];
        var d = function (r) { return r.dif; };
        return '<div class="t26-duas"><div class="t26-card"><h3>Resumo do comparativo</h3><div class="t26-lista">' + linhas.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div></div>' +
          '<div class="t26-card">' + graficoPares(R.reg.slice().sort(function (a, b) { return b.q26 - a.q26; }), '2022 × 2026 por regional', false) + '</div></div>' +
          '<div class="t26-card">' + graficoPares(topPares(R.mun, 12), '2022 × 2026 — 12 maiores municípios', false) + '</div>' +
          '<div class="t26-duas">' + cardTop('Municípios que mais ganharam', topo(R, 'mun', 10, d, 1), d, false, 'mun') + cardTop('Municípios que mais perderam', topo(R, 'mun', 10, d, -1).filter(function (r) { return r.dif < 0; }), d, true, 'mun') + '</div>' +
          '<div class="t26-duas">' + cardTop('Bairros que mais ganharam', topo(R, 'bairro', 10, d, 1).filter(function (r) { return r.dif > 0; }), d, false, 'bairro') + cardTop('Bairros que mais perderam', topo(R, 'bairro', 10, d, -1).filter(function (r) { return r.dif < 0; }), d, true, 'bairro') + '</div>' +
          '<div class="t26-duas">' + cardTop('Locais que mais ganharam', topo(R, 'local', 10, d, 1).filter(function (r) { return r.dif > 0; }), d, false, 'local') + cardTop('Locais que mais perderam', topo(R, 'local', 10, d, -1).filter(function (r) { return r.dif < 0; }), d, true, 'local') + '</div>';
      }
      var tot = a22 ? E22.q : E.q;
      var com = function (l) { return R[l].filter(function (r) { return Q(r) > 0; }); };
      var top = function (l, n) { return com(l).sort(function (a, b) { return Q(b) - Q(a); }).slice(0, n).map(function (r) { return { q: Q(r), l: '<b>' + r.lab + '</b>' + (r.ctx && l !== 'mun' && !(MUNC && l === 'bairro') ? ' <small>' + r.ctx + '</small>' : ''), t: r.lab }; }); };
      var conc = function (l, n) { return pct(R[l].slice().sort(function (a, b) { return Q(b) - Q(a); }).slice(0, n).reduce(function (s, r) { return s + Q(r); }, 0), tot); };
      var secV = com('sec').sort(function (a, b) { return Q(b) - Q(a); }), mx = secV[0], md = secV.length ? Q(secV[Math.floor(secV.length / 2)]) : 0;
      var comp = SEC.reduce(function (s, x) { return s + x.comp; }, 0);
      var lider = a26 ? SEC.filter(function (s) { return s.lid === 1; }).length : null;
      var linhas2 = [['Votos ' + NOESTADO, vp(tot)]];
      if (a26) linhas2.push(['Posição ' + NOESTADO, E.pos + 'º de ' + E.nCand + ' candidatos · ' + vg(C.vagas) + ''], C.majoritario ? ['% dos votos válidos', pc(E.q, E.validos)] : ['Votos do partido (nominais + legenda)', fmt(E.partidoNominais + E.partidoLegenda)]);
      if (!MUNC) linhas2.push(['Municípios com voto', cn(com('mun').length, R.mun.length)]);
      linhas2.push(['Zonas com voto', cn(com('zona').length, R.zona.length)], ['Bairros com voto', cn(com('bairro').length, R.bairro.length)], ['Locais de votação com voto', cn(com('local').length, R.local.length)], ['Seções com voto', cn(secV.length, R.sec.length)]);
      if (a26) linhas2.push(['Seções em que foi o mais votado', cn(lider, R.sec.length)]);
      linhas2.push(['Média / mediana por seção com voto', vp(secV.length ? Math.round(tot / secV.length) : 0) + ' / ' + vp(md)], ['Maior votação numa seção', mx ? vp(Q(mx)) + ' · ' + mx.lab + ' (' + mx.ctx + ')' : '—']);
      if (a26) linhas2.push(['Votos por 1.000 comparecimentos', comp ? (E.q / comp * 1000).toFixed(1).replace('.', ',') : '–']);
      if (!MUNC) linhas2.push(['Concentração: 3 / 5 / 10 maiores municípios', conc('mun', 3) + ' / ' + conc('mun', 5) + ' / ' + conc('mun', 10)]);
      linhas2.push(['Concentração: 10 / 50 maiores locais', conc('local', 10) + ' / ' + conc('local', 50)]);
      var mxR = Math.max.apply(null, R.reg.map(function (r) { return Q(r); }).concat([1]));
      var bl = function (t, l) { var it = top(l, 10); return '<div class="t26-card"><h3>' + t + '</h3>' + (barras(it, it[0] ? it[0].q : 1) || '<p class="t26-sub">Sem votos.</p>') + '</div>'; };
      var cardCands = D.candidatos ? '<div class="t26-card"><h3>Candidatos a ' + esc(C.cargo.toLowerCase()) + ' — 1º turno</h3>' + barras(D.candidatos.map(function (x) { return { q: x.votos, l: '<b>' + esc(cap(x.num === C.numero ? C.nome : x.nome)) + '</b> <small>nº ' + x.num + '</small>', t: x.nome, txt: fmt(x.votos) + pspan(pc(x.votos, E.validos)), neg: x.num !== C.numero }; }), D.candidatos[0].votos) + '<p class="t26-sub">Percentuais sobre os ' + fmt(E.validos) + ' votos válidos (sem brancos e nulos).</p></div>' : '';
      return cardCands + '<div class="t26-duas"><div class="t26-card"><h3>Resumo da votação</h3><div class="t26-lista">' + linhas2.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div></div>' +
        (MUNC ? '<div class="t26-card"><h3>Votos por zona</h3>' + barras(top('zona', 10), Math.max.apply(null, R.zona.map(function (r) { return Q(r); }).concat([1]))) + '</div></div>' +
          '<div class="t26-duas">' + bl('10 maiores bairros', 'bairro') + bl('10 maiores locais de votação', 'local') + '</div>' +
          '<div class="t26-duas">' + bl('10 maiores seções', 'sec') + '</div>'
        : '<div class="t26-card"><h3>Votos por regional</h3>' + barras(top('reg', 10), mxR) + '</div></div>' +
          '<div class="t26-duas">' + bl('10 maiores municípios', 'mun') + bl('10 maiores bairros', 'bairro') + '</div>' +
          '<div class="t26-duas">' + bl('10 maiores locais de votação', 'local') + bl('10 maiores seções', 'sec') + '</div>');
    }

    /* ----- tabelas por nível ----- */
    function ordenar(rows) {
      if (!cmp) return rows.sort(function (a, b) { return Q(b) - Q(a) || a.lab.localeCompare(b.lab, 'pt-BR'); });
      var o = st.ord;
      return rows.sort(function (a, b) { return (o === 'dif' ? b.dif - a.dif : o === 'perda' ? a.dif - b.dif : o === 'q26' ? b.q26 - a.q26 : b.q22 - a.q22) || a.lab.localeCompare(b.lab, 'pt-BR'); });
    }
    function situ(u) { return u.q22 === 0 && u.q26 > 0 ? '<span class="t26-tag ok">novo</span>' : u.q22 > 0 && u.q26 === 0 ? '<span class="t26-tag mau">perdeu tudo</span>' : u.dif > 0 ? '<span class="t26-tag ok">cresceu</span>' : u.dif < 0 ? '<span class="t26-tag mau">caiu</span>' : '<span class="t26-tag">igual</span>'; }
    function varPct(u) { return u.q22 ? ((u.dif / u.q22) * 100).toFixed(1).replace('.', ',').replace(/^(\d)/, '+$1') + '%' : (u.q26 ? 'novo' : '–'); }
    function tabelaNivel(lv) {
      var simples = lv === 'reg' || lv === 'mun' || (MUNC && (lv === 'zona' || lv === 'bairro'));   // vereador: zona/bairro não precisam de "Localização"
      var mm = simples ? '' : st.mun;
      var rows = unitRows(lv, mm), tot = rows.reduce(function (a, r) { return a + Q(r); }, 0), nCom = rows.filter(function (r) { return Q(r) > 0; }).length, totAll = rows.length;
      if (!st.zero) rows = rows.filter(function (r) { return cmp ? (r.q22 > 0 || r.q26 > 0) : Q(r) > 0; });
      rows = ordenar(rows);
      var pgs = Math.max(1, Math.ceil(rows.length / PAGE)); if (st.pag >= pgs) st.pag = pgs - 1;
      var mx = rows[0] ? Math.max(Q(rows[0]), 1) : 1, pg = rows.slice(st.pag * PAGE, st.pag * PAGE + PAGE);
      var med = rows.length ? Q(rows[Math.floor(rows.length / 2)]) : 0;
      var opts = Object.keys(MUN).sort(function (a, b) { return MUN[a].localeCompare(MUN[b]); }).map(function (m) { return '<option value="' + m + '"' + (m === st.mun ? ' selected' : '') + '>' + esc(cap(MUN[m])) + '</option>'; }).join('');
      var k4;
      if (cmp) {
        var s22 = rows.reduce(function (a, r) { return a + r.q22; }, 0), s26 = rows.reduce(function (a, r) { return a + r.q26; }, 0);
        k4 = kpi('Votos 2022', vp(s22, T22), mm ? 'em ' + esc(cap(MUN[mm])) : NOESTADO) + kpi('Votos 2026', vp(s26, T26), vv(s26, s22) + ' sobre 2022') + kpi('Diferença', dv(s26, s22), 'sobre 2022') +
          kpi(LV[lv] + ' que cresceram / caíram', cp(rows.filter(function (r) { return r.dif > 0; }).length, rows.length) + ' / ' + cp(rows.filter(function (r) { return r.dif < 0; }).length, rows.length), 'de ' + fmt(rows.length) + ' listadas');
      } else k4 = kpi('Votos nesta visão', vp(tot), mm ? 'em ' + esc(cap(MUN[mm])) : NOESTADO) + kpi(LV[lv] + ' com voto', cp(nCom, totAll), 'de ' + fmt(totAll)) + kpi('Maior votação', vp(rows[0] ? Q(rows[0]) : 0), rows[0] ? rows[0].lab : '–') + kpi('Média por unidade com voto', nCom ? vp(Math.round(tot / nCom)) : '0', 'mediana ' + vt(med));
      var head, body;
      if (cmp) {
        head = '<th>#</th><th>' + LV[lv] + '</th>' + (simples ? '' : '<th>Localização</th>') + '<th class="n">Votos 2022</th><th class="n">Votos 2026</th><th class="n">Diferença</th><th class="n">Variação</th><th>Situação</th>';
        body = pg.map(function (r, i) { return '<tr><td>' + (st.pag * PAGE + i + 1) + '</td><td><b>' + r.lab + '</b></td>' + (simples ? '' : '<td class="t26-sub">' + r.ctx + '</td>') + '<td class="n">' + vp(r.q22, T22) + '</td><td class="n"><b>' + vp(r.q26, T26) + '</b></td><td class="n ' + (r.dif > 0 ? 't26-pos' : r.dif < 0 ? 't26-neg' : '') + '">' + sgn(r.dif) + '</td><td class="n">' + varPct(r) + '</td><td>' + situ(r) + '</td></tr>'; }).join('');
      } else {
        head = '<th>#</th><th>' + LV[lv] + '</th>' + (simples ? '' : '<th>Localização</th>') + '<th class="n">Seções c/ voto</th><th class="n">Votos</th><th class="n">% dos votos dele ' + NOESTADO + '</th>' + (comT ? '<th class="n">Posição na unidade</th>' + (SEM_APTOS ? '' : '<th class="n">Comparec.</th>') + '' + (lv === 'sec' ? '<th class="n">Brancos</th><th class="n">Nulos</th><th class="n">Total apurado</th>' : '') : '') + '<th>Distribuição</th>';
        body = pg.map(function (r, i) {
          return '<tr><td>' + (st.pag * PAGE + i + 1) + '</td><td><b>' + r.lab + '</b></td>' + (simples ? '' : '<td class="t26-sub">' + r.ctx + '</td>') + '<td class="n">' + cn(Cn(r), r.n) + '</td><td class="n"><b>' + fmt(Q(r)) + '</b></td><td class="n">' + pc(Q(r), TB) + '</td>' +
            (comT ? '<td class="n">' + (r.pos ? r.pos + 'º de ' + r.nc : '—') + '</td>' + (SEM_APTOS ? '' : '<td class="n">' + pct(r.comp, r.apt) + '</td>') + (lv === 'sec' ? '<td class="n">' + fmt(r.b) + '</td><td class="n">' + fmt(r.nn) + '</td><td class="n">' + fmt(r.t) + '</td>' : '') : '') +
            '<td><span class="t26-bt"><i style="width:' + (Q(r) / mx * 100).toFixed(1) + '%"></i></span></td></tr>';
        }).join('');
      }
      var ncol = 12;
      return '<div class="t26-card"><div class="t26-topo"><h3>' + (cmp ? 'Comparativo 2022 × 2026 por ' : 'Votação de ' + esc(nome) + ' por ') + LV[lv].toLowerCase() + '</h3><div class="t26-ctl">' +
        (simples || MUNC ? '' : '<label>Município <select data-c="mun"><option value="">' + TODOESTADO + '</option>' + opts + '</select></label>') +
        (cmp ? '<label>Ordenar por <select data-c="ord"><option value="dif"' + (st.ord === 'dif' ? ' selected' : '') + '>Maior ganho</option><option value="perda"' + (st.ord === 'perda' ? ' selected' : '') + '>Maior perda</option><option value="q26"' + (st.ord === 'q26' ? ' selected' : '') + '>Votos 2026</option><option value="q22"' + (st.ord === 'q22' ? ' selected' : '') + '>Votos 2022</option></select></label>' : '') +
        '<label><input type="checkbox" data-c="zero"' + (st.zero ? ' checked' : '') + '> incluir sem voto</label></div></div>' +
        '<section class="t26-kpis t26-kpis4">' + k4 + '</section>' +
        '<div class="t26-gm" data-gm></div>' + (cmp ? '<div class="t26-grafico t26-gtab">' + graficoPares(rows.slice(0, 12), '2022 × 2026 — primeiras 12 da ordenação escolhida', false) + '</div>' : '') +
        '<div class="t26-tab"><table><thead><tr>' + head + '</tr></thead><tbody>' + (body || '<tr><td colspan="' + ncol + '">Nenhuma unidade com voto.</td></tr>') + '</tbody></table></div>' + pager(rows.length, pgs, 'pag') + '</div>';
    }
    function pager(total, pgs, key) {
      var p = st[key];
      return '<div class="t26-pag"><button type="button" data-pg="-1" data-k="' + key + '"' + (p <= 0 ? ' disabled' : '') + '>← Anterior</button><span>' + (total ? p * PAGE + 1 : 0) + '–' + Math.min(total, p * PAGE + PAGE) + ' de ' + total + '</span><button type="button" data-pg="1" data-k="' + key + '"' + (p >= pgs - 1 ? ' disabled' : '') + '>Próxima →</button></div>';
    }

    function nivelMapa(fixo) {
      var lv = fixo || (st.lv === 'auto' ? nivelAuto() : st.lv);
      if (!fixo && st.dr.mun && (lv === 'mun' || lv === 'reg')) lv = nivelAuto() === 'mun' ? 'zona' : nivelAuto();
      return lv;
    }
    /* ----- gráfico de colunas 2022 × 2026 com seta de ganho/perda ----- */
    var gUnits = [];
    function graficoPares(units, titulo, clicavel) {
      gUnits = units;
      var mx = Math.max.apply(null, units.map(function (u) { return Math.max(u.q22, u.q26); }).concat([1]));
      var g = units.map(function (u, i) {
        var d = u.dif, cls = d > 0 ? 'up' : d < 0 ? 'down' : 'eq';
        return '<div class="t26-g' + (clicavel && u.f ? ' t26-gclick' : '') + '" data-ci="' + i + '" title="' + esc(u.lab.replace(/<[^>]+>/g, '')) + ': 2022 ' + vt(u.q22, T22) + ' → 2026 ' + vt(u.q26, T26) + ' (' + sgn(d) + ', ' + varPct(u) + ' sobre 2022)">' +
          '<div class="t26-seta ' + cls + '">' + (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '= ') + sgn(d) + '<small>' + varPct(u) + '</small></div>' +
          '<div class="t26-cols"><div class="t26-col c22" style="height:' + (u.q22 / mx * 100).toFixed(1) + '%"><span>' + fmt(u.q22) + '</span></div><div class="t26-col c26" style="height:' + (u.q26 / mx * 100).toFixed(1) + '%"><span>' + fmt(u.q26) + '</span></div></div>' +
          '<div class="t26-glab">' + u.lab + (u.ctx && clicavel === 'ctx' ? '<small>' + u.ctx.split(' · ')[0] + '</small>' : '') + '<small class="t26-p">2022: ' + pc(u.q22, T22) + ' · 2026: ' + pc(u.q26, T26) + '</small></div></div>';
      }).join('');
      return '<h3>' + titulo + '</h3><div class="t26-chartleg"><span><i class="c22"></i>2022</span><span><i class="c26"></i>2026</span><span class="t26-up">▲ ganhou</span><span class="t26-down">▼ perdeu</span><span class="t26-sub">(2026 comparado com 2022)</span></div>' +
        (g ? '<div class="t26-chart">' + g + '</div>' : '<p class="t26-sub">Sem dados.</p>');
    }
    function topPares(units, n) { return units.filter(function (u) { return u.q22 > 0 || u.q26 > 0; }).sort(function (a, b) { return Math.max(b.q22, b.q26) - Math.max(a.q22, a.q26); }).slice(0, n); }
    function atualizaGrafico() {
      var el = $('[data-grafico]'); if (!el) return;
      var lv = nivelMapa(null), us = topPares(unitRows(lv, st.dr), 12), tot = unitRows(lv, st.dr).filter(function (u) { return u.q22 > 0 || u.q26 > 0; }).length;
      el.innerHTML = graficoPares(us, '2022 × 2026 por ' + LV[lv].toLowerCase() + ' — ' + esc(escopoTxt()) + (tot > us.length ? ' (' + us.length + ' maiores de ' + tot + ')' : ''), 'ctx');
    }
    function escopoTxt() {
      var d = st.dr, p = [ACRE];
      if (d.reg && !MUNC) p.push('Regional ' + d.reg); if (d.mun && !MUNC) p.push(cap(MUN[d.mun])); if (d.zona !== '') p.push('Zona ' + pad(d.zona, 4)); if (d.bairro) p.push(bairroTxt(d.bairro)); if (d.secao) p.push('Seção ' + pad(d.secao, 4));
      return p.join(' › ');
    }

    /* ----- caixas de seleção (granularidade) ao lado do mapa ----- */
    function regionOf2(s) { return regionOf(s.mun); }
    function filtrosHtml() {
      var d = st.dr;
      function grupo(secs, kf, lf) {
        var G = {}; secs.forEach(function (s) { var k = kf(s), g = G[k] = G[k] || { k: k, lab: lf(s), q: 0, q22: 0, q26: 0 }; g.q += s[campo]; g.q22 += s.q22; g.q26 += s.q26; });
        return Object.keys(G).map(function (k) { return G[k]; }).sort(function (a, b) { return cmp ? b.q26 - a.q26 : b.q - a.q; });
      }
      var txt = function (g) { return cmp ? vt(g.q22, T22) + ' → ' + vt(g.q26, T26) : vt(g.q); };
      function sel(id, rot, lista, atual, todos, off) {
        return '<label>' + rot + '<select data-f="' + id + '"' + (off ? ' disabled' : '') + '><option value="">' + todos + '</option>' + lista.map(function (g) { return '<option value="' + esc(g.k) + '"' + (String(g.k) === String(atual) ? ' selected' : '') + '>' + esc(g.lab) + ' · ' + txt(g) + '</option>'; }).join('') + '</select></label>';
      }
      var regs = grupo(SEC, regionOf2, function (s) { return 'Regional ' + regionOf(s.mun); }).sort(function (a, b) { return a.lab.localeCompare(b.lab); });
      var muns = grupo(secInfo({ reg: d.reg }), function (s) { return s.mun; }, function (s) { return cap(MUN[s.mun]); });
      var z = secInfo({ mun: d.mun }), zonas = d.mun ? grupo(z, function (s) { return s.zona; }, function (s) { return 'Zona ' + pad(s.zona, 4); }).sort(function (a, b) { return a.k - b.k; }) : [];
      var b = secInfo({ mun: d.mun, zona: d.zona }), bairros = d.mun ? grupo(b, bairroRaw, function (s) { return bairroTxt(bairroRaw(s)); }) : [];
      var l = secInfo({ mun: d.mun, zona: d.zona, bairro: d.bairro }), locais = d.mun ? grupo(l, function (s) { return s.local; }, function (s) { var li = localInfo(s); return li ? li[0] : 'Local ' + s.local; }) : [];
      var s2 = secInfo({ mun: d.mun, zona: d.zona, bairro: d.bairro, local: d.local }), secoes = d.mun ? grupo(s2, function (s) { return s.zona + '|' + s.secao; }, function (s) { return (d.zona === '' ? 'Zona ' + pad(s.zona, 4) + ' · ' : '') + 'Seção ' + pad(s.secao, 4); }).sort(function (a, c) { return a.lab.localeCompare(c.lab); }) : [];
      var off = !d.mun, secAtual = d.secao ? d.zona + '|' + d.secao : '';
      return '<div class="t26-filtros"><b data-filt role="button" tabindex="0">Detalhar por <span class="t26-filt-seta">▾</span></b>' + buscaHtml() + (MUNC ? '' : sel('reg', 'Regional', regs, d.reg, 'Todas', false) + sel('mun', 'Município', muns, d.mun, d.reg ? 'Toda a regional' : TODOESTADO, false)) + sel('zona', 'Zona', zonas, d.zona, 'Todas', off) + sel('bairro', 'Bairro', bairros, d.bairro, 'Todos', off) + sel('local', 'Local de votação', locais, d.local, 'Todos', off) + sel('secao', 'Seção', secoes, secAtual, 'Todas', off) + '</div>';
    }
    /* ----- busca (município, regional, bairro, local de votação ou seção) ----- */
    var buscaRes = [];
    function buscaHtml() {
      return '<label class="t26-busca">Buscar<input type="search" data-busca placeholder="' + (MUNC ? 'Bairro, local ou seção…' : 'Município, bairro, local ou seção…') + '" autocomplete="off"><div class="t26-res" data-res hidden></div></label>';
    }
    function buscar(q) {
      var I = indiceBusca(), toks = semAcento(q).split(/\s+/).filter(Boolean);
      if (!toks.length || semAcento(q).length < 2) return [];
      var ach = I.filter(function (x) { return toks.every(function (tk) { return x.n.indexOf(tk) >= 0; }); });
      ach.sort(function (a, b) { return a.p - b.p || a.n.length - b.n.length; });
      return ach;
    }
    function mostraBusca(q) {
      var box = $('[data-res]'); if (!box) return;
      var r = buscar(q); buscaRes = r.slice(0, 12);
      if (!q.trim()) { box.hidden = true; return; }
      box.innerHTML = buscaRes.length ? buscaRes.map(function (x, i) { return '<div class="t26-ri" data-sr="' + i + '"><span class="t26-rt">' + x.t + '</span><b>' + esc(x.lab) + '</b>' + (x.ctx ? '<small>' + esc(x.ctx) + '</small>' : '') + '</div>'; }).join('') + (r.length > 12 ? '<div class="t26-rm">+ ' + (r.length - 12) + ' resultados — digite mais para refinar</div>' : '') : '<div class="t26-rm">Nada encontrado.</div>';
      box.hidden = false;
    }
    function aplicaFiltro(campoF, v) {
      var d = st.dr;
      if (campoF === 'reg') { d.reg = v; d.mun = d.zona = d.bairro = d.local = d.secao = ''; }
      else if (campoF === 'mun') { d.mun = v; if (v) d.reg = regionOf(v); d.zona = d.bairro = d.local = d.secao = ''; }
      else if (campoF === 'zona') { d.zona = v; d.bairro = d.local = d.secao = ''; }
      else if (campoF === 'bairro') { d.bairro = v; d.local = d.secao = ''; }
      else if (campoF === 'local') { d.local = v; d.secao = ''; if (v) { var s = SEC.find(function (x) { return x.mun === d.mun && String(x.local) === v; }); if (s) d.zona = String(s.zona); } }
      else if (campoF === 'secao') {
        d.secao = ''; if (v) { var p = v.split('|'), s2 = SEC.find(function (x) { return x.mun === d.mun && String(x.zona) === p[0] && String(x.secao) === p[1]; }); if (s2) { d.zona = String(s2.zona); d.secao = String(s2.secao); d.local = String(s2.local); d.bairro = bairroRaw(s2); } }
      }
      st.lv = 'auto'; st.psec = 0; desenha();
    }

    /* ----- aba mapa: detalhamento por clique + informações do município ----- */
    function nivelAuto() { var d = st.dr; return d.secao ? 'sec' : !d.mun ? (d.reg ? 'mun' : 'reg') : d.local ? 'sec' : d.zona === '' ? 'zona' : !d.bairro ? 'bairro' : 'local'; }
    function abaMapa() {
      var d = st.dr, auto = nivelAuto(), F = d, sc = secInfo(F);
      var q = sc.reduce(function (a, s) { return a + (cmp ? s.q26 : s[campo]); }, 0), q0 = sc.reduce(function (a, s) { return a + s.q22; }, 0);
      var com = sc.filter(function (s) { return s[campo] > 0; }).length;
      var ls = d.local ? SEC.find(function (s) { return s.mun === d.mun && String(s.local) === String(d.local); }) : null, li0 = ls ? localInfo(ls) : null;
      var mig = [['state', ACRE]];
      if (d.reg && !MUNC) mig.push(['reg', 'Regional ' + esc(d.reg)]);
      if (d.mun && !MUNC) mig.push(['mun', esc(cap(MUN[d.mun]))]);
      if (d.zona !== '') mig.push(['zona', 'Zona ' + pad(d.zona, 4)]);
      if (d.bairro) mig.push(['bairro', esc(bairroTxt(d.bairro))]);
      if (d.local) mig.push(['local', li0 ? esc(li0[0]) : 'Local ' + d.local]);
      if (d.secao) mig.push(['secao', 'Seção ' + pad(d.secao, 4)]);
      var resumoEsc = cmp ? vt(q0, T22) + ' → ' + vt(q, T26) + ' votos (' + sgn(q - q0) + ', ' + vv(q, q0) + ' sobre 2022)' : vt(q) + ' votos de ' + esc(nome) + ' · ' + com + ' seções com voto';
      var mapaCard = '<div class="t26-card">' + filtrosHtml() + '<div class="t26-mig">' + mig.map(function (c, i) { return i === mig.length - 1 ? '<b>' + c[1] + '</b>' : '<a data-dr="' + c[0] + '">' + c[1] + '</a>'; }).join(' › ') +
        '<span class="t26-sub"> · ' + resumoEsc + ' · próximo nível: <b>' + LV[auto] + '</b>' + (auto === 'sec' ? ' (último)' : ' — clique num ponto/área') + '</span></div>' +
        '<div class="t26-gm" data-gm></div><p class="t26-sub">Clique para detalhar: ' + (MUNC ? '' : 'município → ') + 'zona → bairro → local de votação → seção (use o caminho acima para voltar). Em "Colorir por" dá para ver outro nível' + (MUNC ? '' : ', inclusive regional') + '. Imagem: Esri World Imagery.</p></div>';
      return '<div class="t26-mapagrid">' + mapaCard + '<div class="t26-card t26-det">' + detalheMun() + '</div></div>' + (cmp ? '<div class="t26-card t26-grafico" data-grafico></div>' : '') + (d.mun ? tabelaSecoes() : '');
    }
    function listaMun() {
      var rows = ordenarMunRows(unitRows('mun', {}));
      var tot = rows.reduce(function (a, r) { return a + r.q26; }, 0);
      return '<h3>Município a município</h3><div class="t26-tab t26-tabalta"><table><thead><tr><th>Município</th>' + (cmp ? '<th class="n">2022</th><th class="n">2026</th><th class="n">Dif.</th>' : '<th class="n">Votos</th><th class="n">% dos votos dele</th>') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr class="t26-click" data-mun="' + r.f.mun + '"><td>' + r.lab + '</td>' + (cmp ? '<td class="n">' + vp(r.q22, T22) + '</td><td class="n">' + vp(r.q26, T26) + '</td><td class="n ' + (r.dif > 0 ? 't26-pos' : r.dif < 0 ? 't26-neg' : '') + '">' + dv(r.q26, r.q22) + '</td>' : '<td class="n">' + fmt(Q(r)) + '</td><td class="n">' + pc(Q(r), TB) + '</td>') + '</tr>'; }).join('') + '</tbody></table></div><p class="t26-sub">Clique numa linha ou no mapa para ver zonas e seções.</p>';
    }
    function ordenarMunRows(rows) { return rows.sort(function (a, b) { return (cmp ? b.q26 - a.q26 : Q(b) - Q(a)) || a.lab.localeCompare(b.lab, 'pt-BR'); }); }
    var panelUnits = [];
    var FILHO = { state: 'reg', reg: 'mun', mun: 'zona', zona: 'bairro', bairro: 'local', local: 'sec' }, PAI = { reg: 'state', mun: d0reg(), zona: 'mun', bairro: 'zona', local: 'bairro', sec: 'local' };
    function d0reg() { return 'reg'; }
    function totalEstado() { var us = unitRows('reg', {}), o = { lab: ACRE, n: 0, c22: 0, c26: 0, q22: 0, q26: 0, t: 0, b: 0, nn: 0, apt: 0, comp: 0, pos: E.pos, nc: E.nCand }; us.forEach(function (u) { ['n', 'c22', 'c26', 'q22', 'q26', 't', 'b', 'nn', 'apt', 'comp'].forEach(function (k) { o[k] += u[k]; }); }); o.dif = o.q26 - o.q22; return o; }
    function detalheMun() {
      var d = st.dr, atual = d.secao ? 'sec' : d.local ? 'local' : d.bairro ? 'bairro' : d.zona !== '' ? 'zona' : d.mun ? 'mun' : d.reg ? 'reg' : 'state';
      var o = atual === 'state' ? totalEstado() : unitRows(atual, d)[0];
      if (!o) return '<p class="t26-sub">Sem dados para este recorte.</p>';
      var sg = secInfo(d)[0], li = sg ? localInfo(sg) : null, m = d.mun;
      var L = atual === 'state' || atual === 'reg' || MUNC ? [] : [['Regional', esc(regionOf(m))]];
      if (atual === 'local' || atual === 'sec') L.push(['Local de votação', li ? esc(li[0]) : 'Local ' + (sg ? sg.local : '')]);
      if (atual === 'sec' || atual === 'local') L.push(['Bairro · endereço', li ? esc(cap(li[1] || '')) + (li[2] ? ' · ' + esc(li[2]) : '') : '—']);
      if (cmp) L.push(['Votos 2022', vp(o.q22, T22)], ['Votos 2026', vp(o.q26, T26)], ['Diferença', dv(o.q26, o.q22) + ' sobre 2022'], ['Seções com voto 2022 → 2026', cp(o.c22, o.n) + ' → ' + cp(o.c26, o.n) + ' de ' + o.n]);
      else if (a26) {
        L.push(['Votos de ' + esc(nome), vp(o.q26)], ['Posição na unidade', o.pos ? o.pos + 'º de ' + o.nc + ' candidatos' : '—'], ['Votos em branco', fmt(o.b)], ['Votos nulos', fmt(o.nn)], ['Total apurado', fmt(o.t)], ['Comparecimento / aptos', fmt(o.comp) + ' / ' + fmt(o.apt) + ' (' + pct(o.comp, o.apt) + ')']); if (SEM_APTOS) L.pop();
        if (atual !== 'sec') L.push(['Seções com voto', cn(o.c26, o.n)]);
      } else L.push(['Votos de ' + esc(nome), vp(o.q22)], ['Seções com voto', cn(o.c22, o.n)]);
      var filho = FILHO[atual], filhos = [];
      if (filho) { filhos = unitRows(filho, d).filter(function (u) { return cmp ? (u.q22 > 0 || u.q26 > 0) : Q(u) > 0; }).sort(function (a, b) { return cmp ? b.q26 - a.q26 : Q(b) - Q(a); }); }
      panelUnits = filhos;
      var cab = '<th>' + LV[filho || 'sec'] + '</th>' + (cmp ? '<th class="n">2022</th><th class="n">2026</th><th class="n">Dif.</th>' : '<th class="n">Seções c/ voto</th><th class="n">Votos</th><th class="n">% dos votos dele</th>');
      var linhas = filhos.map(function (u, i) {
        return '<tr class="t26-click" data-pu="' + i + '"><td>' + u.lab + '</td>' + (cmp ? '<td class="n">' + vp(u.q22, T22) + '</td><td class="n">' + vp(u.q26, T26) + '</td><td class="n ' + (u.dif > 0 ? 't26-pos' : u.dif < 0 ? 't26-neg' : '') + '">' + dv(u.q26, u.q22) + '</td>' : '<td class="n">' + cn(Cn(u), u.n) + '</td><td class="n">' + fmt(Q(u)) + '</td><td class="n">' + pc(Q(u), TB) + '</td>') + '</tr>';
      }).join('');
      var rot = atual === 'mun' || atual === 'state' || atual === 'reg' ? o.lab : atual === 'zona' && !MUNC ? o.lab + ' · ' + esc(cap(MUN[m])) : o.lab;
      return '<div class="t26-sec"><div class="t26-topo"><h3>' + rot + '</h3><div class="t26-ctl">' + (PAI[atual] && !(MUNC && atual === 'mun') ? '<button type="button" data-dr="' + PAI[atual] + '" class="t26-btn">↑ Subir um nível</button>' : '') + (atual !== 'state' && !(MUNC && atual === 'mun') ? '<button type="button" data-dr="state" class="t26-btn">Ver ' + TODOESTADO.toLowerCase() + '</button>' : '') + '</div></div>' +
        '<div class="t26-lista">' + L.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div></div>' +
        (filho ? '<div class="t26-sec"><h4>Por ' + LV[filho].toLowerCase() + ' <small class="t26-sub">(clique numa linha para detalhar)</small></h4><div class="t26-tab t26-tabalta"><table><thead><tr>' + cab + '</tr></thead><tbody>' + (linhas || '<tr><td colspan="4">Nenhuma unidade com voto.</td></tr>') + '</tbody></table></div></div>' : '<div class="t26-sec"><p class="t26-sub">Último nível: a seção individual.</p></div>');
    }
    function tabelaSecoes() {
      var rows = secInfo(st.dr);
      if (!st.zsec) rows = rows.filter(function (s) { return cmp ? (s.q22 > 0 || s.q26 > 0) : s[campo] > 0; });
      rows.sort(function (a, b) { return cmp ? Math.abs(b.q26 - b.q22) - Math.abs(a.q26 - a.q22) : b[campo] - a[campo] || a.zona - b.zona || a.secao - b.secao; });
      var pgs = Math.max(1, Math.ceil(rows.length / PAGE)); if (st.psec >= pgs) st.psec = pgs - 1;
      var pg = rows.slice(st.psec * PAGE, st.psec * PAGE + PAGE);
      var loc = function (s) { var li = localInfo(s); return li ? '<b>' + esc(li[0]) + '</b> <small class="t26-sub">(' + s.local + ')</small><br><small class="t26-sub">' + esc(cap(li[1] || '')) + (li[2] ? ' · ' + esc(li[2]) : '') + '</small>' : 'Local ' + s.local; };
      var head = '<th>Zona</th><th>Seção</th><th>Local de votação (bairro · endereço)</th>' + (cmp ? '<th class="n">Votos 2022</th><th class="n">Votos 2026</th><th class="n">Diferença</th>' : '<th class="n">Votos</th>' + (comT ? '<th class="n">Brancos</th><th class="n">Nulos</th><th class="n">Total apurado</th>' : ''));
      var body = pg.map(function (s) {
        return '<tr><td>' + pad(s.zona, 4) + '</td><td>' + pad(s.secao, 4) + '</td><td>' + loc(s) + '</td>' + (cmp ? '<td class="n">' + vp(s.q22, T22) + '</td><td class="n"><b>' + vp(s.q26, T26) + '</b></td><td class="n ' + (s.q26 > s.q22 ? 't26-pos' : s.q26 < s.q22 ? 't26-neg' : '') + '">' + dv(s.q26, s.q22) + '</td>' : '<td class="n"><b>' + vp(s[campo]) + '</b></td>' + (comT ? '<td class="n">' + fmt(s.b) + '</td><td class="n">' + fmt(s.n) + '</td><td class="n">' + fmt(s.t) + '</td>' : '')) + '</tr>';
      }).join('');
      return '<div class="t26-card"><div class="t26-topo"><h3>Onde ' + esc(cmp ? C.nome : nome) + ' teve voto — zona e seção</h3><label class="t26-sub"><input type="checkbox" data-c="zsec"' + (st.zsec ? ' checked' : '') + '> incluir seções sem voto</label></div>' +
        '<div class="t26-tab"><table><thead><tr>' + head + '</tr></thead><tbody>' + (body || '<tr><td colspan="12">Nenhuma seção com voto.</td></tr>') + '</tbody></table></div>' + pager(rows.length, pgs, 'psec') + '</div>';
    }
    function drill(f) {
      var d = st.dr;
      if (f.reg && f.reg !== d.reg) { d.reg = f.reg; d.mun = d.zona = d.bairro = d.local = d.secao = ''; }
      if (f.mun && f.mun !== d.mun) { d.mun = f.mun; d.reg = regionOf(f.mun); d.zona = d.bairro = d.local = d.secao = ''; }
      if (f.zona != null) d.zona = String(f.zona);
      if (f.bairro) d.bairro = f.bairro;
      if (f.local != null) d.local = String(f.local);
      if (f.secao != null) { d.secao = String(f.secao); var sx = SEC.find(function (x) { return x.mun === d.mun && String(x.zona) === d.zona && String(x.secao) === d.secao; }); if (sx) { d.local = String(sx.local); d.bairro = bairroRaw(sx); } }
      st.lv = 'auto'; st.psec = 0; desenha();
    }

    /* ----- mapa Leaflet ----- */
    function iniciaMapa(fixo) {
      var el = $('[data-gm]'); if (!el) return;
      if (typeof L === 'undefined') { el.innerHTML = '<p class="t26-sub" style="padding:14px">Mapa indisponível (a biblioteca de mapas não carregou — sem internet?).</p>'; return; }
      if (mapa) { try { mapa.remove(); } catch (e) { } mapa = null; }
      semTam = !el.clientWidth;
      var F = fixo ? { mun: (fixo === 'reg' || fixo === 'mun') ? '' : st.mun } : st.dr;
      var fundo = L.layerGroup(), dados = L.layerGroup(), contorno = L.layerGroup();
      var map = mapa = L.map(el, { zoomSnap: 0.25 });
      // No celular, um dedo rola a página (o mapa só arrasta com dois dedos ou em tela cheia).
      var toque = !!(L.Browser.mobile || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches));
      if (toque) {
        map.dragging.disable();
        var nx = el.nextElementSibling;
        if (!nx || !nx.classList.contains('t26-dica-toque')) el.insertAdjacentHTML('afterend', '<p class="t26-sub t26-dica-toque">Use dois dedos para mover o mapa, ou toque em “Tela cheia” para explorá-lo com um dedo.</p>');
      }
      // Tela cheia: o mapa ocupa a tela e o painel de detalhe (se houver) fica ao lado/embaixo, sempre à vista.
      // O estado fica em st.cheia: detalhar (que remonta a aba) reabre o novo mapa já em tela cheia.
      // Em tela cheia o filtro "Detalhar por" fica fixo acima do painel de detalhe; o painel desce a altura dele.
      function ajustaFiltros() {
        root.classList.toggle('t26-filt-aberto', !!st.filtAberto);
        var fl = root.querySelector('.t26-filtros');
        root.style.setProperty('--t26-fh', st.cheia && fl ? fl.offsetHeight + 'px' : '0px');
      }
      if (window.ResizeObserver) { var fl0 = root.querySelector('.t26-filtros'); if (fl0) new ResizeObserver(ajustaFiltros).observe(fl0); }
      window.addEventListener('resize', ajustaFiltros);
      function setCheia(f) {
        st.cheia = f;
        root.classList.toggle('t26-modo-cheia', f && !!$('.t26-det'));
        ajustaFiltros();
        el.classList.toggle('t26-cheia', f);
        var b = el.querySelector('[data-k=fs]'); if (b) b.textContent = f ? '✕ Sair da tela cheia' : '⛶ Tela cheia';
        if (toque) { if (f) map.dragging.enable(); else map.dragging.disable(); }
        setTimeout(function () { map.invalidateSize(); }, 60);
      }
      fundo.addTo(map); dados.addTo(map); contorno.addTo(map);
      var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
      function setBase() {
        fundo.clearLayers();
        if (st.base === 'map') L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(fundo);
        else {
          L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }).addTo(fundo);
          if (st.base === 'hib') {
            L.tileLayer(ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(fundo);
            L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(fundo);
          }
        }
      }
      var legenda = L.control({ position: 'bottomleft' });
      legenda.onAdd = function () {
        var dv = L.DomUtil.create('div', 't26-leg'); L.DomEvent.disableClickPropagation(dv);
        dv.addEventListener('click', function (ev) { if (ev.target.tagName === 'B') dv.classList.toggle('t26-leg-min'); });
        return dv;
      };
      legenda.addTo(map);
      var nivel = function () { return nivelMapa(fixo); };
      var val = function (u) { return cmp ? (st.met === 'dif' ? u.dif : st.met === 'q22' ? u.q22 : u.q26) : Q(u); };
      var tip = function (u, lv) {
        var m0 = Array.from(u.muns)[0], h = '<b>' + (lv === 'reg' ? '' : LV[lv] + ': ') + u.lab + '</b>' + (u.ctx ? '<br><small>' + u.ctx + '</small>' : '') + '<br>' + (m0 && lv !== 'reg' && !MUNC ? 'Regional ' + esc(regionOf(m0)) + '<br>' : '');
        if (cmp) return h + '2022: <b>' + fmt(u.q22) + '</b> (' + pc(u.q22, T22) + ' do estado) · 2026: <b>' + fmt(u.q26) + '</b> (' + pc(u.q26, T26) + ' do estado)<br>Diferença: <b>' + sgn(u.dif) + '</b> (' + varPct(u) + ' sobre 2022)<br>Seções com voto: ' + u.c22 + ' → ' + u.c26 + ' de ' + u.n;
        h += 'Votos: <b>' + fmt(Q(u)) + '</b> (' + pc(Q(u), TB) + ' dos votos dele ' + NOESTADO + ')<br>Seções com voto: ' + Cn(u) + '/' + u.n;
        if (comT && u.pos) h += '<br>Posição na unidade: ' + u.pos + 'º de ' + u.nc;
        return h;
      };
      var primeira = true, ultimo = '';
      function desenhar() {
        dados.clearLayers(); contorno.clearLayers();
        var lv = nivel(), poli = lv === 'reg' || lv === 'mun';
        var us = unitRows(lv, F);
        if (!(fixo && st.zero)) us = us.filter(function (u) { return cmp ? (u.q22 > 0 || u.q26 > 0) : Q(u) > 0; });
        var tipoEsc = cmp && st.met === 'dif' ? 'div' : 'seq';
        var esc2 = mkEscala(us.map(val), tipoEsc), lim = L.latLngBounds([]), falta = 0;
        if (poli) {
          var porMun = {}; us.forEach(function (u) { u.muns.forEach(function (m) { porMun[m] = u; }); });
          Object.keys(MAPA.mun).forEach(function (cod) {
            var u = porMun[cod];
            var pg = L.polygon(munRings(cod), { color: '#fff', weight: 1, fillColor: u ? esc2.cor(val(u)) : '#8b929c', fillOpacity: u ? 0.75 : 0.2 }).addTo(dados);
            pg.bindTooltip(u ? tip(u, lv) : esc(cap(MUN[cod] || cod)) + '<br>sem voto', { sticky: true });
            if (!fixo) pg.on('click', function () { drill(lv === 'reg' ? { reg: regionOf(cod) } : { mun: cod }); });
            if (u || !us.length) lim.extend(pg.getBounds());
          });
        } else {
          if (F.mun && MAPA.mun[F.mun]) L.polygon(munRings(F.mun), { color: '#fff', weight: 1.5, fill: false, opacity: 0.8, interactive: false }).addTo(contorno);
          var mx = Math.max.apply(null, us.map(function (u) { return cmp ? Math.max(u.q22, u.q26) : Q(u); }).concat([1]));
          us.filter(function (u) { if (u.lat == null) { falta++; return false; } return true; }).sort(function (a, b) { return (cmp ? Math.max(b.q22, b.q26) - Math.max(a.q22, a.q26) : Q(b) - Q(a)); }).forEach(function (u) {
            var tam = cmp ? Math.max(u.q22, u.q26) : Q(u), r = lv === 'sec' ? 4 + 6 * Math.sqrt(tam / mx) : 5 + 15 * Math.sqrt(tam / mx);
            var m = L.circleMarker([u.lat, u.lon], { radius: r, color: '#fff', weight: 1, fillColor: esc2.cor(val(u)), fillOpacity: 0.88 }).addTo(dados);
            m.bindTooltip(tip(u, lv), { sticky: true });
            if (!fixo && u.f) m.on('click', function () { drill(u.f); });
            lim.extend([u.lat, u.lon]);
          });
        }
        var rows = esc2.rows();
        legenda.getContainer().innerHTML = '<b>' + LV[lv] + ' · ' + esc2.titulo + '</b>' + (rows.map(function (r) { return '<div><i style="background:' + r.cor + '"></i>' + r.txt + ' <span>(' + r.n + ')</span></div>'; }).join('') || '<div>sem votos</div>') + (falta ? '<div class="t26-falta">' + falta + ' sem coordenada</div>' : '');
        if (!fixo && cmp) atualizaGrafico();
        if (primeira || ultimo !== lv) {
          primeira = false; ultimo = lv; var fb = lim;
          if (F.mun && !poli) {
            var tot = us.reduce(function (s, u) { return s + (cmp ? Math.max(u.q22, u.q26) : Q(u)); }, 0), ac = 0, nucleo = L.latLngBounds([]);
            us.filter(function (u) { return u.lat != null; }).sort(function (x, y) { return (cmp ? Math.max(y.q22, y.q26) - Math.max(x.q22, x.q26) : Q(y) - Q(x)); }).some(function (u) { nucleo.extend([u.lat, u.lon]); ac += cmp ? Math.max(u.q22, u.q26) : Q(u); return ac >= tot * 0.85; });
            if (nucleo.isValid()) fb = nucleo.pad(0.25);
          }
          if (fb.isValid()) map.fitBounds(fb.pad(0.05), { maxZoom: 17 });
        }
      }
      var ctl = L.control({ position: 'topright' });
      ctl.onAdd = function () {
        var dv = L.DomUtil.create('div', 't26-ctlmapa'); L.DomEvent.disableClickPropagation(dv); L.DomEvent.disableScrollPropagation(dv);
        var ops = ['auto'].concat(Object.keys(LV)).filter(function (l) { return !(F.mun && (l === 'mun' || l === 'reg')); });
        dv.innerHTML = '<div class="t26-opcs"><label>Fundo <select data-k="base"><option value="hib">Satélite + ruas</option><option value="sat">Satélite</option><option value="map">Mapa</option></select></label>' +
          (fixo ? '' : '<label>Colorir por <select data-k="lv">' + ops.map(function (l) { return '<option value="' + l + '">' + (l === 'auto' ? 'Automático (clique p/ detalhar)' : LV[l]) + '</option>'; }).join('') + '</select></label>') +
          (cmp ? '<label>Mostrar <select data-k="met"><option value="dif">Diferença</option><option value="q26">Votos 2026</option><option value="q22">Votos 2022</option></select></label>' : '') +
          '</div><div class="t26-ctlbar"><button type="button" class="t26-opc" data-k="opc" aria-expanded="false">⚙ Opções</button><button type="button" data-k="fs">⛶ Tela cheia</button></div>';
        dv.querySelectorAll('select').forEach(function (s) {
          var k = s.dataset.k; s.value = k === 'base' ? st.base : k === 'met' ? st.met : (st.lv === 'auto' ? 'auto' : nivel());
          s.onchange = function () { if (k === 'base') { st.base = s.value; setBase(); } else if (k === 'met') { st.met = s.value; desenhar(); } else { st.lv = s.value; desenhar(); } };
        });
        var bt = dv.querySelector('[data-k=fs]'), bo = dv.querySelector('[data-k=opc]');
        bt.onclick = function () { setCheia(!el.classList.contains('t26-cheia')); };
        bo.onclick = function () { var a = dv.classList.toggle('t26-aberto'); bo.setAttribute('aria-expanded', String(a)); };
        return dv;
      };
      ctl.addTo(map);
      document.addEventListener('keydown', function esc1(ev) {
        if (!document.body.contains(el)) { document.removeEventListener('keydown', esc1); return; }
        if (ev.key === 'Escape' && el.classList.contains('t26-cheia')) setCheia(false);
      });
      setBase(); desenhar(); setTimeout(function () { map.invalidateSize(); }, 80);
      if (st.cheia) setCheia(true);
    }

    /* ----- exportar: slide (exibir/baixar) e PDFs (visualizar/baixar) ----- */
    var FONTE = MUNC ? 'TSE (Tribunal Superior Eleitoral) - votação por seção, 1º turno de ' + ANO
      : (cmp ? 'Boletins de urna do 1º turno de 2026 e votação por seção de 2022 (TSE)' : (a22 ? 'TSE (Tribunal Superior Eleitoral) - votação por seção, 2022' : 'Boletins de urna do 1º turno de 2026'));
    function plano(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
    // Reúne os números (em texto puro) que o slide e os PDFs usam; nada aqui depende da aba aberta.
    function coletar(tipo) {
      var R = {}, L = {}, cob22 = {}, cob26 = {};
      Object.keys(LV).forEach(function (l) {
        R[l] = unitRows(l, {});
        L[l] = R[l].map(function (u) { return { rot: plano(u.lab), ctx: plano(u.ctx), v22: u.q22, v26: u.q26, dif: u.dif, c22: u.c22, c26: u.c26, n: u.n, pos: u.pos, nc: u.nc }; });
        cob22[l] = { n: R[l].filter(function (u) { return u.q22 > 0; }).length, t: R[l].length };
        cob26[l] = { n: R[l].filter(function (u) { return u.q26 > 0; }).length, t: R[l].length };
      });
      return {
        tipo: tipo, ano: ANO, fonte: FONTE, esc: ACRE, onde: NOESTADO, T22: T22, T26: T26, pos: E.pos, nCand: E.nCand,
        cand: { nome: C.nome, nomeCompleto: C.nomeCompleto || '', nome2022: C.nome2022 || '', numero: C.numero, partido: C.partido, cargo: C.cargo, vagas: C.vagas, eleito: !!C.eleito, municipio: MUNC },
        L: L, cob22: cob22, cob26: cob26,
        secGanhas: SEC.filter(function (s) { return s.q22 === 0 && s.q26 > 0; }).length,
        secPerdidas: SEC.filter(function (s) { return s.q22 > 0 && s.q26 === 0; }).length,
        liderSecoes: SEC.filter(function (s) { return s.lid === 1; }).length,
        semSecao22: E22.q - E22.qMapeado
      };
    }
    function rotAno(tipo) { return tipo === 'cmp' ? '2022 × 2026' : (tipo === '2022' ? '2022' : String(ANO)); }
    function cartaoEx(icone, titulo, desc, botoes) {
      return '<div class="t26-card ex-card"><div class="ex-ico" aria-hidden="true">' + icone + '</div><div class="ex-corpo"><h3>' + titulo + '</h3><p class="t26-sub">' + desc + '</p>' +
        '<div class="ex-acoes">' + botoes + '</div><p class="t26-sub ex-status" role="status" aria-live="polite"></p></div></div>';
    }
    function btnEx(acao, tipo, rot, prim) { return '<button type="button" class="t26-btn ex-btn' + (prim ? ' ex-prim' : '') + '" data-ex="' + acao + '" data-tipo="' + tipo + '">' + rot + '</button>'; }
    function exportar() {
      var UNICO = !!(MUNC || C.sem22);
      var tipoSlide = UNICO ? '2026' : (cmp ? 'cmp' : (a22 ? '2022' : '2026'));
      var tipoPdf = UNICO ? '2026' : (a22 ? '2022' : '2026');
      var quem = esc(C.nome) + (MUNC ? ' (' + esc(C.cargo) + ' de ' + esc(MUNC) + ')' : ' (' + esc(C.cargo) + ')');
      var h = '<p class="t26-sub t26-nota">Materiais de ' + quem + ' prontos para apresentar ou enviar. Os percentuais são sempre sobre o total de votos do próprio candidato' + (MUNC ? ' em ' + esc(MUNC) : ' no estado') + '.</p><div class="ex-grade">';
      h += cartaoEx('▶', 'Slide do resultado · ' + rotAno(tipoSlide),
        'Apresentação com os números-chave, ' + (cmp ? 'comparação por regional, municípios, bairros, locais e seções.' : (MUNC ? 'votos por zona, bairros, locais de votação e seções.' : 'votos por regional, municípios, bairros, locais de votação e seções.')),
        btnEx('slide-ver', tipoSlide, '▶ Exibir slide', true) + btnEx('slide-baixar', tipoSlide, '⬇ Baixar slide (.pptx)'));
      h += cartaoEx('▤', 'PDF da votação · ' + rotAno(tipoPdf),
        'Relatório sobre a votação: resumo, cobertura do território' + (MUNC ? '' : ', regionais') + ' e rankings de ' + (MUNC ? 'bairros, locais e seções.' : 'municípios, bairros, locais e seções.'),
        btnEx('pdf-ver', tipoPdf, 'Visualizar PDF', true) + btnEx('pdf-baixar', tipoPdf, '⬇ Baixar PDF'));
      if (!UNICO) h += cartaoEx('⇄', 'PDF comparativo · 2022 × 2026',
        'Resumo comparando 2022 e 2026: crescimento total, por regional e município, onde mais ganhou e mais perdeu, e cobertura de seções.',
        btnEx('pdf-ver', 'cmp', 'Visualizar PDF', true) + btnEx('pdf-baixar', 'cmp', '⬇ Baixar PDF'));
      return h + '</div>';
    }
    function exportarAcao(acao, tipo, btn) {
      var cartao = btn.closest('.ex-card'), alvo = cartao && cartao.querySelector('.ex-status');
      function msg(t, erro) { if (alvo) { alvo.textContent = t || ''; alvo.className = 't26-sub ex-status' + (erro ? ' ex-erro' : ''); } }
      if (!window.EleicaoExportar || !window.EleicaoExportar[acao]) { msg('O módulo de exportação não carregou. Recarregue a página.', true); return; }
      btn.disabled = true; msg('Preparando…');
      var p;
      try { p = window.EleicaoExportar[acao](coletar(tipo), msg); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function () { msg(acao.indexOf('baixar') >= 0 ? 'Arquivo gerado. Confira a pasta de downloads.' : ''); })
        .catch(function (e) { msg('Não foi possível gerar: ' + (e && e.message ? e.message : e), true); })
        .then(function () { btn.disabled = false; });
    }

    /* ----- renderização e eventos ----- */
    function desenha() {
      var corpo = $('.t26-corpo'); if (!corpo) return;
      marcaAba();
      if (st.aba === 'resumo') { corpo.innerHTML = resumo(); if (mapa) { try { mapa.remove(); } catch (e) { } mapa = null; } return; }
      if (st.aba === 'mapa') { corpo.innerHTML = abaMapa(); iniciaMapa(null); return; }
      if (st.aba === 'exportar') { corpo.innerHTML = exportar(); if (mapa) { try { mapa.remove(); } catch (e) { } mapa = null; } return; }
      corpo.innerHTML = tabelaNivel(st.aba); iniciaMapa(st.aba);
    }
    function eventos() {
      if (window.ResizeObserver) new ResizeObserver(function () { if (semTam && root.clientWidth > 0 && !root.hidden) { semTam = false; desenha(); } }).observe(root);
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-filt]')) { st.filtAberto = !st.filtAberto; root.classList.toggle('t26-filt-aberto', st.filtAberto); var fl = root.querySelector('.t26-filtros'); root.style.setProperty('--t26-fh', st.cheia && fl ? fl.offsetHeight + 'px' : '0px'); return; }
        var ex = e.target.closest('[data-ex]'); if (ex) { exportarAcao(ex.dataset.ex, ex.dataset.tipo, ex); return; }
        var t = e.target.closest('[data-t26]'); if (t) { st.aba = t.dataset.t26; st.pag = 0; st.psec = 0; st.cheia = false; root.classList.remove('t26-modo-cheia'); desenha(); return; }
        var an = e.target.closest('[data-antigo]');
        if (an) { var w = document.querySelector('#painel-resultados .resultados-wrap'); if (w) { var vis = w.style.display === 'none'; w.style.display = vis ? '' : 'none'; an.textContent = vis ? 'Ocultar visão anterior (mapa de 2022)' : 'Mostrar visão anterior (mapa de 2022)'; } return; }
        var cr = e.target.closest('[data-dr]');
        if (cr) {
          var k = cr.dataset.dr, d = st.dr;
          if (k === 'state') d.reg = REG0; if (k === 'state' || k === 'reg') d.mun = MUN0; if (k === 'state' || k === 'reg' || k === 'mun') d.zona = ''; if (k === 'state' || k === 'reg' || k === 'mun' || k === 'zona') d.bairro = ''; if (k !== 'local' && k !== 'secao') d.local = ''; d.secao = '';
          st.lv = 'auto'; st.psec = 0; desenha(); return;
        }
        var sr = e.target.closest('[data-sr]'); if (sr) { var it = buscaRes[Number(sr.dataset.sr)]; if (it) { var f = it.f, d0 = st.dr; if (f.reg) { d0.reg = ''; } if (f.mun) { d0.mun = ''; } if (!f.reg && !f.mun) { } if (f.zona == null && f.bairro == null && f.local == null && f.secao == null) { d0.zona = d0.bairro = d0.local = d0.secao = ''; } if (f.mun && (f.bairro || f.local != null || f.secao != null)) { d0.zona = d0.bairro = d0.local = d0.secao = ''; } drill(f); } return; }
        var gc = e.target.closest('[data-ci]'); if (gc && st.aba === 'mapa') { var gu = gUnits[Number(gc.dataset.ci)]; if (gu && gu.f) drill(gu.f); return; }
        var lm = e.target.closest('tr[data-mun]'); if (lm) { drill({ mun: lm.dataset.mun }); return; }
        var lp = e.target.closest('tr[data-pu]'); if (lp) { var pu = panelUnits[Number(lp.dataset.pu)]; if (pu && pu.f) drill(pu.f); return; }
        var pg = e.target.closest('[data-pg]'); if (pg && !pg.disabled) { st[pg.dataset.k] += Number(pg.dataset.pg); desenha(); }
      });
      root.addEventListener('input', function (e) { if (e.target.dataset && e.target.dataset.busca !== undefined) mostraBusca(e.target.value); });
      root.addEventListener('keydown', function (e) { if (e.target.dataset && e.target.dataset.busca !== undefined && e.key === 'Escape') { var b = $('[data-res]'); if (b) b.hidden = true; } });
      root.addEventListener('change', function (e) {
        if (e.target.dataset && e.target.dataset.f) { aplicaFiltro(e.target.dataset.f, e.target.value); return; }
        var c = e.target.dataset && e.target.dataset.c; if (!c) return;
        if (c === 'mun') { st.mun = e.target.value; st.pag = 0; }
        else if (c === 'ord') { st.ord = e.target.value; st.pag = 0; }
        else if (c === 'zero') { st.zero = e.target.checked; st.pag = 0; }
        else if (c === 'zsec') { st.zsec = e.target.checked; st.psec = 0; }
        desenha();
      });
    }
    return {
      mostrar: function () {
        root.hidden = false;
        if (!iniciado) { iniciado = true; montar(); eventos(); }
        desenha();
        if (mapa) setTimeout(function () { mapa.invalidateSize(); }, 60);
      },
      esconder: function () { root.hidden = true; }
    };
  }

  var paineis = {};
  var MODOS = modosIds;
  return {
    mostrar: function (ano) {
      Object.keys(MODOS).forEach(function (a) {
        var el = document.getElementById(MODOS[a]); if (!el) return;
        if (a !== ano) { if (paineis[a]) paineis[a].esconder(); else el.hidden = true; return; }
        if (!paineis[a]) paineis[a] = criaPainel(el, a === 'comparar' ? 'cmp' : (a === '2022' ? '2022' : '2026'));
        paineis[a].mostrar();
      });
    },
    esconder: function () { Object.keys(MODOS).forEach(function (a) { if (paineis[a]) paineis[a].esconder(); else { var el = document.getElementById(MODOS[a]); if (el) el.hidden = true; } }); }
  };
  }

  if (window.TCHE_2026) window.PainelEleicao = fabrica(window.TCHE_2026, { '2022': 'resultados2022', '2026': 'resultados2026', 'comparar': 'resultadosComparar' });
  if (window.FELIPE_2024) window.PainelFelipe = fabrica(window.FELIPE_2024, { '2024': 'resultadosFelipe' });
  if (window.GOVERNO_2026) window.PainelGoverno = fabrica(window.GOVERNO_2026, { '2026': 'resultadosGoverno' });

  /* abas de cargo/candidato dentro de Resultados: Deputado Estadual (Tchê), Vereador (Felipe Tchê) e Governo (Mailza Assis) */
  var cands = document.querySelectorAll('.cand-res');
  var CANDS = {
    tche: { el: 'cand-tche', painel: function () { return window.PainelEleicao; }, ano: null },
    felipe: { el: 'cand-felipe', painel: function () { return window.PainelFelipe; }, ano: '2024' },
    governo: { el: 'cand-governo', painel: function () { return window.PainelGoverno; }, ano: '2026' }
  };
  cands.forEach(function (b) {
    b.addEventListener('click', function () {
      var alvo = b.dataset.cand;
      cands.forEach(function (x) { var on = x === b; x.classList.toggle('ativa', on); x.setAttribute('aria-selected', String(on)); });
      Object.keys(CANDS).forEach(function (k) {
        var el = document.getElementById(CANDS[k].el), p = CANDS[k].painel();
        if (el) el.hidden = k !== alvo;
        if (k !== alvo && p) p.esconder();
      });
      var c = CANDS[alvo], p = c.painel();
      if (c.ano) { if (p) p.mostrar(c.ano); }
      else { var at = document.querySelector('.anos-resultados .ano-res.ativa'); if (at) at.click(); }
      window.dispatchEvent(new Event('resize'));
    });
  });
  // abre na aba marcada como ativa (Governo), depois que todos os scripts da página rodaram
  setTimeout(function () { var at = document.querySelector('.cand-res.ativa'); if (at) at.click(); }, 0);
})();
