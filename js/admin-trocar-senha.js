(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var form = document.getElementById('formTrocar');
  var msg = document.getElementById('adminMsg');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var senha1 = document.getElementById('senha1').value;
    var senha2 = document.getElementById('senha2').value;
    if (senha1 !== senha2) { msg.textContent = 'As senhas não são iguais.'; msg.className = 'admin-msg erro'; return; }
    var botao = form.querySelector('button'); botao.disabled = true;
    msg.textContent = 'Aguarde…'; msg.className = 'admin-msg';
    auth.alterarPropriaSenha(senha1)
      .then(function () { location.href = 'index.html'; })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'admin-msg erro'; botao.disabled = false; });
  });
})();
