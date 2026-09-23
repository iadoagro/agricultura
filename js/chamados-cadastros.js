/* Cadastros auxiliares dos chamados (página da equipe de TI).
   Problema, Diretoria > Departamento > Setor. O chamado guarda o NOME
   escolhido, então renomear/excluir aqui nunca muda chamados antigos. */
(function () {
  'use strict';
  var C = window.CHAMADOS, U = window.CHUI, el = U.el, T = C.meta.tiposAux, CAT = C.meta.categorias;
  var ORDEM = ['problema', 'diretoria', 'departamento', 'setor'];
  var itens = [], aba = 'problema', editando = null, ultimoPai = '';
  var filtro = { busca: '', pai: '', sit: 'todos' };

  var porId = function (id) { return itens.filter(function (i) { return i.id === id; })[0]; };
  var doTipo = function (tipo) { return itens.filter(function (i) { return i.tipo === tipo; }); };
  var ordena = function (l) { return l.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }); };
  var sit = function (ativo) { return el('span', { class: 'ch-pilula cor-' + (ativo ? 'verde' : 'cinza') }, [el('i', { class: 'ch-ponto' }), ativo ? 'Ativo' : 'Inativo']); };
  var artigo = function (tipo) { return tipo === 'setor' || tipo === 'problema' ? 'o' : 'a'; };

  /* "Diretoria › Departamento" de um item (o que está acima dele). */
  function caminho(i) {
    var partes = [], p = i.pai_id && porId(i.pai_id);
    while (p) { partes.unshift(p.nome); p = p.pai_id && porId(p.pai_id); }
    return partes.join(' › ');
  }

  /* --------------------------------------------------------------- abas */
  function desenharAbas() {
    var nav = document.getElementById('abasAux');
    nav.replaceChildren.apply(nav, ORDEM.map(function (t) {
      var n = doTipo(t).length;
      var b = el('button', { type: 'button', role: 'tab', class: 'ch-aba-aux' + (t === aba ? ' on' : ''), 'aria-selected': t === aba ? 'true' : 'false' },
        [T[t].plural, el('span', { text: String(n) })]);
      b.addEventListener('click', function () { aba = t; editando = null; filtro = { busca: '', pai: '', sit: 'todos' }; document.getElementById('buscaAux').value = ''; desenhar(); });
      return b;
    }));
  }

  /* ------------------------------------------------ opções de vínculo (pai) */
  function opcoesPai(tipo, selecionado) {
    var pai = T[tipo].pai;
    if (!pai) return [];
    var ops = [el('option', { value: '', text: 'Selecione ' + artigo(pai) + ' ' + T[pai].rot.toLowerCase() + '…' })];
    if (pai === 'diretoria') {
      ordena(doTipo('diretoria')).forEach(function (d) { ops.push(el('option', { value: d.id, selected: selecionado === d.id ? true : null, text: d.nome })); });
    } else {   // setor: departamentos agrupados por diretoria
      ordena(doTipo('diretoria')).forEach(function (d) {
        var deps = ordena(doTipo('departamento').filter(function (x) { return x.pai_id === d.id; }));
        if (deps.length) ops.push(el('optgroup', { label: d.nome }, deps.map(function (x) { return el('option', { value: x.id, selected: selecionado === x.id ? true : null, text: x.nome }); })));
      });
    }
    return ops;
  }

  /* ---------------------------------------------------------- formulário novo */
  function desenharForm() {
    var t = aba, tp = T[t];
    document.getElementById('tituloNovo').textContent = (artigo(t) === 'a' ? 'Nova ' : 'Novo ') + tp.rot.toLowerCase();
    document.getElementById('dicaNovo').textContent = t === 'problema' ? 'Aparece na lista "Tipo de problema" do formulário, agrupado pela categoria.'
      : t === 'diretoria' ? 'Nível mais alto. Departamentos e setores ficam dentro dela.'
      : t === 'departamento' ? 'Aparece no formulário depois que a pessoa escolhe a diretoria.' : 'Aparece no formulário depois que a pessoa escolhe o departamento.';
    var cPai = document.getElementById('cPai'), cCat = document.getElementById('cCategoria');
    cPai.replaceChildren(); cCat.replaceChildren();
    if (tp.pai) {
      var vazio = !doTipo(tp.pai).length || (tp.pai === 'departamento' && !doTipo('departamento').length);
      var s = el('select', { id: 'novoPai' }, opcoesPai(t, ultimoPai));
      cPai.append(el('label', { for: 'novoPai', text: t === 'setor' ? 'Departamento' : 'Diretoria' }), s);
      s.addEventListener('change', function () { ultimoPai = s.value; });
      if (vazio) cPai.append(el('span', { class: 'ch-dica', text: 'Cadastre antes ' + (t === 'setor' ? 'um departamento.' : 'uma diretoria.') }));
    }
    if (t === 'problema') {
      cCat.append(el('label', { for: 'novaCategoria', text: 'Categoria' }),
        el('select', { id: 'novaCategoria' }, [el('option', { value: '', text: 'Selecione…' })].concat(Object.keys(CAT).map(function (k) { return el('option', { value: k, text: CAT[k].rot }); }))));
    }
    var extra = document.getElementById('extra');
    extra.replaceChildren();
    if (t === 'problema') {
      var btn = el('button', { class: 'ch-btn pequeno', type: 'button' }, [U.icone('atualizar'), 'Carregar problemas sugeridos']);
      btn.addEventListener('click', function () {
        btn.disabled = true;
        C.carregarSugestoes().then(function (n) { U.aviso(n ? n + ' problemas sugeridos adicionados.' : 'Todos os problemas sugeridos já estão cadastrados.'); return carregar(); },
          function (e) { U.aviso(e.message, 'erro'); }).then(function () { btn.disabled = false; });
      });
      extra.append(el('p', { class: 'ch-dica', text: 'Quer partir de uma lista pronta? Adiciona só o que ainda não existe.' }), btn);
    }
  }

  document.getElementById('formNovo').addEventListener('submit', function (e) {
    e.preventDefault();
    var erro = document.getElementById('erroNovo'), nome = document.getElementById('novoNome'), pai = document.getElementById('novoPai'), cat = document.getElementById('novaCategoria');
    erro.textContent = '';
    var btn = document.getElementById('btnAdd'); btn.disabled = true;
    C.salvarCadastro({ tipo: aba, nome: nome.value, pai_id: pai ? pai.value : null, categoria: cat ? cat.value : null, ativo: true }).then(function () {
      U.aviso(T[aba].rot + ' adicionad' + artigo(aba) + '.');
      nome.value = ''; nome.focus();
      return carregar();
    }, function (err) { erro.textContent = err.message; }).then(function () { btn.disabled = false; });
  });

  /* ------------------------------------------------------------------ lista */
  function passa(i) {
    if (filtro.sit === 'ativos' && !i.ativo) return false;
    if (filtro.sit === 'inativos' && i.ativo) return false;
    if (filtro.pai && i.pai_id !== filtro.pai && (porId(i.pai_id) || {}).pai_id !== filtro.pai) return false;
    if (filtro.busca && (i.nome + ' ' + caminho(i)).toLowerCase().indexOf(filtro.busca.toLowerCase()) < 0) return false;
    return true;
  }

  function desenharFiltroPai() {
    var s = document.getElementById('filtroPai'), pai = T[aba].pai;
    s.hidden = !pai;
    if (!pai) { s.replaceChildren(); return; }
    var raiz = pai === 'diretoria' ? 'diretoria' : 'diretoria';       // setor também filtra por diretoria (através do departamento)
    s.replaceChildren.apply(s, [el('option', { value: '', text: 'Todas as diretorias' })].concat(ordena(doTipo(raiz)).map(function (d) { return el('option', { value: d.id, selected: filtro.pai === d.id ? true : null, text: d.nome }); })));
  }

  function linha(i) {
    var tp = T[i.tipo];
    if (editando === i.id) {
      var nome = el('input', { type: 'text', value: i.nome, maxlength: '120', 'aria-label': 'Nome' });
      var pai = tp.pai ? el('select', { 'aria-label': 'Vínculo' }, opcoesPai(i.tipo, i.pai_id)) : null;
      var cat = i.tipo === 'problema' ? el('select', { 'aria-label': 'Categoria' }, Object.keys(CAT).map(function (k) { return el('option', { value: k, selected: i.categoria === k ? true : null, text: CAT[k].rot }); })) : null;
      var salvar = el('button', { class: 'ch-btn primario pequeno', type: 'button', text: 'Salvar' });
      salvar.addEventListener('click', function () {
        salvar.disabled = true;
        C.salvarCadastro({ id: i.id, tipo: i.tipo, nome: nome.value, pai_id: pai ? pai.value : null, categoria: cat ? cat.value : null, ativo: i.ativo }).then(function () {
          editando = null; U.aviso('Alterações salvas.'); return carregar();
        }, function (e) { U.aviso(e.message, 'erro'); salvar.disabled = false; });
      });
      nome.addEventListener('keydown', function (e) { if (e.key === 'Enter') salvar.click(); if (e.key === 'Escape') { editando = null; desenharLista(); } });
      var cancelar = el('button', { class: 'ch-btn pequeno', type: 'button', text: 'Cancelar', onclick: function () { editando = null; desenharLista(); } });
      return el('tr', { class: 'editando' }, [el('td', null, nome), tp.pai ? el('td', null, pai) : null, i.tipo === 'problema' ? el('td', null, cat) : null,
        el('td', null, sit(i.ativo)), el('td', { class: 'acoes' }, [salvar, cancelar])]);
    }
    var alt = el('button', { class: 'ch-btn pequeno', type: 'button', onclick: function () { editando = i.id; desenharLista(); setTimeout(function () { var f = document.querySelector('tr.editando input'); if (f) f.focus(); }, 30); } }, 'Editar');
    var tog = el('button', { class: 'ch-btn pequeno', type: 'button', text: i.ativo ? 'Desativar' : 'Ativar' });
    tog.addEventListener('click', function () {
      tog.disabled = true;
      C.salvarCadastro({ id: i.id, tipo: i.tipo, nome: i.nome, pai_id: i.pai_id, categoria: i.categoria, ativo: !i.ativo }).then(function () {
        U.aviso(i.ativo ? 'Desativado: some do formulário, mas o histórico continua.' : 'Ativado.'); return carregar();
      }, function (e) { U.aviso(e.message, 'erro'); tog.disabled = false; });
    });
    var exc = el('button', { class: 'ch-btn pequeno perigo', type: 'button', text: 'Excluir' });
    exc.addEventListener('click', function () {
      if (!window.confirm('Excluir "' + i.nome + '"?\n\nOs chamados já abertos não mudam. Se só quer tirar do formulário, use Desativar.')) return;
      C.excluirCadastro(i.id, i.nome, i.tipo).then(function () { U.aviso('Excluído.'); return carregar(); }, function (e) { U.aviso(e.message, 'erro'); });
    });
    return el('tr', { class: i.ativo ? '' : 'inativo' }, [
      el('td', { class: 'nome', text: i.nome }),
      tp.pai ? el('td', { class: 'sub', text: caminho(i) || '—' }) : null,
      i.tipo === 'problema' ? el('td', null, el('span', { class: 'ch-cat-tag' }, [U.icone(i.categoria, 14), (CAT[i.categoria] || {}).rot || i.categoria])) : null,
      el('td', null, sit(i.ativo)),
      el('td', { class: 'acoes' }, [alt, tog, exc])
    ]);
  }

  function desenharLista() {
    var tp = T[aba];
    var lista = ordena(doTipo(aba).filter(passa));
    var tab = document.getElementById('tabela');
    var cab = el('tr', null, [el('th', { text: 'Nome' }), tp.pai ? el('th', { text: tp.pai === 'diretoria' ? 'Diretoria' : 'Diretoria › Departamento' }) : null,
      aba === 'problema' ? el('th', { text: 'Categoria' }) : null, el('th', { text: 'Situação' }), el('th', { class: 'acoes', text: 'Ações' })]);
    var corpo = lista.length ? lista.map(linha) : [el('tr', null, el('td', { colspan: '5', class: 'ch-vazio', text: doTipo(aba).length ? 'Nada combina com esses filtros.' : 'Nenhum cadastro ainda. Use o formulário ao lado para adicionar.' }))];
    tab.replaceChildren(el('thead', null, cab), el('tbody', null, corpo));
    var total = doTipo(aba), at = total.filter(function (i) { return i.ativo; }).length;
    document.getElementById('contagem').textContent = lista.length + ' na lista · ' + total.length + ' no total (' + at + ' ativos, ' + (total.length - at) + ' inativos)';
  }

  function desenhar() { desenharAbas(); desenharForm(); desenharFiltroPai(); desenharLista();
    Array.prototype.forEach.call(document.querySelectorAll('#segSit button'), function (b) { b.classList.toggle('on', b.dataset.v === filtro.sit); }); }

  function carregar() {
    return C.cadastros(true).then(function (l) { itens = l; desenhar(); }, function (e) {
      U.aviso(e.message, 'erro');
      document.getElementById('tabela').replaceChildren(el('tbody', null, el('tr', null, el('td', { class: 'ch-vazio', text: e.message }))));
    });
  }

  document.getElementById('icoBusca').appendChild(U.icone('buscar'));
  if (C.modo === 'local') document.getElementById('faixaDemo').hidden = false;
  var t = 0;
  document.getElementById('buscaAux').addEventListener('input', function (e) { clearTimeout(t); var v = e.target.value.trim(); t = setTimeout(function () { filtro.busca = v; desenharLista(); }, 150); });
  document.getElementById('filtroPai').addEventListener('change', function (e) { filtro.pai = e.target.value; desenharLista(); });
  document.getElementById('segSit').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; filtro.sit = b.dataset.v;
    Array.prototype.forEach.call(document.querySelectorAll('#segSit button'), function (x) { x.classList.toggle('on', x === b); }); desenharLista();
  });
  carregar();
})();
