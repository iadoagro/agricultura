/* Cadastro auxiliar de Bairros dos Fiscais (pages/cadastros-fiscais.html).
   Os fiscais guardam o NOME do bairro, então renomear/desativar/excluir
   aqui nunca muda cadastros antigos — só a lista do formulário. */
(function () {
  'use strict';
  var B = window.BAIRROS_FISCAIS, U = window.CHUI, el = U.el;
  var editando = null, filtro = { busca: '', municipio: '', sit: 'todos' };
  var nomes = {};
  ((window.MAPA_ACRE && window.MAPA_ACRE.localidades) || []).forEach(function (m) { nomes[String(m.id)] = m.nome; });
  var municipiosOrdenados = Object.keys(nomes).sort(function (a, b) { return nomes[a].localeCompare(nomes[b], 'pt-BR'); });

  var sit = function (ativo) { return el('span', { class: 'ch-pilula cor-' + (ativo ? 'verde' : 'cinza') }, [el('i', { class: 'ch-ponto' }), ativo ? 'Ativo' : 'Inativo']); };
  var opcoesMunicipio = function (sel) {
    return municipiosOrdenados.map(function (id) { return el('option', { value: id, selected: sel === id ? true : null, text: nomes[id] }); });
  };

  function preencherSelects() {
    var novo = document.getElementById('novoMunicipio'), filtroSel = document.getElementById('filtroMunicipio');
    opcoesMunicipio('').forEach(function (o) { novo.appendChild(o); });
    opcoesMunicipio('').forEach(function (o) { filtroSel.appendChild(o); });
  }

  document.getElementById('formNovo').addEventListener('submit', function (e) {
    e.preventDefault();
    var erro = document.getElementById('erroNovo'), nome = document.getElementById('novoNome'), mun = document.getElementById('novoMunicipio');
    erro.textContent = '';
    var btn = document.getElementById('btnAdd'); btn.disabled = true;
    B.salvar({ municipio: mun.value, nome: nome.value }).then(function () {
      U.aviso('Bairro adicionado.');
      nome.value = ''; nome.focus();
    }, function (err) { erro.textContent = err.message; }).then(function () { btn.disabled = false; });
  });

  function passa(b) {
    if (filtro.sit === 'ativos' && !b.ativo) return false;
    if (filtro.sit === 'inativos' && b.ativo) return false;
    if (filtro.municipio && b.municipio !== filtro.municipio) return false;
    if (filtro.busca && b.nome.toLowerCase().indexOf(filtro.busca.toLowerCase()) < 0) return false;
    return true;
  }

  function linha(b) {
    if (editando === b.id) {
      var nome = el('input', { type: 'text', value: b.nome, maxlength: '120', 'aria-label': 'Nome' });
      var mun = el('select', { 'aria-label': 'Município' }, opcoesMunicipio(b.municipio));
      var salvar = el('button', { class: 'ch-btn primario pequeno', type: 'button', text: 'Salvar' });
      salvar.addEventListener('click', function () {
        salvar.disabled = true;
        B.salvar({ id: b.id, municipio: mun.value, nome: nome.value, ativo: b.ativo }).then(function () {
          editando = null; U.aviso('Alterações salvas.');
        }, function (e) { U.aviso(e.message, 'erro'); salvar.disabled = false; });
      });
      nome.addEventListener('keydown', function (e) { if (e.key === 'Enter') salvar.click(); if (e.key === 'Escape') { editando = null; desenhar(); } });
      var cancelar = el('button', { class: 'ch-btn pequeno', type: 'button', text: 'Cancelar', onclick: function () { editando = null; desenhar(); } });
      return el('tr', { class: 'editando' }, [el('td', null, nome), el('td', null, mun), el('td', null, sit(b.ativo)), el('td', { class: 'acoes' }, [salvar, cancelar])]);
    }
    var alt = el('button', { class: 'ch-btn pequeno', type: 'button', text: 'Editar', onclick: function () {
      editando = b.id; desenhar(); setTimeout(function () { var f = document.querySelector('tr.editando input'); if (f) f.focus(); }, 30);
    } });
    var tog = el('button', { class: 'ch-btn pequeno', type: 'button', text: b.ativo ? 'Desativar' : 'Ativar' });
    tog.addEventListener('click', function () {
      tog.disabled = true;
      B.salvar({ id: b.id, municipio: b.municipio, nome: b.nome, ativo: !b.ativo }).then(function () {
        U.aviso(b.ativo ? 'Desativado: some da lista do formulário, mas os fiscais já cadastrados continuam com ele.' : 'Ativado.');
      }, function (e) { U.aviso(e.message, 'erro'); tog.disabled = false; });
    });
    var exc = el('button', { class: 'ch-btn pequeno perigo', type: 'button', text: 'Excluir' });
    exc.addEventListener('click', function () {
      window.Modal.confirmar({
        titulo: 'Excluir bairro',
        mensagem: 'Excluir o bairro "' + b.nome + '" (' + (nomes[b.municipio] || b.municipio) + ')?\n\nOs fiscais já cadastrados não mudam. Se só quer tirar da lista do formulário, use Desativar.\nObs.: se alguém cadastrar um fiscal com esse bairro de novo, ele volta sozinho para a lista.',
        confirmar: 'Excluir', perigo: true
      }).then(function (ok) {
        if (!ok) return;
        B.excluir(b.id).then(function () { U.aviso('Excluído.'); }, function (e) { U.aviso(e.message, 'erro'); });
      });
    });
    return el('tr', { class: b.ativo ? '' : 'inativo' }, [
      el('td', { class: 'nome', text: b.nome }),
      el('td', { class: 'sub', text: nomes[b.municipio] || b.municipio }),
      el('td', null, sit(b.ativo)),
      el('td', { class: 'acoes' }, [alt, tog, exc])
    ]);
  }

  function desenhar() {
    var todos = B.todos();
    var lista = todos.filter(passa).sort(function (a, b) {
      return (nomes[a.municipio] || '').localeCompare(nomes[b.municipio] || '', 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR');
    });
    var tab = document.getElementById('tabela');
    var cab = el('tr', null, [el('th', { text: 'Nome' }), el('th', { text: 'Município' }), el('th', { text: 'Situação' }), el('th', { class: 'acoes', text: 'Ações' })]);
    var corpo = lista.length ? lista.map(linha) : [el('tr', null, el('td', { colspan: '4', class: 'ch-vazio', text: todos.length ? 'Nada combina com esses filtros.' : 'Nenhum bairro cadastrado ainda. Use o formulário ao lado para adicionar.' }))];
    tab.replaceChildren(el('thead', null, cab), el('tbody', null, corpo));
    var at = todos.filter(function (b) { return b.ativo; }).length;
    document.getElementById('totalAba').textContent = String(todos.length);
    document.getElementById('contagem').textContent = lista.length + ' na lista · ' + todos.length + ' no total (' + at + ' ativos, ' + (todos.length - at) + ' inativos)';
  }

  document.getElementById('icoBusca').appendChild(U.icone('buscar'));
  if (!B.online) document.getElementById('faixaDemo').hidden = false;
  preencherSelects();
  var t = 0;
  document.getElementById('buscaAux').addEventListener('input', function (e) { clearTimeout(t); var v = e.target.value.trim(); t = setTimeout(function () { filtro.busca = v; desenhar(); }, 150); });
  document.getElementById('filtroMunicipio').addEventListener('change', function (e) {
    filtro.municipio = e.target.value;
    // Já deixa o município do filtro escolhido no formulário de novo bairro.
    if (e.target.value) document.getElementById('novoMunicipio').value = e.target.value;
    desenhar();
  });
  document.getElementById('segSit').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; filtro.sit = b.dataset.v;
    Array.prototype.forEach.call(document.querySelectorAll('#segSit button'), function (x) { x.classList.toggle('on', x === b); }); desenhar();
  });
  window.addEventListener('bairros-atualizado', desenhar);
  B.carregar().catch(function (e) {
    U.aviso(e.message, 'erro');
    document.getElementById('tabela').replaceChildren(el('tbody', null, el('tr', null, el('td', { class: 'ch-vazio', text: e.message }))));
  });
})();
