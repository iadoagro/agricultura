/* Aba "Tendências": série histórica multi-ano (mês a mês), sazonalidade e projeção do fim do ano.
   - o mês de um registro é o da data de referência (vistoria plausível, senão lançamento), dentro do
     exercício (mesma regra do resto do painel);
   - sazonalidade = participação média de cada mês no total dos anos COMPLETOS (anos anteriores ao corrente);
   - projeção do ano corrente = realizado ÷ participação acumulada esperada até agora (com o mês em curso
     contado de forma proporcional); sem ano completo na base, cai para o ritmo linear.
   Respeita os filtros da lateral, exceto o Período (esta aba usa todos os anos). Usa window.PAINEL_API. */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A) return;
  var G = A.G;
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var METRICAS = {
    n: { rot: 'Atendimentos', dec: 0, un: '', f: function () { return 1; } },
    ha: { rot: 'Hectares mecanizados', dec: 1, un: 'ha', f: function (r) { return r.pc === A.MEC ? (r.ha || 0) : 0; } },
    hrs: { rot: 'Horas de máquina', dec: 1, un: 'h', f: function (r) { return r.hrs || 0; } },
    ac: { rot: 'Tanques / açudes', dec: 0, un: '', f: function (r) { return r.ac || 0; } }
  };
  var ESTADO = { m: 'n' };

  function el(id) { return document.getElementById(id); }

  function porAnoMes(D, f) {
    var m = {};
    D.forEach(function (r) {
      var ano = A.anoDe(r), mes = +A.dataRef(r).slice(5, 7) - 1;
      if (mes < 0 || mes > 11) return;
      if (!m[ano]) m[ano] = new Array(12).fill(0);
      m[ano][mes] += f(r);
    });
    return m;
  }

  function desenhar() {
    var met = METRICAS[ESTADO.m];
    // esta aba ignora o filtro de período: usa todos os anos e aplica os demais filtros da lateral
    var D;
    var F = A.filtros();
    var todos = A.registros().filter(function (r) {
      // aplica os demais filtros da lateral (mesma lógica de filtrar, sem o ano)
      if (F.mes.length && F.mes.indexOf(A.dataRef(r).slice(5, 7)) < 0) return false;
      if (F.pc.length && F.pc.indexOf(r.pc) < 0) return false;
      if (F.reg.length && F.reg.indexOf(A.regionalDe(r.mun)) < 0) return false;
      if (F.mun.length && F.mun.indexOf(r.mun) < 0) return false;
      if (F.esc.length && F.esc.indexOf(r.esc) < 0) return false;
      if (F.tec.length && F.tec.indexOf(r.rt) < 0) return false;
      if (F.cult.length && !r.cult.some(function (c) { return F.cult.indexOf(c[0]) >= 0; })) return false;
      return true;
    });
    D = todos;
    var mapa = porAnoMes(D, met.f);
    var anos = Object.keys(mapa).sort();
    var hoje = new Date(), anoCorr = String(hoje.getFullYear());
    var completos = anos.filter(function (a) { return a < anoCorr; });

    // ---- série mês a mês, uma linha por ano
    var series = anos.map(function (a, i) {
      return { nome: a, slot: i % 5, valores: mapa[a].map(function (v, k) {
        // meses ainda por vir no ano corrente ficam em branco
        if (a === anoCorr && k > hoje.getMonth()) return null;
        return v || null;
      }) };
    });
    var subMes = el('tendSubMes');
    if (subMes) subMes.textContent = met.rot + ' em cada mês, ano a ano.';
    if (series.length) A.pintarSerie('gTendMes', MESES, series, { dec: met.dec });
    else if (G.vazio) G.vazio(el('gTendMes'));

    // ---- sazonalidade: participação média de cada mês nos anos completos
    var part = new Array(12).fill(0), usados = 0;
    completos.forEach(function (a) {
      var tot = mapa[a].reduce(function (x, y) { return x + y; }, 0);
      if (tot <= 0) return;
      usados++;
      mapa[a].forEach(function (v, k) { part[k] += v / tot; });
    });
    if (usados) part = part.map(function (v) { return v / usados * 100; });
    if (usados) {
      A.pintarSerie('gTendSaz', MESES, [{ nome: 'Participação média no ano (%)', slot: 0, valores: part.map(function (v) { return +v.toFixed(1); }) }], { dec: 1 });
    } else if (G.vazio) G.vazio(el('gTendSaz'));

    // ---- projeção do ano corrente
    var kp = [{ _sec: 'Ano corrente (' + anoCorr + ')' }];
    if (mapa[anoCorr]) {
      var vals = mapa[anoCorr], real = vals.reduce(function (x, y) { return x + y; }, 0);
      var mesAtual = hoje.getMonth();
      var diasNoMes = new Date(hoje.getFullYear(), mesAtual + 1, 0).getDate();
      var fracMes = hoje.getDate() / diasNoMes;
      var esperado;   // participação acumulada esperada até agora, em %
      if (usados) {
        esperado = 0;
        for (var k = 0; k < mesAtual; k++) esperado += part[k];
        esperado += part[mesAtual] * fracMes;
      } else {
        esperado = (mesAtual + fracMes) / 12 * 100;
      }
      var proj = esperado > 5 ? real / (esperado / 100) : null;
      var ant = mapa[String(+anoCorr - 1)], totAnt = ant ? ant.reduce(function (x, y) { return x + y; }, 0) : null;
      kp.push({ rot: 'Realizado no ano', val: G.num(real, met.dec), un: met.un, sub: G.num(esperado, 0) + '% do ano esperado até hoje' });
      kp.push({ rot: 'Projeção do fim do ano', val: proj == null ? '—' : G.num(proj, met.dec), un: proj == null ? '' : met.un,
        sub: usados ? 'pela sazonalidade de ' + usados + ' ano(s) completo(s)' : 'ritmo linear (sem ano completo)' });
      if (totAnt != null) {
        var d = proj != null && totAnt ? (proj / totAnt - 1) * 100 : null;
        kp.push({ rot: 'Total do ano anterior', val: G.num(totAnt, met.dec), un: met.un,
          sub: d == null ? '' : 'projeção ' + (d >= 0 ? '+' : '') + G.num(d, 0) + '% sobre ele' });
      }
    } else {
      kp.push({ rot: 'Sem dados do ano corrente', val: '—', sub: 'nos filtros atuais' });
    }
    A.tiles('kpisTend', kp);

    // ---- tabela ano × mês
    var alvo = el('tTend');
    if (alvo) {
      alvo.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Ano</th>' +
        MESES.map(function (m) { return '<th>' + m + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>' +
        anos.slice().reverse().map(function (a) {
          var t = mapa[a].reduce(function (x, y) { return x + y; }, 0);
          return '<tr><td class="forte">' + a + '</td>' + mapa[a].map(function (v) {
            return '<td class="num">' + (v ? G.num(v, met.dec) : '<span class="nada">—</span>') + '</td>';
          }).join('') + '<td class="num"><b>' + G.num(t, met.dec) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
  }

  var seletor = el('tendMetrica');
  if (seletor) seletor.addEventListener('change', function () { ESTADO.m = seletor.value; desenhar(); });

  A.registrarAba('tendencias', function () { desenhar(); });
})();
