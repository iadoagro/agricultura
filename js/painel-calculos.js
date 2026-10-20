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

  /* ------------------------------------------------ reparo de coordenadas ----
     Coordenadas digitadas à mão erram de formas previsíveis. Em vez de descartá-las, o painel
     tenta descobrir o que a pessoa quis digitar e escolhe a leitura mais próxima do município
     informado. Famílias de erro tratadas:
       UTM (x ~ 6 dígitos, y ~ 7 dígitos, zona 18/19):
         - x e y trocados;
         - falta um dígito (884068 -> 8884068) ou sobra um (decimais digitados sem a vírgula);
         - um dígito trocado (998783 -> 598783);
         - zona errada (18 por 19 e vice-versa);
       Graus decimais digitados sem separador (lat 7–11, lon 66–74):
         - 7392659 / 72562651 -> -7,392659 / -72,562651, em qualquer ordem;
         - 1102070456 -> -11,02070456; "10.9802" já com ponto;
         - primeiro dígito trocado (584534364 -> 8,4534364).
     A referência é o centro do município (mediana dos pontos corretos dele). Escolhe-se a leitura
     de menor "custo" = distância ao centro + pequena penalidade por correção aplicada. Se nada
     ficar plausível, o ponto vai para o centro do município (aproximado) — e o mapa de pontos o
     descarta. Só vale leitura DENTRO do território do Acre (malha do IBGE), não só da caixa. */
  var ACRE = { s: -11.3, n: -6.9, o: -74.1, l: -66.4 };
  var PEN = { digito: 25, truncar: 8, troca: 10, zona: 10, graus: 6, aproximado: 0 };

  /* Território do Acre de verdade: a malha municipal do IBGE (window.MAPA_ACRE, js/mapa-acre.js) é a união dos 22
     municípios, então "dentro do Acre" = dentro de algum município. A caixa acima (ACRE) é só um pré-filtro barato:
     ela inclui pedaços do Peru e da Bolívia, e foi por isso que pontos fora do estado apareciam no mapa. Sem a malha
     carregada (testes em Node), vale só a caixa. */
  var TERRITORIO = null;
  function territorio() {
    if (TERRITORIO) return TERRITORIO;
    var g = typeof MAPA_ACRE !== 'undefined' && MAPA_ACRE && MAPA_ACRE.geo;
    if (!g || !g.features) return null;   // ainda não carregou: não guarda, tenta de novo na próxima chamada
    var lista = [];
    g.features.forEach(function (f) {
      var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach(function (aneis) {
        var b = [Infinity, Infinity, -Infinity, -Infinity];   // lng mín, lat mín, lng máx, lat máx
        aneis[0].forEach(function (p) {
          if (p[0] < b[0]) b[0] = p[0];
          if (p[1] < b[1]) b[1] = p[1];
          if (p[0] > b[2]) b[2] = p[0];
          if (p[1] > b[3]) b[3] = p[1];
        });
        lista.push({ b: b, aneis: aneis });
      });
    });
    TERRITORIO = lista;
    return lista;
  }
  /** Ponto dentro de um anel (raio para a direita, regra par-ímpar). */
  function noAnel(lng, lat, anel) {
    var dentro = false;
    for (var i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      var xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }
  function noTerritorio(lat, lng, T) {
    for (var k = 0; k < T.length; k++) {
      var b = T[k].b;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      var aneis = T[k].aneis;
      if (!noAnel(lng, lat, aneis[0])) continue;
      var buraco = false;
      for (var h = 1; h < aneis.length; h++) if (noAnel(lng, lat, aneis[h])) { buraco = true; break; }
      if (!buraco) return true;
    }
    return false;
  }
  /** Dentro do Acre, com folga de ~450 m na divisa (o GPS erra um pouco na fronteira e esse ponto não deve sumir). */
  var FOLGA_GRAUS = 0.004;
  function dentroDoAcre(lat, lng) {
    if (!(isFinite(lat) && isFinite(lng) && lat >= ACRE.s && lat <= ACRE.n && lng >= ACRE.o && lng <= ACRE.l)) return false;
    var T = territorio();
    if (!T) return true;
    if (noTerritorio(lat, lng, T)) return true;
    for (var a = -1; a <= 1; a++) {
      for (var o = -1; o <= 1; o++) {
        if ((a || o) && noTerritorio(lat + a * FOLGA_GRAUS, lng + o * FOLGA_GRAUS, T)) return true;
      }
    }
    return false;
  }

  function distKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** [lat, lng] -> { x, y } UTM (hemisfério sul) na zona dada (inversa de utmParaLatLng). */
  function latLngParaUtm(lat, lng, zona) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    var rad = Math.PI / 180, phi = lat * rad, lam = lng * rad, lam0 = ((zona - 1) * 6 - 180 + 3) * rad;
    var N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
    var T = Math.tan(phi) * Math.tan(phi), C = ep2 * Math.cos(phi) * Math.cos(phi), A = Math.cos(phi) * (lam - lam0);
    var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256) * phi -
      (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(2 * phi) +
      (15 * e2 * e2 / 256 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(4 * phi) -
      (35 * Math.pow(e2, 3) / 3072) * Math.sin(6 * phi));
    var x = k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
    var y = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 +
      (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720)) + 10000000;
    return { x: x, y: y };
  }

  function soDigitos(v) {
    var s = String(v == null ? '' : v).trim().replace(',', '.');
    var m = /^-?(\d+)(?:\.(\d+))?$/.exec(s);
    return m ? { inteiro: m[1], frac: m[2] || '', tem: m[2] != null } : null;
  }

  /** Variantes de uma string de dígitos para ter `alvo` dígitos: [{ s, e (penalidade), n (nota) }]. */
  function variantesUtm(str, alvo, digitosInicio) {
    var d = soDigitos(str);
    if (!d) return [];
    var base = d.inteiro, out = [], vistos = {};
    function add(s, e, n) {
      if (s.length !== alvo || vistos[s]) return;
      vistos[s] = true;
      out.push({ s: s, e: e, n: n });
    }
    if (base.length === alvo) {
      add(base, 0, '');
      for (var i = 0; i < base.length; i++) {
        for (var c = 0; c <= 9; c++) {
          var ch = String(c);
          if (ch !== base[i]) add(base.slice(0, i) + ch + base.slice(i + 1), PEN.digito, 'dígito ' + (i + 1) + ' trocado');
        }
      }
    } else if (base.length > alvo) {
      // decimais digitados sem a vírgula: sobram dígitos no fim
      add(base.slice(0, alvo), PEN.truncar, 'decimais sem vírgula');
      if (base.length === alvo + 1) {
        for (var p = 0; p < base.length; p++) add(base.slice(0, p) + base.slice(p + 1), PEN.digito, 'dígito sobrando');
      }
    } else {
      var falta = alvo - base.length;
      if (falta === 1) {
        for (var q = 0; q <= base.length; q++) {
          for (var k = 0; k <= 9; k++) add(base.slice(0, q) + k + base.slice(q), PEN.digito, 'dígito faltando');
        }
      } else {
        // faltam vários: completa com zeros à direita ou com os dígitos típicos à esquerda
        var zeros = new Array(falta + 1).join('0');
        add(base + zeros, PEN.digito * 1.5, 'zeros no fim');
        (digitosInicio || []).forEach(function (pre) {
          add(pre + base + new Array(Math.max(0, falta - pre.length) + 1).join('0'), PEN.digito * 1.5, 'início completado');
        });
      }
    }
    return out;
  }

  /** Graus digitados sem separador -> valor numérico, dado o papel (lat: 7–11; lon: 66–74). */
  function grausDeDigitos(str, papel) {
    var d = soDigitos(str);
    if (!d) return [];
    var base = d.inteiro, out = [];
    function de(s, e, n) {
      var nInt;
      if (d.tem && d.inteiro.length <= 2) {
        // já veio com ponto: "10.9802"
        out.push({ v: Number(d.inteiro + '.' + d.frac), e: e, n: n });
        return;
      }
      if (papel === 'lat') nInt = (s[0] === '1') ? 2 : 1;
      else nInt = 2;
      if (s.length <= nInt) return;
      out.push({ v: Number(s.slice(0, nInt) + '.' + s.slice(nInt) + d.frac), e: e, n: n });
    }
    de(base, 0, '');
    // primeiro dígito trocado
    var inicio = papel === 'lat' ? ['7', '8', '9', '1'] : ['6', '7'];
    inicio.forEach(function (ch) {
      if (ch !== base[0]) de(ch + base.slice(1), PEN.digito, 'primeiro dígito trocado');
    });
    return out;
  }

  /**
   * Tenta ler (x, y, zona) como uma coordenada do Acre.
   * prior: { lat, lng, raio } do município (ou do Acre). Devolve a melhor leitura ou null.
   */
  function reinterpretar(x, y, zona, prior) {
    var P = [prior.lat, prior.lng], melhor = null;
    function oferta(lat, lng, custo, metodo) {
      if (!isFinite(lat) || !isFinite(lng)) return;
      var dist = distKm([lat, lng], P);
      var c = dist + custo;
      if (melhor && c >= melhor.custo) return;   // não melhora: nem testa o território
      if (!dentroDoAcre(lat, lng)) return;       // leitura fora do estado (Peru, Bolívia…) é descartada
      melhor = { lat: lat, lng: lng, custo: c, dist: dist, metodo: metodo };
    }
    var zonas = [];
    if (zona >= 17 && zona <= 20) zonas.push([zona, 0]);
    [19, 18].forEach(function (z) { if (!zonas.some(function (t) { return t[0] === z; })) zonas.push([z, zona >= 17 && zona <= 20 ? PEN.zona : 0]); });

    var ordens = [[x, y, 0, ''], [y, x, PEN.troca, 'x e y trocados']];
    ordens.forEach(function (o) {
      var vx = variantesUtm(o[0], 6, ['5', '6', '7']);
      var vy = variantesUtm(o[1], 7, ['8', '9']);
      if (!vx.length || !vy.length) return;
      zonas.forEach(function (zz) {
        var z = zz[0], pu = latLngParaUtm(prior.lat, prior.lng, z);
        // x e y quase independentes: escolhe cada um pelo mais próximo do centro (em m -> km)
        var bx = null, by = null;
        vx.forEach(function (v) {
          var c = Math.abs(+v.s - pu.x) / 1000 + v.e;
          if (!bx || c < bx.c) bx = { v: v, c: c };
        });
        vy.forEach(function (v) {
          var c = Math.abs(+v.s - pu.y) / 1000 + v.e;
          if (!by || c < by.c) by = { v: v, c: c };
        });
        var ll = utmParaLatLng(+bx.v.s, +by.v.s, z);
        var notas = [o[3], bx.v.n && 'x: ' + bx.v.n, by.v.n && 'y: ' + by.v.n, zz[1] && 'zona ' + z].filter(Boolean);
        oferta(ll[0], ll[1], o[2] + zz[1] + bx.v.e + by.v.e, 'UTM' + (notas.length ? ' (' + notas.join('; ') + ')' : ''));
      });
    });

    // graus decimais sem separador, em qualquer ordem
    [[x, y, 0, ''], [y, x, PEN.troca, 'ordem trocada']].forEach(function (o) {
      var la = grausDeDigitos(o[0], 'lat'), lo = grausDeDigitos(o[1], 'lon');
      la.forEach(function (a) {
        lo.forEach(function (b) {
          var notas = [o[3], a.n && 'lat: ' + a.n, b.n && 'lon: ' + b.n].filter(Boolean);
          oferta(-a.v, -b.v, PEN.graus + o[2] + a.e + b.e, 'graus sem separador' + (notas.length ? ' (' + notas.join('; ') + ')' : ''));
        });
      });
    });
    return melhor;
  }

  function mediana(v) {
    var s = v.slice().sort(function (a, b) { return a - b; }), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  /** Centro e raio de cada município a partir dos pontos corretos. */
  function centros(pontos) {
    var por = {}, todos = [];
    pontos.forEach(function (p) {
      if (!dentroDoAcre(p.lat, p.lng)) return;
      todos.push(p);
      var k = p.mun || '';
      (por[k] = por[k] || []).push(p);
    });
    function resumo(l, raioMin) {
      var c = [mediana(l.map(function (p) { return p.lat; })), mediana(l.map(function (p) { return p.lng; }))];
      var ds = l.map(function (p) { return distKm([p.lat, p.lng], c); }).sort(function (a, b) { return a - b; });
      var p90 = ds[Math.floor(ds.length * 0.9)] || 0;
      return { lat: c[0], lng: c[1], raio: Math.max(raioMin, p90 * 1.8), n: l.length };
    }
    var out = {};
    Object.keys(por).forEach(function (m) { if (m && por[m].length >= 3) out[m] = resumo(por[m], 90); });
    out._acre = todos.length ? resumo(todos, 250) : { lat: -9.0, lng: -70.5, raio: 400, n: 0 };
    return out;
  }

  /**
   * itens: [{ mun, x, y, zona }]. Devolve, na mesma ordem:
   *   { lat, lng, situacao: 'original'|'corrigida'|'aproximada', confianca, metodo, distancia }
   * Todo ponto devolvido está dentro da caixa do Acre.
   */
  function repararPontos(itens) {
    var conv = itens.map(function (it) {
      var z = +it.zona >= 17 && +it.zona <= 20 ? +it.zona : 19;
      var ll = utmParaLatLng(+it.x, +it.y, z);
      return { mun: it.mun, lat: ll[0], lng: ll[1], ok: dentroDoAcre(ll[0], ll[1]) };
    });
    var C = centros(conv.filter(function (c) { return c.ok; }));
    return itens.map(function (it, i) {
      var c = conv[i];
      if (c.ok) return { lat: c.lat, lng: c.lng, situacao: 'original', confianca: 'alta', metodo: 'UTM', distancia: 0 };
      var prior = C[it.mun] || C._acre;
      var r = reinterpretar(it.x, it.y, +it.zona || 0, prior);
      // plausível = perto do centro do município (ou, sem referência do município, qualquer ponto do Acre)
      if (r && r.dist <= prior.raio) {
        return { lat: r.lat, lng: r.lng, situacao: 'corrigida', metodo: r.metodo, distancia: r.dist,
          confianca: r.dist <= prior.raio * 0.4 && r.custo < 80 ? 'alta' : (r.dist <= prior.raio * 0.8 ? 'média' : 'baixa') };
      }
      return { lat: prior.lat, lng: prior.lng, situacao: 'aproximada', confianca: 'baixa',
        metodo: 'centro do município (coordenada irrecuperável)', distancia: 0 };
    });
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
    utmParaLatLng: utmParaLatLng, latLngParaUtm: latLngParaUtm, variacao: variacao,
    dentroDoAcre: dentroDoAcre, distKm: distKm, repararPontos: repararPontos, reinterpretar: reinterpretar
  };
});
