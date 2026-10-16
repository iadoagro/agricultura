/* Aba "Pontos" do painel de Mecanização: mapa com um ponto por atendimento que tem coordenada
   (UTM WGS84, zona 18S/19S, do georreferenciamento da ficha), com agrupamento, e cor por serviço
   ou por cultura. As coordenadas só chegam para quem está logado (lancar_mecanizacao.php, ação
   "painel"); na versão pública a aba não existe. Respeita os filtros da lateral.
   Leaflet e markercluster são carregados só quando a aba é aberta. */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A) return;
  var G = A.G;
  // vive dentro da aba "Inserções" (visão "Mapa de pontos"); na versão pública essa aba não existe
  if (A.modoPublico()) return;

  var CORES_SERVICO = {};
  CORES_SERVICO[A.MEC] = '#2563eb';
  CORES_SERVICO[A.ACU] = '#0d9488';
  var PALETA = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'];
  // Acre: bloqueio de coordenadas digitadas errado
  var CAIXA = { s: -11.3, n: -6.9, o: -74.1, l: -66.4 };

  var MAPA = null, CAMADA = null, LEAFLET_OK = false, primeira = true, ULTIMO = null;

  var utmParaLatLng = window.PainelCalculos.utmParaLatLng;   // js/painel-calculos.js
  window.PAINEL_UTM = utmParaLatLng;   // facilita conferência no console

  function carregarLeaflet() {
    return new Promise(function (ok, falha) {
      if (window.L && window.L.markerClusterGroup) { ok(); return; }
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
        .then(ok, falha);
    });
  }

  function pontosDe(D) {
    var pts = [], semGeo = 0, fora = 0;
    D.forEach(function (r) {
      if (!r.geo || !r.geo.length) { semGeo++; return; }
      var algum = false;
      r.geo.forEach(function (g) {
        var zona = g[2] >= 17 && g[2] <= 20 ? g[2] : 19;
        var ll = utmParaLatLng(g[0], g[1], zona);
        if (isNaN(ll[0]) || ll[0] < CAIXA.s || ll[0] > CAIXA.n || ll[1] < CAIXA.o || ll[1] > CAIXA.l) return;
        pts.push({ lat: ll[0], lng: ll[1], r: r });
        algum = true;
      });
      if (!algum) fora++;
    });
    return { pts: pts, semGeo: semGeo, fora: fora };
  }

  function popup(r) {
    var det = r.pc === A.MEC
      ? G.num(r.ha, 1) + ' ha' + (r.cult.length ? ' · ' + r.cult.map(function (c) { return G.esc(c[0]); }).join(', ') : '')
      : G.num(r.hrs, 1) + ' h' + (r.ac ? ' · ' + G.num(r.ac) + ' tanque(s)' : '');
    var v = r.dv || r.d;
    return '<b>' + G.esc(r.prod || '—') + '</b><br>' + G.esc(r.propr || '') + (r.propr ? '<br>' : '') +
      G.esc(r.mun || '—') + ' · ' + G.esc(r.pc || '—') + '<br>' + det +
      '<br><small>Vistoria: ' + G.esc(v.split('-').reverse().join('/')) + ' · ' + G.esc(r.rt || '—') + '</small>' +
      (r.form ? '<br><a href="' + G.esc(r.form) + '" target="_blank" rel="noopener">abrir formulário</a>' : '');
  }

  function desenhar(C) {
    var sub = document.getElementById('pontosSub'), caixa = document.getElementById('mapaPontos');
    if (!caixa) return;
    var P = pontosDe(C.D);
    ULTIMO = P;
    sub.textContent = G.num(P.pts.length) + ' ponto(s) de ' + G.num(C.D.length - P.semGeo - P.fora) + ' atendimento(s) com coordenada · ' +
      G.num(P.semGeo) + ' sem coordenada' + (P.fora ? ' · ' + G.num(P.fora) + ' fora do Acre (coordenada digitada errada)' : '') + '.';
    if (!P.pts.length && !MAPA) {
      caixa.innerHTML = '<p class="vazio" style="padding:16px">Nenhum atendimento com coordenada nesta seleção. As coordenadas só chegam para quem está logado e dependem do <code>lancar_mecanizacao.php</code> atualizado no servidor.</p>';
      return;
    }
    if (!window.L || !window.L.markerClusterGroup) {
      caixa.innerHTML = '<p class="vazio" style="padding:16px">Carregando o mapa…</p>';
      carregarLeaflet().then(function () { LEAFLET_OK = true; desenhar(C); }, function (e) {
        caixa.innerHTML = '<p class="aviso erro" style="margin:16px">' + G.esc(e.message) + '</p>';
      });
      return;
    }
    if (!MAPA) {
      caixa.innerHTML = '';
      MAPA = L.map(caixa, { preferCanvas: true }).setView([-9.0, -70.5], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '© OpenStreetMap'
      }).addTo(MAPA);
    }
    setTimeout(function () { MAPA.invalidateSize(); }, 50);
    if (CAMADA) MAPA.removeLayer(CAMADA);
    CAMADA = L.markerClusterGroup({ disableClusteringAtZoom: 13, showCoverageOnHover: false, chunkedLoading: true });

    var modo = document.getElementById('pontosCor').value;
    var corDe, legenda = [];
    if (modo === 'cultura') {
      var cont = {};
      P.pts.forEach(function (p) { var c = p.r.cult[0] ? p.r.cult[0][0] : 'Sem cultura'; cont[c] = (cont[c] || 0) + 1; });
      var top = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; }).slice(0, PALETA.length - 1);
      corDe = function (r) {
        var c = r.cult[0] ? r.cult[0][0] : 'Sem cultura', i = top.indexOf(c);
        return i >= 0 ? PALETA[i] : '#94a3b8';
      };
      legenda = top.map(function (c, i) { return [c, PALETA[i]]; }).concat([['Outras', '#94a3b8']]);
    } else {
      corDe = function (r) { return CORES_SERVICO[r.pc] || '#94a3b8'; };
      legenda = [[A.MEC, CORES_SERVICO[A.MEC]], [A.ACU, CORES_SERVICO[A.ACU]]];
    }
    document.getElementById('pontosLegenda').innerHTML = legenda.map(function (l) {
      return '<li><i style="background:' + l[1] + '"></i>' + G.esc(l[0]) + '</li>';
    }).join('');

    P.pts.forEach(function (p) {
      var cor = corDe(p.r);
      L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: cor, fillOpacity: 0.9 })
        .bindPopup(popup(p.r)).addTo(CAMADA);
    });
    MAPA.addLayer(CAMADA);
    if (P.pts.length) {
      try { MAPA.fitBounds(CAMADA.getBounds().pad(0.15), { maxZoom: 12 }); } catch (e) { /* sem limites */ }
    }
  }

  var seletor = document.getElementById('pontosCor');
  if (seletor) seletor.addEventListener('change', function () { A.redesenhar(); });

  window.PAINEL_PONTOS_DESENHAR = desenhar;   // chamado por js/dashboard.js quando a visão é aberta
})();
