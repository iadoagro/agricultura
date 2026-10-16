/* Aba "Alertas" do painel de Mecanização: avisos de produtividade para a gestão.
     - técnico ou escritório com atendimentos abaixo de X% da média no período analisado;
     - município sem atendimento há mais de N dias.
   Os limites (X%, janela em dias, N dias) ficam em public.mecanizacao_alertas_config e só o
   responsável altera. Não depende dos filtros da lateral. Só na versão interna (logado).
   Usa window.PAINEL_API (js/dashboard.js). */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A || A.modoPublico()) return;
  var G = A.G;
  var CFG = { limite_pct: 70, janela_dias: 90, dias_sem_atendimento: 45 };
  var ULTIMO = null;

  function el(id) { return document.getElementById(id); }
  function cfgBanco() { return window.BANCO_CONFIG || {}; }
  function base() { return String(cfgBanco().url || '').replace(/\/$/, '') + '/rest/v1/mecanizacao_alertas_config'; }

  function carregarConfig() {
    if (!cfgBanco().url) return Promise.resolve();
    return fetch(base() + '?select=*&id=eq.1', { headers: { apikey: cfgBanco().chavePublica }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (l) {
        if (l && l[0]) {
          CFG.limite_pct = +l[0].limite_pct || CFG.limite_pct;
          CFG.janela_dias = +l[0].janela_dias || CFG.janela_dias;
          CFG.dias_sem_atendimento = +l[0].dias_sem_atendimento || CFG.dias_sem_atendimento;
        }
      }).catch(function () { /* fica o padrão */ });
  }

  function isoDiasAtras(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function diasEntre(aIso, bIso) {
    return Math.round((Date.parse(bIso + 'T12:00:00Z') - Date.parse(aIso + 'T12:00:00Z')) / 86400000);
  }
  function dataBR(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }

  /** Quem está abaixo de limite% da média, entre os que atuaram no último ano. */
  function abaixoDaMedia(regs, campo, janelaIni, hoje, anoIni) {
    var ativos = new Map(), cont = new Map(), ultima = new Map();
    regs.forEach(function (r) {
      var k = r[campo];
      if (!k || k === A.NI) return;
      var d = A.dataRef(r);
      if (d > hoje) return;
      if (d >= anoIni) ativos.set(k, true);
      if (!ultima.has(k) || d > ultima.get(k)) ultima.set(k, d);
      if (d >= janelaIni) cont.set(k, (cont.get(k) || 0) + 1);
    });
    var nomes = Array.from(ativos.keys());
    if (nomes.length < 2) return { media: 0, lista: [], n: nomes.length };
    var total = 0;
    nomes.forEach(function (k) { total += cont.get(k) || 0; });
    var media = total / nomes.length;
    var corte = media * CFG.limite_pct / 100;
    var lista = media < 3 ? [] : nomes.map(function (k) {
      var n = cont.get(k) || 0;
      return { nome: k, n: n, pct: media ? n / media * 100 : 0, ultima: ultima.get(k) };
    }).filter(function (x) { return x.n < corte; }).sort(function (a, b) { return a.n - b.n || a.nome.localeCompare(b.nome, 'pt-BR'); });
    return { media: media, lista: lista, n: nomes.length };
  }

  function calcular() {
    var regs = A.registros();
    var hoje = isoDiasAtras(0), janelaIni = isoDiasAtras(CFG.janela_dias), anoIni = isoDiasAtras(365);
    var tec = abaixoDaMedia(regs, 'rt', janelaIni, hoje, anoIni);
    var esc = abaixoDaMedia(regs, 'esc', janelaIni, hoje, anoIni);
    var ultimaMun = new Map(), regional = {};
    regs.forEach(function (r) {
      if (!r.mun || r.mun === A.NI) return;
      var d = A.dataRef(r);
      if (d > hoje) return;
      if (!ultimaMun.has(r.mun) || d > ultimaMun.get(r.mun)) ultimaMun.set(r.mun, d);
    });
    var muns = [];
    ultimaMun.forEach(function (d, m) {
      var dias = diasEntre(d, hoje);
      if (dias > CFG.dias_sem_atendimento && dias <= 730) muns.push({ nome: m, ultima: d, dias: dias, regional: A.regionalDe(m) || '—' });
    });
    muns.sort(function (a, b) { return b.dias - a.dias; });
    return { tec: tec, esc: esc, mun: muns, hoje: hoje };
  }

  function tabela(alvo, cab, linhas, vazio) {
    var e = el(alvo);
    if (!e) return;
    if (!linhas.length) { e.innerHTML = '<p class="vazio">' + G.esc(vazio) + '</p>'; return; }
    e.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      cab.map(function (c) { return '<th>' + G.esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + linhas.join('') + '</tbody></table></div>';
  }

  function total(R) { return R.tec.lista.length + R.esc.lista.length + R.mun.length; }

  function desenhar() {
    var R = calcular();
    ULTIMO = R;
    A.tiles('kpisAlertas', [
      { _sec: 'Situação' },
      { rot: 'Alertas ativos', val: G.num(total(R)), cls: total(R) ? 'alerta-kpi' : '' },
      { rot: 'Técnicos abaixo da média', val: G.num(R.tec.lista.length), sub: 'média de ' + G.num(R.tec.media, 1) + ' atend. em ' + CFG.janela_dias + ' dias' },
      { rot: 'Escritórios abaixo da média', val: G.num(R.esc.lista.length), sub: 'média de ' + G.num(R.esc.media, 1) + ' atend. em ' + CFG.janela_dias + ' dias' },
      { rot: 'Municípios sem atendimento', val: G.num(R.mun.length), sub: 'há mais de ' + CFG.dias_sem_atendimento + ' dias' }
    ]);
    var sub = el('alertasCriterio');
    if (sub) sub.textContent = 'Critérios: abaixo de ' + CFG.limite_pct + '% da média dos últimos ' + CFG.janela_dias +
      ' dias (entre quem atuou no último ano) · município sem atendimento há mais de ' + CFG.dias_sem_atendimento + ' dias. Dados até ' + dataBR(R.hoje) + '.';
    var linhaTE = function (x) {
      return '<tr><td class="forte">' + G.esc(x.nome) + '</td><td class="num">' + G.num(x.n) + '</td><td class="num">' +
        G.num(x.pct, 0) + '%</td><td class="num">' + G.esc(dataBR(x.ultima)) + '</td></tr>';
    };
    tabela('tAlertTec', ['Técnico', 'Atendimentos', '% da média', 'Última atuação'], R.tec.lista.map(linhaTE),
      R.tec.n < 2 ? 'Poucos técnicos ativos para calcular a média.' : 'Nenhum técnico abaixo do limite.');
    tabela('tAlertEsc', ['Escritório', 'Atendimentos', '% da média', 'Último atendimento'], R.esc.lista.map(linhaTE),
      R.esc.n < 2 ? 'Poucos escritórios ativos para calcular a média.' : 'Nenhum escritório abaixo do limite.');
    tabela('tAlertMun', ['Município', 'Regional', 'Último atendimento', 'Dias sem atendimento'], R.mun.map(function (x) {
      return '<tr><td class="forte">' + G.esc(x.nome) + '</td><td>' + G.esc(x.regional) + '</td><td class="num">' + G.esc(dataBR(x.ultima)) +
        '</td><td class="num">' + G.num(x.dias) + '</td></tr>';
    }), 'Todos os municípios foram atendidos dentro do prazo.');
    desenharGeral();
    desenharConfig();
  }

  function desenharGeral() {
    var alvo = el('kpisAlertasGeral');
    if (!alvo || !ULTIMO) return;
    var n = total(ULTIMO);
    if (!n) { alvo.innerHTML = ''; alvo.hidden = true; return; }
    alvo.hidden = false;
    A.tiles('kpisAlertasGeral', [{ _sec: 'Alertas' }, {
      rot: 'Alertas de produtividade', val: G.num(n), ir: 'alertas', cls: 'alerta-kpi',
      sub: G.num(ULTIMO.tec.lista.length) + ' técnico(s) · ' + G.num(ULTIMO.esc.lista.length) + ' escritório(s) · ' + G.num(ULTIMO.mun.length) + ' município(s)'
    }]);
  }

  function desenharConfig() {
    var box = el('alertasConfig');
    if (!box) return;
    var admin = A.ehResponsavel();
    box.hidden = !admin;
    if (!admin || box.getAttribute('data-ok')) return;
    box.setAttribute('data-ok', '1');
    box.innerHTML =
      '<label>Abaixo de (% da média) <input type="number" id="alLimite" min="10" max="100" step="5" value="' + CFG.limite_pct + '"></label>' +
      '<label>Janela analisada (dias) <input type="number" id="alJanela" min="7" max="365" step="1" value="' + CFG.janela_dias + '"></label>' +
      '<label>Município sem atendimento há (dias) <input type="number" id="alDias" min="7" max="365" step="1" value="' + CFG.dias_sem_atendimento + '"></label>' +
      '<button type="button" class="btn" id="alSalvar">Salvar limites</button><span class="meta-msg" id="alMsg" role="status"></span>';
    el('alSalvar').addEventListener('click', salvar);
  }

  function salvar() {
    var msg = el('alMsg');
    var corpo = {
      id: 1, limite_pct: +el('alLimite').value, janela_dias: +el('alJanela').value, dias_sem_atendimento: +el('alDias').value,
      atualizado_em: new Date().toISOString()
    };
    if (!(corpo.limite_pct >= 10 && corpo.limite_pct <= 100) || !(corpo.janela_dias >= 7 && corpo.janela_dias <= 365) ||
        !(corpo.dias_sem_atendimento >= 7 && corpo.dias_sem_atendimento <= 365)) {
      msg.textContent = 'Valores fora do intervalo permitido.'; msg.className = 'meta-msg erro'; return;
    }
    var s = window.ADMIN_AUTH && ADMIN_AUTH.sessaoAtual && ADMIN_AUTH.sessaoAtual();
    if (!s || !s.access_token) { msg.textContent = 'Entre novamente para continuar.'; msg.className = 'meta-msg erro'; return; }
    msg.textContent = 'Salvando…'; msg.className = 'meta-msg';
    fetch(base() + '?on_conflict=id', {
      method: 'POST',
      headers: { apikey: cfgBanco().chavePublica, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error('Só o responsável (root) pode alterar os limites.');
      if (!r.ok) throw new Error('Não foi possível salvar (HTTP ' + r.status + ').');
      return r.json();
    }).then(function (l) {
      if (!Array.isArray(l) || l.length !== 1) throw new Error('O banco não confirmou a gravação.');
      CFG.limite_pct = corpo.limite_pct; CFG.janela_dias = corpo.janela_dias; CFG.dias_sem_atendimento = corpo.dias_sem_atendimento;
      A.auditar('alterar', 'Alterou os limites dos alertas (' + corpo.limite_pct + '%, ' + corpo.janela_dias + ' dias, ' + corpo.dias_sem_atendimento + ' dias)');
      msg.textContent = 'Limites salvos ✓';
      desenhar();
    }).catch(function (e) { msg.textContent = e.message; msg.className = 'meta-msg erro'; });
  }

  A.registrarAba('alertas', function () { desenhar(); });
  A.aoCarregar(function () { carregarConfig().then(function () { ULTIMO = calcular(); desenharGeral(); }); });
})();
