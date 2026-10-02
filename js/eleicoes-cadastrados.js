/* Fiscais: (1) janela "Cadastro do fiscal" — quem cadastrou e quando (data e
   hora), pelo log do sistema (window.AUDITORIA_FISCAL, chamada ao clicar num
   fiscal em js/eleicoes.js); (2) aba "Cadastrados": cada pessoa vê os
   fiscais que cadastrou (ou os de outra conta) e exporta em PDF (impressão do
   navegador → "Salvar como PDF"). Só lê window.BANCO_ELEICOES. */
(function () {
  'use strict';
  var banco = window.BANCO_ELEICOES;
  if (!banco) return;
  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : [])
    .map(function (m) { return [String(m.id), m.nome]; }));
  var hora = function (d) { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  var fmt = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  /* ---- quem cadastrou (no painel do fiscal) ---- */
  var alvo = document.getElementById('fichaAuditoria');
  var seq = 0;
  window.AUDITORIA_FISCAL = function (r) {
    if (!alvo || !r || !r._id) return;
    var meu = ++seq;
    alvo.textContent = 'Buscando quem cadastrou…';
    banco.logCadastro(r._id).then(function (l) {
      if (meu !== seq) return;
      var quando = l && (fmt(l.logEm) || fmt(l.criadoEm)) || fmt(r._criadoEm);
      var quem = l && (l.logPor || l.por) || r._criadoPor || 'Sistema';
      alvo.textContent = 'Cadastrado por ' + quem + (quando ? ' em ' + quando : '') + (l && l.logEm ? ' (log do sistema)' : '');
    }).catch(function (e) { if (meu === seq) alvo.textContent = e.message || 'Não foi possível consultar o log.'; });
  };

  /* ---- aba "Cadastrados" ---- */
  var btnSel = document.getElementById('cadPorBtn');
  var menu = document.getElementById('cadPorMenu');
  var busca = document.getElementById('cadPorBusca');
  var status = document.getElementById('cadPorStatus');
  var tbody = document.getElementById('cadPorCorpo');
  var btnPdf = document.getElementById('cadPorPdf');
  if (!btnSel || !tbody) return;
  var escolhidos = null;   // Set de chaves; null = ainda não definido (padrão: "Meus cadastros"); vazio = todos

  function todos() { try { return banco.ler(); } catch (e) { return null; } }
  function chaveDe(r) { return r._criadoPorId || '__sistema__'; }
  function pessoas() {
    var regs = todos(); if (!regs) return null;
    var por = new Map();
    regs.forEach(function (r) {
      var k = chaveDe(r), o = por.get(k) || { chave: k, nome: r._criadoPor || 'Sistema', n: 0 };
      o.n++; por.set(k, o);
    });
    return Array.from(por.values()).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  }
  function montarMenu() {
    var ps = pessoas(); if (!ps) return;
    var eu = banco.usuario();
    if (escolhidos === null) escolhidos = new Set(eu && ps.some(function (p) { return p.chave === eu.id; }) ? [eu.id] : []);
    menu.replaceChildren();
    var rotulo = function (texto, marcado, onChange) {
      var l = document.createElement('label'), i = document.createElement('input');
      i.type = 'checkbox'; i.checked = marcado; i.addEventListener('change', onChange);
      l.append(i, document.createTextNode(texto)); menu.append(l); return i;
    };
    rotulo('Todos', escolhidos.size === 0, function () { escolhidos.clear(); atualizar(); });
    ps.forEach(function (p) {
      var meu = eu && p.chave === eu.id;
      rotulo((meu ? 'Meus cadastros' : p.nome) + ' (' + p.n + ')', escolhidos.has(p.chave), function (e) {
        if (e.target.checked) escolhidos.add(p.chave); else escolhidos.delete(p.chave);
        atualizar();
      });
    });
    var nomes = ps.filter(function (p) { return escolhidos.has(p.chave); }).map(function (p) { return eu && p.chave === eu.id ? 'Meus cadastros' : p.nome; });
    btnSel.textContent = !nomes.length ? 'Todos' : nomes.length <= 2 ? nomes.join(', ') : nomes.length + ' pessoas';
  }
  function atualizar() { montarMenu(); renderizar(); }
  function filtrados() {
    var regs = todos(); if (!regs) return null;
    var t = busca.value.trim().toLowerCase(), td = t.replace(/\D/g, '');
    return regs.filter(function (r) {
      if (escolhidos && escolhidos.size && !escolhidos.has(chaveDe(r))) return false;
      if (!t) return true;
      return (r.nome || '').toLowerCase().indexOf(t) !== -1 || (td && (r.telefone || '').replace(/\D/g, '').indexOf(td) !== -1);
    }).sort(function (a, b) { return String(b._criadoEm || '').localeCompare(String(a._criadoEm || '')); });
  }
  // Mais de uma pessoa (ou "Todos"): agrupa por quem cadastrou, com um título por pessoa.
  function agrupado() { return !escolhidos || escolhidos.size !== 1; }
  function grupos(regs) {
    if (!agrupado()) return [{ nome: null, itens: regs }];
    var m = new Map();
    regs.forEach(function (r) {
      var k = chaveDe(r), g = m.get(k) || { nome: r._criadoPor || 'Sistema', itens: [] };
      g.itens.push(r); m.set(k, g);
    });
    return Array.from(m.values()).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  }
  var COLS = ['Cadastrado por', 'Data e hora', 'Nome', 'Telefone', 'Município', 'Bairro', 'Zona', 'Seção'];
  function linha(r) {
    return [r._criadoPor || 'Sistema', fmt(r._criadoEm), r.nome, r.telefone, nomesMun.get(r.municipio) || r.municipio, r.bairro, r.zona, r.secao];
  }
  function tituloGrupo(g) { return g.nome + ' — ' + g.itens.length + (g.itens.length === 1 ? ' fiscal' : ' fiscais'); }
  function preencher(corpoEl, regs, classeTitulo) {
    grupos(regs).forEach(function (g, i) {
      if (g.nome !== null) {
        var th = corpoEl.insertRow(); th.className = classeTitulo + ' cor-' + (i % 6);
        var c = th.insertCell(); c.colSpan = COLS.length; c.textContent = tituloGrupo(g);
      }
      g.itens.forEach(function (r) {
        var tr = corpoEl.insertRow(); tr.className = 'cor-' + (i % 6);
        linha(r).forEach(function (v) { tr.insertCell().textContent = v == null ? '' : v; });
      });
    });
  }
  function renderizar() {
    var regs = filtrados();
    if (!regs) { status.textContent = 'Carregando os cadastros do banco online…'; return; }
    status.textContent = regs.length + (regs.length === 1 ? ' fiscal cadastrado.' : ' fiscais cadastrados.');
    btnPdf.disabled = !regs.length;
    tbody.replaceChildren();
    if (!regs.length) {
      var td = tbody.insertRow().insertCell();
      td.colSpan = COLS.length; td.textContent = 'Nenhum fiscal encontrado.'; return;
    }
    preencher(tbody, regs, 'cad-grupo');
  }
  function exportarPDF() {
    var regs = filtrados();
    if (!regs || !regs.length) { status.textContent = 'Nenhum fiscal para exportar.'; return; }
    var folha = document.createElement('section');
    folha.id = 'cadastradosImpressao';
    var topo = document.createElement('header'); topo.className = 'cad-topo';
    var h = document.createElement('h1'); h.textContent = 'Fiscais cadastrados';
    var sub = document.createElement('p');
    sub.textContent = 'Cadastrados por: ' + btnSel.textContent + ' · gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    topo.append(h, sub);
    var gs = grupos(regs), numeros = document.createElement('div'); numeros.className = 'cad-numeros';
    [[regs.length, regs.length === 1 ? 'fiscal' : 'fiscais'],
     [new Set(regs.map(chaveDe)).size, new Set(regs.map(chaveDe)).size === 1 ? 'pessoa' : 'pessoas'],
     [new Set(regs.map(function (r) { return r.municipio; })).size, 'município(s)']].forEach(function (p) {
      var d = document.createElement('div'), n = document.createElement('b'), t = document.createElement('span');
      n.textContent = p[0]; t.textContent = p[1]; d.append(n, t); numeros.append(d);
    });
    // Texto resumo: quem cadastrou, quantos cada um e o período (primeiro e último cadastro)
    var conta = new Map();
    regs.forEach(function (r) { var n = r._criadoPor || 'Sistema'; conta.set(n, (conta.get(n) || 0) + 1); });
    var pes = Array.from(conta.entries()).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'); })
      .map(function (e) { return e[0] + ' (' + e[1] + ')'; });
    var lista = pes.length > 1 ? pes.slice(0, -1).join(', ') + ' e ' + pes[pes.length - 1] : pes[0];
    var datas = regs.map(function (r) { return r._criadoEm && new Date(r._criadoEm); }).filter(function (d) { return d && !isNaN(d); })
      .sort(function (a, b) { return a - b; });
    var dia = function (d) { return d.toLocaleDateString('pt-BR'); };
    var periodo = !datas.length ? '' : dia(datas[0]) === dia(datas[datas.length - 1])
      ? ' no dia ' + dia(datas[0]) + ', entre ' + hora(datas[0]) + ' e ' + hora(datas[datas.length - 1])
      : ' no período de ' + dia(datas[0]) + ' a ' + dia(datas[datas.length - 1]);
    var resumo = document.createElement('p'); resumo.className = 'cad-resumo';
    resumo.textContent = 'Este relatório reúne ' + regs.length + (regs.length === 1 ? ' fiscal cadastrado' : ' fiscais cadastrados') +
      ' por ' + lista + periodo + '.' + (gs.length > 1 ? ' Os registros estão agrupados por quem fez o cadastro.' : '');
    var tab = document.createElement('table');
    var thead = tab.createTHead().insertRow();
    COLS.forEach(function (c) { var th = document.createElement('th'); th.textContent = c; thead.append(th); });
    preencher(tab.createTBody(), regs, 'cad-grupo');
    folha.append(topo, numeros, resumo, tab);
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
  btnSel.addEventListener('click', function () {
    menu.hidden = !menu.hidden;
    btnSel.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !e.target.closest('#cadPorCampo')) { menu.hidden = true; btnSel.setAttribute('aria-expanded', 'false'); }
  });
  busca.addEventListener('input', renderizar);
  btnPdf.addEventListener('click', exportarPDF);
  window.addEventListener('banco-atualizado', atualizar);
  atualizar();
})();
