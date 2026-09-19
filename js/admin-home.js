(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var loginBtn = document.getElementById('adminLoginBtn');
  var cardUsuarios = document.getElementById('cardUsuarios');
  var cardAcessos = document.getElementById('cardAcessos');
  var cartoes = document.querySelectorAll('.card-link[data-chave]');

  /* Quem tem acesso a um único módulo vai direto para ele, sem passar pela lista.
     Só acontece uma vez por login: o "Início" dentro do módulo volta para esta tela
     (que então mostra o cartão único e o botão Sair), em vez de prender a pessoa. */
  var MARCA = 'seagri_home_direto';
  function irDireto() {
    if (!auth || !auth.liberado || !auth.liberado() || auth.deveTrocarSenha()) return;
    var visiveis = [cardUsuarios, cardAcessos].concat(Array.prototype.slice.call(cartoes)).filter(function (a) { return !a.hidden; });
    if (visiveis.length !== 1) return;
    var quem = (auth.sessaoAtual() && auth.sessaoAtual().user && auth.sessaoAtual().user.id) || '1';
    try {
      if (sessionStorage.getItem(MARCA) === quem) return;
      sessionStorage.setItem(MARCA, quem);
    } catch (e) { return; }
    location.replace(visiveis[0].getAttribute('href'));
  }

  function aplicar() {
    var responsavel = Boolean(auth) && auth.papel() === 'responsavel';
    cardUsuarios.hidden = !responsavel;
    cardAcessos.hidden = !responsavel;
    cartoes.forEach(function (a) {
      a.hidden = !auth || !auth.podeAcessar(a.dataset.chave);
    });
    irDireto();
  }

  loginBtn.addEventListener('click', function () {
    if (!auth) return;
    try { sessionStorage.removeItem(MARCA); } catch (e) {}
    auth.sair().then(function () { location.href = 'admin-login.html'; });
  });

  window.addEventListener('admin-auth-atualizado', aplicar);
  aplicar();
})();
