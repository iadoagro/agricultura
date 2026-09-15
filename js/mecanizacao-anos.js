/* Atalhos por exercício do painel da mecanização — SEAGRI
   Um quadrado por ano e um que abre todos juntos. Os anos não são fixos aqui:
   saem da mesma base que o painel lê, senão a página passaria a mentir no dia
   em que a planilha ganhasse um exercício novo. */
(function () {
  var CHAVE_LOCAL = 'seagri_mecanizacao';
  var grade = document.getElementById('grade');

  function anoDe(r) { return r.ex || r.d.slice(0, 4); }

  function num(n) { return n.toLocaleString('pt-BR'); }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Mesma cadeia do painel: o que o admin publicou vale mais que o embutido.
     Sem isso a lista de anos poderia divergir do painel que ela abre. */
  function carregarDados() {
    return fetch('../data/mecanizacao.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('sem arquivo publicado');
        return r.json();
      })
      .then(function (j) {
        if (!j || !Array.isArray(j.registros) || !j.registros.length) throw new Error('vazio');
        return j;
      })
      .catch(function () {
        try {
          var s = localStorage.getItem(CHAVE_LOCAL);
          if (s) {
            var j = JSON.parse(s);
            if (j && Array.isArray(j.registros) && j.registros.length) return j;
          }
        } catch (e) { /* modo privado ou JSON corrompido */ }
        return window.DADOS_MECANIZACAO;
      });
  }

  /* O pacote do ano corrente manda no ano dele: se a planilha nova já traz
     2026, o 2026 do histórico é descartado em vez de somar duas vezes. */
  function todosRegistros(pacote) {
    var h = window.DADOS_MECANIZACAO_HISTORICO;
    var atuais = pacote.registros;
    if (!h || !Array.isArray(h.registros)) return atuais;
    var noPacote = {};
    atuais.forEach(function (r) { noPacote[anoDe(r)] = true; });
    return h.registros.filter(function (r) { return !noPacote[anoDe(r)]; }).concat(atuais);
  }

  function quadrado(href, icone, titulo, sub, destaque) {
    return '<a href="' + href + '" class="card-link">' +
      '<div class="card' + (destaque ? ' card-destaque' : '') + '">' +
      '<span class="card-icon">' + icone + '</span>' +
      '<h2>' + esc(titulo) + '</h2>' +
      '<p>' + esc(sub) + '</p>' +
      '</div></a>';
  }

  function desenhar(registros) {
    var conta = {};
    registros.forEach(function (r) {
      var a = anoDe(r);
      conta[a] = (conta[a] || 0) + 1;
    });
    var anos = Object.keys(conta).sort().reverse();   // do mais recente para o mais antigo

    if (!anos.length) {
      grade.innerHTML = '<p class="grade-aviso">Nenhum exerc&iacute;cio encontrado na base.</p>';
      return;
    }

    // o ano escolhido segue para a página de seções, que o repassa ao painel
    var html = anos.map(function (a) {
      return quadrado('mecanizacao-secoes.html?ano=' + encodeURIComponent(a),
        '&#128197;', a, num(conta[a]) + (conta[a] === 1 ? ' vistoria' : ' vistorias'));
    });
    // "todos" é o consolidado que o painel já entende na URL
    html.push(quadrado('mecanizacao-secoes.html?ano=todos', '&#023782;', 'Todos os anos',
      num(registros.length) + ' vistorias', true));

    grade.innerHTML = html.join('');
  }

  carregarDados().then(function (pacote) {
    if (!pacote || !Array.isArray(pacote.registros)) {
      grade.innerHTML = '<p class="grade-aviso">N&atilde;o foi poss&iacute;vel carregar os dados da mecaniza&ccedil;&atilde;o.</p>';
      return;
    }
    desenhar(todosRegistros(pacote));
  });
})();
