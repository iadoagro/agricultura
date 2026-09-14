(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var lista = document.getElementById('listaPermissoes');
  var msg = document.getElementById('adminMsg');
  var aviso = document.getElementById('avisoAcesso');

  var PAGINAS = [
    ['eleicoes', 'Fiscais'],
    ['portarias', 'Portarias'],
    ['organograma', 'Organograma'],
    ['chamados', 'Chamados'],
    ['dashboards', 'Dashboards'],
    ['contatos', 'Contatos']
  ];

  function escapar(s) { return s.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }
  function rotuloStatus(s) { return s === 'pendente' ? 'Pendente' : s === 'aprovado' ? 'Aprovado' : 'Recusado'; }

  function render(linhas) {
    linhas = linhas.filter(function (l) { return l.email.toLowerCase() !== auth.RESPONSAVEL_EMAIL; });
    lista.innerHTML = '';
    if (!linhas.length) { lista.innerHTML = '<li class="vazio">Nenhum usuário cadastrado ainda.</li>'; return; }
    linhas.slice().reverse().forEach(function (l) {
      var li = document.createElement('li');
      var paginas = Array.isArray(l.paginas) ? l.paginas : [];
      li.innerHTML =
        '<div class="sol-info"><strong>' + escapar(l.email) + '</strong>' +
        '<span><span class="sol-status ' + l.status + '">' + rotuloStatus(l.status) + '</span></span></div>' +
        '<div class="sol-paginas" data-id="' + l.id + '">' +
        PAGINAS.map(function (p) {
          var marcado = paginas.indexOf(p[0]) !== -1;
          return '<label><input type="checkbox" data-chave="' + p[0] + '"' + (marcado ? ' checked' : '') + '> ' + p[1] + '</label>';
        }).join('') +
        '</div>';
      lista.appendChild(li);
    });
    lista.querySelectorAll('.sol-paginas').forEach(function (bloco) {
      bloco.querySelectorAll('input[type="checkbox"]').forEach(function (chk) {
        chk.addEventListener('change', function () { salvar(bloco); });
      });
    });
  }

  function salvar(bloco) {
    var id = bloco.dataset.id;
    var marcadas = Array.prototype.slice.call(bloco.querySelectorAll('input[type="checkbox"]:checked')).map(function (c) { return c.dataset.chave; });
    var caixas = bloco.querySelectorAll('input[type="checkbox"]');
    caixas.forEach(function (c) { c.disabled = true; });
    msg.textContent = 'Salvando…'; msg.className = 'admin-msg';
    auth.definirPaginas(id, marcadas)
      .then(function () { msg.textContent = 'Acessos atualizados.'; })
      .catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; })
      .finally(function () { caixas.forEach(function (c) { c.disabled = false; }); });
  }

  function carregar() {
    auth.listarSolicitacoes().then(render).catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; });
  }

  if (!auth || !auth.online || auth.papel() !== 'responsavel') {
    aviso.hidden = false;
    lista.hidden = true;
  } else {
    carregar();
  }
})();
