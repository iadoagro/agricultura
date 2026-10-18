/* Página pública da apuração — casca para telefone (css/eleicao-mobile.css, html.ap-m).
   Não refaz a apuração: lê o que js/eleicoes-2turno.js e js/eleicao-painel.js já desenharam e monta, por cima, um placar
   fixo no alto e uma navegação por baixo (Mapa · Níveis · Resultados · Resumo). Tocar numa opção aciona o botão da aba
   original, então tudo o que a aba faz (mapa, filtros, tabelas) continua igual. */
(function () {
  'use strict';
  var app = document.getElementById('apPubApp');
  if (!app || document.getElementById('apmTopo')) return;

  // Grupos da navegação: cada tecla é o data-t26 de uma aba do painel
  var GRUPOS = [
    { rot: 'Mapa', ico: '🗺️', tit: 'Mapa', abas: ['mapa'] },
    { rot: 'Níveis', ico: '📍', tit: 'Detalhar por', abas: ['reg', 'mun', 'zona', 'bairro', 'local', 'sec'] },
    { rot: 'Resultados', ico: '📊', tit: 'Resultados', abas: ['apur', 'p1', 'p2', 'abst', 'bn'] },
    { rot: 'Resumo', ico: '📋', tit: 'Resumo', abas: ['resumo', 'perfil'] }
  ];

  function el(tag, id, cls) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; }
  function botaoDaAba(k) { return app.querySelector('.t26-abas-lista [data-t26="' + k + '"]'); }
  function abaAtual() { var b = app.querySelector('.t26-abas-lista [aria-selected="true"]'); return b ? b.getAttribute('data-t26') : ''; }

  var topo = el('header', 'apmTopo');
  topo.innerHTML =
    '<div class="apm-l1"><span id="apmStatus"><i class="apm-ponto"></i><b>Aguardando</b></span><span id="apmSecoes"></span></div>' +
    '<div class="apm-placar" id="apmPlacar" aria-live="polite"></div>' +
    '<div class="apm-barra" id="apmBarra"><i style="width:50%;background:#94a3b8"></i></div>' +
    '<div class="apm-l3"><span id="apmCont"></span><span id="apmSessao"></span></div>';
  app.insertBefore(topo, app.firstChild);

  var nav = el('nav', 'apmNav'); nav.setAttribute('aria-label', 'Seções da apuração');
  var veu = el('div', 'apmVeu'), folha = el('div', 'apmSheet');
  folha.setAttribute('role', 'dialog'); folha.setAttribute('aria-modal', 'true');
  document.body.append(nav, veu, folha);

  function fechar() { veu.classList.remove('on'); folha.classList.remove('on'); }
  veu.addEventListener('click', fechar);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });

  function irPara(k) {
    var b = botaoDaAba(k);
    if (!b) return;
    if (b.getAttribute('aria-selected') !== 'true') b.click();
    fechar();
    // leva o conteúdo da aba para logo abaixo do placar
    setTimeout(function () {
      var c = app.querySelector('.t26-abas-acoes') || app.querySelector('.t26-corpo');
      if (c) window.scrollTo({ top: c.getBoundingClientRect().top + window.scrollY - topo.offsetHeight - 6, behavior: 'smooth' });
    }, 60);
  }

  function abrirFolha(g) {
    var h = '<div class="apm-alca"></div><h2>' + g.tit + '</h2>';
    g.abas.forEach(function (k) {
      var b = botaoDaAba(k);
      if (b) h += '<button type="button" data-k="' + k + '"' + (k === abaAtual() ? ' class="on"' : '') + '>' + b.textContent + '</button>';
    });
    folha.innerHTML = h;
    veu.classList.add('on'); folha.classList.add('on');
  }
  folha.addEventListener('click', function (e) { var b = e.target.closest('button[data-k]'); if (b) irPara(b.getAttribute('data-k')); });

  GRUPOS.forEach(function (g, i) {
    var b = el('button'); b.type = 'button'; b.dataset.g = i;
    b.innerHTML = '<span>' + g.ico + '</span>' + g.rot;
    b.addEventListener('click', function () {
      var disp = g.abas.filter(botaoDaAba);
      if (!disp.length) return;
      if (disp.length === 1) irPara(disp[0]); else abrirFolha(g);
    });
    nav.appendChild(b);
  });

  // ---- espelha no placar o que a apuração desenhou (candidatos, % de seções, contagem regressiva) ----
  function texto(id) { var e = document.getElementById(id); return e ? e.textContent.trim() : ''; }
  function num(t) { var n = parseFloat(String(t).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; }
  function sincronizar() {
    var cands = Array.prototype.slice.call(app.querySelectorAll('.et-cand')).slice(0, 2);
    var pl = document.getElementById('apmPlacar'), barra = document.getElementById('apmBarra');
    if (cands.length === 2) {
      var dados = cands.map(function (c) {
        var pct = c.querySelector('.et-pct'), v = c.querySelector('.et-votos');
        return {
          nome: (c.querySelector('h3') || {}).textContent || '', pct: pct ? pct.textContent.trim() : '—',
          votos: v ? v.textContent.replace(/\s*votos$/, ' votos').trim() : '',
          cor: c.style.getPropertyValue('--cor') || '#fff', n: pct ? num(pct.textContent) : null
        };
      });
      pl.innerHTML = dados.map(function () { return '<div class="apm-c"><span></span><strong></strong><small></small></div>'; }).join('');
      Array.prototype.forEach.call(pl.children, function (d, i) {
        d.style.setProperty('--cor', dados[i].cor);
        d.children[0].textContent = dados[i].nome; d.children[1].textContent = dados[i].pct; d.children[2].textContent = dados[i].votos;
      });
      var a = dados[0].n, b = dados[1].n, tot = (a || 0) + (b || 0);
      barra.innerHTML = tot > 0
        ? '<i style="width:' + (a / tot * 100).toFixed(2) + '%;background:' + dados[0].cor + '"></i><i style="width:' + (b / tot * 100).toFixed(2) + '%;background:' + dados[1].cor + '"></i>'
        : '<i style="width:50%;background:' + dados[0].cor + ';opacity:.45"></i><i style="width:50%;background:' + dados[1].cor + ';opacity:.45"></i>';
    }
    var st = texto('etStatus') || 'Aguardando apuração';
    var sEl = document.getElementById('apmStatus');
    sEl.className = /encerrada/i.test(st) ? 'apm-fim' : /aguard/i.test(st) ? '' : 'apm-vivo';
    sEl.lastChild.textContent = st;
    var g = texto('etGeral').replace(/^Apuração geral\s*/i, '').replace(/ seções apuradas/, ' seções');
    document.getElementById('apmSecoes').textContent = g;
    document.getElementById('apmCont').textContent = texto('etCont').replace('Próxima atualização em', '↻ Atualiza em');
    // contador de sessão (só quem entrou com a senha da página) passa para o placar
    var ses = document.querySelector('.ap-sessao');
    var slot = document.getElementById('apmSessao');
    if (ses && ses.parentNode !== slot) slot.appendChild(ses);
    tabelasEmCartoes();
    // destaca o grupo da aba aberta
    var atual = abaAtual();
    Array.prototype.forEach.call(nav.children, function (b, i) { b.classList.toggle('on', GRUPOS[i].abas.indexOf(atual) >= 0); });
  }

  /* tabelas largas (13 colunas no município) viram um cartão por linha: cada célula ganha o nome da coluna (data-l) */
  function tabelasEmCartoes() {
    Array.prototype.forEach.call(app.querySelectorAll('.t26-tab table:not([data-cartoes])'), function (t) {
      var ths = Array.prototype.map.call(t.querySelectorAll('thead th'), function (h) { return h.textContent.trim(); });
      if (ths.length < 6) { t.setAttribute('data-cartoes', '0'); return; }
      t.setAttribute('data-cartoes', '1');
      Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) {
          td.setAttribute('data-l', ths[i] || '');
          var v = td.textContent.trim();
          if (i > 0 && (v === '' || v === '–' || v === '—' || v === '0 –')) td.setAttribute('data-vazio', '1');
        });
      });
    });
  }

  var pend = 0;
  function agendar() { if (pend) return; pend = setTimeout(function () { pend = 0; sincronizar(); }, 250); }
  if (window.MutationObserver) new MutationObserver(agendar).observe(document.getElementById('painel-turno2') || app, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-selected'] });
  sincronizar();
})();
