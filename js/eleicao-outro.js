/* Aba "Outro político" de Resultados: escolha qualquer candidato do 1º turno de 2026 (Presidente, Governador, Senador,
   Deputado Federal ou Deputado Estadual) e veja o mesmo painel dos demais (resumo, mapa, regional, município, zona, bairro,
   local e seção). Os dados vêm dos boletins por seção (js/dados-boletins-2026.js + js/boletins-2026/mun-<cod>.js, carregados
   sob demanda) e o painel é montado pela fábrica de js/eleicao-painel.js (window.EleicaoPainelFabrica). */
(function () {
  'use strict';
  var B = window.BOLETINS_2026, T = window.TCHE_2026, raiz = document.getElementById('outroSeletor');
  if (!raiz || !B || !T) return;
  var MAJ = [true, true, true, false, false];   // cargos majoritários (Presidente, Governador, Senador)
  var st = { cargo: 1, q: '', totais: null, sel: null, tok: 0 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('pt-BR'); }
  function cap(t) { return String(t).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (D[aeo]s?|E) /g, function (x) { return x.toLowerCase(); }); }
  function semAc(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function ehCand(ci, num) { return MAJ[ci] || num >= 100; }   // nos cargos proporcionais, número de 2 dígitos é voto de legenda
  function carrega() { return window.carregaBoletins26 ? window.carregaBoletins26(B.secoes.map(function (a) { return a[0]; })) : Promise.reject(new Error('módulo de boletins indisponível')); }

  function totaisCargo(ci) {   // votos de cada candidato no estado
    var m = new Map(), BOL = window.BOL26 || {};
    Object.keys(BOL).forEach(function (mun) {
      var d = BOL[mun];
      Object.keys(d).forEach(function (k) { var c = d[k][ci]; if (c) c[0].forEach(function (p) { if (ehCand(ci, p[0])) m.set(p[0], (m.get(p[0]) || 0) + p[1]); }); });
    });
    return Array.from(m.entries()).map(function (p) { return { num: p[0], nome: B.cargos[ci].cand[p[0]] || ('Candidato ' + p[0]), v: p[1] }; }).sort(function (a, b) { return b.v - a.v; });
  }

  function monta(ci, num, nomeCand, lista) {   // dados no formato de dados-governo-2026.js
    var BOL = window.BOL26, cargo = B.cargos[ci], majo = MAJ[ci], SEMB = '(sem bairro informado)';
    var estado = new Map(), br = 0, nu = 0, linhas = [], unid = { reg: {}, mun: {}, zona: {}, bairro: {}, local: {}, sec: {} };
    var partido = majo ? 0 : Math.floor(num / (ci === 3 ? 100 : 1000)), legenda = 0;
    B.secoes.forEach(function (a) {
      var mun = a[0], zona = a[1], sec = a[2], loc = a[3], d = BOL[mun] && BOL[mun][zona + '|' + sec], c = d && d[ci];
      if (!c) return;
      var meu = 0, maxC = 0, nom = 0;
      c[0].forEach(function (p) {
        if (!ehCand(ci, p[0])) { if (!majo && p[0] === partido) legenda += p[1]; nom += p[1]; return; }
        nom += p[1]; estado.set(p[0], (estado.get(p[0]) || 0) + p[1]);
        if (p[0] === num) meu = p[1]; if (p[1] > maxC) maxC = p[1];
      });
      br += c[1]; nu += c[2];
      var tot = nom + c[1] + c[2];
      linhas.push([mun, zona, sec, loc, 0, tot, meu, tot, c[1], c[2], 0, meu > 0 && meu === maxC ? 1 : 0]);
      var li = T.locais[mun + '|' + zona + '|' + loc], bairro = li && li[1] && li[1].trim() ? li[1].trim() : SEMB;
      var ks = { reg: T.regional[mun] || 'Outras', mun: mun, zona: mun + '|' + zona, bairro: mun + '|' + bairro, local: mun + '|' + zona + '|' + loc, sec: mun + '|' + zona + '|' + sec };
      Object.keys(ks).forEach(function (n) {
        var u = unid[n][ks[n]] || (unid[n][ks[n]] = {});
        c[0].forEach(function (p) { if (ehCand(ci, p[0])) u[p[0]] = (u[p[0]] || 0) + p[1]; });
      });
    });
    var rk = {};
    Object.keys(unid).forEach(function (n) {
      rk[n] = {};
      Object.keys(unid[n]).forEach(function (k) {
        var u = unid[n][k], vs = Object.keys(u).map(function (x) { return u[x]; }).filter(function (v) { return v > 0; }), meu = u[num] || 0;
        rk[n][k] = [meu ? 1 + vs.filter(function (v) { return v > meu; }).length : 0, vs.length];
      });
    });
    var q = estado.get(num) || 0, validos = 0, partidoNom = 0, pos = 1;
    estado.forEach(function (v, n) { validos += v; if (v > q) pos++; if (!majo && Math.floor(n / (ci === 3 ? 100 : 1000)) === partido) partidoNom += v; });
    if (!majo) validos += legendaTotal(ci);
    var D = {
      cand: { nome: cap(nomeCand), nome2022: '', numero: num, partido: majo ? '' : (cargo.cand[partido] ? cap(cargo.cand[partido]) : 'Partido ' + partido), numPartido: partido, cargo: cargo.nome, vagas: cargo.vagas,
        nomeCompleto: cap(nomeCand), eleito: false, majoritario: majo, sem22: true, ano: 2026 },
      estado: { q: q, apurado: validos + br + nu, brancos: br, nulos: nu, validos: validos, pos: pos, nCand: estado.size, partidoNominais: partidoNom, partidoLegenda: legenda },
      estado22: { q: 0, qMapeado: 0, semCorresp: [] },
      secoes: linhas, rk: rk
    };
    if (majo) D.candidatos = lista.map(function (x) { return { num: x.num, nome: x.nome, votos: x.v }; });
    ['municipios', 'regional', 'locais', 'coords', 'mapa', 'regionais'].forEach(function (k) { D[k] = T[k]; });
    return D;
  }
  function legendaTotal(ci) {   // votos de legenda de todos os partidos (entram nos votos válidos dos cargos proporcionais)
    var t = 0, BOL = window.BOL26;
    Object.keys(BOL).forEach(function (m) { Object.keys(BOL[m]).forEach(function (k) { var c = BOL[m][k][ci]; if (c) c[0].forEach(function (p) { if (p[0] < 100) t += p[1]; }); }); });
    return t;
  }

  /* ---------- seletor ---------- */
  function lista() {
    var q = semAc(st.q).trim(), todos = st.totais || [];
    var f = q ? todos.filter(function (x) { return (semAc(x.nome) + ' ' + x.num).indexOf(q) >= 0; }) : todos;
    return f;
  }
  function desenhaLista() {
    var box = raiz.querySelector('[data-outro-lista]'); if (!box) return;
    if (!st.totais) { box.innerHTML = '<p class="resultados-dica">Carregando candidatos…</p>'; return; }
    var f = lista(), tot = st.totais.reduce(function (s, x) { return s + x.v; }, 0), max = f.length ? f[0].v : 1;
    box.innerHTML = f.slice(0, 60).map(function (x, i) {
      return '<button type="button" class="outro-cand' + (st.sel === x.num + '|' + st.cargo ? ' ativa' : '') + '" data-num="' + x.num + '"><span class="outro-nome">' + esc(cap(x.nome)) + '</span><small>nº ' + x.num + ' · ' + fmt(x.v) + ' votos (' + (tot ? (x.v / tot * 100).toFixed(1).replace('.', ',') : '0') + '%)</small><i style="width:' + Math.max(2, x.v / max * 100).toFixed(1) + '%"></i></button>';
    }).join('') || '<p class="resultados-dica">Nenhum candidato encontrado.</p>';
    raiz.querySelector('[data-outro-cont]').textContent = f.length > 60 ? 'Mostrando 60 de ' + fmt(f.length) + ' candidatos — digite para filtrar.' : fmt(f.length) + ' candidato' + (f.length === 1 ? '' : 's') + '.';
  }
  function desenhaSeletor() {
    raiz.innerHTML = '<div class="outro-barra"><label>Cargo<select data-outro-cargo>' + B.cargos.map(function (c, i) { return '<option value="' + i + '"' + (i === st.cargo ? ' selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('') + '</select></label>' +
      '<label class="outro-busca">Buscar político<input type="search" data-outro-q placeholder="nome ou número" value="' + esc(st.q) + '" autocomplete="off"></label></div>' +
      '<p class="t26-sub" data-outro-cont></p><div class="outro-lista" data-outro-lista></div>';
    desenhaLista();
  }
  function prepara() {
    var tok = ++st.tok; st.totais = null; desenhaLista();
    carrega().then(function () { if (tok !== st.tok) return; st.totais = totaisCargo(st.cargo); desenhaLista(); })
      .catch(function (e) { var b = raiz.querySelector('[data-outro-lista]'); if (b) b.innerHTML = '<p class="resultados-dica">' + esc(e.message) + '</p>'; });
  }
  function escolhe(num) {
    var x = st.totais.find(function (y) { return y.num === num; }); if (!x) return;
    st.sel = num + '|' + st.cargo; desenhaLista();
    var alvo = document.getElementById('outroPainel');
    alvo.innerHTML = '<div id="resultadosOutro" hidden></div>';
    var D = monta(st.cargo, num, x.nome, st.totais);
    window.__outroD = D;
    var P = window.EleicaoPainelFabrica(D, { '2026': 'resultadosOutro' }); st.painel = P; P.mostrar('2026');
    alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  raiz.addEventListener('change', function (e) { if (e.target.matches('[data-outro-cargo]')) { st.cargo = +e.target.value; st.sel = null; prepara(); } });
  raiz.addEventListener('input', function (e) { if (e.target.matches('[data-outro-q]')) { st.q = e.target.value; desenhaLista(); } });
  raiz.addEventListener('click', function (e) { var b = e.target.closest('[data-num]'); if (b) escolhe(+b.dataset.num); });

  var iniciado = false;
  window.PainelOutro = {
    mostrar: function () { if (!iniciado) { iniciado = true; desenhaSeletor(); prepara(); } else if (st.painel) st.painel.mostrar('2026'); },
    esconder: function () { if (st.painel) st.painel.esconder(); }
  };
})();
