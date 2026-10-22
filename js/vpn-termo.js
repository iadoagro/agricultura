/* Termo de acesso VPN em PDF (para assinar), no padrão dos termos já preenchidos da Secretaria: monta o
   formulário e o termo de responsabilidade no navegador (jsPDF), com os dados da solicitação e a data do
   dia em que o arquivo é baixado. O texto fixo vem de js/vpn-termo-texto.js (extraído do modelo oficial). */
(function (raiz) {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var BRASAO = '../assets/termo-vpn-brasao.png';
  // textos padrão do termo
  var ORGAO = 'Secretaria de Estado de Agricultura';
  var SERVICO = 'VPN', SERVIDOR = 'SEI', SOLUCAO = 'SEI';
  var JUSTIFICATIVA = 'Uso do SEI fora do ambiente do governo por conta de demanda da Secretaria e somente agora por conta da restrição de acesso do SEI na rede do estado.';
  var CAB = ['Estado do Acre', 'Secretaria de Estado de Administração - SEAD', 'Diretoria de Modernização e Desenvolvimento Institucional – DIRMOD', 'Departamento de Infraestrutura e Recursos'];
  var RODAPE = 'Diretoria de Modernização e Desenvolvimento Institucional – DIRMOD';

  function cpfBr(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;
  }
  function zapBr(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3') : d;
  }
  // Cargo/função conforme o cadastro: o cargo informado; sem cargo, comissionado sai como CAS e terceirizado como "Terceirizado".
  function cargoFuncao(l) {
    var c = String(l.cargo || '').trim();
    if (c) return c;
    return l.vinculo === 'comissionado' ? 'CAS' : l.vinculo === 'terceirizado' ? 'Terceirizado' : '';
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

  // ------------------------------------------------------------------ carga das bibliotecas e dados
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
  // Setores do organograma (para escrever "Departamento de Mecanização (DEM)" com a sigla, como nos termos já feitos).
  async function carregarSetores() {
    try {
      var oc = raiz.OrgContatos;
      if (!oc) return null;
      var d = oc.doCache && oc.doCache();
      if (!d) { var r = await oc.carregar(); d = r && r.dados; }
      return d && d.nos ? d.nos : null;
    } catch (e) { return null; }
  }
  function rotuloSetor(setor, nos) {
    var s = String(setor || '').trim();
    var n = (nos || []).filter(function (x) { return x.title === s; })[0];
    return n && n.sigla && n.sigla !== String(n.title).toUpperCase() && n.sigla.length < 12 ? n.title + ' (' + n.sigla + ')' : s;
  }

  // ------------------------------------------------------------------ desenho do PDF
  var M = 12.5, W = 181, MEIO = 92;

  function cabecalho(doc, brasao) {
    var y = 8, h = 16;
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(M, y, W, h);
    if (brasao) doc.addImage(brasao, 'PNG', M + 2.5, y + 1.6, 13.5, 12.1);
    doc.setTextColor(0);
    CAB.forEach(function (t, i) {
      doc.setFont('helvetica', i === 1 ? 'bold' : 'normal'); doc.setFontSize(9);
      doc.text(t, M + 20, y + 3.7 + i * 3.7);
    });
    return y + h;
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
  // partes de texto na mesma linha: [texto, estilo, tamanho]
  function partes(doc, x, y, ps) {
    ps.forEach(function (p) {
      doc.setFont('helvetica', p[1] || 'normal'); doc.setFontSize(p[2] || 8);
      doc.text(p[0], x, y); x += doc.getTextWidth(p[0]);
    });
  }
  function celula(doc, x, y, w, h, rotulo, valor, nota) {
    caixa(doc, x, y, w, h);
    var ps = Array.isArray(rotulo) ? rotulo : [[rotulo, 'normal', 8]];
    if (nota) ps = ps.concat([[' ' + nota, 'italic', 7]]);
    partes(doc, x + 1.2, y + 3.1, ps);
    if (valor) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(doc.splitTextToSize(String(valor), w - 2.4), x + 1.2, y + 6.4, { lineHeightFactor: 1.15 });
    }
  }
  function titulo(doc, y, texto, nota) {
    partes(doc, M, y, [[texto, 'bold', 8]].concat(nota ? [[' – ' + nota, 'italic', 7]] : []));
    return y + 1.2;
  }
  function marca(doc, x, y, marcado) {   // quadradinho de 3 mm, com X quando marcado
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(x, y - 2.6, 3, 3);
    if (marcado) { doc.setLineWidth(0.4); doc.line(x + 0.5, y - 2.1, x + 2.5, y - 0.1); doc.line(x + 2.5, y - 2.1, x + 0.5, y - 0.1); doc.setLineWidth(0.25); }
  }
  function opcao(doc, x, y, marcado, texto, negrito) {
    marca(doc, x, y, marcado);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(texto, x + 4.5, y);
    if (negrito) {
      var antes = texto.slice(0, texto.indexOf(negrito));
      doc.setFont('helvetica', 'bold'); doc.text(negrito, x + 4.5 + doc.getTextWidth(antes), y);
    }
  }
  function assinatura(doc, x, w, y, rotulo) {
    doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(x, y, x + w, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(rotulo, x + 3, y + 4.2);
  }
  // parágrafo corrido (quebra de linha; estilo único)
  function paragrafo(doc, texto, y, o) {
    o = o || {};
    doc.setFont('helvetica', o.estilo || 'normal'); doc.setFontSize(o.tam || 8);
    var lh = o.lh || 3.45, linhas = doc.splitTextToSize(texto, W - (o.recuo || 0));
    if (y + linhas.length * lh > 284) { doc.addPage(); y = cabecalho(doc, o.brasao) + 8; }
    if (o.centro) doc.text(linhas, 105, y, { align: 'center' }); else doc.text(linhas, M + (o.recuo || 0), y);
    return y + linhas.length * lh + (o.depois == null ? 0 : o.depois);
  }
  // linha com trecho em negrito no meio (declaração final)
  function declaracao(doc, texto, y, tam) {
    var alvo = 'ter ciência e estar de acordo com os procedimentos acima descritos,', i = texto.indexOf(alvo);
    var toks = [];
    function palavras(s, neg) { s.split(/\s+/).filter(Boolean).forEach(function (p) { toks.push({ t: p, b: neg }); }); }
    if (i < 0) palavras(texto, false); else { palavras(texto.slice(0, i), false); palavras(alvo, true); palavras(texto.slice(i + alvo.length), false); }
    doc.setFontSize(tam);
    var x0 = M + 7, larg = W - 7, x = x0, lh = tam * 0.3528 * 1.35;
    marca(doc, M, y + 0.4, true);
    toks.forEach(function (k) {
      doc.setFont('helvetica', k.b ? 'bold' : 'normal');
      var w = doc.getTextWidth(k.t + ' ');
      if (x + w - doc.getTextWidth(' ') > M + W && x > x0) { x = x0; y += lh; }
      doc.text(k.t, x, y); x += w;
    });
    return y + lh;
  }

  function desenhar(doc, l, hoje, brasao, T, nos) {
    var ef = l.vinculo === 'efetivo', mat = String(l.matricula || '').trim();
    var cargo = cargoFuncao(l), tel = zapBr(l.whatsapp), unidade = rotuloSetor(l.setor, nos);
    var y = cabecalho(doc, brasao) + 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    var tt = 'Formulário de Solicitação de Acesso VPN', tw = doc.getTextWidth(tt);
    doc.text(tt, 105, y, { align: 'center' }); doc.setLineWidth(0.2); doc.line(105 - tw / 2, y + 0.7, 105 + tw / 2, y + 0.7);
    y += 6;

    // finalidade + nome da conta
    y = titulo(doc, y, 'FINALIDADE') + 1.2;
    var linhas = [[7, 'CRIAÇÃO DE CONTA', true, 0], [4.2, 'ALTERAÇÃO DE CONTA', false, 0], [3.4, '- RENOVAÇÃO', false, 0], [3.4, '- REDEFINIÇÃO DE SENHA', false, 0]];
    var ty = y, total = 18;
    caixa(doc, M, y, 55, total); caixa(doc, M + 55, y, 6, total); caixa(doc, M + 61, y, W - 61, total);
    linhas.forEach(function (ln) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(ln[1], M + 1.2, ty + ln[0] - 1);
      marca(doc, M + 56.5, ty + ln[0] - 0.8, ln[2]);
      ty += ln[0];
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('NOME DA CONTA: ' + l.nome, M + 61 + (W - 61) / 2, y + total / 2 + 1, { align: 'center' });
    y += total + 3;

    // órgão / unidade
    partes(doc, M, y, [['SECRETARIA DE ESTADO/ÓRGÃO', 'bold', 8]]); partes(doc, M + MEIO, y, [['UNIDADE ADMINISTRATIVA', 'bold', 8]]);
    y += 1.2;
    caixa(doc, M, y, MEIO, 4.8); caixa(doc, M + MEIO, y, W - MEIO, 4.8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(ORGAO, M + 1.2, y + 3.4); doc.text(unidade, M + MEIO + 1.2, y + 3.4, { maxWidth: W - MEIO - 2.4 });
    y += 4.8 + 3.5;

    // solicitante (o próprio usuário, como nos termos já feitos)
    y = titulo(doc, y, 'SOLICITANTE (CONTATO ADMINISTRATIVO NO ÓRGÃO)', '[responsável administrativo do usuário VPN]');
    celula(doc, M, y, W, 7.3, 'NOME COMPLETO', l.nome); y += 7.3;
    celula(doc, M, y, MEIO, 7.3, 'CARGO/FUNÇÃO', cargo); celula(doc, M + MEIO, y, W - MEIO, 7.3, 'TELEFONE', tel); y += 7.3;
    celula(doc, M, y, W, 7.3, 'E-MAIL INSTITUCIONAL', l.email_funcional); y += 7.3 + 4.5;

    y = titulo(doc, y, 'USUÁRIO DO SERVIÇO VPN (CONTATO TÉCNICO)', '[quem fará uso efetivo da conta a ser criada]');
    celula(doc, M, y, W, 7.3, 'NOME COMPLETO', l.nome); y += 7.3;
    celula(doc, M, y, MEIO, 7.3, 'CPF', cpfBr(l.cpf));
    celula(doc, M + MEIO, y, W - MEIO, 7.3, [['MATRÍCULA ', 'normal', 8], ['(para funcionários)', 'italic', 7], [' / IDENTIDADE ', 'normal', 8], ['(para todos)', 'italic', 7]],
      (mat ? 'Mat. ' + mat + ' / ' : '') + 'RG ' + l.rg); y += 7.3;
    celula(doc, M, y, MEIO, 7.3, 'CARGO/FUNÇÃO', cargo); celula(doc, M + MEIO, y, W - MEIO, 7.3, 'TELEFONE', tel); y += 7.3;
    celula(doc, M, y, W, 7.3, 'E-MAIL INSTITUCIONAL', l.email_funcional); y += 7.3;
    celula(doc, M, y, W, 7.3, [['RAZÃO SOCIAL / CNPJ', 'normal', 8], [' – [quando se tratar de fornecedor/prestador de serviços]', 'italic', 7]], ''); y += 7.3 + 4.5;

    y = titulo(doc, y, 'INFORMAÇÕES TÉCNICAS');
    celula(doc, M, y, W, 7.3, [['SERVIÇO ', 'normal', 8], ['[qual(is) serviço(s) será(ao) acessado(s) – FTP, HTTP, SSH, etc]', 'italic', 7]], SERVICO); y += 7.3;
    celula(doc, M, y, W, 7.3, 'SERVIDOR (nome do host) / REDE / PORTA', SERVIDOR); y += 7.3;
    celula(doc, M, y, W, 7.3, [['SOLUÇÃO CORPORATIVA - ', 'normal', 8], ['[informar a solução que será acessada]', 'italic', 7]], SOLUCAO); y += 7.3;
    celula(doc, M, y, W, 13, 'JUSTIFICATIVA PARA O ACESSO', JUSTIFICATIVA); y += 13 + 4.5;

    y = titulo(doc, y, 'INSTRUÇÕES DE PREENCHIMENTO');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8);
    var li = [];
    T.instrucoes.forEach(function (t) { doc.splitTextToSize(t, W - 7).forEach(function (ln, i) { li.push([ln, i === 0]); }); });
    var hi = li.length * 3.35 + 2.2;
    caixa(doc, M, y, W, hi);
    li.forEach(function (p, i) { if (p[1]) doc.text('•', M + 2.2, y + 3.6 + i * 3.35); doc.text(p[0], M + 6, y + 3.6 + i * 3.35); });
    y += hi + 4;

    // temporário / período / atendimento
    caixa(doc, M, y, 92, 11); caixa(doc, M + 92, y, W - 92, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('TEMPORÁRIO? ( X ) SIM        (     ) NÃO', M + 1.2, y + 4.3);
    doc.text('PERÍODO DE USO DA CONTA:  ' + dataNum(hoje) + '   A   31/12/' + hoje.getFullYear(), M + 1.2, y + 8.8);
    opcao(doc, M + 94, y + 4.3, false, 'ATENDIMENTO NÃO AUTORIZADO', 'NÃO');
    opcao(doc, M + 94, y + 8.8, true, 'ATENDIMENTO AUTORIZADO');
    y += 11 + 4;
    y = titulo(doc, y, 'OBSERVAÇÕES') + 0.6;
    caixa(doc, M, y, W, 8); y += 8 + 7;

    // data e assinaturas (em branco, para assinar)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Rio Branco-Acre, ' + dataExtenso(hoje), M + 1, y);
    y += 13;
    assinatura(doc, M, 96, y, 'Assinatura digital do Usuário da Conta');
    y += 12;
    assinatura(doc, M, 133, y, 'Assinatura digital do Titular da Pasta ou Diretor Administrativo');

    // ---- termo de responsabilidade
    doc.addPage(); y = cabecalho(doc, brasao) + 7;
    var op = { brasao: brasao };
    y = paragrafo(doc, 'TERMO DE RESPONSABILIDADE DE INFORMAÇÃO', y, { estilo: 'bold', centro: true, depois: 5, brasao: brasao });
    var fim = T.termo.length;
    T.termo.forEach(function (t, i) { if (/^Declaro, nesta data/.test(t)) fim = i; });
    var antesSeis = true;
    T.termo.slice(0, fim).forEach(function (t) {
      var normativa = /^Normativa:/.test(t), ainda = /^Declaro, ainda/.test(t), item = /^[a-e]\) /.test(t), cita = /^(“Art\.|§)/.test(t);
      if (ainda) y += 1.5;
      if (normativa) y += 1.5;
      y = paragrafo(doc, t, y, {
        estilo: normativa ? 'bold' : cita ? 'italic' : 'normal', centro: normativa, brasao: brasao, lh: 3.3,
        depois: normativa ? 1.8 : item ? 1.8 : cita ? 1 : ainda ? 2 : 0
      });
    });
    if (fim < T.termo.length) {
      y += 4;
      if (y > 258) { doc.addPage(); y = cabecalho(doc, brasao) + 12; }
      y = declaracao(doc, T.termo[fim], y, 10) + 10;
      assinatura(doc, M, 110, y, 'Assinatura digital do Usuário da Conta');
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
  function montar(l, hoje, brasao, nos) {
    var doc = new raiz.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: 'Termo VPN - ' + l.nome });
    desenhar(doc, l, hoje, brasao, raiz.VPN_TERMO_TEXTO, nos);
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
    var r = await Promise.all([carregarBrasao(caminhoBrasao), carregarSetores()]);
    salvar(montar(l, new Date(), r[0], r[1]).output('blob'), nomeArquivo(l));
  }

  // Termos de várias pessoas num ZIP; quem tem cadastro incompleto vai listado em LEIA-ME.txt.
  async function baixarTodos(lista, caminhoBrasao) {
    conferirTexto();
    if (!lista.length) throw new Error('Não há solicitações sem termo em PDF.');
    await Promise.all([carregarPdf(), carregarZip()]);
    var r = await Promise.all([carregarBrasao(caminhoBrasao), carregarSetores()]), hoje = new Date();
    var pacote = new raiz.JSZip(), usados = {}, sem = [], feitos = 0;
    lista.forEach(function (l) {
      var falta = pendencias(l);
      if (falta.length) { sem.push(l.nome + ' (faltam: ' + falta.join(', ') + ')'); return; }
      var nome = nomeArquivo(l);
      if (usados[nome]) nome = nome.replace(/\.pdf$/, ' (' + (++usados[nome]) + ').pdf'); else usados[nome] = 1;
      pacote.file(nome, montar(l, hoje, r[0], r[1]).output('arraybuffer'));
      feitos++;
    });
    if (sem.length) pacote.file('LEIA-ME.txt', 'Termos não gerados por cadastro incompleto:\r\n\r\n' + sem.join('\r\n') + '\r\n');
    salvar(await pacote.generateAsync({ type: 'blob' }), 'Termos VPN - ' + dataNum(hoje).replace(/\//g, '-') + '.zip');
    return { gerados: feitos, pendentes: sem };
  }

  raiz.vpnTermo = { baixar: baixar, baixarTodos: baixarTodos, pendencias: pendencias, montar: montar };
  if (typeof module !== 'undefined') module.exports = raiz.vpnTermo;
})(typeof window !== 'undefined' ? window : globalThis);
