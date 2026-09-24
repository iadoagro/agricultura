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

  /** Meta 2026 (toda seção com voto em 2022 com fiscal) em números: quanto
      falta em cada município, em cada regional (window.REGIONAIS_MUNICIPIOS)
      e no Acre. comFiscal: o Set de calcular(). Devolve
      {porMun, porReg: Map(nome → {alvo, faltam}), total: {alvo, faltam}}
      — base da faixa da meta (js/eleicoes.js) e do mapa (js/eleicoes-fiscais-mapa.js). */
  function meta(comFiscal) {
    var votos = window.DADOS_VOTACAO_SCHAFER;
    var regionais = window.REGIONAIS_MUNICIPIOS || {};
    var porMun = new Map(), porReg = new Map(), total = { alvo: 0, faltam: 0 };
    function somar(mapa, chave, falta) {
      if (!chave) return;
      var v = mapa.get(chave) || { alvo: 0, faltam: 0 };
      v.alvo++; if (falta) v.faltam++;
      mapa.set(chave, v);
    }
    (votos ? votos.porSecao : []).forEach(function (r) {
      var falta = !comFiscal.has(r.municipio + '|' + r.zona + '|' + r.secao);
      somar(porMun, r.municipio, falta);
      somar(porReg, regionais[r.municipio], falta);
      total.alvo++; if (falta) total.faltam++;
    });
    return { porMun: porMun, porReg: porReg, total: total };
  }

  /** "12,3%" — parte / todo, com vírgula; "0%" quando o todo é zero. */
  function pct(parte, todo) {
    return (todo ? parte / todo * 100 : 0).toFixed(1).replace('.', ',').replace(',0', '') + '%';
  }

  return {
    oficiaisPorMun: function () { preparar(); return oficiaisPorMun; },
    oficiais: function () { preparar(); return oficiais; },
    calcular: calcular,
    meta: meta,
    pct: pct
  };
})();
