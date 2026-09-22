/* Aba "Relatório" de eleicoes.html: lista em tabelas os fiscais cadastrados,
   agrupados por município, regional, zona, bairro ou sem agrupar (geral),
   com filtros e exportação em CSV, Excel (uma planilha por grupo + resumo)
   e impressão/PDF. Só lê window.BANCO_ELEICOES.ler() — não altera nada. */
(function () {
  'use strict';
  var banco = window.BANCO_ELEICOES;
  var $ = function (id) { return document.getElementById(id); };
  var selAgrupar = $('relAgrupar'), selRegional = $('relRegional'), selMunicipio = $('relMunicipio');
  var selZona = $('relZona'), selBairro = $('relBairro'), campoBusca = $('relBusca');
  var status = $('relStatus'), resumo = $('relResumo'), tabelas = $('relTabelas');
  if (!banco || !tabelas) return;

  var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  var ROTULO_GRUPO = { geral: 'Geral', municipio: 'Município', regional: 'Regional', zona: 'Zona', bairro: 'Bairro' };
  var COLUNAS = ['Nome', 'Telefone', 'Município', 'Regional', 'Bairro', 'Zona', 'Seção', 'Local de votação'];
  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : []).map(function (m) { return [String(m.id), m.nome]; }));
  var regionalDe = function (mun) { return (window.REGIONAIS_MUNICIPIOS && window.REGIONAIS_MUNICIPIOS[mun]) || ''; };
  var canonico = function (n) { return String(n || '').replace(/^0+/, ''); };
  var cmp = function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------- filtros */
  (window.REGIONAIS || []).forEach(function (r) { selRegional.add(new Option(r, r)); });
  Array.from(nomesMun.entries()).sort(function (a, b) { return cmp(a[1], b[1]); })
    .forEach(function (m) { selMunicipio.add(new Option(m[1], m[0])); });
  var zonas = Array.from(new Set((window.LOCAIS_VOTACAO ? window.LOCAIS_VOTACAO.locais : []).map(function (l) { return canonico(l.zona); })))
    .sort(function (a, b) { return Number(a) - Number(b); });
  zonas.forEach(function (z) { selZona.add(new Option('Zona ' + z, z)); });

  function ler() { try { return banco.ler(); } catch (e) { status.textContent = e.message; return null; } }

  // Bairros disponíveis no filtro: os dos fiscais que passam pelos outros
  // filtros (regional/município/zona), pra lista não ficar enorme.
  function atualizarOpcoesBairro(registros) {
    var atual = selBairro.value;
    var vistos = new Map();
    registros.forEach(function (r) {
      var b = (r.bairro || '').trim();
      if (!b) return;
      var chave = r.municipio + '|' + b.toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, { valor: chave, texto: selMunicipio.value ? b : b + ' — ' + (nomesMun.get(r.municipio) || r.municipio) });
    });
    var ops = Array.from(vistos.values()).sort(function (a, b) { return cmp(a.texto, b.texto); });
    selBairro.replaceChildren(new Option('Todos', ''));
    ops.forEach(function (o) { selBairro.add(new Option(o.texto, o.valor)); });
    selBairro.value = vistos.has(atual) ? atual : '';
  }

  function filtrar(registros, comBairro) {
    var texto = campoBusca.value.trim().toLowerCase(), digitos = texto.replace(/\D/g, '');
    return registros.filter(function (r) {
      if (selRegional.value && regionalDe(r.municipio) !== selRegional.value) return false;
      if (selMunicipio.value && r.municipio !== selMunicipio.value) return false;
      if (selZona.value && canonico(r.zona) !== selZona.value) return false;
      if (comBairro && selBairro.value && r.municipio + '|' + (r.bairro || '').trim().toLowerCase() !== selBairro.value) return false;
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

  function grupoDe(r, modo) {
    if (modo === 'municipio') { var n = nomesMun.get(r.municipio) || r.municipio; return { chave: n, titulo: n, ordem: n }; }
    if (modo === 'regional') { var g = regionalDe(r.municipio) || '(sem regional)'; return { chave: g, titulo: g, ordem: g }; }
    if (modo === 'zona') {
      var z = canonico(r.zona);
      return z ? { chave: 'z' + z, titulo: 'Zona ' + z, ordem: ('0000' + z).slice(-4) } : { chave: 'z', titulo: '(sem zona)', ordem: '9999' };
    }
    if (modo === 'bairro') {
      var b = (r.bairro || '').trim(), mun = nomesMun.get(r.municipio) || r.municipio;
      // O mesmo nome de bairro existe em mais de um município (ex.: Centro).
      return b ? { chave: r.municipio + '|' + b.toLowerCase(), titulo: b + ' — ' + mun, ordem: mun + '|' + b }
        : { chave: r.municipio + '|', titulo: '(sem bairro) — ' + mun, ordem: mun + '|￿' };
    }
    return { chave: 'geral', titulo: 'Todos os fiscais', ordem: '' };
  }

  function agrupar(registros, modo) {
    var mapa = new Map();
    registros.forEach(function (r) {
      var g = grupoDe(r, modo);
      if (!mapa.has(g.chave)) mapa.set(g.chave, { titulo: g.titulo, ordem: g.ordem, itens: [] });
      mapa.get(g.chave).itens.push(r);
    });
    var grupos = Array.from(mapa.values()).sort(function (a, b) { return cmp(a.ordem, b.ordem); });
    grupos.forEach(function (g) {
      g.itens.sort(function (a, b) { return cmp(a.nome || '', b.nome || ''); });
      g.linhas = g.itens.map(linha);
    });
    return grupos;
  }

  var atual = { grupos: [], modo: 'geral', total: 0 };

  function renderizar() {
    var todos = ler();
    if (!todos) { tabelas.innerHTML = ''; resumo.innerHTML = ''; return; }
    atualizarOpcoesBairro(filtrar(todos, false));
    var registros = filtrar(todos, true), modo = selAgrupar.value;
    var grupos = agrupar(registros, modo);
    atual = { grupos: grupos, modo: modo, total: registros.length };
    status.textContent = registros.length + (registros.length === 1 ? ' fiscal' : ' fiscais') +
      (modo === 'geral' ? '' : ' em ' + grupos.length + ' ' + (grupos.length === 1 ? 'grupo' : 'grupos') + ' por ' + ROTULO_GRUPO[modo].toLowerCase()) +
      (registros.length !== todos.length ? ' (de ' + todos.length + ' cadastrados)' : '') + '.';
    resumo.innerHTML = modo === 'geral' ? '' : grupos.map(function (g, i) {
      return '<a href="#rel-grupo-' + i + '">' + esc(g.titulo) + ' <b>' + g.itens.length + '</b></a>';
    }).join('');
    if (!registros.length) { tabelas.innerHTML = '<p class="relatorio-vazio">Nenhum fiscal encontrado com esses filtros.</p>'; return; }
    tabelas.innerHTML = grupos.map(function (g, i) {
      return '<section class="relatorio-grupo" id="rel-grupo-' + i + '">' +
        (modo === 'geral' ? '' : '<h3>' + esc(g.titulo) + ' <span>' + g.itens.length + (g.itens.length === 1 ? ' fiscal' : ' fiscais') + '</span></h3>') +
        '<div class="relatorio-rolagem"><table class="relatorio-tabela"><thead><tr><th>#</th>' +
        COLUNAS.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
        g.linhas.map(function (l, n) {
          return '<tr><td>' + (n + 1) + '</td>' + l.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></section>';
    }).join('');
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
    var partes = ['fiscais', atual.modo === 'geral' ? 'geral' : 'por-' + atual.modo];
    if (selMunicipio.value) partes.push(nomesMun.get(selMunicipio.value));
    else if (selRegional.value) partes.push(selRegional.value);
    if (selZona.value) partes.push('zona-' + selZona.value);
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
    // na ordem dos grupos, sem repetir o grupo numa coluna a mais.
    var linhas = [COLUNAS.map(cel).join(';')];
    atual.grupos.forEach(function (g) {
      g.linhas.forEach(function (l) { linhas.push(l.map(cel).join(';')); });
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
      if (atual.modo === 'geral') {
        X.utils.book_append_sheet(wb, folha(COLUNAS, atual.grupos[0].linhas, larguras), nomeAba('Fiscais'));
      } else {
        var rot = ROTULO_GRUPO[atual.modo];
        X.utils.book_append_sheet(wb, folha([rot, 'Fiscais'], atual.grupos.map(function (g) { return [g.titulo, g.itens.length]; })
          .concat([['Total', atual.total]]), [{ wch: 40 }, { wch: 10 }]), nomeAba('Resumo'));
        var todas = [];
        atual.grupos.forEach(function (g) { todas.push.apply(todas, g.linhas); });
        X.utils.book_append_sheet(wb, folha(COLUNAS, todas, larguras), nomeAba('Todos'));
        atual.grupos.forEach(function (g) { X.utils.book_append_sheet(wb, folha(COLUNAS, g.linhas, larguras), nomeAba(g.titulo)); });
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

  [selAgrupar, selRegional, selMunicipio, selZona, selBairro].forEach(function (el) { el.addEventListener('change', renderizar); });
  campoBusca.addEventListener('input', renderizar);
  $('relCSV').addEventListener('click', exportarCSV);
  $('relExcel').addEventListener('click', function (e) { exportarExcel(e.currentTarget); });
  $('relImprimir').addEventListener('click', imprimir);
  window.addEventListener('banco-atualizado', renderizar);
  renderizar();
})();
