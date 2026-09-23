/* Aba "Relatório" de eleicoes.html: lista em tabelas os fiscais cadastrados,
   agrupados por município, regional, zona, bairro ou sem agrupar (geral),
   com filtros e exportação em CSV, Excel (uma planilha por grupo + resumo)
   e impressão/PDF. Só lê window.BANCO_ELEICOES.ler() — não altera nada. */
(function () {
  'use strict';
  var banco = window.BANCO_ELEICOES;
  var $ = function (id) { return document.getElementById(id); };
  var agruparCampo = $('relAgruparCampo'), agruparBtn = $('relAgruparBtn'), agruparMenu = $('relAgruparMenu');
  var agruparItens = agruparMenu ? Array.prototype.slice.call(agruparMenu.querySelectorAll('.rel-agrupar-item')) : [];
  var campoBusca = $('relBusca');
  var status = $('relStatus'), resumo = $('relResumo'), tabelas = $('relTabelas');
  if (!banco || !tabelas) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Dropdown de múltipla escolha reutilizado pelos filtros Regional,
     Município, Zona e Bairro (ver .rel-multi no css/eleicoes.css): mostra
     "Todas"/"Todos" com nada marcado (equivale ao filtro antigo em branco),
     o nome de quem estiver marcado sozinho, ou "N selecionados". Só um menu
     fica aberto por vez. */
  var fecharAbertos = [];
  function fecharTodosMenus(excetoFechar) {
    fecharAbertos.forEach(function (f) { if (f !== excetoFechar) f(); });
  }
  function criarMultiSelect(prefixo, rotuloTodos, aoMudar) {
    var campo = $(prefixo + 'Campo'), btn = $(prefixo + 'Btn'), menu = $(prefixo + 'Menu');
    var opcoes = [];
    function caixas() { return Array.prototype.slice.call(menu.querySelectorAll('input[type="checkbox"]')); }
    function selecionados() { return caixas().filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); }
    function atualizarBotao() {
      var sel = selecionados();
      if (!sel.length) { btn.textContent = rotuloTodos; return; }
      if (sel.length === 1) {
        var o = opcoes.filter(function (o) { return o.value === sel[0]; })[0];
        btn.textContent = o ? o.label : sel[0];
        return;
      }
      btn.textContent = sel.length + ' selecionados';
    }
    function fechar() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    function abrir() { fecharTodosMenus(fechar); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); if (menu.hidden) abrir(); else fechar(); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !campo.contains(e.target)) fechar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { fechar(); btn.focus(); } });
    fecharAbertos.push(fechar);
    function definirOpcoes(lista) {
      var marcados = {};
      selecionados().forEach(function (v) { marcados[v] = true; });
      opcoes = lista;
      menu.innerHTML = lista.length ? lista.map(function (o) {
        return '<label><input type="checkbox" value="' + esc(o.value) + '"' + (marcados[o.value] ? ' checked' : '') + '> ' + esc(o.label) + '</label>';
      }).join('') : '<p class="rel-multi-vazio">Nada disponível com os outros filtros.</p>';
      caixas().forEach(function (c) { c.addEventListener('change', function () { atualizarBotao(); if (aoMudar) aoMudar(); }); });
      atualizarBotao();
    }
    return { definirOpcoes: definirOpcoes, selecionados: selecionados };
  }
  var msRegional = criarMultiSelect('relRegional', 'Todas', function () { renderizar(); });
  var msMunicipio = criarMultiSelect('relMunicipio', 'Todos', function () { renderizar(); });
  var msZona = criarMultiSelect('relZona', 'Todas', function () { renderizar(); });
  var msBairro = criarMultiSelect('relBairro', 'Todos', function () { renderizar(); });

  /* "Agrupar por": dropdown com caixas de marcar (não dá pra selecionar mais
     de um item num <select> comum sem ficar feio/confuso) — o botão abre o
     menu, mostra o que já está marcado e fecha ao clicar fora ou Esc. A ordem
     de cima pra baixo no menu É a ordem de aninhamento no relatório (o de
     cima vira a seção mais externa); as setas ▲▼ reordenam as linhas do
     menu, então "quem está marcado, na ordem que aparece" já responde tanto
     "o quê" quanto "em que ordem" agrupar — sem precisar de outro controle. */
  function modosSelecionados() {
    return agruparItens.filter(function (it) { return it.querySelector('input').checked; })
      .map(function (it) { return it.dataset.valor; });
  }
  function atualizarBotaoAgrupar() {
    var modos = modosSelecionados();
    agruparBtn.textContent = modos.length ? modos.map(function (m) { return ROTULO_GRUPO[m]; }).join(' + ') : 'Sem agrupar';
  }
  function atualizarSetas() {
    agruparItens.forEach(function (it, i) {
      it.querySelector('[data-mover="cima"]').disabled = i === 0;
      it.querySelector('[data-mover="baixo"]').disabled = i === agruparItens.length - 1;
    });
  }
  function fecharMenuAgrupar() { agruparMenu.hidden = true; agruparBtn.setAttribute('aria-expanded', 'false'); }
  function abrirMenuAgrupar(abrir) {
    if (abrir) fecharTodosMenus(fecharMenuAgrupar);
    agruparMenu.hidden = !abrir;
    agruparBtn.setAttribute('aria-expanded', String(abrir));
  }
  fecharAbertos.push(fecharMenuAgrupar);
  agruparBtn.addEventListener('click', function (e) { e.stopPropagation(); abrirMenuAgrupar(agruparMenu.hidden); });
  document.addEventListener('click', function (e) { if (!agruparMenu.hidden && !agruparCampo.contains(e.target)) abrirMenuAgrupar(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !agruparMenu.hidden) { abrirMenuAgrupar(false); agruparBtn.focus(); } });
  agruparItens.forEach(function (it) {
    it.querySelector('input').addEventListener('change', function () { atualizarBotaoAgrupar(); renderizar(); });
    it.querySelector('[data-mover="cima"]').addEventListener('click', function () {
      var anterior = it.previousElementSibling;
      if (anterior) { agruparMenu.insertBefore(it, anterior); agruparItens = Array.prototype.slice.call(agruparMenu.querySelectorAll('.rel-agrupar-item')); atualizarSetas(); atualizarBotaoAgrupar(); renderizar(); }
    });
    it.querySelector('[data-mover="baixo"]').addEventListener('click', function () {
      var proximo = it.nextElementSibling;
      if (proximo) { agruparMenu.insertBefore(proximo, it); agruparItens = Array.prototype.slice.call(agruparMenu.querySelectorAll('.rel-agrupar-item')); atualizarSetas(); atualizarBotaoAgrupar(); renderizar(); }
    });
  });
  atualizarSetas();

  var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  var ROTULO_GRUPO = { geral: 'Geral', municipio: 'Município', regional: 'Regional', zona: 'Zona', secao: 'Seção', bairro: 'Bairro' };
  var COLUNAS = ['Nome', 'Telefone', 'Município', 'Regional', 'Bairro', 'Zona', 'Seção', 'Local de votação'];
  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : []).map(function (m) { return [String(m.id), m.nome]; }));
  var regionalDe = function (mun) { return (window.REGIONAIS_MUNICIPIOS && window.REGIONAIS_MUNICIPIOS[mun]) || ''; };
  var canonico = function (n) { return String(n || '').replace(/^0+/, ''); };
  var cmp = function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); };

  /* ------------------------------------------------------------- filtros */
  msRegional.definirOpcoes((window.REGIONAIS || []).map(function (r) { return { value: r, label: r }; }));
  msMunicipio.definirOpcoes(Array.from(nomesMun.entries()).sort(function (a, b) { return cmp(a[1], b[1]); })
    .map(function (m) { return { value: m[0], label: m[1] }; }));
  var zonas = Array.from(new Set((window.LOCAIS_VOTACAO ? window.LOCAIS_VOTACAO.locais : []).map(function (l) { return canonico(l.zona); })))
    .sort(function (a, b) { return Number(a) - Number(b); });
  msZona.definirOpcoes(zonas.map(function (z) { return { value: z, label: 'Zona ' + z }; }));

  function ler() { try { return banco.ler(); } catch (e) { status.textContent = e.message; return null; } }

  // Bairros disponíveis no filtro: os dos fiscais que passam pelos outros
  // filtros (regional/município/zona), pra lista não ficar enorme. Só sem
  // ambiguidade (exatamente 1 município marcado) o nome vem sozinho —
  // com 0 ou 2+ municípios, mostra "bairro — município" pra não confundir
  // bairros de mesmo nome em cidades diferentes (ex.: Centro).
  function atualizarOpcoesBairro(registros) {
    var semAmbiguidade = msMunicipio.selecionados().length === 1;
    var vistos = new Map();
    registros.forEach(function (r) {
      var b = (r.bairro || '').trim();
      if (!b) return;
      var chave = r.municipio + '|' + b.toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, { value: chave, label: semAmbiguidade ? b : b + ' — ' + (nomesMun.get(r.municipio) || r.municipio) });
    });
    var ops = Array.from(vistos.values()).sort(function (a, b) { return cmp(a.label, b.label); });
    msBairro.definirOpcoes(ops);
  }

  function filtrar(registros, comBairro) {
    var regionais = msRegional.selecionados(), municipios = msMunicipio.selecionados(),
      zonasSel = msZona.selecionados(), bairros = msBairro.selecionados();
    var texto = campoBusca.value.trim().toLowerCase(), digitos = texto.replace(/\D/g, '');
    return registros.filter(function (r) {
      if (regionais.length && regionais.indexOf(regionalDe(r.municipio)) === -1) return false;
      if (municipios.length && municipios.indexOf(r.municipio) === -1) return false;
      if (zonasSel.length && zonasSel.indexOf(canonico(r.zona)) === -1) return false;
      if (comBairro && bairros.length && bairros.indexOf(r.municipio + '|' + (r.bairro || '').trim().toLowerCase()) === -1) return false;
      if (!texto) return true;
      return (r.nome || '').toLowerCase().indexOf(texto) !== -1 ||
        (digitos && (r.telefone || '').replace(/\D/g, '').indexOf(digitos) !== -1);
    });
  }

  /* ----------------------------------------------------------- agrupamento */
  function linha(r) {
    return [r.nome || '', r.telefone || '', nomesMun.get(r.municipio) || r.municipio || '', regionalDe(r.municipio),
      (r.bairro || '').trim(), r.zona ? canonico(r.zona) : '', r.secao || '', r.localVotacao || ''];
  }

  function campoGrupo(r, modo) {
    if (modo === 'municipio') { var n = nomesMun.get(r.municipio) || r.municipio; return { chave: n, titulo: n, ordem: n }; }
    if (modo === 'regional') { var g = regionalDe(r.municipio) || '(sem regional)'; return { chave: g, titulo: g, ordem: g }; }
    if (modo === 'zona') {
      var z = canonico(r.zona);
      return z ? { chave: 'z' + z, titulo: 'Zona ' + z, ordem: ('0000' + z).slice(-4) } : { chave: 'z', titulo: '(sem zona)', ordem: '9999' };
    }
    if (modo === 'secao') {
      var zn = canonico(r.zona), s = (r.secao || '').trim();
      // Número de seção se repete em municípios/zonas diferentes — a chave
      // (que decide o agrupamento) inclui município e zona, mas o título
      // fica só "Seção 0010" porque a tabela abaixo já mostra a coluna Zona.
      return s ? { chave: r.municipio + '|' + zn + '|' + s, titulo: 'Seção ' + s, ordem: ('0000000' + s).slice(-7) }
        : { chave: r.municipio + '|' + zn + '|', titulo: '(sem seção)', ordem: '9999999' };
    }
    var b = (r.bairro || '').trim(), mun = nomesMun.get(r.municipio) || r.municipio;
    // O mesmo nome de bairro existe em mais de um município (ex.: Centro).
    return b ? { chave: r.municipio + '|' + b.toLowerCase(), titulo: b + ' — ' + mun, ordem: mun + '|' + b }
      : { chave: r.municipio + '|', titulo: '(sem bairro) — ' + mun, ordem: mun + '|￿' };
  }

  // Agrupamento em árvore: cada nível escolhido vira uma seção dentro da
  // seção do nível anterior (regional > município > zona > bairro, ou só os
  // níveis marcados, na ordem marcada no menu) — separadas visualmente mas
  // aninhadas, pra ficar claro que uma está dentro da outra. "Folha" é o
  // grupo do último nível, o que de fato mostra a tabela de fiscais.
  function agruparNivel(registros, modos, nivel) {
    var mapa = new Map();
    registros.forEach(function (r) {
      var c = campoGrupo(r, modos[nivel]);
      if (!mapa.has(c.chave)) mapa.set(c.chave, { titulo: c.titulo, ordem: c.ordem, itens: [] });
      mapa.get(c.chave).itens.push(r);
    });
    var grupos = Array.from(mapa.values()).sort(function (a, b) { return cmp(a.ordem, b.ordem); });
    grupos.forEach(function (g) {
      if (nivel + 1 < modos.length) { g.filhos = agruparNivel(g.itens, modos, nivel + 1); }
      else {
        g.filhos = null;
        g.itens.sort(function (a, b) { return cmp(a.nome || '', b.nome || ''); });
        g.linhas = g.itens.map(linha);
      }
    });
    return grupos;
  }

  // Achata a árvore nas folhas, guardando o caminho completo (ex.: ["Baixo
  // Acre", "Rio Branco"]) — usado no resumo, no nome dos arquivos e nas
  // planilhas do Excel.
  function coletarFolhas(grupos, caminhoAnterior) {
    var out = [];
    grupos.forEach(function (g) {
      var caminho = caminhoAnterior.concat([g.titulo]);
      if (g.filhos) out = out.concat(coletarFolhas(g.filhos, caminho));
      else out.push({ titulo: caminho.join(' — '), caminhoArr: caminho, itens: g.itens, linhas: g.linhas });
    });
    return out;
  }

  function rotuloModos(modos) { return modos.map(function (m) { return ROTULO_GRUPO[m].toLowerCase(); }).join(' + '); }

  var atual = { arvore: null, modos: [], folhas: [], total: 0 };
  var folhaIndex;

  // Desenha a árvore em <section> aninhadas — nivel 0 vira h3, nivel 1 h4 e
  // assim por diante (até h6); só as folhas (sem filhos) ganham id, pro
  // resumo poder rolar até elas.
  function renderizarNivel(grupos, nivel) {
    return grupos.map(function (g) {
      var tag = 'h' + Math.min(nivel + 3, 6);
      var cabecalho = '<' + tag + '>' + esc(g.titulo) + ' <span>' + g.itens.length + (g.itens.length === 1 ? ' fiscal' : ' fiscais') + '</span></' + tag + '>';
      if (g.filhos) {
        return '<section class="relatorio-grupo relatorio-nivel-' + nivel + '">' + cabecalho + renderizarNivel(g.filhos, nivel + 1) + '</section>';
      }
      var id = 'rel-folha-' + (folhaIndex++);
      return '<section class="relatorio-grupo relatorio-nivel-' + nivel + ' relatorio-folha" id="' + id + '">' + cabecalho +
        '<div class="relatorio-rolagem"><table class="relatorio-tabela"><thead><tr><th>#</th>' +
        COLUNAS.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
        g.linhas.map(function (l, n) {
          return '<tr><td>' + (n + 1) + '</td>' + l.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></section>';
    }).join('');
  }

  function renderizar() {
    var todos = ler();
    if (!todos) { tabelas.innerHTML = ''; resumo.innerHTML = ''; return; }
    atualizarOpcoesBairro(filtrar(todos, false));
    var registros = filtrar(todos, true), modos = modosSelecionados();
    var arvore = modos.length ? agruparNivel(registros, modos, 0) : null;
    var folhas = arvore ? coletarFolhas(arvore, []) : (function () {
      var itens = registros.slice().sort(function (a, b) { return cmp(a.nome || '', b.nome || ''); });
      return [{ titulo: 'Todos os fiscais', caminhoArr: [], itens: itens, linhas: itens.map(linha) }];
    })();
    atual = { arvore: arvore, modos: modos, folhas: folhas, total: registros.length };
    status.textContent = registros.length + (registros.length === 1 ? ' fiscal' : ' fiscais') +
      (!modos.length ? '' : ' em ' + folhas.length + ' ' + (folhas.length === 1 ? 'grupo' : 'grupos') + ' por ' + rotuloModos(modos)) +
      (registros.length !== todos.length ? ' (de ' + todos.length + ' cadastrados)' : '') + '.';
    resumo.innerHTML = !modos.length ? '' : folhas.map(function (f, i) {
      return '<a href="#rel-folha-' + i + '">' + esc(f.titulo) + ' <b>' + f.itens.length + '</b></a>';
    }).join('');
    if (!registros.length) { tabelas.innerHTML = '<p class="relatorio-vazio">Nenhum fiscal encontrado com esses filtros.</p>'; return; }
    folhaIndex = 0;
    tabelas.innerHTML = arvore ? renderizarNivel(arvore, 0) :
      '<section class="relatorio-grupo relatorio-folha" id="rel-folha-0"><div class="relatorio-rolagem"><table class="relatorio-tabela"><thead><tr><th>#</th>' +
      COLUNAS.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      folhas[0].linhas.map(function (l, n) {
        return '<tr><td>' + (n + 1) + '</td>' + l.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></section>';
  }
  // Os links do resumo rolam dentro do painel (não trocam o hash da aba).
  resumo.addEventListener('click', function (e) {
    var a = e.target.closest('a'); if (!a) return;
    e.preventDefault();
    var alvo = document.querySelector(a.getAttribute('href'));
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ------------------------------------------------------------ exportação */
  function nomeArquivo(ext) {
    var partes = ['fiscais', atual.modos.length ? 'por-' + atual.modos.join('-') : 'geral'];
    var municipios = msMunicipio.selecionados(), regionais = msRegional.selecionados(), zonasSel = msZona.selecionados();
    if (municipios.length === 1) partes.push(nomesMun.get(municipios[0]));
    else if (regionais.length === 1) partes.push(regionais[0]);
    if (zonasSel.length === 1) partes.push('zona-' + zonasSel[0]);
    partes.push(new Date().toISOString().slice(0, 10));
    return partes.join('-').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').toLowerCase() + '.' + ext;
  }
  function baixar(blob, nome) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function semDados() {
    if (atual.total) return false;
    status.textContent = 'Não há fiscais para exportar com esses filtros.'; return true;
  }

  function exportarCSV() {
    if (semDados()) return;
    var cel = function (v) { var t = String(v == null ? '' : v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    // Município, regional, zona e bairro já são colunas — as linhas só saem
    // na ordem das folhas (percorrendo a árvore), sem repetir o grupo numa
    // coluna a mais.
    var linhas = [COLUNAS.map(cel).join(';')];
    atual.folhas.forEach(function (f) {
      f.linhas.forEach(function (l) { linhas.push(l.map(cel).join(';')); });
    });
    baixar(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), nomeArquivo('csv'));
  }

  var carregandoXlsx = null;
  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!carregandoXlsx) carregandoXlsx = new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = XLSX_URL; s.onload = function () { ok(window.XLSX); };
      s.onerror = function () { carregandoXlsx = null; falha(new Error('Não foi possível carregar o gerador de Excel. Verifique a internet ou use Exportar CSV.')); };
      document.head.appendChild(s);
    });
    return carregandoXlsx;
  }
  function exportarExcel(botao) {
    if (semDados()) return;
    botao.disabled = true; var textoAntes = botao.textContent; botao.textContent = 'Gerando…';
    carregarXlsx().then(function (X) {
      var wb = X.utils.book_new(), usados = new Set();
      var nomeAba = function (t) {
        var base = String(t).replace(/[\\\/?*\[\]:]/g, ' ').trim().slice(0, 28) || 'Grupo', nome = base, n = 2;
        while (usados.has(nome.toLowerCase())) nome = base.slice(0, 25) + ' (' + n++ + ')';
        usados.add(nome.toLowerCase()); return nome;
      };
      var larguras = [{ wch: 34 }, { wch: 17 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 7 }, { wch: 8 }, { wch: 40 }];
      var folha = function (cab, linhas, cols) { var ws = X.utils.aoa_to_sheet([cab].concat(linhas)); ws['!cols'] = cols; return ws; };
      if (!atual.modos.length) {
        X.utils.book_append_sheet(wb, folha(COLUNAS, atual.folhas[0].linhas, larguras), nomeAba('Fiscais'));
      } else {
        // Resumo com uma coluna por nível (Regional, Município...), na ordem
        // escolhida, mostrando o caminho completo de cada folha — a mesma
        // relação de "um dentro do outro" que aparece na tela e no PDF.
        var rotulos = atual.modos.map(function (m) { return ROTULO_GRUPO[m]; });
        var linhaTotal = rotulos.map(function (_, i) { return i === 0 ? 'Total' : ''; }).concat([atual.total]);
        X.utils.book_append_sheet(wb, folha(rotulos.concat(['Fiscais']),
          atual.folhas.map(function (f) { return f.caminhoArr.concat([f.itens.length]); }).concat([linhaTotal]),
          rotulos.map(function () { return { wch: 26 }; }).concat([{ wch: 10 }])), nomeAba('Resumo'));
        var todas = [];
        atual.folhas.forEach(function (f) { todas.push.apply(todas, f.linhas); });
        X.utils.book_append_sheet(wb, folha(COLUNAS, todas, larguras), nomeAba('Todos'));
        atual.folhas.forEach(function (f) { X.utils.book_append_sheet(wb, folha(COLUNAS, f.linhas, larguras), nomeAba(f.titulo)); });
      }
      X.writeFile(wb, nomeArquivo('xlsx'));
    }).catch(function (e) { status.textContent = e.message; })
      .then(function () { botao.disabled = false; botao.textContent = textoAntes; });
  }

  function imprimir() {
    if (semDados()) return;
    document.body.classList.add('imprimindo-relatorio');
    var sair = function () { document.body.classList.remove('imprimindo-relatorio'); window.removeEventListener('afterprint', sair); };
    window.addEventListener('afterprint', sair);
    window.print();
  }

  campoBusca.addEventListener('input', renderizar);
  $('relCSV').addEventListener('click', exportarCSV);
  $('relExcel').addEventListener('click', function (e) { exportarExcel(e.currentTarget); });
  $('relImprimir').addEventListener('click', imprimir);
  window.addEventListener('banco-atualizado', renderizar);
  atualizarBotaoAgrupar();
  renderizar();
})();
