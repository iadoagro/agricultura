/* Lista de prioridade da aba "Resultados": seções que tiveram voto para o
   candidato em 2022 (window.DADOS_VOTACAO_SCHAFER.porSecao) e hoje não têm
   nenhum fiscal (window.CoberturaFiscais, ver js/eleicoes-cobertura.js) —
   onde vale mais a pena recrutar primeiro, sem precisar abrir município por
   município na aba Fiscais. Filtra por regional e zona. */
(function () {
  'use strict';
  var status = document.getElementById('prioridadesStatus');
  var tabelaEl = document.getElementById('prioridadesTabela');
  var selRegional = document.getElementById('prioridadesRegional');
  var selMunicipio = document.getElementById('prioridadesMunicipio');
  var selZona = document.getElementById('prioridadesZona');
  var selOrdenar = document.getElementById('prioridadesOrdenar');
  if (!tabelaEl) return;

  var ORDENACOES = {
    'municipio-votos': function (a, b) {
      var nomeA = nomesMun.get(a.municipio) || a.municipio, nomeB = nomesMun.get(b.municipio) || b.municipio;
      return nomeA.localeCompare(nomeB, 'pt-BR') || (b.votos - a.votos);
    },
    'votos-desc': function (a, b) { return b.votos - a.votos; },
    'votos-asc': function (a, b) { return a.votos - b.votos; }
  };

  if (!window.CoberturaFiscais || !window.DADOS_VOTACAO_SCHAFER || !window.REGIONAIS_MUNICIPIOS || !window.BANCO_ELEICOES) {
    if (status) status.textContent = 'Não foi possível carregar as prioridades.';
    return;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : [])
    .map(function (m) { return [String(m.id), m.nome]; }));

  // Nome do local de votação por (município, zona, seção) — mesma tabela que
  // tools/gerar_votacao_candidato.py monta para achar as seções sem voto.
  var localPorSecao = new Map();
  (window.LOCAIS_VOTACAO ? window.LOCAIS_VOTACAO.locais : []).forEach(function (l) {
    l.secoes.forEach(function (s) {
      [s.numero].concat(s.agregadas).forEach(function (numero) {
        localPorSecao.set(l.municipio + '|' + l.zona + '|' + numero, l.nome);
      });
    });
  });

  (window.REGIONAIS || []).forEach(function (r) { selRegional.add(new Option(r, r)); });
  (window.MAPA_ACRE ? window.MAPA_ACRE.localidades.slice() : [])
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
    .forEach(function (m) { selMunicipio.add(new Option(m.nome, String(m.id))); });
  var zonas = [...new Set((window.LOCAIS_VOTACAO ? window.LOCAIS_VOTACAO.locais : []).map(function (l) { return l.zona; }))]
    .sort(function (a, b) { return Number(a) - Number(b); });
  zonas.forEach(function (z) { selZona.add(new Option('Zona ' + z, z)); });

  function renderizar() {
    var dados;
    try { dados = window.CoberturaFiscais.calcular(); }
    catch (e) { status.textContent = e.message; tabelaEl.innerHTML = ''; return; }

    var linhas = window.DADOS_VOTACAO_SCHAFER.porSecao
      .filter(function (r) { return !dados.comFiscal.has(r.municipio + '|' + r.zona + '|' + r.secao); })
      .filter(function (r) { return !selRegional.value || window.REGIONAIS_MUNICIPIOS[r.municipio] === selRegional.value; })
      .filter(function (r) { return !selMunicipio.value || r.municipio === selMunicipio.value; })
      .filter(function (r) { return !selZona.value || r.zona === selZona.value; })
      .slice()
      .sort(ORDENACOES[selOrdenar.value] || ORDENACOES['municipio-votos']);

    status.textContent = linhas.length
      ? linhas.length + ' de ' + window.DADOS_VOTACAO_SCHAFER.porSecao.length + ' seções com voto ainda não têm fiscal.'
      : 'Todas as seções com voto (com esses filtros) já têm fiscal.';

    tabelaEl.innerHTML = !linhas.length ? '' : '<div class="tabela-scroll prioridades-scroll"><table class="dados prioridades-tabela"><thead><tr>' +
      '<th>Município</th><th>Regional</th><th>Zona</th><th>Seção</th><th>Local de votação</th><th>Votos (2022)</th>' +
      '</tr></thead><tbody>' +
      linhas.map(function (r) {
        var chave = r.municipio + '|' + r.zona + '|' + r.secao;
        return '<tr><td class="forte">' + esc(nomesMun.get(r.municipio) || r.municipio) + '</td>' +
          '<td>' + esc(window.REGIONAIS_MUNICIPIOS[r.municipio] || '—') + '</td>' +
          '<td>' + esc(r.zona) + '</td><td>' + esc(r.secao) + '</td>' +
          '<td>' + esc(localPorSecao.get(chave) || '—') + '</td>' +
          '<td class="num forte">' + r.votos + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  selRegional.addEventListener('change', renderizar);
  selMunicipio.addEventListener('change', renderizar);
  selZona.addEventListener('change', renderizar);
  selOrdenar.addEventListener('change', renderizar);
  window.addEventListener('banco-atualizado', renderizar);
  renderizar();
})();
