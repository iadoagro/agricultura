/* Regras de cálculo do painel de Mecanização, sem nada de tela (DOM): datas de referência,
   exercício, somas e contagens, ranking, faixas, identidade do produtor e a conversão UTM -> lat/lng.
   Ficam num arquivo à parte para poderem ser testadas no Node (tools/testar_painel.cjs) e para o
   js/dashboard.js ter menos o que carregar. Usado como window.PainelCalculos no navegador. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.PainelCalculos = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var JANELA_VISTORIA = 18;   // meses

  function difMeses(a, b) {
    return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  }

  /** A Data da Vistoria é plausível: ocorreu até o lançamento e no máximo 18 meses antes. */
  function vistoriaValida(r) {
    if (!r.dv || !r.d) return false;
    if (r.dv > r.d) return false;                       // serviço "no futuro"
    return difMeses(r.dv, r.d) <= JANELA_VISTORIA;      // ou velho demais
  }

  /** Data do serviço: a vistoria quando plausível, senão a de lançamento. */
  function dataRef(r) { return vistoriaValida(r) ? r.dv : r.d; }

  /** Exercício: a planilha a que a linha pertence (ou o ano do lançamento). */
  function anoDe(r) { return r.ex || r.d.slice(0, 4); }

  /** Mês dentro do exercício ("2026-11"): o ano vem do exercício, o mês da data de referência. */
  function mesChave(r) { return anoDe(r) + '-' + dataRef(r).slice(5, 7); }

  function soma(arr, f) { return arr.reduce(function (a, r) { return a + (f(r) || 0); }, 0); }

  function contar(arr, f) {
    var m = new Map();
    arr.forEach(function (r) {
      var vs = f(r);
      (Array.isArray(vs) ? vs : [vs]).forEach(function (v) {
        if (v == null || v === '') return;
        m.set(v, (m.get(v) || 0) + 1);
      });
    });
    return m;
  }

  function somarPor(arr, chave, valor) {
    var m = new Map();
    arr.forEach(function (r) {
      var k = chave(r);
      if (k == null || k === '') return;
      m.set(k, (m.get(k) || 0) + (valor(r) || 0));
    });
    return m;
  }

  function distintosPor(arr, chave, valor) {
    var m = new Map();
    arr.forEach(function (r) {
      var k = chave(r), v = valor(r);
      if (k == null || k === '' || v == null || v === '' || v < 0) return;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    });
    var out = new Map();
    m.forEach(function (s, k) { out.set(k, s.size); });
    return out;
  }

  function ranking(m, lim, agrupar) {
    var l = Array.from(m, function (e) { return { rot: e[0], val: e[1] }; })
      .filter(function (d) { return d.val > 0; })
      .sort(function (a, b) { return b.val - a.val || a.rot.localeCompare(b.rot, 'pt-BR'); });
    if (lim && l.length > lim) {
      var resto = l.slice(lim - (agrupar ? 1 : 0));
      l = l.slice(0, lim - (agrupar ? 1 : 0));
      if (agrupar) l.push({ rot: 'Outros', val: resto.reduce(function (a, d) { return a + d.val; }, 0) });
    }
    return l;
  }

  function faixas(D, valor, cortes) {
    var m = new Map();
    cortes.forEach(function (c) { m.set(c.rot, 0); });
    D.forEach(function (r) {
      var v = valor(r);
      if (!v) return;
      for (var i = 0; i < cortes.length; i++) {
        if (v <= cortes[i].max) { m.set(cortes[i].rot, m.get(cortes[i].rot) + 1); break; }
      }
    });
    return Array.from(m, function (e) { return { rot: e[0], val: e[1] }; })
      .filter(function (d) { return d.val > 0; });
  }

  /** Sem acento e em minúsculas: base da busca e da identidade do produtor. */
  function chaveBusca(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function chaveProdutor(r) { return chaveBusca(r.prod).replace(/\s+/g, ' ').trim(); }

  /** Produtores distintos pelo nome normalizado. */
  function nProdutores(D) {
    var s = new Set();
    D.forEach(function (r) {
      var k = chaveProdutor(r);
      if (k) s.add(k);
    });
    return s.size;
  }

  /** UTM (hemisfério sul, WGS84) -> [lat, lng]. */
  function utmParaLatLng(x, y, zona) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    var xr = x - 500000, yr = y - 10000000;
    var M = yr / k0;
    var mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
      (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var sn = Math.sin(phi1), cs = Math.cos(phi1), tn = Math.tan(phi1);
    var N1 = a / Math.sqrt(1 - e2 * sn * sn), T1 = tn * tn, C1 = ep2 * cs * cs;
    var R1 = a * (1 - e2) / Math.pow(1 - e2 * sn * sn, 1.5), D = xr / (N1 * k0);
    var lat = phi1 - (N1 * tn / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
    var lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cs;
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
  }

  /** Variação entre dois valores: { d, pct } (pct é null quando a referência é zero). */
  function variacao(atual, anterior) {
    var d = atual - anterior;
    return { d: d, pct: anterior ? d / anterior * 100 : null };
  }

  return {
    JANELA_VISTORIA: JANELA_VISTORIA,
    difMeses: difMeses, vistoriaValida: vistoriaValida, dataRef: dataRef, anoDe: anoDe, mesChave: mesChave,
    soma: soma, contar: contar, somarPor: somarPor, distintosPor: distintosPor, ranking: ranking, faixas: faixas,
    chaveBusca: chaveBusca, chaveProdutor: chaveProdutor, nProdutores: nProdutores,
    utmParaLatLng: utmParaLatLng, variacao: variacao
  };
});
