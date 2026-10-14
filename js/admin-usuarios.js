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
  var pinBloqueados = {};       // id → recusas: contas que recusaram o convite de PIN 5 vezes
  var pedidosReset = [];        // contas bloqueadas por 3 senhas erradas, esperando o root aprovar a redefinição
  var painelResets = document.getElementById('painelResets');
  var listaResets = document.getElementById('listaResets');
  var resetsContagem = document.getElementById('resetsContagem');
  function bloqueadaPorSenha(id) { return pedidosReset.some(function (p) { return p.usuario_id === id; }); }
  // Acessos (antes numa tela à parte, admin-permissoes.html): clicar na
  // pessoa abre as páginas liberadas pra ela. Nenhuma página é liberada por padrão
  // (só as marcadas aqui valem).
  var PAGINAS = [['eleicoes', 'Eleições'], ['portarias', 'Portarias'], ['organograma', 'Organograma'],
    ['chamados', 'Chamados'], ['dashboards', 'Painéis'], ['contatos', 'Contatos']];
  var aberto = null;            // id da pessoa com os acessos abertos
  var rascunhos = new Map();    // id → páginas marcadas ainda não salvas

  function atualizarPreviaLogin() { novoLogin.value = auth.previewLogin(novoNome.value, novoSobrenome.value); }
  [novoNome, novoSobrenome].forEach(function (c) {   // só letras e espaço (sem hífen, número ou símbolo)
    c.addEventListener('input', function () { var v = c.value.replace(/[^A-Za-zÀ-ÿ ]/g, ''); if (v !== c.value) c.value = v; });
  });
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
      if (bloqueadaPorSenha(l.id)) botoes.unshift('<button type="button" class="aprovar" data-acao="redefinir" title="Aprova o pedido: a senha volta a ser ' + escapar(auth.SENHA_PADRAO) + ' e a conta é liberada">Aprovar redefinição</button>');
      if (pinBloqueados[l.id] != null) botoes.push('<button type="button" class="redefinir" data-acao="reexibirpin" title="Volta a oferecer o cadastro de PIN no login">Reexibir PIN</button>');
      botoes.push('<button type="button" class="cadeado" data-acao="versenha" title="Ver a senha (pede o PIN)" aria-label="Ver a senha de ' + escapar(mostrarLogin(l.email)) + '">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg></button>');
      botoes.push('<button type="button" class="redefinir" data-acao="redefinir">Redefinir senha</button>');
      botoes.push('<button type="button" class="editar" data-acao="editar">Editar login/e-mail</button>');
      botoes.push('<button type="button" class="excluir" data-acao="excluir">Excluir</button>');
      var expandido = aberto === l.id;
      li.classList.toggle('expandido', expandido);
      li.innerHTML =
        '<div class="sol-info"><button type="button" class="sol-pessoa" aria-expanded="' + expandido + '" title="Ver e alterar os acessos">' +
        '<strong>' + escapar(mostrarLogin(l.email)) + '</strong><span>' + (expandido ? 'Ocultar acessos ▴' : 'Ver acessos ▾') + '</span></button></div>' +
        '<div class="sol-situacao"><span class="sol-status ' + escapar(l.status) + '">' + rotuloStatus(l.status) + '</span>' +
        (bloqueadaPorSenha(l.id) ? '<span class="sol-status bloqueada" title="3 tentativas com senha incorreta: a conta está bloqueada até o root aprovar a redefinição">Bloqueada (3 senhas erradas)</span>' : '') +
        '<span class="sol-status ' + (ativo ? 'ativo' : 'inativo') + '">' + (ativo ? 'Ativo' : 'Desativado') + '</span>' +
        (pinBloqueados[l.id] != null ? '<span class="sol-status inativo" title="Recusou o convite para cadastrar PIN ' + pinBloqueados[l.id] + ' vezes; o convite não aparece mais para ela">Recusou o PIN ' + pinBloqueados[l.id] + 'x</span>' : '') + '</div>' +
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

  // Pedidos de redefinição (contas bloqueadas por 3 senhas erradas): o root aprova aqui e a senha volta ao padrão.
  function renderResets() {
    if (!painelResets) return;
    painelResets.hidden = !pedidosReset.length;
    resetsContagem.textContent = pedidosReset.length ? '(' + pedidosReset.length + ')' : '';
    listaResets.innerHTML = '';
    pedidosReset.forEach(function (p) {
      var li = document.createElement('li');
      var quando = p.bloqueado_em ? new Date(p.bloqueado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      li.innerHTML = '<div class="reset-info"><strong>' + escapar(mostrarLogin(p.email)) + '</strong>' +
        '<span>Bloqueada' + (quando ? ' em ' + escapar(quando) : '') + ' após 3 tentativas com senha incorreta</span></div>' +
        '<button type="button" class="aprovar">Aprovar redefinição para ' + escapar(auth.SENHA_PADRAO) + '</button>';
      li.querySelector('button').addEventListener('click', function (ev) { aprovarReset(p, ev.currentTarget); });
      listaResets.appendChild(li);
    });
  }
  function aprovarReset(p, botao) {
    var login = mostrarLogin(p.email);
    window.Modal.confirmar({
      titulo: 'Aprovar redefinição de senha',
      mensagem: 'Aprovar a redefinição de ' + login + '? A senha volta a ser ' + auth.SENHA_PADRAO + ', a conta é liberada e a pessoa será obrigada a trocá-la no próximo acesso.',
      confirmar: 'Aprovar'
    }).then(function (ok) {
      if (!ok) return;
      botao.disabled = true; msg.textContent = 'Aguarde…'; msg.className = 'admin-msg';
      auth.redefinirSenhaPadrao(p.usuario_id).then(function () {
        msg.textContent = 'Redefinição aprovada: a senha de ' + login + ' voltou a ser ' + auth.SENHA_PADRAO + ' e a conta foi liberada. Ela vai ser obrigada a trocar a senha no próximo acesso.';
        auth.registrarEvento('redefinir', 'usuarios', 'Aprovou a redefinição de senha de ' + login + ' (conta bloqueada por tentativas)');
        carregar();
      }).catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; botao.disabled = false; });
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

  /* Cadeado: pede o PIN (conferido no servidor) e mostra a senha só quando
     ela é conhecida — a padrão, de conta que ainda não trocou. Senha que a
     pessoa definiu não existe em lugar nenhum (só o hash), então não dá para ver. */
  function abrirSenha(id, email) {
    var dlg = document.createElement('dialog');
    dlg.className = 'senha-dialogo';
    dlg.innerHTML =
      '<form method="dialog" class="senha-conteudo">' +
      '<h3>Senha de ' + escapar(mostrarLogin(email)) + '</h3>' +
      '<div class="senha-etapa-pin">' +
        '<label>Digite o PIN para continuar<input type="password" inputmode="numeric" autocomplete="off" maxlength="12" class="senha-pin"></label>' +
        '<p class="senha-erro" hidden></p>' +
      '</div>' +
      '<div class="senha-etapa-resultado" hidden></div>' +
      '<div class="senha-acoes"><button type="button" class="senha-fechar">Fechar</button>' +
      '<button type="submit" class="senha-confirmar aprovar">Confirmar</button></div>' +
      '</form>';
    document.body.appendChild(dlg);
    var pin = dlg.querySelector('.senha-pin'), erro = dlg.querySelector('.senha-erro');
    var etapaPin = dlg.querySelector('.senha-etapa-pin'), resultado = dlg.querySelector('.senha-etapa-resultado');
    var confirmar = dlg.querySelector('.senha-confirmar');
    function fechar() { dlg.close(); dlg.remove(); }
    dlg.querySelector('.senha-fechar').addEventListener('click', fechar);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); fechar(); });
    dlg.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!pin.value) { erro.textContent = 'Digite o PIN.'; erro.hidden = false; return; }
      confirmar.disabled = true; erro.hidden = true;
      auth.verSenha(id, pin.value).then(function (r) {
        pin.value = '';
        etapaPin.hidden = true; confirmar.hidden = true; resultado.hidden = false;
        if (r.padrao && r.senha) {
          resultado.innerHTML =
            '<p>Esta conta ainda está com a <b>senha padrão</b> (a pessoa não trocou desde a última redefinição).</p>' +
            '<div class="senha-valor"><input type="password" readonly value="' + escapar(r.senha) + '" aria-label="Senha">' +
            '<button type="button" class="senha-olho" title="Mostrar/ocultar" aria-label="Mostrar ou ocultar a senha">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>';
          var campo = resultado.querySelector('input');
          resultado.querySelector('.senha-olho').addEventListener('click', function () {
            campo.type = campo.type === 'password' ? 'text' : 'password';
          });
          auth.registrarEvento('consultar', 'usuarios', 'Consultou a senha padrão de ' + mostrarLogin(email));
        } else {
          resultado.innerHTML = '<p>A senha desta conta foi <b>definida pela própria pessoa</b> e não fica guardada em lugar nenhum, então não é possível vê-la.</p>' +
            '<p>Se ela esqueceu, use <b>Redefinir senha</b>: a senha volta a ser ' + escapar(auth.SENHA_PADRAO) + ' e ela troca no próximo acesso.</p>';
        }
      }).catch(function (err) {
        confirmar.disabled = false;
        erro.textContent = err.message; erro.hidden = false;
        pin.select();
      });
    });
    dlg.showModal();
    pin.focus();
  }

  function executar(bloco, botao) {
    var id = bloco.dataset.id, email = bloco.dataset.email, acao = botao.dataset.acao;
    var tarefa;
    if (acao === 'aprovar') tarefa = function () { return auth.decidir(id, true).then(function () { return 'Usuário aprovado.'; }); };
    else if (acao === 'recusar') tarefa = function () { return auth.decidir(id, false).then(function () { return 'Cadastro recusado.'; }); };
    else if (acao === 'ativar') tarefa = function () { return auth.definirAtivo(id, true).then(function () { return 'Usuário reativado.'; }); };
    else if (acao === 'desativar') tarefa = function () { return auth.definirAtivo(id, false).then(function () { return 'Usuário desativado.'; }); };
    else if (acao === 'reexibirpin') tarefa = function () { return auth.pinReexibir(id).then(function () { return 'O convite de PIN volta a aparecer para ' + mostrarLogin(email) + '.'; }); };
    else if (acao === 'versenha') { return abrirSenha(id, email); }
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
    Promise.all([auth.listarSolicitacoes(), auth.listarPinBloqueados(), auth.listarPedidosReset()]).then(function (r) {
      var dados = r[0]; pinBloqueados = r[1]; pedidosReset = r[2];
      linhas = dados.filter(function (l) { return l.email.toLowerCase() !== auth.RESPONSAVEL_EMAIL; });
      renderResets();
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
