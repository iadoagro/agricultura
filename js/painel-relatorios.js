/* Aba "Relatórios": resumos semanal e mensal para a chefia. Os relatórios são gerados no banco
   (public.mecanizacao_gerar_relatorio) e agendados com pg_cron: toda segunda-feira (semana anterior)
   e no dia 1 (mês anterior) — ver database/mecanizacao-agendamento.sql. Aqui eles são listados,
   abertos, impressos/salvos em PDF, enviados por e-mail (rascunho no programa de e-mail) e
   baixados em CSV. O responsável também pode gerar um agora. Só na versão interna (logado).
   Usa window.PAINEL_API (js/dashboard.js). */
(function () {
  'use strict';
  var A = window.PAINEL_API;
  if (!A || A.modoPublico()) return;
  var G = A.G;
  var LISTA = [], ESTADO = 'carregando', MSG = '';

  function el(id) { return document.getElementById(id); }
  function cfg() { return window.BANCO_CONFIG || {}; }
  function sessao() { return window.ADMIN_AUTH && ADMIN_AUTH.sessaoAtual && ADMIN_AUTH.sessaoAtual(); }
  function dataBR(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—'; }
  function cabecalho() {
    var s = sessao();
    if (!s || !s.access_token) throw new Error('Entre novamente para continuar.');
    return { apikey: cfg().chavePublica, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
  }
  function url(caminho) { return String(cfg().url || '').replace(/\/$/, '') + caminho; }

  function carregar() {
    var h;
    try { h = cabecalho(); } catch (e) { ESTADO = 'erro'; MSG = e.message; return Promise.resolve(); }
    return fetch(url('/rest/v1/mecanizacao_relatorios?select=*&order=inicio.desc,tipo.asc&limit=60'), { headers: h, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404) throw new Error('Rode database/mecanizacao-fase-b.sql no Supabase para habilitar os relatórios.');
        if (!r.ok) throw new Error('Não foi possível ler os relatórios (HTTP ' + r.status + ').');
        return r.json();
      })
      .then(function (l) { LISTA = Array.isArray(l) ? l : []; ESTADO = 'ok'; })
      .catch(function (e) { ESTADO = 'erro'; MSG = e.message; });
  }

  function rotulo(r) {
    return (r.tipo === 'semanal' ? 'Semanal' : 'Mensal') + ' · ' + dataBR(r.inicio) + ' a ' + dataBR(r.fim);
  }

  function variacao(a, b) {
    var d = a - b;
    if (!b && !a) return '=';
    if (Math.abs(d) < 1e-9) return '=';
    var pct = b ? ' (' + (d > 0 ? '+' : '') + G.num(d / b * 100, 0) + '%)' : '';
    return (d > 0 ? '▲ +' : '▼ -') + G.num(Math.abs(d), 1) + pct;
  }

  /** HTML do relatório (usado na janela e na impressão). */
  function htmlRelatorio(r) {
    var v = r.resumo || {}, t = v.totais || {}, a = v.anterior || {};
    var linhas = function (itens, rotChave, chave) {
      if (!itens || !itens.length) return '<p>—</p>';
      return '<table><thead><tr><th>' + G.esc(rotChave) + '</th><th>Atend.</th>' +
        (itens[0].ha !== undefined ? '<th>Hectares</th><th>Horas</th>' : '') + '</tr></thead><tbody>' +
        itens.map(function (x) {
          return '<tr><td>' + G.esc(x[chave] || 'Não informado') + '</td><td class="n">' + G.num(x.atend) + '</td>' +
            (x.ha !== undefined ? '<td class="n">' + G.num(x.ha, 1) + '</td><td class="n">' + G.num(x.horas, 1) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table>';
    };
    var kpi = function (rot, val, ant, dec) {
      return '<div class="k"><span>' + G.esc(rot) + '</span><b>' + G.num(val || 0, dec) + '</b><i>' + G.esc(variacao(+val || 0, +ant || 0)) + '</i></div>';
    };
    var p = v.periodo || {}, pa = v.periodo_anterior || {};
    return '<h1>Painel da Mecanização — resumo ' + (r.tipo === 'semanal' ? 'semanal' : 'mensal') + '</h1>' +
      '<p class="sub">Lançamentos de ' + dataBR(p.inicio) + ' a ' + dataBR(p.fim) + ' · comparado com ' + dataBR(pa.inicio) + ' a ' + dataBR(pa.fim) +
      ' · gerado em ' + new Date(r.criado_em).toLocaleString('pt-BR') + '</p>' +
      '<div class="ks">' + kpi('Atendimentos', t.atend, a.atend, 0) + kpi('Hectares mecanizados', t.ha, a.ha, 1) +
      kpi('Horas de máquina', t.horas, a.horas, 1) + kpi('Tanques / açudes', t.tanques, a.tanques, 0) +
      kpi('Produtores', t.produtores, a.produtores, 0) + kpi('Municípios', t.municipios, a.municipios, 0) + '</div>' +
      '<h2>Por município</h2>' + linhas(v.por_municipio, 'Município', 'mun') +
      '<h2>Por escritório local</h2>' + linhas(v.por_escritorio, 'Escritório', 'esc') +
      '<h2>Por responsável técnico</h2>' + linhas(v.por_tecnico, 'Técnico', 'tec') +
      '<h2>Por serviço</h2>' + linhas(v.por_servico, 'Serviço', 'servico') +
      '<p class="rodape">Fonte: lançamentos do sistema (data de lançamento, horário de Rio Branco).</p>';
  }

  var ESTILO = 'body{font:14px/1.45 Arial,sans-serif;color:#0f172a;margin:24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px}' +
    '.sub{color:#475569;margin:0 0 14px;font-size:12.5px}.ks{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
    '.k{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;display:grid}.k span{font-size:12px;color:#475569}.k b{font-size:20px}.k i{font-style:normal;font-size:12px;color:#334155}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:left}.n{text-align:right}.rodape{margin-top:18px;font-size:11.5px;color:#64748b}';

  function textoSimples(r) {
    var v = r.resumo || {}, t = v.totais || {}, a = v.anterior || {}, p = v.periodo || {};
    var l = ['Painel da Mecanização — resumo ' + r.tipo, 'Período: ' + dataBR(p.inicio) + ' a ' + dataBR(p.fim), '',
      'Atendimentos: ' + G.num(t.atend || 0) + ' (' + variacao(+t.atend || 0, +a.atend || 0) + ')',
      'Hectares mecanizados: ' + G.num(t.ha || 0, 1) + ' (' + variacao(+t.ha || 0, +a.ha || 0) + ')',
      'Horas de máquina: ' + G.num(t.horas || 0, 1) + ' (' + variacao(+t.horas || 0, +a.horas || 0) + ')',
      'Tanques / açudes: ' + G.num(t.tanques || 0) + ' (' + variacao(+t.tanques || 0, +a.tanques || 0) + ')',
      'Produtores: ' + G.num(t.produtores || 0) + ' · Municípios: ' + G.num(t.municipios || 0), '', 'Municípios com mais atendimentos:'];
    (v.por_municipio || []).slice(0, 5).forEach(function (x) { l.push('- ' + (x.mun || 'Não informado') + ': ' + G.num(x.atend) + ' atend., ' + G.num(x.ha, 1) + ' ha'); });
    return l.join('\n');
  }

  function csvDe(r) {
    var v = r.resumo || {}, linhas = [];
    (v.por_municipio || []).forEach(function (x) { linhas.push(['Município', x.mun || '', x.atend, x.ha, x.horas]); });
    (v.por_escritorio || []).forEach(function (x) { linhas.push(['Escritório', x.esc || '', x.atend, '', '']); });
    (v.por_tecnico || []).forEach(function (x) { linhas.push(['Técnico', x.tec || '', x.atend, '', '']); });
    (v.por_servico || []).forEach(function (x) { linhas.push(['Serviço', x.servico || '', x.atend, '', '']); });
    return linhas.map(function (l) { return l.map(function (c) { return String(c == null ? '' : c).replace(/\./g, ','); }); });
  }

  /** PDF A4 no padrão dos relatórios do painel (faixa azul, cartões, tabelas com grade, rodapé paginado),
      baixado direto — sem janela de impressão. */
  function baixarPdf(r, botao) {
    if (!A.carregarPdf) { window.alert('Não foi possível carregar o gerador de PDF.'); return; }
    if (botao) { botao.disabled = true; botao.setAttribute('data-txt', botao.textContent); botao.textContent = 'Gerando PDF…'; }
    A.carregarPdf().then(function () {
      var v = r.resumo || {}, t = v.totais || {}, ant = v.anterior || {}, p = v.periodo || {}, pa = v.periodo_anterior || {};
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, M = 14, CW = PW - 2 * M;
      var AZUL = [46, 79, 125], CINZA = [107, 120, 133], TINTA = [27, 36, 48];
      var semanal = r.tipo === 'semanal';
      var y;
      var linhasCab = [
        'Período: ' + dataBR(p.inicio) + ' a ' + dataBR(p.fim) + '  |  comparado com ' + dataBR(pa.inicio) + ' a ' + dataBR(pa.fim),
        'Fonte: lançamentos do sistema (data de lançamento, horário de Rio Branco)'
      ];
      var altCab = 18 + linhasCab.length * 4.6 + 3;
      doc.setFillColor.apply(doc, AZUL);
      doc.rect(0, 0, PW, altCab, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('Resumo ' + (semanal ? 'semanal' : 'mensal') + ' — Mecanização e Açudagem', M, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      linhasCab.forEach(function (l, i) { doc.text(l, M, 19 + i * 4.6); });
      y = altCab + 8;

      var varTxt = function (a, b, dec) {
        var d = a - b;
        if (Math.abs(d) < 1e-9) return 'igual ao período anterior';
        var pct = b ? ' (' + (d > 0 ? '+' : '-') + G.num(Math.abs(d / b * 100), 0) + '%)' : '';
        return (d > 0 ? '+' : '-') + G.num(Math.abs(d), dec) + pct + ' vs. anterior';
      };
      var kpis = [
        ['Atendimentos', G.num(t.atend || 0), varTxt(+t.atend || 0, +ant.atend || 0, 0)],
        ['Hectares mecanizados', G.num(t.ha || 0, 1) + ' ha', varTxt(+t.ha || 0, +ant.ha || 0, 1)],
        ['Horas de máquina', G.num(t.horas || 0, 1) + ' h', varTxt(+t.horas || 0, +ant.horas || 0, 1)],
        ['Tanques / açudes', G.num(t.tanques || 0), varTxt(+t.tanques || 0, +ant.tanques || 0, 0)],
        ['Produtores', G.num(t.produtores || 0), varTxt(+t.produtores || 0, +ant.produtores || 0, 0)],
        ['Municípios', G.num(t.municipios || 0), varTxt(+t.municipios || 0, +ant.municipios || 0, 0)]
      ];
      var kw = (CW - 6) / 3, kh = 20;
      kpis.forEach(function (k, i) {
        var x = M + (i % 3) * (kw + 3), yy = y + Math.floor(i / 3) * (kh + 3);
        doc.setFillColor(247, 249, 250); doc.setDrawColor(216, 222, 229); doc.setLineWidth(0.2);
        doc.roundedRect(x, yy, kw, kh, 1.5, 1.5, 'FD');
        doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        doc.text(k[0].toUpperCase(), x + 2.5, yy + 5);
        doc.setTextColor.apply(doc, TINTA); doc.setFontSize(13);
        doc.text(String(k[1]), x + 2.5, yy + 12);
        doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.text(String(k[2]), x + 2.5, yy + 17.5, { maxWidth: kw - 4 });
      });
      y += 2 * (kh + 3) + 6;

      function secao(txt) {
        if (y > 262) { doc.addPage(); y = 18; }
        doc.setTextColor.apply(doc, AZUL);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text(txt, M, y);
        doc.setDrawColor.apply(doc, AZUL); doc.setLineWidth(0.4);
        doc.line(M, y + 1.8, M + CW, y + 1.8);
        y += 6;
      }
      function tabela(cab, linhas, cols) {
        if (!linhas.length) {
          doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
          doc.text('Sem lançamentos no período.', M, y + 3);
          y += 10;
          return;
        }
        doc.autoTable({
          startY: y, margin: { left: M, right: M, top: 16, bottom: 16 },
          head: [cab], body: linhas, theme: 'grid',
          styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: TINTA, lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak' },
          headStyles: { fillColor: [238, 242, 244], textColor: [74, 85, 97], fontStyle: 'bold', fontSize: 8 },
          alternateRowStyles: { fillColor: [250, 251, 252] },
          columnStyles: cols || {}
        });
        y = doc.lastAutoTable.finalY + 7;
      }
      var dir = { halign: 'right' };
      secao('Por município');
      tabela(['Município', 'Atend.', 'Hectares', 'Horas'], (v.por_municipio || []).map(function (x) {
        return [x.mun || 'Não informado', G.num(x.atend), G.num(x.ha, 1), G.num(x.horas, 1)];
      }), { 1: dir, 2: dir, 3: dir });
      secao('Por escritório local');
      tabela(['Escritório', 'Atendimentos'], (v.por_escritorio || []).map(function (x) {
        return [x.esc || 'Não informado', G.num(x.atend)];
      }), { 1: dir });
      secao('Por responsável técnico');
      tabela(['Técnico', 'Atendimentos'], (v.por_tecnico || []).map(function (x) {
        return [x.tec || 'Não informado', G.num(x.atend)];
      }), { 1: dir });
      secao('Por serviço');
      tabela(['Serviço', 'Atendimentos'], (v.por_servico || []).map(function (x) {
        return [x.servico || 'Não informado', G.num(x.atend)];
      }), { 1: dir });

      var n = doc.internal.getNumberOfPages();
      var hoje = new Date().toLocaleDateString('pt-BR');
      for (var pg = 1; pg <= n; pg++) {
        doc.setPage(pg);
        doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text('Gerado em ' + hoje + ' | Sistema de gestão', M, 289);
        doc.text('Página ' + pg + ' de ' + n, PW - M, 289, { align: 'right' });
      }
      doc.save('relatorio-mecanizacao-' + r.tipo + '-' + r.inicio + '_a_' + r.fim + '.pdf');
      A.auditar('exportar', 'Baixou o relatório ' + rotulo(r) + ' (PDF)');
    }).catch(function (e) {
      window.alert(e && e.message ? e.message : 'Não foi possível gerar o PDF.');
    }).then(function () {
      if (botao) { botao.disabled = false; botao.textContent = botao.getAttribute('data-txt') || 'Baixar PDF'; }
    });
  }

  function abrir(r) {
    var ov = document.createElement('div');
    ov.className = 'pub-senha-ov';
    ov.innerHTML = '<div class="pub-senha-box rel-box"><div class="rel-corpo">' + htmlRelatorio(r) + '</div>' +
      '<div class="pub-cfg-acoes rel-acoes">' +
      '<button class="btn" type="button" data-a="pdf">Baixar PDF</button>' +
      '<button class="btn" type="button" data-a="email">Enviar por e-mail</button>' +
      '<button class="btn" type="button" data-a="csv">CSV</button>' +
      '<button class="btn" type="button" data-a="fechar">Fechar</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { ov.remove(); return; }
      var b = e.target.closest('[data-a]');
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'fechar') ov.remove();
      else if (a === 'pdf') baixarPdf(r, b);
      else if (a === 'email') {
        var assunto = encodeURIComponent('Painel da Mecanização — resumo ' + r.tipo + ' (' + dataBR(r.inicio) + ' a ' + dataBR(r.fim) + ')');
        window.location.href = 'mailto:?subject=' + assunto + '&body=' + encodeURIComponent(textoSimples(r));
        A.auditar('exportar', 'Preparou e-mail do relatório ' + rotulo(r));
      } else if (a === 'csv' && window.PainelExport) {
        window.PainelExport.baixar('relatorio-' + r.tipo + '-' + r.inicio, ['Grupo', 'Nome', 'Atendimentos', 'Hectares', 'Horas'], csvDe(r), 'csv');
      }
    });
  }

  function desenhar() {
    var alvo = el('relatoriosLista');
    if (!alvo) return;
    var admin = A.ehResponsavel();
    var ger = el('relGerar');
    if (ger) ger.hidden = !admin;
    if (ESTADO === 'carregando') { alvo.innerHTML = '<p class="vazio">Carregando relatórios…</p>'; return; }
    if (ESTADO === 'erro') { alvo.innerHTML = '<p class="aviso erro">' + G.esc(MSG) + '</p>'; return; }
    if (!LISTA.length) { alvo.innerHTML = '<p class="vazio">Nenhum relatório gerado ainda. O primeiro sai na próxima segunda-feira' + (admin ? ' — ou gere um agora.' : '.') + '</p>'; return; }
    alvo.innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Tipo</th><th>Período</th><th>Atendimentos</th><th>Gerado em</th><th></th></tr></thead><tbody>' +
      LISTA.map(function (r, i) {
        var t = (r.resumo && r.resumo.totais) || {};
        return '<tr><td class="forte">' + (r.tipo === 'semanal' ? 'Semanal' : 'Mensal') + '</td><td>' + dataBR(r.inicio) + ' a ' + dataBR(r.fim) +
          '</td><td class="num">' + G.num(t.atend || 0) + '</td><td>' + new Date(r.criado_em).toLocaleString('pt-BR') +
          '</td><td class="rel-btns"><button type="button" class="btn rel-abrir" data-i="' + i + '">Abrir</button> ' +
          '<button type="button" class="btn rel-pdf" data-i="' + i + '">Baixar PDF</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function gerar(tipo) {
    var msg = el('relMsg');
    msg.textContent = 'Gerando…';
    var h;
    try { h = cabecalho(); } catch (e) { msg.textContent = e.message; return; }
    fetch(url('/rest/v1/rpc/mecanizacao_gerar_relatorio'), { method: 'POST', headers: h, body: JSON.stringify({ p_tipo: tipo }) })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('Só o responsável pode gerar relatórios.');
        if (!r.ok) throw new Error('Não foi possível gerar (HTTP ' + r.status + ').');
        return r.json();
      })
      .then(function () { A.auditar('alterar', 'Gerou o relatório ' + tipo); return carregar(); })
      .then(function () { msg.textContent = 'Relatório ' + tipo + ' gerado ✓'; desenhar(); })
      .catch(function (e) { msg.textContent = e.message; });
  }

  var lista = el('relatoriosLista');
  if (lista) lista.addEventListener('click', function (e) {
    var b = e.target.closest('.rel-abrir');
    if (b && LISTA[+b.getAttribute('data-i')]) { abrir(LISTA[+b.getAttribute('data-i')]); return; }
    var p = e.target.closest('.rel-pdf');
    if (p && LISTA[+p.getAttribute('data-i')]) baixarPdf(LISTA[+p.getAttribute('data-i')], p);
  });
  var cab = el('relGerar');
  if (cab) cab.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tipo]');
    if (b) gerar(b.getAttribute('data-tipo'));
  });

  A.registrarAba('relatorios', function () {
    desenhar();
    carregar().then(desenhar);
  });
})();
