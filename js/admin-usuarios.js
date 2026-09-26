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
  // Acessos (antes numa tela à parte, admin-permissoes.html): clicar na
  // pessoa abre as páginas liberadas pra ela. Fiscais é sempre liberado
  // (auth.SEMPRE_LIBERADAS), então aparece marcado e travado.
  var PAGINAS = [['eleicoes', 'Fiscais'], ['portarias', 'Portarias'], ['organograma', 'Organograma'],
    ['chamados', 'Chamados'], ['dashboards', 'Painéis'], ['contatos', 'Contatos']];
  var aberto = null;            // id da pessoa com os acessos abertos
  var rascunhos = new Map();    // id → páginas marcadas ainda não salvas

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
      var expandido = aberto === l.id;
      li.classList.toggle('expandido', expandido);
      li.innerHTML =
        '<div class="sol-info"><button type="button" class="sol-pessoa" aria-expanded="' + expandido + '" title="Ver e alterar os acessos">' +
        '<strong>' + escapar(mostrarLogin(l.email)) + '</strong><span>' + (expandido ? 'Ocultar acessos ▴' : 'Ver acessos ▾') + '</span></button></div>' +
        '<div class="sol-situacao"><span class="sol-status ' + escapar(l.status) + '">' + rotuloStatus(l.status) + '</span>' +
        '<span class="sol-status ' + (ativo ? 'ativo' : 'inativo') + '">' + (ativo ? 'Ativo' : 'Desativado') + '</span></div>' +
        '<div class="sol-acoes" data-id="' + escapar(l.id) + '" data-email="' + escapar(l.email) + '">' + botoes.join('') + '</div>';
      li.querySelector('.sol-pessoa').addEventListener('click', function () { aberto = aberto === l.id ? null : l.id; render(); });
      if (expandido) li.appendChild(painelAcessos(l, li));
      lista.appendChild(li);
    });
    lista.querySelectorAll('.sol-acoes').forEach(function (bloco) {
      bloco.querySelectorAll('button').forEach(function (botao) {
        botao.addEventListener('click', function () { executar(bloco, botao); });
      });
    });
  }

  function painelAcessos(l, li) {
    var sempre = auth.SEMPRE_LIBERADAS || [];
    var salvas = Array.isArray(l.paginas) ? l.paginas : [];
    var marcadas = rascunhos.get(l.id) || salvas;
    var painel = document.createElement('div');
    painel.className = 'usuario-acessos';
    var aviso = l.status !== 'aprovado' ? '<p class="usuario-acessos-aviso">Os acessos só valem depois que o cadastro for aprovado.</p>'
      : l.ativo === false ? '<p class="usuario-acessos-aviso">Conta desativada: enquanto estiver assim, não acessa nenhuma página.</p>' : '';
    painel.innerHTML = '<strong class="usuario-acessos-tit">Acesso às páginas</strong>' + aviso +
      '<div class="sol-paginas">' + PAGINAS.map(function (p) {
        var fixa = sempre.indexOf(p[0]) !== -1;
        return '<label' + (fixa ? ' title="Liberado para todos"' : '') + '><input type="checkbox" data-chave="' + p[0] + '"' +
          (fixa || marcadas.indexOf(p[0]) !== -1 ? ' checked' : '') + (fixa ? ' disabled' : '') + '><span>' + p[1] + (fixa ? ' <em>(todos)</em>' : '') + '</span></label>';
      }).join('') + '</div>' +
      '<div class="permissoes-acao"><button type="button" class="permissoes-salvar"' + (rascunhos.has(l.id) ? '' : ' disabled') + '>Salvar acessos</button><span class="permissoes-linha-msg" aria-live="polite"></span></div>';
    var botao = painel.querySelector('.permissoes-salvar');
    var linhaMsg = painel.querySelector('.permissoes-linha-msg');
    var caixas = painel.querySelectorAll('input[type="checkbox"]:not([disabled])');
    var escolhidas = function () {
      return sempre.concat(Array.prototype.filter.call(caixas, function (c) { return c.checked; }).map(function (c) { return c.dataset.chave; }));
    };
    if (rascunhos.has(l.id)) li.classList.add('alterada');
    caixas.forEach(function (c) { c.addEventListener('change', function () {
      rascunhos.set(l.id, escolhidas());
      botao.disabled = false; li.classList.add('alterada'); linhaMsg.textContent = '';
    }); });
    botao.addEventListener('click', function () {
      var paginas = escolhidas();
      botao.disabled = true; caixas.forEach(function (c) { c.disabled = true; });
      linhaMsg.textContent = 'Salvando…';
      auth.definirPaginas(l.id, paginas).then(function () {
        l.paginas = paginas; rascunhos.delete(l.id); li.classList.remove('alterada');
        linhaMsg.textContent = 'Salvo';
        msg.textContent = 'Acessos de ' + mostrarLogin(l.email) + ' atualizados.'; msg.className = 'admin-msg';
        auth.registrarEvento('editar', 'usuarios', 'Alterou os acessos de ' + mostrarLogin(l.email), { paginas: paginas });
      }).catch(function (e) {
        botao.disabled = false; linhaMsg.textContent = 'Falha ao salvar';
        msg.textContent = e.message; msg.className = 'admin-msg erro';
      }).finally(function () { caixas.forEach(function (c) { c.disabled = false; }); });
    });
    return painel;
  }

  function executar(bloco, botao) {
    var id = bloco.dataset.id, email = bloco.dataset.email, acao = botao.dataset.acao;
    var tarefa;
    if (acao === 'aprovar') tarefa = function () { return auth.decidir(id, true).then(function () { return 'Usuário aprovado.'; }); };
    else if (acao === 'recusar') tarefa = function () { return auth.decidir(id, false).then(function () { return 'Cadastro recusado.'; }); };
    else if (acao === 'ativar') tarefa = function () { return auth.definirAtivo(id, true).then(function () { return 'Usuário reativado.'; }); };
    else if (acao === 'desativar') tarefa = function () { return auth.definirAtivo(id, false).then(function () { return 'Usuário desativado.'; }); };
    else if (acao === 'redefinir') {
      return window.Modal.confirmar({
        titulo: 'Redefinir senha',
        mensagem: 'Redefinir a senha de ' + mostrarLogin(email) + ' para ' + auth.SENHA_PADRAO + '? A pessoa vai ser obrigada a trocá-la no próximo acesso.',
        confirmar: 'Redefinir'
      }).then(function (ok) {
        if (!ok) return;
        rodar(function () { return auth.redefinirSenhaPadrao(id).then(function () { return 'Senha de ' + mostrarLogin(email) + ' redefinida para ' + auth.SENHA_PADRAO + '. Ela vai ser obrigada a trocar no próximo acesso.'; }); });
      });
    } else if (acao === 'editar') {
      var atual = mostrarLogin(email);
      var novo = window.prompt('Novo login (nome.sobrenome) ou e-mail para ' + atual + ':', atual);
      if (!novo || novo === atual) return;
      novo = novo.trim();
      var novoEmail = novo.indexOf('@') !== -1 ? novo : novo.toLowerCase() + DOMINIO_USUARIO;
      tarefa = function () { return auth.editarEmail(id, novoEmail).then(function () { return 'Login/e-mail atualizado.'; }); };
    } else if (acao === 'excluir') {
      return window.Modal.confirmar({
        titulo: 'Excluir conta',
        mensagem: 'Excluir a conta de ' + mostrarLogin(email) + ' de vez? Essa ação não pode ser desfeita.',
        confirmar: 'Excluir', perigo: true
      }).then(function (ok) {
        if (!ok) return;
        rodar(function () { return auth.excluirUsuario(id).then(function () { return 'Usuário excluído.'; }); });
      });
    } else return;

    rodar(tarefa);

    function rodar(tarefa) {
      bloco.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      msg.textContent = 'Aguarde…'; msg.className = 'admin-msg';
      tarefa()
        .then(function (texto) { msg.textContent = texto; auth.registrarEvento(acao, 'usuarios', texto + ' (' + mostrarLogin(email) + ')'); carregar(); })
        .catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; bloco.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); });
    }
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
        // auth.cadastrarUsuario já registra o evento "criar" — nada a fazer aqui.
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
