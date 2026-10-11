/* Aba "Eleições" de eleicoes.html: apuração do Governo do Acre em tempo (quase) real, direto da API pública de resultados do TSE
   (https://resultados.tse.jus.br, CORS liberado). Já aponta para o 2º turno de 2026 (eleição 6260, 25/10/2026) e mantém o
   1º turno (6259) como referência/teste. Quando o TSE ainda não publicou o 2º turno, mostra os candidatos classificados e
   tenta de novo sozinho. Arquivos usados (padrão do TSE, tipo "u" = votação por candidato):
     estado:    <base>/<ciclo>/<eleicao>/dados/ac/ac-c0003-e<eleicao 6 dígitos>-u.json
     município: <base>/<ciclo>/<eleicao>/dados/ac/ac<cod município>-c0003-e<eleicao 6 dígitos>-u.json
   Os nomes dos municípios vêm de js/dados-tche-2026.js (mesmos códigos do TSE). */
(function () {
  'use strict';
  var raiz = document.getElementById('eleicoes2tRaiz');
  if (!raiz) return;

  var CFG = {
    base: 'https://resultados.tse.jus.br/oficial', ciclo: 'ele2026', uf: 'ac', cargo: '0003',
    turnos: {
      '2': { ele: '6260', rot: '2º turno', data: '25/10/2026' },
      '1': { ele: '6259', rot: '1º turno (referência)', data: '04/10/2026' }
    },
    intervalo: 30000, opcoes: [1, 2, 3, 5, 10, 15, 30], sentinela: 2000
  };
  var CORES = ['#d81b60', '#1f63d6', '#0f9d8a', '#7c3aed', '#e08a00', '#667085'];   // 1º = Mailza (rosa), 2º = Alan Rick (azul)
  var T = window.TCHE_2026, NOMES = (T && T.municipios) || {};
  var SIM0 = /[?&]detalhe=1(&|$)/.test(location.search);
  var INT0 = 30;   // segundos: atualização automática fixa; além disso a sentinela atualiza na hora quando o TSE publica algo novo
  var tfetch = function (u, o) { return (window.tseFetch || fetch)(u, o); };   // js/tse-limite.js: no máximo 80 req/s ao TSE
  var st = { seg: INT0, marca: '', proxima: Date.now() + INT0 * 1000, ultimaData: 0, ultimaDetalhe: 0, sim: SIM0, turno: SIM0 ? '1' : '2', auto: true, ordem: 'nome', tok: 0, timer: null, estado: null, muns: null, carregando: false };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function pc(n, d) { return Number(n || 0).toFixed(d == null ? 2 : d).replace('.', ',') + '%'; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function nomeMun(cod) {
    var n = NOMES[cod] || cod;
    return String(n).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (D[aeo]s?|E) /g, function (x) { return x.toLowerCase(); });
  }
  function url(turno, mun) {
    var t = CFG.turnos[turno], p = CFG.uf + (mun || '');
    return CFG.base + '/' + CFG.ciclo + '/' + t.ele + '/dados/' + CFG.uf + '/' + p + '-c' + CFG.cargo + '-e' + String(t.ele).padStart(6, '0') + '-u.json';
  }
  function busca(u) {   // null = ainda não publicado (404); erro de rede/CORS lança
    return tfetch(u, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error('TSE respondeu ' + r.status);
      return r.json();
    });
  }

  /* ---------- leitura do JSON do TSE ---------- */
  function le(d) {
    var c = d && d.carg && d.carg[0]; if (!c) return null;
    var cands = [];
    (c.agr || []).forEach(function (a) {
      (a.par || []).forEach(function (p) {
        (p.cand || []).forEach(function (x) {
          var vice = (x.vs || []).filter(function (v) { return v.tp === 'v'; })[0];
          cands.push({ n: x.n, nome: x.nmu || x.nm, completo: x.nm, partido: x.sg || p.sg, coligacao: a.com || '', vice: vice ? (vice.nmu || vice.nm) : '',
            votos: parseInt(x.vap, 10) || 0, pct: num(x.pvapn || x.pvap), eleito: x.e === 's' && !/2/.test(x.st || ''), classificado: x.e === 's' && /2/.test(x.st || ''), situacao: x.st || '' });
        });
      });
    });
    cands.sort(function (a, b) { return b.votos - a.votos; });
    var s = d.s || {}, e = d.e || {}, v = d.v || {};
    return {
      idg: d.idg || '', cands: cands, hora: (d.dg || '') + ' ' + (d.hg || ''), ultimo: (d.dt || '') + ' ' + (d.ht || ''), encerrada: d.and === 'f' || d.tf === 's',
      secoes: { total: +s.ts || 0, apuradas: +s.sa || 0, pct: num(s.psan) },
      aptos: +e.te || 0, comparecimento: +e.c || 0, pComp: num(e.pcn), abstencao: +e.a || 0, pAbst: num(e.pan),
      totalVotos: +v.tv || 0, validos: +v.vv || 0, brancos: +v.vb || 0, pBrancos: num(v.pvbn), nulos: +v.vn || 0, pNulos: num(v.ptvnn || v.pvnn)
    };
  }
  /* modo simulação: dados do 1º turno reduzidos a Mailza × Alan Rick; votos dos demais ficam de fora (sem transferência) */
  function soDois(r) {
    if (!r) return r;
    r.cands = r.cands.filter(function (c) { return c.n === '11' || c.n === '10'; }).sort(function (a, b) { return b.votos - a.votos; });
    r.validos = r.cands.reduce(function (s, c) { return s + c.votos; }, 0);
    r.totalVotos = r.validos + r.brancos + r.nulos;
    return r;
  }
  function temVotos(r) { return !!r && (r.totalVotos > 0 || r.cands.some(function (c) { return c.votos > 0; })); }

  /* ---------- desenho ---------- */
  function cartao(c, i, total, espera) {
    var cor = CORES[i % CORES.length], p = total ? c.votos / total * 100 : c.pct;
    return '<article class="et-cand' + (i === 0 && c.votos > 0 ? ' et-lider' : '') + '" style="--cor:' + cor + '">' +
      '<div class="et-cand-cab"><span class="et-num">' + esc(c.n) + '</span><div><h3>' + esc(c.nome) + '</h3><p>' + esc(c.partido) + (c.vice ? ' · vice ' + esc(c.vice) : '') + '</p></div>' +
      (c.eleito && !espera ? '<em class="et-tag et-eleito">Eleito</em>' : (c.classificado ? '<em class="et-tag">2º turno</em>' : (i === 0 && c.votos > 0 ? '<em class="et-tag">À frente</em>' : ''))) + '</div>' +
      (espera ? '<strong class="et-pct et-espera">—</strong><span class="et-votos">aguardando apuração</span><div class="et-trilho"><i style="width:0"></i></div>'
        : '<strong class="et-pct">' + pc(p) + '</strong><span class="et-votos">' + fmt(c.votos) + ' votos</span>' +
          '<div class="et-trilho"><i style="width:' + Math.min(100, p).toFixed(2) + '%"></i></div>') +
      (c.coligacao ? '<small>' + esc(c.coligacao) + '</small>' : '') + '</article>';
  }
  function barraDuelo(cands, total) {
    if (cands.length !== 2 || !total) return '';
    var a = cands[0], b = cands[1], pa = a.votos / total * 100, pb = b.votos / total * 100, dif = a.votos - b.votos;
    return '<div class="et-duelo" aria-label="Comparativo"><div class="et-duelo-barra">' +
      '<i style="width:' + pa.toFixed(2) + '%;background:' + CORES[0] + '">' + pc(pa, 1) + '</i>' +
      '<i style="width:' + pb.toFixed(2) + '%;background:' + CORES[1] + '">' + pc(pb, 1) + '</i></div>' +
      '<p><b>' + esc(a.nome) + '</b> ' + (dif ? 'à frente por <b>' + fmt(Math.abs(dif)) + '</b> votos' : 'empatado com') + ' <b>' + esc(b.nome) + '</b></p></div>';
  }
  function kpi(rot, val, sub) { return '<div class="et-kpi"><span>' + rot + '</span><b>' + val + '</b><small>' + sub + '</small></div>'; }

  function tabelaMun(cands) {
    if (!st.muns) return '';
    var cols = cands.slice(0, 6), linhas = Object.keys(st.muns).map(function (cod) {
      var r = st.muns[cod], mapa = {}; r.cands.forEach(function (c) { mapa[c.n] = c; });
      var lid = r.cands[0] && r.cands[0].votos > 0 ? r.cands[0] : null, seg = r.cands[1];
      return { cod: cod, nome: nomeMun(cod), r: r, mapa: mapa, lid: lid, dif: lid && seg ? lid.votos - seg.votos : 0 };
    });
    var ord = st.ordem;
    linhas.sort(function (a, b) {
      if (ord === 'votos') return b.r.totalVotos - a.r.totalVotos;
      if (ord === 'dif') return b.dif - a.dif;
      if (ord === 'apur') return b.r.secoes.pct - a.r.secoes.pct || a.nome.localeCompare(b.nome, 'pt-BR');
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
    var corDe = {}; cols.forEach(function (c, i) { corDe[c.n] = CORES[i % CORES.length]; });
    var h = '<div class="et-tabela-topo"><h3>Resultado por município</h3><label>Ordenar por <select id="etOrdem">' +
      [['nome', 'Nome'], ['votos', 'Votos apurados'], ['dif', 'Maior diferença'], ['apur', '% de seções apuradas']].map(function (o) { return '<option value="' + o[0] + '"' + (ord === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label></div><div class="tabela-scroll"><table class="relatorio-tabela et-tab"><thead><tr><th>Município</th><th class="n">Seções apuradas</th>' +
      cols.map(function (c) { return '<th class="n" style="color:' + corDe[c.n] + '">' + esc(c.nome) + '</th>'; }).join('') +
      '<th class="n">Brancos</th><th class="n">Nulos</th><th class="n">Total</th><th>Líder</th></tr></thead><tbody>' +
      linhas.map(function (l) {
        return '<tr><td><b>' + esc(l.nome) + '</b></td><td class="n">' + pc(l.r.secoes.pct, 1) + ' <small>(' + l.r.secoes.apuradas + '/' + l.r.secoes.total + ')</small></td>' +
          cols.map(function (c) {
            var x = l.mapa[c.n], v = x ? x.votos : 0, p = l.r.validos ? v / l.r.validos * 100 : 0, g = l.lid && l.lid.n === c.n;
            return '<td class="n' + (g ? ' et-ganha' : '') + '">' + fmt(v) + ' <small>' + pc(p, 1) + '</small></td>';
          }).join('') +
          '<td class="n">' + fmt(l.r.brancos) + '</td><td class="n">' + fmt(l.r.nulos) + '</td><td class="n">' + fmt(l.r.totalVotos) + '</td>' +
          '<td>' + (l.lid ? '<span class="et-ponto" style="background:' + (corDe[l.lid.n] || '#667085') + '"></span>' + esc(l.lid.nome) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }

  function desenha(extra) {
    var t = CFG.turnos['2'], r = st.estado, h = '';
    // título, data, contagem regressiva e tela cheia ficam no cabeçalho #etBarra (montaBarra)
      '<div class="et-tempo"><span class="et-b-cont" id="etCont">—</span><span class="et-b-ult" id="etUlt">Atualizado pela última vez: —</span></div></div>';
    if (st.sim) h += '<p class="et-aviso et-simaviso" role="status"><b>DADOS DE TESTE.</b> Esta tela está lendo o 1º turno (04/10/2026) só para teste; só Mailza × Alan Rick contam, sem transferência dos demais. Nada aqui é resultado do 2º turno.</p>';
    if (extra && extra.erro) h += '<p class="et-aviso et-erro" role="alert">' + esc(extra.erro) + '</p>';

    if (!r) { h += '<p class="resultados-dica">Carregando…</p>'; raiz.innerHTML = h; return; }
    var total = r.validos || r.cands.reduce(function (s, c) { return s + c.votos; }, 0), apurando = temVotos(r);
    if (extra && extra.aguardando) {
      h += '<p class="et-aviso" role="status"><b>Apuração ainda não iniciada.</b> O TSE começa a publicar os resultados do ' + esc(t.rot) + ' após o fechamento das urnas em ' + esc(t.data) +
        '. Esta página consulta o TSE automaticamente' + (st.auto ? '' : ' (ative o “Automático” ou use “Atualizar agora”)') + ' e se preenche sozinha.</p>';
    } else if (r) {
      h += '<p class="et-status">' + (r.encerrada && r.secoes.pct >= 100 ? '<span class="et-selo et-fim">Apuração encerrada</span>' : '<span class="et-selo et-vivo">Apurando</span>') +
        ' Seções apuradas: <b>' + pc(r.secoes.pct, 2) + '</b> (' + fmt(r.secoes.apuradas) + ' de ' + fmt(r.secoes.total) + ') · última totalização: ' + esc(r.ultimo.trim() || r.hora) +
        (st.ultimaBusca ? ' · consultado às ' + esc(st.ultimaBusca) : '') + '</p>' +
        '<div class="et-progresso"><i style="width:' + Math.min(100, r.secoes.pct).toFixed(2) + '%"></i></div>';
    }
    h += '<div class="et-cands">' + r.cands.map(function (c, i) { return cartao(c, i, extra && extra.aguardando ? 0 : total, !!(extra && extra.aguardando)); }).join('') + '</div>';
    if (apurando && !(extra && extra.aguardando)) {
      h += barraDuelo(r.cands.length === 2 ? r.cands : [], total);
      h += '<div class="et-kpis">' +
        kpi('Votos válidos', fmt(r.validos), pc(r.totalVotos ? r.validos / r.totalVotos * 100 : 0, 1) + ' dos votos apurados') +
        kpi('Brancos', fmt(r.brancos), pc(r.pBrancos, 2)) + kpi('Nulos', fmt(r.nulos), pc(r.pNulos, 2)) +
        kpi('Comparecimento', fmt(r.comparecimento), pc(r.pComp, 2) + ' de ' + fmt(r.aptos) + ' aptos') +
        kpi('Abstenções', fmt(r.abstencao), pc(r.pAbst, 2)) + '</div>';
      h += tabelaMun(r.cands);
    }
    h += '<p class="et-nota">Fonte: <a href="https://resultados.tse.jus.br" target="_blank" rel="noopener">TSE — Divulgação de Resultados</a>. Percentuais sobre os votos válidos, como no TSE. Os números podem variar até a totalização final.</p>';
    raiz.innerHTML = h;
  }

  /* ---------- carga ---------- */
  function carrega() {
    if (st.carregando) return Promise.resolve();
    var tok = ++st.tok, turno = st.turno; st.carregando = true;
    st.proxima = Date.now() + st.seg * 1000;
    return busca(url(turno)).then(function (d) {
      if (tok !== st.tok) return;
      var r = d && le(d);
      if (r && st.sim) r = soDois(r);
      if (r && temVotos(r)) {
        st.estado = r; st.ultimaBusca = new Date().toLocaleTimeString('pt-BR'); st.ultimaData = Date.now();
        // totalização igual à anterior: não rebaixa os 22 arquivos de município (só refaz a cada 20 s por garantia)
        if (st.muns && r.idg && st.idgAnt === r.idg && Date.now() - (st.munsEm || 0) < 20000) { st.carregando = false; desenha(); return; }
        st.idgAnt = r.idg;
        var cods = Object.keys(NOMES);
        return Promise.all(cods.map(function (cod) {
          return busca(url(turno, cod)).then(function (m) { var x = m && le(m); return [cod, x && st.sim ? soDois(x) : x]; }).catch(function () { return [cod, null]; });
        })).then(function (pares) {
          if (tok !== st.tok) return;
          var o = {}; pares.forEach(function (p) { if (p[1]) o[p[0]] = p[1]; });
          st.muns = Object.keys(o).length ? o : null; st.munsEm = Date.now(); st.carregando = false; desenha();
        });
      }
      // 2º turno ainda sem dados: mostra os classificados a partir do 1º turno
      return busca(url('1')).then(function (d1) {
        if (tok !== st.tok) return;
        var r1 = d1 && le(d1);
        st.muns = null; st.ultimaBusca = new Date().toLocaleTimeString('pt-BR'); st.ultimaData = Date.now();
        if (r1) {
          var cl = r1.cands.filter(function (c) { return /2/.test(c.situacao); });
          st.estado = { cands: cl.length ? cl : r1.cands.slice(0, 2), secoes: { total: 0, apuradas: 0, pct: 0 }, totalVotos: 0, validos: 0, ultimo: '', hora: '' };
        } else st.estado = { cands: [], secoes: { total: 0, apuradas: 0, pct: 0 }, totalVotos: 0, validos: 0, ultimo: '', hora: '' };
        st.carregando = false; desenha({ aguardando: true });
      });
    }).catch(function (e) {
      if (tok !== st.tok) return;
      st.carregando = false;
      if (!st.estado) st.estado = { cands: [], secoes: { total: 0, apuradas: 0, pct: 0 }, totalVotos: 0, validos: 0, ultimo: '', hora: '' };
      desenha({ erro: 'Não foi possível consultar o TSE agora (' + e.message + '). Tentando de novo automaticamente.' });
    });
  }
  /* ---------- barra fixa: contagem regressiva, última atualização, controles e tela cheia ---------- */
  var barra = document.getElementById('etBarra');
  function dataHora(ms) {
    var d = new Date(ms), p2 = function (n) { return String(n).padStart(2, '0'); };
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  function montaBarra() {
    if (!barra) return;
    barra.innerHTML =
      '<div class="et-cab-fx" aria-hidden="true"></div>' +
      '<div class="et-cab-centro"><span class="et-cab-status" id="etStatus">Aguardando apuração</span><div class="et-b-placar" id="etPlacar" aria-live="polite"></div></div>' +
      '<div class="et-cab-esq"><span class="et-cab-sel">Eleições 2026 · Acre</span>' +
      '<h2>Governo do Acre — 2º turno</h2>' +
      '<p>Apuração oficial do TSE · votação em ' + esc(CFG.turnos['2'].data) + (st.sim ? ' · <b>dados de teste</b>' : '') + '</p></div>' +
      '<div class="et-cab-dir"><div class="et-cab-btns"><button type="button" id="etLink" class="et-cab-btn" title="Copiar o link público da apuração">Link público</button>' +
      (window.APURACAO_PUBLICA ? '' : '<button type="button" id="etLinkCfg" class="et-cab-btn et-cab-ico" hidden title="Gerenciar o link público (ativar / revogar)" aria-label="Gerenciar o link público">⚙</button>') +
      '</div>' +
      '<div class="et-tempo"><span class="et-b-cont" id="etCont">—</span><span class="et-b-ult" id="etUlt">Atualizado pela última vez: —</span></div></div>';
  }
  /* barra de apuração geral + placar dos dois candidatos (aparecem na tela cheia e na página pública) */
  var sigGeral = '', sigPlacar = '';
  function pf1(x) { return (x == null || isNaN(x)) ? '—' : x.toFixed(1).replace('.', ',') + '%'; }
  function renderGeral() {
    var el = document.getElementById('etGeral'); if (!el) return;
    var D = window.GOVERNO_2T_2026, p = D && D.vivo && D.vivo.placar, ok = p ? p.ok : 0, tot = p ? p.total : (D && D.secoes ? D.secoes.length : 0);
    var pct = tot ? ok / tot * 100 : 0, f = tot > 0 && ok === tot, sig = ok + '/' + tot;
    if (sig === sigGeral) return; sigGeral = sig;
    el.className = 'et-geral' + (f ? ' fim' : '');
    el.innerHTML = '<div class="et-geral-top"><b>Apuração geral' + (f ? ' — concluída' : '') + '</b><span>' + fmt(ok) + ' de ' + fmt(tot) + ' seções apuradas · <strong>' + pf1(pct) + '</strong></span></div>' +
      '<div class="et-geral-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct.toFixed(1) + '"><i style="width:' + Math.min(100, pct).toFixed(2) + '%"></i></div>';
  }
  function renderPlacar() {
    var el = document.getElementById('etPlacarGrande'); if (!el) return;
    var D = window.GOVERNO_2T_2026, e = D && D.estado, p = D && D.vivo && D.vivo.placar, ids = (st.estado && st.estado.cands) || [];
    var ident = function (num) { var c = ids.filter(function (x) { return String(x.n) === String(num); })[0] || {}; return c; };
    var votos = function (num) { var c = (D && D.candidatos || []).filter(function (x) { return x.num === num; })[0]; return c ? c.votos : 0; };
    var v = e ? e.validos : 0, tem = v > 0, v1 = votos(11), v2 = votos(10);
    var ld = D && D.vivo && D.vivo.historico && D.vivo.historico.lideranca;
    var sig = [v1, v2, v, e ? e.brancos : 0, e ? e.nulos : 0, p ? p.munM + '|' + p.munA + '|' + p.secM + '|' + p.secA + '|' + p.munCom + '|' + p.ok + '|' + p.restAptos : '', ids.length, ld ? [ld.quem, ld.desde, ld.ultimoT, ld.tempo1, ld.tempo2, ld.vezes1, ld.vezes2, ld.mudancas].join('/') : ''].join(',');
    if (sig === sigPlacar) return; sigPlacar = sig;
    var lado = function (num, cor, cls, v, ml, sl, pos) {
      var c = ident(num), nome = (c.nome || (num === 11 ? 'Mailza Assis' : 'Alan Rick')), pct = tem ? v / votosTot() * 100 : null;
      return '<div class="pg-cand ' + cls + '" style="--c:' + cor + '"><div class="pg-l"><span class="pg-num">' + num + '</span>' +
        '<div class="pg-id"><b>' + esc(nome) + '</b><small>' + esc(c.partido || '') + (c.vice ? ' · vice ' + esc(c.vice) : '') + '</small></div></div>' +
        '<div class="pg-big"><strong>' + (tem ? pf1(pct) : '—') + '</strong><span>' + (tem ? fmt(v) + ' votos' : 'aguardando apuração') + '</span></div>' +
        '<div class="pg-mini">' + (tem ? '<span>' + pos + 'º lugar</span>' : '') + '<span>lidera em <b>' + ml + '</b> município' + (ml === 1 ? '' : 's') + '</span><span>e em <b>' + fmt(sl) + '</b> seç' + (sl === 1 ? 'ão' : 'ões') + '</span></div></div>';
    };
    function votosTot() { return v || 1; }
    function dur(ms) {
      if (!(ms > 0)) return '0 min';
      if (ms < 60000) return 'menos de 1 min';
      var m = Math.floor(ms / 60000), h = Math.floor(m / 60);
      return h ? h + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min';
    }
    function curto(nome) { return String(nome || '').split(' ').slice(0, 2).join(' '); }
    var pos1 = v1 >= v2 ? 1 : 2, pos2 = v2 > v1 ? 1 : 2, dif = Math.abs(v1 - v2), lid = v1 === v2 ? '' : (v1 > v2 ? (ident(11).nome || 'Mailza Assis') : (ident(10).nome || 'Alan Rick'));
    var pc1 = tem ? v1 / v * 100 : 0, pc2 = tem ? v2 / v * 100 : 0;
    // "tem como virar?": a diferença só é irreversível quando supera todos os votos que ainda podem entrar
    var rest = p ? p.restAptos : 0, completa = p && p.total > 0 && p.ok === p.total, nomeLid = lid ? lid.split(' ').slice(0, 2).join(' ') : '';
    var viraDef = !!(tem && lid && (completa || dif > rest));
    var viraMsg = !tem ? 'Ainda tem como virar' : !lid ? 'Empate: ainda tem como virar' : (completa ? 'Resultado final: ' + nomeLid + ' ganhou' : (viraDef ? 'Não tem como virar: ' + nomeLid + ' já ganhou' : 'Ainda tem como virar'));
    // quem está ganhando, há quanto tempo está na frente e quantas vezes a liderança mudou ("—" enquanto não começou)
    var n1 = curto(ident(11).nome || 'Mailza Assis'), n2 = curto(ident(10).nome || 'Alan Rick'), quemNome = ld && ld.quem === 1 ? n1 : ld && ld.quem === 2 ? n2 : '';
    var atualMs = ld && ld.quem ? Math.max(0, ld.ultimoT - ld.desde) : 0;
    var vence = '<div class="pg-vence">' +
      '<span class="pg-vc ' + (tem && ld && ld.quem ? 'c' + ld.quem : '') + '"><i>Vantagem</i><b>' + (tem && lid ? '+' + fmt(dif) : '—') + '</b><small>' + (tem && lid ? 'votos sobre ' + esc(curto(v1 > v2 ? n2 : n1)) : '&nbsp;') + '</small></span>' +
      '<span><i>Na frente há</i><b>' + (tem && ld && ld.quem ? dur(atualMs) : '—') + '</b><small>' + (tem && ld ? n1 + ' ' + dur(ld.tempo1) + ' · ' + n2 + ' ' + dur(ld.tempo2) : '&nbsp;') + '</small></span>' +
      '<span><i>Mudanças de liderança</i><b>' + (tem && ld ? ld.mudancas : '—') + '</b><small>' + (tem && ld ? n1 + ' ' + ld.vezes1 + '× · ' + n2 + ' ' + ld.vezes2 + '× na frente' : '&nbsp;') + '</small></span></div>';
    el.innerHTML =
      lado(11, CORES[0], 'c1', v1, p ? p.munM : 0, p ? p.secM : 0, pos1) +
      '<div class="pg-centro"><div class="pg-duelo' + (tem ? '' : ' vazio') + '">' + (tem ? '<i class="e" style="width:' + pc1.toFixed(2) + '%;background:' + CORES[0] + '">' + pf1(pc1) + '</i><i class="d" style="width:' + pc2.toFixed(2) + '%;background:' + CORES[1] + '">' + pf1(pc2) + '</i>' : '') +
        '<span class="pg-nome">' + (tem && lid ? '▲ ' + esc(curto(lid)).toUpperCase() + ' ESTÁ GANHANDO' : (tem ? 'EMPATE' : '—')) + '</span></div>' + vence +
      '<p class="pg-vira' + (viraDef ? ' def' : '') + '">' + esc(viraMsg) + '</p>' +
      '<div class="pg-stats"><span><i>Votos válidos</i><b>' + fmt(v) + '</b></span><span><i>Brancos</i><b>' + fmt(e ? e.brancos : 0) + '</b></span><span><i>Nulos</i><b>' + fmt(e ? e.nulos : 0) + '</b></span>' +
      '<span><i>Municípios com voto</i><b>' + (p ? p.munCom : 0) + ' de ' + (p ? p.nMun : 22) + '</b></span></div></div>' +
      lado(10, CORES[1], 'c2', v2, p ? p.munA : 0, p ? p.secA : 0, pos2);
  }
  function tickBarra() {
    if (!barra) return;
    renderGeral(); renderPlacar(); rotulosFs();
    var cont = document.getElementById('etCont'), ult = document.getElementById('etUlt'), pl = document.getElementById('etPlacar');
    if (cont) {
      if (!st.auto) cont.textContent = 'Atualização automática desligada';
      else if (st.carregando) cont.textContent = 'Atualizando…';
      else { var f = Math.max(0, Math.ceil((st.proxima - Date.now()) / 1000)); cont.textContent = 'Próxima atualização em ' + String(Math.floor(f / 60)).padStart(2, '0') + ':' + String(f % 60).padStart(2, '0'); }
    }
    var ultimo = Math.max(st.ultimaData || 0, st.ultimaDetalhe || 0);
    if (ult) ult.textContent = 'Atualizado pela última vez: ' + (ultimo ? dataHora(ultimo) : '—');
    var lk = document.getElementById('etLinkCfg');   // gerenciar o link: só o responsável, e nunca na página pública
    if (lk) lk.hidden = !(window.ApuracaoLinks && !window.APURACAO_PUBLICA && window.ApuracaoLinks.responsavel());
    var stt = document.getElementById('etStatus'), est = st.estado;
    if (stt) {
      var pct = est && est.secoes ? est.secoes.pct : 0, ap = est && est.secoes && est.secoes.apuradas > 0;
      var txt = !ap ? 'Aguardando apuração' : (pct >= 100 && est.encerrada ? 'Apuração encerrada' : 'Apurando · ' + pct.toFixed(1).replace('.', ',') + '% das seções');
      stt.textContent = txt; stt.className = 'et-cab-status ' + (!ap ? 'esp' : (pct >= 100 && est.encerrada ? 'fim' : 'vivo'));
    }
    var D = window.GOVERNO_2T_2026;
    if (pl && D && D.estado && D.estado.validos > 0 && D.candidatos && D.candidatos.length > 1) {
      var a = D.candidatos[0], b = D.candidatos[1], v = D.estado.validos;
      pl.innerHTML = '<b style="color:' + (a.num === 11 ? CORES[0] : CORES[1]) + '">' + esc(a.nome.split(' ').slice(0, 2).join(' ')) + ' ' + (a.votos / v * 100).toFixed(1).replace('.', ',') + '%</b> × <b style="color:' + (b.num === 11 ? CORES[0] : CORES[1]) + '">' + (b.votos / v * 100).toFixed(1).replace('.', ',') + '% ' + esc(b.nome.split(' ').slice(0, 2).join(' ')) + '</b>';
    } else if (pl) pl.textContent = '';
  }
  /* "Link público": só copia o endereço fixo para a área de transferência */
  var PUBLICO_URL = 'https://iadoagro.github.io/agricultura/pages/publico', linkTimer = null;
  function copiarLink(btn) {
    function feito(ok) {
      btn.textContent = ok ? 'Link copiado ✓' : 'Copie: ' + PUBLICO_URL;
      clearTimeout(linkTimer); linkTimer = setTimeout(function () { btn.textContent = 'Link público'; }, 2200);
    }
    function reserva() {
      var t = document.createElement('textarea'); t.value = PUBLICO_URL; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* sem permissão */ }
      t.remove(); feito(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(PUBLICO_URL).then(function () { feito(true); }, reserva); else reserva();
  }
  /* Tela cheia = o mesmo que F11: usa a API de tela cheia do navegador. No sistema (admin) também liga o layout
     "só apuração"; na página pública esse layout já é permanente. */
  function fsNavegador() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function pedeFsNavegador(on) {
    var el = document.documentElement;
    try {
      if (on && !fsNavegador()) { var f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) { var r = f.call(el); if (r && r.catch) r.catch(function () {}); } }
      else if (!on && fsNavegador()) { var g = document.exitFullscreen || document.webkitExitFullscreen; if (g) { var q = g.call(document); if (q && q.catch) q.catch(function () {}); } }
    } catch (e) { /* o navegador pode negar; o layout interno continua valendo */ }
  }
  function telaCheiaAtiva() { return window.APURACAO_PUBLICA ? fsNavegador() : (document.documentElement.classList.contains('et-fs') || fsNavegador()); }
  function rotulosFs() {
    var on = telaCheiaAtiva();
    document.querySelectorAll('[data-fsbr]').forEach(function (b) { var t = on ? '✕ Sair da tela cheia' : '⛶ Tela cheia'; if (b.textContent !== t) b.textContent = t; b.classList.toggle('ativo', on); });
  }
  function telaCheia(on) {
    var html = document.documentElement;
    on = on == null ? !telaCheiaAtiva() : on;
    if (!window.APURACAO_PUBLICA) html.classList.toggle('et-fs', on);
    pedeFsNavegador(on);
    rotulosFs();
    ajustaBarra();
    setTimeout(function () { ajustaBarra(); window.dispatchEvent(new Event('resize')); }, 60);   // mapas (Leaflet) recalculam o tamanho
  }
  function ajustaBarra() { if (barra) document.documentElement.style.setProperty('--et-barra-h', (barra.offsetHeight + 10) + 'px'); }
  window.addEventListener('resize', ajustaBarra);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !window.APURACAO_PUBLICA && document.documentElement.classList.contains('et-fs') && !document.querySelector('.t26-cheia')) telaCheia(false); });
  // saiu da tela cheia do navegador (Esc/F11): no sistema volta também o layout normal
  document.addEventListener('fullscreenchange', function () {
    if (!fsNavegador() && !window.APURACAO_PUBLICA) document.documentElement.classList.remove('et-fs');
    rotulosFs(); ajustaBarra(); setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 80);
  });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-fsbr]')) telaCheia(); });

  function agenda() {
    st.proxima = Date.now() + st.seg * 1000;
    window.dispatchEvent(new CustomEvent('et-intervalo', { detail: { ms: st.seg * 1000, auto: st.auto } }));   // js/eleicoes-2turno-secoes.js segue o mesmo ritmo
  }
  // um único relógio: atualiza a contagem e dispara a atualização quando zera
  setInterval(function () {
    if (iniciou && st.auto && !st.carregando && Date.now() >= st.proxima) {
      if (!document.hidden && raiz.offsetParent !== null) carrega(); else st.proxima = Date.now() + st.seg * 1000;
    }
    tickBarra();
  }, 1000);

  function aoMudar(e) {
    if (e.target.id === 'etOrdem') { st.ordem = e.target.value; desenha(st.estado && !temVotos(st.estado) ? { aguardando: true } : null); }
  }
  raiz.addEventListener('change', aoMudar);
  if (barra) {
    barra.addEventListener('change', aoMudar);
    barra.addEventListener('click', function (e) {
      if (e.target.id === 'etFs') telaCheia();
      else if (e.target.id === 'etLinkCfg' && window.ApuracaoLinks) window.ApuracaoLinks.abrir();
      else if (e.target.id === 'etLink') copiarLink(e.target);
    });
  }
  window.addEventListener('et-atualizado', function (e) { st.ultimaDetalhe = e.detail || Date.now(); });

  /* Sentinela: a cada 2 s baixa o arquivo de totalização do estado (pequeno) e compara a "geração" (idg) dele; se mudou,
     atualiza na hora — resumo e painel detalhado —, sem esperar os 30 s. (O TSE não responde CORS a requisições HEAD,
     por isso a verificação é um GET.) */
  function sentinela() {
    if (!st.auto || document.hidden || raiz.offsetParent === null || st.carregando) return;
    var turno = st.turno;
    tfetch(url(turno), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return { m: String(r.status) };
      return r.json().then(function (d) { return { m: r.status + '|' + (d.idg || '') + '|' + (d.hg || '') + '|' + (d.dt || '') + (d.ht || '') }; });
    }).then(function (x) {
      if (turno !== st.turno) return;
      if (st.marca && x.m !== st.marca) { st.marca = x.m; carrega(); window.dispatchEvent(new CustomEvent('et-novidade')); return; }
      st.marca = x.m;
    }).catch(function () { /* rede instável: o intervalo normal cobre */ });
  }
  setInterval(sentinela, CFG.sentinela);
  var iniciou = false;
  function painelDetalhe() { if (window.PainelGoverno2T) window.PainelGoverno2T.mostrar('2026'); }   // js/eleicao-painel.js (dados em branco até o 2º turno)
  function inicia() { if (iniciou) return; iniciou = true; montaBarra(); desenha(); carrega(); agenda(); painelDetalhe(); tickBarra(); }
  window.addEventListener('aba-eleicoes', function (e) { if (e.detail === 'eleicoes') { inicia(); carrega(); painelDetalhe(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && iniciou && raiz.offsetParent !== null) carrega(); });
  if (raiz.closest('.aba-conteudo.ativa')) inicia();
})();
