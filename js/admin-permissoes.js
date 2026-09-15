(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var lista = document.getElementById('listaPermissoes');
  var msg = document.getElementById('adminMsg');
  var aviso = document.getElementById('avisoAcesso');
  var busca = document.getElementById('permissoesBusca');
  var situacao = document.getElementById('permissoesSituacao');
  var contagem = document.getElementById('permissoesContagem');
  var linhas = [];
  var rascunhos = new Map();
  var PAGINAS = [['eleicoes','Fiscais'],['portarias','Portarias'],['organograma','Organograma'],
    ['chamados','Chamados'],['dashboards','Dashboards'],['contatos','Contatos']];
  function escapar(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  }); }
  function rotuloStatus(s) { return s === 'pendente' ? 'Pendente' : s === 'aprovado' ? 'Aprovado' : 'Recusado'; }
  function render() {
    var termo = busca.value.trim().toLowerCase();
    var filtro = situacao.value;
    var visiveis = linhas.filter(function (l) { return (!termo || l.email.toLowerCase().includes(termo)) && (!filtro || l.status === filtro); });
    contagem.textContent = visiveis.length + ' de ' + linhas.length + ' usuários';
    lista.innerHTML = '';
    if (!visiveis.length) { lista.innerHTML = '<li class="vazio">Nenhum usuário encontrado.</li>'; return; }
    visiveis.slice().reverse().forEach(function (l) {
      var li = document.createElement('li');
      var paginas = rascunhos.get(l.id) || (Array.isArray(l.paginas) ? l.paginas : []);
      li.dataset.id = l.id;
      li.innerHTML = '<div class="sol-info"><strong>' + escapar(l.email) + '</strong><span class="sol-status ' + escapar(l.status) + '">' + rotuloStatus(l.status) + '</span></div>' +
        '<div class="sol-paginas">' + PAGINAS.map(function (p) { return '<label><input type="checkbox" data-chave="' + p[0] + '"' + (paginas.includes(p[0]) ? ' checked' : '') + '><span>' + p[1] + '</span></label>'; }).join('') + '</div>' +
        '<div class="permissoes-acao"><button type="button" class="permissoes-salvar" disabled>Salvar</button><span class="permissoes-linha-msg" aria-live="polite"></span></div>';
      var botao = li.querySelector('.permissoes-salvar');
      var caixas = li.querySelectorAll('input[type="checkbox"]');
      caixas.forEach(function (c) { c.addEventListener('change', function () {
        rascunhos.set(l.id, Array.from(caixas).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.chave; }));
        botao.disabled = false; li.classList.add('alterada');
      }); });
      if (rascunhos.has(l.id)) { botao.disabled = false; li.classList.add('alterada'); }
      botao.addEventListener('click', function () {
        var escolhidas = Array.from(caixas).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.chave; });
        var linhaMsg = li.querySelector('.permissoes-linha-msg');
        botao.disabled = true; caixas.forEach(function (c) { c.disabled = true; });
        linhaMsg.textContent = 'Salvando…';
        auth.definirPaginas(l.id, escolhidas).then(function () {
          l.paginas = escolhidas;
          rascunhos.delete(l.id);
          li.classList.remove('alterada');
          linhaMsg.textContent = 'Salvo';
          msg.textContent = 'Acessos atualizados.'; msg.className = 'admin-msg';
        }).catch(function (e) {
          botao.disabled = false;
          linhaMsg.textContent = 'Falha ao salvar';
          msg.textContent = e.message; msg.className = 'admin-msg erro';
        }).finally(function () { caixas.forEach(function (c) { c.disabled = false; }); });
      });
      lista.appendChild(li);
    });
  }
  if (!auth || !auth.online || auth.papel() !== 'responsavel') {
    aviso.hidden = false; lista.hidden = true; document.querySelector('.permissoes-filtros').hidden = true;
    document.querySelector('.permissoes-tabela').hidden = true;
    return;
  }
  busca.addEventListener('input', render);
  situacao.addEventListener('change', render);
  auth.listarSolicitacoes().then(function (dados) {
    linhas = dados.filter(function (l) { return l.email.toLowerCase() !== auth.RESPONSAVEL_EMAIL; });
    render();
  }).catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; });
})();
