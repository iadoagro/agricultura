/* Busca global de Fiscais (por nome/telefone, município, regional e zona) e
   exportação CSV da lista filtrada, para o time de campo. Independente do
   painel de cadastro por município de js/eleicoes.js — não lê nem altera o
   estado dele, só window.BANCO_ELEICOES.ler(); "Abrir cadastro" reaproveita
   o <select id="municipio"> já ligado por js/eleicoes.js (dispara um evento
   "change" nele, que já chama abrir(id) lá) em vez de duplicar essa lógica. */
(function () {
  'use strict';
  var campoTexto = document.getElementById('buscaGlobalTexto');
  var selRegional = document.getElementById('buscaGlobalRegional');
  var selMunicipio = document.getElementById('buscaGlobalMunicipio');
  var selZona = document.getElementById('buscaGlobalZona');
  var btnExportar = document.getElementById('buscaGlobalExportar');
  var status = document.getElementById('buscaGlobalStatus');
  var lista = document.getElementById('buscaGlobalLista');
  if (!lista || !window.BANCO_ELEICOES) return;

  var LIMITE_EXIBICAO = 300;
  var canonico = function (n) { return String(n || '').replace(/^0+/, '') || ''; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : [])
    .map(function (m) { return [String(m.id), m.nome]; }));

  (window.REGIONAIS || []).forEach(function (r) { selRegional.add(new Option(r, r)); });
  (window.MAPA_ACRE ? window.MAPA_ACRE.localidades.slice() : [])
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
    .forEach(function (m) { selMunicipio.add(new Option(m.nome, String(m.id))); });
  var zonas = [...new Set((window.LOCAIS_VOTACAO ? window.LOCAIS_VOTACAO.locais : []).map(function (l) { return l.zona; }))]
    .sort(function (a, b) { return Number(a) - Number(b); });
  zonas.forEach(function (z) { selZona.add(new Option('Zona ' + z, z)); });

  function filtrados() {
    var texto = campoTexto.value.trim().toLowerCase();
    var textoDigitos = texto.replace(/\D/g, '');
    return window.BANCO_ELEICOES.ler().filter(function (r) {
      if (selRegional.value && window.REGIONAIS_MUNICIPIOS[r.municipio] !== selRegional.value) return false;
      if (selMunicipio.value && r.municipio !== selMunicipio.value) return false;
      if (selZona.value && canonico(r.zona) !== canonico(selZona.value)) return false;
      if (!texto) return true;
      var nomeBate = (r.nome || '').toLowerCase().indexOf(texto) !== -1;
      var telBate = textoDigitos && (r.telefone || '').replace(/\D/g, '').indexOf(textoDigitos) !== -1;
      return nomeBate || telBate;
    });
  }

  function linkWhatsApp(r) {
    var digitos = (r.telefone || '').replace(/\D/g, '');
    var internacional = digitos.length === 10 || digitos.length === 11 ? '55' + digitos : digitos;
    if (!/^\d{10,15}$/.test(internacional)) return esc(r.telefone || 'Não informado');
    return '<a href="https://wa.me/' + internacional + '" target="_blank" rel="noopener noreferrer">' +
      esc(r.telefone) + ' — WhatsApp</a>';
  }

  function renderizar() {
    var registros = filtrados();
    status.textContent = registros.length + (registros.length === 1 ? ' fiscal encontrado.' : ' fiscais encontrados.') +
      (registros.length > LIMITE_EXIBICAO ? ' Mostrando os primeiros ' + LIMITE_EXIBICAO + '; refine a busca para ver os demais.' : '');
    lista.innerHTML = registros.slice(0, LIMITE_EXIBICAO).map(function (r) {
      return '<li>' +
        '<strong>' + esc(r.nome) + '</strong>' +
        '<span class="cadastro-telefone">' + linkWhatsApp(r) + '</span>' +
        '<span>' + esc(nomesMun.get(r.municipio) || r.municipio) + ' · ' + esc(window.REGIONAIS_MUNICIPIOS[r.municipio] || '—') + '</span>' +
        '<span>Zona ' + esc(r.zona || '—') + ' · Seção ' + esc(r.secao || '—') + '</span>' +
        '<button type="button" class="busca-global-abrir" data-mun="' + esc(r.municipio) + '">Abrir cadastro</button>' +
        '</li>';
    }).join('');
    lista.querySelectorAll('.busca-global-abrir').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sel = document.getElementById('municipio');
        if (!sel) return;
        sel.value = btn.dataset.mun;
        sel.dispatchEvent(new Event('change'));
        var painel = document.getElementById('painel');
        if (painel) painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function paraCSV(valor) {
    var texto = String(valor == null ? '' : valor);
    return /[;"\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  }

  function exportarCSV() {
    var registros = filtrados();
    var cabecalho = ['Nome', 'Telefone', 'Município', 'Regional', 'Bairro', 'Zona', 'Seção', 'Local de votação'];
    var linhas = [cabecalho.join(';')].concat(registros.map(function (r) {
      return [r.nome, r.telefone, nomesMun.get(r.municipio) || r.municipio, window.REGIONAIS_MUNICIPIOS[r.municipio] || '',
        r.bairro, r.zona, r.secao, r.localVotacao].map(paraCSV).join(';');
    }));
    var blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'fiscais-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  [campoTexto, selRegional, selMunicipio, selZona].forEach(function (el) {
    el.addEventListener('input', renderizar);
    el.addEventListener('change', renderizar);
  });
  btnExportar.addEventListener('click', exportarCSV);
  window.addEventListener('banco-atualizado', renderizar);
  renderizar();
})();
