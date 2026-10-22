/* Termo de acesso VPN em PDF, para quem ainda não tem o termo: monta o formulário e o termo de responsabilidade
   no navegador (jsPDF), com os dados da solicitação e a data do dia em que o arquivo é baixado.
   O texto fixo vem de js/vpn-termo-texto.js (extraído do modelo oficial). */
(function (raiz) {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var ORGAO = 'SEAGRI - Secretaria de Estado de Agricultura';
  var BRASAO = '../assets/termo-vpn-brasao.png';
  var CAB = ['Estado do Acre', 'Secretaria de Estado de Administração - SEAD', 'Diretoria de Modernização e Desenvolvimento Institucional - DIRMOD', 'Departamento de Infraestrutura e Recursos'];
  var RODAPE = 'Diretoria de Modernização e Desenvolvimento Institucional - DIRMOD';

  function cpfBr(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;
  }
  function zapBr(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3') : d;
  }
  function dataNum(d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
  function dataExtenso(d) { return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear(); }

  // O que falta para o termo sair completo (devolve lista de rótulos).
  function pendencias(l) {
    var f = [], ef = l.vinculo === 'efetivo', cpf = String(l.cpf || '').replace(/\D/g, '');
    if (!String(l.nome || '').trim()) f.push('nome');
    if (cpf.length !== 11) f.push('CPF');
    if (!String(l.rg || '').trim()) f.push('RG');
    if (!/^[^@\s]+@ac\.gov\.br$/i.test(String(l.email_funcional || '').trim())) f.push('e-mail funcional');
    if (String(l.whatsapp || '').replace(/\D/g, '').length < 10) f.push('telefone');
    if (!String(l.setor || '').trim()) f.push('setor');
    if (l.vinculo !== 'terceirizado' && !String(l.matricula || '').trim()) f.push('matrícula');
    if (ef && !String(l.cargo || '').trim()) f.push('cargo');
    return f;
  }

  // ------------------------------------------------------------------ carga das bibliotecas
  function carregarLib(urls, pronta) {
    if (pronta()) return Promise.resolve();
    return urls.reduce(function (p, u) {
      return p.catch(function () {
        return new Promise(function (ok, no) {
          var s = document.createElement('script'); s.src = u;
          s.onload = function () { pronta() ? ok() : no(new Error('lib')); }; s.onerror = no;
          document.head.appendChild(s);
        });
      });
    }, Promise.reject()).catch(function () { throw new Error('Não foi possível carregar o gerador de PDF. Verifique a internet.'); });
  }
  function carregarPdf() {
    return carregarLib(['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
      function () { return raiz.jspdf && raiz.jspdf.jsPDF; });
  }
  function carregarZip() {
    return carregarLib(['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'],
      function () { return raiz.JSZip; });
  }
  async function carregarBrasao(caminho) {
    try {
      var r = await fetch(caminho || BRASAO, { cache: 'force-cache' });
      if (!r.ok) return null;
      var b = await r.blob();
      return await new Promise(function (ok) { var f = new FileReader(); f.onload = function () { ok(f.result); }; f.onerror = function () { ok(null); }; f.readAsDataURL(b); });
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ desenho do PDF
  var M = 12, W = 186, CINZA = 228;

  function cabecalho(doc, brasao) {
    var y = 8;
    if (brasao) { doc.addImage(brasao, 'PNG', 105 - 7, y, 14, 12.6); y += 15.5; } else y += 3;
    doc.setTextColor(0);
    CAB.forEach(function (t, i) {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.setFontSize(i === 0 ? 9 : 7.5);
      doc.text(t, 105, y, { align: 'center' }); y += i === 0 ? 3.6 : 3.2;
    });
    return y + 1;
  }
  function rodape(doc) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(60);
      doc.text(RODAPE, 105, 291, { align: 'center' });
    }
    doc.setTextColor(0);
  }
  function caixa(doc, x, y, w, h) { doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(x, y, w, h); }
  function campo(doc, x, y, w, h, rotulo, valor, nota) {
    caixa(doc, x, y, w, h);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text(rotulo, x + 1.5, y + 3);
    if (nota) {
      var lw = doc.getTextWidth(rotulo);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(5.8); doc.text(' ' + nota, x + 1.5 + lw, y + 3);
    }
    if (valor) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(String(valor), x + 1.5, y + h - 1.8, { maxWidth: w - 3 });
    }
  }
  function barra(doc, y, titulo, nota) {
    doc.setFillColor(CINZA); doc.setDrawColor(0); doc.rect(M, y, W, 5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0);
    doc.text(titulo, M + 1.5, y + 3.5);
    if (nota) { var lw = doc.getTextWidth(titulo); doc.setFont('helvetica', 'italic'); doc.setFontSize(6.3); doc.text(' ' + nota, M + 1.5 + lw, y + 3.5); }
    return y + 5;
  }
  function marca(doc, x, y, marcado) {   // quadradinho de 3 mm, com X quando marcado
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(x, y - 2.6, 3, 3);
    if (marcado) { doc.setLineWidth(0.45); doc.line(x + 0.5, y - 2.1, x + 2.5, y - 0.1); doc.line(x + 2.5, y - 2.1, x + 0.5, y - 0.1); doc.setLineWidth(0.25); }
  }
  function opcao(doc, x, y, marcado, texto, negrito) {
    marca(doc, x, y, marcado);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(texto, x + 4.5, y);
    if (negrito) { // destaca a palavra NÃO
      var antes = texto.slice(0, texto.indexOf(negrito));
      doc.setFont('helvetica', 'bold'); doc.text(negrito, x + 4.5 + doc.getTextWidth(antes), y);
    }
  }
  function paragrafo(doc, texto, y, opts) {
    opts = opts || {};
    doc.setFont('helvetica', opts.negrito ? 'bold' : 'normal'); doc.setFontSize(opts.tam || 8);
    var recuo = opts.recuo || 0, w = W - recuo, lh = opts.lh || 3.5;
    var linhas = doc.splitTextToSize(texto, w);
    if (y + linhas.length * lh > 284) { doc.addPage(); y = 16; }
    if (opts.justificar && linhas.length > 1) {
      linhas.forEach(function (ln, i) {
        if (i < linhas.length - 1) doc.text(ln, M + recuo, y + i * lh, { maxWidth: w, align: 'justify' });
        else doc.text(ln, M + recuo, y + i * lh);
      });
    } else doc.text(linhas, M + recuo, y, { lineHeightFactor: lh / (doc.getFontSize() * 0.3528) });
    return y + linhas.length * lh + (opts.depois == null ? 1.6 : opts.depois);
  }
  function assinatura(doc, x, w, y, rotulo) {
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.line(x, y, x + w, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(rotulo, x + w / 2, y + 3.6, { align: 'center' });
  }

  function desenhar(doc, l, hoje, brasao, T) {
    var ef = l.vinculo === 'efetivo', mat = String(l.matricula || '').trim();
    var y = cabecalho(doc, brasao) + 1;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Formulário de Solicitação de Acesso VPN', 105, y + 3, { align: 'center' });
    y += 6;

    // finalidade + nome da conta
    caixa(doc, M, y, 93, 21); caixa(doc, M + 93, y, 93, 21);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('FINALIDADE', M + 1.5, y + 4);
    opcao(doc, M + 3, y + 9, true, 'CRIAÇÃO DE CONTA');
    opcao(doc, M + 3, y + 13.5, false, 'ALTERAÇÃO DE CONTA');
    opcao(doc, M + 9, y + 17.5, false, '- RENOVAÇÃO');
    opcao(doc, M + 45, y + 17.5, false, '- REDEFINIÇÃO DE SENHA');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('NOME DA CONTA:', M + 94.5, y + 4);
    y += 21;
    campo(doc, M, y, 93, 9, 'SECRETARIA DE ESTADO/ÓRGÃO', ORGAO);
    campo(doc, M + 93, y, 93, 9, 'UNIDADE ADMINISTRATIVA', l.setor);
    y += 9;

    y = barra(doc, y, 'SOLICITANTE (CONTATO ADMINISTRATIVO NO ÓRGÃO)', '- [responsável administrativo do usuário VPN]');
    campo(doc, M, y, W, 8.5, 'NOME COMPLETO', ''); y += 8.5;
    campo(doc, M, y, 93, 8.5, 'CARGO/FUNÇÃO', ''); campo(doc, M + 93, y, 93, 8.5, 'TELEFONE', ''); y += 8.5;
    campo(doc, M, y, W, 8.5, 'E-MAIL INSTITUCIONAL', ''); y += 8.5;

    y = barra(doc, y, 'USUÁRIO DO SERVIÇO VPN (CONTATO TÉCNICO)', '- [quem fará uso efetivo da conta a ser criada]');
    campo(doc, M, y, W, 8.5, 'NOME COMPLETO', l.nome); y += 8.5;
    campo(doc, M, y, 93, 8.5, 'CPF', cpfBr(l.cpf));
    campo(doc, M + 93, y, 93, 8.5, 'MATRÍCULA / IDENTIDADE', (mat ? mat + ' / ' : '') + l.rg, '(matrícula para funcionários; identidade para todos)'); y += 8.5;
    campo(doc, M, y, 93, 8.5, 'CARGO/FUNÇÃO', ef ? l.cargo : 'CAS'); campo(doc, M + 93, y, 93, 8.5, 'TELEFONE', zapBr(l.whatsapp)); y += 8.5;
    campo(doc, M, y, W, 8.5, 'E-MAIL INSTITUCIONAL', l.email_funcional); y += 8.5;
    campo(doc, M, y, W, 8.5, 'RAZÃO SOCIAL / CNPJ', '', '- [quando se tratar de fornecedor/prestador de serviços]'); y += 8.5;

    y = barra(doc, y, 'INFORMAÇÕES TÉCNICAS');
    campo(doc, M, y, W, 8.5, 'SERVIÇO', '', '[qual(is) serviço(s) será(ão) acessado(s) - FTP, HTTP, SSH, etc]'); y += 8.5;
    campo(doc, M, y, W, 8.5, 'SERVIDOR (nome do host) / REDE / PORTA', ''); y += 8.5;
    campo(doc, M, y, W, 8.5, 'SOLUÇÃO CORPORATIVA', '', '- [informar a solução que será acessada]'); y += 8.5;
    campo(doc, M, y, W, 12, 'JUSTIFICATIVA PARA O ACESSO', ''); y += 12;

    y = barra(doc, y, 'INSTRUÇÕES DE PREENCHIMENTO');
    var yi = y + 3.2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3);
    var linhasInstr = [];
    T.instrucoes.forEach(function (t) { doc.splitTextToSize('- ' + t, W - 3).forEach(function (ln) { linhasInstr.push(ln); }); });
    caixa(doc, M, y, W, linhasInstr.length * 2.7 + 2);
    linhasInstr.forEach(function (ln, i) { doc.text(ln, M + 1.5, yi + i * 2.7 - 0.2); });
    y += linhasInstr.length * 2.7 + 2;

    // temporário / período / atendimento
    caixa(doc, M, y, 93, 12); caixa(doc, M + 93, y, 93, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text('TEMPORÁRIO?', M + 1.5, y + 4.5);
    opcao(doc, M + 24, y + 4.5, true, 'SIM'); opcao(doc, M + 40, y + 4.5, false, 'NÃO');
    doc.text('PERÍODO DE USO DA CONTA:  ' + dataNum(hoje) + '   A   31/12/' + hoje.getFullYear(), M + 1.5, y + 9.5);
    opcao(doc, M + 95, y + 4.5, false, 'ATENDIMENTO NÃO AUTORIZADO', 'NÃO');
    opcao(doc, M + 95, y + 9.5, true, 'ATENDIMENTO AUTORIZADO');
    y += 12;
    campo(doc, M, y, W, 14, 'OBSERVAÇÕES', ''); y += 14;

    // data e assinaturas
    y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Rio Branco-Acre, ' + dataExtenso(hoje), M, y);
    y += 14;
    assinatura(doc, M, 85, y, 'Assinatura digital do Usuário da Conta');
    assinatura(doc, M + 101, 85, y, 'Assinatura digital do Titular da Pasta ou Diretor Administrativo');

    // ---- termo de responsabilidade
    doc.addPage(); y = 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('TERMO DE RESPONSABILIDADE DE INFORMAÇÃO', 105, y, { align: 'center' }); y += 8;
    var fim = T.termo.length;
    T.termo.forEach(function (t, i) { if (/^Declaro, nesta data/.test(t)) fim = i; });
    T.termo.slice(0, fim).forEach(function (t) {
      if (/^_+$/.test(t) || /^Assinatura digital/.test(t)) return;
      var cab = /^(Declaro, ainda|Normativa:)/.test(t), alin = /^[a-e]\) /.test(t) ? 0 : 0;
      y = paragrafo(doc, t, y, { negrito: cab, justificar: !cab, depois: cab ? 2 : 1.6, recuo: alin });
    });
    if (fim < T.termo.length) {
      y += 2;
      y = paragrafo(doc, T.termo[fim], y, { justificar: true, depois: 4 });
      if (y > 262) { doc.addPage(); y = 16; }
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('Rio Branco-Acre, ' + dataExtenso(hoje), M, y);
      y += 14;
      assinatura(doc, M + 40, 106, y, 'Assinatura digital do Usuário da Conta');
    }
    rodape(doc);
  }

  function nomeArquivo(l) { return 'Termo VPN - ' + String(l.nome).replace(/[\\/:*?"<>|]/g, '') + '.pdf'; }
  function salvar(blob, nome) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }
  function montar(l, hoje, brasao) {
    var doc = new raiz.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: 'Termo VPN - ' + l.nome });
    desenhar(doc, l, hoje, brasao, raiz.VPN_TERMO_TEXTO);
    return doc;
  }
  function conferirTexto() {
    if (!raiz.VPN_TERMO_TEXTO) throw new Error('Texto do termo não carregado. Recarregue a página.');
  }

  // Gera e baixa o termo (PDF) de uma pessoa, com a data de hoje.
  async function baixar(l, caminhoBrasao) {
    conferirTexto();
    var falta = pendencias(l);
    if (falta.length) throw new Error('Complete o cadastro antes de gerar o termo. Faltam: ' + falta.join(', ') + '.');
    await carregarPdf();
    var doc = montar(l, new Date(), await carregarBrasao(caminhoBrasao));
    salvar(doc.output('blob'), nomeArquivo(l));
  }

  // Termos de várias pessoas num ZIP; quem tem cadastro incompleto vai listado em LEIA-ME.txt.
  async function baixarTodos(lista, caminhoBrasao) {
    conferirTexto();
    if (!lista.length) throw new Error('Não há solicitações sem termo em PDF.');
    await Promise.all([carregarPdf(), carregarZip()]);
    var brasao = await carregarBrasao(caminhoBrasao), hoje = new Date();
    var pacote = new raiz.JSZip(), usados = {}, sem = [], feitos = 0;
    lista.forEach(function (l) {
      var falta = pendencias(l);
      if (falta.length) { sem.push(l.nome + ' (faltam: ' + falta.join(', ') + ')'); return; }
      var nome = nomeArquivo(l);
      if (usados[nome]) nome = nome.replace(/\.pdf$/, ' (' + (++usados[nome]) + ').pdf'); else usados[nome] = 1;
      pacote.file(nome, montar(l, hoje, brasao).output('arraybuffer'));
      feitos++;
    });
    if (sem.length) pacote.file('LEIA-ME.txt', 'Termos não gerados por cadastro incompleto:\r\n\r\n' + sem.join('\r\n') + '\r\n');
    salvar(await pacote.generateAsync({ type: 'blob' }), 'Termos VPN - ' + dataNum(hoje).replace(/\//g, '-') + '.zip');
    return { gerados: feitos, pendentes: sem };
  }

  raiz.vpnTermo = { baixar: baixar, baixarTodos: baixarTodos, pendencias: pendencias, montar: montar };
  if (typeof module !== 'undefined') module.exports = raiz.vpnTermo;
})(typeof window !== 'undefined' ? window : globalThis);
