(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var lista = document.getElementById('listaUsuarios');
  var msg = document.getElementById('adminMsg');
  var aviso = document.getElementById('avisoAcesso');
  var painel = document.getElementById('painelUsuarios');
  var formNovo = document.getElementById('formNovo');
  var novoNome = document.getElementById('novoNome');
  var novoSobrenome = document.getElementById('novoSobrenome');
  var novoLogin = document.getElementById('novoLogin');
  var busca = document.getElementById('usuariosBusca');
  var situacao = document.getElementById('usuariosSituacao');
  var contagem = document.getElementById('usuariosContagem');
  var DOMINIO_USUARIO = '@sistema.local';
  var linhas = [];

  function atualizarPreviaLogin() { novoLogin.value = auth.previewLogin(novoNome.value, novoSobrenome.value); }
  novoNome.addEventListener('input', atualizarPreviaLogin);
  novoSobrenome.addEventListener('input', atualizarPreviaLogin);

  function escapar(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }
  function rotuloStatus(s) { return s === 'pendente' ? 'Pendente' : s === 'aprovado' ? 'Aprovado' : 'Recusado'; }
  function mostrarLogin(email) { return email.toLowerCase().endsWith(DOMINIO_USUARIO) ? email.slice(0, -DOMINIO_USUARIO.length) : email; }

  function render() {
    var termo = busca.value.trim().toLowerCase();
    var filtro = situacao.value;
    var visiveis = linhas.filter(function (l) {
      return (!termo || l.email.toLowerCase().indexOf(termo) >= 0) && (!filtro || l.status === filtro);
    });
    contagem.textContent = visiveis.length + ' de ' + linhas.length + (linhas.length === 1 ? ' usuário' : ' usuários');
    lista.innerHTML = '';
    if (!visiveis.length) {
      lista.innerHTML = '<li class="vazio">' + (linhas.length ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado ainda.') + '</li>';
      return;
    }
    visiveis.slice().reverse().forEach(function (l) {
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
      botoes.push('<button type="button" class="editar" data-acao="editar">Editar login/e-mail</button>');
      botoes.push('<button type="button" class="excluir" data-acao="excluir">Excluir</button>');
      li.innerHTML =
        '<div class="sol-info"><strong>' + escapar(mostrarLogin(l.email)) + '</strong></div>' +
        '<div class="sol-situacao"><span class="sol-status ' + escapar(l.status) + '">' + rotuloStatus(l.status) + '</span>' +
        '<span class="sol-status ' + (ativo ? 'ativo' : 'inativo') + '">' + (ativo ? 'Ativo' : 'Desativado') + '</span></div>' +
        '<div class="sol-acoes" data-id="' + escapar(l.id) + '" data-email="' + escapar(l.email) + '">' + botoes.join('') + '</div>';
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
    else if (acao === 'redefinir') {
      if (email.toLowerCase().endsWith(DOMINIO_USUARIO)) { msg.textContent = 'Esse login não tem e-mail de verdade — peça pro responsável excluir e cadastrar de novo se precisar trocar a senha.'; msg.className = 'admin-msg erro'; return; }
      tarefa = function () { return auth.redefinirSenha(email).then(function () { return 'E-mail de redefinição de senha enviado para ' + email + '.'; }); };
    } else if (acao === 'editar') {
      var atual = mostrarLogin(email);
      var novo = window.prompt('Novo login (nome.sobrenome) ou e-mail para ' + atual + ':', atual);
      if (!novo || novo === atual) return;
      novo = novo.trim();
      var novoEmail = novo.indexOf('@') !== -1 ? novo : novo.toLowerCase() + DOMINIO_USUARIO;
      tarefa = function () { return auth.editarEmail(id, novoEmail).then(function () { return 'Login/e-mail atualizado.'; }); };
    } else if (acao === 'excluir') {
      if (!window.confirm('Excluir a conta de ' + mostrarLogin(email) + ' de vez? Essa ação não pode ser desfeita.')) return;
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
    var botao = formNovo.querySelector('button[type="submit"]'); botao.disabled = true;
    msg.textContent = 'Aguarde…'; msg.className = 'admin-msg';
    var nome = novoNome.value.trim();
    var sobrenome = novoSobrenome.value.trim();
    auth.cadastrarUsuario(nome, sobrenome)
      .then(function (r) {
        if (r.aviso) { msg.textContent = r.aviso; msg.className = 'admin-msg erro'; }
        else { msg.textContent = 'Usuário cadastrado e aprovado. Login: ' + r.login + ' — senha: ' + auth.SENHA_PADRAO + '. Informe pra pessoa; ela vai ser obrigada a trocar no primeiro acesso.'; msg.className = 'admin-msg'; }
        formNovo.reset(); novoLogin.value = ''; carregar();
      })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'admin-msg erro'; })
      .finally(function () { botao.disabled = false; });
  });

  function carregar() {
    auth.listarSolicitacoes().then(function (dados) {
      linhas = dados.filter(function (l) { return l.email.toLowerCase() !== auth.RESPONSAVEL_EMAIL; });
      render();
    }).catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; });
  }

  busca.addEventListener('input', render);
  situacao.addEventListener('change', render);

  if (!auth || !auth.online || auth.papel() !== 'responsavel') {
    aviso.hidden = false;
    painel.hidden = true;
    contagem.hidden = true;
  } else {
    carregar();
  }
})();
