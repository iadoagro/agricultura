/* Cruzamento reutilizável entre seções oficiais (window.LOCAIS_VOTACAO) e
   cadastros de Fiscais (window.BANCO_ELEICOES): mesma definição de "seção
   oficial" (principal ou agregada) usada por tools/gerar_votacao_candidato.py
   para achar quem não teve voto. Usado pelo painel de indicadores
   (js/eleicoes-painel.js), pelo mapa da aba Fiscais
   (js/eleicoes-fiscais-mapa.js) e pela lista de prioridades
   (js/eleicoes-prioridades.js) — para não repetir o mesmo cruzamento três
   vezes com risco de definições diferentes. */
window.CoberturaFiscais = (function () {
  'use strict';
  var oficiais = null, oficiaisPorMun = null;

  function preparar() {
    if (oficiais) return;
    oficiais = new Set();
    oficiaisPorMun = new Map();
    (window.LOCAIS_VOTACAO ? window.LOCAIS_VOTACAO.locais : []).forEach(function (l) {
      l.secoes.forEach(function (s) {
        [s.numero].concat(s.agregadas).forEach(function (numero) {
          oficiais.add(l.municipio + '|' + l.zona + '|' + numero);
          oficiaisPorMun.set(l.municipio, (oficiaisPorMun.get(l.municipio) || 0) + 1);
        });
      });
    });
  }

  /** Cruza as seções oficiais com uma lista de cadastros (por padrão, a atual
      de window.BANCO_ELEICOES.ler() — pode receber outra, ex.: um
      instantâneo, para comparar). Devolve {registros, comFiscal (Set de
      "municipio|zona|secao"), comFiscalPorMun (Map), totalOficiais}. */
  function calcular(registros) {
    preparar();
    registros = registros || window.BANCO_ELEICOES.ler();
    var comFiscal = new Set();
    var comFiscalPorMun = new Map();
    registros.forEach(function (r) {
      if (!r.municipio || !r.zona || !r.secao) return;
      var chave = r.municipio + '|' + r.zona + '|' + r.secao;
      if (!oficiais.has(chave) || comFiscal.has(chave)) return;
      comFiscal.add(chave);
      comFiscalPorMun.set(r.municipio, (comFiscalPorMun.get(r.municipio) || 0) + 1);
    });
    return { registros: registros, comFiscal: comFiscal, comFiscalPorMun: comFiscalPorMun, totalOficiais: oficiais.size };
  }

  return {
    oficiaisPorMun: function () { preparar(); return oficiaisPorMun; },
    oficiais: function () { preparar(); return oficiais; },
    calcular: calcular
  };
})();
