/* Pinta o mapa da aba "Fiscais" (#mapa, desenhado por js/eleicoes.js) pela
   quantidade de fiscais cadastrados em cada município, com dica ao passar o
   mouse — mesma ideia do mapa de votos em js/eleicoes-resultados.js, mas
   mostrando "onde já tem fiscal" em vez de "onde teve voto". A cor é por
   contagem de fiscais (visível desde o 1º cadastro), não por % de seções
   cobertas — com centenas de seções oficiais por município, 1 ou 2 fiscais
   dariam uma % quase invisível no mapa; a % de cobertura ainda aparece na
   dica, como detalhe. Não mexe no desenho do mapa nem nos cliques (isso
   continua sendo de js/eleicoes.js); só pinta e escuta os elementos que ele
   já cria (path[data-id]), usando addEventListener para não substituir os
   manipuladores que js/eleicoes.js já atribui via .onclick etc. em cada
   path. */
(function () {
  'use strict';
  var svg = document.getElementById('mapa');
  var dica = document.getElementById('mapaFiscaisDica');
  if (!svg || !window.CoberturaFiscais || !window.MAPA_ACRE || !window.BANCO_ELEICOES) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var nomesMun = new Map(window.MAPA_ACRE.localidades.map(function (m) { return [String(m.id), m.nome]; }));
  var oficiaisPorMun = window.CoberturaFiscais.oficiaisPorMun();
  var comFiscalPorMun = new Map();
  var totalFiscaisPorMun = new Map();
  var comFiscal = new Set();
  // Seções que tiveram voto para o candidato em 2022 (mesmos dados da aba
  // Resultados, js/dados-votacao-schafer.js), por município — pra dica dizer
  // quantas delas ainda estão sem fiscal.
  var VOTOS = window.DADOS_VOTACAO_SCHAFER;
  var secoesComVotoPorMun = new Map();
  (VOTOS ? VOTOS.porSecao : []).forEach(function (r) {
    if (!secoesComVotoPorMun.has(r.municipio)) secoesComVotoPorMun.set(r.municipio, []);
    secoesComVotoPorMun.get(r.municipio).push(r.municipio + '|' + r.zona + '|' + r.secao);
  });
  var TETO_ESCALA = 10; // a partir de 10 fiscais já usa o tom mais escuro da escala.
  var meta = null;       // CoberturaFiscais.meta(): quanto falta por município, regional e Acre
  var porcento = window.CoberturaFiscais.pct;   // "12,3%"
  var REGIONAIS = window.REGIONAIS_MUNICIPIOS || {};

  // Sem fiscal = cinza (cor padrão do mapa); 1 fiscal já aparece em verde
  // claro, ficando mais escuro conforme mais fiscais são cadastrados.
  function corPresenca(qtd) {
    var matiz = 140, luz = 88 - Math.min(qtd, TETO_ESCALA) / TETO_ESCALA * 48;
    return 'hsl(' + matiz + ' 45% ' + luz.toFixed(0) + '%)';
  }

  function pintar() {
    // No modo online, window.BANCO_ELEICOES.ler() lança enquanto o banco
    // ainda está buscando os cadastros na 1ª carga da página; o evento
    // "banco-atualizado" (abaixo) chama pintar() de novo quando terminar.
    var dados;
    try { dados = window.CoberturaFiscais.calcular(); } catch (e) { return; }
    comFiscalPorMun = dados.comFiscalPorMun;
    comFiscal = dados.comFiscal;
    totalFiscaisPorMun = new Map();
    dados.registros.forEach(function (r) {
      if (!r.municipio) return;
      totalFiscaisPorMun.set(r.municipio, (totalFiscaisPorMun.get(r.municipio) || 0) + 1);
    });
    svg.querySelectorAll('path[data-id]').forEach(function (path) {
      var qtd = totalFiscaisPorMun.get(path.dataset.id) || 0;
      path.style.fill = qtd ? corPresenca(qtd) : '';
    });
    meta = window.CoberturaFiscais.meta(comFiscal);
  }

  // Dica do município (só ao passar o mouse; o mapa mostra só o nome).
  // Primeiro o que falta da meta — seções com voto em 2022 sem fiscal — e o
  // que falta em todas as seções (com ou sem voto); depois o peso do
  // município no que falta na regional e no Acre, e os números de cadastro.
  function mostrarDica(id) {
    if (!dica) return;
    var oficiais = oficiaisPorMun.get(id) || 0;
    var comFiscalMun = comFiscalPorMun.get(id) || 0;
    var semFiscal = Math.max(0, oficiais - comFiscalMun);
    var totalFiscais = totalFiscaisPorMun.get(id) || 0;
    var comVoto = secoesComVotoPorMun.get(id) || [];
    var comVotoSemFiscal = comVoto.filter(function (k) { return !comFiscal.has(k); }).length;
    var regional = REGIONAIS[id], reg = regional && meta && meta.porReg.get(regional);
    function linha(classe, rotulo, valor) {
      return '<div class="linha' + (classe ? ' ' + classe : '') + '"><span>' + rotulo + '</span><span>' + valor + '</span></div>';
    }
    var html = '<strong>' + esc(nomesMun.get(id) || id) + '</strong>';
    if (VOTOS) {
      html += linha('sem', 'Falta nas seções com voto (' + esc(VOTOS.ano) + ')',
        comVoto.length ? porcento(comVotoSemFiscal, comVoto.length) + ' · ' + comVotoSemFiscal + ' de ' + comVoto.length : 'sem seção com voto');
    }
    html += linha('sem', 'Falta em todas as seções', porcento(semFiscal, oficiais) + ' · ' + semFiscal + ' de ' + oficiais);
    if (meta && comVotoSemFiscal) {
      html += linha('separador', 'Do que falta na regional' + (regional ? ' ' + esc(regional) : ''), reg ? porcento(comVotoSemFiscal, reg.faltam) : '—');
      html += linha('', 'Do que falta no Acre', porcento(comVotoSemFiscal, meta.total.faltam));
    }
    html += linha('com separador', 'Fiscais cadastrados', totalFiscais);
    dica.innerHTML = html;
    dica.hidden = false;
  }
  function esconderDica() { if (dica) dica.hidden = true; }

  if (dica) {
    svg.addEventListener('mousemove', function (e) {
      if (dica.hidden) return;
      var margem = 16, x = e.clientX + margem, y = e.clientY + margem;
      var larg = dica.offsetWidth || 250, alt = dica.offsetHeight || 160;
      if (x + larg > window.innerWidth) x = e.clientX - larg - margem;
      if (y + alt > window.innerHeight) y = e.clientY - alt - margem;
      dica.style.left = x + 'px'; dica.style.top = y + 'px';
    });
  }

  function ligarInteracao() {
    svg.querySelectorAll('path[data-id]').forEach(function (path) {
      path.addEventListener('mouseenter', function () { mostrarDica(path.dataset.id); });
      path.addEventListener('focus', function () { mostrarDica(path.dataset.id); });
      path.addEventListener('mouseleave', esconderDica);
      path.addEventListener('blur', esconderDica);
    });
  }

  function aoDesenhar() { pintar(); ligarInteracao(); }

  if (svg.querySelector('path[data-id]')) {
    aoDesenhar();
  } else {
    var obs = new MutationObserver(function () {
      if (svg.querySelector('path[data-id]')) { obs.disconnect(); aoDesenhar(); }
    });
    obs.observe(svg, { childList: true });
  }

  window.addEventListener('banco-atualizado', pintar);
})();
