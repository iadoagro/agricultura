(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var loginBtn = document.getElementById('adminLoginBtn');
  var cardUsuarios = document.getElementById('cardUsuarios');
  var cardBairros = document.getElementById('cardBairros');
  var cardLogs = document.getElementById('cardLogs');
  var cartoes = document.querySelectorAll('.card-link[data-chave]');

  /* Quem tem acesso a um único módulo vai sempre direto para ele: esta tela
     só teria um cartão. Dentro do módulo a trilha não mostra "Início" (ver
     js/nav.js) e o Sair fica na barra do topo, então ninguém fica preso. */
  var MARCA = 'seagri_home_direto';   // não é mais usada; o Sair antigo ainda limpa
  function irDireto() {
    if (!auth || !auth.liberado || !auth.liberado() || auth.deveTrocarSenha()) return;
    var visiveis = [cardUsuarios, cardBairros, cardLogs].concat(Array.prototype.slice.call(cartoes)).filter(function (a) { return !a.hidden; });
    if (visiveis.length !== 1) return;
    location.replace(visiveis[0].getAttribute('href'));
  }

  function aplicar() {
    var responsavel = Boolean(auth) && auth.papel() === 'responsavel';
    cardUsuarios.hidden = !responsavel;
    cardBairros.hidden = !responsavel;
    cardLogs.hidden = !responsavel;
    cartoes.forEach(function (a) {
      a.hidden = !auth || !auth.podeAcessar(a.dataset.chave);
    });
    irDireto();
  }

  // O "Sair" agora fica na barra de navegação (js/nav.js), que também limpa
  // MARCA; este só existe se alguma página ainda tiver o botão antigo.
  if (loginBtn) loginBtn.addEventListener('click', function () {
    if (!auth) return;
    try { sessionStorage.removeItem(MARCA); } catch (e) {}
    auth.sair().then(function () { location.href = 'admin-login.html'; });
  });

  window.addEventListener('admin-auth-atualizado', aplicar);
  aplicar();
})();
