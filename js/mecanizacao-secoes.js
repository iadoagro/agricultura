/* Segundo nível de quadrados da mecanização — SEAGRI
   O exercício já foi escolhido na página anterior e vem na URL (?ano=2024, ou
   ?ano=todos para o consolidado). Aqui ele só é repassado adiante: cada
   quadrado abre o painel na sua seção, já filtrado por aquele ano. */
(function () {
  var CONSOLIDADO = 'todos';

  function anoDaUrl() {
    var m = /[?&]ano=([^&]*)/.exec(location.search);
    return m ? decodeURIComponent(m[1]).trim() : '';
  }

  var ano = anoDaUrl();

  /* Sem ano na URL a página ainda funciona: os quadrados abrem o painel no
     exercício que ele já escolhe sozinho. É o que acontece se alguém salvar
     este endereço nos favoritos sem o parâmetro. */
  if (ano) {
    document.querySelectorAll('#grade .card-link').forEach(function (a) {
      if (a.id === 'cardCadastroMecanizacao') return;
      a.href = 'dashboard.html#' + a.getAttribute('data-aba') +
        '?ano=' + encodeURIComponent(ano);
    });
    document.getElementById('sub').textContent = ano === CONSOLIDADO
      ? 'Todos os anos · escolha a seção'
      : 'Exercício de ' + ano + ' · escolha a seção';
    // o "voltar" leva aos anos, onde a escolha foi feita
    var voltar = document.querySelector('.voltar-btn');
    if (voltar) voltar.href = 'mecanizacao.html';
  }

  var cadastro = document.getElementById('cardCadastroMecanizacao');
  if (cadastro) cadastro.hidden = ano !== '2026';
})();
