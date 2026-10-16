/* Aba "Metas" do painel de Mecanização: meta anual por indicador (e, se quiser, por município),
   com realizado, % da meta, projeção para o fim do ano e semáforo. As metas ficam na tabela
   public.mecanizacao_metas (database/mecanizacao-metas.sql): todos leem, só o responsável grava.
   As metas não dependem dos filtros da lateral. Usa window.PAINEL_API (js/dashboard.js). */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A) return;
  var G = A.G;
  var METRICAS = {
    ha: { rot: 'Hectares mecanizados', un: 'ha', dec: 1 },
    horas: { rot: 'Horas de máquina', un: 'h', dec: 1 },
    tanques: { rot: 'Tanques / açudes', un: '', dec: 0 },
    atendimentos: { rot: 'Atendimentos', un: '', dec: 0 }
  };
  var METAS = [], ESTADO = 'carregando', MSG = '';

  function el(id) { return document.getElementById(id); }
  function cfg() { return window.BANCO_CONFIG || {}; }
  function base() { return String(cfg().url || '').replace(/\/$/, '') + '/rest/v1/mecanizacao_metas'; }

  function cabecalho(comSessao) {
    var h = { apikey: cfg().chavePublica, 'Content-Type': 'application/json' };
    if (comSessao) {
      var s = window.ADMIN_AUTH && ADMIN_AUTH.sessaoAtual && ADMIN_AUTH.sessaoAtual();
      if (!s || !s.access_token) throw new Error('Entre novamente para continuar.');
      h.Authorization = 'Bearer ' + s.access_token;
    }
    return h;
  }

  function carregar() {
    if (!cfg().url) { ESTADO = 'erro'; MSG = 'Banco não configurado.'; return Promise.resolve(); }
    return fetch(base() + '?select=*&order=ano.desc,metrica.asc,municipio.asc', { headers: cabecalho(false), cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404) throw new Error('A tabela de metas ainda não existe no banco (rode database/mecanizacao-metas.sql).');
        if (!r.ok) throw new Error('Não foi possível ler as metas (HTTP ' + r.status + ').');
        return r.json();
      })
      .then(function (l) { METAS = Array.isArray(l) ? l : []; ESTADO = 'ok'; })
      .catch(function (e) { ESTADO = 'erro'; MSG = e.message; });
  }

  /** Realizado de uma meta (independe dos filtros da lateral). */
  function realizado(m) {
    var D = A.registros().filter(function (r) {
      return A.anoDe(r) === m.ano && (!m.municipio || r.mun === m.municipio);
    });
    if (m.metrica === 'ha') return A.soma(D.filter(function (r) { return r.pc === A.MEC; }), function (r) { return r.ha; });
    if (m.metrica === 'horas') return A.soma(D, function (r) { return r.hrs; });
    if (m.metrica === 'tanques') return A.soma(D, function (r) { return r.ac; });
    return D.length;
  }

  /** Fração do ano já decorrida (só para o ano corrente; 1 para anos passados). */
  function fracaoDoAno(ano) {
    var hoje = new Date(), a = String(hoje.getFullYear());
    if (+ano < +a) return 1;
    if (+ano > +a) return 0;
    var ini = new Date(hoje.getFullYear(), 0, 1), fim = new Date(hoje.getFullYear() + 1, 0, 1);
    return (hoje - ini) / (fim - ini);
  }

  function situacao(m) {
    var real = realizado(m), frac = fracaoDoAno(m.ano), valor = +m.valor || 0;
    var pct = valor ? real / valor * 100 : 0;
    var proj = frac >= 1 ? real : (frac > 0.08 ? real / frac : null);
    var sem;
    if (frac >= 1) sem = real >= valor ? 'ok' : (real >= valor * 0.9 ? 'atencao' : 'ruim');
    else if (proj == null) sem = 'nd';
    else sem = proj >= valor ? 'ok' : (proj >= valor * 0.9 ? 'atencao' : 'ruim');
    return { real: real, pct: pct, proj: proj, sem: sem, valor: valor };
  }
  var ROT_SEM = { ok: 'No ritmo', atencao: 'Atenção', ruim: 'Abaixo do ritmo', nd: 'Início do ano' };

  function linhaMeta(m, comAcoes) {
    var S = situacao(m), dec = METRICAS[m.metrica].dec;
    return '<tr><td class="num">' + G.esc(m.ano) + '</td><td class="forte">' + G.esc(METRICAS[m.metrica].rot) + '</td>' +
      '<td>' + (m.municipio ? G.esc(m.municipio) : 'Acre (todos)') + '</td>' +
      '<td class="num">' + G.num(S.valor, dec) + '</td><td class="num">' + G.num(S.real, dec) + '</td>' +
      '<td class="num"><div class="meta-barra" title="' + G.num(S.pct, 0) + '% da meta"><span class="meta-' + S.sem + '" style="width:' +
      Math.min(100, Math.max(2, S.pct)).toFixed(1) + '%"></span></div>' + G.num(S.pct, 0) + '%</td>' +
      '<td class="num">' + (S.proj == null ? '—' : G.num(S.proj, dec)) + '</td>' +
      '<td><span class="meta-sem meta-' + S.sem + '"></span> ' + ROT_SEM[S.sem] + '</td>' +
      (comAcoes ? '<td><button type="button" class="btn meta-del" data-id="' + m.id + '" title="Excluir esta meta">×</button></td>' : '') + '</tr>';
  }

  function desenharLista() {
    var alvo = el('metasLista');
    if (!alvo) return;
    var admin = !A.modoPublico() && A.ehResponsavel();
    if (ESTADO === 'carregando') { alvo.innerHTML = '<p class="vazio">Carregando metas…</p>'; return; }
    if (ESTADO === 'erro') { alvo.innerHTML = '<p class="aviso erro">' + G.esc(MSG) + '</p>'; return; }
    if (!METAS.length) {
      alvo.innerHTML = '<p class="vazio">Nenhuma meta cadastrada' + (admin ? '. Use o formulário abaixo.' : ' ainda.') + '</p>';
      return;
    }
    alvo.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Ano</th><th>Indicador</th><th>Território</th><th>Meta</th>' +
      '<th>Realizado</th><th>% da meta</th><th>Projeção</th><th>Situação</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
      METAS.map(function (m) { return linhaMeta(m, admin); }).join('') + '</tbody></table></div>' +
      '<p class="cmp-nota">Projeção = realizado ÷ fração do ano decorrida. No ano corrente, <b>No ritmo</b> = projeção ≥ meta; <b>Atenção</b> = ≥ 90%; senão <b>Abaixo do ritmo</b>.</p>';
  }

  function desenharEditor() {
    var sec = el('metasEditor'), f = el('metasForm');
    if (!sec || !f) return;
    var admin = !A.modoPublico() && A.ehResponsavel();
    sec.hidden = !admin;
    if (!admin || f.getAttribute('data-ok')) return;
    f.setAttribute('data-ok', '1');
    var anos = A.anos(), prox = String(+(anos[0] || new Date().getFullYear()) + 1);
    if (anos.indexOf(prox) < 0) anos.unshift(prox);
    var muns = {};
    A.registros().forEach(function (r) { if (r.mun) muns[r.mun] = true; });
    f.innerHTML =
      '<label>Ano <select id="metaAno">' + anos.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></label>' +
      '<label>Indicador <select id="metaMetrica">' + Object.keys(METRICAS).map(function (k) { return '<option value="' + k + '">' + METRICAS[k].rot + '</option>'; }).join('') + '</select></label>' +
      '<label>Município <select id="metaMun"><option value="">Acre (todos)</option>' +
      Object.keys(muns).sort().map(function (m) { return '<option>' + G.esc(m) + '</option>'; }).join('') + '</select></label>' +
      '<label>Meta <input type="number" id="metaValor" min="0" step="any" placeholder="0"></label>' +
      '<button type="button" class="btn" id="metaSalvar">Salvar meta</button><span class="meta-msg" id="metaMsg" role="status"></span>';
    el('metaSalvar').addEventListener('click', salvar);
  }

  function msg(t, erro) {
    var m = el('metaMsg');
    if (m) { m.textContent = t; m.className = 'meta-msg' + (erro ? ' erro' : ''); }
  }

  function salvar() {
    var valor = parseFloat(String(el('metaValor').value).replace(',', '.'));
    if (!(valor >= 0)) { msg('Informe um valor de meta válido.', true); return; }
    var corpo = {
      ano: el('metaAno').value, metrica: el('metaMetrica').value, municipio: el('metaMun').value,
      valor: valor, atualizado_em: new Date().toISOString(),
      atualizado_por: (window.ADMIN_AUTH && ADMIN_AUTH.sessaoAtual() && ADMIN_AUTH.sessaoAtual().user && ADMIN_AUTH.sessaoAtual().user.email) || ''
    };
    msg('Salvando…');
    var h;
    try { h = cabecalho(true); } catch (e) { msg(e.message, true); return; }
    h.Prefer = 'resolution=merge-duplicates,return=representation';
    fetch(base() + '?on_conflict=ano,metrica,municipio', { method: 'POST', headers: h, body: JSON.stringify(corpo) })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('Só o responsável (root) pode cadastrar metas.');
        if (!r.ok) throw new Error('Não foi possível salvar (HTTP ' + r.status + ').');
        return r.json();
      })
      .then(function (l) {
        if (!Array.isArray(l) || l.length !== 1) throw new Error('O banco não confirmou a gravação. Tente de novo.');
        return carregar();
      })
      .then(function () {
        A.auditar('alterar', 'Salvou meta ' + corpo.ano + ' · ' + corpo.metrica + ' · ' + (corpo.municipio || 'Acre') + ' = ' + corpo.valor);
        msg('Meta salva ✓'); desenharLista(); desenharGeral();
      })
      .catch(function (e) { msg(e.message, true); });
  }

  function excluir(id) {
    if (!window.confirm('Excluir esta meta?')) return;
    var h;
    try { h = cabecalho(true); } catch (e) { window.alert(e.message); return; }
    h.Prefer = 'return=representation';
    fetch(base() + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: h })
      .then(function (r) {
        if (!r.ok) throw new Error('Não foi possível excluir (HTTP ' + r.status + ').');
        return r.json();
      })
      .then(function (l) {
        if (!Array.isArray(l) || !l.length) throw new Error('O banco não confirmou a exclusão.');
        return carregar();
      })
      .then(function () { A.auditar('alterar', 'Excluiu a meta #' + id); desenharLista(); desenharGeral(); })
      .catch(function (e) { window.alert(e.message); });
  }

  /** Cartões de meta na Visão geral: só as metas do Acre inteiro do ano mais recente. */
  function desenharGeral() {
    var alvo = document.getElementById('kpisMetasGeral');
    if (!alvo) return;
    var ano = A.anos()[0];
    var ms = METAS.filter(function (m) { return m.ano === ano && !m.municipio; });
    if (!ms.length) { alvo.innerHTML = ''; alvo.hidden = true; return; }
    alvo.hidden = false;
    A.tiles('kpisMetasGeral', [{ _sec: 'Metas de ' + ano }].concat(ms.map(function (m) {
      var S = situacao(m), mt = METRICAS[m.metrica];
      return {
        rot: mt.rot, val: G.num(S.pct, 0) + '%', ir: 'metas',
        cls: 'meta-kpi meta-kpi-' + S.sem,
        sub: G.num(S.real, mt.dec) + ' de ' + G.num(S.valor, mt.dec) + (mt.un ? ' ' + mt.un : '') + ' · ' + ROT_SEM[S.sem]
      };
    })));
  }

  var lista = el('metasLista');
  if (lista) lista.addEventListener('click', function (e) {
    var b = e.target.closest('.meta-del');
    if (b) excluir(b.getAttribute('data-id'));
  });

  A.registrarAba('metas', function () {
    desenharLista();
    desenharEditor();
    carregar().then(function () { desenharLista(); desenharGeral(); });   // pega mudanças feitas por outra pessoa
  });
  A.aoCarregar(function () { carregar().then(function () { desenharGeral(); desenharLista(); }); });
})();
