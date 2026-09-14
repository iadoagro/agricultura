(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var loginBtn = document.getElementById('adminLoginBtn');
  var cardUsuarios = document.getElementById('cardUsuarios');
  var cardAcessos = document.getElementById('cardAcessos');
  var cartoes = document.querySelectorAll('.card-link[data-chave]');

  function aplicar() {
    var responsavel = Boolean(auth) && auth.papel() === 'responsavel';
    cardUsuarios.hidden = !responsavel;
    cardAcessos.hidden = !responsavel;
    cartoes.forEach(function (a) {
      a.hidden = !auth || !auth.podeAcessar(a.dataset.chave);
    });
  }

  loginBtn.addEventListener('click', function () {
    if (!auth) return;
    auth.sair().then(function () { location.href = 'admin-login.html'; });
  });

  window.addEventListener('admin-auth-atualizado', aplicar);
  aplicar();
})();
