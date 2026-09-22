/* Busca global de Fiscais (por nome/telefone, município, regional e zona) e
   exportação CSV da lista filtrada, para o time de campo. Independente do
   painel de cadastro por município de js/eleicoes.js — não lê nem altera o
   estado dele, só window.BANCO_ELEICOES.ler(). Mostra os fiscais com o mesmo
   cartão da lista do município (window.CARTAO_FISCAL), que abre o município
   e destaca a seção no mapa ao clicar. */
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

  // Mesmo cartão da lista do município (window.CARTAO_FISCAL, de
  // js/eleicoes.js), com o município do fiscal: clicar abre o município e
  // destaca a seção no mapa; "⋯" edita/exclui.
  function renderizar() {
    // No modo online, window.BANCO_ELEICOES.ler() lança enquanto o banco
    // ainda está buscando os cadastros na 1ª carga da página — tenta de novo
    // quando o evento "banco-atualizado" avisar que terminou.
    var registros;
    try { registros = filtrados(); } catch (e) { status.textContent = e.message; lista.replaceChildren(); return; }
    registros.sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'); });
    status.textContent = registros.length + (registros.length === 1 ? ' fiscal encontrado.' : ' fiscais encontrados.') +
      (registros.length > LIMITE_EXIBICAO ? ' Mostrando os primeiros ' + LIMITE_EXIBICAO + '; refine a busca para ver os demais.' : '');
    if (!registros.length) {
      var vazio = document.createElement('li');
      vazio.className = 'vazio-linha';
      vazio.textContent = 'Nenhum fiscal encontrado com esses filtros.';
      lista.replaceChildren(vazio);
      return;
    }
    lista.replaceChildren.apply(lista, registros.slice(0, LIMITE_EXIBICAO).map(function (r) {
      if (window.CARTAO_FISCAL) return window.CARTAO_FISCAL(r);
      var li = document.createElement('li');
      li.textContent = (r.nome || '') + ' — ' + (nomesMun.get(r.municipio) || r.municipio);
      return li;
    }));
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
  window.addEventListener('municipios-carregados', renderizar);
  renderizar();
})();
