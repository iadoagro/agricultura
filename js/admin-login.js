(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var msg = document.getElementById('adminMsg');
  var linkParaCadastro = document.getElementById('linkParaCadastro');
  var linkParaEntrar = document.getElementById('linkParaEntrar');
  var formCadastrar = document.getElementById('formCadastrar');
  var formEntrar = document.getElementById('formEntrar');
  var painelStatus = document.getElementById('painelStatus');
  var painelFormularios = document.getElementById('painelFormularios');
  var statusTexto = document.getElementById('statusTexto');

  function limparMsg() { msg.textContent = ''; msg.className = 'admin-msg'; }
  function mostrarErro(texto) { msg.textContent = texto; msg.className = 'admin-msg erro'; }
  function mostrarOk(texto) { msg.textContent = texto; msg.className = 'admin-msg'; }

  if (!auth || !auth.online) {
    mostrarErro('O banco online ainda não foi configurado.');
    painelFormularios.hidden = true;
    return;
  }

  function redirecionar() { location.href = 'index.html'; }

  function avaliarSessao() {
    var papel = auth.papel();
    if (!auth.sessaoAtual()) { painelStatus.hidden = true; painelFormularios.hidden = false; return; }
    if (papel === 'responsavel' || papel === 'aprovado') { redirecionar(); return; }
    painelFormularios.hidden = true;
    painelStatus.hidden = false;
    if (papel === 'pendente') statusTexto.textContent = 'Seu cadastro ainda está aguardando aprovação do responsável.';
    else if (papel === 'recusado') statusTexto.textContent = 'Seu cadastro foi recusado pelo responsável.';
    else statusTexto.textContent = 'Verificando seu cadastro…';
  }

  document.getElementById('statusSair').addEventListener('click', function () {
    auth.sair().then(avaliarSessao);
  });

  function mostrar(aba) {
    var cad = aba === 'cadastrar';
    formCadastrar.hidden = !cad; formEntrar.hidden = cad;
    limparMsg();
  }
  linkParaCadastro.addEventListener('click', function (e) { e.preventDefault(); mostrar('cadastrar'); });
  linkParaEntrar.addEventListener('click', function (e) { e.preventDefault(); mostrar('entrar'); });

  formCadastrar.addEventListener('submit', function (e) {
    e.preventDefault();
    var botao = formCadastrar.querySelector('button'); botao.disabled = true;
    limparMsg();
    auth.cadastrar(document.getElementById('cadEmail').value.trim(), document.getElementById('cadSenha').value)
      .then(function (texto) {
        mostrarOk(texto);
        formCadastrar.reset();
        avaliarSessao();
      })
      .catch(function (err) { mostrarErro(err.message); })
      .finally(function () { botao.disabled = false; });
  });

  formEntrar.addEventListener('submit', function (e) {
    e.preventDefault();
    var botao = formEntrar.querySelector('button'); botao.disabled = true;
    limparMsg();
    auth.entrar(document.getElementById('entEmail').value.trim(), document.getElementById('entSenha').value)
      .then(avaliarSessao)
      .catch(function (err) { mostrarErro(err.message); })
      .finally(function () { botao.disabled = false; });
  });

  window.addEventListener('admin-auth-atualizado', avaliarSessao);
  mostrar('entrar');
  avaliarSessao();
})();
