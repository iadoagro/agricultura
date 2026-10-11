/* Resultados dos candidatos Tchê (Deputado Estadual José Luis Schafer, PDT 12123: painéis 2022, 2026 e comparativo 2022 × 2026)
   e Felipe Tchê (Vereador de Rio Branco, PP 11123: painel 2024). Mesmo nível de informação do dashboard de boletins de urna:
   resumo, mapa com detalhamento (município → zona → bairro → local → seção), tabelas por regional, município, zona, bairro,
   local de votação e seção. Dados: js/dados-tche-2026.js e js/dados-felipe-2024.js. A fábrica abaixo monta um painel por candidato. */
(function () {
  'use strict';
  function fabrica(D, modosIds) {
  var MUN = D.municipios, MAPA = D.mapa || (window.TCHE_2026 && window.TCHE_2026.mapa), COORDS = D.coords, LOCAIS = D.locais, E = D.estado, E22 = D.estado22, C = D.cand, RK = D.rk || {};
  function mapSec() { return D.secoes.map(function (a) { return { mun: a[0], zona: a[1], secao: a[2], local: a[3], apt: a[4], comp: a[5], q26: a[6], t: a[7], b: a[8], n: a[9], q22: a[10], lid: a[11], ok: a[12] ? 1 : 0, v2: a[13] || 0, masc: a[14] || 0, fem: a[15] || 0, pf: a[16] || null, c1: a[17] || null }; }); }
  var SEC = mapSec();
  var PAGE = 15, SEM_BAIRRO = '(sem bairro informado)';
  var RAMP = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026', '#6a0014'];
  var GANHO = ['#c6dbef', '#6baed6', '#08519c'], PERDA = ['#fdd0a2', '#fd8d3c', '#a63603'];
  var LV = { reg: 'Regional', mun: 'Município', zona: 'Zona', bairro: 'Bairro', local: 'Local de votação', sec: 'Seção' };
  // candidato de um município só (vereador): o "estado" dos textos passa a ser o município
  var MUNC = C.municipio || '', ANO = C.ano || 2026, TURNO = D.turno || 1;   // D.turno = 2 no 2º turno (aba Eleições)
  var NOESTADO = MUNC ? 'em ' + MUNC : 'no estado', TODOESTADO = MUNC ? 'Todo o município' : 'Todo o estado', ACRE = MUNC || 'Acre';
  var SEM_APTOS = !SEC.some(function (s) { return s.apt > 0; });
  var VIVO = !!D.aoVivo;   // 2º turno ao vivo (aba Eleições): progresso da apuração, cor por candidato/métrica, unidades concluídas
  var ABAS = [['resumo', 'Resumo'], ['mapa', 'Principal'], ['reg', 'Regional'], ['mun', 'Município'], ['zona', 'Zona'], ['bairro', 'Bairro'], ['local', 'Local de votação'], ['sec', 'Seção'], ['exportar', 'Exportar']]
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
  var _UR = {};   // cache de unitRows por nível+filtro; é zerado quando os dados mudam (atualizar)
  function unitRows(lv, F) {
    F = typeof F === 'string' ? { mun: F } : (F || {});
    var chaveUR = lv + '|' + JSON.stringify(F);
    if (_UR[chaveUR]) return _UR[chaveUR].slice();
    var res = unitRowsCalc(lv, F);
    _UR[chaveUR] = res;
    return res.slice();
  }
  function unitRowsCalc(lv, F) {
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
      var o = U[k] = U[k] || { k: k, f: f, lab: lab, ctx: ctx, n: 0, c26: 0, c22: 0, q26: 0, q22: 0, t: 0, b: 0, nn: 0, apt: 0, comp: 0, la: 0, lo: 0, w: 0, ok: 0, v2: 0, masc: 0, fem: 0, aptOk: 0, compOk: 0, pf: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pfOk: 0, t1: [0, 0, 0, 0, 0], t1n: 0, muns: new Set() };
      o.muns.add(s.mun);
      var cc = COORDS[s.mun + '|' + s.zona + '|' + s.local];
      if (cc) {
        var la = cc[0], lo = cc[1];
        if (lv === 'sec') { var kk = s.mun + '|' + s.zona + '|' + s.local, i = (JC[kk] = (JC[kk] || 0) + 1) - 1; if (i) { var r = 0.00012 * Math.sqrt(i), an = i * 2.4; la += r * Math.sin(an); lo += r * Math.cos(an); } }
        o.la += la; o.lo += lo; o.w++;
      }
      o.n++; o.apt += s.apt; o.comp += s.comp; o.q26 += s.q26; o.q22 += s.q22; o.t += s.t; o.b += s.b; o.nn += s.n;
      o.ok += s.ok; o.v2 += s.v2; o.masc += s.masc; o.fem += s.fem; if (s.ok) { o.aptOk += s.apt; o.compOk += s.comp; }
      if (s.pf) { for (var pi = 0; pi < 10; pi++) o.pf[pi] += s.pf[pi]; if (s.ok) o.pfOk += s.pf[0]; }
      if (s.ok && s.c1) { for (var ci = 0; ci < 5; ci++) o.t1[ci] += s.c1[ci]; o.t1n++; }   // 1º turno nas MESMAS seções já apuradas no 2º
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
    if (VIVO) { st.vm = 'lider'; st.ord = 'nome'; st.zero = true; st.zsec = true; st.aba = 'mapa'; }   // abre direto no mapa
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
      var tit = cmp ? 'Comparativo 2022 × 2026' : (a22 ? 'Eleição 2022' : 'Eleição ' + ANO + ' · ' + TURNO + 'º turno');
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
        '<section class="t26-kpis">' + kp + '</section>' + (VIVO && !cmp ? barraGeral() : '') +
        (cmp ? '<p class="t26-sub t26-nota">As seções de 2022 foram associadas às de 2026 pelo município, zona e número da seção (inclusive seções agregadas). ' + (E22.q - E22.qMapeado) + ' voto(s) de 2022 ficaram sem seção correspondente e não entram nas unidades.</p>' : '') +
        '<div class="t26-abas" role="tablist"><div class="t26-abas-lista">' + abasVisiveis().map(function (a) { return '<button type="button" role="tab" data-t26="' + a[0] + '" aria-selected="' + (a[0] === st.aba) + '">' + a[1] + '</button>'; }).join('') + '</div>' + (VIVO && !cmp ? '<div class="t26-abas-acoes">' : '') +
          (VIVO && !cmp ? '<button type="button" class="t26-fx' + (st.fx ? ' ativo' : '') + '" data-fx aria-expanded="' + (!!st.fx) + '"' + (st.aba === 'mapa' ? '' : ' hidden') + ' title="Mostrar ou esconder o filtro Detalhar por">⚙ Filtros ' + (st.fx ? '▴' : '▾') + '</button>' : '') +
          (VIVO && !cmp ? '<button type="button" class="t26-apres' + (st.apres ? ' ativo' : '') + '" data-apres title="Alterna sozinho entre as abas e volta à Principal a cada atualização">' + (st.apres ? '⏸ Parar apresentação' : '▶ Modo apresentação') + '</button><button type="button" class="t26-fsbr" data-fsbr title="Tela cheia (igual ao F11)">⛶ Tela cheia</button></div>' : '') + '</div>' +
        '<div class="t26-corpo"></div>';
    }
    /* ----- modo apresentação: alterna sozinho entre as abas; a cada atualização volta à Principal ----- */
    var apresTimer = null, APRES_MS = 10000, apresRetorno = null;   // 10 s por aba; apresRetorno = aba interrompida por uma atualização
    function apresUI() {
      var b = root.querySelector('[data-apres]');
      if (b) { b.classList.toggle('ativo', !!st.apres); b.textContent = st.apres ? '⏸ Parar apresentação' : '▶ Modo apresentação'; }
    }
    function apresProxima() {
      var l = abasVisiveis().map(function (a) { return a[0]; }).filter(function (k) { return k !== 'exportar'; });
      if (!l.length) return;
      if (apresRetorno && l.indexOf(apresRetorno) >= 0) { st.aba = apresRetorno; apresRetorno = null; }   // depois da Principal, volta de onde estava
      else { apresRetorno = null; st.aba = l[(Math.max(0, l.indexOf(st.aba)) + 1) % l.length]; }
      st.pag = 0; st.psec = 0;
      desenha();
    }
    function apresAgenda() {
      clearInterval(apresTimer); apresTimer = null;
      if (st.apres) apresTimer = setInterval(function () { if (root.hidden) return; apresProxima(); }, APRES_MS);
    }
    function apresAlternar() { st.apres = !st.apres; apresRetorno = null; apresAgenda(); apresUI(); }
    function marcaAba() {
      root.querySelectorAll('[data-t26]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.t26 === st.aba)); });
      var fx = root.querySelector('[data-fx]');
      if (fx) { fx.hidden = st.aba !== 'mapa'; fx.classList.toggle('ativo', !!st.fx); fx.setAttribute('aria-expanded', String(!!st.fx)); fx.textContent = '⚙ Filtros ' + (st.fx ? '▴' : '▾'); }
    }

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
      var cardCands = D.candidatos ? '<div class="t26-card"><h3>Candidatos a ' + esc(C.cargo.toLowerCase()) + ' — ' + TURNO + 'º turno</h3>' + barras(D.candidatos.map(function (x) { return { q: x.votos, l: '<b>' + esc(cap(x.num === C.numero ? C.nome : x.nome)) + '</b> <small>nº ' + x.num + '</small>', t: x.nome, txt: fmt(x.votos) + pspan(pc(x.votos, E.validos)), neg: x.num !== C.numero }; }), D.candidatos[0].votos) + '<p class="t26-sub">Percentuais sobre os ' + fmt(E.validos) + ' votos válidos (sem brancos e nulos).</p></div>' : '';
      return cardCands + '<div class="t26-duas"><div class="t26-card"><h3>Resumo da votação</h3><div class="t26-lista">' + linhas2.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div></div>' +
        (MUNC ? '<div class="t26-card"><h3>Votos por zona</h3>' + barras(top('zona', 10), Math.max.apply(null, R.zona.map(function (r) { return Q(r); }).concat([1]))) + '</div></div>' +
          '<div class="t26-duas">' + bl('10 maiores bairros', 'bairro') + bl('10 maiores locais de votação', 'local') + '</div>' +
          '<div class="t26-duas">' + bl('10 maiores seções', 'sec') + '</div>'
        : '<div class="t26-card"><h3>Votos por regional</h3>' + barras(top('reg', 10), mxR) + '</div></div>' +
          '<div class="t26-duas">' + bl('10 maiores municípios', 'mun') + bl('10 maiores bairros', 'bairro') + '</div>' +
          '<div class="t26-duas">' + bl('10 maiores locais de votação', 'local') + bl('10 maiores seções', 'sec') + '</div>');
    }

    /* ----- apuração ao vivo (2º turno): progresso por unidade, cor por candidato/métrica e "apurado" ----- */
    var COR1 = '#d81b60', COR2 = '#1f63d6', CINZA = '#c9ced6', VERDE = '#0b6b3a';
    function rivalNome() { var c = (D.candidatos || []).filter(function (x) { return x.num === (D.rival || 10); })[0]; return c ? cap(c.nome) : 'Adversário'; }
    function temPerfil() { return SEC.some(function (s) { return s.pf && s.pf[0] > 0; }); }
    var PFI = { jovem: 1, idoso: 4, superior: 5, baixaesc: 6, bio: 7, def: 8, facult: 9 };
    function temGenero() { return SEC.some(function (s) { return s.masc + s.fem > 0; }); }
    function metsVivo() {
      var m = [['lider', 'Quem lidera (cor do candidato)'], ['apur', '% de seções apuradas'], ['p1', '% de ' + cap(C.nome) + ' (válidos)'], ['p2', '% de ' + rivalNome() + ' (válidos)'], ['abst', '% de abstenção'], ['brancos', '% de votos em branco'], ['nulos', '% de votos nulos']];
      if (temGenero()) m.push(['fem', '% de eleitoras (mulheres)'], ['masc', '% de eleitores (homens)']);
      if (temPerfil()) m.push(['jovem', '% de jovens (16 a 24 anos)'], ['idoso', '% de idosos (60+ anos)'], ['superior', '% com ensino superior'], ['baixaesc', '% até fundamental incompleto'], ['bio', '% com biometria'], ['def', '% com deficiência'], ['facult', '% de voto facultativo']);
      return m;
    }
    function nomeMet(m) { var x = metsVivo().filter(function (a) { return a[0] === m; })[0]; return x ? x[1] : m; }
    function validosU(u) { return u.t - u.b - u.nn; }
    function vmVal(u, m) {
      var v = validosU(u);
      switch (m) {
        case 'apur': return u.n ? u.ok / u.n * 100 : null;
        case 'p1': return u.ok && v > 0 ? u.q26 / v * 100 : null;
        case 'p2': return u.ok && v > 0 ? u.v2 / v * 100 : null;
        case 'abst': return u.aptOk > 0 ? (u.aptOk - u.compOk) / u.aptOk * 100 : null;
        case 'brancos': return u.t > 0 ? u.b / u.t * 100 : null;
        case 'nulos': return u.t > 0 ? u.nn / u.t * 100 : null;
        case 'fem': return u.masc + u.fem > 0 ? u.fem / (u.masc + u.fem) * 100 : null;
        case 'masc': return u.masc + u.fem > 0 ? u.masc / (u.masc + u.fem) * 100 : null;
        default: if (PFI[m] != null && u.pf && u.pf[0] > 0) return u.pf[PFI[m]] / u.pf[0] * 100;
      }
      return null;
    }
    function pf(x) { return x == null ? '–' : x.toFixed(1).replace('.', ',') + '%'; }
    var PAL = { apur: ['#e5f4ea', '#a8dbb7', '#5cb97a', '#2a8c4c', '#0d5c2e'], p1: ['#fde3ee', '#f8b4cf', '#ee7fab', '#e0488a', '#ad1457'], p2: ['#dde9fb', '#aac7f3', '#6f9ee6', '#3a77d8', '#154ea8'],
      abst: ['#ece6f7', '#cdbfec', '#a994dc', '#7e5fc6', '#53359c'], brancos: ['#eef0f3', '#d3d8df', '#adb5c1', '#7f8a9a', '#4b5563'], nulos: ['#fbe3e0', '#f5b8b1', '#ec867c', '#d9534a', '#a32a22'],
      jovem: ['#fff4d6', '#fde39a', '#f9c94d', '#e8a317', '#a86f00'], idoso: ['#efe9e2', '#d7c9b8', '#b9a58b', '#8f7857', '#5c4a30'], superior: ['#e3f0ff', '#b9d6fa', '#82b4f0', '#4a8ee0', '#1c5fb8'],
      baixaesc: ['#fdebe0', '#f9c9ab', '#f3a26f', '#e57a3a', '#b8501a'], bio: ['#e4f6ee', '#b6e5cf', '#7ccfa7', '#3fb27f', '#16805a'], def: ['#eae8fb', '#c8c3f4', '#a29aea', '#766be0', '#4a3fc4'], facult: ['#f6f0e0', '#e8d9a8', '#d6bd6a', '#b99a30', '#7d6616'],
      fem: ['#f1e6fb', '#d9bef2', '#b98ae6', '#8f55d1', '#5e2b9c'], masc: ['#e0f5f2', '#a8e0d8', '#5fc4b7', '#2a9d8f', '#146b61'] };
    function escalaVivo(m, us) {
      if (m === 'lider') {
        var A = ['#f8c8dc', '#f08fb5', '#e0508a', '#ad1457'], B = ['#c4d8f6', '#86b0ec', '#3f7fdc', '#154ea8'], LIM = [5, 15, 30];
        var cl = function (d) { return d < LIM[0] ? 0 : d < LIM[1] ? 1 : d < LIM[2] ? 2 : 3; };
        var info = function (u) { var v = validosU(u); if (!u.ok || v <= 0) return null; return (u.q26 - u.v2) / v * 100; };
        return {
          corU: function (u) { var d = info(u); return d == null ? CINZA : d === 0 ? '#9aa3b2' : d > 0 ? A[cl(d)] : B[cl(-d)]; }, titulo: 'quem lidera',
          rows: function () {
            var cA = [0, 0, 0, 0], cB = [0, 0, 0, 0], emp = 0, ag = 0;
            us.forEach(function (u) { var d = info(u); if (d == null) ag++; else if (d === 0) emp++; else if (d > 0) cA[cl(d)]++; else cB[cl(-d)]++; });
            var nA = cap(C.nome), nB = rivalNome(), fx = ['até 5 pts', '5 a 15 pts', '15 a 30 pts', 'mais de 30 pts'], o = [];
            for (var i = 3; i >= 0; i--) o.push({ cor: A[i], txt: nA + ' +' + fx[i], n: cA[i] });
            for (var j = 0; j < 4; j++) o.push({ cor: B[j], txt: nB + ' +' + fx[j], n: cB[j] });
            o.push({ cor: '#9aa3b2', txt: 'empate', n: emp }, { cor: CINZA, txt: 'aguardando apuração', n: ag });
            return o;
          }
        };
      }
      var vals = us.map(function (u) { return vmVal(u, m); }), ok = vals.filter(function (x) { return x != null; });
      var mn = ok.length ? Math.min.apply(null, ok) : 0, mx = ok.length ? Math.max.apply(null, ok) : 0, passo = (mx - mn) / 5 || 1, P = PAL[m] || PAL.apur;
      var bin = function (x) { return Math.min(4, Math.floor((x - mn) / passo)); };
      return {
        corU: function (u) { var x = vmVal(u, m); return x == null ? CINZA : P[bin(x)]; }, titulo: nomeMet(m),
        rows: function () {
          var c = [0, 0, 0, 0, 0], ag = 0, o = [];
          vals.forEach(function (x) { if (x == null) ag++; else c[bin(x)]++; });
          for (var i = 0; i < 5; i++) o.push({ cor: P[i], txt: pf(mn + passo * i) + ' a ' + pf(i === 4 ? mx : mn + passo * (i + 1)), n: c[i] });
          o.push({ cor: CINZA, txt: 'sem dados / aguardando', n: ag });
          return o;
        }
      };
    }
    function fim(u) { return u.n > 0 && u.ok === u.n; }
    function apBar(u) {
      var p = u.n ? u.ok / u.n * 100 : 0, f = fim(u);
      return '<span class="t26-ap' + (f ? ' fim' : '') + '" title="' + u.ok + ' de ' + u.n + ' seções apuradas"><span class="t26-apb"><i style="width:' + p.toFixed(1) + '%"></i></span><b>' + (f ? '✓ 100%' : p.toFixed(0) + '%') + '</b><small>' + fmt(u.ok) + '/' + fmt(u.n) + '</small></span>';
    }
    function statTag(u) { return fim(u) ? '<span class="t26-tag ok">✓ Apurado</span>' : !u.ok ? '<span class="t26-tag">Aguardando</span>' : '<span class="t26-tag apur">Apurando</span>'; }
    function liderTxt(u) {
      var v = validosU(u); if (!u.ok || v <= 0) return '<span class="t26-sub">—</span>';
      var d = (u.q26 - u.v2) / v * 100, n1 = cap(C.nome), n2 = rivalNome();
      if (d === 0) return '<span class="t26-ldot" style="background:#9aa3b2"></span>empate';
      return '<span class="t26-ldot" style="background:' + (d > 0 ? COR1 : COR2) + '"></span><b>' + esc(d > 0 ? n1 : n2) + '</b> <small class="t26-sub">+' + Math.abs(d).toFixed(1).replace('.', ',') + ' pts</small>';
    }
    function votosUV(u) {
      var v = validosU(u), p1 = u.ok && v > 0 ? u.q26 / v * 100 : null, p2 = u.ok && v > 0 ? u.v2 / v * 100 : null;
      return '<td class="n" style="color:' + COR1 + '"><b>' + fmt(u.q26) + '</b> <span class="t26-p">' + pf(p1) + '</span></td><td class="n" style="color:' + COR2 + '"><b>' + fmt(u.v2) + '</b> <span class="t26-p">' + pf(p2) + '</span></td>';
    }
    var TAXA_EST = null;   // comparecimento médio do estado nas seções apuradas (usado só na estimativa dos votos restantes)
    function restantesU(u) {
      if (fim(u)) return 0;
      var ap = u.pf && u.pf[0] > 0 ? u.pf[0] - u.pfOk : 0;
      if (!ap) return null;
      var taxa = u.aptOk > 0 ? u.compOk / u.aptOk : (TAXA_EST != null ? TAXA_EST : 0.78);
      return Math.round(ap * taxa);
    }
    var NESTE = { reg: 'nesta regional', mun: 'neste município', zona: 'nesta zona', bairro: 'neste bairro', local: 'neste local de votação', sec: 'nesta seção' };
    // "tem como virar?": só é irreversível quando a diferença supera todos os votos que ainda podem entrar (eleitores das seções não apuradas)
    function viraU(u, lv) {
      var v = validosU(u), onde = (lv && NESTE[lv]) || 'aqui', n1 = esc(cap(C.nome)), n2 = esc(rivalNome());
      if (!u.ok || v <= 0 || u.q26 === u.v2) return { def: false, txt: 'Ainda tem como virar' };
      var lid = u.q26 > u.v2 ? n1 : n2, dif = Math.abs(u.q26 - u.v2);
      if (fim(u)) return { def: true, txt: 'Resultado final: ' + lid + ' ganhou ' + onde };
      var rest = u.pf && u.pf[0] > 0 ? u.pf[0] - u.pfOk : null;
      if (rest != null && dif > rest) return { def: true, txt: 'Não tem como virar: ' + lid + ' já ganhou ' + onde };
      return { def: false, txt: 'Ainda tem como virar' };
    }
    var ESTE = { reg: 'Esta regional', mun: 'Este município', zona: 'Esta zona', bairro: 'Este bairro', local: 'Este local de votação', sec: 'Esta seção' };
    function tipVivo(u, lv) {
      var m0 = Array.from(u.muns)[0], v = validosU(u), n1 = esc(cap(C.nome)), n2 = esc(rivalNome());
      if (TAXA_EST == null) { var te = totalEstado(); TAXA_EST = te.aptOk > 0 ? te.compOk / te.aptOk : null; }
      var h = '<div class="t26-tt"><b>' + (lv === 'reg' ? '' : LV[lv] + ': ') + u.lab + '</b>' + (u.ctx ? '<br><small>' + u.ctx + '</small>' : '') + (m0 && lv !== 'reg' && !MUNC ? '<br><small>Regional ' + esc(regionOf(m0)) + '</small>' : '');
      // quem este nível está elegendo
      var q;
      if (!u.ok || v <= 0) q = '<span class="t26-tt-ld">' + (ESTE[lv] || 'Esta unidade') + ' ainda não tem votos apurados</span>';
      else if (u.q26 === u.v2) q = '<span class="t26-tt-ld">' + (ESTE[lv] || 'Esta unidade') + ' está <b>empatad' + (lv === 'mun' || lv === 'bairro' || lv === 'local' ? 'o' : 'a') + '</b></span>';
      else { var g = u.q26 > u.v2; q = '<span class="t26-tt-ld" style="border-left-color:' + (g ? COR1 : COR2) + '">' + (ESTE[lv] || 'Esta unidade') + ' ' + (fim(u) ? 'elegeu' : 'está elegendo') + ' <b style="color:' + (g ? COR1 : COR2) + '">' + (g ? n1 : n2) + '</b> <small>(+' + fmt(Math.abs(u.q26 - u.v2)) + ' votos)</small></span>'; }
      h += '<div>' + q + '</div>';
      // candidatos
      if (u.ok) {
        h += '<div class="t26-tt-c"><span style="color:' + COR1 + '"><b>' + n1 + '</b></span><span>' + fmt(u.q26) + ' votos · <b>' + pf(vmVal(u, 'p1')) + '</b></span></div>' +
          '<div class="t26-tt-c"><span style="color:' + COR2 + '"><b>' + n2 + '</b></span><span>' + fmt(u.v2) + ' votos · <b>' + pf(vmVal(u, 'p2')) + '</b></span></div>';
      }
      // totais
      var rest = restantesU(u), abst = u.aptOk - u.compOk;
      h += '<div class="t26-tt-g">' +
        '<div><span>Votos apurados</span><b>' + fmt(u.t) + '</b></div>' +
        '<div><span>Votos restantes' + (rest ? ' (estim.)' : '') + '</span><b>' + (rest == null ? '–' : rest ? '≈ ' + fmt(rest) : '0') + '</b></div>' +
        '<div><span>Brancos</span><b>' + fmt(u.b) + ' <small>' + pf(vmVal(u, 'brancos')) + '</small></b></div>' +
        '<div><span>Nulos</span><b>' + fmt(u.nn) + ' <small>' + pf(vmVal(u, 'nulos')) + '</small></b></div>' +
        '<div><span>Abstenções</span><b>' + (u.aptOk ? fmt(abst) + ' <small>' + pf(vmVal(u, 'abst')) + '</small>' : '–') + '</b></div>' +
        '<div><span>Seções apuradas</span><b>' + fmt(u.ok) + '/' + fmt(u.n) + ' <small>' + pf(u.n ? u.ok / u.n * 100 : 0) + '</small></b></div></div>';
      var cu = cmpU(u);
      if (cu) h += '<div class="t26-tt-cmp"><b>1º turno → 2º turno</b> <small>(mesmas seções)</small><br><span style="color:' + COR1 + '">' + n1 + ' ' + pf(cu.m1) + ' → <b>' + pf(cu.m2) + '</b> (' + dpts(cu.m1, cu.m2) + ')</span><br><span style="color:' + COR2 + '">' + n2 + ' ' + pf(cu.a1) + ' → <b>' + pf(cu.a2) + '</b> (' + dpts(cu.a1, cu.a2) + ')</span></div>';
      var vr = viraU(u, lv);
      h += '<div class="t26-tt-vira' + (vr.def ? ' def' : '') + '">' + (vr.def ? '✔ ' : '⟳ ') + vr.txt + '</div>';
      if (fim(u)) h += '<div class="t26-tt-fim">✓ apuração concluída</div>';
      if (u.masc + u.fem > 0) h += '<small class="t26-tt-pf">Eleitorado: ' + pf(vmVal(u, 'fem')) + ' mulheres · ' + pf(vmVal(u, 'masc')) + ' homens</small>';
      return h + '</div>';
    }
    function linhasVivo(o) {
      var L2 = [['Seções apuradas', apBar(o) + ' ' + statTag(o)]], cc = cmpU(o);
      if (cc) L2.push(['1º → 2º turno (mesmas seções)', cmpCelula(cc)]);
      var vi = viraU(o, null);
      L2.push(['Tem como virar?', '<span class="t26-vira' + (vi.def ? ' def' : '') + '">' + vi.txt + '</span>']);
      if (o.ok) {
        L2.push([esc(cap(C.nome)), '<span style="color:' + COR1 + '"><b>' + fmt(o.q26) + '</b> <span class="t26-p">' + pf(vmVal(o, 'p1')) + '</span></span>'], [esc(rivalNome()), '<span style="color:' + COR2 + '"><b>' + fmt(o.v2) + '</b> <span class="t26-p">' + pf(vmVal(o, 'p2')) + '</span></span>'],
          ['Quem lidera', liderTxt(o)], ['Abstenção (seções apuradas)', pf(vmVal(o, 'abst')) + ' <small class="t26-sub">' + fmt(o.aptOk - o.compOk) + ' de ' + fmt(o.aptOk) + '</small>'],
          ['Votos em branco / nulos', fmt(o.b) + ' (' + pf(vmVal(o, 'brancos')) + ') / ' + fmt(o.nn) + ' (' + pf(vmVal(o, 'nulos')) + ')']);
      }
      if (o.masc + o.fem > 0) L2.push(['Eleitorado: mulheres / homens', pf(vmVal(o, 'fem')) + ' / ' + pf(vmVal(o, 'masc')) + ' <small class="t26-sub">' + fmt(o.fem) + ' / ' + fmt(o.masc) + '</small>']);
      if (o.pf && o.pf[0] > 0) L2.push(['Eleitorado: 16–24 anos / 60+', pf(vmVal(o, 'jovem')) + ' / ' + pf(vmVal(o, 'idoso'))], ['Eleitorado: superior / até fund. incompleto', pf(vmVal(o, 'superior')) + ' / ' + pf(vmVal(o, 'baixaesc'))], ['Eleitorado: biometria / facultativo', pf(vmVal(o, 'bio')) + ' / ' + pf(vmVal(o, 'facult'))]);
      return L2;
    }
    function barraGeral() {
      var ok = SEC.filter(function (s) { return s.ok; }).length, n = SEC.length, f = n > 0 && ok === n, p = n ? ok / n * 100 : 0;
      return '<div class="t26-vgeral' + (f ? ' fim' : '') + '"><div class="t26-vg-top"><b>Apuração geral' + (f ? ' — ✓ concluída' : '') + '</b><span>' + fmt(ok) + ' de ' + fmt(n) + ' seções · ' + pf(p) + '</span></div>' +
        '<div class="t26-vg-bar"><i style="width:' + p.toFixed(2) + '%"></i></div>' + (f ? '' : '<small class="t26-sub">A aba Exportar (PDF e slides) aparece quando a apuração terminar.</small>') + '</div>';
    }
    var NOMES_NIVEL = { reg: 'Regionais', mun: 'Municípios', zona: 'Zonas', bairro: 'Bairros', local: 'Locais de votação', sec: 'Seções' };
    function contagemNiveis() {
      return ['reg', 'mun', 'zona', 'bairro', 'local', 'sec'].filter(function (l) { return !(MUNC && (l === 'reg' || l === 'mun')); }).map(function (l) {
        var us = unitRows(l, {}), f = us.filter(fim).length, ap = us.filter(function (u) { return u.ok > 0 && !fim(u); }).length;
        return { l: l, n: us.length, f: f, ap: ap };
      });
    }
    /* resultado × perfil do eleitorado das seções (o voto é secreto: não existe "voto por sexo"; compara seções) */
    var DIMS = [['fem', 'Mais mulheres', 'seções com maior % de eleitoras'], ['masc', 'Mais homens', 'seções com maior % de eleitores homens'], ['jovem', 'Mais jovens (16–24)', ''], ['idoso', 'Mais idosos (60+)', ''], ['superior', 'Mais ensino superior', ''], ['baixaesc', 'Menos escolaridade (até fund. incompleto)', '']];
    function shareSec(s, m) {
      if (m === 'fem') return s.masc + s.fem > 0 ? s.fem / (s.masc + s.fem) * 100 : null;
      if (m === 'masc') return s.masc + s.fem > 0 ? s.masc / (s.masc + s.fem) * 100 : null;
      return s.pf && s.pf[0] > 0 && PFI[m] != null ? s.pf[PFI[m]] / s.pf[0] * 100 : null;
    }
    function perfilGrupos(m) {
      var it = SEC.filter(function (s) { return s.ok && (s.t - s.b - s.n) > 0; }).map(function (s) { return { sh: shareSec(s, m), q: s.q26, v: s.v2, val: s.t - s.b - s.n }; })
        .filter(function (x) { return x.sh != null; }).sort(function (a, b) { return a.sh - b.sh; });
      if (it.length < 9) return null;
      var n = it.length, nomes3 = ['Menor %', '% intermediário', 'Maior %'];
      return [0, 1, 2].map(function (g) {
        var sl = it.slice(Math.floor(g * n / 3), Math.floor((g + 1) * n / 3)), a = sl.reduce(function (r, x) { r.q += x.q; r.v += x.v; r.val += x.val; return r; }, { q: 0, v: 0, val: 0 });
        return { nome: nomes3[g], n: sl.length, de: sl[0].sh, ate: sl[sl.length - 1].sh, p1: a.val ? a.q / a.val * 100 : 0, p2: a.val ? a.v / a.val * 100 : 0, q: a.q, v: a.v };
      });
    }
    function perfilCard() {
      if (!temGenero() && !temPerfil()) return '';
      var linhas = DIMS.filter(function (d) { return d[0] === 'fem' || d[0] === 'masc' ? temGenero() : temPerfil(); }).map(function (d) {
        var g = perfilGrupos(d[0]), tit = nomeMet(d[0]).replace(/^% de /, '').replace(/^% /, '');
        if (!g) return '<tr><td colspan="6"><b>' + esc(d[1]) + '</b> <span class="t26-sub">— aguardando mais seções apuradas</span></td></tr>';
        return g.map(function (x, i) {
          return '<tr>' + (i === 0 ? '<td rowspan="3"><b>' + esc(d[1]) + '</b></td>' : '') + '<td>' + x.nome + ' <small class="t26-sub">(' + pf(x.de) + ' a ' + pf(x.ate) + ')</small></td><td class="n">' + fmt(x.n) + '</td>' +
            '<td class="n" style="color:' + COR1 + '"><b>' + pf(x.p1) + '</b> <small class="t26-sub">' + fmt(x.q) + '</small></td><td class="n" style="color:' + COR2 + '"><b>' + pf(x.p2) + '</b> <small class="t26-sub">' + fmt(x.v) + '</small></td>' +
            '<td><span class="t26-duelo t26-mini"><i style="width:' + x.p1.toFixed(1) + '%;background:' + COR1 + '"></i><i style="width:' + x.p2.toFixed(1) + '%;background:' + COR2 + '"></i></span></td></tr>';
        }).join('');
      }).join('');
      return '<div class="t26-card"><h3>Resultado × perfil do eleitorado das seções</h3><p class="t26-sub">O voto é secreto — não existe contagem de votos por sexo. Aqui as seções apuradas são divididas em 3 grupos do mesmo tamanho conforme o perfil do eleitorado de cada uma, e comparamos o resultado de cada grupo (percentual sobre os votos válidos).</p>' +
        '<div class="t26-tab"><table><thead><tr><th>Perfil</th><th>Grupo de seções</th><th class="n">Seções</th><th class="n" style="color:' + COR1 + '">' + esc(cap(C.nome)) + '</th><th class="n" style="color:' + COR2 + '">' + esc(rivalNome()) + '</th><th>Disputa</th></tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
    }
    /* histórico passo a passo + leitura da eleição (baseados na ordem em que as urnas foram apuradas) */
    function histVivo() {
      var h = (D.vivo && D.vivo.historico) || { eventos: [] }, ev = h.eventos.slice();
      if (st.hinv) ev.reverse();
      var cor = function (c) { return c === 1 ? COR1 : c === 2 ? COR2 : '#98a2b3'; };
      var ico = { inicio: '▶', lider: '⇄', margem: '▲', marco: '◔', concluida: '✓', fim: '🏁' };
      var lista = ev.length ? '<ol class="t26-hist">' + ev.map(function (e) {
        return '<li class="t26-he t26-he-' + e.tipo + '" style="--c:' + cor(e.cor) + '"><span class="t26-he-ico">' + (ico[e.tipo] || '•') + '</span><div><div class="t26-he-top"><b>' + esc(e.titulo) + '</b><small>' + esc(e.hora) + ' · ' + pf(e.pct) + ' apurado</small></div><p>' + esc(e.detalhe) + '</p></div></li>';
      }).join('') + '</ol>' : '<p class="t26-sub">O histórico começa assim que a primeira urna for apurada: aqui aparecem, em ordem, quem abriu na frente, cada mudança de liderança, os marcos de vantagem e as unidades que fecharam.</p>';
      return '<div class="t26-card"><div class="t26-topo"><h3>Histórico da apuração — passo a passo</h3><label class="t26-sub"><input type="checkbox" data-c="hinv"' + (st.hinv ? ' checked' : '') + '> mais recentes primeiro</label></div>' +
        '<p class="t26-sub">Cada linha é um momento da apuração, na ordem em que as urnas chegaram: ' + fmt(ev.length) + ' ' + (ev.length === 1 ? 'evento' : 'eventos') + ' até agora.</p>' + lista + '</div>';
    }
    function nomeLista(arr) { return arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1]; }
    function analiseVivo() {
      var h = (D.vivo && D.vivo.historico) || null, regs = unitRows('reg', {}), mus = unitRows('mun', {});
      var tot = regs.reduce(function (a, u) { a.q += u.q26; a.v += u.v2; a.t += u.t; a.b += u.b; a.nn += u.nn; a.ok += u.ok; a.n += u.n; a.ap += u.aptOk; a.cp += u.compOk; return a; }, { q: 0, v: 0, t: 0, b: 0, nn: 0, ok: 0, n: 0, ap: 0, cp: 0 });
      var n1 = esc(cap(C.nome)), n2 = esc(rivalNome()), vv = tot.t - tot.b - tot.nn, completa = tot.n > 0 && tot.ok === tot.n;
      if (!tot.ok || vv <= 0) return '<div class="t26-card"><h3>Como está sendo a eleição</h3><p class="t26-sub">Assim que as primeiras urnas forem apuradas, esta seção passa a explicar — com base no histórico acima — quem está na frente, como a vantagem foi construída, onde cada candidato é mais forte e o que ainda falta apurar.</p></div>';
      var p1 = tot.q / vv * 100, p2 = tot.v / vv * 100, sal = tot.q - tot.v, lid = sal === 0 ? '' : sal > 0 ? n1 : n2, per = sal > 0 ? n2 : n1, pr = pf(tot.ok / tot.n * 100);
      var par = [];
      // 1) situação
      if (completa) par.push('<b>Resultado final.</b> Com 100% das seções apuradas, ' + (lid ? '<b>' + lid + '</b> ' + (sal > 0 ? 'foi eleita' : 'foi eleito') + ' governador' + (sal > 0 ? 'a' : '') + ' do Acre com <b>' + pf(Math.max(p1, p2)) + '</b> dos votos válidos (' + fmt(Math.max(tot.q, tot.v)) + ' votos), contra ' + pf(Math.min(p1, p2)) + ' (' + fmt(Math.min(tot.q, tot.v)) + ') de ' + per + ' — diferença de <b>' + fmt(Math.abs(sal)) + '</b> votos.' : 'terminou empatado.'));
      else par.push('<b>Situação.</b> Com <b>' + pr + '</b> das seções apuradas (' + fmt(tot.ok) + ' de ' + fmt(tot.n) + '), ' + (lid ? '<b>' + lid + '</b> está na frente com <b>' + pf(Math.max(p1, p2)) + '</b> dos votos válidos (' + fmt(Math.max(tot.q, tot.v)) + ' votos), contra ' + pf(Math.min(p1, p2)) + ' (' + fmt(Math.min(tot.q, tot.v)) + ') de ' + per + ' — diferença de <b>' + fmt(Math.abs(sal)) + '</b> votos.' : 'a disputa está empatada.'));
      // 2) trajetória (histórico)
      if (h && h.eventos && h.eventos.length) {
        var ini = h.eventos[0], lc = h.mudancas, mx = h.maior;
        par.push('<b>Trajetória.</b> ' + esc(ini.cor === 1 ? cap(C.nome) : ini.cor === 2 ? rivalNome() : 'Ninguém') + ' abriu na frente na primeira urna (' + esc(ini.hora) + '). ' +
          (lc === 0 ? 'Desde então a liderança <b>não mudou</b>.' : 'A liderança <b>mudou ' + lc + (lc === 1 ? ' vez' : ' vezes') + '</b> ao longo da apuração.') +
          (mx && mx.v ? ' O maior saldo de uma única seção foi de <b>' + fmt(mx.v) + '</b> votos para ' + esc(mx.quem === 1 ? cap(C.nome) : rivalNome()) + ' (' + esc(mx.onde) + ').' : ''));
      }
      // 3) onde cada um é forte
      var venceReg = function (k) { return regs.filter(function (u) { return u.ok && (k === 1 ? u.q26 > u.v2 : u.v2 > u.q26); }).map(function (u) { return u.lab.replace(/^Regional /, ''); }); };
      var r1 = venceReg(1), r2 = venceReg(2), munV = function (k) { return mus.filter(function (u) { return u.ok && (k === 1 ? u.q26 > u.v2 : u.v2 > u.q26); }).length; };
      var saldoMun = mus.filter(function (u) { return u.ok; }).map(function (u) { return { lab: u.lab, s: u.q26 - u.v2 }; });
      var top1 = saldoMun.filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3), top2 = saldoMun.filter(function (x) { return x.s < 0; }).sort(function (a, b) { return a.s - b.s; }).slice(0, 3);
      par.push('<b>Onde cada um é forte.</b> ' + n1 + ' lidera em <b>' + munV(1) + '</b> municípios' + (r1.length ? ' e nas regionais ' + esc(nomeLista(r1)) : '') + '; ' + n2 + ' lidera em <b>' + munV(2) + '</b>' + (r2.length ? ' e nas regionais ' + esc(nomeLista(r2)) : '') + '.' +
        (top1.length ? ' Maiores saldos de ' + n1 + ': ' + top1.map(function (x) { return x.lab + ' (+' + fmt(x.s) + ')'; }).join(', ') + '.' : '') + (top2.length ? ' Maiores saldos de ' + n2 + ': ' + top2.map(function (x) { return x.lab + ' (+' + fmt(-x.s) + ')'; }).join(', ') + '.' : ''));
      // 4) participação
      par.push('<b>Participação.</b> Abstenção de <b>' + pf(tot.ap ? (tot.ap - tot.cp) / tot.ap * 100 : null) + '</b> nas seções apuradas; brancos <b>' + pf(tot.t ? tot.b / tot.t * 100 : null) + '</b> e nulos <b>' + pf(tot.t ? tot.nn / tot.t * 100 : null) + '</b> do total apurado.');
      // 5) perfil
      var dg = [['fem', 'seções com mais mulheres'], ['jovem', 'seções com mais jovens'], ['idoso', 'seções com mais idosos'], ['superior', 'seções com mais ensino superior']].map(function (d) {
        var g = perfilGrupos(d[0]); if (!g) return null; var dif = g[2].p1 - g[0].p1;
        return { t: d[1], dif: dif, a: Math.abs(dif) };
      }).filter(Boolean).sort(function (a, b) { return b.a - a.a; });
      if (dg.length && dg[0].a >= 0.5) par.push('<b>Perfil.</b> O perfil de seção que mais separa o resultado é “' + dg[0].t + '”: ' + n1 + ' tem <b>' + Math.abs(dg[0].dif).toFixed(1).replace('.', ',') + ' pontos ' + (dg[0].dif > 0 ? 'a mais' : 'a menos') + '</b> no terço com maior presença desse perfil do que no terço com menor presença (ver a tabela “Resultado × perfil”).');
      // 6) o que falta
      if (!completa) {
        var falta = tot.n - tot.ok, ap = SEC.filter(function (s) { return !s.ok && s.pf; }).reduce(function (a, s) { return a + s.pf[0]; }, 0), taxa = tot.ap ? tot.cp / tot.ap : 0.78;
        var restante = Math.round(ap * taxa * (tot.t ? vv / tot.t : 0.9)), proj1 = tot.q + restante * p1 / 100, proj2 = tot.v + restante * p2 / 100;
        par.push('<b>O que falta.</b> Restam <b>' + fmt(falta) + '</b> seções' + (ap ? ' (cerca de ' + fmt(ap) + ' eleitores aptos)' : '') + '. ' +
          (ap ? (Math.abs(sal) > ap ? '<b>Não tem como virar:</b> mesmo que todos os eleitores restantes votassem em ' + per + ', ' + lid + ' já ganhou. ' : '<b>Ainda tem como virar.</b> ') +
            'Se o restante repetir o desempenho atual, a projeção é ' + n1 + ' <b>' + pf(proj1 / (proj1 + proj2) * 100) + '</b> × <b>' + pf(proj2 / (proj1 + proj2) * 100) + '</b> ' + n2 + ' (cerca de ' + fmt(restante) + ' votos válidos ainda por apurar). <small class="t26-sub">Projeção simples: a ordem de chegada das urnas pode distorcer — as de cidades menores costumam chegar antes.</small>' : ''));
      }
      return '<div class="t26-card t26-analise"><h3>' + (completa ? 'Como foi a eleição' : 'Como está sendo a eleição') + '</h3><p class="t26-sub">Leitura automática baseada no histórico da apuração e nos números atuais.</p>' + par.map(function (x) { return '<p>' + x + '</p>'; }).join('') + '</div>';
    }
    /* abas de indicador (Abstenção, Brancos e nulos, Perfil do eleitorado) e Exportar só quando a apuração termina */
    var IND = { apur: { nome: 'Seções apuradas', mets: ['apur'] }, p1: { nome: '% do candidato 1', mets: ['p1'] }, p2: { nome: '% do candidato 2', mets: ['p2'] }, abst: { nome: 'Abstenção', mets: ['abst'] }, bn: { nome: 'Brancos e nulos', mets: ['brancos', 'nulos'] }, perfil: { nome: 'Perfil do eleitorado', mets: ['fem', 'masc', 'jovem', 'idoso', 'superior', 'baixaesc', 'bio', 'def', 'facult'] } };
    function apuracaoCompleta() { return SEC.length > 0 && SEC.every(function (s) { return s.ok; }); }
    function abasVisiveis() {
      var l = ABAS.slice();
      if (VIVO && !cmp) {
        // Mapa (nível regional) é a primeira aba e a que abre de cara
        var im = l.map(function (x) { return x[0]; }).indexOf('mapa');
        if (im > 0) l.unshift(l.splice(im, 1)[0]);
        var i = l.map(function (a) { return a[0]; }).indexOf('exportar');
        var novas = [['apur', 'Apuração'], ['p1', cap(C.nome).split(' ').slice(0, 2).join(' ')], ['p2', rivalNome().split(' ').slice(0, 2).join(' ')], ['abst', 'Abstenção'], ['bn', 'Brancos e nulos']];
        if (temGenero() || temPerfil()) novas.push(['perfil', 'Perfil do eleitorado']);
        if (i < 0) i = l.length;
        l.splice.apply(l, [i, 0].concat(novas));
        if (!apuracaoCompleta()) l = l.filter(function (a) { return a[0] !== 'exportar'; });
        // Resumo: sempre a última opção da lista
        var res = l.filter(function (a) { return a[0] === 'resumo'; })[0];
        l = l.filter(function (a) { return a[0] !== 'resumo'; });
        if (res) l.push(res);
      }
      return l;
    }
    function indicadorVivo(aba) {
      var def = IND[aba], tituloAba = aba === 'p1' ? '% de ' + cap(C.nome) + ' (votos válidos)' : aba === 'p2' ? '% de ' + rivalNome() + ' (votos válidos)' : def.nome, lv = st.indLv || 'mun', mets = def.mets.filter(function (m) { return metsVivo().some(function (a) { return a[0] === m; }); });
      var asc = st.indAsc, rows = unitRows(lv, ''), esc2 = escalaVivo(st.vm, rows), tot = totalEstado();
      var com = rows.filter(function (u) { return vmVal(u, st.vm) != null; });
      var lista = com.slice().sort(function (a, b) { var x = vmVal(a, st.vm), y = vmVal(b, st.vm); return (asc ? x - y : y - x) || a.lab.localeCompare(b.lab, 'pt-BR', { numeric: true }); });
      var pgs = Math.max(1, Math.ceil(lista.length / PAGE)); if (st.pag >= pgs) st.pag = pgs - 1;
      var pg = lista.slice(st.pag * PAGE, st.pag * PAGE + PAGE);
      var maior = lista.slice().sort(function (a, b) { return vmVal(b, st.vm) - vmVal(a, st.vm); })[0], menor = lista.slice().sort(function (a, b) { return vmVal(a, st.vm) - vmVal(b, st.vm); })[0];
      var k = kpi(nomeMet(st.vm).replace(/^% (de |com |até )?/, '').replace(/^./, function (c) { return c.toUpperCase(); }) + ' — Acre', pf(vmVal(tot, st.vm)), 'média de todo o estado') +
        kpi('Maior ' + LV[lv].toLowerCase(), maior ? pf(vmVal(maior, st.vm)) : '–', maior ? maior.lab : 'sem dados') + kpi('Menor ' + LV[lv].toLowerCase(), menor ? pf(vmVal(menor, st.vm)) : '–', menor ? menor.lab : 'sem dados') +
        kpi(LV[lv] + ' com dado', fmt(com.length) + ' de ' + fmt(rows.length), aba === 'perfil' ? 'perfil do eleitorado cadastrado' : 'só entram unidades com seção apurada');
      var lvOps = ['reg', 'mun', 'zona', 'bairro', 'local', 'sec'].filter(function (l) { return !(MUNC && (l === 'reg' || l === 'mun')); });
      var body = pg.map(function (u, i) {
        return '<tr class="' + (fim(u) ? 't26-fimrow' : '') + '"><td>' + (st.pag * PAGE + i + 1) + '</td><td><b>' + u.lab + '</b></td><td class="t26-sub">' + (u.ctx || '') + '</td><td><span class="t26-heat" style="background:' + esc2.corU(u) + '">' + pf(vmVal(u, st.vm)) + '</span></td>' +
          votosUV(u) + '<td>' + liderTxt(u) + '</td><td>' + apBar(u) + '</td></tr>';
      }).join('');
      return '<div class="t26-card"><div class="t26-topo"><h3>' + esc(tituloAba) + ' por ' + LV[lv].toLowerCase() + '</h3><div class="t26-ctl">' +
        (mets.length > 1 ? '<label>Indicador <select data-c="vm">' + mets.map(function (m) { return '<option value="' + m + '"' + (st.vm === m ? ' selected' : '') + '>' + esc(nomeMet(m)) + '</option>'; }).join('') + '</select></label>' : '') +
        '<label>Nível <select data-c="il">' + lvOps.map(function (l) { return '<option value="' + l + '"' + (lv === l ? ' selected' : '') + '>' + LV[l] + '</option>'; }).join('') + '</select></label>' +
        '<label>Ordem <select data-c="ia"><option value=""' + (asc ? '' : ' selected') + '>Maior → menor</option><option value="1"' + (asc ? ' selected' : '') + '>Menor → maior</option></select></label></div></div>' +
        '<div class="t26-nivel-grid"><div class="t26-nivel-mapa"><div class="t26-gm" data-gm></div></div><aside class="t26-nivel-info"><section class="t26-kpis">' + k + '</section></aside></div>' +
        '<div class="t26-tab"><table><thead><tr><th>#</th><th>' + LV[lv] + '</th><th>Localização</th><th>' + esc(nomeMet(st.vm)) + '</th><th class="n" style="color:' + COR1 + '">' + esc(cap(C.nome)) + '</th><th class="n" style="color:' + COR2 + '">' + esc(rivalNome()) + '</th><th>Quem lidera</th><th>Apuração</th></tr></thead><tbody>' +
        (body || '<tr><td colspan="8">Ainda sem dados: aguardando seções apuradas.</td></tr>') + '</tbody></table></div>' + pager(lista.length, pgs, 'pag') + '</div>' + (aba === 'perfil' ? perfilCard() : '');
    }
    /* comparativo 1º × 2º turno: aparece quando a unidade passa de 50% de apuração, sempre nas mesmas seções já apuradas */
    function cmpDe(t1, q, v2n, b, nn, aptOk, compOk, apuradas, total) {
      var v1 = t1[0] + t1[1] + t1[2], v2 = q + v2n;
      if (!(total > 0 && apuradas / total > 0.5) || v1 <= 0 || v2 <= 0) return null;
      var tt1 = v1 + t1[3] + t1[4];
      return { m1: t1[0] / v1 * 100, a1: t1[1] / v1 * 100, o1: t1[2] / v1 * 100, m2: q / v2 * 100, a2: v2n / v2 * 100, q1: t1, v1: v1,
        br1: tt1 ? t1[3] / tt1 * 100 : null, nu1: tt1 ? t1[4] / tt1 * 100 : null, comp1: aptOk ? tt1 / aptOk * 100 : null, comp2: aptOk ? compOk / aptOk * 100 : null };
    }
    function cmpU(u) {
      if (!VIVO || cmp || !u.t1 || !u.t1n) return null;
      var c = cmpDe(u.t1, u.q26, u.v2, u.b, u.nn, u.aptOk, u.compOk, u.ok, u.n);
      if (c) { c.br2 = u.t > 0 ? u.b / u.t * 100 : null; c.nu2 = u.t > 0 ? u.nn / u.t * 100 : null; }
      return c;
    }
    function dpts(a, b) { var d = b - a; return (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(1).replace('.', ',') + ' pts'; }
    function cmpCelula(c) {
      if (!c) return '<span class="t26-sub">—</span>';
      return '<div class="t26-cmp"><span style="color:' + COR1 + '">' + pf(c.m1) + ' → <b>' + pf(c.m2) + '</b> <small>' + dpts(c.m1, c.m2) + '</small></span><span style="color:' + COR2 + '">' + pf(c.a1) + ' → <b>' + pf(c.a2) + '</b> <small>' + dpts(c.a1, c.a2) + '</small></span></div>';
    }
    function comparativoCard(all) {
      var c = cmpDe(all.t1, all.q26, all.v2, all.b, all.nn, all.aptOk, all.compOk, all.ok, all.n);
      if (!c) return '<div class="t26-card"><h3>Comparativo 1º turno × 2º turno</h3><p class="t26-sub">O comparativo aparece quando mais de <b>50%</b> das seções estiverem apuradas (geral ou em qualquer regional, município, zona, bairro, local ou seção). Ele compara, nas mesmas seções já apuradas, o resultado do 1º e do 2º turno.</p></div>';
      var n1 = esc(cap(C.nome)), n2 = esc(rivalNome()), tt1 = all.t1[0] + all.t1[1] + all.t1[2] + all.t1[3] + all.t1[4];
      var br2 = all.t > 0 ? all.b / all.t * 100 : null, nu2 = all.t > 0 ? all.nn / all.t * 100 : null;
      var linha = function (rot, cor, a, b, q1, q2) {
        return '<tr><td' + (cor ? ' style="color:' + cor + '"' : '') + '><b>' + rot + '</b></td><td class="n">' + (a == null ? '–' : pf(a)) + (q1 != null ? ' <small class="t26-sub">' + fmt(q1) + '</small>' : '') + '</td><td class="n">' + (b == null ? '–' : pf(b)) + (q2 != null ? ' <small class="t26-sub">' + fmt(q2) + '</small>' : '') + '</td>' +
          '<td class="n">' + (a != null && b != null ? dpts(a, b) : '–') + '</td></tr>';
      };
      var dm = c.m2 - c.m1, da = c.a2 - c.a1;
      return '<div class="t26-card t26-comp"><h3>Comparativo 1º turno × 2º turno</h3><p class="t26-sub">Nas mesmas <b>' + fmt(all.ok) + '</b> seções já apuradas (' + pf(all.ok / all.n * 100) + ' do total). Percentuais sobre os votos válidos de cada turno.</p>' +
        '<div class="t26-tab"><table><thead><tr><th></th><th class="n">1º turno</th><th class="n">2º turno</th><th class="n">Variação</th></tr></thead><tbody>' +
        linha(n1, COR1, c.m1, c.m2, all.t1[0], all.q26) + linha(n2, COR2, c.a1, c.a2, all.t1[1], all.v2) +
        '<tr><td><b>Demais candidatos</b></td><td class="n">' + pf(c.o1) + ' <small class="t26-sub">' + fmt(all.t1[2]) + '</small></td><td class="n">—</td><td class="n">saíram da disputa</td></tr>' +
        linha('Brancos', null, c.br1, br2, all.t1[3], all.b) + linha('Nulos', null, c.nu1, nu2, all.t1[4], all.nn) + linha('Comparecimento', null, c.comp1, c.comp2, null, null) + '</tbody></table></div>' +
        '<p class="t26-analise-txt">' + n1 + ' <b>' + (dm >= 0 ? 'cresceu ' : 'caiu ') + Math.abs(dm).toFixed(1).replace('.', ',') + ' pts</b> e ' + n2 + ' <b>' + (da >= 0 ? 'cresceu ' : 'caiu ') + Math.abs(da).toFixed(1).replace('.', ',') + ' pts</b> em relação ao 1º turno nessas seções. Os ' + pf(c.o1) + ' que votaram nos demais candidatos no 1º turno foram para um dos dois, ficaram em branco/nulo ou não compareceram.</p></div>';
    }
    function resumoVivo() {
      var cont = contagemNiveis(), regs = unitRows('reg', {}).sort(function (a, b) { return a.lab.localeCompare(b.lab, 'pt-BR'); }), mus = unitRows('mun', {}).sort(function (a, b) { return a.lab.localeCompare(b.lab, 'pt-BR'); });
      var all = unitRows('reg', {}).reduce(function (a, u) { a.q26 += u.q26; a.v2 += u.v2; a.t += u.t; a.b += u.b; a.nn += u.nn; a.aptOk += u.aptOk; a.compOk += u.compOk; a.masc += u.masc; a.fem += u.fem; a.n += u.n; a.ok += u.ok; for (var pi = 0; pi < 10; pi++) a.pf[pi] += u.pf[pi]; for (var ci = 0; ci < 5; ci++) a.t1[ci] += u.t1[ci]; return a; },
        { n: 0, ok: 0, q26: 0, v2: 0, t: 0, b: 0, nn: 0, aptOk: 0, compOk: 0, masc: 0, fem: 0, pf: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], t1: [0, 0, 0, 0, 0], muns: new Set() });
      var vv = validosU(all), vp1 = vv > 0 ? all.q26 / vv * 100 : 0, vp2 = vv > 0 ? all.v2 / vv * 100 : 0;
      var n1 = esc(cap(C.nome)), n2 = esc(rivalNome()), dif = Math.abs(all.q26 - all.v2), lid = all.q26 === all.v2 ? '' : (all.q26 > all.v2 ? n1 : n2);
      var duelo = '<div class="t26-card t26-disputa"><div class="t26-dp-top"><h3>Disputa — votos válidos</h3><span class="t26-sub">' + (vv > 0 ? fmt(vv) + ' votos válidos apurados' : 'aguardando os primeiros votos apurados') + '</span></div>' +
        '<div class="t26-dp-cands"><div class="t26-dp" style="--c:' + COR1 + '"><span>' + n1 + '</span><b>' + (vv > 0 ? pf(vp1) : '—') + '</b><small>' + fmt(all.q26) + ' votos</small></div>' +
        '<div class="t26-dp-vs">×</div>' +
        '<div class="t26-dp dir" style="--c:' + COR2 + '"><span>' + n2 + '</span><b>' + (vv > 0 ? pf(vp2) : '—') + '</b><small>' + fmt(all.v2) + ' votos</small></div></div>' +
        '<div class="t26-duelo' + (vv > 0 ? '' : ' vazio') + '">' + (vv > 0 ? '<i style="width:' + vp1.toFixed(2) + '%;background:' + COR1 + '"></i><i style="width:' + vp2.toFixed(2) + '%;background:' + COR2 + '"></i>' : '') + '</div>' +
        '<p class="t26-sub t26-dp-dif">' + (vv > 0 ? (lid ? '<b>' + lid + '</b> à frente por <b>' + fmt(dif) + '</b> votos' : 'Empate técnico') : 'A barra se preenche conforme as urnas forem apuradas.') + '</p></div>';
      var kp = '<section class="t26-kpis t26-rv-kpis">' + kpi('Abstenção', pf(vmVal(all, 'abst')), fmt(all.aptOk - all.compOk) + ' de ' + fmt(all.aptOk) + ' eleitores aptos (seções apuradas)') + kpi('Votos em branco', fmt(all.b), pf(vmVal(all, 'brancos')) + ' do total apurado') +
        kpi('Votos nulos', fmt(all.nn), pf(vmVal(all, 'nulos')) + ' do total apurado') + kpi('Comparecimento', pf(all.aptOk ? all.compOk / all.aptOk * 100 : null), fmt(all.compOk) + ' eleitores') +
        (temGenero() ? kpi('Eleitorado feminino', pf(vmVal(all, 'fem')), fmt(all.fem) + ' mulheres · ' + pf(vmVal(all, 'masc')) + ' homens') : '') +
        (temPerfil() ? kpi('Jovens (16–24) · 60+', pf(vmVal(all, 'jovem')) + ' · ' + pf(vmVal(all, 'idoso')), 'do eleitorado do Acre') + kpi('Ensino superior', pf(vmVal(all, 'superior')), pf(vmVal(all, 'baixaesc')) + ' até fund. incompleto') + kpi('Com biometria', pf(vmVal(all, 'bio')), pf(vmVal(all, 'facult')) + ' com voto facultativo') : '') + '</section>';
      var niv = '<div class="t26-card"><h3>Apuração concluída por nível</h3><div class="t26-concl">' + cont.map(function (c) {
        var p = c.n ? c.f / c.n * 100 : 0;
        return '<div class="t26-cn' + (c.n && c.f === c.n ? ' fim' : '') + '"><span>' + NOMES_NIVEL[c.l] + '</span><b>' + fmt(c.f) + ' <small>de ' + fmt(c.n) + '</small></b><span class="t26-apb"><i style="width:' + p.toFixed(1) + '%"></i></span><small>' + (c.n && c.f === c.n ? '✓ todas apuradas' : c.ap ? fmt(c.ap) + ' em apuração' : 'aguardando') + '</small></div>';
      }).join('') + '</div></div>';
      var feed = ((D.vivo && D.vivo.concluidas) || []);
      var recentes = '<div class="t26-feedcard"><div class="t26-card t26-feed-in"><h3>Apurações concluídas agora</h3>' + (feed.length ? '<ul class="t26-feed">' + feed.slice(0, 12).map(function (x) { return '<li><span class="t26-tag ok">✓ ' + esc(x.nivel) + '</span> <b>' + esc(x.nome) + '</b> <small class="t26-sub">' + esc(x.hora) + '</small></li>'; }).join('') + '</ul>' : '<p class="t26-sub">Nenhuma regional, município, zona, bairro ou local de votação concluiu a apuração ainda. Assim que isso acontecer, aparece aqui.</p>') + '</div></div>';
      var regCards = '<div class="t26-card"><h3>Apuração por regional</h3><div class="t26-lista-ap">' + regs.map(function (u) {
        return '<div class="t26-la' + (fim(u) ? ' fim' : '') + '"><div class="t26-la-top"><b>' + u.lab + '</b>' + statTag(u) + '</div>' + apBar(u) + '<div class="t26-la-ld">' + liderTxt(u) + '</div></div>';
      }).join('') + '</div></div>';
      var munCards = '<div class="t26-card"><h3>Apuração por município</h3><div class="t26-chips">' + mus.map(function (u) {
        var c = escalaVivo('lider', [u]).corU(u);
        return '<div class="t26-chip' + (fim(u) ? ' fim' : '') + '" style="border-left-color:' + c + '"><b>' + u.lab + (fim(u) ? ' ✓' : '') + '</b>' + apBar(u) + '</div>';
      }).join('') + '</div><p class="t26-sub">A faixa à esquerda de cada município mostra quem lidera (rosa = ' + esc(cap(C.nome)) + ', azul = ' + esc(rivalNome()) + ', cinza = aguardando); ✓ = todas as seções apuradas.</p></div>';
      return '<div class="t26-rv-layout"><div class="t26-rv">' + duelo + kp + niv + comparativoCard(all) + perfilCard() + regCards + munCards + histVivo() + analiseVivo() + '</div><aside class="t26-rv-lado">' + recentes + '</aside></div>';
    }
    function ordVivo(rows) {
      var o = st.ord, g = function (u) { return o === 'apur' ? vmVal(u, 'apur') : o === 'p1' ? vmVal(u, 'p1') : o === 'p2' ? vmVal(u, 'p2') : o === 'abst' ? vmVal(u, 'abst') : o === 'brancos' ? vmVal(u, 'brancos') : o === 'q26' ? u.q26 : o === 'v2' ? u.v2 : null; };
      return rows.sort(function (a, b) {
        if (o === 'nome' || o == null) return a.lab.localeCompare(b.lab, 'pt-BR', { numeric: true });
        var x = g(a), y = g(b); x = x == null ? -1 : x; y = y == null ? -1 : y;
        return y - x || a.lab.localeCompare(b.lab, 'pt-BR', { numeric: true });
      });
    }
    function tabelaNivelVivo(lv) {
      var simples = lv === 'reg' || lv === 'mun' || (MUNC && (lv === 'zona' || lv === 'bairro')), mm = simples ? '' : st.mun;
      var rows = unitRows(lv, mm), todos = rows.slice(), esc2 = escalaVivo(st.vm, todos);
      rows = ordVivo(rows.filter(function (u) { return st.zero || u.ok > 0; }));
      var pgs = Math.max(1, Math.ceil(rows.length / PAGE)); if (st.pag >= pgs) st.pag = pgs - 1;
      var pg = rows.slice(st.pag * PAGE, st.pag * PAGE + PAGE);
      var nF = todos.filter(fim).length, nA = todos.filter(function (u) { return u.ok > 0 && !fim(u); }).length, okS = todos.reduce(function (a, u) { return a + u.ok; }, 0), nS = todos.reduce(function (a, u) { return a + u.n; }, 0);
      var agg = todos.reduce(function (a, u) { a.q += u.q26; a.v += u.v2; a.t += u.t; a.b += u.b; a.nn += u.nn; a.ap += u.aptOk; a.cp += u.compOk; return a; }, { q: 0, v: 0, t: 0, b: 0, nn: 0, ap: 0, cp: 0 });
      var vv2 = agg.t - agg.b - agg.nn;
      var k4 = kpi('Seções apuradas', pf(nS ? okS / nS * 100 : 0), fmt(okS) + ' de ' + fmt(nS) + (mm ? ' em ' + esc(cap(MUN[mm])) : '')) + kpi(LV[lv] + ' com apuração concluída', fmt(nF) + ' de ' + fmt(todos.length), fmt(nA) + ' em apuração · ' + fmt(todos.length - nF - nA) + ' aguardando') +
        kpi(esc(cap(C.nome)) + ' × ' + esc(rivalNome()), pf(vv2 > 0 ? agg.q / vv2 * 100 : null) + ' × ' + pf(vv2 > 0 ? agg.v / vv2 * 100 : null), fmt(agg.q) + ' × ' + fmt(agg.v) + ' votos') +
        kpi('Abstenção · brancos · nulos', pf(agg.ap ? (agg.ap - agg.cp) / agg.ap * 100 : null) + ' · ' + pf(agg.t ? agg.b / agg.t * 100 : null) + ' · ' + pf(agg.t ? agg.nn / agg.t * 100 : null), 'das seções apuradas');
      var opts = Object.keys(MUN).sort(function (a, b) { return MUN[a].localeCompare(MUN[b]); }).map(function (m) { return '<option value="' + m + '"' + (m === st.mun ? ' selected' : '') + '>' + esc(cap(MUN[m])) + '</option>'; }).join('');
      var ordOps = [['nome', 'Nome'], ['apur', '% apurado'], ['q26', 'Votos de ' + cap(C.nome)], ['v2', 'Votos de ' + rivalNome()], ['p1', '% ' + cap(C.nome)], ['p2', '% ' + rivalNome()], ['abst', 'Abstenção'], ['brancos', 'Brancos']];
      var head = '<th>' + LV[lv] + '</th>' + (simples ? '' : '<th>Localização</th>') + '<th>Apuração</th><th>Situação</th><th class="n" style="color:' + COR1 + '">' + esc(cap(C.nome)) + '</th><th class="n" style="color:' + COR2 + '">' + esc(rivalNome()) + '</th><th>Quem lidera</th><th class="n">Abstenção</th><th class="n">Brancos</th><th class="n">Nulos</th>' + (temGenero() ? '<th class="n">Mulheres</th><th class="n">Homens</th>' : '') + '<th>1º → 2º turno <small>(&gt; 50% apurado)</small></th><th>' + esc(nomeMet(st.vm)) + '</th>';
      var body = pg.map(function (u) {
        var x = vmVal(u, st.vm);
        return '<tr class="' + (fim(u) ? 't26-fimrow' : '') + '"><td><b>' + u.lab + '</b></td>' + (simples ? '' : '<td class="t26-sub">' + u.ctx + '</td>') + '<td>' + apBar(u) + '</td><td>' + statTag(u) + '</td>' + votosUV(u) + '<td>' + liderTxt(u) + '</td>' +
          '<td class="n">' + pf(vmVal(u, 'abst')) + '</td><td class="n">' + pf(vmVal(u, 'brancos')) + '</td><td class="n">' + pf(vmVal(u, 'nulos')) + '</td>' + (temGenero() ? '<td class="n">' + pf(vmVal(u, 'fem')) + '</td><td class="n">' + pf(vmVal(u, 'masc')) + '</td>' : '') +
          '<td>' + cmpCelula(cmpU(u)) + '</td><td><span class="t26-heat" style="background:' + esc2.corU(u) + '">' + (st.vm === 'lider' ? '&nbsp;' : pf(x)) + '</span></td></tr>';
      }).join('');
      return '<div class="t26-card"><div class="t26-topo"><h3>Apuração por ' + LV[lv].toLowerCase() + '</h3><div class="t26-ctl">' +
        (simples || MUNC ? '' : '<label>Município <select data-c="mun"><option value="">' + TODOESTADO + '</option>' + opts + '</select></label>') +
        '<label>Colorir por <select data-c="vm">' + metsVivo().map(function (a) { return '<option value="' + a[0] + '"' + (st.vm === a[0] ? ' selected' : '') + '>' + esc(a[1]) + '</option>'; }).join('') + '</select></label>' +
        '<label>Ordenar por <select data-c="ord">' + ordOps.map(function (a) { return '<option value="' + a[0] + '"' + (st.ord === a[0] ? ' selected' : '') + '>' + esc(a[1]) + '</option>'; }).join('') + '</select></label>' +
        '<label><input type="checkbox" data-c="zero"' + (st.zero ? ' checked' : '') + '> incluir ainda sem apuração</label></div></div>' +
        '<div class="t26-nivel-grid"><div class="t26-nivel-mapa"><div class="t26-gm" data-gm></div></div><aside class="t26-nivel-info"><section class="t26-kpis">' + k4 + '</section></aside></div>' +
        '<div class="t26-tab"><table><thead><tr>' + head + '</tr></thead><tbody>' + (body || '<tr><td colspan="14">Nenhuma unidade com apuração ainda.</td></tr>') + '</tbody></table></div>' + pager(rows.length, pgs, 'pag') + '</div>';
    }
    function tabelaSecoesVivo() {
      var rows = secInfo(st.dr);
      if (!st.zsec) rows = rows.filter(function (s) { return s.ok; });
      rows.sort(function (a, b) { return a.zona - b.zona || a.secao - b.secao; });
      var pgs = Math.max(1, Math.ceil(rows.length / PAGE)); if (st.psec >= pgs) st.psec = pgs - 1;
      var pg = rows.slice(st.psec * PAGE, st.psec * PAGE + PAGE);
      var body = pg.map(function (s) {
        var li = localInfo(s), v = s.t - s.b - s.n, p1 = s.ok && v > 0 ? s.q26 / v * 100 : null, p2 = s.ok && v > 0 ? s.v2 / v * 100 : null, abst = s.ok && s.apt > 0 ? (s.apt - s.comp) / s.apt * 100 : null;
        var ld = !s.ok || v <= 0 ? '<span class="t26-sub">—</span>' : s.q26 === s.v2 ? 'empate' : '<span class="t26-ldot" style="background:' + (s.q26 > s.v2 ? COR1 : COR2) + '"></span><b>' + esc(s.q26 > s.v2 ? cap(C.nome) : rivalNome()) + '</b>';
        return '<tr class="' + (s.ok ? 't26-fimrow' : '') + '"><td>' + pad(s.zona, 4) + '</td><td>' + pad(s.secao, 4) + '</td><td>' + (li ? '<b>' + esc(li[0]) + '</b><br><small class="t26-sub">' + esc(cap(li[1] || '')) + '</small>' : 'Local ' + s.local) + '</td>' +
          '<td>' + (s.ok ? '<span class="t26-tag ok">✓ Apurada</span>' : '<span class="t26-tag">Aguardando</span>') + '</td><td class="n" style="color:' + COR1 + '"><b>' + fmt(s.q26) + '</b> <span class="t26-p">' + pf(p1) + '</span></td><td class="n" style="color:' + COR2 + '"><b>' + fmt(s.v2) + '</b> <span class="t26-p">' + pf(p2) + '</span></td><td>' + ld + '</td>' +
          '<td class="n">' + pf(abst) + '</td><td class="n">' + (s.ok ? fmt(s.b) : '–') + '</td><td class="n">' + (s.ok ? fmt(s.n) : '–') + '</td></tr>';
      }).join('');
      var ok = rows.filter(function (s) { return s.ok; }).length;
      return '<div class="t26-card"><div class="t26-topo"><h3>Seções do recorte — ' + fmt(ok) + ' de ' + fmt(rows.length) + ' apuradas</h3><label class="t26-sub"><input type="checkbox" data-c="zsec"' + (st.zsec ? ' checked' : '') + '> incluir seções ainda não apuradas</label></div>' +
        '<div class="t26-tab"><table><thead><tr><th>Zona</th><th>Seção</th><th>Local de votação</th><th>Situação</th><th class="n" style="color:' + COR1 + '">' + esc(cap(C.nome)) + '</th><th class="n" style="color:' + COR2 + '">' + esc(rivalNome()) + '</th><th>Quem lidera</th><th class="n">Abstenção</th><th class="n">Brancos</th><th class="n">Nulos</th></tr></thead><tbody>' +
        (body || '<tr><td colspan="10">Nenhuma seção.</td></tr>') + '</tbody></table></div>' + pager(rows.length, pgs, 'psec') + '</div>';
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
      if (VIVO && !cmp) return tabelaNivelVivo(lv);
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
      var mapaCard = '<div class="t26-card">' + (VIVO && !cmp ? '' : filtrosHtml()) + '<div class="t26-mig">' + mig.map(function (c, i) { return i === mig.length - 1 ? '<b>' + c[1] + '</b>' : '<a data-dr="' + c[0] + '">' + c[1] + '</a>'; }).join(' › ') +
        '<span class="t26-sub"> · ' + resumoEsc + ' · próximo nível: <b>' + LV[auto] + '</b>' + (auto === 'sec' ? ' (último)' : ' — clique num ponto/área') + '</span></div>' +
        '<div class="t26-gm" data-gm></div><p class="t26-sub">Clique para detalhar: ' + (MUNC ? '' : 'município → ') + 'zona → bairro → local de votação → seção (use o caminho acima para voltar). Em "Colorir por" dá para ver outro nível' + (MUNC ? '' : ', inclusive regional') + '. Imagem: Esri World Imagery.</p></div>';
      if (VIVO && !cmp) return (st.fx ? '<div class="t26-card t26-filtros-topo">' + filtrosHtml() + '</div>' : '') + '<div class="t26-mapagrid t26-vivo-mapa"><div class="t26-card t26-area-lista">' + detalheMun('filhos') + '</div>' + mapaCard.replace('<div class="t26-card">', '<div class="t26-card t26-area-mapa">') + '<div class="t26-card t26-det t26-area-info">' + detalheMun('info') + '</div></div>' + (d.mun ? tabelaSecoes() : '');
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
    function totalEstado() { var us = unitRows('reg', {}), o = { lab: ACRE, n: 0, c22: 0, c26: 0, q22: 0, q26: 0, t: 0, b: 0, nn: 0, apt: 0, comp: 0, ok: 0, v2: 0, masc: 0, fem: 0, aptOk: 0, compOk: 0, muns: new Set(), pos: E.pos, nc: E.nCand }; us.forEach(function (u) { ['n', 'c22', 'c26', 'q22', 'q26', 't', 'b', 'nn', 'apt', 'comp', 'ok', 'v2', 'masc', 'fem', 'aptOk', 'compOk'].forEach(function (k) { o[k] += u[k]; }); }); o.pf = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; us.forEach(function (u) { for (var pi = 0; pi < 10; pi++) o.pf[pi] += u.pf[pi]; }); o.dif = o.q26 - o.q22; return o; }
    function detalheMun(parte) {
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
      if (VIVO && !cmp) L = linhasVivo(o).concat(atual === 'state' || atual === 'reg' || MUNC ? [] : [['Regional', esc(regionOf(m))]], L.filter(function (x) { return x[0] === 'Local de votação' || x[0] === 'Bairro · endereço'; }));
      var filho = FILHO[atual], filhos = [];
      if (filho) { filhos = unitRows(filho, d).filter(function (u) { return cmp ? (u.q22 > 0 || u.q26 > 0) : (VIVO || Q(u) > 0); }).sort(function (a, b) { return cmp ? b.q26 - a.q26 : Q(b) - Q(a); }); }
      panelUnits = filhos;
      var cab = '<th>' + LV[filho || 'sec'] + '</th>' + (cmp ? '<th class="n">2022</th><th class="n">2026</th><th class="n">Dif.</th>' : '<th class="n">Seções c/ voto</th><th class="n">Votos</th><th class="n">% dos votos dele</th>');
      var linhas = filhos.map(function (u, i) {
        return '<tr class="t26-click" data-pu="' + i + '"><td>' + u.lab + '</td>' + (cmp ? '<td class="n">' + vp(u.q22, T22) + '</td><td class="n">' + vp(u.q26, T26) + '</td><td class="n ' + (u.dif > 0 ? 't26-pos' : u.dif < 0 ? 't26-neg' : '') + '">' + dv(u.q26, u.q22) + '</td>' : '<td class="n">' + cn(Cn(u), u.n) + '</td><td class="n">' + fmt(Q(u)) + '</td><td class="n">' + pc(Q(u), TB) + '</td>') + '</tr>';
      }).join('');
      if (VIVO && !cmp) {
        filhos.sort(function (a, b) { return a.lab.localeCompare(b.lab, 'pt-BR', { numeric: true }); });
        cab = '<th>' + LV[filho || 'sec'] + '</th><th>Apuração</th><th class="n" style="color:' + COR1 + '">' + esc(cap(C.nome)) + '</th><th class="n" style="color:' + COR2 + '">' + esc(rivalNome()) + '</th><th>Quem lidera</th>';
        linhas = filhos.map(function (u, i) { return '<tr class="t26-click' + (fim(u) ? ' t26-fimrow' : '') + '" data-pu="' + i + '"><td>' + u.lab + '</td><td>' + apBar(u) + '</td>' + votosUV(u) + '<td>' + liderTxt(u) + '</td></tr>'; }).join('');
      }
      var rot = atual === 'mun' || atual === 'state' || atual === 'reg' ? o.lab : atual === 'zona' && !MUNC ? o.lab + ' · ' + esc(cap(MUN[m])) : o.lab;
      var infoHtml = '<div class="t26-sec"><div class="t26-topo"><h3>' + rot + '</h3><div class="t26-ctl">' + (PAI[atual] && !(MUNC && atual === 'mun') ? '<button type="button" data-dr="' + PAI[atual] + '" class="t26-btn">↑ Subir um nível</button>' : '') + (atual !== 'state' && !(MUNC && atual === 'mun') ? '<button type="button" data-dr="state" class="t26-btn">Ver ' + TODOESTADO.toLowerCase() + '</button>' : '') + '</div></div>' +
        '<div class="t26-lista">' + L.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div></div>';
      var filhosHtml = (filho ? '<div class="t26-sec"><h4>Por ' + LV[filho].toLowerCase() + ' <small class="t26-sub">(clique numa linha para detalhar)</small></h4><div class="t26-tab t26-tabalta"><table><thead><tr>' + cab + '</tr></thead><tbody>' + (linhas || '<tr><td colspan="4">Nenhuma unidade com voto.</td></tr>') + '</tbody></table></div></div>' : '<div class="t26-sec"><p class="t26-sub">Último nível: a seção individual.</p></div>');
      if (VIVO && !cmp) {
        // lista compacta (coluna à esquerda do mapa): cada clique desce um nível e filtra mapa e lista
        var cs = escalaVivo('lider', filhos);
        var itens = filhos.map(function (u, i) {
          var p1 = vmVal(u, 'p1'), p2 = vmVal(u, 'p2');
          return '<div class="t26-un' + (fim(u) ? ' fim' : '') + '" data-pu="' + i + '" style="border-left-color:' + cs.corU(u) + '" tabindex="0" role="button">' +
            '<div class="t26-un-top"><b>' + u.lab + '</b>' + statTag(u) + '</div>' + (u.ctx && filho !== 'mun' ? '<small class="t26-sub">' + u.ctx + '</small>' : '') + apBar(u) +
            (cmpU(u) ? '<div class="t26-un-c">1º→2º ' + cmpCelula(cmpU(u)) + '</div>' : '') + '<div class="t26-un-v"><span style="color:' + COR1 + '">' + esc(cap(C.nome).split(' ')[0]) + ' <b>' + pf(p1) + '</b></span><span style="color:' + COR2 + '">' + esc(rivalNome().split(' ')[0]) + ' <b>' + pf(p2) + '</b></span></div></div>';
        }).join('');
        filhosHtml = '<div class="t26-unlista"><div class="t26-topo"><h3>' + (filho ? 'Por ' + LV[filho].toLowerCase() : 'Seção') + '</h3><div class="t26-ctl">' +
          (PAI[atual] && !(MUNC && atual === 'mun') ? '<button type="button" data-dr="' + PAI[atual] + '" class="t26-btn">↑ Subir</button>' : '') + (atual !== 'state' && !(MUNC && atual === 'mun') ? '<button type="button" data-dr="state" class="t26-btn">Estado</button>' : '') + '</div></div>' +
          '<p class="t26-sub">' + (filho ? 'Clique numa linha para descer um nível: o mapa e esta lista passam a mostrar só essa unidade.' : 'Último nível: a seção individual.') + '</p>' +
          (filho ? '<div class="t26-un-box">' + (itens || '<p class="t26-sub">Nenhuma unidade.</p>') + '</div>' : '') + '</div>';
      }
      return parte === 'info' ? infoHtml : parte === 'filhos' ? filhosHtml : infoHtml + filhosHtml;
    }
    function tabelaSecoes() {
      if (VIVO && !cmp) return tabelaSecoesVivo();
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
      if (mapa) { try { mapa.stop(); mapa.off(); mapa.remove(); } catch (e) { } mapa = null; }
      // Leaflet (canvas): um redesenho agendado antes de remover o mapa roda depois e falha em "clearRect"; protege uma vez
      if (L.Canvas && !L.Canvas.__guardaRemocao) {
        L.Canvas.__guardaRemocao = true;
        ['_redraw', '_update', '_updatePaths'].forEach(function (nome) {
          var orig = L.Canvas.prototype[nome]; if (!orig) return;
          L.Canvas.prototype[nome] = function () { if (!this._ctx || !this._map) return; return orig.apply(this, arguments); };
        });
      }
      semTam = !el.clientWidth;
      var F = fixo ? { mun: (fixo === 'reg' || fixo === 'mun') ? '' : st.mun } : st.dr;
      var fundo = L.layerGroup(), dados = L.layerGroup(), contorno = L.layerGroup();
      var map = mapa = L.map(el, { zoomSnap: 0.25, preferCanvas: true });
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
        setTimeout(function () { if (mapa === map) map.invalidateSize(); }, 60);
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
        if (!VIVO && !(fixo && st.zero)) us = us.filter(function (u) { return cmp ? (u.q22 > 0 || u.q26 > 0) : Q(u) > 0; });
        var tipoEsc = cmp && st.met === 'dif' ? 'div' : 'seq';
        var esc2 = VIVO ? escalaVivo(st.vm, us) : mkEscala(us.map(val), tipoEsc), lim = L.latLngBounds([]), falta = 0;
        var corU = function (u) { return VIVO ? esc2.corU(u) : esc2.cor(val(u)); }, tipU = function (u) { return VIVO ? tipVivo(u, lv) : tip(u, lv); };
        var bordaU = function (u) { return VIVO && u && fim(u) ? { color: VERDE, weight: 3 } : { color: '#fff', weight: 1 }; };
        if (poli) {
          var porMun = {}; us.forEach(function (u) { u.muns.forEach(function (m) { porMun[m] = u; }); });
          Object.keys(MAPA.mun).forEach(function (cod) {
            var u = porMun[cod];
            var pg = L.polygon(munRings(cod), Object.assign({ fillColor: u ? corU(u) : '#8b929c', fillOpacity: u ? 0.75 : 0.2 }, bordaU(u))).addTo(dados);
            pg.bindTooltip(u ? function () { return tipU(u); } : esc(cap(MUN[cod] || cod)) + '<br>sem voto', { sticky: true });
            if (!fixo) pg.on('click', function () { drill(lv === 'reg' ? { reg: regionOf(cod) } : { mun: cod }); });
            if (u || !us.length) lim.extend(pg.getBounds());
          });
        } else {
          if (F.mun && MAPA.mun[F.mun]) L.polygon(munRings(F.mun), { color: '#fff', weight: 1.5, fill: false, opacity: 0.8, interactive: false }).addTo(contorno);
          var mx = Math.max.apply(null, us.map(function (u) { return VIVO ? u.n : cmp ? Math.max(u.q22, u.q26) : Q(u); }).concat([1]));
          us.filter(function (u) { if (u.lat == null) { falta++; return false; } return true; }).sort(function (a, b) { return (cmp ? Math.max(b.q22, b.q26) - Math.max(a.q22, a.q26) : Q(b) - Q(a)); }).forEach(function (u) {
            var tam = VIVO ? u.n : cmp ? Math.max(u.q22, u.q26) : Q(u), r = lv === 'sec' ? 4 + 6 * Math.sqrt(tam / mx) : 5 + 15 * Math.sqrt(tam / mx);
            var m = L.circleMarker([u.lat, u.lon], Object.assign({ radius: r, fillColor: corU(u), fillOpacity: 0.88 }, bordaU(u))).addTo(dados);
            m.bindTooltip(function () { return tipU(u); }, { sticky: true });
            if (!fixo && u.f) m.on('click', function () { drill(u.f); });
            lim.extend([u.lat, u.lon]);
          });
        }
        var rows = esc2.rows();
        legenda.getContainer().innerHTML = '<b>' + LV[lv] + ' · ' + esc2.titulo + '</b>' + (VIVO ? '<div><i style="background:#fff;border:3px solid ' + VERDE + '"></i>borda verde = apuração concluída</div>' : '') + (rows.map(function (r) { return '<div><i style="background:' + r.cor + '"></i>' + r.txt + ' <span>(' + r.n + ')</span></div>'; }).join('') || '<div>sem votos</div>') + (falta ? '<div class="t26-falta">' + falta + ' sem coordenada</div>' : '');
        if (!fixo && cmp) atualizaGrafico();
        if (primeira || ultimo !== lv) {
          primeira = false; ultimo = lv; var fb = lim;
          if (F.mun && !poli) {
            var tot = us.reduce(function (s, u) { return s + (cmp ? Math.max(u.q22, u.q26) : Q(u)); }, 0), ac = 0, nucleo = L.latLngBounds([]);
            us.filter(function (u) { return u.lat != null; }).sort(function (x, y) { return (cmp ? Math.max(y.q22, y.q26) - Math.max(x.q22, x.q26) : Q(y) - Q(x)); }).some(function (u) { nucleo.extend([u.lat, u.lon]); ac += cmp ? Math.max(u.q22, u.q26) : Q(u); return ac >= tot * 0.85; });
            if (nucleo.isValid()) fb = nucleo.pad(0.25);
          }
          if (fb.isValid()) { map.fitBounds(fb.pad(0.05), { maxZoom: 17, animate: false }); fixaBase(); }
        }
      }
      // Zoom out regride um nível: a seleção sobe e o mapa mostra os "irmãos" (outros locais do mesmo bairro,
      // depois outros bairros da zona etc.), do mais micro para o mais macro.
      var baseZ = null, baseT = 0;
      function fixaBase() {
        baseZ = null; clearTimeout(baseT);
        baseT = setTimeout(function () { if (document.body.contains(el)) baseZ = map.getZoom(); }, 800);
      }
      function subirNivel() {
        var d = st.dr;
        if (d.secao || d.local) aplicaFiltro('local', '');
        else if (d.bairro) aplicaFiltro('bairro', '');
        else if (d.zona !== '') aplicaFiltro('zona', '');
        else if (d.mun && !MUNC) aplicaFiltro('mun', '');
        else if (d.reg) aplicaFiltro('reg', '');
        else return false;
        return true;
      }
      if (!fixo) map.on('zoomend', function () {
        if (baseZ == null || st.lv !== 'auto' || map.getZoom() > baseZ - 0.75) return;
        baseZ = null; subirNivel();
      });
      var ctl = L.control({ position: 'topright' });
      ctl.onAdd = function () {
        var dv = L.DomUtil.create('div', 't26-ctlmapa'); L.DomEvent.disableClickPropagation(dv); L.DomEvent.disableScrollPropagation(dv);
        var ops = ['auto'].concat(Object.keys(LV)).filter(function (l) { return !(F.mun && (l === 'mun' || l === 'reg')); });
        dv.innerHTML = '<div class="t26-opcs"><label>Fundo <select data-k="base"><option value="hib">Satélite + ruas</option><option value="sat">Satélite</option><option value="map">Mapa</option></select></label>' +
          (VIVO ? '<label>Colorir por <select data-k="lv">' + (fixo ? '' : '<optgroup label="Nível de detalhe">' + ops.map(function (l) { return '<option value="' + l + '">' + (l === 'auto' ? 'Automático (clique p/ detalhar)' : LV[l]) + '</option>'; }).join('') + '</optgroup>') +
            '<optgroup label="Indicador">' + metsVivo().filter(function (a) { return fixo && IND[st.aba] ? IND[st.aba].mets.indexOf(a[0]) >= 0 : ['bio', 'def', 'facult'].indexOf(a[0]) < 0; }).map(function (a) { return '<option value="m:' + a[0] + '">' + esc(a[1]) + '</option>'; }).join('') + '</optgroup></select></label>'
          : fixo ? '' : '<label>Colorir por <select data-k="lv">' + ops.map(function (l) { return '<option value="' + l + '">' + (l === 'auto' ? 'Automático (clique p/ detalhar)' : LV[l]) + '</option>'; }).join('') + '</select></label>') +
          (cmp ? '<label>Mostrar <select data-k="met"><option value="dif">Diferença</option><option value="q26">Votos 2026</option><option value="q22">Votos 2022</option></select></label>' : '') +
          '</div><div class="t26-ctlbar"><button type="button" class="t26-opc" data-k="opc" aria-expanded="false">⚙ Opções</button><button type="button" data-k="fs">⛶ Tela cheia</button></div>';
        dv.querySelectorAll('select').forEach(function (s) {
          var k = s.dataset.k; s.value = k === 'base' ? st.base : k === 'met' ? st.met : k === 'vm' ? st.vm : (VIVO && (fixo || st.ult === 'm') ? 'm:' + st.vm : (st.lv === 'auto' ? 'auto' : nivel()));
          s.onchange = function () { if (k === 'base') { st.base = s.value; setBase(); } else if (k === 'met') { st.met = s.value; desenhar(); } else if (k === 'vm') { st.vm = s.value; desenhar(); } else if (VIVO && /^m:/.test(s.value)) { st.vm = s.value.slice(2); st.ult = 'm'; if (fixo) desenha(); else desenhar(); } else { st.lv = s.value; st.ult = 'l'; desenhar(); } };
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
      setBase(); desenhar(); setTimeout(function () { if (mapa === map) map.invalidateSize(); }, 80);
      if (st.cheia) setCheia(true);
    }

    /* ----- exportar: slide (exibir/baixar) e PDFs (visualizar/baixar) ----- */
    var FONTE = MUNC ? 'TSE (Tribunal Superior Eleitoral) - votação por seção, ' + TURNO + 'º turno de ' + ANO
      : (cmp ? 'Boletins de urna do 1º turno de 2026 e votação por seção de 2022 (TSE)' : (a22 ? 'TSE (Tribunal Superior Eleitoral) - votação por seção, 2022' : 'Boletins de urna do ' + TURNO + 'º turno de 2026'));
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
        btnEx('slide-ver', tipoSlide, '▶ Exibir slide', true) + btnEx('slide-baixar', tipoSlide, '⬇ Baixar slide (PDF)') + btnEx('slide-baixar-pptx', tipoSlide, 'Baixar editável (.pptx)'));
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
      if (VIVO && !cmp) {
        if (st.aba === 'exportar' && !apuracaoCompleta()) st.aba = 'mapa';
        if (IND[st.aba] && IND[st.aba].mets.indexOf(st.vm) < 0) st.vm = IND[st.aba].mets[0];
      }
      marcaAba();
      if (st.aba === 'resumo') { corpo.innerHTML = VIVO && !cmp ? resumoVivo() : resumo(); if (mapa) { try { mapa.stop(); mapa.off(); mapa.remove(); } catch (e) { } mapa = null; } return; }
      if (st.aba === 'mapa') { corpo.innerHTML = abaMapa(); iniciaMapa(null); return; }
      if (VIVO && !cmp && IND[st.aba]) { corpo.innerHTML = indicadorVivo(st.aba); iniciaMapa(st.indLv || 'mun'); return; }
      if (st.aba === 'exportar') { corpo.innerHTML = exportar(); if (mapa) { try { mapa.stop(); mapa.off(); mapa.remove(); } catch (e) { } mapa = null; } return; }
      corpo.innerHTML = tabelaNivel(st.aba); iniciaMapa(st.aba);
    }
    function eventos() {
      if (window.ResizeObserver) new ResizeObserver(function () { if (semTam && root.clientWidth > 0 && !root.hidden) { semTam = false; desenha(); } }).observe(root);
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-filt]')) { st.filtAberto = !st.filtAberto; root.classList.toggle('t26-filt-aberto', st.filtAberto); var fl = root.querySelector('.t26-filtros'); root.style.setProperty('--t26-fh', st.cheia && fl ? fl.offsetHeight + 'px' : '0px'); return; }
        var ex = e.target.closest('[data-ex]'); if (ex) { exportarAcao(ex.dataset.ex, ex.dataset.tipo, ex); return; }
        if (e.target.closest('[data-apres]')) { apresAlternar(); return; }
        if (e.target.closest('[data-fx]')) { st.fx = !st.fx; desenha(); return; }
        var t = e.target.closest('[data-t26]'); if (t) { if (st.apres) { st.apres = false; apresRetorno = null; apresAgenda(); apresUI(); } st.aba = t.dataset.t26; st.pag = 0; st.psec = 0; st.cheia = false; root.classList.remove('t26-modo-cheia'); desenha(); return; }
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
        var lp = e.target.closest('[data-pu]'); if (lp) { var pu = panelUnits[Number(lp.dataset.pu)]; if (pu && pu.f) drill(pu.f); return; }
        var pg = e.target.closest('[data-pg]'); if (pg && !pg.disabled) { st[pg.dataset.k] += Number(pg.dataset.pg); desenha(); }
      });
      root.addEventListener('input', function (e) { if (e.target.dataset && e.target.dataset.busca !== undefined) mostraBusca(e.target.value); });
      root.addEventListener('keydown', function (e) { if (e.target.dataset && e.target.dataset.busca !== undefined && e.key === 'Escape') { var b = $('[data-res]'); if (b) b.hidden = true; } });
      root.addEventListener('change', function (e) {
        if (e.target.dataset && e.target.dataset.f) { aplicaFiltro(e.target.dataset.f, e.target.value); return; }
        var c = e.target.dataset && e.target.dataset.c; if (!c) return;
        if (c === 'mun') { st.mun = e.target.value; st.pag = 0; }
        else if (c === 'ord') { st.ord = e.target.value; st.pag = 0; }
        else if (c === 'vm') { st.vm = e.target.value; st.pag = 0; }
        else if (c === 'hinv') { st.hinv = e.target.checked; }
        else if (c === 'il') { st.indLv = e.target.value; st.pag = 0; }
        else if (c === 'ia') { st.indAsc = !!e.target.value; st.pag = 0; }
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
        if (mapa) { var m0 = mapa; setTimeout(function () { if (mapa === m0) m0.invalidateSize(); }, 60); }
      },
      esconder: function () { root.hidden = true; },
      redesenhar: function () {   // dados novos (apuração ao vivo): refaz totais, cabeçalho e a aba aberta, mantendo filtros e rolagem
        if (!iniciado || root.hidden) return;
        if (st.apres) {   // atualização nova: mostra a Principal por 10 s e depois retoma de onde estava
          if (st.aba !== 'mapa' && !apresRetorno) apresRetorno = st.aba;
          st.aba = 'mapa'; st.pag = 0; st.psec = 0; apresAgenda();
        }
        var sc = root.closest('.aba-conteudo'), topo = sc ? sc.scrollTop : 0, el = $('.t26-corpo'), interno = el ? el.scrollTop : 0;
        T22 = E22.q; T26 = E.q; TB = a22 ? T22 : T26; nome = C.nome;
        if (mapa) { try { mapa.stop(); mapa.off(); mapa.remove(); } catch (e) { } mapa = null; }
        montar(); desenha();
        if (sc) sc.scrollTop = topo; el = $('.t26-corpo'); if (el) el.scrollTop = interno;
      }
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
    // dados novos em D (estado, cand, rk, secoes, candidatos mudaram no lugar): relê e redesenha (apuração ao vivo — js/eleicoes-2turno-secoes.js)
    atualizar: function () {
      _UR = {}; E = D.estado; C = D.cand; RK = D.rk || {}; SEC = mapSec(); SEM_APTOS = !SEC.some(function (s) { return s.apt > 0; });
      Object.keys(paineis).forEach(function (a) { paineis[a].redesenhar(); });
    },
    esconder: function () { Object.keys(MODOS).forEach(function (a) { if (paineis[a]) paineis[a].esconder(); else { var el = document.getElementById(MODOS[a]); if (el) el.hidden = true; } }); }
  };
  }

  window.EleicaoPainelFabrica = fabrica;
  if (window.TCHE_2026) window.PainelEleicao = fabrica(window.TCHE_2026, { '2022': 'resultados2022', '2026': 'resultados2026', 'comparar': 'resultadosComparar' });
  if (window.FELIPE_2024) window.PainelFelipe = fabrica(window.FELIPE_2024, { '2024': 'resultadosFelipe' });
  if (window.GOVERNO_2026) window.PainelGoverno = fabrica(window.GOVERNO_2026, { '2026': 'resultadosGoverno' });
  if (window.GOVERNO_2T_2026) window.PainelGoverno2T = fabrica(window.GOVERNO_2T_2026, { '2026': 'resultadosGoverno2T' });   // aba Eleições (2º turno)

  /* abas de cargo/candidato dentro de Resultados: Deputado Estadual (Tchê), Vereador (Felipe Tchê), Governo (Mailza Assis) e Outro político (js/eleicao-outro.js) */
  var cands = document.querySelectorAll('.cand-res');
  var CANDS = {
    tche: { el: 'cand-tche', painel: function () { return window.PainelEleicao; }, ano: null },
    felipe: { el: 'cand-felipe', painel: function () { return window.PainelFelipe; }, ano: '2024' },
    governo: { el: 'cand-governo', painel: function () { return window.PainelGoverno; }, ano: '2026' },
    outro: { el: 'cand-outro', painel: function () { return window.PainelOutro; }, ano: '2026' }
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
