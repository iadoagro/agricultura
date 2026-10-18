/* Visões extras de "Mostrar mais → inserções": Por município, Por escritório, Por serviço, Por técnico e
   Por horário. Como Por lançador/dia/semana/mês, a unidade é o LANÇAMENTO e a data é a de INSERÇÃO (r.d);
   a hora é a do carimbo (r.h). Só aparecem para quem está logado (ficam fora da versão pública).
   Usa window.PAINEL_API (js/dashboard.js). */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A) return;
  var G = A.G;
  var NI = A.NI;
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function foraDoHorario(r) { return !!r.h && (r.h < '07:00' || r.h >= '18:00'); }
  function dataBR(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
  function rotMes(ym, multiAno) { return MESES[+ym.slice(5, 7) - 1] + (multiAno ? '/' + ym.slice(2, 4) : ''); }
  function pct(a, b) { return b ? a / b * 100 : 0; }
  function el(id) { return document.getElementById(id); }

  var LEG_SETA = '<p class="cal-leg"><span><b style="color:#1a9850">&#9650;</b> subiu em relação ao mês anterior</span>' +
    '<span><b style="color:#d64545">&#9660;</b> caiu em relação ao mês anterior</span></p>';

  /** seta de variação contra o período anterior: verde ▲ subiu, vermelha ▼ caiu (sem seta quando igual ou sem anterior) */
  function seta(v, ant) {
    if (ant == null || v === ant) return '';
    var sobe = v > ant, d = v - ant;
    return '<small style="font-size:.62rem;font-weight:700;line-height:1;color:' + (sobe ? '#1a9850' : '#d64545') + '">' +
      (sobe ? '&#9650;' : '&#9660;') + (sobe ? '+' : '') + d + '</small>';
  }
  function dicaVar(v, ant) {
    if (ant == null || v === ant) return '';
    return ' (' + (v > ant ? 'subiu ' : 'caiu ') + Math.abs(v - ant) + ' em relação ao anterior, que teve ' + ant + ')';
  }

  /** dimensões: sufixo dos ids no HTML, nome no plural e como achar o grupo de cada registro */
  var DIMS = {
    imun: { s: 'Mun', dim: 'mun', rot: 'Município', plural: 'municípios', k: function (r) { return r.mun || NI; } },
    iesc: { s: 'Esc', dim: 'esc', rot: 'Escritório', plural: 'escritórios', k: function (r) { return r.esc || NI; } },
    iserv: { s: 'Serv', dim: 'pc', rot: 'Serviço', plural: 'serviços', k: function (r) { return r.pc || 'Sem serviço'; } },
    itec: { s: 'Tec', dim: 'tec', rot: 'Técnico', plural: 'técnicos', k: function (r) { return r.rt || NI; } }
  };

  function agrupar(D, def) {
    var m = new Map();
    D.forEach(function (r) {
      if (!r.d) return;
      var k = def.k(r), g = m.get(k);
      if (!g) m.set(k, g = { nome: k, n: 0, fora: 0, dias: new Set(), quem: new Set(), ini: r.d, fim: r.d, mes: new Map() });
      g.n++;
      if (foraDoHorario(r)) g.fora++;
      g.dias.add(r.d);
      if (r.alim) g.quem.add(r.alim);
      if (r.d < g.ini) g.ini = r.d;
      if (r.d > g.fim) g.fim = r.d;
      var ym = r.d.slice(0, 7);
      g.mes.set(ym, (g.mes.get(ym) || 0) + 1);
    });
    return Array.from(m.values()).sort(function (a, b) { return b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'); });
  }

  function mesesDe(D) {
    var s = new Set();
    D.forEach(function (r) { if (r.d) s.add(r.d.slice(0, 7)); });
    return Array.from(s).sort();
  }

  function tabela(alvo, cab, linhas) {
    var div = el(alvo);
    if (!div) return;
    if (!linhas.length) { if (G.vazio) G.vazio(div); else div.innerHTML = ''; return; }
    div.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' + cab.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : '') + '>' + c.t + '</th>';
    }).join('') + '</tr></thead><tbody>' + linhas.map(function (l) {
      return '<tr>' + l.map(function (v, i) {
        return '<td' + (cab[i].num ? ' class="num"' : i === 0 ? ' class="forte"' : '') + '>' + v + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }


  /* ---------------------------------------------------------------- calendários
     Mesma aparência do calendário de "Por dia": mês a mês, verde = teve inserção (quanto mais forte, mais
     lançamentos), vermelho = dia útil sem inserção, ☾ = parte inserida fora do expediente, FS = fim de semana. */
  var ESTADO = {};      // grupo escolhido em cada visão
  var ULTIMO = {};      // último contexto de cada visão (para redesenhar ao trocar o grupo)
  var CAB = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  var MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function legenda() {
    return '<p class="cal-leg"><span><span class="cal-chip cal-ok cal-n3"></span>teve inserção</span>' +
      '<span><span class="cal-chip cal-sem"></span>dia útil sem inserção</span>' +
      '<span><span class="cal-chip cal-fds"></span>fim de semana</span>' +
      '<span><em class="cal-mk cal-mk-fds">FS</em>lançado no fim de semana</span>' +
      '<span><em class="cal-mk cal-mk-noite">&#9790;</em>fora do expediente (antes das 7h ou depois das 18h)</span></p>';
  }

  /** regs: registros já filtrados para o grupo; ini/fim: intervalo de datas da seleção inteira */
  function calendario(regs, ini, fim, g) {
    var gAttr = g ? ' data-cal-g="' + G.esc(g) + '"' : '';
    if (!ini) return '<p class="nota">Sem inserções na seleção.</p>';
    var dias = new Map(), max = 1;
    regs.forEach(function (r) {
      if (!r.d) return;
      var x = dias.get(r.d);
      if (!x) dias.set(r.d, x = { n: 0, fora: 0 });
      x.n++;
      if (foraDoHorario(r)) x.fora++;
      if (x.n > max) max = x.n;
    });
    var ms = [], y = +ini.slice(0, 4), m = +ini.slice(5, 7), yf = +fim.slice(0, 4), mf = +fim.slice(5, 7);
    while (y < yf || (y === yf && m <= mf)) { ms.push([y, m]); if (++m > 12) { m = 1; y++; } }
    var html = ms.map(function (ym) {
      var ano = ym[0], mes = ym[1], pre = ano + '-' + (mes < 10 ? '0' : '') + mes;
      var nDias = new Date(ano, mes, 0).getDate();
      var off = (new Date(ano, mes - 1, 1).getDay() + 6) % 7, total = 0;
      var h = '<div class="cal-mes"><h4 class="cal-link" data-cal-t="mes" data-cal-k="' + pre + '"' + gAttr + '>' + MESES_L[mes - 1] + ' de ' + ano + '</h4><div class="cal-grade">' +
        CAB.map(function (c) { return '<span class="cal-cab">' + c + '</span>'; }).join('');
      for (var v = 0; v < off; v++) h += '<span class="cal-dia cal-fora"></span>';
      for (var d = 1; d <= nDias; d++) {
        var iso = pre + '-' + (d < 10 ? '0' : '') + d, dow = new Date(ano, mes - 1, d).getDay(), fds = dow === 0 || dow === 6;
        var x = dias.get(iso), cls = 'cal-dia', attr = '', cont = '<i>' + d + '</i>';
        if (x) {
          total += x.n;
          cls += ' cal-ok cal-n' + Math.max(1, Math.min(4, Math.ceil(x.n / max * 4)));
          cont += '<b>' + G.num(x.n) + '</b>';
          cls += ' cal-link'; attr = ' data-cal-t="dia" data-cal-k="' + iso + '"' + gAttr;
          var mk = '';
          if (fds) { mk += '<em class="cal-mk cal-mk-fds" title="Lançado no fim de semana">FS</em>'; cls += ' cal-fds-ins'; }
          if (x.fora) mk += '<em class="cal-mk cal-mk-noite" title="' + x.fora + ' inserção(ões) fora do expediente">&#9790;' + x.fora + '</em>';
          if (mk) cont += '<span class="cal-marcas">' + mk + '</span>';
        } else if (iso < ini || iso > fim) cls += ' cal-fora';
        else if (fds) { cls += ' cal-fds'; attr = ' data-cal-t="vazio" data-cal-k="' + iso + '" data-cal-m="fds"' + gAttr; }
        else { cls += ' cal-sem'; cont += '<small>—</small>'; attr = ' data-cal-t="vazio" data-cal-k="' + iso + '"' + gAttr; }
        h += '<span class="' + cls + '"' + attr + '>' + cont + '</span>';
      }
      return h + '</div><p class="cal-sub" style="margin:4px 0 0;font-size:.78rem;opacity:.7">' + G.num(total) + ' lançamentos no mês</p></div>';
    }).join('');
    return legenda() + '<div class="cal-meses">' + html + '</div>';
  }

  function intervalo(D) {
    var ini = '', fim = '';
    D.forEach(function (r) { if (!r.d) return; if (!ini || r.d < ini) ini = r.d; if (!fim || r.d > fim) fim = r.d; });
    return [ini, fim];
  }

  function pintarCalDim(key, def, C, lista) {
    var alvo = el('gCal' + def.s);
    if (!alvo) return;
    var sel = ESTADO[key];
    if (sel == null || (sel && sel !== '*' && !lista.some(function (g) { return g.nome === sel; }))) sel = ESTADO[key] = lista[0] ? lista[0].nome : '';
    var iv = intervalo(C.D);
    var regs = sel === '*' ? C.D : C.D.filter(function (r) { return def.k(r) === sel; });
    var g = lista.filter(function (x) { return x.nome === sel; })[0];
    alvo.innerHTML = '<div class="tf-bar"><label class="tf-campo">' + def.rot + ' <select id="calSel' + def.s + '">' +
      '<option value="*"' + (sel === '*' ? ' selected' : '') + '>Todos (soma)</option>' +
      lista.map(function (x) {
        return '<option value="' + G.esc(x.nome) + '"' + (x.nome === sel ? ' selected' : '') + '>' + G.esc(x.nome) + ' (' + G.num(x.n) + ')</option>';
      }).join('') + '</select></label><span class="tf-cont">' +
      (g ? G.num(g.n) + ' lançamentos em ' + G.num(g.dias.size) + ' dias' : sel === '*' ? G.num(regs.length) + ' lançamentos' : '') +
      '</span></div>' + calendario(regs, iv[0], iv[1], sel === '*' ? '' : def.dim + '|' + sel);
    var s = el('calSel' + def.s);
    if (s) s.addEventListener('change', function () { ESTADO[key] = s.value; pintarCalDim(key, def, ULTIMO[key], lista); });
  }


  /** Mapa de calor grupo × mês: cada linha é um grupo (os 15 maiores), cada coluna um mês; quanto mais forte a cor, mais lançamentos. */
  function mapaGrupoMes(S, lista, meses, multiAno) {
    var alvo = el('gHeat' + S);
    if (!alvo) return;
    var top = lista.slice(0, 15);
    if (!top.length || !meses.length) { if (G.vazio) G.vazio(alvo); return; }
    var mx = 1;
    top.forEach(function (g) { g.mes.forEach(function (v) { if (v > mx) mx = v; }); });
    var out = '<div style="display:grid;grid-template-columns:minmax(110px,1.4fr) repeat(' + meses.length + ',minmax(34px,1fr)) 56px;gap:3px;overflow-x:auto;align-items:stretch"><span></span>';
    meses.forEach(function (ym) { out += '<span class="cal-cab">' + rotMes(ym, multiAno) + '</span>'; });
    out += '<span class="cal-cab">Total</span>';
    top.forEach(function (g) {
      out += '<span class="cal-cab" style="text-align:right;align-self:center;padding-right:6px" title="' + G.esc(g.nome) + '">' + G.esc(g.nome) + '</span>';
      meses.forEach(function (ym, i) {
        var v = g.mes.get(ym) || 0, ant = i ? (g.mes.get(meses[i - 1]) || 0) : null;
        out += '<span class="cal-dia ' + (v ? 'cal-ok cal-n' + Math.max(1, Math.min(4, Math.ceil(v / mx * 4))) : 'cal-fds') +
          '" style="min-height:34px;justify-content:center" title="' + G.esc(g.nome) + ', ' + rotMes(ym, true) + ': ' + v + ' lançamento(s)' + dicaVar(v, ant) + '">' +
          (v ? '<b style="font-size:.78rem">' + G.num(v) + '</b>' : '') + seta(v, ant) + '</span>';
      });
      out += '<span class="cal-dia" style="min-height:30px;justify-content:center"><b style="font-size:.8rem">' + G.num(g.n) + '</b></span>';
    });
    alvo.innerHTML = LEG_SETA + out + '</div>' + (lista.length > top.length ? '<p class="nota">Mostrando os ' + top.length + ' maiores de ' + lista.length + '.</p>' : '');
  }

  function desenharDim(key, def, C) {
    var D = C.D, S = def.s;
    var lista = agrupar(D, def), total = lista.reduce(function (a, g) { return a + g.n; }, 0);
    var meses = mesesDe(D), multiAno = meses.length && meses[0].slice(0, 4) !== meses[meses.length - 1].slice(0, 4);
    var topo = lista[0], top3 = lista.slice(0, 3).reduce(function (a, g) { return a + g.n; }, 0);
    var fora = lista.reduce(function (a, g) { return a + g.fora; }, 0);
    var porDia = lista.slice().sort(function (a, b) { return b.n / b.dias.size - a.n / a.dias.size; })[0];

    ULTIMO[key] = C;
    mapaGrupoMes(S, lista, meses, multiAno);
    pintarCalDim(key, def, C, lista);

    A.tiles('kpisIns' + S, [
      { _sec: 'Visão geral' },
      { rot: 'Lançamentos', val: G.num(total) },
      { rot: 'Com lançamento', val: G.num(lista.length), sub: def.plural },
      { rot: 'Fora do expediente', val: G.num(pct(fora, total), 0), un: '%', sub: 'antes das 7h ou a partir das 18h' },
      { _sec: 'Destaques' },
      { rot: 'Mais lançamentos', val: topo ? G.esc(topo.nome) : '—', cls: 'texto',
        sub: topo ? G.num(topo.n) + ' (' + G.num(pct(topo.n, total), 0) + '% do total)' : '' },
      { rot: 'Três maiores juntos', val: G.num(pct(top3, total), 0), un: '%', sub: 'concentração do total' },
      { rot: 'Maior ritmo por dia ativo', val: porDia ? G.esc(porDia.nome) : '—', cls: 'texto',
        sub: porDia ? G.num(porDia.n / porDia.dias.size, 1) + ' lançamentos por dia com inserção' : '' }
    ]);

    A.pintarCat('gIns' + S + 'Rank', lista.slice(0, 20).map(function (g) { return { rot: g.nome, val: g.n }; }));
    A.pintarCat('gIns' + S + 'Fora', lista.slice(0, 12).map(function (g) {
      return { rot: g.nome, val: +pct(g.fora, g.n).toFixed(1) };
    }), { unidade: '%', dec: 1, cor: 'var(--s3)' });

    var rotulos = meses.map(function (ym) { return rotMes(ym, multiAno); });
    var series = lista.slice(0, 5).map(function (g, i) {
      return { nome: g.nome, slot: i, valores: meses.map(function (ym) { return g.mes.get(ym) || 0; }) };
    });
    if (series.length) A.pintarSerie('gIns' + S + 'Mes', rotulos, series);
    else if (G.vazio) G.vazio(el('gIns' + S + 'Mes'));

    tabela('tIns' + S, [
      { t: def.rot }, { t: 'Lançamentos', num: 1 }, { t: '% do total', num: 1 }, { t: 'Dias ativos', num: 1 },
      { t: 'Por dia ativo', num: 1 }, { t: 'Inseridores', num: 1 }, { t: 'Fora do expediente', num: 1 },
      { t: 'Primeiro', num: 1 }, { t: 'Último', num: 1 }
    ], lista.map(function (g) {
      return [G.esc(g.nome), G.num(g.n), G.num(pct(g.n, total), 1) + '%', G.num(g.dias.size),
        G.num(g.n / g.dias.size, 1), G.num(g.quem.size), G.num(pct(g.fora, g.n), 0) + '%',
        dataBR(g.ini), dataBR(g.fim)];
    }));
  }

  var TURNOS = [
    { rot: 'Antes das 7h', f: function (h) { return h < '07:00'; } },
    { rot: 'Expediente (7h–18h)', f: function (h) { return h >= '07:00' && h < '18:00'; } },
    { rot: 'Depois das 18h', f: function (h) { return h >= '18:00'; } }
  ];

  function desenharHora(C) {
    var D = C.D.filter(function (r) { return r.d; });
    var comHora = D.filter(function (r) { return r.h; });
    var horas = new Array(24).fill(0), turno = TURNOS.map(function () { return 0; });
    var fds = 0, mesDentro = new Map(), mesFora = new Map();
    comHora.forEach(function (r) {
      var h = parseInt(r.h.slice(0, 2), 10);
      if (h >= 0 && h < 24) horas[h]++;
      TURNOS.forEach(function (t, i) { if (t.f(r.h)) turno[i]++; });
      var dow = new Date(r.d + 'T12:00:00').getDay();
      if (dow === 0 || dow === 6) fds++;
      var ym = r.d.slice(0, 7), alvo = foraDoHorario(r) ? mesFora : mesDentro;
      alvo.set(ym, (alvo.get(ym) || 0) + 1);
    });
    var n = comHora.length;
    var pico = horas.reduce(function (b, v, h) { return v > horas[b] ? h : b; }, 0);
    var foraN = turno[0] + turno[2];
    var dias = new Set(comHora.map(function (r) { return r.d; }));
    var noite = new Set();
    comHora.forEach(function (r) { if (r.h >= '18:00') noite.add(r.d); });

    A.tiles('kpisInsHora', [
      { _sec: 'Horário das inserções' },
      { rot: 'Lançamentos com hora', val: G.num(n), sub: D.length - n ? G.num(D.length - n) + ' sem hora registrada' : 'todos têm hora' },
      { rot: 'Hora de pico', val: n ? pico + 'h' : '—', sub: n ? G.num(horas[pico]) + ' lançamentos (' + G.num(pct(horas[pico], n), 0) + '%)' : '' },
      { rot: 'Dentro do expediente', val: G.num(pct(turno[1], n), 0), un: '%', sub: '7h às 18h' },
      { _sec: 'Fora do expediente' },
      { rot: 'Antes das 7h ou depois das 18h', val: G.num(foraN), sub: G.num(pct(foraN, n), 0) + '% do total' },
      { rot: 'Fim de semana', val: G.num(fds), sub: G.num(pct(fds, n), 0) + '% do total' },
      { rot: 'Dias com inserção à noite', val: G.num(noite.size), sub: 'de ' + G.num(dias.size) + ' dias com inserção' }
    ]);


    // mapa de calor: mês × hora do dia (mostra se o horário de trabalho mudou ao longo do tempo)
    if (el('gHeatHoraMes')) {
      var mesesH = mesesDe(comHora), mxm = 1, mh = {}, hmin = 24, hmax = -1;
      comHora.forEach(function (r) {
        var hh = parseInt(r.h.slice(0, 2), 10), ym = r.d.slice(0, 7);
        if (!(hh >= 0 && hh < 24)) return;
        var l = mh[ym] || (mh[ym] = new Array(24).fill(0));
        if (++l[hh] > mxm) mxm = l[hh];
        if (hh < hmin) hmin = hh;
        if (hh > hmax) hmax = hh;
      });
      if (!mesesH.length || hmax < 0) { G.vazio(el('gHeatHoraMes')); }
      else {
        var multi = mesesH[0].slice(0, 4) !== mesesH[mesesH.length - 1].slice(0, 4);
        var outm = '<div style="display:grid;grid-template-columns:56px repeat(' + (hmax - hmin + 1) + ',minmax(0,1fr));gap:3px;overflow-x:auto"><span></span>';
        for (var a1 = hmin; a1 <= hmax; a1++) outm += '<span class="cal-cab">' + a1 + 'h</span>';
        mesesH.forEach(function (ym, im) {
          outm += '<span class="cal-cab" style="text-align:right;align-self:center">' + rotMes(ym, multi) + '</span>';
          for (var b1 = hmin; b1 <= hmax; b1++) {
            var v1 = (mh[ym] || [])[b1] || 0, an1 = im ? ((mh[mesesH[im - 1]] || [])[b1] || 0) : null;
            outm += '<span class="cal-dia ' + (v1 ? 'cal-ok cal-n' + Math.max(1, Math.min(4, Math.ceil(v1 / mxm * 4))) : 'cal-fds') +
              '" style="min-height:34px;justify-content:center" title="' + rotMes(ym, true) + ', ' + b1 + 'h: ' + v1 + ' lançamento(s)' + dicaVar(v1, an1) + '">' +
              (v1 ? '<b style="font-size:.78rem">' + G.num(v1) + '</b>' : '') + seta(v1, an1) + '</span>';
          }
        });
        el('gHeatHoraMes').innerHTML = LEG_SETA + outm + '</div>';
      }
    }

    // mapa de calor: dia da semana × hora do dia
    if (el('gHeatHora')) {
      var grade = [0, 1, 2, 3, 4, 5, 6].map(function () { return new Array(24).fill(0); }), mx = 1;
      comHora.forEach(function (r) {
        var dw = (new Date(r.d + 'T12:00:00').getDay() + 6) % 7, hh = parseInt(r.h.slice(0, 2), 10);
        if (hh >= 0 && hh < 24 && ++grade[dw][hh] > mx) mx = grade[dw][hh];
      });
      var h0 = 24, h1 = -1;
      grade.forEach(function (l) { l.forEach(function (v, hh) { if (v) { if (hh < h0) h0 = hh; if (hh > h1) h1 = hh; } }); });
      if (h1 < 0) { G.vazio(el('gHeatHora')); }
      else {
        var cols = h1 - h0 + 1, out = '<div style="display:grid;grid-template-columns:44px repeat(' + cols + ',minmax(0,1fr));gap:3px;overflow-x:auto"><span></span>';
        for (var a = h0; a <= h1; a++) out += '<span class="cal-cab">' + a + 'h</span>';
        grade.forEach(function (l, dw) {
          out += '<span class="cal-cab" style="text-align:right;align-self:center">' + CAB[dw] + '</span>';
          for (var b = h0; b <= h1; b++) {
            var v = l[b];
            out += '<span class="cal-dia ' + (v ? 'cal-ok cal-n' + Math.max(1, Math.min(4, Math.ceil(v / mx * 4))) : 'cal-fds') +
              '" style="min-height:34px;justify-content:center" title="' + CAB[dw] + ', ' + b + 'h: ' + v + ' lançamento(s)">' +
              (v ? '<b style="font-size:.8rem">' + G.num(v) + '</b>' : '') + '</span>';
          }
        });
        el('gHeatHora').innerHTML = out + '</div>';
      }
    }

    A.pintarCat('gInsHoraHora', horas.map(function (v, h) { return { rot: (h < 10 ? '0' : '') + h + 'h', val: v }; })
      .filter(function (d) { return d.val > 0; }));
    A.pintarCat('gInsHoraTurno', TURNOS.map(function (t, i) { return { rot: t.rot, val: turno[i] }; })
      .filter(function (d) { return d.val > 0; }));

    var meses = mesesDe(comHora), multiAno = meses.length && meses[0].slice(0, 4) !== meses[meses.length - 1].slice(0, 4);
    if (meses.length) {
      A.pintarSerie('gInsHoraMes', meses.map(function (ym) { return rotMes(ym, multiAno); }), [
        { nome: 'No expediente', slot: 0, valores: meses.map(function (ym) { return mesDentro.get(ym) || 0; }) },
        { nome: 'Fora do expediente', slot: 2, valores: meses.map(function (ym) { return mesFora.get(ym) || 0; }) }
      ]);
    } else if (G.vazio) G.vazio(el('gInsHoraMes'));

    tabela('tInsHora', [{ t: 'Hora' }, { t: 'Lançamentos', num: 1 }, { t: '% do total', num: 1 }, { t: 'Faixa' }],
      horas.map(function (v, h) {
        var t = (h < 10 ? '0' : '') + h;
        return [t + 'h às ' + t + 'h59', v, G.num(pct(v, n), 1) + '%',
          h < 7 ? 'Antes das 7h' : h >= 18 ? 'Depois das 18h' : 'Expediente'];
      }).filter(function (l) { return l[1] > 0; }).map(function (l) { l[1] = G.num(l[1]); return l; }));
  }

  Object.keys(DIMS).forEach(function (k) {
    A.registrarAba(k, function (C) { desenharDim(k, DIMS[k], C); });
  });
  A.registrarAba('ihora', function (C) { desenharHora(C); });
})();
