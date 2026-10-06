/* Aba "Boletins" de eleicoes.html: boletim de urna (1º turno de 2026) de TODAS as seções do Acre, para Presidente, Governador,
   Senador (2 vagas), Deputado Federal e Deputado Estadual. Dados: js/dados-boletins-2026.js (índice das seções) e
   js/boletins-2026/mun-<cod>.js (votos, carregados por município só quando preciso), gerados por tools/gerar_boletins_2026.py;
   municípios, regionais e locais vêm de js/dados-tche-2026.js. Navegação em grupos por nível (regional, município, zona, bairro,
   local de votação, seção), filtros em cascata, boletim consolidado de cada grupo e exportação em PDF (jsPDF, baixado só no clique). */
(function () {
  'use strict';
  var raiz = document.getElementById('boletinsRaiz');
  var B = window.BOLETINS_2026, T = window.TCHE_2026;
  if (!raiz) return;
  if (!B || !T) { raiz.innerHTML = '<p class="resultados-dica">Não foi possível carregar os dados dos boletins.</p>'; return; }

  var POR_PAGINA = 10, POR_PAGINA_GRUPOS = 12, SEM_BAIRRO = '(sem bairro informado)';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('pt-BR'); }
  function pad(n, l) { return String(n).padStart(l, '0'); }
  function cap(t) { return String(t).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (D[aeo]s?|E) /g, function (x) { return x.toLowerCase(); }); }
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }

  /* ---------- registros: uma seção = um boletim (os votos chegam por município, sob demanda) ---------- */
  var BU = B.secoes.map(function (a) {
    var li = T.locais[a[0] + '|' + a[1] + '|' + a[3]] || [];
    return { mun: a[0], zona: a[1], secao: a[2], local: a[3], cargos: null, agreg: a[5] || [], aptos: a[4] || 0,
      munNome: cap(T.municipios[a[0]] || a[0]), reg: T.regional[a[0]] || 'Outras',
      localNome: cap(li[0] || 'Local ' + a[3]).replace(/^Instituto Federal do Acre \(ifac\)/i, 'IFAC'), bairro: li[1] && li[1].trim() ? li[1].trim() : SEM_BAIRRO, end: cap(li[2] || '') };
  }).map(function (b) { b.hay = semAcento([b.munNome, b.reg, b.localNome, b.bairro, b.end, 'zona ' + b.zona, 'secao ' + b.secao, b.zona + ' ' + b.secao].join(' ')); return b; }).sort(function (x, y) { return x.reg.localeCompare(y.reg, 'pt-BR') || x.munNome.localeCompare(y.munNome, 'pt-BR') || x.zona - y.zona || x.secao - y.secao; });

  function nomeBairro(b) { return b.bairro === SEM_BAIRRO ? 'Sem bairro informado' : cap(b.bairro); }
  var carregando = {};
  function carrega(muns) {   // baixa js/boletins-2026/mun-<cod>.js dos municípios que faltam e liga os votos aos boletins
    window.BOL26 = window.BOL26 || {};
    var ps = Array.from(new Set(muns)).map(function (m) {
      if (window.BOL26[m]) return Promise.resolve();
      return carregando[m] || (carregando[m] = new Promise(function (ok, falha) {
        var s = document.createElement('script'); s.src = '../js/boletins-2026/mun-' + m + '.js?v=2026101101';
        s.onload = ok; s.onerror = function () { s.remove(); delete carregando[m]; falha(new Error('não foi possível carregar os votos de ' + cap(T.municipios[m] || m))); };
        document.head.appendChild(s);
      }));
    });
    return Promise.all(ps).then(function () {
      BU.forEach(function (b) { if (!b.cargos && window.BOL26[b.mun]) b.cargos = window.BOL26[b.mun][b.zona + '|' + b.secao] || []; });
    });
  }
  window.carregaBoletins26 = carrega;   // usado por js/eleicao-outro.js
  function munsDe(lista) { return lista.map(function (b) { return b.mun; }); }

  /* ---------- níveis: filtros em cascata e navegação por grupos ---------- */
  var NIVEIS = [
    { k: 'reg', rot: 'Regional', rots: 'Regionais', todos: 'Todas', val: function (b) { return b.reg; }, lab: function (b) { return b.reg; }, tit: function (b) { return 'Regional ' + b.reg; }, ctx: function () { return ''; } },
    { k: 'mun', rot: 'Município', rots: 'Municípios', todos: 'Todos', val: function (b) { return b.mun; }, lab: function (b) { return b.munNome; }, tit: function (b) { return b.munNome; }, ctx: function (b) { return 'Regional ' + b.reg; } },
    { k: 'zona', rot: 'Zona', rots: 'Zonas', todos: 'Todas', val: function (b) { return b.mun + '|' + b.zona; }, lab: function (b, m) { return 'Zona ' + pad(b.zona, 4) + (m ? ' · ' + b.munNome : ''); }, tit: function (b) { return 'Zona ' + pad(b.zona, 4); }, ctx: function (b) { return b.munNome; } },
    { k: 'bairro', rot: 'Bairro', rots: 'Bairros', todos: 'Todos', val: function (b) { return b.mun + '|' + b.bairro; }, lab: function (b, m) { return nomeBairro(b) + (m ? ' · ' + b.munNome : ''); }, tit: function (b) { return nomeBairro(b); }, ctx: function (b) { return b.munNome; } },
    { k: 'local', rot: 'Local de votação', rots: 'Locais de votação', todos: 'Todos', val: function (b) { return b.mun + '|' + b.zona + '|' + b.local; }, lab: function (b, m) { return b.localNome + (m ? ' · ' + b.munNome : ''); }, tit: function (b) { return b.localNome; }, ctx: function (b) { return b.munNome + ' · ' + nomeBairro(b) + (b.end ? ' · ' + b.end : ''); } },
    { k: 'sec', rot: 'Seção', rots: 'Seções', todos: 'Todas', val: function (b) { return b.mun + '|' + b.zona + '|' + b.secao; }, lab: function (b, m) { return (m ? b.munNome + ' · ' : '') + 'Zona ' + pad(b.zona, 4) + ' · Seção ' + pad(b.secao, 4); }, tit: function (b) { return 'Zona ' + pad(b.zona, 4) + ' · Seção ' + pad(b.secao, 4); }, ctx: function (b) { return b.munNome + ' · ' + b.localNome; } }
  ];
  var st = { cargo: '', f: {}, pag: 0, vista: 'lista', nivel: 'reg', tok: 0, busca: '', cand: null };

  function passa(b, ate) {   // aplica a busca e os filtros dos níveis anteriores a "ate" (para as opções em cascata)
    if (st.busca && b.hay.indexOf(st.busca) < 0) return false;
    for (var i = 0; i < NIVEIS.length; i++) {
      var n = NIVEIS[i]; if (ate != null && i >= ate) break;
      if (st.f[n.k] && n.val(b) !== st.f[n.k]) return false;
    }
    return true;
  }
  function filtrados() { return BU.filter(function (b) { return passa(b); }); }
  function cargosSel() { return B.cargos.map(function (c, i) { return i; }).filter(function (i) { return st.cargo === '' || String(i) === st.cargo; }); }
  /* candidato escolhido: os boletins passam a mostrar só os votos dele */
  function candLista() {   // [{rot, ci, num}] dos candidatos (sem o voto de legenda), dos cargos em exibição
    var o = [];
    cargosSel().forEach(function (ci) {
      var c = B.cargos[ci];
      Object.keys(c.cand).forEach(function (k) {
        var num = +k; if (!(ci < 3 || num >= 100)) return;
        o.push({ rot: cap(c.cand[k]) + ' · ' + c.nome + ' · nº ' + k, ci: ci, num: num });
      });
    });
    return o.sort(function (a, b) { return a.rot.localeCompare(b.rot, 'pt-BR'); });
  }
  function linhasDe(d, i) {   // linhas de candidato de um boletim: todas, ou só a do candidato escolhido
    if (!st.cand || st.cand.ci !== i) return d[0];
    var l = d[0].filter(function (p) { return p[0] === st.cand.num; });
    return l.length ? l : [[st.cand.num, 0]];
  }
  function idxNivel(k) { return NIVEIS.findIndex(function (n) { return n.k === k; }); }

  /* ---------- filtros e abas de nível ---------- */
  function montaFiltros() {
    var h = '<label class="bol-cargo">Cargo<select data-bol="cargo"><option value="">Todos os cargos</option>' +
      B.cargos.map(function (c, i) { return '<option value="' + i + '"' + (st.cargo === String(i) ? ' selected' : '') + '>' + esc(c.nome) + (c.vagas > 1 && c.nome === 'Senador' ? ' (2 vagas)' : '') + '</option>'; }).join('') + '</select></label>';
    var cl = candLista(), atual = st.cand ? cl.find(function (x) { return x.ci === st.cand.ci && x.num === st.cand.num; }) : null;
    h += '<label class="bol-cand">Candidato <small>(mostra só os votos dele)</small><input type="search" data-bol="cand" list="bolCands" placeholder="digite o nome ou número — vazio = todos" value="' + esc(atual ? atual.rot : '') + '" autocomplete="off"></label>' +
      '<datalist id="bolCands">' + cl.map(function (x) { return '<option value="' + esc(x.rot) + '">'; }).join('') + '</datalist>';
    NIVEIS.forEach(function (n, i) {
      var vistos = new Map(), base = BU.filter(function (b) { return passa(b, i); }), multi = new Set(munsDe(base)).size > 1;
      base.forEach(function (b) { vistos.set(n.val(b), n.lab(b, multi && n.k !== 'reg' && n.k !== 'mun')); });
      var ops = Array.from(vistos.entries()).sort(function (a, b) { return a[1].localeCompare(b[1], 'pt-BR', { numeric: true }); });
      h += '<label>' + n.rot + '<select data-bol="' + n.k + '"><option value="">' + n.todos + ' (' + fmt(ops.length) + ')</option>' +
        (ops.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (st.f[n.k] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')) + '</select></label>';
    });
    document.getElementById('bolFiltros').innerHTML = h;
    raiz.querySelectorAll('[data-nivel]').forEach(function (b) { var on = b.dataset.nivel === st.nivel; b.classList.toggle('ativa', on); b.setAttribute('aria-selected', String(on)); });
  }

  /* ---------- boletins ---------- */
  function totais(d) { var v = d[0].reduce(function (s, p) { return s + p[1]; }, 0); return { nom: v, b: d[1], n: d[2], tot: v + d[1] + d[2] }; }
  function tabelaCargo(d, i, aberto, sufixo) {
    if (!d) return '';
    var c = B.cargos[i], t = totais(d);
    return '<details class="bol-cargo-det"' + (aberto ? ' open' : '') + '><summary><b>' + esc(c.nome) + '</b> <span>' + fmt(t.tot) + ' votos apurados' + (sufixo || '') + '</span></summary>' +
      '<div class="tabela-scroll"><table class="relatorio-tabela bol-tab"><thead><tr><th>Nº</th><th>Candidato</th><th class="n">Votos</th></tr></thead><tbody>' +
      linhasDe(d, i).map(function (p) { return '<tr' + (st.cand && st.cand.ci === i ? ' class="bol-destaque"' : '') + '><td>' + p[0] + '</td><td>' + esc(cap(c.cand[p[0]] || '')) + '</td><td class="n">' + fmt(p[1]) + (st.cand && st.cand.ci === i && t.tot ? ' <small>(' + (p[1] / t.tot * 100).toFixed(1).replace('.', ',') + '% do total apurado)</small>' : '') + '</td></tr>'; }).join('') +
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
  function pager(paginas) {
    document.getElementById('bolPaginas').hidden = paginas <= 1;
    document.getElementById('bolPagina').textContent = 'Página ' + (st.pag + 1) + ' de ' + paginas;
    document.getElementById('bolAnt').disabled = st.pag === 0;
    document.getElementById('bolProx').disabled = st.pag >= paginas - 1;
  }
  function agrupa(lista, k) {   // grupos do nível k dentro da lista, na ordem dos filtros
    var n = NIVEIS[idxNivel(k)], g = new Map();
    lista.forEach(function (b) {
      var v = n.val(b), x = g.get(v);
      if (!x) { x = { key: v, k: k, tit: n.tit(b), ctx: n.ctx(b), ref: b, secs: [], locais: new Set(), muns: new Set(), aptos: 0 }; g.set(v, x); }
      x.secs.push(b); x.locais.add(b.mun + '|' + b.zona + '|' + b.local); x.muns.add(b.mun); x.aptos += b.aptos;
    });
    return Array.from(g.values()).sort(function (a, b) { return a.tit.localeCompare(b.tit, 'pt-BR', { numeric: true }); });
  }
  var grupos = [];
  function cartaoGrupo(g, i) {
    var prox = NIVEIS[idxNivel(g.k) + 1];
    var nums = '<span><b>' + fmt(g.secs.length) + '</b> seç' + (g.secs.length === 1 ? 'ão' : 'ões') + '</span>' +
      (g.k === 'reg' ? '<span><b>' + g.muns.size + '</b> município' + (g.muns.size === 1 ? '' : 's') + '</span>' : '') +
      (g.k !== 'local' ? '<span><b>' + fmt(g.locais.size) + '</b> local' + (g.locais.size === 1 ? '' : 'is') + ' de votação</span>' : '') +
      (g.aptos ? '<span><b>' + fmt(g.aptos) + '</b> eleitores aptos</span>' : '');
    return '<article class="bol-grupo" data-g="' + i + '"><header><h3>' + esc(g.tit) + '</h3>' + (g.ctx ? '<p>' + esc(g.ctx) + '</p>' : '') + '</header><div class="bol-nums">' + nums + '</div>' +
      '<div class="bol-acoes"><button type="button" class="bol-btn bol-prim" data-cons="' + i + '">Boletim consolidado</button>' +
      (prox ? '<button type="button" class="bol-btn" data-desce="' + i + '">Ver ' + prox.rots.toLowerCase() + ' →</button>' : '') + '</div><div class="bol-cons" data-cons-corpo></div></article>';
  }
  function desenha() {
    var lista = filtrados(), cs = cargosSel(), tok = ++st.tok, niv = NIVEIS[idxNivel(st.nivel)];
    var caixa = document.getElementById('bolLista');
    var filtro = NIVEIS.map(function (n) { return st.f[n.k] ? n.rot : ''; }).filter(Boolean);
    document.getElementById('bolStatus').textContent = fmt(lista.length) + ' seç' + (lista.length === 1 ? 'ão' : 'ões') + ' (' + fmt(lista.reduce(function (s, b) { return s + b.aptos; }, 0)) + ' eleitores aptos)' +
      (filtro.length ? ' · filtrado por ' + filtro.join(', ').toLowerCase() : ' · todo o Acre') + (st.cand ? ' · só ' + cap(B.cargos[st.cand.ci].cand[st.cand.num]) + ' (' + B.cargos[st.cand.ci].nome + ')' : (st.cargo === '' ? ' · todos os cargos' : ' · ' + B.cargos[+st.cargo].nome));
    document.getElementById('bolPdf').disabled = !lista.length;
    document.getElementById('bolResumo').hidden = !st.cand || st.vista === 'dash'; document.getElementById('bolResumo').disabled = !lista.length;
    if (st.vista === 'dash') { desenhaDash(); return; }
    if (!lista.length) { caixa.className = 'bol-lista'; caixa.innerHTML = '<p class="resultados-dica">Nenhum boletim para os filtros escolhidos.</p>'; pager(1); return; }
    if (st.nivel !== 'sec') {
      grupos = agrupa(lista, st.nivel);
      var paginas = Math.max(1, Math.ceil(grupos.length / POR_PAGINA_GRUPOS)); if (st.pag >= paginas) st.pag = paginas - 1;
      var ini = st.pag * POR_PAGINA_GRUPOS;
      caixa.className = 'bol-lista bol-grupos';
      caixa.innerHTML = '<p class="bol-dica">' + fmt(grupos.length) + ' ' + niv.rots.toLowerCase() + '. Abra o <b>boletim consolidado</b> (soma das seções) ou desça para o nível seguinte.</p>' +
        grupos.slice(ini, ini + POR_PAGINA_GRUPOS).map(function (g, j) { return cartaoGrupo(g, ini + j); }).join('');
      pager(paginas);
      return;
    }
    var paginasS = Math.max(1, Math.ceil(lista.length / POR_PAGINA)); if (st.pag >= paginasS) st.pag = paginasS - 1;
    var pg = lista.slice(st.pag * POR_PAGINA, (st.pag + 1) * POR_PAGINA);
    caixa.className = 'bol-lista';
    caixa.innerHTML = '<p class="resultados-dica">Carregando os boletins…</p>'; pager(paginasS);
    carrega(munsDe(pg)).then(function () {
      if (tok !== st.tok) return;
      caixa.innerHTML = pg.map(function (b) {
        return '<article class="bol-card"><header><h3>Zona ' + pad(b.zona, 4) + ' · Seção ' + pad(b.secao, 4) + '</h3>' +
          '<p><b>' + esc(b.munNome) + '</b> · Regional ' + esc(b.reg) + '</p><p>' + esc(b.localNome) + (b.end ? ' — ' + esc(b.end) : '') + '</p>' + extra(b) + '</header>' +
          cs.map(function (i) { return tabelaCargo(b.cargos[i], i, st.cargo !== ''); }).join('') + '</article>';
      }).join('');
    }).catch(function (e) { if (tok === st.tok) caixa.innerHTML = '<p class="resultados-dica">' + esc(e.message) + '</p>'; });
  }
  function consolidado(i) {   // soma das seções do grupo, por cargo
    var g = grupos[i], card = raiz.querySelector('[data-g="' + i + '"]'); if (!g || !card) return;
    var corpo = card.querySelector('[data-cons-corpo]'), btn = card.querySelector('[data-cons]');
    if (corpo.innerHTML) { corpo.innerHTML = ''; btn.textContent = 'Boletim consolidado'; return; }
    corpo.innerHTML = '<p class="resultados-dica">Somando as seções…</p>';
    carrega(munsDe(g.secs)).then(function () {
      var cs = cargosSel();
      corpo.innerHTML = cs.map(function (c) {
        var a = agrega(g.secs.filter(function (b) { return b.cargos && b.cargos[c]; }), c);
        return tabelaCargo([a.cands.map(function (x) { return [x.num, x.v]; }), a.b, a.n], c, st.cargo !== '', g.secs.length > 1 ? ' · ' + fmt(g.secs.length) + ' seções' : '');
      }).join('') + '<p class="bol-nota">Total apurado = votos nominais + brancos + nulos somados das seções do grupo.</p>';
      btn.textContent = 'Fechar consolidado';
    }).catch(function (e) { corpo.innerHTML = '<p class="resultados-dica">' + esc(e.message) + '</p>'; });
  }
  function desce(i) {   // abre o próximo nível já filtrado pelo grupo escolhido
    var g = grupos[i]; if (!g) return;
    var ix = idxNivel(g.k), j;
    for (j = 0; j <= ix; j++) st.f[NIVEIS[j].k] = NIVEIS[j].val(g.ref);
    for (j = ix + 1; j < NIVEIS.length; j++) st.f[NIVEIS[j].k] = '';
    st.nivel = NIVEIS[ix + 1].k; st.pag = 0; montaFiltros(); desenha(); raiz.scrollIntoView({ block: 'start' });
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

  /* ---------- PDF de um candidato só: tabela compacta (várias seções por folha), com capa e sumário quando longo ---------- */
  async function exportarPdfCand(lista, msg, btn) {
    var ci = st.cand.ci, num = st.cand.num, cargo = B.cargos[ci], nomeCand = cap(cargo.cand[num] || ('Candidato ' + num));
    msg.textContent = 'Carregando os votos…'; await carrega(munsDe(lista));
    msg.textContent = 'Carregando a biblioteca de PDF…';
    var lib = await carregaPdf(), doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
    var PW = 210, PH = 297, M = 12, W = PW - 2 * M, RH = 4.3, TOPO = 20, FUNDO = PH - 16, LINHAS_SUM = 52;
    function sem(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' '); }
    function txt(t, x, y, o) { doc.text(sem(t), x, y, o || {}); }
    function fonte(sz, neg, cor) { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(cor[0], cor[1], cor[2]); }
    function fill(c) { doc.setFillColor(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)); }
    function corte(t, larg) { t = sem(t); if (doc.getTextWidth(t) <= larg) return t; while (t.length > 1 && doc.getTextWidth(t + '...') > larg) t = t.slice(0, -1); return t + '...'; }
    function pc1(a, b) { return b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '-'; }

    /* dados: uma linha por seção, na ordem regional > município > zona > local > seção */
    var linhas = lista.filter(function (b) { return b.cargos && b.cargos[ci]; }).sort(function (x, y) {
      return x.reg.localeCompare(y.reg, 'pt-BR') || x.munNome.localeCompare(y.munNome, 'pt-BR') || x.zona - y.zona || x.localNome.localeCompare(y.localNome, 'pt-BR') || x.local - y.local || x.secao - y.secao;
    }).map(function (b) {
      var c = b.cargos[ci], v = 0, nom = 0;
      c[0].forEach(function (p) { nom += p[1]; if (p[0] === num) v = p[1]; });
      return { b: b, v: v, nom: nom, br: c[1], nu: c[2], tot: nom + c[1] + c[2] };
    });
    function soma(ls) { return ls.reduce(function (a, l) { a.v += l.v; a.nom += l.nom; a.br += l.br; a.nu += l.nu; a.tot += l.tot; a.ap += l.b.aptos; a.n++; if (l.v > 0) a.com++; return a; }, { v: 0, nom: 0, br: 0, nu: 0, tot: 0, ap: 0, n: 0, com: 0 }); }
    function agr(ls, f) { var m = new Map(); ls.forEach(function (l) { var k = f(l), g = m.get(k); if (!g) { g = { k: k, ls: [] }; m.set(k, g); } g.ls.push(l); }); return Array.from(m.values()); }
    var muns = agr(linhas, function (l) { return l.b.mun; }), nMun = muns.length, tudo = soma(linhas);
    var comLocais = nMun <= 3, longo = linhas.length > 60;
    var nEntradas = muns.length + (nMun > 3 ? new Set(linhas.map(function (l) { return l.b.reg; })).size : 0) + (comLocais ? new Set(linhas.map(function (l) { return l.b.mun + '|' + l.b.zona + '|' + l.b.local; })).size : 0);
    var sumPaginas = longo ? Math.ceil(nEntradas / LINHAS_SUM) : 0, reservadas = longo ? 1 + sumPaginas : 0;
    for (var r = 1; r < reservadas; r++) doc.addPage();
    if (reservadas) doc.addPage();
    var y = TOPO, entradas = [], filtroTxt = NIVEIS.map(function (n) { var l = linhas.find(function (x) { return st.f[n.k]; }); return st.f[n.k] && l ? n.rot + ': ' + n.tit(l.b) : ''; }).filter(Boolean).join('  |  ') || 'Todo o Acre';

    /* corpo */
    var colX = [M + 1, M + 15, 0, 0, 0, 0, 0, 0, 0], COL = [14, 16, 22, 24, 20, 24, 22, 20, 24], rot = ['Zona', 'Secao', 'Aptos', 'Votos', '% apur.', 'Nominais', 'Brancos', 'Nulos', 'Total'];
    (function () { var x = M; for (var i = 0; i < COL.length; i++) { colX[i] = x; x += COL[i]; } })();   // início de cada coluna; as numéricas alinham à direita
    function cabPagina() {
      fonte(7.5, true, [21, 62, 117]); txt('Boletins de urna 2026 - ' + nomeCand + ' (' + num + ') - ' + cargo.nome, M, 11);
      doc.setDrawColor(207, 216, 227); doc.line(M, 13, PW - M, 13); y = TOPO;
    }
    function cabColunas(cont) {
      fill('#153e75'); doc.rect(M, y - 3.4, W, 5, 'F'); fonte(7, true, [255, 255, 255]);
      rot.forEach(function (t, i) { if (i < 2) txt(t, colX[i] + 1, y); else txt(t, colX[i] + COL[i] - 1.5, y, { align: 'right' }); });
      y += 5;
    }
    function precisa(h, comCab) {
      if (y + h <= FUNDO) return false;
      doc.addPage(); cabPagina(); if (comCab !== false) cabColunas(true); return true;
    }
    function linhaTotais(rotulo, s, fundo, negrito) {
      precisa(RH); fill(fundo); doc.rect(M, y - 3.2, W, RH, 'F'); fonte(7, negrito, [21, 62, 117]);
      txt(rotulo, colX[0] + 1, y);
      [s.ap, s.v, null, s.nom, s.br, s.nu, s.tot].forEach(function (v, k) {
        var i = k + 2; txt(i === 4 ? pc1(s.v, s.tot) : fmt(v), colX[i] + COL[i] - 1.5, y, { align: 'right' });
      });
      y += RH;
    }
    cabPagina();
    var regAtual = null;
    muns.forEach(function (g, gi) {
      var m0 = g.ls[0].b, ts = soma(g.ls);
      precisa(RH * 4 + 8, false);
      if (nMun > 3 && regAtual !== m0.reg) { regAtual = m0.reg; entradas.push({ n: 0, t: 'Regional ' + m0.reg, p: doc.getNumberOfPages() }); }
      entradas.push({ n: 1, t: m0.munNome, p: doc.getNumberOfPages(), s: fmt(ts.v) + ' votos' });
      fill('#e8eef9'); doc.rect(M, y - 3.6, W, 5.6, 'F'); fonte(9, true, [21, 62, 117]); txt(m0.munNome, M + 1.5, y);
      fonte(7.2, false, [102, 112, 133]); txt('Regional ' + m0.reg + '  -  ' + fmt(ts.v) + ' votos em ' + ts.com + ' de ' + ts.n + ' secoes', PW - M - 1.5, y, { align: 'right' }); y += 5.5;
      cabColunas();
      agr(g.ls, function (l) { return l.b.zona + '|' + l.b.local; }).forEach(function (lg, li) {
        var b0 = lg.ls[0].b;
        if (precisa(RH * 3 + 2)) { /* nova página: o cabeçalho do município continua */ }
        if (comLocais) entradas.push({ n: 2, t: b0.localNome, p: doc.getNumberOfPages(), s: 'Zona ' + pad(b0.zona, 4) });
        fill('#f3f6fb'); doc.rect(M, y - 3.2, W, RH, 'F'); fonte(7, true, [27, 35, 51]);
        txt(corte(b0.localNome + '  -  ' + nomeBairro(b0) + (b0.end ? '  -  ' + b0.end : ''), W - 2), colX[0] + 1, y); y += RH;
        lg.ls.forEach(function (l, k) {
          precisa(RH);
          if (k % 2) { fill('#fafbfd'); doc.rect(M, y - 3.2, W, RH, 'F'); }
          fonte(7, false, [27, 35, 51]); txt(pad(l.b.zona, 4), colX[0] + 1, y); txt(pad(l.b.secao, 4), colX[1] + 1, y);
          [l.b.aptos, l.v, null, l.nom, l.br, l.nu, l.tot].forEach(function (v, kk) {
            var i = kk + 2; fonte(7, i === 3, i === 3 && l.v > 0 ? [21, 62, 117] : [27, 35, 51]);
            txt(i === 4 ? pc1(l.v, l.tot) : fmt(v), colX[i] + COL[i] - 1.5, y, { align: 'right' });
          });
          y += RH;
        });
      });
      linhaTotais('Total - ' + m0.munNome + ' (' + ts.n + ' secoes)', ts, '#dbe5f5', true);
      y += 3;
    });
    precisa(RH * 2 + 6); y += 2;
    fill('#153e75'); doc.rect(M, y - 3.2, W, RH, 'F'); fonte(7, true, [255, 255, 255]); txt('TOTAL GERAL (' + tudo.n + ' secoes)', colX[0] + 1, y);
    [tudo.ap, tudo.v, null, tudo.nom, tudo.br, tudo.nu, tudo.tot].forEach(function (v, k) { var i = k + 2; txt(i === 4 ? pc1(tudo.v, tudo.tot) : fmt(v), colX[i] + COL[i] - 1.5, y, { align: 'right' }); });
    y += RH;

    /* capa + sumário (só quando o documento é longo) */
    if (longo) {
      doc.setPage(1);
      fill('#153e75'); doc.rect(0, 0, PW, 92, 'F');
      fonte(10, false, [191, 212, 242]); txt('BOLETINS DE URNA - 1o TURNO DE 2026 - ACRE', M + 4, 22);
      fonte(26, true, [255, 255, 255]); doc.text(doc.splitTextToSize(sem(nomeCand), W - 8).slice(0, 2), M + 4, 40);
      fonte(13, false, [255, 255, 255]); txt(cargo.nome + '  -  numero ' + num, M + 4, 62);
      fonte(8.5, false, [191, 212, 242]); doc.text(doc.splitTextToSize(sem(filtroTxt), W - 8).slice(0, 2), M + 4, 74);
      var tw = (W - 9) / 4, ty = 104;
      [['Votos', fmt(tudo.v), pc1(tudo.v, tudo.tot) + ' do total apurado', '#153e75'], ['Secoes', fmt(tudo.n), tudo.com + ' com voto do candidato', '#e08a00'], ['Municipios', String(nMun), 'no recorte', '#0f9d8a'], ['Eleitores aptos', fmt(tudo.ap), 'nas secoes listadas', '#7c3aed']].forEach(function (t, i) {
        var x = M + i * (tw + 3); fill('#f1f4fa'); doc.roundedRect(x, ty, tw, 24, 2, 2, 'F'); fill(t[3]); doc.rect(x, ty, 1.6, 24, 'F');
        fonte(7, false, [102, 112, 133]); txt(t[0].toUpperCase(), x + 5, ty + 6); fonte(16, true, [27, 35, 51]); txt(t[1], x + 5, ty + 15); fonte(6.8, false, [102, 112, 133]); txt(corte(t[2], tw - 8), x + 5, ty + 20.5);
      });
      var cy = ty + 36; fonte(11, true, [21, 62, 117]);
      var topo = (nMun > 3 ? agr(linhas, function (l) { return l.b.mun; }) : agr(linhas, function (l) { return l.b.mun + '|' + l.b.zona + '|' + l.b.local; })).map(function (g) { return { n: nMun > 3 ? g.ls[0].b.munNome : g.ls[0].b.localNome, s: soma(g.ls) }; }).sort(function (a, b) { return b.s.v - a.s.v; }).slice(0, 14);
      txt(nMun > 3 ? 'Votos por municipio' : 'Locais de votacao com mais votos', M, cy); cy += 6;
      var mx = topo.length ? Math.max(topo[0].s.v, 1) : 1;
      topo.forEach(function (t) {
        fonte(7.5, false, [27, 35, 51]); txt(corte(t.n, 58), M, cy + 3.4);
        fill('#e8ecf2'); doc.roundedRect(M + 60, cy, W - 100, 4.4, 1, 1, 'F'); if (t.s.v > 0) { fill('#153e75'); doc.roundedRect(M + 60, cy, Math.max(1.2, (W - 100) * t.s.v / mx), 4.4, 1, 1, 'F'); }
        fonte(7.5, true, [27, 35, 51]); txt(fmt(t.s.v) + '  (' + pc1(t.s.v, t.s.tot) + ')', PW - M, cy + 3.4, { align: 'right' }); cy += 7.4;
      });
      fonte(7, false, [102, 112, 133]); txt('Percentual entre parenteses = votos do candidato / total apurado (nominais + brancos + nulos) da unidade.', M, cy + 3);
      for (var sp = 0; sp < sumPaginas; sp++) {
        doc.setPage(2 + sp); fill('#153e75'); doc.rect(0, 0, PW, 18, 'F'); fonte(13, true, [255, 255, 255]); txt('Sumario' + (sumPaginas > 1 ? ' (' + (sp + 1) + '/' + sumPaginas + ')' : ''), M, 12);
        var sy = 28;
        entradas.slice(sp * LINHAS_SUM, (sp + 1) * LINHAS_SUM).forEach(function (e) {
          var ind = M + e.n * 6, pg = String(e.p + 0);
          if (e.n === 0) { fill('#e8eef9'); doc.rect(M, sy - 3.6, W, 5.2, 'F'); fonte(8.5, true, [21, 62, 117]); }
          else fonte(e.n === 1 ? 8 : 7.2, e.n === 1, [27, 35, 51]);
          txt(e.t, ind + 1, sy); txt(pg, PW - M - 1, sy, { align: 'right' });
          if (e.s) { fonte(7, false, [102, 112, 133]); txt(e.s, PW - M - 14, sy, { align: 'right' }); }
          if (e.n > 0) { doc.setDrawColor(225, 230, 238); doc.setLineDashPattern([0.4, 0.8], 0); var w0 = doc.getTextWidth(sem(e.t)) + ind + 3; doc.line(w0, sy, PW - M - (e.s ? 34 : 8), sy); doc.setLineDashPattern([], 0); }
          sy += 4.9;
        });
      }
    }
    var total = doc.getNumberOfPages(), quando = new Date().toLocaleString('pt-BR');
    for (var p = 1; p <= total; p++) {
      doc.setPage(p); doc.setDrawColor(207, 216, 227); doc.line(M, PH - 12, PW - M, PH - 12); fonte(6.5, false, [102, 112, 133]);
      txt('Fonte: TSE (Tribunal Superior Eleitoral) - votacao por secao, 1o turno de 2026. Gerado em ' + quando + '.', M, PH - 8);
      txt('Pagina ' + p + ' de ' + total, PW - M, PH - 8, { align: 'right' });
    }
    var nome = 'boletins-2026-' + slug(nomeCand) + '-' + num + (st.f.mun ? '-' + slug(T.municipios[st.f.mun] || st.f.mun) : '') + '.pdf';
    var a = document.createElement('a'); a.href = URL.createObjectURL(doc.output('blob')); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    msg.textContent = 'PDF gerado: ' + fmt(linhas.length) + ' secoes de ' + nomeCand + ', ' + total + ' página(s)' + (longo ? ' (com capa e sumário)' : '') + '.';
  }

  /* ---------- PDF de resumo do candidato selecionado: panorama em gráficos, pouco texto ---------- */
  async function exportarResumoCand() {
    var lista = filtrados(), msg = document.getElementById('bolMsg'), btn = document.getElementById('bolResumo');
    if (!lista.length || !st.cand) return;
    btn.disabled = true;
    try {
      var ci = st.cand.ci, num = st.cand.num, cargo = B.cargos[ci], majo = ci < 3, nomeCand = cap(cargo.cand[num] || ('Candidato ' + num));
      msg.textContent = 'Carregando os votos…'; await carrega(munsDe(lista));
      msg.textContent = 'Carregando a biblioteca de PDF…';
      var lib = await carregaPdf(), doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, PH = 297, M = 12, W = PW - 2 * M, FUNDO = PH - 16, AZUL = '#153e75', CINZA = '#c4ccd9', LARANJA = '#e08a00', VERDE = '#0f9d8a';
      function sem(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' '); }
      function txt(t, x, y, o) { doc.text(sem(t), x, y, o || {}); }
      function fonte(sz, neg, cor) { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(cor[0], cor[1], cor[2]); }
      function fill(c) { doc.setFillColor(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)); }
      function corte(t, larg) { t = sem(t); if (doc.getTextWidth(t) <= larg) return t; while (t.length > 1 && doc.getTextWidth(t + '...') > larg) t = t.slice(0, -1); return t + '...'; }
      function pc1(a, b) { return b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '-'; }

      /* dados: uma linha por seção; quem lidera a seção; totais por candidato no recorte */
      var porCand = new Map(), linhas = [];
      lista.forEach(function (b) {
        var c = b.cargos && b.cargos[ci]; if (!c) return;
        var v = 0, nom = 0, mx = 0;
        c[0].forEach(function (p) {
          nom += p[1]; if (!(majo || p[0] >= 100)) return;
          porCand.set(p[0], (porCand.get(p[0]) || 0) + p[1]); if (p[0] === num) v = p[1]; if (p[1] > mx) mx = p[1];
        });
        linhas.push({ b: b, v: v, tot: nom + c[1] + c[2], lid: v > 0 && v === mx });
      });
      var ranking = Array.from(porCand.entries()).sort(function (a, b) { return b[1] - a[1]; }), pos = ranking.findIndex(function (r) { return r[0] === num; }) + 1;
      var tudo = linhas.reduce(function (a, l) { a.v += l.v; a.tot += l.tot; a.n++; if (l.v > 0) a.com++; if (l.lid) a.lid++; return a; }, { v: 0, tot: 0, n: 0, com: 0, lid: 0 });
      function agr(f) { var m = new Map(); linhas.forEach(function (l) { var k = f(l.b), g = m.get(k); if (!g) { g = { k: k, rot: '', v: 0, tot: 0, n: 0 }; m.set(k, g); } g.v += l.v; g.tot += l.tot; g.n++; g.b = l.b; }); return Array.from(m.values()); }
      var nMun = new Set(linhas.map(function (l) { return l.b.mun; })).size;
      var filtroTxt = NIVEIS.map(function (n) { var l = linhas.find(function () { return st.f[n.k]; }); return st.f[n.k] && l ? n.rot + ': ' + n.tit(l.b) : ''; }).filter(Boolean).join('  |  ') || 'Todo o Acre';

      /* componentes gráficos */
      var y = 0;
      function cab() {
        fill(AZUL); doc.rect(0, 0, PW, 15, 'F'); fonte(9, true, [255, 255, 255]); txt('Resumo - ' + nomeCand + ' (' + num + ') - ' + cargo.nome, M, 9.5); y = 24;
      }
      function livre(h) { if (y + h > FUNDO) { doc.addPage(); cab(); } }
      function titulo(t, sub) { livre(16); fonte(11, true, [21, 62, 117]); txt(t, M, y); if (sub) { fonte(7.2, false, [102, 112, 133]); txt(sub, PW - M, y, { align: 'right' }); } y += 5; }
      function tile(x, w, rot, val, sub, cor) {
        fill('#f1f4fa'); doc.roundedRect(x, y, w, 25, 2, 2, 'F'); fill(cor); doc.rect(x, y, 1.6, 25, 'F');
        fonte(6.8, false, [102, 112, 133]); txt(rot.toUpperCase(), x + 5, y + 6); fonte(17, true, [27, 35, 51]); txt(val, x + 5, y + 15.5); fonte(6.8, false, [102, 112, 133]); txt(corte(sub, w - 8), x + 5, y + 21.5);
      }
      function hbars(itens, wRot, linha, cor) {   // itens: {rot, v, tot, dest}
        var mx = Math.max.apply(null, itens.map(function (i) { return i.v; }).concat([1])), wb = W - wRot - 38;
        itens.forEach(function (it) {
          livre(linha + 1);
          fonte(7.3, !!it.dest, [27, 35, 51]); txt(corte(it.rot, wRot - 2), M, y + 3.3);
          fill('#e8ecf2'); doc.roundedRect(M + wRot, y, wb, linha - 1.6, 1, 1, 'F');
          if (it.v > 0) { fill(it.dest ? (cor || AZUL) : (it.cor || (cor || AZUL))); doc.roundedRect(M + wRot, y, Math.max(1.2, wb * it.v / mx), linha - 1.6, 1, 1, 'F'); }
          fonte(7.3, true, [27, 35, 51]); txt(fmt(it.v) + (it.tot ? '  ' + pc1(it.v, it.tot) : ''), PW - M, y + 3.3, { align: 'right' });
          y += linha;
        });
        y += 3;
      }
      function pilha(partes, alt) {   // barra única dividida em partes: {rot, v, cor}
        var tot = partes.reduce(function (s, p) { return s + p.v; }, 0) || 1, x = M;
        partes.forEach(function (p) {
          var w = W * p.v / tot; if (!p.v) return; fill(p.cor); doc.rect(x, y, w, alt, 'F');
          if (w > 14) { fonte(7.5, true, [255, 255, 255]); txt(pc1(p.v, tot), x + w / 2, y + alt / 2 + 1.2, { align: 'center' }); } x += w;
        });
        y += alt + 4; var lx = M;
        partes.forEach(function (p) { fill(p.cor); doc.rect(lx, y - 2.6, 3, 3, 'F'); fonte(7.3, false, [27, 35, 51]); var t = p.rot + ': ' + fmt(p.v); txt(t, lx + 4.5, y); lx += doc.getTextWidth(sem(t)) + 14; });
        y += 7;
      }
      function colunas(itens, alt) {   // gráfico de colunas: {rot, v}
        livre(alt + 16);
        var mx = Math.max.apply(null, itens.map(function (i) { return i.v; }).concat([1])), n = itens.length, gw = W / n, base = y + alt;
        doc.setDrawColor(207, 216, 227); doc.line(M, base, M + W, base);
        itens.forEach(function (it, i) {
          var h = alt * it.v / mx, x = M + i * gw + gw * 0.12;
          fill(it.cor || AZUL); if (h > 0) doc.rect(x, base - h, gw * 0.76, h, 'F');
          fonte(6.6, true, [27, 35, 51]); txt(fmt(it.v), x + gw * 0.38, base - h - 1.2, { align: 'center' });
          fonte(6.4, false, [102, 112, 133]); txt(it.rot, x + gw * 0.38, base + 4, { align: 'center' });
        });
        y = base + 11;
      }

      /* ---- página 1: faixa, indicadores, mapa de votos por unidade, cobertura ---- */
      fill(AZUL); doc.rect(0, 0, PW, 40, 'F');
      fonte(8.5, false, [191, 212, 242]); txt('RESUMO DA VOTACAO - 1o TURNO DE 2026 - ACRE', M, 11);
      fonte(21, true, [255, 255, 255]); doc.text(doc.splitTextToSize(sem(nomeCand), W).slice(0, 1), M, 23);
      fonte(10.5, false, [255, 255, 255]); txt(cargo.nome + '  -  numero ' + num, M, 31); fonte(7.8, false, [191, 212, 242]); txt(corte(filtroTxt, W), M, 37);
      y = 48; var tw = (W - 9) / 4;
      tile(M, tw, 'Votos', fmt(tudo.v), pc1(tudo.v, tudo.tot) + ' do total apurado', AZUL);
      tile(M + tw + 3, tw, 'Posicao', pos ? pos + 'o' : '-', 'de ' + fmt(ranking.length) + ' candidatos' + (cargo.vagas > 1 ? ' - ' + cargo.vagas + ' vagas' : ''), LARANJA);
      tile(M + 2 * (tw + 3), tw, 'Secoes com voto', pc1(tudo.com, tudo.n), fmt(tudo.com) + ' de ' + fmt(tudo.n), VERDE);
      tile(M + 3 * (tw + 3), tw, 'Lidera em', fmt(tudo.lid), pc1(tudo.lid, tudo.n) + ' das secoes', '#7c3aed');
      y += 33;

      titulo('Cobertura das secoes', fmt(tudo.n) + ' secoes');
      y += 1; pilha([{ rot: 'Lidera a secao', v: tudo.lid, cor: AZUL }, { rot: 'Tem voto, nao lidera', v: tudo.com - tudo.lid, cor: LARANJA }, { rot: 'Sem voto', v: tudo.n - tudo.com, cor: CINZA }], 9);

      if (nMun > 1) {
        var ms = agr(function (b) { return b.mun; }).map(function (g) { return { rot: g.b.munNome, v: g.v, tot: g.tot }; }).sort(function (a, b) { return b.v - a.v; });
        titulo('Votos por municipio', 'barra = votos; % = do total apurado do municipio');
        hbars(ms, 42, 5.7);
      } else {
        var ls = agr(function (b) { return b.mun + '|' + b.zona + '|' + b.local; }).map(function (g) { return { rot: g.b.localNome, v: g.v, tot: g.tot }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 20);
        titulo('Locais de votacao com mais votos', '20 maiores');
        hbars(ls, 62, 5.7);
      }
      if (nMun > 3) {
        var rs = agr(function (b) { return b.reg; }).map(function (g) { return { rot: 'Regional ' + g.b.reg, v: g.v, tot: g.tot }; }).sort(function (a, b) { return b.v - a.v; });
        titulo('Votos por regional'); hbars(rs, 42, 6, VERDE);
      }

      /* ---- demais páginas: concorrência, força por seção, partido, locais e bairros ---- */
      doc.addPage(); cab();
      var top = ranking.slice(0, 10).map(function (r, i) { return { rot: (i + 1) + '. ' + cap(cargo.cand[r[0]] || r[0]), v: r[1], tot: tudo.tot, dest: r[0] === num, cor: CINZA }; });
      if (pos > 10) top.push({ rot: pos + '. ' + nomeCand, v: porCand.get(num), tot: tudo.tot, dest: true });
      titulo('Quem disputou o mesmo cargo', majo ? 'ranking no recorte' : '10 mais votados no recorte');
      hbars(top, 52, 6);

      var com = linhas.filter(function (l) { return l.v > 0 && l.tot; }), maxSh = Math.max.apply(null, com.map(function (l) { return l.v / l.tot; }).concat([0.05])), passo = maxSh > 0.5 ? 0.1 : maxSh > 0.25 ? 0.05 : 0.025, nb = Math.min(12, Math.max(4, Math.ceil(maxSh / passo)));
      var bins = []; for (var i = 0; i < nb; i++) bins.push({ rot: Math.round(i * passo * 1000) / 10 + '%', v: 0 });
      com.forEach(function (l) { bins[Math.min(nb - 1, Math.floor(l.v / l.tot / passo))].v++; });
      bins.push({ rot: '0', v: tudo.n - tudo.com, cor: CINZA }); bins.unshift(bins.pop());
      titulo('Forca por secao', 'numero de secoes por faixa de % do total apurado da secao');
      colunas(bins, 38);

      if (!majo) {
        var pn = Math.floor(num / (ci === 3 ? 100 : 1000)), partidoNom = 0, leg = 0;
        lista.forEach(function (b) { var c = b.cargos && b.cargos[ci]; if (c) c[0].forEach(function (p) { if (p[0] === pn) leg += p[1]; else if (Math.floor(p[0] / (ci === 3 ? 100 : 1000)) === pn && p[0] >= 100) partidoNom += p[1]; }); });
        titulo('Votos do partido', cap(cargo.cand[pn] || ('Partido ' + pn)) + ' - ' + fmt(partidoNom + leg) + ' votos');
        pilha([{ rot: nomeCand, v: tudo.v, cor: AZUL }, { rot: 'Demais candidatos do partido', v: Math.max(0, partidoNom - tudo.v), cor: LARANJA }, { rot: 'Legenda', v: leg, cor: VERDE }], 9);
      }
      var bs = agr(function (b) { return b.mun + '|' + b.bairro; }).filter(function (g) { return g.b.bairro !== SEM_BAIRRO; }).map(function (g) { return { rot: nomeBairro(g.b) + (nMun > 1 ? ' - ' + g.b.munNome : ''), v: g.v, tot: g.tot }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
      if (bs.length > 1) { titulo('Bairros com mais votos', '8 maiores'); hbars(bs, 62, 5.7, VERDE); }
      if (nMun > 1) {
        var lc = agr(function (b) { return b.mun + '|' + b.zona + '|' + b.local; }).map(function (g) { return { rot: g.b.localNome + ' - ' + g.b.munNome, v: g.v, tot: g.tot }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
        titulo('Locais de votacao com mais votos', '8 maiores'); hbars(lc, 78, 5.7, LARANJA);
      }
      fonte(7, false, [102, 112, 133]); livre(8); txt('Percentuais sobre o total apurado (votos nominais + brancos + nulos) de cada unidade. Lidera = foi o mais votado entre os candidatos na secao.', M, y + 2);

      var total = doc.getNumberOfPages(), quando = new Date().toLocaleString('pt-BR');
      for (var p = 1; p <= total; p++) {
        doc.setPage(p); doc.setDrawColor(207, 216, 227); doc.line(M, PH - 12, PW - M, PH - 12); fonte(6.5, false, [102, 112, 133]);
        txt('Fonte: TSE (Tribunal Superior Eleitoral) - votacao por secao, 1o turno de 2026. Gerado em ' + quando + '.', M, PH - 8);
        txt('Pagina ' + p + ' de ' + total, PW - M, PH - 8, { align: 'right' });
      }
      var a = document.createElement('a'); a.href = URL.createObjectURL(doc.output('blob')); a.download = 'resumo-2026-' + slug(nomeCand) + '-' + num + (st.f.mun ? '-' + slug(T.municipios[st.f.mun] || st.f.mun) : '') + '.pdf';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      msg.textContent = 'Resumo gerado: ' + total + ' página(s).';
    } catch (e) { msg.textContent = 'Erro ao gerar o resumo: ' + e.message; }
    finally { btn.disabled = false; }
  }

  async function exportarPdf() {
    var lista = filtrados(), cs = cargosSel(), msg = document.getElementById('bolMsg'), btn = document.getElementById('bolPdf');
    if (!lista.length) return;
    btn.disabled = true;
    if (st.cand) {   // um candidato só: tabela compacta, com capa e sumário quando longa
      try { await exportarPdfCand(lista, msg, btn); } catch (e) { msg.textContent = 'Erro ao gerar o PDF: ' + e.message; } finally { btn.disabled = false; }
      return;
    }
    try {
      msg.textContent = 'Carregando os votos…'; await carrega(munsDe(lista));
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
        fonte(8, false, [191, 212, 242]); txt('BOLETIM DE URNA - 1o TURNO DE 2026 - ACRE' + (st.cand ? ' - ' + B.cargos[st.cand.ci].cand[st.cand.num] + ' (' + st.cand.num + ')' : ''), M, 8);
        fonte(15, true, [255, 255, 255]); txt('Zona ' + pad(b.zona, 4) + ' - Secao ' + pad(b.secao, 4), M, 16);
        fonte(9, false, [255, 255, 255]); txt(corte(b.munNome + ' - Regional ' + b.reg + ' - ' + b.localNome + (b.end ? ' - ' + b.end : ''), PW - 2 * M), M, 21);
        var ex = []; if (b.aptos) ex.push(fmt(b.aptos) + ' eleitores aptos'); if (b.agreg.length) ex.push('inclui as secoes agregadas ' + b.agreg.map(function (n) { return pad(n, 4); }).join(' e '));
        if (ex.length) { fonte(8, false, [191, 212, 242]); txt(ex.join(' - '), M, 24.5); }
        y0 = 32; col = 0; y = y0;
        for (var k = 0; k < cs.length; k++) {
          var d = b.cargos && b.cargos[cs[k]]; if (!d) continue;
          var c = B.cargos[cs[k]], t = totais(d);
          precisa(RH * 5 + 8, b);
          doc.setFillColor(232, 238, 249); doc.rect(X(), y - 3.4, CW, 5, 'F');
          fonte(8.5, true, [21, 62, 117]); txt(c.nome.toUpperCase() + (c.nome === 'Senador' ? ' - 2 VAGAS' : ''), X() + 1.5, y);
          fonte(7, false, [102, 112, 133]); txt(fmt(t.tot) + ' votos', X() + CW - 1.5, y, { align: 'right' });
          y += 4.6;
          linhasDe(d, cs[k]).forEach(function (p) {
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
      var nome = 'boletins-2026' + (st.cand ? '-' + st.cand.num : '') + (st.cargo !== '' ? '-' + slug(B.cargos[+st.cargo].nome) : '') + (st.f.mun ? '-' + slug(T.municipios[st.f.mun] || st.f.mun) : '') + '.pdf';
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
      var d = x.cargos && x.cargos[i]; if (!d) return;
      d[0].forEach(function (p) { m.set(p[0], (m.get(p[0]) || 0) + p[1]); });
      b += d[1]; n += d[2];
    });
    var cands = Array.from(m.entries()).map(function (p) { return { num: p[0], nome: cap(c.cand[p[0]] || ''), v: p[1] }; }).sort(function (x, y) { return y.v - x.v; });
    var nom = cands.reduce(function (s, x) { return s + x.v; }, 0);
    return { cands: cands, b: b, n: n, nom: nom, tot: nom + b + n };
  }
  function escolas(lista) {   // grupos de comparação do dashboard: o nível mais fino que caiba em até 40 barras
    var ks = ['local', 'bairro', 'mun', 'reg'], k = 'reg', g = [], multi = new Set(munsDe(lista)).size > 1;
    for (var i = 0; i < ks.length; i++) { g = agrupa(lista, ks[i]); k = ks[i]; if (g.length <= 40) break; }
    var n = NIVEIS[idxNivel(k)];
    escolas.unid = { rot: n.rot.toLowerCase(), rots: n.rots.toLowerCase(), k: k };
    return g.map(function (x) { return { nome: x.tit + (multi && (k === 'bairro' || k === 'local') ? ' · ' + x.ref.munNome : ''), secs: x.secs, aptos: x.aptos }; });
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
    var lista = filtrados(), el = document.getElementById('bolDash'), tok = st.tok;
    if (!lista.length) { el.innerHTML = '<p class="resultados-dica">Nenhum boletim para os filtros escolhidos.</p>'; return; }
    el.innerHTML = '<p class="resultados-dica">Carregando os votos…</p>';
    carrega(munsDe(lista)).then(function () { if (tok === st.tok) montaDash(lista, el); })
      .catch(function (e) { el.innerHTML = '<p class="resultados-dica">' + esc(e.message) + '</p>'; });
  }
  function montaDash(lista, el) {
    var D = dadosDash(lista), U = escolas.unid, cs = cargosSel(), pres = D.pres;
    var semPres = !pres.tot;
    var h = '<div class="bd-kpis">' +
      kpi('Seções (boletins)', fmt(lista.length), 'em ' + D.escolas.length + ' ' + (D.escolas.length === 1 ? U.rot : U.rots)) +
      kpi('Eleitores aptos', fmt(D.aptos), 'nas seções selecionadas') +
      kpi('Comparecimento', semPres ? '–' : pct1(pres.tot, D.aptos), fmt(pres.tot) + ' votos apurados (Presidente)') +
      kpi('Brancos + nulos', semPres ? '–' : pct1(pres.b + pres.n, pres.tot), fmt(pres.b) + ' brancos · ' + fmt(pres.n) + ' nulos (Presidente)') + '</div>';
    var maxC = Math.max.apply(null, D.comp.map(function (e) { return e.tot; }).concat([1]));
    h += '<section class="bd-card"><h3>Comparecimento por ' + U.rot + ' <small>votos apurados para Presidente ÷ eleitores aptos</small></h3>' +
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
        (D.escolas.length > 1 ? '<h4>Votos por ' + U.rot + ' <small>fatias dos 4 mais votados</small></h4><div class="bd-leg">' + leg + '</div>' + porEsc : '') + '</section>';
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
      msg.textContent = 'Carregando os votos…'; await carrega(munsDe(lista));
      msg.textContent = 'Carregando a biblioteca de PDF…';
      var lib = await carregaPdf(), doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, PH = 297, M = 14, W = PW - 2 * M, D = dadosDash(lista), U = escolas.unid, nGrupos = D.escolas.length;
      var recorte = '', livre = function (h) { if (y + h > PH - 16) { doc.addPage(); y = 20; } };
      function txt(t, x, y, o) { doc.text(String(t), x, y, o || {}); }
      function fonte(sz, neg, cor) { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(cor[0], cor[1], cor[2]); }
      function fill(c) { var r = hex(c); doc.setFillColor(r[0], r[1], r[2]); }
      function corte(t, larg) { t = String(t); if (doc.getTextWidth(t) <= larg) return t; while (t.length > 1 && doc.getTextWidth(t + '...') > larg) t = t.slice(0, -1); return t + '...'; }
      function sem(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
      function faixa(tit, sub) {
        fill('#153e75'); doc.rect(0, 0, PW, 30, 'F');
        fonte(8, false, [191, 212, 242]); txt('ELEICOES 2026 - 1o TURNO - ACRE', M, 10);
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
      faixa('Dashboard dos boletins de urna', fmt(lista.length) + ' secoes em ' + nGrupos + ' ' + sem(U.rots) + ' - ' + (st.cargo === '' ? 'todos os cargos' : B.cargos[+st.cargo].nome));
      var tw = (W - 9) / 4, y = 38;
      tile(M, y, tw, 'Secoes', fmt(lista.length), nGrupos + ' ' + sem(U.rots), '#153e75');
      tile(M + tw + 3, y, tw, 'Eleitores aptos', fmt(D.aptos), 'nas secoes', '#e08a00');
      tile(M + 2 * (tw + 3), y, tw, 'Comparecimento', semPres ? '-' : pct1(pres.tot, D.aptos), fmt(pres.tot) + ' votos apurados', '#0f9d8a');
      tile(M + 3 * (tw + 3), y, tw, 'Brancos + nulos', semPres ? '-' : pct1(pres.b + pres.n, pres.tot), 'Presidente', '#b42318');
      y = 72; fonte(11, true, [21, 62, 117]); txt('Comparecimento por ' + sem(U.rot) + recorte, M, y); y += 7;
      var maxA = Math.max.apply(null, D.comp.map(function (e) { return e.aptos; }).concat([1]));
      D.comp.forEach(function (e) {
        livre(8); hbar(M, y, W, curto(e.nome), e.tot, maxA, '#0f9d8a', pct1(e.tot, e.aptos), 52); y += 8;
      });
      fonte(7, false, [102, 112, 133]); txt('Barra = votos apurados (Presidente) em relacao ao maior numero de eleitores aptos entre os grupos.', M, y + 2);
      y += 14; fonte(11, true, [21, 62, 117]); txt('Votos apurados e aptos por ' + sem(U.rot) + recorte, M, y); y += 6;
      var colW = [W - 78, 26, 26, 26];
      fill('#e8eef9'); doc.rect(M, y - 4, W, 6, 'F'); fonte(7.5, true, [21, 62, 117]);
      txt(sem(NIVEIS[idxNivel(U.k)].rot), M + 2, y); txt('Secoes', M + colW[0] + 26, y, { align: 'right' }); txt('Aptos', M + colW[0] + 52, y, { align: 'right' }); txt('Apurados', M + W - 2, y, { align: 'right' }); y += 6;
      D.comp.forEach(function (e, k) {
        livre(6); if (k % 2) { fill('#f7f9fc'); doc.rect(M, y - 3.6, W, 5.4, 'F'); }
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
        doc.addPage(); faixa(c.nome + (c.nome === 'Senador' ? ' (2 vagas)' : ''), 'Resultado nas secoes selecionadas (' + fmt(lista.length) + ') - ' + fmt(a.tot) + ' votos apurados');
        y = 40; fonte(11, true, [21, 62, 117]); txt('Mais votados', M, y); y += 6;
        var top = a.cands.slice(0, 8), max = top.length ? top[0].v : 1;
        top.forEach(function (x, j) { hbar(M, y, W, x.nome, x.v, max, j < 4 ? CORES[j] : COR_OUTROS, fmt(x.v) + '  (' + pct1(x.v, a.nom) + ')', 62); y += 8; });
        y += 2; var bn = a.b + a.n, wb = W;
        fonte(8, false, [102, 112, 133]); txt('Brancos: ' + fmt(a.b) + ' (' + pct1(a.b, a.tot) + ')   -   Nulos: ' + fmt(a.n) + ' (' + pct1(a.n, a.tot) + ')', M, y);
        y += 12;
        if (nGrupos > 1) {
          fonte(11, true, [21, 62, 117]); txt('Votos por ' + sem(U.rot) + recorte, M, y); y += 5;
          var top4 = a.cands.slice(0, 4).map(function (x) { return x.num; }), lx = M;
          top4.concat([-1]).forEach(function (num, j) {
            var nome = num === -1 ? 'Outros' : sem(a.cands.find(function (x) { return x.num === num; }).nome.split(' ').slice(0, 2).join(' '));
            fill(j < 4 ? CORES[j] : COR_OUTROS); doc.rect(lx, y - 2.6, 3, 3, 'F'); fonte(7.5, false, [27, 35, 51]); txt(nome, lx + 4.5, y); lx += doc.getTextWidth(nome) + 12;
          });
          y += 6;
          D.escolas.forEach(function (e) {
            livre(9); var ea = agrega(e.secs, i), xx = M + 52, ww = W - 52;
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
      var a2 = document.createElement('a'); a2.href = URL.createObjectURL(doc.output('blob')); a2.download = 'dashboard-boletins-2026' + (st.f.mun ? '-' + slug(T.municipios[st.f.mun] || st.f.mun) : '') + '.pdf';
      document.body.appendChild(a2); a2.click(); setTimeout(function () { URL.revokeObjectURL(a2.href); a2.remove(); }, 4000);
      msg.textContent = 'PDF do dashboard gerado: ' + total + ' página(s).';
    } catch (e) { msg.textContent = 'Erro ao gerar o PDF: ' + e.message; }
    finally { btn.disabled = false; }
  }

  /* ---------- montagem ---------- */
  raiz.innerHTML = '<div class="mapa-topo"><div><h2>Boletins de urna — todas as seções do Acre</h2><p>Votos por candidato, brancos e nulos de cada seção no 1º turno de 2026: Presidente, Governador, Senador (2 vagas), Deputado Federal e Deputado Estadual. Navegue do mais amplo ao mais detalhado — regional, município, zona, bairro, local de votação e seção —, abra o boletim consolidado de cada grupo e exporte em PDF.</p></div></div>' +
    '<div class="bol-vistas" role="tablist"><button type="button" role="tab" class="ativa" data-vista="lista" aria-selected="true">Boletins</button><button type="button" role="tab" data-vista="dash" aria-selected="false">Dashboard</button></div>' +
    '<div id="bolNiveis" class="bol-niveis" role="tablist" aria-label="Ver por nível">' + NIVEIS.map(function (n) { return '<button type="button" role="tab" data-nivel="' + n.k + '">' + n.rot + '</button>'; }).join('') + '</div>' +
    '<label class="bol-busca">Buscar<input type="search" id="bolBusca" placeholder="município, bairro, escola, endereço ou nº da seção" autocomplete="off"></label>' +
    '<div id="bolFiltros" class="bol-filtros"></div>' +
    '<div class="relatorio-acoes"><button id="bolPdf" type="button">Exportar PDF dos boletins</button><button id="bolResumo" type="button" hidden>Exportar resumo do candidato (PDF)</button><button id="bolPdfDash" type="button" hidden>Exportar PDF do dashboard</button><button id="bolLimpar" type="button" class="relatorio-limpar">Limpar filtros</button></div>' +
    '<p id="bolStatus" class="relatorio-status" role="status"></p><p id="bolMsg" class="relatorio-status" role="status"></p>' +
    '<div id="bolDash" class="bol-dash" hidden></div>' +
    '<div id="bolLista" class="bol-lista"></div>' +
    '<div class="busca-global-paginas" id="bolPaginas" hidden><button type="button" id="bolAnt" aria-label="Página anterior">←</button><span id="bolPagina" aria-live="polite"></span><button type="button" id="bolProx" aria-label="Próxima página">→</button></div>' +
    '<p class="fonte-eleitoral">Fonte: TSE, votação por seção do 1º turno de 2026. A fonte dos votos não traz comparecimento nem o partido dos candidatos; o total apurado é a soma de votos nominais, brancos e nulos da seção. Eleitores aptos e seções agregadas vêm da lista oficial de locais de votação.</p>';

  raiz.addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-bol'); if (!k) return;
    if (k === 'cand') {
      var v = e.target.value.trim(), ach = v ? candLista().find(function (x) { return x.rot === v; }) : null;
      if (v && !ach) { var q = semAcento(v), todos = candLista().filter(function (x) { return semAcento(x.rot).indexOf(q) >= 0; }); ach = todos.length === 1 ? todos[0] : null; }
      st.cand = ach ? { ci: ach.ci, num: ach.num } : null;
      if (ach) st.cargo = String(ach.ci);
      st.pag = 0; montaFiltros(); desenha(); return;
    }
    if (k === 'cargo') { st.cargo = e.target.value; if (st.cand && String(st.cand.ci) !== st.cargo) st.cand = null; }
    else {
      st.f[k] = e.target.value;
      var i = idxNivel(k);
      for (var j = i + 1; j < NIVEIS.length; j++) st.f[NIVEIS[j].k] = '';   // níveis abaixo recomeçam
      if (e.target.value && idxNivel(st.nivel) <= i && i + 1 < NIVEIS.length) st.nivel = NIVEIS[i + 1].k;   // escolheu um grupo: mostra o nível de baixo
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
    if (dash) document.getElementById('bolResumo').hidden = true;
    document.getElementById('bolNiveis').hidden = dash;
    if (dash) { document.getElementById('bolPaginas').hidden = true; desenhaDash(); } else desenha();
  }
  var tBusca = 0;
  document.getElementById('bolBusca').addEventListener('input', function (e) {
    var v = semAcento(e.target.value).trim(); clearTimeout(tBusca);
    tBusca = setTimeout(function () { st.busca = v; st.pag = 0; montaFiltros(); desenha(); }, 250);
  });
  raiz.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nivel],[data-cons],[data-desce]'); if (!t) return;
    if (t.dataset.nivel) { st.nivel = t.dataset.nivel; st.pag = 0; montaFiltros(); desenha(); }
    else if (t.dataset.cons != null) consolidado(+t.dataset.cons);
    else desce(+t.dataset.desce);
  });
  raiz.querySelectorAll('[data-vista]').forEach(function (b) { b.addEventListener('click', function () { vista(b.dataset.vista); }); });
  document.getElementById('bolPdfDash').addEventListener('click', exportarPdfDash);
  document.getElementById('bolPdf').addEventListener('click', exportarPdf);
  document.getElementById('bolResumo').addEventListener('click', exportarResumoCand);
  document.getElementById('bolLimpar').addEventListener('click', function () { st = { cargo: '', f: {}, pag: 0, vista: st.vista, nivel: 'reg', tok: st.tok, busca: '', cand: null }; document.getElementById('bolBusca').value = ''; montaFiltros(); desenha(); });
  document.getElementById('bolAnt').addEventListener('click', function () { st.pag--; desenha(); raiz.scrollIntoView({ block: 'start' }); });
  document.getElementById('bolProx').addEventListener('click', function () { st.pag++; desenha(); raiz.scrollIntoView({ block: 'start' }); });
  montaFiltros(); desenha();
})();
