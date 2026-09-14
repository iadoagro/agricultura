(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var lista = document.getElementById('listaUsuarios');
  var msg = document.getElementById('adminMsg');
  var aviso = document.getElementById('avisoAcesso');
  var painel = document.getElementById('painelUsuarios');
  var formNovo = document.getElementById('formNovo');

  function escapar(s) { return s.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }
  function rotuloStatus(s) { return s === 'pendente' ? 'Pendente' : s === 'aprovado' ? 'Aprovado' : 'Recusado'; }

  function render(linhas) {
    linhas = linhas.filter(function (l) { return l.email.toLowerCase() !== auth.RESPONSAVEL_EMAIL; });
    lista.innerHTML = '';
    if (!linhas.length) { lista.innerHTML = '<li class="vazio">Nenhum usuário cadastrado ainda.</li>'; return; }
    linhas.slice().reverse().forEach(function (l) {
      var li = document.createElement('li');
      var ativo = l.ativo !== false;
      var botoes = [];
      if (l.status === 'pendente') {
        botoes.push('<button type="button" class="aprovar" data-acao="aprovar">Aprovar</button>');
        botoes.push('<button type="button" class="recusar" data-acao="recusar">Recusar</button>');
      }
      if (l.status === 'aprovado') {
        botoes.push(ativo
          ? '<button type="button" class="desativar" data-acao="desativar">Desativar</button>'
          : '<button type="button" class="ativar" data-acao="ativar">Reativar</button>');
      }
      botoes.push('<button type="button" class="redefinir" data-acao="redefinir">Redefinir senha</button>');
      botoes.push('<button type="button" class="editar" data-acao="editar">Editar e-mail</button>');
      botoes.push('<button type="button" class="excluir" data-acao="excluir">Excluir</button>');
      li.innerHTML =
        '<div class="sol-info"><strong>' + escapar(l.email) + '</strong>' +
        '<span><span class="sol-status ' + l.status + '">' + rotuloStatus(l.status) + '</span> ' +
        '<span class="sol-status ' + (ativo ? 'ativo' : 'inativo') + '">' + (ativo ? 'Ativo' : 'Desativado') + '</span></span></div>' +
        '<div class="sol-acoes" data-id="' + l.id + '" data-email="' + escapar(l.email) + '">' + botoes.join('') + '</div>';
      lista.appendChild(li);
    });
    lista.querySelectorAll('.sol-acoes').forEach(function (bloco) {
      bloco.querySelectorAll('button').forEach(function (botao) {
        botao.addEventListener('click', function () { executar(bloco, botao); });
      });
    });
  }

  function executar(bloco, botao) {
    var id = bloco.dataset.id, email = bloco.dataset.email, acao = botao.dataset.acao;
    var tarefa;
    if (acao === 'aprovar') tarefa = function () { return auth.decidir(id, true).then(function () { return 'Usuário aprovado.'; }); };
    else if (acao === 'recusar') tarefa = function () { return auth.decidir(id, false).then(function () { return 'Cadastro recusado.'; }); };
    else if (acao === 'ativar') tarefa = function () { return auth.definirAtivo(id, true).then(function () { return 'Usuário reativado.'; }); };
    else if (acao === 'desativar') tarefa = function () { return auth.definirAtivo(id, false).then(function () { return 'Usuário desativado.'; }); };
    else if (acao === 'redefinir') tarefa = function () { return auth.redefinirSenha(email).then(function () { return 'E-mail de redefinição de senha enviado para ' + email + '.'; }); };
    else if (acao === 'editar') {
      var novoEmail = window.prompt('Novo e-mail para ' + email + ':', email);
      if (!novoEmail || novoEmail === email) return;
      tarefa = function () { return auth.editarEmail(id, novoEmail.trim()).then(function () { return 'E-mail atualizado.'; }); };
    } else if (acao === 'excluir') {
      if (!window.confirm('Excluir a conta de ' + email + ' de vez? Essa ação não pode ser desfeita.')) return;
      tarefa = function () { return auth.excluirUsuario(id).then(function () { return 'Usuário excluído.'; }); };
    } else return;

    bloco.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    msg.textContent = 'Aguarde…'; msg.className = 'admin-msg';
    tarefa()
      .then(function (texto) { msg.textContent = texto; carregar(); })
      .catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; bloco.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); });
  }

  formNovo.addEventListener('submit', function (e) {
    e.preventDefault();
    var botao = formNovo.querySelector('button'); botao.disabled = true;
    msg.textContent = 'Aguarde…'; msg.className = 'admin-msg';
    var email = document.getElementById('novoEmail').value.trim();
    var senha = document.getElementById('novaSenha').value;
    auth.cadastrarUsuario(email, senha)
      .then(function () { msg.textContent = 'Usuário cadastrado e aprovado.'; formNovo.reset(); carregar(); })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'admin-msg erro'; })
      .finally(function () { botao.disabled = false; });
  });

  function carregar() {
    auth.listarSolicitacoes().then(render).catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; });
  }

  if (!auth || !auth.online || auth.papel() !== 'responsavel') {
    aviso.hidden = false;
    painel.hidden = true;
  } else {
    carregar();
  }
})();
