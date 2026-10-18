/* Primitivas de gráfico (SVG/HTML puro, sem dependências) — SEAGRI
   As cores saem das variáveis CSS --s1..--s5, então o tema claro/escuro troca
   a paleta sem mexer no JS. A ordem dos slots é fixa: nunca reciclar cores;
   a partir da 6ª categoria quem chama agrupa o resto em "Outros". */
(function (global) {
  'use strict';

  function paleta() {
    var css = getComputedStyle(document.documentElement);
    var c = [];
    for (var i = 1; i <= 5; i++) c.push(css.getPropertyValue('--s' + i).trim() || '#2a78d6');
    return c;
  }
  function neutra() {
    return getComputedStyle(document.documentElement).getPropertyValue('--tinta3').trim() || '#898781';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(v, dec) {
    if (v == null || isNaN(v)) return '0';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }

  function vazio(el, msg) {
    el.innerHTML = '<p class="vazio">' + esc(msg || 'Sem dados para os filtros selecionados.') + '</p>';
  }

  /** Escala "redonda" divisível por 4, para os ticks caírem em números legíveis. */
  function teto(max) {
    if (max <= 0) return 1;
    function arredonda(x) {
      var e = Math.pow(10, Math.floor(Math.log10(x)));
      var f = x / e;
      return (f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 :
        f <= 4 ? 4 : f <= 5 ? 5 : 10) * e;
    }
    var passo = arredonda(max / 4), t = passo * 4;
    while (t < max) { passo = arredonda(passo * 1.5); t = passo * 4; }
    return t;
  }

  /** Liga o clique nas marcas quando quem chama passa opts.aoClicar.
      O container é reaproveitado entre redesenhos, então o ouvinte anterior
      precisa sair antes — senão um clique dispara N vezes e o filtro alterna.

      Filtrar clicando numa marca é a interação central do painel, e era só de
      mouse. As marcas marcadas com data-foco viram alvo de Tab, com Enter e
      Espaço fazendo o mesmo que o clique. Só uma marca por dado recebe foco:
      as barras, por exemplo, têm três elementos com data-rot (rótulo, pista e
      valor) e virariam três paradas de Tab para a mesma informação. */
  function clicavel(el, opts) {
    if (el._aoClicar) {
      el.removeEventListener('click', el._aoClicar);
      el.removeEventListener('keydown', el._aoTeclar);
      el._aoClicar = el._aoTeclar = null;
      el.classList.remove('clicavel');
    }
    if (!opts.aoClicar) return;

    el._aoClicar = function (ev) {
      var alvo = ev.target.closest('[data-rot]');
      if (alvo) opts.aoClicar(alvo.getAttribute('data-rot'));
    };
    el._aoTeclar = function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var alvo = ev.target.closest('[data-rot]');
      if (!alvo) return;
      ev.preventDefault();               // Espaço não deve rolar a página
      opts.aoClicar(alvo.getAttribute('data-rot'));
    };
    el.addEventListener('click', el._aoClicar);
    el.addEventListener('keydown', el._aoTeclar);
    el.classList.add('clicavel');

    el.querySelectorAll('[data-foco]').forEach(function (m) {
      m.setAttribute('tabindex', '0');
      m.setAttribute('role', 'button');
      if (!m.getAttribute('aria-label')) {
        m.setAttribute('aria-label', 'Filtrar por ' + m.getAttribute('data-rot'));
      }
    });
  }

  function corDe(d, i, cores, ordem) {
    if (d.rot === 'Outros') return neutra();
    var k = ordem ? ordem.indexOf(d.rot) : -1;
    return cores[(k < 0 ? i : k) % cores.length];
  }

  /* ========================================================================
     CATEGÓRICOS — dados: [{rot, val, sub}] já ordenados
     ===================================================================== */

  /** Barras horizontais: grade de 3 colunas (rótulo | pista | valor) para que
      todas as linhas compartilhem a escala e nenhum número transborde. */
  function barras(el, dados, opts) {
    opts = opts || {};
    if (!dados || !dados.length) return vazio(el);
    var cores = paleta();
    var max = opts.max || Math.max.apply(null, dados.map(function (d) { return d.val; })) || 1;
    var cor = opts.cor || cores[0];
    var html = '<div class="barras">';
    dados.forEach(function (d, i) {
      var pct = Math.max(1.5, (d.val / max) * 100);
      var dica = esc(d.rot) + ': ' + num(d.val, opts.dec) + (opts.unidade ? ' ' + esc(opts.unidade) : '');
      var at = ' data-rot="' + esc(d.rot) + '" title="' + dica + '"';
      html += '<span class="barra-rot" data-foco' + at + '>' + esc(d.rot) + '</span>' +
        '<span class="barra-pista"' + at + '><span class="barra-fill" style="width:' + pct.toFixed(2) +
        '%;background:' + (opts.multicor ? corDe(d, i, cores, opts.ordem) : cor) + '"></span></span>' +
        '<span class="barra-val"' + at + '>' + num(d.val, opts.dec) +
        (d.sub ? '<small>' + esc(d.sub) + '</small>' : '') + '</span>';
    });
    el.innerHTML = html + '</div>';
    clicavel(el, opts);
  }

  /** Colunas verticais com rótulo direto no topo. */
  function colunas(el, dados, opts) {
    opts = opts || {};
    if (!dados || !dados.length) return vazio(el);
    var cores = paleta();
    var cor = opts.cor || cores[0];
    var max = Math.max.apply(null, dados.map(function (d) { return d.val; })) || 1;
    var html = '<div class="colunas" style="--n:' + dados.length + '">';
    dados.forEach(function (d, i) {
      var pct = Math.max(1, (d.val / max) * 100);
      var dica = esc(d.rot) + ': ' + num(d.val, opts.dec) + (opts.unidade ? ' ' + esc(opts.unidade) : '');
      html += '<div class="col-item" data-foco data-rot="' + esc(d.rot) + '" title="' + dica + '">' +
        '<span class="col-val">' + num(d.val, opts.dec) + '</span>' +
        '<span class="col-pista"><span class="col-fill" style="height:' + pct.toFixed(2) + '%;background:' +
        (opts.multicor ? corDe(d, i, cores, opts.ordem) : cor) + '"></span></span>' +
        '<span class="col-rot">' + esc(d.rot) + '</span></div>';
    });
    el.innerHTML = html + '</div>';
    clicavel(el, opts);
  }

  /** Rosca (buraco no meio) ou pizza (opts.pizza = true). Máx. 5 fatias + "Outros". */
  function rosca(el, dados, opts) {
    opts = opts || {};
    if (!dados || !dados.length) return vazio(el);
    var total = dados.reduce(function (a, d) { return a + d.val; }, 0);
    if (!total) return vazio(el);
    var cores = paleta();

    var R = 62, r = opts.pizza ? 0 : 40, C = 76, gap = opts.pizza ? 0.006 : 0.012;
    var ang = -Math.PI / 2, partes = '';
    var cs = dados.map(function (d, i) { return corDe(d, i, cores, opts.ordem); });

    dados.forEach(function (d, i) {
      var frac = d.val / total;
      var a0 = ang + (dados.length > 1 ? gap : 0);
      var a1 = ang + frac * 2 * Math.PI - (dados.length > 1 ? gap : 0);
      ang += frac * 2 * Math.PI;
      if (a1 <= a0) a1 = a0 + 0.004;
      var grande = (a1 - a0) > Math.PI ? 1 : 0;
      var n2 = function (v) { return v.toFixed(2); };
      // os flags do comando A precisam ser 0/1 inteiros — nunca formatados
      var p = 'M ' + n2(C + R * Math.cos(a0)) + ' ' + n2(C + R * Math.sin(a0)) +
        ' A ' + R + ' ' + R + ' 0 ' + grande + ' 1 ' + n2(C + R * Math.cos(a1)) + ' ' + n2(C + R * Math.sin(a1)) +
        (r ? ' L ' + n2(C + r * Math.cos(a1)) + ' ' + n2(C + r * Math.sin(a1)) +
          ' A ' + r + ' ' + r + ' 0 ' + grande + ' 0 ' + n2(C + r * Math.cos(a0)) + ' ' + n2(C + r * Math.sin(a0))
          : ' L ' + C + ' ' + C) + ' Z';
      partes += '<path d="' + p + '" fill="' + cs[i] + '" data-rot="' + esc(d.rot) + '"><title>' +
        esc(d.rot) + ': ' + num(d.val, opts.dec) + ' (' + (frac * 100).toFixed(1).replace('.', ',') +
        '%)</title></path>';
    });

    var centro = r ? '<text x="' + C + '" y="' + (C - 2) + '" text-anchor="middle" class="rosca-centro-val">' +
      num(total, opts.dec) + '</text><text x="' + C + '" y="' + (C + 14) +
      '" text-anchor="middle" class="rosca-centro-rot">' + esc((opts.unidade || 'total').toUpperCase()) +
      '</text>' : '';

    var leg = '<div class="rosca-legenda">' + dados.map(function (d, i) {
      return '<span class="rosca-item" data-foco data-rot="' + esc(d.rot) + '">' +
        '<span class="legenda-cor" style="background:' + cs[i] + '"></span>' +
        '<span class="rosca-nome">' + esc(d.rot) + '</span><b>' + num(d.val, opts.dec) + ' &middot; ' +
        (d.val / total * 100).toFixed(1).replace('.', ',') + '%</b></span>';
    }).join('') + '</div>';

    el.innerHTML = '<div class="rosca-box"><svg viewBox="0 0 152 152" class="rosca-svg" role="img" aria-label="' +
      esc(opts.titulo || 'Distribuição') + '">' + partes + centro + '</svg>' + leg + '</div>';
    clicavel(el, opts);
  }

  /* Cópia rasa em vez de `opts.pizza = true`: quem chama guarda e reaproveita
     o mesmo objeto de opções entre redesenhos, então marcar a flag no original
     deixava o painel preso na pizza — voltar para "Rosca" continuava pizza. */
  function pizza(el, dados, opts) {
    var o = Object.assign({}, opts || {});
    o.pizza = true;
    rosca(el, dados, o);
  }

  /** Tabela simples — é também a "table view" exigida pela paleta de baixo contraste. */
  function tabela(el, dados, opts) {
    opts = opts || {};
    if (!dados || !dados.length) return vazio(el);
    var total = dados.reduce(function (a, d) { return a + d.val; }, 0);
    el.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>' + esc(opts.rotuloChave || 'Categoria') + '</th><th>' +
      esc(opts.unidade ? 'Valor (' + opts.unidade + ')' : 'Valor') + '</th><th>%</th></tr></thead><tbody>' +
      dados.map(function (d) {
        return '<tr data-foco data-rot="' + esc(d.rot) + '"><td class="forte">' + esc(d.rot) + '</td>' +
          '<td class="num">' + num(d.val, opts.dec) + '</td>' +
          '<td class="num">' + (total ? (d.val / total * 100).toFixed(1).replace('.', ',') : '0') + '%</td></tr>';
      }).join('') +
      '<tr><td class="forte">Total</td><td class="num forte">' + num(total, opts.dec) +
      '</td><td class="num forte">100%</td></tr></tbody></table></div>';
    clicavel(el, opts);
  }

  /* ========================================================================
     SÉRIES TEMPORAIS — rotulos: ['jan/26', ...]  series: [{nome, valores, slot}]
     Eixo Y único, sempre a partir de zero. Nunca dois eixos.
     ===================================================================== */
  function eixos(el, rotulos, series, opts, modo) {
    opts = opts || {};
    if (!rotulos || !rotulos.length) return vazio(el);
    var cores = paleta();
    // celular (até 768 px): área de desenho estreita, para a escala ficar perto de 1:1 e os números continuarem legíveis
    var cel = !!(global.matchMedia && global.matchMedia('(max-width: 768px)').matches);
    var W = cel ? 360 : 760, H = cel ? 260 : 280, ml = cel ? 40 : 48, mr = cel ? 12 : 14, mt = 16, mb = cel ? 30 : 36;
    var pw = W - ml - mr, ph = H - mt - mb;
    var max = 0;
    series.forEach(function (s) { s.valores.forEach(function (v) { if (v > max) max = v; }); });
    var t = teto(max), n = rotulos.length;
    var cor = function (s, si) { return cores[(s.slot == null ? si : s.slot) % cores.length]; };
    var x = function (i) { return ml + (n === 1 ? pw / 2 : (i / (n - 1)) * pw); };
    var y = function (v) { return mt + ph - (v / t) * ph; };

    var g = '';
    for (var k = 0; k <= 4; k++) {
      var val = t * k / 4, yy = y(val);
      g += '<line class="g-grade" x1="' + ml + '" y1="' + yy.toFixed(1) + '" x2="' + (W - mr) + '" y2="' + yy.toFixed(1) + '"/>' +
        '<text class="g-tick" x="' + (ml - 8) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end">' +
        num(val, val % 1 ? 1 : 0) + '</text>';
    }
    g += '<line class="g-eixo" x1="' + ml + '" y1="' + (mt + ph) + '" x2="' + (W - mr) + '" y2="' + (mt + ph) + '"/>';

    var salto = Math.ceil(n / (cel ? 6 : 12));   // no celular, um rótulo de tempo a cada poucos períodos (o toque mostra o exato)
    rotulos.forEach(function (rr, i) {
      if (i % salto === 0 || i === n - 1) {
        g += '<text class="g-tick" x="' + x(i).toFixed(1) + '" y="' + (mt + ph + 16) +
          '" text-anchor="middle">' + esc(rr) + '</text>';
      }
    });

    if (modo === 'colunas') {
      // colunas agrupadas, com 2px de respiro entre as barras de cada período
      var larg = pw / n, gr = Math.min(larg * 0.7, 46), bw = (gr / series.length) - 2;
      series.forEach(function (s, si) {
        s.valores.forEach(function (v, i) {
          var h = (v / t) * ph;
          var bx = ml + larg * i + (larg - gr) / 2 + si * (bw + 2);
          if (h > 0) {
            var tit = esc(rotulos[i]) + ' — ' + esc(s.nome) + ': ' + num(v, opts.dec);
            if (s.detalhe && s.detalhe.valores[i]) {
              tit += ' · ' + num(s.detalhe.valores[i], s.detalhe.dec) + ' ' + esc(s.detalhe.un);
            }
            g += '<rect x="' + bx.toFixed(1) + '" y="' + (mt + ph - h).toFixed(1) + '" width="' + bw.toFixed(1) +
              '" height="' + h.toFixed(1) + '" rx="3" fill="' + cor(s, si) + '"><title>' + tit + '</title></rect>';
          }
        });
      });
    } else {
      // período sem valor (null/0) é buraco na linha: a série quebra em
      // segmentos em vez de despencar até o zero, que não significaria nada
      series.forEach(function (s, si) {
        var c = cor(s, si);
        var trechos = [], atual = [];
        s.valores.forEach(function (v, i) {
          if (v == null || v === 0) { if (atual.length) { trechos.push(atual); atual = []; } return; }
          atual.push(i);
        });
        if (atual.length) trechos.push(atual);

        trechos.forEach(function (idx) {
          var linha = idx.map(function (i, k) {
            return (k ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s.valores[i]).toFixed(1);
          }).join(' ');
          if (modo === 'area' && idx.length > 1) {
            g += '<path d="' + linha + ' L' + x(idx[idx.length - 1]).toFixed(1) + ' ' + (mt + ph) +
              ' L' + x(idx[0]).toFixed(1) + ' ' + (mt + ph) + ' Z" fill="' + c + '" opacity=".16"/>';
          }
          if (idx.length > 1) g += '<path class="g-linha" d="' + linha + '" stroke="' + c + '"/>';
        });

        if (n <= 24) {
          s.valores.forEach(function (v, i) {
            if (v == null || v === 0) return;
            g += '<circle class="g-ponto" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) +
              '" r="4" fill="' + c + '"/>';
          });
        }
      });
    }

    // classe, não id: há mais de um gráfico de série na mesma aba (açudagem tem
    // dois) e ids repetidos deixam o documento inválido
    g += '<line class="g-cursor" y1="' + mt + '" y2="' + (mt + ph) + '"/>';
    var lg = pw / Math.max(1, n - 1);
    rotulos.forEach(function (rr, i) {
      g += '<rect class="g-hit" data-foco data-i="' + i + '" data-rot="' + esc(rr) + '" x="' +
        (x(i) - lg / 2).toFixed(1) + '" y="' + mt + '" width="' + lg.toFixed(1) + '" height="' + ph + '"/>';
    });

    var leg = '';
    var temDetalhe = series.some(function (s) { return s.detalhe && s.detalhe.total != null; });
    if (series.length > 1 || temDetalhe) {
      leg = '<div class="legenda">' + series.map(function (s, i) {
        var det = (s.detalhe && s.detalhe.total != null)
          ? '<span class="legenda-det">' + num(s.detalhe.total, s.detalhe.dec) + ' ' + esc(s.detalhe.un) + '</span>'
          : '';
        return '<span class="legenda-item"><span class="legenda-cor" style="background:' + cor(s, i) +
          '"></span>' + esc(s.nome) + det + '</span>';
      }).join('') + '</div>';
    }

    el.innerHTML = leg + '<div class="serie-box"><svg viewBox="0 0 ' + W + ' ' + H +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(opts.titulo || 'Série temporal') +
      '">' + g + '</svg><div class="tooltip"></div></div>';

    var box = el.querySelector('.serie-box');
    var tip = box.querySelector('.tooltip');
    var cursor = box.querySelector('.g-cursor');
    box.querySelectorAll('.g-hit').forEach(function (hit) {
      hit.addEventListener('mouseenter', function () {
        var i = +hit.getAttribute('data-i');
        cursor.setAttribute('x1', x(i).toFixed(1));
        cursor.setAttribute('x2', x(i).toFixed(1));
        cursor.style.visibility = 'visible';
        var h = '<div class="tooltip-tit">' + esc(rotulos[i]) + '</div>';
        // do mais forte para o mais fraco naquele ponto (a cor continua a da série)
        var ordem = series.map(function (s, si) { return { s: s, si: si }; }).filter(function (o) {
          return o.s.valores[i] != null && o.s.valores[i] !== 0; // sem lançamento no mês
        }).sort(function (a, b) { return b.s.valores[i] - a.s.valores[i]; });
        ordem.forEach(function (o, pos) {
          var s = o.s, si = o.si;
          h += '<div class="tooltip-l"><span class="legenda-cor" style="background:' + cor(s, si) +
            '"></span>' + (ordem.length > 1 ? '<span class="tooltip-pos">' + (pos + 1) + 'º</span>' : '') +
            esc(s.nome) + '<b>' + num(s.valores[i], opts.dec) + '</b></div>';
          // medida própria do serviço (hectares na mecanização, horas na açudagem)
          if (s.detalhe && s.detalhe.valores[i]) {
            h += '<div class="tooltip-l tooltip-sub">' + esc(s.detalhe.rot) +
              '<b>' + num(s.detalhe.valores[i], s.detalhe.dec) + ' ' + esc(s.detalhe.un) + '</b></div>';
          }
        });
        tip.innerHTML = h;
        tip.classList.add('on');
        var px = (x(i) / W) * box.clientWidth;
        tip.style.left = Math.min(Math.max(8, px + 14), Math.max(8, box.clientWidth - tip.offsetWidth - 8)) + 'px';
        tip.style.top = '8px';
      });
    });
    box.addEventListener('mouseleave', function () {
      tip.classList.remove('on');
      cursor.style.visibility = 'hidden';
    });
    clicavel(el, opts);
  }

  function linhas(el, rotulos, series, opts) { eixos(el, rotulos, series, opts, 'linha'); }
  function area(el, rotulos, series, opts) { eixos(el, rotulos, series, opts, 'area'); }
  function colunasSerie(el, rotulos, series, opts) { eixos(el, rotulos, series, opts, 'colunas'); }

  /** Série em forma de tabela (períodos nas linhas, séries nas colunas). */
  function tabelaSerie(el, rotulos, series, opts) {
    opts = opts || {};
    if (!rotulos || !rotulos.length) return vazio(el);
    var tot = series.map(function (s) { return s.valores.reduce(function (a, v) { return a + (v || 0); }, 0); });
    var cel = function (v) {
      return '<td class="num">' + (v ? num(v, opts.dec) : '<span class="nada">—</span>') + '</td>';
    };
    el.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Período</th>' +
      series.map(function (s) { return '<th>' + esc(s.nome) + '</th>'; }).join('') +
      (series.length > 1 ? '<th>Total</th>' : '') + '</tr></thead><tbody>' +
      rotulos.map(function (r, i) {
        var soma = series.reduce(function (a, s) { return a + (s.valores[i] || 0); }, 0);
        return '<tr data-foco data-rot="' + esc(r) + '"><td class="forte">' + esc(r) + '</td>' +
          series.map(function (s) { return cel(s.valores[i]); }).join('') +
          (series.length > 1 ? '<td class="num forte">' + num(soma, opts.dec) + '</td>' : '') + '</tr>';
      }).join('') +
      '<tr><td class="forte">Total</td>' +
      tot.map(function (v) { return '<td class="num forte">' + num(v, opts.dec) + '</td>'; }).join('') +
      (series.length > 1 ? '<td class="num forte">' + num(tot.reduce(function (a, v) { return a + v; }, 0), opts.dec) + '</td>' : '') +
      '</tr></tbody></table></div>';
    clicavel(el, opts);
  }

  /* ------------------------------------------------------------- despachantes */
  var CAT = { barras: barras, colunas: colunas, rosca: rosca, pizza: pizza, tabela: tabela };
  var SER = { linha: linhas, area: area, colunas: colunasSerie, tabela: tabelaSerie };

  global.G = {
    barras: barras, colunas: colunas, rosca: rosca, pizza: pizza, tabela: tabela,
    linhas: linhas, area: area, colunasSerie: colunasSerie, tabelaSerie: tabelaSerie,
    categorico: function (tipo, el, dados, opts) { (CAT[tipo] || barras)(el, dados, opts); },
    serie: function (tipo, el, rotulos, series, opts) { (SER[tipo] || linhas)(el, rotulos, series, opts); },
    tiposCategoricos: Object.keys(CAT), tiposSerie: Object.keys(SER),
    cores: paleta, num: num, esc: esc, vazio: vazio
  };
})(window);
