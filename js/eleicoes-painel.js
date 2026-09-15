/* Painel de indicadores da aba "Resultados": cruza as seções oficiais com os
   cadastros de Fiscais (window.CoberturaFiscais, ver js/eleicoes-cobertura.js)
   e agrupa por regional (window.REGIONAIS_MUNICIPIOS) — visão geral de
   cobertura sem precisar abrir município por município na aba Fiscais. Usa
   window.G (js/graficos.js) para o gráfico por regional. */
(function () {
  'use strict';
  var status = document.getElementById('indicadoresStatus');
  var elTotal = document.getElementById('indTotalFiscais');
  var elCobertura = document.getElementById('indCoberturaGeral');
  var elSemFiscal = document.getElementById('indMunSemFiscal');
  var elRegional = document.getElementById('indicadoresRegional');
  var elZero = document.getElementById('indicadoresMunicipiosZero');
  if (!elTotal) return;

  if (!window.CoberturaFiscais || !window.REGIONAIS_MUNICIPIOS || !window.BANCO_ELEICOES || !window.G) {
    if (status) { status.hidden = false; status.textContent = 'Não foi possível carregar os indicadores.'; }
    return;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : [])
    .map(function (m) { return [String(m.id), m.nome]; }));
  var oficiaisPorMun = window.CoberturaFiscais.oficiaisPorMun();

  function renderizar() {
    var dados;
    try { dados = window.CoberturaFiscais.calcular(); }
    catch (e) { if (status) { status.hidden = false; status.textContent = e.message; } return; }
    if (status) status.hidden = true;

    var registros = dados.registros, comFiscal = dados.comFiscal, comFiscalPorMun = dados.comFiscalPorMun;
    var totalOficiais = dados.totalOficiais;
    var pctGeral = totalOficiais ? (comFiscal.size / totalOficiais * 100) : 0;

    var municipiosZero = [];
    oficiaisPorMun.forEach(function (_, mun) {
      if (!comFiscalPorMun.get(mun)) municipiosZero.push(mun);
    });
    municipiosZero.sort(function (a, b) {
      return (nomesMun.get(a) || a).localeCompare(nomesMun.get(b) || b, 'pt-BR');
    });

    elTotal.textContent = registros.length.toLocaleString('pt-BR');
    elCobertura.textContent = pctGeral.toFixed(1).replace('.', ',') + '%';
    elCobertura.title = comFiscal.size + ' de ' + totalOficiais + ' seções oficiais têm ao menos um fiscal.';
    elSemFiscal.textContent = String(municipiosZero.length);

    elZero.innerHTML = municipiosZero.length
      ? municipiosZero.map(function (m) { return '<li>' + esc(nomesMun.get(m) || m) + '</li>'; }).join('')
      : '<li class="vazio-linha">Todos os municípios têm ao menos um fiscal cadastrado.</li>';

    var porRegional = new Map();
    (window.REGIONAIS || []).forEach(function (r) { porRegional.set(r, { oficiais: 0, comFiscal: 0 }); });
    oficiaisPorMun.forEach(function (qtd, mun) {
      var reg = window.REGIONAIS_MUNICIPIOS[mun];
      if (!reg) return;
      var acc = porRegional.get(reg) || { oficiais: 0, comFiscal: 0 };
      acc.oficiais += qtd;
      acc.comFiscal += comFiscalPorMun.get(mun) || 0;
      porRegional.set(reg, acc);
    });
    var dadosRegional = [];
    porRegional.forEach(function (acc, reg) {
      dadosRegional.push({ rot: reg, val: acc.oficiais ? Math.round(acc.comFiscal / acc.oficiais * 1000) / 10 : 0 });
    });
    window.G.colunas(elRegional, dadosRegional, { unidade: '%', dec: 1, cor: '#153e75' });
  }

  window.addEventListener('banco-atualizado', renderizar);
  if (status) status.hidden = false;
  renderizar();
})();
