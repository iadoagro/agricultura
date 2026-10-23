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

  /* ------------------------------------------------ por dia e por mês (PDF) */
  var FUSO = 'America/Rio_Branco';
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
  var fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  function diaDe(iso) { var d = new Date(iso); return isNaN(d) ? '' : fmtDia.format(d); }   // aaaa-mm-dd no fuso do Acre
  function horaDe(iso) { var d = new Date(iso); return isNaN(d) ? '—' : fmtHora.format(d); }
  function diaExtenso(dia) {
    var d = new Date(dia + 'T12:00:00Z');
    return dataBr(dia) + ' (' + d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' }) + ')';
  }
  function somar(lista) {
    var t = { n: 0, mec: 0, acu: 0, ha: 0, h: 0, acudes: 0, benef: {}, mun: {} };
    lista.forEach(function (r) {
      t.n++;
      if (r.tipo_servico === 'Açudagem') t.acu++; else t.mec++;
      t.ha += parseFloat(r.area_total_ha) || 0; t.h += parseFloat(r.horas_maquina) || 0; t.acudes += parseFloat(r.quantidade_acudes) || 0;
      if (r.nome_beneficiario) t.benef[String(r.nome_beneficiario).toLowerCase()] = 1;
      if (r.municipio) t.mun[r.municipio] = 1;
    });
    t.nBenef = Object.keys(t.benef).length; t.nMun = Object.keys(t.mun).length;
    return t;
  }

  /** Todos os relatórios lançados por uma pessoa: um resumo geral por mês na primeira página e, para cada mês,
      uma página de relatório mensal seguida dos lançamentos separados por dia (pela data em que foram salvos).
      registros: linhas da lista (criado_em, tipo_servico, nome_beneficiario, municipio, escritorio_local,
      data_vistoria, area_total_ha, horas_maquina, quantidade_acudes)  |  info: { pessoa } */
  function porDia(registros, info) {
    info = info || {};
    var pessoa = info.pessoa || 'Lançador';
    return carregarPdf().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });   // retrato, como a ficha e o relatório do painel
      var PW = 210, PH = 297, M = 14, CW = PW - 2 * M;
      var estilo = { font: 'helvetica', fontSize: 7.8, cellPadding: 1.6, textColor: TINTA,
        lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak', valign: 'middle' };
      var cabTab = { fillColor: [238, 242, 244], textColor: [74, 85, 97], fontStyle: 'bold' };
      var margem = { left: M, right: M, top: 16, bottom: 16 };

      // agrupa: mês -> dia -> registros (ordem cronológica)
      var meses = {};
      registros.slice().sort(function (a, b) { return String(a.criado_em).localeCompare(String(b.criado_em)); }).forEach(function (r) {
        var dia = diaDe(r.criado_em);
        if (!dia) return;
        var mes = dia.slice(0, 7);
        ((meses[mes] = meses[mes] || {})[dia] = meses[mes][dia] || []).push(r);
      });
      var chavesMes = Object.keys(meses).sort();
      var todos = registros.filter(function (r) { return diaDe(r.criado_em); });
      var geral = somar(todos);
      var nDias = chavesMes.reduce(function (s, m) { return s + Object.keys(meses[m]).length; }, 0);
      var primeiroDia = Object.keys(meses[chavesMes[0]]).sort()[0];
      var ultimoDia = Object.keys(meses[chavesMes[chavesMes.length - 1]]).sort().slice(-1)[0];
      // mês ainda aberto (o de hoje, no horário do Acre): o relatório dele é parcial e não vale como relatório mensal
      var mesAberto = diaDe(new Date().toISOString()).slice(0, 7);
      var tituloDe = function (m) { return MESES[+m.slice(5) - 1] + ' de ' + m.slice(0, 4); };
      var temAberto = !!meses[mesAberto];
      function listaDoMes(m) {
        var l = [];
        Object.keys(meses[m]).forEach(function (d) { l = l.concat(meses[m][d]); });
        return l;
      }

      /** Cartões de indicadores, como no painel (rótulo pequeno em maiúsculas e o valor embaixo); 4 por linha. */
      function cartoes(y, itens) {
        var kw = (CW - 9) / 4, kh = 16;
        itens.forEach(function (k, i) {
          var x = M + (i % 4) * (kw + 3), yy = y + Math.floor(i / 4) * (kh + 3);
          doc.setFillColor(247, 249, 250); doc.setDrawColor(216, 222, 229); doc.setLineWidth(0.2);
          doc.roundedRect(x, yy, kw, kh, 1.5, 1.5, 'FD');
          doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
          doc.text(k[0].toUpperCase(), x + 2.5, yy + 5);
          doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]); doc.setFontSize(11);
          doc.text(String(k[1]), x + 2.5, yy + 12, { maxWidth: kw - 4 });
        });
        return y + Math.ceil(itens.length / 4) * (kh + 3) + 5;
      }
      function secao(titulo, y) {
        doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text(titulo, M, y);
        doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]); doc.setLineWidth(0.4); doc.line(M, y + 1.8, M + CW, y + 1.8);
        return y + 6;
      }
      function tabela(y, cab, corpo, colunas, comTotal) {
        doc.autoTable({
          startY: y, margin: margem, head: [cab], body: corpo, theme: 'grid', styles: estilo, headStyles: cabTab,
          alternateRowStyles: { fillColor: [250, 251, 252] }, columnStyles: colunas,
          didParseCell: function (d) {
            var c = colunas[d.column.index];
            if (d.section === 'head' && c && c.halign === 'right') d.cell.styles.halign = 'right';
            if (comTotal && d.section === 'body' && d.row.index === corpo.length - 1) {
              d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [238, 242, 244];
            }
          }
        });
        return doc.lastAutoTable.finalY;
      }
      var d1 = function (n) { return num(n, 1); };
      var direita = { halign: 'right' };

      // ---- primeira página: resumo geral no estilo do painel
      var y = cabecalho(doc, PW, M, 'Relatórios lançados — ' + pessoa, [
        'Lançamentos de ' + dataBr(primeiroDia) + ' a ' + dataBr(ultimoDia) + '  |  Gerado em ' + agora(),
        'Separados por dia (data em que foram salvos), com um relatório de cada mês'
      ]);
      if (temAberto) {
        var aviso = 'ATENÇÃO: ' + tituloDe(mesAberto) + ' ainda não terminou. O relatório desse mês é PARCIAL e NÃO é válido como relatório mensal. Gere de novo depois do último dia do mês.';
        var linhasAv = doc.splitTextToSize(aviso, CW - 8), altAv = linhasAv.length * 4.6 + 5;
        doc.setFillColor(254, 243, 199); doc.setDrawColor(217, 119, 6); doc.setLineWidth(0.3);
        doc.roundedRect(M, y + 1, CW, altAv, 1.5, 1.5, 'FD');
        doc.setTextColor(146, 64, 14); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        linhasAv.forEach(function (l, i) { doc.text(l, M + 4, y + 6.5 + i * 4.6); });
        y += altAv + 4;
      }
      y = cartoes(y + 1, [
        ['Lançamentos', num(geral.n, 0)], ['Dias com lançamento', num(nDias, 0)],
        ['Beneficiários', num(geral.nBenef, 0)], ['Municípios', num(geral.nMun, 0)],
        ['Mecanização', num(geral.mec, 0)], ['Açudagem', num(geral.acu, 0)],
        ['Hectares', d1(geral.ha) + ' ha'], ['Horas de máquina', d1(geral.h) + ' h']
      ]);
      y = secao('Resumo por mês', y + 1);
      var corpoGeral = chavesMes.map(function (m) {
        var t = somar(listaDoMes(m));
        return [tituloDe(m) + (m === mesAberto ? ' (em andamento)' : ''), num(Object.keys(meses[m]).length, 0), num(t.n, 0), num(t.mec, 0), num(t.acu, 0), d1(t.ha), d1(t.h), num(t.acudes, 0)];
      });
      corpoGeral.push(['Total', num(nDias, 0), num(geral.n, 0), num(geral.mec, 0), num(geral.acu, 0), d1(geral.ha), d1(geral.h), num(geral.acudes, 0)]);
      var yAtual = tabela(y, ['Mês', 'Dias', 'Lançam.', 'Mecaniz.', 'Açudagem', 'ha', 'h', 'Açudes'], corpoGeral,
        { 1: direita, 2: direita, 3: direita, 4: direita, 5: direita, 6: direita, 7: direita }, true) + 10;

      // ---- um relatório por mês, com os dias
      chavesMes.forEach(function (m) {
        var dias = Object.keys(meses[m]).sort();
        var tm = somar(listaDoMes(m));
        var tituloMes = MESES[+m.slice(5) - 1] + ' de ' + m.slice(0, 4);

        // o relatório do mês segue logo depois do anterior; só quebra a página se não houver espaço para o começo dele
        if (yAtual > PH - 95) { doc.addPage(); yAtual = 16; }
        var aberto = m === mesAberto;
        if (aberto) doc.setFillColor(180, 83, 9); else doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
        doc.rect(M, yAtual, CW, 11, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text('Relatório mensal — ' + tituloMes + (aberto ? ' (PARCIAL)' : ''), M + 3, yAtual + 7.3);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text(tm.n + ' lançamento' + (tm.n === 1 ? '' : 's') + ' em ' + dias.length + ' dia' + (dias.length === 1 ? '' : 's'), M + CW - 3, yAtual + 7, { align: 'right' });
        var ym = yAtual + 16;
        if (aberto) {
          doc.setTextColor(146, 64, 14); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
          doc.text('Mês ainda não terminou: este relatório é parcial e não é válido como relatório mensal.', M, yAtual + 16);
          ym += 6;
        }
        ym = cartoes(ym, [
          ['Lançamentos', num(tm.n, 0)], ['Dias com lançamento', num(dias.length, 0)],
          ['Beneficiários', num(tm.nBenef, 0)], ['Municípios', num(tm.nMun, 0)],
          ['Mecanização', num(tm.mec, 0)], ['Açudagem', num(tm.acu, 0)],
          ['Hectares', d1(tm.ha) + ' ha'], ['Horas de máquina', d1(tm.h) + ' h']
        ]);
        ym = secao('Resumo por dia', ym + 1);
        var corpoDias = dias.map(function (d) {
          var t = somar(meses[m][d]);
          return [diaExtenso(d), num(t.n, 0), num(t.mec, 0), num(t.acu, 0), d1(t.ha), d1(t.h), num(t.acudes, 0)];
        });
        corpoDias.push(['Total do mês', num(tm.n, 0), num(tm.mec, 0), num(tm.acu, 0), d1(tm.ha), d1(tm.h), num(tm.acudes, 0)]);
        var yDias = tabela(ym, ['Dia', 'Lançam.', 'Mecaniz.', 'Açudagem', 'ha', 'h', 'Açudes'], corpoDias,
          { 1: direita, 2: direita, 3: direita, 4: direita, 5: direita, 6: direita }, true) + 9;

        // ---- cada dia: os lançamentos feitos naquele dia
        dias.forEach(function (d) {
          var rs = meses[m][d], t = somar(rs);
          if (yDias > PH - 50) { doc.addPage(); yDias = 18; }
          yDias = secao('Dia ' + diaExtenso(d) + ' — ' + rs.length + ' lançamento' + (rs.length === 1 ? '' : 's'), yDias);
          var corpo = rs.map(function (r) {
            var ha = parseFloat(r.area_total_ha), h = parseFloat(r.horas_maquina), ac = parseFloat(r.quantidade_acudes);
            return [horaDe(r.criado_em), txt(r.tipo_servico), txt(r.nome_beneficiario), txt(r.municipio), txt(r.escritorio_local), dataBr(r.data_vistoria),
              isFinite(ha) ? d1(ha) : '-', isFinite(h) ? d1(h) : '-', isFinite(ac) ? num(ac, 0) : '-'];
          });
          corpo.push([{ content: 'Total do dia', colSpan: 6, styles: { halign: 'right' } }, d1(t.ha), d1(t.h), num(t.acudes, 0)]);
          yDias = tabela(yDias, ['Hora', 'Serviço', 'Beneficiário', 'Município', 'Escritório', 'Vistoria', 'ha', 'h', 'Açudes'], corpo,
            { 0: { cellWidth: 11 }, 1: { cellWidth: 20 }, 2: { cellWidth: 43 }, 3: { cellWidth: 26 }, 4: { cellWidth: 28 }, 5: { cellWidth: 18 },
              6: { halign: 'right', cellWidth: 12 }, 7: { halign: 'right', cellWidth: 11 }, 8: { halign: 'right', cellWidth: 13 } }, true) + 9;
        });
        yAtual = yDias + 4;
      });

      rodape(doc, PW, PH, M, 'SEAGRI — Relatórios lançados por ' + pessoa);
      doc.save('relatorios-' + arquivoSeguro(pessoa) + '-' + hojeArquivo() + '.pdf');
      return temAberto ? tituloDe(mesAberto) : '';   // mês ainda aberto (relatório parcial), para a tela avisar
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
      pares([['Horas de máquina', num(d.horas_maquina, 1)], ['Tanques / açudes', num(d.quantidade_acudes, 0)], ['Piscicultura', d.piscicultura ? 'Sim' : 'Não']]);
    } else {
      secao('4. Área mecanizada e culturas');
      if (culturas.length) {
        tabela(['Cultura', 'Área (ha)', 'Sistema de cultivo'], culturas.map(function (c) {
          return [txt(c.cultura), num(c.area_ha, 2), txt(c.sistema_cultivo)];
        }), { 1: { halign: 'right', cellWidth: 30 } });
      }
      pares([['Área total (ha)', num(d.area_total_ha, 2)], ['Destoca', d.destoca ? 'Sim' : 'Não']]);
    }

    var geo = (Array.isArray(d.pontos_geo) && d.pontos_geo[0]) || null;
    if (geo) {
      secao('5. Georreferenciamento (UTM WGS84)');
      pares([['X', geo.x], ['Y', geo.y], ['Zona', geo.zona], ['', '']]);
    }

    secao('6. Maquinário');
    pares([
      ['Uso', d.tipo_uso], ['Nº identificação', d.num_identificacao_patrimonio],
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

  /* ---------------------------------------------- ficha do produtor (PDF) */
  /** p: { nome, municipio, propriedade, resumo:[[rot,val]], cadastro:[[rot,val]], culturas:[[nome,'x ha']], maquinas:[], implementos:[],
      historico:[[inserção, vistoria, serviço, município, culturas, ha, horas, tanques, técnico]] }  — o que a aba Produtor mostra. */
  function produtor(p) {
    return carregarPdf().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, PH = 297, M = 14, CW = PW - 2 * M;
      var y = cabecalho(doc, PW, M, 'Ficha do produtor', [
        txt(p.nome), [p.municipio, p.propriedade].filter(function (v) { return v && v !== '—'; }).join('  |  ') || ' ',
        'Gerado em ' + agora()
      ]);
      var estilo = { font: 'helvetica', fontSize: 9.5, cellPadding: 2.6, textColor: TINTA, lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak', valign: 'middle' };
      function secao(titulo) {
        if (y > PH - 40) { doc.addPage(); y = 16; }
        doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
        doc.text(titulo, M, y);
        doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]); doc.setLineWidth(0.4);
        doc.line(M, y + 1.8, M + CW, y + 1.8);
        y += 5.5;
      }
      function pares(lista) {
        var corpo = [];
        for (var i = 0; i < lista.length; i += 2) {
          var a = lista[i], b = lista[i + 1] || ['', ''];
          corpo.push([a[0], txt(a[1]), b[0], b[1] === '' ? '' : txt(b[1])]);
        }
        doc.autoTable({
          startY: y, margin: { left: M, right: M, top: 16, bottom: 16 }, body: corpo, theme: 'grid', styles: estilo,
          columnStyles: {
            0: { cellWidth: 36, fontStyle: 'bold', fillColor: [244, 246, 248], textColor: [74, 85, 97] }, 1: { cellWidth: CW / 2 - 36 },
            2: { cellWidth: 36, fontStyle: 'bold', fillColor: [244, 246, 248], textColor: [74, 85, 97] }, 3: { cellWidth: CW / 2 - 36 }
          }
        });
        y = doc.lastAutoTable.finalY + 7;
      }
      function tabela(cab, linhas, cols, fonte) {
        doc.autoTable({
          startY: y, margin: { left: M, right: M, top: 16, bottom: 16 }, head: [cab], body: linhas, theme: 'grid',
          styles: Object.assign({}, estilo, fonte ? { fontSize: fonte, cellPadding: 1.8 } : {}),
          headStyles: { fillColor: [238, 242, 244], textColor: [74, 85, 97], fontStyle: 'bold' }, columnStyles: cols || {}
        });
        y = doc.lastAutoTable.finalY + 7;
      }

      secao('Resumo');
      pares(p.resumo || []);
      secao('Dados cadastrais');
      pares(p.cadastro || []);
      if ((p.culturas || []).length) {
        secao('Culturas mecanizadas');
        tabela(['Cultura', 'Área'], p.culturas, { 1: { halign: 'right', cellWidth: 36 } });
      }
      if ((p.maquinas || []).length || (p.implementos || []).length) {
        secao('Equipamentos utilizados');
        pares([['Máquinas', (p.maquinas || []).join(', ')], ['Implementos', (p.implementos || []).join(', ')]]);
      }
      if ((p.historico || []).length) {
        secao('Histórico de atendimentos (' + p.historico.length + ')');
        tabela(['Inserção', 'Vistoria', 'Serviço', 'Município', 'Culturas / área', 'Hectares', 'Horas', 'Tanques', 'Técnico'], p.historico,
          { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } }, 8);
      }
      rodape(doc, PW, PH, M, 'SEAGRI — Ficha do produtor');
      doc.save('produtor-' + arquivoSeguro(p.nome) + '-' + hojeArquivo() + '.pdf');
    });
  }

  window.LANCAMENTO_PDF = { listagem: listagem, ficha: ficha, produtor: produtor, porDia: porDia };
})();
