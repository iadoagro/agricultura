/* Termo de acesso VPN preenchido, para quem ainda não tem o PDF: monta o .docx no navegador a partir de
   assets/termo-vpn-modelo.docx, com os dados da solicitação e a data do dia em que o arquivo é baixado. */
(function (raiz) {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var ORGAO = 'SEAGRI - Secretaria de Estado de Agricultura';
  var TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
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

  // Valores dos campos de texto do modelo, na ordem em que aparecem; null = deixa em branco.
  function valores(l) {
    var ef = l.vinculo === 'efetivo', mat = String(l.matricula || '').trim();
    return [
      null,                                   // nome da conta (definido pela equipe técnica)
      ORGAO,                                  // secretaria/órgão
      l.setor,                                // unidade administrativa
      null, null, null, null,                 // solicitante (contato administrativo)
      l.nome, cpfBr(l.cpf),                   // usuário: nome, CPF
      (mat ? mat + ' / ' : '') + l.rg,        // matrícula / identidade
      ef ? l.cargo : 'CAS',                   // cargo/função
      zapBr(l.whatsapp), l.email_funcional    // telefone, e-mail
    ];
  }

  function preencher(xml, l, hoje) {
    var v = valores(l), i = 0;
    var campo = /(<w:ffData>(?:(?!<\/w:ffData>)[\s\S])*?<w:textInput\/>(?:(?!<\/w:ffData>)[\s\S])*?<\/w:ffData>[\s\S]*?<w:fldChar w:fldCharType="separate"\/><\/w:r><w:r>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?)<w:t[^>]*>[^<]*<\/w:t>/g;
    xml = xml.replace(campo, function (todo, ini) {
      var val = i < v.length ? v[i] : null; i++;
      return val == null || val === '' ? todo : ini + '<w:t xml:space="preserve">' + esc(val) + '</w:t>';
    });

    // Temporário: SIM, com período de uso do dia do download até 31/12 do mesmo ano
    var sim = /(TEMPORÁRIO\? <\/w:t><\/w:r>(?:<w:proofErr[^>]*\/>)?<w:r>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<w:t xml:space="preserve">\()  (<\/w:t>)/;
    var per = 'PERÍODO DE USO DA CONTA:  _____/____/______   A   ____/____/_____';
    if (!sim.test(xml) || xml.indexOf(per) < 0) throw new Error('O modelo do termo mudou: campos "Temporário" e "Período" não encontrados.');
    xml = xml.replace(sim, '$1 X$2');
    xml = xml.replace(per, 'PERÍODO DE USO DA CONTA:  ' + dataNum(hoje) + '   A   31/12/' + hoje.getFullYear());

    // "ATENDIMENTO AUTORIZADO" sai marcado (caixa identificada pelo marcador Selecionar2_Copia_2)
    var auto = /(<w:checkBox><w:sizeAuto\/><w:default w:val="0"\/>)(<\/w:checkBox><\/w:ffData>(?:(?!<\/w:ffData>)[\s\S])*?<w:bookmarkStart [^>]*w:name="Selecionar2_Copia_2")/;
    if (!auto.test(xml)) throw new Error('O modelo do termo mudou: caixa "Atendimento autorizado" não encontrada.');
    xml = xml.replace(auto, '$1<w:checked/>$2');

    // Data do termo: a do dia do download
    var rpr = '(?:<w:rPr>(?:(?!</w:rPr>)[\\s\\S])*</w:rPr>)?';
    var dt = new RegExp('Rio Branco-Acre, ____ de _____________ </w:t>(</w:r><w:proofErr[^>]*/><w:r>' + rpr + ')<w:t>de</w:t>(</w:r><w:proofErr[^>]*/><w:r>' + rpr + ')<w:t[^>]*> ______</w:t>');
    if (!dt.test(xml)) throw new Error('O modelo do termo mudou: linha da data não encontrada.');
    return xml.replace(dt, function (t, b, c) {
      return 'Rio Branco-Acre, ' + dataExtenso(hoje) + '</w:t>' + b + '<w:t></w:t>' + c + '<w:t></w:t>';
    });
  }

  function carregarJSZip() {
    if (raiz.JSZip) return Promise.resolve(raiz.JSZip);
    var urls = ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'];
    return urls.reduce(function (p, u) {
      return p.catch(function () {
        return new Promise(function (ok, no) {
          var s = document.createElement('script'); s.src = u;
          s.onload = function () { raiz.JSZip ? ok(raiz.JSZip) : no(new Error('JSZip')); }; s.onerror = no;
          document.head.appendChild(s);
        });
      });
    }, Promise.reject()).catch(function () { throw new Error('Não foi possível carregar o gerador do termo. Verifique a internet.'); });
  }

  function nomeArquivo(l) { return 'Termo VPN - ' + String(l.nome).replace(/[\\/:*?"<>|]/g, '') + '.docx'; }
  function salvar(blob, nome) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }
  async function modelo(caminho) {
    var r = await fetch(caminho || '../assets/termo-vpn-modelo.docx', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Modelo do termo não encontrado.');
    return r.arrayBuffer();
  }
  // um termo, a partir dos bytes do modelo
  async function montar(JSZip, bytes, l, tipo) {
    var zip = await JSZip.loadAsync(bytes);
    var xml = await zip.file('word/document.xml').async('string');
    zip.file('word/document.xml', preencher(xml, l, new Date()));
    return zip.generateAsync({ type: tipo, mimeType: TIPO_DOCX });
  }

  // Gera e baixa o termo de uma pessoa, com a data de hoje.
  async function baixar(l, caminhoModelo) {
    var falta = pendencias(l);
    if (falta.length) throw new Error('Complete o cadastro antes de gerar o termo. Faltam: ' + falta.join(', ') + '.');
    var JSZip = await carregarJSZip();
    salvar(await montar(JSZip, await modelo(caminhoModelo), l, 'blob'), nomeArquivo(l));
  }

  // Termos de várias pessoas num ZIP; quem tem cadastro incompleto vai listado em LEIA-ME.txt.
  async function baixarTodos(lista, caminhoModelo) {
    if (!lista.length) throw new Error('Não há solicitações sem termo em PDF.');
    var JSZip = await carregarJSZip(), bytes = await modelo(caminhoModelo);
    var pacote = new JSZip(), usados = {}, sem = [], feitos = 0;
    for (var k = 0; k < lista.length; k++) {
      var l = lista[k], falta = pendencias(l);
      if (falta.length) { sem.push(l.nome + ' (faltam: ' + falta.join(', ') + ')'); continue; }
      var nome = nomeArquivo(l);
      if (usados[nome]) nome = nome.replace(/\.docx$/, ' (' + (++usados[nome]) + ').docx'); else usados[nome] = 1;
      pacote.file(nome, await montar(JSZip, bytes, l, 'uint8array'));
      feitos++;
    }
    if (sem.length) pacote.file('LEIA-ME.txt', 'Termos não gerados por cadastro incompleto:\r\n\r\n' + sem.join('\r\n') + '\r\n');
    salvar(await pacote.generateAsync({ type: 'blob' }), 'Termos VPN - ' + dataNum(new Date()).replace(/\//g, '-') + '.zip');
    return { gerados: feitos, pendentes: sem };
  }

  raiz.vpnTermo = { baixar: baixar, baixarTodos: baixarTodos, pendencias: pendencias, preencher: preencher };
  if (typeof module !== 'undefined') module.exports = raiz.vpnTermo;
})(typeof window !== 'undefined' ? window : globalThis);
