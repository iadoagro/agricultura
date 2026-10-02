/* Fiscais: (1) janela "Cadastro do fiscal" — quem cadastrou e quando (data e
   hora), pelo log do sistema (window.AUDITORIA_FISCAL, chamada ao clicar num
   fiscal em js/eleicoes.js); (2) aba "Cadastrados por": cada pessoa vê os
   fiscais que cadastrou (ou os de outra conta) e exporta em PDF (impressão do
   navegador → "Salvar como PDF"). Só lê window.BANCO_ELEICOES. */
(function () {
  'use strict';
  var banco = window.BANCO_ELEICOES;
  if (!banco) return;
  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : [])
    .map(function (m) { return [String(m.id), m.nome]; }));
  var fmt = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  /* ---- janela do fiscal ---- */
  var dlg = document.getElementById('fiscal-auditoria-dialogo');
  var corpo = document.getElementById('fiscal-auditoria-corpo');
  var titulo = document.getElementById('fiscal-auditoria-titulo');
  if (dlg) document.getElementById('fiscal-auditoria-fechar').onclick = function () { dlg.close(); };
  var seq = 0;
  window.AUDITORIA_FISCAL = function (r) {
    if (!dlg || !r || !r._id) return;
    var meu = ++seq;
    titulo.textContent = r.nome || 'Fiscal';
    corpo.textContent = 'Buscando no log do sistema…';
    if (!dlg.open) dlg.showModal();
    banco.logCadastro(r._id).then(function (l) {
      if (meu !== seq) return;
      var linhas = [];
      var quando = l && (fmt(l.logEm) || fmt(l.criadoEm)) || fmt(r._criadoEm);
      var quem = l && (l.logPor || l.por) || r._criadoPor || 'Sistema';
      linhas.push(['Cadastrado por', quem]);
      linhas.push(['Data e hora', quando || 'Não registrado']);
      linhas.push(['Fonte', l && l.logEm ? 'Log do sistema' : 'Registro do cadastro (sem evento no log)']);
      corpo.replaceChildren.apply(corpo, linhas.map(function (p) {
        var li = document.createElement('div');
        var a = document.createElement('span'); a.textContent = p[0];
        var b = document.createElement('strong'); b.textContent = p[1];
        li.append(a, b); return li;
      }));
    }).catch(function (e) { if (meu === seq) corpo.textContent = e.message || 'Não foi possível consultar o log.'; });
  };

  /* ---- aba "Cadastrados por" ---- */
  var sel = document.getElementById('cadPorSelect');
  var busca = document.getElementById('cadPorBusca');
  var status = document.getElementById('cadPorStatus');
  var tbody = document.getElementById('cadPorCorpo');
  var btnPdf = document.getElementById('cadPorPdf');
  if (!sel || !tbody) return;
  var TODOS = '__todos__';

  function todos() { try { return banco.ler(); } catch (e) { return null; } }
  function chaveDe(r) { return r._criadoPorId || '__sistema__'; }
  function montarOpcoes() {
    var regs = todos(); if (!regs) return;
    var eu = banco.usuario(), anterior = sel.value;
    var por = new Map();
    regs.forEach(function (r) {
      var k = chaveDe(r), o = por.get(k) || { nome: r._criadoPor || 'Sistema', n: 0 };
      o.n++; por.set(k, o);
    });
    var itens = Array.from(por.entries()).sort(function (a, b) { return a[1].nome.localeCompare(b[1].nome, 'pt-BR'); });
    sel.replaceChildren(new Option('Todos (' + regs.length + ')', TODOS));
    if (eu) sel.add(new Option('Meus cadastros (' + ((por.get(eu.id) || {}).n || 0) + ')', eu.id));
    itens.forEach(function (it) { if (!eu || it[0] !== eu.id) sel.add(new Option(it[1].nome + ' (' + it[1].n + ')', it[0])); });
    sel.value = Array.from(sel.options).some(function (o) { return o.value === anterior; }) ? anterior : (eu ? eu.id : TODOS);
  }
  function filtrados() {
    var regs = todos(); if (!regs) return null;
    var t = busca.value.trim().toLowerCase(), td = t.replace(/\D/g, '');
    return regs.filter(function (r) {
      if (sel.value !== TODOS && chaveDe(r) !== sel.value) return false;
      if (!t) return true;
      return (r.nome || '').toLowerCase().indexOf(t) !== -1 || (td && (r.telefone || '').replace(/\D/g, '').indexOf(td) !== -1);
    }).sort(function (a, b) { return String(b._criadoEm || '').localeCompare(String(a._criadoEm || '')); });
  }
  var COLS = ['Nome', 'Telefone', 'Município', 'Bairro', 'Zona', 'Seção', 'Cadastrado por', 'Data e hora'];
  function linha(r) {
    return [r.nome, r.telefone, nomesMun.get(r.municipio) || r.municipio, r.bairro, r.zona, r.secao, r._criadoPor || 'Sistema', fmt(r._criadoEm)];
  }
  function renderizar() {
    var regs = filtrados();
    if (!regs) { status.textContent = 'Carregando os cadastros do banco online…'; return; }
    status.textContent = regs.length + (regs.length === 1 ? ' fiscal cadastrado.' : ' fiscais cadastrados.');
    btnPdf.disabled = !regs.length;
    if (!regs.length) {
      var tr = document.createElement('tr'), td = document.createElement('td');
      td.colSpan = COLS.length; td.textContent = 'Nenhum fiscal encontrado.'; tr.append(td);
      tbody.replaceChildren(tr); return;
    }
    tbody.replaceChildren.apply(tbody, regs.map(function (r) {
      var tr = document.createElement('tr');
      linha(r).forEach(function (v) { var td = document.createElement('td'); td.textContent = v == null ? '' : v; tr.append(td); });
      return tr;
    }));
  }
  function exportarPDF() {
    var regs = filtrados();
    if (!regs || !regs.length) { status.textContent = 'Nenhum fiscal para exportar.'; return; }
    var folha = document.createElement('section');
    folha.id = 'cadastradosImpressao';
    var h = document.createElement('h1'); h.textContent = 'Fiscais cadastrados';
    var sub = document.createElement('p');
    var quem = sel.options[sel.selectedIndex].text.replace(/\s*\(\d+\)$/, '');
    sub.textContent = 'Cadastrados por: ' + quem + ' · ' + regs.length + (regs.length === 1 ? ' fiscal' : ' fiscais') +
      ' · gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    var tab = document.createElement('table');
    var thead = tab.createTHead().insertRow();
    COLS.forEach(function (c) { var th = document.createElement('th'); th.textContent = c; thead.append(th); });
    var tb = tab.createTBody();
    regs.forEach(function (r) {
      var tr = tb.insertRow();
      linha(r).forEach(function (v) { tr.insertCell().textContent = v == null ? '' : v; });
    });
    folha.append(h, sub, tab);
    document.body.appendChild(folha);
    document.body.classList.add('imprimindo-cadastrados');
    var sair = function () {
      document.body.classList.remove('imprimindo-cadastrados');
      folha.remove();
      window.removeEventListener('afterprint', sair);
    };
    window.addEventListener('afterprint', sair);
    window.print();
  }
  sel.addEventListener('change', renderizar);
  busca.addEventListener('input', renderizar);
  btnPdf.addEventListener('click', exportarPDF);
  window.addEventListener('banco-atualizado', function () { montarOpcoes(); renderizar(); });
  montarOpcoes(); renderizar();
})();
