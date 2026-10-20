/* Mapa integrado da aba Mapa (só logado): os municípios coloridos pelo "Colorir por" e, por cima, um ponto por
   atendimento georreferenciado, com agrupamento, camada de SATÉLITE (padrão) ou mapa e mapa de calor.
   Clicar num município filtra por ele; passar o mouse mostra o balão com hectares e horas.
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

  var MAPA = null, CAMADA = null, CALOR = null, MUNS = null, ROTS = null, ULTIMO_FIT = null;
  var CENTROS = null;   // [id, nome, latlng] do centro de cada município (rótulos)
  var REPARADOS = null, REPARADOS_N = -1, REPARADOS_T = false;   // WeakMap(registro -> [leituras]) da base inteira

  /** Repara a base inteira de uma vez (o centro de cada município vem dos pontos corretos de todos). */
  function repararBase() {
    var reg = A.registros();
    var temMalha = !!(window.MAPA_ACRE && window.MAPA_ACRE.geo);   // refaz se a malha do Acre chegou depois
    if (REPARADOS && REPARADOS_N === reg.length && REPARADOS_T === temMalha) return REPARADOS;
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
    REPARADOS_T = temMalha;
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
    // abre o relatório do produtor DENTRO do sistema (só visualização); ver ligarAbrir()
    h += '<br><a href="#" class="pt-abrir">abrir formulário</a>';
    return h;
  }

  var semAcento = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); };

  /** Acha o id do lançamento deste ponto: o registro do painel não traz o id, então busca pelo nome do produtor
      (ação "listar") e confere serviço, data da vistoria e município. Devolve null se não achar. */
  function acharLancamento(r) {
    var CP = window.LANCAMENTO_CAMPOS;
    if (r.id) return Promise.resolve(r.id);
    if (!CP || !CP.enviar) return Promise.resolve(null);
    var fd = new FormData();
    fd.append('acao', 'listar'); fd.append('token', ''); fd.append('limite', '100'); fd.append('pagina', '1');
    fd.append('f_pessoa', 'todos'); fd.append('f_busca', r.prod || '');
    return CP.enviar(fd).then(function (res) {
      var lista = (res.corpo && res.corpo.lancamentos) || [];
      var iguais = lista.filter(function (x) {
        return semAcento(x.nome_beneficiario) === semAcento(r.prod) && String(x.data_vistoria || '').slice(0, 10) === (r.dv || '') &&
          x.tipo_servico === r.pc;
      });
      if (iguais.length > 1) {
        var damesma = iguais.filter(function (x) { return semAcento(x.municipio) === semAcento(r.mun); });
        if (damesma.length) iguais = damesma;
      }
      return iguais.length ? iguais[0].id : null;
    });
  }

  /** "abrir formulário": abre a página do lançamento no sistema (lancamento-editar.html?modo=ver, só leitura) numa
      aba nova. Se não achar o lançamento, cai no link do formulário digitalizado, quando existir. */
  function ligarAbrir(popupLeaflet, r) {
    var el = popupLeaflet.getElement && popupLeaflet.getElement(), a = el && el.querySelector('.pt-abrir');
    if (!a) return;
    a.onclick = function (e) {
      e.preventDefault();
      var janela = window.open('', '_blank');   // aberta já no clique (senão o bloqueador de pop-up barra)
      var rotulo = a.textContent;
      a.textContent = 'abrindo…';
      acharLancamento(r).then(function (id) {
        if (id) {
          var url = 'lancamento-editar.html?modo=ver&id=' + encodeURIComponent(id);
          if (janela) janela.location.href = url; else window.location.href = url;
        } else {
          if (janela) janela.close();
          if (r.form) window.open(r.form, '_blank', 'noopener');
          else window.alert('Não foi possível localizar este lançamento no sistema.');
        }
      }).catch(function () {
        if (janela) janela.close();
        window.alert('Não foi possível abrir o lançamento agora. Tente novamente.');
      }).then(function () { a.textContent = rotulo; });
    };
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
      L.control.layers({ 'Satélite': satelite, 'Mapa': ruas }, { 'Nomes e limites': rotulos }, { collapsed: true }).addTo(MAPA);
    }
    setTimeout(function () { MAPA.invalidateSize(); }, 50);
    if (CAMADA) MAPA.removeLayer(CAMADA);
    if (CALOR) { MAPA.removeLayer(CALOR); CALOR = null; }
    desenharMunicipios();
    CAMADA = L.markerClusterGroup({ disableClusteringAtZoom: 14, showCoverageOnHover: false, chunkedLoading: true });

    var verAcu = opcao('pontosVerAcu', true), verMec = opcao('pontosVerMec', true);
    var verCalor = opcao('pontosCalor', false);
    var mostrados = 0, visiveis = [];
    P.pts.forEach(function (p) {
      if (p.r.pc === A.ACU && !verAcu) return;
      if (p.r.pc === A.MEC && !verMec) return;
      visiveis.push(p);
      mostrados++;
      if (verCalor) return;   // no mapa de calor os pontos individuais não aparecem
      L.circleMarker([p.lat, p.lng], {
        radius: 6, color: '#fff', weight: 1.5, fillColor: CORES_SERVICO[p.r.pc] || '#94a3b8', fillOpacity: 0.92
      }).bindPopup(popup(p)).on('popupopen', function (ev) { ligarAbrir(ev.popup, p.r); }).addTo(CAMADA);
    });
    if (verCalor) {
      CALOR = L.heatLayer(visiveis.map(function (p) { return [p.lat, p.lng, 0.6]; }), {
        radius: 24, blur: 20, maxZoom: 12, gradient: { 0.3: '#38bdf8', 0.55: '#facc15', 0.8: '#f97316', 1: '#dc2626' }
      }).addTo(MAPA);
    }
    MAPA.addLayer(CAMADA);
    ajustarVista(mostrados ? visiveis : []);
  }

  /** Cor do município vinda do mapa SVG (já resolvida); cinza claro quando não há. */
  function corMunicipio(id) {
    var c = window.PAINEL_MAPA_MUN ? window.PAINEL_MAPA_MUN.cor(id) : '';
    return !c || c === 'none' ? '#e5e7eb' : c;
  }

  /** Municípios (malha do IBGE) coloridos como o mapa SVG, com balão, clique e rótulo com o nome. */
  function desenharMunicipios() {
    if (MUNS) { MAPA.removeLayer(MUNS); MUNS = null; }
    if (ROTS) { MAPA.removeLayer(ROTS); ROTS = null; }
    var M = window.PAINEL_MAPA_MUN, geo = window.MAPA_ACRE && window.MAPA_ACRE.geo;
    if (!M || !geo || !opcao('pontosMunicipios', false)) return;
    var dest = M.destacado();
    MUNS = L.geoJSON(geo, {
      style: function (f) {
        var id = String(f.properties.codarea);
        return { fillColor: corMunicipio(id), fillOpacity: 0.62, color: id === dest ? '#1d4ed8' : '#ffffff', weight: id === dest ? 3 : 1.2 };
      },
      onEachFeature: function (f, camada) {
        var id = String(f.properties.codarea);
        camada.bindTooltip(function () { return M.tooltip(id); }, { sticky: true, className: 'mapa-mun-tip' });
        camada.on('click', function () { M.clicar(id); });
      }
    }).addTo(MAPA);
    MUNS.bringToBack();
    if (!CENTROS) {
      CENTROS = geo.features.map(function (f) {
        var id = String(f.properties.codarea);
        return [id, M.nome(id) || id, L.geoJSON(f).getBounds().getCenter()];
      });
    }
    ROTS = L.layerGroup(CENTROS.map(function (c) {
      return L.marker(c[2], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'mapa-mun-rot', html: '<span>' + G.esc(c[1]) + '</span>', iconSize: [0, 0] })
      });
    })).addTo(MAPA);
  }

  /** Enquadra o mapa: o estado todo na primeira vez; o município escolhido quando o filtro muda; senão não mexe
      (clicar e filtrar não pode sacudir a vista). Sem malha, cai nos pontos visíveis. */
  function ajustarVista(visiveis) {
    var M = window.PAINEL_MAPA_MUN, geo = window.MAPA_ACRE && window.MAPA_ACRE.geo;
    var dest = M ? M.destacado() : '';
    var alvo = geo ? (dest ? 'm' + dest : 'estado') : 'pontos';
    if (alvo === ULTIMO_FIT) return;
    ULTIMO_FIT = alvo;
    try {
      if (geo) {
        var fs = dest ? geo.features.filter(function (f) { return String(f.properties.codarea) === dest; }) : geo.features;
        MAPA.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: fs }).getBounds().pad(0.06));
      } else if (visiveis.length) {
        MAPA.fitBounds(L.latLngBounds(visiveis.map(function (p) { return [p.lat, p.lng]; })).pad(0.15), { maxZoom: 12 });
      }
    } catch (e) { /* sem limites */ }
  }

  ['pontosMunicipios', 'pontosVerAcu', 'pontosVerMec', 'pontosCalor'].forEach(function (id) {
    var c = document.getElementById(id);
    if (c) c.addEventListener('change', function () { A.redesenhar(); });
  });

  window.PAINEL_PONTOS_DESENHAR = desenhar;   // chamado por js/dashboard.js quando a visão é aberta
})();
