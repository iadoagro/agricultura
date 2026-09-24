/* Troca da própria senha — obrigatória no 1º acesso (senha temporária) ou
   por escolha, como o cadastro de PIN oferecido depois do login
   (admin-trocar-senha.html?modo=pin, js/admin-login.js). O seletor
   Senha | PIN, os quadrados do PIN e a lista de requisitos são de
   js/senha-regras.js. */
(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var R = window.SENHA_REGRAS;
  var form = document.getElementById('formTrocar');
  var msg = document.getElementById('adminMsg');
  var pedidoPin = /[?&]modo=pin(&|$)/.test(location.search);
  var obrigatoria = auth && auth.deveTrocarSenha && auth.deveTrocarSenha();

  var campo = R ? R.campos([document.getElementById('senha1'), document.getElementById('senha2')],
    { regras: true, modo: pedidoPin ? 'pin' : (obrigatoria ? undefined : 'senha') }) : null;

  function textos() {
    var pin = campo && campo.modo() === 'pin';
    document.getElementById('trocaSubtitulo').textContent = pin ? 'Cadastrar PIN' : 'Trocar senha';
    document.getElementById('trocaTexto').textContent = obrigatoria
      ? 'Sua conta foi cadastrada com uma senha temporária. Escolha uma nova senha ou um PIN de 6 números para continuar.'
      : pin ? 'Escolha um PIN de 6 números. Ele passa a ser a sua senha de acesso: a senha atual deixa de valer.'
        : 'Escolha a nova senha de acesso.';
    document.getElementById('rotuloSenha1').textContent = pin ? 'Novo PIN' : 'Nova senha';
    document.getElementById('rotuloSenha2').textContent = pin ? 'Confirmar PIN' : 'Confirmar nova senha';
    document.getElementById('trocaBotao').textContent = pin ? 'Salvar PIN' : 'Trocar senha';
  }
  textos();
  form.addEventListener('click', function (e) { if (e.target.closest('.senha-modo')) setTimeout(textos, 0); });

  // mensagem de erro antiga some quando a pessoa volta a digitar
  form.addEventListener('input', function () { if (msg.className.indexOf('erro') >= 0) { msg.textContent = ''; msg.className = 'admin-msg'; } });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var senha1 = document.getElementById('senha1').value;
    var senha2 = document.getElementById('senha2').value;
    var modo = campo ? campo.modo() : undefined;
    var regra = R && R.avaliar(senha1, modo);
    if (regra && !regra.ok) { msg.textContent = regra.erro; msg.className = 'admin-msg erro'; return; }
    if (senha1 !== senha2) { msg.textContent = modo === 'pin' ? 'Os PINs não são iguais.' : 'As senhas não são iguais.'; msg.className = 'admin-msg erro'; return; }
    var botao = form.querySelector('button[type="submit"]'); botao.disabled = true;
    msg.textContent = 'Aguarde…'; msg.className = 'admin-msg';
    auth.alterarPropriaSenha(senha1)
      .then(function () {
        if (campo) campo.guardar();   // o login abre no mesmo modo (PIN ou senha)
        location.href = 'index.html';
      })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'admin-msg erro'; botao.disabled = false; });
  });
})();
