(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var lista = document.getElementById('listaLogs');
  var msg = document.getElementById('logsMsg');
  var aviso = document.getElementById('avisoAcesso');
  var painel = document.getElementById('painelLogs');
  var busca = document.getElementById('logsBusca');
  var modulo = document.getElementById('logsModulo');
  var acao = document.getElementById('logsAcao');
  var desde = document.getElementById('logsDesde');
  var ate = document.getElementById('logsAte');
  var contagem = document.getElementById('logsContagem');
  var botaoMais = document.getElementById('logsMais');
  var DOMINIO_USUARIO = '@sistema.local';
  var LOTE = 100;
  var linhas = [];
  var acabou = false;

  var MODULOS = { acesso: 'Acesso', usuarios: 'Usuários', fiscais: 'Fiscais', bairros: 'Bairros', chamados: 'Chamados', mecanizacao: 'Mecanização' };
  var ACOES = {
    login: 'Login', logout: 'Logout', cadastro: 'Cadastro', criar: 'Criar', editar: 'Editar', excluir: 'Excluir',
    aprovar: 'Aprovar', recusar: 'Recusar', ativar: 'Ativar', desativar: 'Desativar', trocar_senha: 'Trocar senha', redefinir: 'Redefinir senha'
  };

  function escapar(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }
  function mostrarLogin(email) {
    email = email || '';
    return email.toLowerCase().endsWith(DOMINIO_USUARIO) ? email.slice(0, -DOMINIO_USUARIO.length) : email;
  }
  function formatarQuando(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { data: iso, hora: '' };
    return {
      data: d.toLocaleDateString('pt-BR'),
      hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
  }

  function render() {
    var termo = busca.value.trim().toLowerCase();
    var visiveis = termo ? linhas.filter(function (l) {
      return (l.usuario_email || '').toLowerCase().indexOf(termo) >= 0 || (l.descricao || '').toLowerCase().indexOf(termo) >= 0;
    }) : linhas;
    contagem.textContent = visiveis.length + (visiveis.length === 1 ? ' evento' : ' eventos') + (acabou ? '' : ' (carregados)');
    lista.innerHTML = '';
    if (!visiveis.length) {
      lista.innerHTML = '<li class="vazio">' + (linhas.length ? 'Nenhum evento encontrado.' : 'Nenhum evento registrado ainda.') + '</li>';
      return;
    }
    visiveis.forEach(function (l) {
      var q = formatarQuando(l.criado_em);
      var li = document.createElement('li');
      li.innerHTML =
        '<div class="logs-quando">' + escapar(q.data) + '<span>' + escapar(q.hora) + '</span></div>' +
        '<div class="logs-quem">' + escapar(mostrarLogin(l.usuario_email)) + '</div>' +
        '<div><span class="logs-badge ' + escapar(l.modulo) + '">' + escapar(MODULOS[l.modulo] || l.modulo) + '</span></div>' +
        '<div class="logs-acao ' + escapar(l.acao) + '">' + escapar(ACOES[l.acao] || l.acao) + '</div>' +
        '<div class="logs-desc">' + escapar(l.descricao) + '</div>';
      lista.appendChild(li);
    });
  }

  function filtros(comOffset) {
    var f = { limite: LOTE };
    if (modulo.value) f.modulo = modulo.value;
    if (acao.value) f.acao = acao.value;
    if (desde.value) f.desde = desde.value + 'T00:00:00';
    if (ate.value) f.ate = ate.value + 'T23:59:59';
    return f;
  }

  function carregar(maisAntigos) {
    var f = filtros();
    if (maisAntigos && linhas.length) f.ate = linhas[linhas.length - 1].criado_em;
    msg.textContent = 'Carregando…'; msg.className = 'admin-msg';
    botaoMais.disabled = true;
    auth.listarEventos(f).then(function (dados) {
      msg.textContent = '';
      if (maisAntigos) linhas = linhas.concat(dados); else linhas = dados;
      acabou = dados.length < LOTE;
      botaoMais.hidden = acabou;
      botaoMais.disabled = false;
      render();
    }).catch(function (e) {
      msg.textContent = e.message; msg.className = 'admin-msg erro';
      botaoMais.disabled = false;
    });
  }

  busca.addEventListener('input', render);
  [modulo, acao, desde, ate].forEach(function (campo) { campo.addEventListener('change', function () { carregar(false); }); });
  botaoMais.addEventListener('click', function () { carregar(true); });

  if (!auth || !auth.online || auth.papel() !== 'responsavel') {
    aviso.hidden = false;
    painel.hidden = true;
    contagem.hidden = true;
  } else {
    carregar(false);
  }
})();
