/* Visão "Mapa de pontos" (dentro de Inserções): um ponto por atendimento georreferenciado, com
   agrupamento, camada de SATÉLITE (padrão) ou mapa, e cor por serviço ou por cultura.
   Coordenadas digitadas errado são CORRIGIDAS automaticamente (js/painel-calculos.js,
   repararPontos): o algoritmo lê o que a pessoa quis digitar (x/y trocados, dígito faltando ou
   sobrando, zona errada, graus sem vírgula…) e escolhe a leitura mais próxima do município.
   Pontos corrigidos têm anel âmbar; os que não deram para recuperar vão ao centro do município
   (anel vermelho). As coordenadas só chegam para quem está logado (função lancar-mecanizacao,
   ação "painel"); na versão pública a visão não existe. Respeita os filtros da lateral.
   Leaflet e markercluster são carregados só quando a visão é aberta. */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A) return;
  var G = A.G;
  if (A.modoPublico()) return;

  var PC = window.PainelCalculos;
  var CORES_SERVICO = {};
  CORES_SERVICO[A.MEC] = '#16a34a';   // mecanização: verde
  CORES_SERVICO[A.ACU] = '#2563eb';   // açudagem: azul

  var MAPA = null, CAMADA = null, CALOR = null, AREAS = null;
  var PALETA_AREA = ['#f59e0b', '#a855f7', '#06b6d4', '#ef4444', '#84cc16', '#ec4899', '#0ea5e9', '#f97316'];
  var REPARADOS = null, REPARADOS_N = -1;   // WeakMap(registro -> [leituras]) da base inteira

  /** Repara a base inteira de uma vez (o centro de cada município vem dos pontos corretos de todos). */
  function repararBase() {
    var reg = A.registros();
    if (REPARADOS && REPARADOS_N === reg.length) return REPARADOS;
    var itens = [], donos = [];
    reg.forEach(function (r) {
      if (!r.geo || !r.geo.length) return;
      r.geo.forEach(function (g, i) {
        itens.push({ mun: r.mun, x: g[0], y: g[1], zona: g[2] });
        donos.push([r, i]);
      });
    });
    var res = PC.repararPontos(itens), mapa = new WeakMap();
    res.forEach(function (x, k) {
      var r = donos[k][0], lista = mapa.get(r);
      if (!lista) mapa.set(r, lista = []);
      x.original = itens[k];
      lista[donos[k][1]] = x;
    });
    REPARADOS = mapa;
    REPARADOS_N = reg.length;
    return mapa;
  }

  function carregarLeaflet() {
    return new Promise(function (ok, falha) {
      if (window.L && window.L.markerClusterGroup && window.L.heatLayer) { ok(); return; }
      function css(href) {
        var l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href; l.crossOrigin = 'anonymous';
        document.head.appendChild(l);
      }
      function js(src) {
        return new Promise(function (res, rej) {
          var s = document.createElement('script');
          s.src = src; s.crossOrigin = 'anonymous';
          s.onload = res; s.onerror = function () { rej(new Error('Não foi possível carregar o mapa (' + src + ').')); };
          document.head.appendChild(s);
        });
      }
      css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      css('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
      css('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');
      js('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
        .then(function () { return js('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'); })
        .then(function () { return js('https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'); })
        .then(ok, falha);
    });
  }

  function pontosDe(D) {
    var base = repararBase(), pts = [], semGeo = 0;
    var cont = { original: 0, corrigida: 0, aproximada: 0 };
    D.forEach(function (r) {
      var lista = base.get(r);
      if (!lista || !lista.length) { semGeo++; return; }
      lista.forEach(function (x) {
        if (!x) return;
        cont[x.situacao]++;
        // coordenada que não deu para recuperar (ficaria só no centro do município): não entra no mapa
        if (x.situacao === 'aproximada') return;
        pts.push({ lat: x.lat, lng: x.lng, r: r, x: x });
      });
    });
    return { pts: pts, semGeo: semGeo, cont: cont };
  }

  function popup(p) {
    var r = p.r;
    var det = r.pc === A.MEC
      ? G.num(r.ha, 1) + ' ha' + (r.cult.length ? ' · ' + r.cult.map(function (c) { return G.esc(c[0]); }).join(', ') : '')
      : G.num(r.hrs, 1) + ' h' + (r.ac ? ' · ' + G.num(r.ac) + ' tanque(s)' : '');
    var v = r.dv || r.d;
    var h = '<b>' + G.esc(r.prod || '—') + '</b><br>' + G.esc(r.propr || '') + (r.propr ? '<br>' : '') +
      G.esc(r.mun || '—') + ' · ' + G.esc(r.pc || '—') + '<br>' + det +
      '<br><small>Vistoria: ' + G.esc(v.split('-').reverse().join('/')) + ' · ' + G.esc(r.rt || '—') + '</small>';
    if (r.form) h += '<br><a href="' + G.esc(r.form) + '" target="_blank" rel="noopener">abrir formulário</a>';
    return h;
  }

  function opcao(id, padrao) {
    var c = document.getElementById(id);
    return c ? c.checked : padrao;
  }

  function desenhar(C) {
    var sub = document.getElementById('pontosSub'), caixa = document.getElementById('mapaPontos');
    if (!caixa) return;
    var P = pontosDe(C.D);
    sub.textContent = G.num(P.pts.length) + ' ponto(s) no mapa · ' + G.num(P.semGeo + P.cont.aproximada) +
      ' atendimento(s) sem coordenada utilizável.';
    if (!P.pts.length && !MAPA) {
      caixa.innerHTML = '<p class="vazio" style="padding:16px">Nenhum atendimento com coordenada nesta seleção. As coordenadas só chegam para quem está logado.</p>';
      return;
    }
    if (!window.L || !window.L.markerClusterGroup || !window.L.heatLayer) {
      caixa.innerHTML = '<p class="vazio" style="padding:16px">Carregando o mapa…</p>';
      carregarLeaflet().then(function () { desenhar(C); }, function (e) {
        caixa.innerHTML = '<p class="aviso erro" style="margin:16px">' + G.esc(e.message) + '</p>';
      });
      return;
    }
    if (!MAPA) {
      caixa.innerHTML = '';
      MAPA = L.map(caixa, { preferCanvas: true }).setView([-9.0, -70.5], 6);
      var satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics'
      });
      var ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      });
      var rotulos = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: '© Esri'
      });
      satelite.addTo(MAPA);
      rotulos.addTo(MAPA);
      L.control.layers({ 'Satélite': satelite, 'Mapa': ruas }, { 'Nomes e limites': rotulos }, { collapsed: false }).addTo(MAPA);
    }
    setTimeout(function () { MAPA.invalidateSize(); }, 50);
    if (CAMADA) MAPA.removeLayer(CAMADA);
    if (CALOR) { MAPA.removeLayer(CALOR); CALOR = null; }
    if (AREAS) { MAPA.removeLayer(AREAS); AREAS = null; }
    CAMADA = L.markerClusterGroup({ disableClusteringAtZoom: 14, showCoverageOnHover: false, chunkedLoading: true });

    var verAcu = opcao('pontosVerAcu', true), verMec = opcao('pontosVerMec', true);
    var verCalor = opcao('pontosCalor', false), verAreas = opcao('pontosAreas', false);
    var mostrados = 0, visiveis = [];
    P.pts.forEach(function (p) {
      if (p.r.pc === A.ACU && !verAcu) return;
      if (p.r.pc === A.MEC && !verMec) return;
      visiveis.push(p);
      mostrados++;
      if (verCalor) return;   // no mapa de calor os pontos individuais não aparecem
      L.circleMarker([p.lat, p.lng], {
        radius: 6, color: '#fff', weight: 1.5, fillColor: CORES_SERVICO[p.r.pc] || '#94a3b8', fillOpacity: 0.92
      }).bindPopup(popup(p)).addTo(CAMADA);
    });
    if (verCalor) {
      CALOR = L.heatLayer(visiveis.map(function (p) { return [p.lat, p.lng, 0.6]; }), {
        radius: 24, blur: 20, maxZoom: 12, gradient: { 0.3: '#38bdf8', 0.55: '#facc15', 0.8: '#f97316', 1: '#dc2626' }
      }).addTo(MAPA);
    }
    if (verAreas) {
      // área de atuação de cada escritório: círculo do centro até o ponto que cobre 90% dos atendimentos
      var por = {};
      visiveis.forEach(function (p) { var k = p.r.esc; if (k && k !== A.NI) (por[k] = por[k] || []).push(p); });
      AREAS = L.layerGroup();
      Object.keys(por).forEach(function (k, idx) {
        var l = por[k];
        if (l.length < 3) return;
        var med = function (v) { v = v.slice().sort(function (a, b) { return a - b; }); return v[Math.floor(v.length / 2)]; };
        var c = [med(l.map(function (p) { return p.lat; })), med(l.map(function (p) { return p.lng; }))];
        var ds = l.map(function (p) { return PC.distKm([p.lat, p.lng], c); }).sort(function (a, b) { return a - b; });
        var raio = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.9))] * 1000;
        var cor = PALETA_AREA[idx % PALETA_AREA.length];
        L.circle(c, { radius: Math.max(raio, 1500), color: cor, weight: 2, fillColor: cor, fillOpacity: 0.12 })
          .bindTooltip(G.esc(k) + ' · ' + l.length + ' ponto(s) · raio de ' + Math.round(raio / 1000) + ' km', { sticky: true }).addTo(AREAS);
      });
      AREAS.addTo(MAPA);
    }
    MAPA.addLayer(CAMADA);
    if (mostrados) {
      try {
        MAPA.fitBounds(L.latLngBounds(visiveis.map(function (p) { return [p.lat, p.lng]; })).pad(0.15), { maxZoom: 12 });
      } catch (e) { /* sem limites */ }
    }
  }

  ['pontosVerAcu', 'pontosVerMec', 'pontosCalor', 'pontosAreas'].forEach(function (id) {
    var c = document.getElementById(id);
    if (c) c.addEventListener('change', function () { A.redesenhar(); });
  });

  window.PAINEL_PONTOS_DESENHAR = desenhar;   // chamado por js/dashboard.js quando a visão é aberta
})();
