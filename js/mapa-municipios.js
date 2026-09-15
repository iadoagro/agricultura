/* Desenho reaproveitável do mapa dos 22 municípios do Acre.
   Fonte da malha: window.MAPA_ACRE (js/mapa-acre.js, IBGE).
   Mesma matemática de projeção/rótulo que já existia em js/eleicoes.js,
   extraída aqui para servir também o mapa do painel de Mecanização/Açudagem
   e o mapa de resultados de Eleições, sem duplicar o cálculo em cada página.
   js/eleicoes.js mantém a cópia própria: não foi alterado por isto. */
window.MapaMunicipios = (function () {
  'use strict';
  var ns = 'http://www.w3.org/2000/svg';

  /** Desenha o mapa dentro de `svg` (um <svg viewBox="0 0 1000 600">) e
      devolve {nomes, pintar(corPorId), destacar(id)}. `opts.aoClicar(id)` e
      `opts.aoPassarMouse(id)` são chamados com o código IBGE do município
      (string). Devolve null se window.MAPA_ACRE ainda não carregou. */
  function desenhar(svg, opts) {
    opts = opts || {};
    var dados = window.MAPA_ACRE;
    if (!dados || !svg) return null;
    svg.replaceChildren();

    var geo = dados.geo, localidades = dados.localidades;
    var nomes = new Map();
    localidades.forEach(function (m) { nomes.set(String(m.id), m.nome); });

    var polygons = function (f) {
      return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    };
    var projetar = function (p) { return [p[0] * Math.cos(9 * Math.PI / 180), -p[1]]; };
    var pontos = geo.features.flatMap(function (f) { return polygons(f).flat(2); }).map(projetar);
    var xs = pontos.map(function (p) { return p[0]; }), ys = pontos.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var escala = Math.min(940 / (maxX - minX), 540 / (maxY - minY));
    var transformar = function (p) {
      var q = projetar(p);
      return [
        (q[0] - minX) * escala + (1000 - (maxX - minX) * escala) / 2,
        (q[1] - minY) * escala + (600 - (maxY - minY) * escala) / 2
      ];
    };

    var caminhos = new Map();
    var rotulos = [];
    geo.features.forEach(function (f) {
      var id = String(f.properties.codarea);
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', polygons(f).map(function (poly) {
        return poly.map(function (ring) {
          return ring.map(function (p, i) {
            return (i ? 'L' : 'M') + transformar(p).map(function (n) { return n.toFixed(2); }).join(',');
          }).join('') + 'Z';
        }).join('');
      }).join(''));
      path.dataset.id = id;
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', nomes.get(id) || id);
      var title = document.createElementNS(ns, 'title');
      title.textContent = nomes.get(id) || id;
      path.append(title);
      if (opts.aoClicar) {
        path.onclick = function () { opts.aoClicar(id); };
        path.onkeydown = function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.aoClicar(id); }
        };
      }
      if (opts.aoPassarMouse) path.onmouseenter = path.onfocus = function () { opts.aoPassarMouse(id); };
      if (opts.aoTirarMouse) path.onmouseleave = path.onblur = function () { opts.aoTirarMouse(id); };
      svg.append(path);
      caminhos.set(id, path);

      // Centro de área do polígono principal (fórmula do shoelace), em
      // coordenadas do próprio mapa — usado para posicionar o rótulo.
      var ring = polygons(f).sort(function (a, b) { return b[0].length - a[0].length; })[0][0].map(transformar);
      var area = 0, cx = 0, cy = 0;
      ring.forEach(function (p, i) {
        var q = ring[(i + 1) % ring.length], a = p[0] * q[1] - q[0] * p[1];
        area += a; cx += (p[0] + q[0]) * a; cy += (p[1] + q[1]) * a;
      });
      var x = cx / (3 * area), y = cy / (3 * area);
      rotulos.push({ id: id, x: x, y: y, origX: x, origY: y });
    });

    // Afasta rótulos próximos, mantendo uma linha de referência quando o
    // nome precisou sair do centro do polígono.
    for (var passo = 0; passo < 80; passo++) {
      rotulos.forEach(function (a, i) {
        rotulos.slice(i + 1).forEach(function (b) {
          if (Math.abs(a.x - b.x) < 106 && Math.abs(a.y - b.y) < 42) {
            var direcao = a.y <= b.y ? -1 : 1;
            a.y += direcao; b.y -= direcao;
          }
        });
      });
    }
    rotulos.forEach(function (r) {
      if (Math.abs(r.y - r.origY) > 8) {
        var linha = document.createElementNS(ns, 'line');
        linha.setAttribute('x1', r.origX); linha.setAttribute('y1', r.origY);
        linha.setAttribute('x2', r.x); linha.setAttribute('y2', r.y);
        linha.setAttribute('class', 'rotulo-linha');
        svg.append(linha);
      }
      var texto = document.createElementNS(ns, 'text');
      texto.dataset.id = r.id;
      texto.setAttribute('x', r.x); texto.setAttribute('y', r.y);
      if (opts.aoClicar) texto.onclick = function (id) { return function () { opts.aoClicar(id); }; }(r.id);
      if (opts.aoPassarMouse) texto.onmouseenter = function (id) { return function () { opts.aoPassarMouse(id); }; }(r.id);
      if (opts.aoTirarMouse) texto.onmouseleave = function (id) { return function () { opts.aoTirarMouse(id); }; }(r.id);
      var palavras = (nomes.get(r.id) || '').split(' '), linhas = [''];
      palavras.forEach(function (p) {
        if ((linhas[linhas.length - 1] + ' ' + p).trim().length > 15) linhas.push(p);
        else linhas[linhas.length - 1] = (linhas[linhas.length - 1] + ' ' + p).trim();
      });
      linhas.forEach(function (l, i) {
        var t = document.createElementNS(ns, 'tspan');
        t.setAttribute('x', r.x); t.setAttribute('dy', i ? 14 : -(linhas.length - 1) * 7);
        t.textContent = l;
        texto.append(t);
      });
      svg.append(texto);
    });

    return {
      nomes: nomes,
      pintar: function (corPorId) {
        caminhos.forEach(function (path, id) { path.style.fill = corPorId(id) || ''; });
      },
      destacar: function (id) {
        caminhos.forEach(function (path, pid) { path.classList.toggle('selecionado', pid === id); });
      }
    };
  }

  return { desenhar: desenhar };
})();
