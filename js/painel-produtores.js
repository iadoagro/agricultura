/* Aba "Produtor" (ficha + recorrência): perfil de recorrência dos produtores (nomes só para quem está logado).
   - recorrência: quantos atendimentos cada produtor teve na seleção (gráfico);
   - não voltaram: atendidos no ano anterior ao escolhido e sem atendimento no ano escolhido (tabela).
   Identidade do produtor = nome normalizado (a mesma regra de todo o painel). Usa window.PAINEL_API. */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A || A.modoPublico()) return;
  var G = A.G;

  function el(id) { return document.getElementById(id); }
  function dataBR(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }

  function agrupar(D) {
    var m = new Map();
    D.forEach(function (r) {
      var k = A.chaveProdutor(r);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  }

  function desenhar(C) {
    var dist = new Map();
    agrupar(C.D).forEach(function (lista) {
      var c = lista.length;
      var chave = c >= 4 ? '4 ou mais' : c + (c === 1 ? ' atendimento' : ' atendimentos');
      dist.set(chave, (dist.get(chave) || 0) + 1);
    });

    // não voltaram: ano escolhido (ou o mais recente) × ano anterior, com os demais filtros
    var anos = A.anos();
    var F = A.filtros();
    var anoA = (F.ano && F.ano[0]) || anos[0];
    var anoB = anos[anos.indexOf(anoA) + 1];
    var nao = [];
    if (anoA && anoB) {
      var atual = agrupar(A.filtrar(null, anoA)), anterior = agrupar(A.filtrar(null, anoB));
      anterior.forEach(function (lista, k) {
        if (atual.has(k)) return;
        var ord = lista.slice().sort(function (a, b) { return A.dataRef(a) < A.dataRef(b) ? 1 : -1; });
        nao.push({ nome: ord[0].prod, mun: ord[0].mun, ultima: A.dataRef(ord[0]), servico: ord[0].pc, n: lista.length });
      });
      nao.sort(function (a, b) { return b.n - a.n || (a.ultima < b.ultima ? 1 : -1); });
    }

    var ordem = ['1 atendimento', '2 atendimentos', '3 atendimentos', '4 ou mais'];
    var linhas = ordem.filter(function (k) { return dist.has(k); }).map(function (k) { return { rot: k, val: dist.get(k) }; });
    A.pintarCat('gProdRec', linhas, { cor: 'var(--s3)' });

    var alvo = el('tProdNao');
    if (!nao.length) {
      alvo.innerHTML = '<p class="vazio">' + (anoB ? 'Todos os produtores atendidos em ' + G.esc(anoB) + ' voltaram em ' + G.esc(anoA) + ' (nos filtros atuais).' : 'Sem ano anterior para comparar.') + '</p>';
      return;
    }
    alvo.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Produtor</th><th>Município</th><th>Último serviço</th><th>Último atendimento</th><th>Atendimentos em ' +
      G.esc(anoB) + '</th></tr></thead><tbody>' + nao.slice(0, 500).map(function (x) {
        return '<tr><td class="forte">' + G.esc(x.nome) + '</td><td>' + G.esc(x.mun || '—') + '</td><td>' + G.esc(x.servico || '—') +
          '</td><td class="num">' + dataBR(x.ultima) + '</td><td class="num">' + G.num(x.n) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (nao.length > 500 ? '<p class="cmp-nota">Mostrando os 500 primeiros de ' + G.num(nao.length) + '. Refine os filtros para ver os demais.</p>' : '');
  }

  // vive dentro da aba "Produtor" (antes Beneficiário): js/dashboard.js chama isto ao desenhá-la
  window.PAINEL_PRODUTORES_DESENHAR = desenhar;
})();
