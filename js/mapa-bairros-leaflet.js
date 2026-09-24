/* Fábrica de mapa de bairro com satélite (Leaflet + Esri World Imagery),
   reaproveitada pela aba Fiscais (js/eleicoes.js — cobertura de fiscal) e
   pela aba Resultados (js/eleicoes-resultados.js — onde teve voto). Cada
   chamada de criarMapaBairrosLeaflet() cria seu próprio mapa Leaflet, preso
   aos elementos HTML indicados em cfg — não há estado compartilhado entre
   as duas abas, só o mesmo jeito de desenhar/dar zoom/tela cheia.

   cfg = {
     containerId,                 // <div> onde o Leaflet desenha
     btnZoomMaisId, btnZoomMenosId, btnZoomResetId, zoomValorId,
     btnTelaCheiaId, secaoId,     // <section> que entra em tela cheia
     corContorno,                 // cor do contorno do bairro (hex)
     obterDica(nomeBairro)        // devolve o HTML do tooltip ao passar o mouse
   }
   Devolve { desenhar(features), atualizarPins(nomesComPin, corPin) }. */
(function () {
  'use strict';

  function criarMapaBairrosLeaflet(cfg) {
    let mapaL = null;
    let camadaPoligonos = null;
    let camadaPins = null;
    const centroides = new Map();

    const btnZoomMais = document.getElementById(cfg.btnZoomMaisId);
    const btnZoomMenos = document.getElementById(cfg.btnZoomMenosId);
    const btnZoomReset = document.getElementById(cfg.btnZoomResetId);
    const btnTelaCheia = document.getElementById(cfg.btnTelaCheiaId);
    const elZoomValor = document.getElementById(cfg.zoomValorId);
    const secaoEl = document.getElementById(cfg.secaoId);

    function atualizarBotoesZoom() {
      if (!mapaL) return;
      const z = mapaL.getZoom();
      // zoom agora pode ser fracionado (zoomSnap 0.1): mostra com 1 casa, "12,1"
      if (elZoomValor) elZoomValor.textContent = 'Zoom ' + String(Math.round(z * 10) / 10).replace('.', ',');
      if (btnZoomMenos) btnZoomMenos.disabled = z <= mapaL.getMinZoom();
      if (btnZoomMais) btnZoomMais.disabled = z >= mapaL.getMaxZoom();
    }

    function obterMapa() {
      if (mapaL || !window.L) return mapaL;
      const container = document.getElementById(cfg.containerId);
      if (!container) return null;
      // zoomAnimation:false — a animação de zoom do Leaflet trava em alguns
      // navegadores/contextos (fica preso no zoom antigo até um setZoom com
      // animate:false); zoom instantâneo é menos bonito mas sempre funciona.
      // zoomSnap 0.1: o enquadramento usa o zoom exato que faz os bairros
      // ocuparem 95% da área (com zoom só inteiro sobrava muito espaço);
      // os botões +/− continuam andando de 1 em 1 (zoomDelta).
      mapaL = L.map(container, { zoomControl: false, zoomAnimation: false, minZoom: 11, maxZoom: 19, zoomSnap: 0.1, zoomDelta: 1 });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Imagens: Esri, Maxar, Earthstar Geographics'
      }).addTo(mapaL);
      camadaPins = L.layerGroup().addTo(mapaL);
      mapaL.on('zoomend', atualizarBotoesZoom);
      return mapaL;
    }

    if (btnZoomMais) btnZoomMais.onclick = () => { if (mapaL) mapaL.zoomIn(); };
    if (btnZoomMenos) btnZoomMenos.onclick = () => { if (mapaL) mapaL.zoomOut(); };
    // Bairros ocupando 95% da área: 2,5% de respiro em cada lado.
    let ultimoEnquadramento = null;
    function enquadrar() {
      if (!mapaL || !camadaPoligonos) return;
      const t = mapaL.getSize();
      mapaL.fitBounds(camadaPoligonos.getBounds(), { padding: [Math.round(t.x * 0.025), Math.round(t.y * 0.025)] });
      ultimoEnquadramento = { zoom: mapaL.getZoom(), centro: mapaL.getCenter() };
    }
    // A vista ainda é a do último enquadramento (ninguém deu zoom nem arrastou)?
    function vistaIntacta() {
      return ultimoEnquadramento && mapaL.getZoom() === ultimoEnquadramento.zoom && mapaL.getCenter().equals(ultimoEnquadramento.centro);
    }
    if (btnZoomReset) btnZoomReset.onclick = enquadrar;

    function emTelaCheia() {
      return document.fullscreenElement === secaoEl || document.webkitFullscreenElement === secaoEl;
    }
    function atualizarBotaoTelaCheia() {
      if (!btnTelaCheia || !secaoEl) return;
      const cheio = emTelaCheia();
      btnTelaCheia.textContent = cheio ? 'Sair da tela cheia' : 'Tela cheia';
      btnTelaCheia.setAttribute('aria-pressed', String(cheio));
      // O contêiner muda de tamanho ao entrar/sair da tela cheia — sem isso
      // o Leaflet fica com ladrilhos faltando nas bordas até a próxima
      // interação.
      if (mapaL) setTimeout(() => mapaL.invalidateSize(), 60);
    }
    if (btnTelaCheia && secaoEl) {
      btnTelaCheia.onclick = () => {
        if (emTelaCheia()) {
          (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        } else {
          const pedir = secaoEl.requestFullscreen || secaoEl.webkitRequestFullscreen;
          if (pedir) pedir.call(secaoEl);
        }
      };
      document.addEventListener('fullscreenchange', () => { if (emTelaCheia() || document.fullscreenElement === null) atualizarBotaoTelaCheia(); });
      document.addEventListener('webkitfullscreenchange', atualizarBotaoTelaCheia);
    }

    function desenhar(features) {
      const mapa = obterMapa();
      if (!mapa) return;
      if (camadaPoligonos) mapa.removeLayer(camadaPoligonos);
      limparDestaque();
      centroides.clear();
      const cor = cfg.corContorno || '#ffe066';
      camadaPoligonos = L.geoJSON({ type: 'FeatureCollection', features: features }, {
        // Preenchimento quase transparente — o ponto é deixar a imagem de
        // satélite aparecer por baixo; só o contorno delimita o bairro.
        style: { color: cor, weight: 2, fillColor: cor, fillOpacity: 0.06 },
        onEachFeature: function (feature, layer) {
          const nomeBairro = feature.properties.bairro;
          layer.bindTooltip(function () { return cfg.obterDica(nomeBairro); }, { sticky: true, direction: 'top', className: 'mapa-bairros-dica-cobertura' });
          layer.on('mouseover', function () { layer.setStyle({ weight: 3, fillOpacity: 0.22 }); });
          layer.on('mouseout', function () { layer.setStyle({ weight: 2, fillOpacity: 0.06 }); });
          centroides.set(nomeBairro, layer.getBounds().getCenter());
        }
      }).addTo(mapa);
      enquadrar();
    }

    function atualizarPins(nomesComPin, corPin, tituloPin) {
      if (!camadaPins) return;
      camadaPins.clearLayers();
      centroides.forEach(function (centro, nome) {
        if (nomesComPin.has(nome)) {
          L.circleMarker(centro, { radius: 8, color: '#fff', weight: 2, fillColor: corPin || '#1f9d55', fillOpacity: 1 })
            .bindTooltip(nome + (tituloPin ? ' — ' + tituloPin : ''), { direction: 'top' })
            .addTo(camadaPins);
        }
      });
    }

    function atualizarPinsPorBairro(marcadores) {
      if (!camadaPins) return;
      camadaPins.clearLayers();
      centroides.forEach(function (centro, nome) {
        const p = marcadores.get(nome);
        if (!p) return;
        L.circleMarker(centro, {radius: 9, color: '#fff', weight: 2, fillColor: p.cor, fillOpacity: 1})
          .bindTooltip(p.html, {direction: 'top', className: 'mapa-bairros-dica-cobertura'})
          .bindPopup(p.html).addTo(camadaPins);
      });
    }

    function atualizarPontos(pontos) {
      const mapa = obterMapa();
      if (!mapa || !camadaPins) return;
      camadaPins.clearLayers();
      pontos.forEach(function (p) {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 8, color: '#fff', weight: 2, fillColor: p.cor || '#e24b32', fillOpacity: 1
        }).bindPopup(p.html);
        marker.addTo(camadaPins);
      });
    }

    // A área do mapa mudou de tamanho: se a pessoa ainda não mexeu na vista,
    // reenquadra pros bairros continuarem ocupando 95% dela.
    function invalidar() {
      if (!mapaL) return;
      setTimeout(function () {
        const intacta = vistaIntacta();
        mapaL.invalidateSize();
        if (intacta) enquadrar();
      }, 0);
    }

    // Destaque de um ponto (ex.: a seção do fiscal clicado na lista): pin
    // pulsante por cima dos demais, zoom até ele e popup aberto. Fica numa
    // camada própria, então atualizarPontos() não apaga o destaque.
    let camadaDestaque = null;
    function limparDestaque() {
      if (camadaDestaque) camadaDestaque.clearLayers();
    }
    function destacar(p) {
      const mapa = obterMapa();
      if (!mapa || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
      if (!camadaDestaque) camadaDestaque = L.layerGroup().addTo(mapa);
      camadaDestaque.clearLayers();
      mapa.invalidateSize();
      const icone = L.divIcon({ className: 'pin-destaque', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
      const marcador = L.marker([p.lat, p.lon], { icon: icone, zIndexOffset: 1000, keyboard: false }).bindPopup(p.html);
      marcador.addTo(camadaDestaque);
      mapa.setView([p.lat, p.lon], Math.max(mapa.getZoom(), 17), { animate: false });
      marcador.openPopup();
      return true;
    }

    return { desenhar: desenhar, atualizarPins: atualizarPins, atualizarPontos: atualizarPontos, atualizarPinsPorBairro: atualizarPinsPorBairro, invalidar: invalidar, destacar: destacar, limparDestaque: limparDestaque };
  }

  window.criarMapaBairrosLeaflet = criarMapaBairrosLeaflet;
})();
