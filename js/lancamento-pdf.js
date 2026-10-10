/* PDFs dos lançamentos de mecanização/açudagem.
   - listagem(): a lista da tela (com os filtros ativos), A4 paisagem, tabela
     paginada com cabeçalho repetido, totais e número de página.
   - ficha(): um lançamento só (o "olho" da lista), A4 retrato, seção por seção.
   Os dois usam o mesmo desenho (faixa azul no topo, tabelas com linhas finas) do
   relatório geral do painel. jsPDF e autoTable vêm de CDN, sob demanda. */
(function () {
  'use strict';

  var LIBS = {
    jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
    autotable: ['https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js']
  };
  var AZUL = [46, 79, 125], CINZA = [107, 120, 133], TINTA = [27, 36, 48];

  function carregarLib(urls, pronto) {
    return new Promise(function (ok, falha) {
      if (pronto()) return ok();
      var i = 0;
      (function tenta() {
        if (i >= urls.length) return falha(new Error('Não foi possível carregar a biblioteca de PDF (verifique a internet).'));
        var s = document.createElement('script');
        s.src = urls[i++];
        s.onload = function () { if (pronto()) ok(); else tenta(); };
        s.onerror = tenta;
        document.head.appendChild(s);
      })();
    });
  }

  function carregarPdf() {
    return carregarLib(LIBS.jspdf, function () { return window.jspdf && window.jspdf.jsPDF; })
      .then(function () {
        return carregarLib(LIBS.autotable, function () {
          return window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable;
        });
      });
  }

  /* ---------------------------------------------------------- utilidades */
  function txt(v) { return v == null || v === '' ? '—' : String(v); }
  function num(v, dec) {
    var n = parseFloat(v);
    if (!isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec == null ? 2 : dec });
  }
  function dataBr(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
  }
  function dataHora(iso) {
    if (window.DATA_BR && window.DATA_BR.dataHoraBr) return window.DATA_BR.dataHoraBr(iso) || '—';
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR');
  }
  function agora() {
    var d = new Date();
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function arquivoSeguro(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lancamento';
  }
  function hojeArquivo() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nomeDoEmail(email) {
    var u = String(email || '').split('@')[0].replace(/\d+/g, ' ').replace(/[._-]+/g, ' ').trim();
    return u.replace(/\S+/g, function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }) || String(email || '');
  }

  /** Faixa azul do topo; devolve o Y onde o conteúdo pode começar. */
  function cabecalho(doc, PW, M, titulo, linhas) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    var CW = PW - 2 * M, quebradas = [];
    linhas.forEach(function (l) { quebradas = quebradas.concat(doc.splitTextToSize(l, CW)); });
    var alt = 18 + quebradas.length * 4.6 + 3;
    doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.rect(0, 0, PW, alt, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(titulo, M, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    quebradas.forEach(function (l, i) { doc.text(l, M, 19 + i * 4.6); });
    return alt + 7;
  }

  /** "Página X de Y" e a data de geração, em todas as páginas. */
  function rodape(doc, PW, PH, M, nota) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]);
      doc.text(nota, M, PH - 7);
      doc.text('Página ' + i + ' de ' + n, PW - M, PH - 7, { align: 'right' });
    }
  }

  /* ------------------------------------------------------- listagem (PDF) */
  /** linhas: [[salvoEm, lancadoPor, servico, beneficiario, municipio, escritorio,
      vistoria, ha, h, acudes], …]  |  info: { filtros:[], total, trecho } */
  function listagem(linhas, info) {
    info = info || {};
    return carregarPdf().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
      var PW = 297, PH = 210, M = 10;

      var cab = ['Gerado em ' + agora() + '  |  ' + linhas.length.toLocaleString('pt-BR') + ' lançamento' + (linhas.length === 1 ? '' : 's') +
        (info.total && info.total !== linhas.length ? ' (de ' + info.total.toLocaleString('pt-BR') + ' no filtro)' : '')];
      cab.push('Filtros: ' + (info.filtros && info.filtros.length ? info.filtros.join('  ·  ') : 'nenhum (todos os lançamentos)'));
      if (info.trecho) cab.push(info.trecho);
      var y = cabecalho(doc, PW, M, 'Lançamentos de mecanização e açudagem', cab);

      var somaHa = 0, somaH = 0, somaAc = 0;
      linhas.forEach(function (r) {
        somaHa += parseFloat(r[7]) || 0; somaH += parseFloat(r[8]) || 0; somaAc += parseFloat(r[9]) || 0;
      });
      var corpo = linhas.map(function (r) {
        function med(v, dec) { return v === '-' || v === '' || v == null ? '-' : num(v, dec); }
        return [r[0], r[1], r[2], r[3], r[4], r[5], r[6], med(r[7], 1), med(r[8], 1), med(r[9], 0)];
      });
      corpo.push(['Totais', '', '', '', '', '', '', num(somaHa, 1), num(somaH, 1), num(somaAc, 0)]);

      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: 14, bottom: 14 },
        head: [['Salvo em', 'Lançado por', 'Serviço', 'Beneficiário', 'Município', 'Escritório', 'Vistoria', 'ha', 'h', 'Açudes']],
        body: corpo, theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: TINTA,
          lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [238, 242, 244], textColor: [74, 85, 97], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 251, 252] },
        columnStyles: {
          0: { cellWidth: 27 }, 1: { cellWidth: 33 }, 2: { cellWidth: 20 }, 3: { cellWidth: 62 },
          4: { cellWidth: 28 }, 5: { cellWidth: 46 }, 6: { cellWidth: 20 },
          7: { halign: 'right', cellWidth: 14 }, 8: { halign: 'right', cellWidth: 12 }, 9: { halign: 'right', cellWidth: 15 }
        },
        didParseCell: function (d) {
          if (d.section === 'head' && d.column.index >= 7) d.cell.styles.halign = 'right';
          if (d.section === 'body' && d.row.index === corpo.length - 1) {
            d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [238, 242, 244];
          }
        }
      });
      rodape(doc, PW, PH, M, 'SEAGRI — Lançamentos de mecanização e açudagem');
      doc.save('lancamentos-' + hojeArquivo() + '.pdf');
    });
  }

  /* --------------------------------------------------------- ficha (PDF) */
  var SEXO = { F: 'Feminino', M: 'Masculino' };

  /* A ficha usa a altura da página: monta com uma "folga" k (padding das células,
     fonte e espaço entre seções) e tenta da maior para a menor até caber em UMA
     página. Se nem com k = 1 couber (muitas culturas/DAEs), segue em mais páginas. */
  function fichaMontar(d, info, k) {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var PW = 210, PH = 297, M = 14, CW = PW - 2 * M;
    var por = info.lancadoPor || nomeDoEmail(d.criado_por_email);
    var PAD = 2.8 * k, FS = 9.5 + (k - 1) * 1.1, GAP = 7 * k, TOPO = 5.5 * k;

    var y = cabecalho(doc, PW, M, 'Ficha de vistoria — ' + txt(d.tipo_servico), [
      txt(d.nome_beneficiario) + '  |  ' + txt(d.municipio) + '  |  Vistoria em ' + dataBr(d.data_vistoria),
      'Salvo em ' + dataHora(d.criado_em) + (por ? ' por ' + por : '') + '  |  Gerado em ' + agora()
    ]);
    y += 2 * (k - 1);

    function secao(titulo) {
      if (y > PH - 40) { doc.addPage(); y = 16; }
      doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5 + (k - 1) * 1.2);
      doc.text(titulo, M, y);
      doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]); doc.setLineWidth(0.4);
      doc.line(M, y + 1.8, M + CW, y + 1.8);
      y += TOPO;
    }

    /** Pares rótulo/valor em 2 colunas de pares (4 colunas de tabela). */
    function pares(lista) {
      var corpo = [];
      for (var i = 0; i < lista.length; i += 2) {
        var a = lista[i], b = lista[i + 1] || ['', ''];
        corpo.push([a[0], txt(a[1]), b[0], b[1] === '' ? '' : txt(b[1])]);
      }
      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: 16, bottom: 16 }, body: corpo, theme: 'grid',
        styles: { font: 'helvetica', fontSize: FS, cellPadding: PAD, textColor: TINTA,
          lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak', valign: 'middle' },
        columnStyles: {
          0: { cellWidth: 36, fontStyle: 'bold', fillColor: [244, 246, 248], textColor: [74, 85, 97] },
          1: { cellWidth: CW / 2 - 36 },
          2: { cellWidth: 36, fontStyle: 'bold', fillColor: [244, 246, 248], textColor: [74, 85, 97] },
          3: { cellWidth: CW / 2 - 36 }
        }
      });
      y = doc.lastAutoTable.finalY + GAP;
    }

    function tabela(cab, linhas, cols) {
      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: 16, bottom: 16 }, head: [cab], body: linhas, theme: 'grid',
        styles: { font: 'helvetica', fontSize: FS, cellPadding: PAD, textColor: TINTA,
          lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [238, 242, 244], textColor: [74, 85, 97], fontStyle: 'bold' },
        columnStyles: cols || {}
      });
      y = doc.lastAutoTable.finalY + GAP;
    }

    function lista(v) { return Array.isArray(v) && v.length ? v.join(', ') : '—'; }
    var indigena = d.indigena === true ? 'Sim' : d.indigena === false ? 'Não' : '—';

    secao('1. Serviço e vistoria');
    pares([
      ['Serviço', d.tipo_servico], ['Data da vistoria', dataBr(d.data_vistoria)],
      ['Município', d.municipio], ['Escritório local', d.escritorio_local],
      ['Responsável técnico', d.responsavel_tecnico], ['Ponto de controle', d.ponto_controle]
    ]);

    secao('2. Beneficiário');
    pares([
      ['Nome', d.nome_beneficiario], ['CPF', fmtCpf(d.cpf)],
      ['Nascimento', dataBr(d.data_nascimento)], ['Telefone', d.telefone],
      ['Estado civil', d.estado_civil], ['Sexo', SEXO[d.sexo] || d.sexo],
      ['Possui CAF', d.possui_dap], ['Indígena', indigena + (d.etnia ? ' — ' + d.etnia : '')],
      ['Associação / coop.', d.associacao_cooperativa || 'Não informado'], ['', '']
    ]);

    secao('3. Unidade produtiva');
    pares([['Endereço', d.endereco], ['Propriedade', d.nome_propriedade], ['Município', d.municipio], ['', '']]);

    var culturas = Array.isArray(d.culturas) ? d.culturas : [];
    if (d.tipo_servico === 'Açudagem') {
      secao('4. Açudagem');
      pares([['Horas de máquina', num(d.horas_maquina, 1)], ['Tanques / açudes', num(d.quantidade_acudes, 0)]]);
    } else {
      secao('4. Área mecanizada e culturas');
      if (culturas.length) {
        tabela(['Cultura', 'Área (ha)', 'Sistema de cultivo'], culturas.map(function (c) {
          return [txt(c.cultura), num(c.area_ha, 2), txt(c.sistema_cultivo)];
        }), { 1: { halign: 'right', cellWidth: 30 } });
      }
      pares([['Área total (ha)', num(d.area_total_ha, 2)], ['', '']]);
    }

    var geo = (Array.isArray(d.pontos_geo) && d.pontos_geo[0]) || null;
    if (geo) {
      secao('5. Georreferenciamento (UTM WGS84)');
      pares([['X', geo.x], ['Y', geo.y], ['Zona', geo.zona], ['', '']]);
    }

    secao('6. Maquinário');
    pares([
      ['Tipo de trator', d.tipo_trator], ['Uso', d.tipo_uso],
      ['Nº identificação', d.num_identificacao_patrimonio], ['', ''],
      ['Máquinas', lista(d.maquinas)], ['Implementos', lista(d.implementos)]
    ]);

    var daes = Array.isArray(d.daes) ? d.daes : [];
    if (daes.length) {
      secao('7. DAE');
      var totalDae = 0;
      var linhasDae = daes.map(function (x) {
        totalDae += parseFloat(x.valor) || 0;
        return [txt(x.numero), 'R$ ' + num(x.valor, 2)];
      });
      linhasDae.push(['Total', 'R$ ' + num(totalDae, 2)]);
      tabela(['Nº da DAE', 'Valor'], linhasDae, { 1: { halign: 'right', cellWidth: 44 } });
    }

    if (d.observacao) {
      secao('Observação');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(FS + 0.5); doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
      doc.splitTextToSize(String(d.observacao), CW).forEach(function (l) {
        if (y > PH - 20) { doc.addPage(); y = 16; }
        doc.text(l, M, y); y += 5 * k;
      });
    }
    return { doc: doc, fimY: y, PW: PW, PH: PH, M: M };
  }

  function fmtCpf(v) {
    var s = String(v || '').replace(/\D/g, '');
    if (s.length !== 11) return v;
    return s.slice(0, 3) + '.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-' + s.slice(9);
  }

  function ficha(d, info) {
    info = info || {};
    return carregarPdf().then(function () {
      // maior folga que ainda cabe em uma página (de 1,9 a 0,7)
      var tentativas = [1.9, 1.75, 1.6, 1.45, 1.3, 1.18, 1.08, 1.0, 0.9, 0.8, 0.7], escolhido = null;
      for (var i = 0; i < tentativas.length; i++) {
        var m = fichaMontar(d, info, tentativas[i]);
        if (m.doc.getNumberOfPages() === 1 && m.fimY <= m.PH - 16) { escolhido = m; break; }
        if (i === tentativas.length - 1) escolhido = m;   // nem com 0,7 cabe: segue em mais páginas
      }
      rodape(escolhido.doc, escolhido.PW, escolhido.PH, escolhido.M, 'SEAGRI — Ficha de vistoria');
      escolhido.doc.save('ficha-' + arquivoSeguro(d.nome_beneficiario) + '-' + hojeArquivo() + '.pdf');
    });
  }

  window.LANCAMENTO_PDF = { listagem: listagem, ficha: ficha };
})();
