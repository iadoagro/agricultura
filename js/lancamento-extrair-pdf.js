/* Leitura do PDF da ficha de vistoria DIREITO NO NAVEGADOR — sem PHP, sem
   Python, sem servidor nenhum. Troca o antigo fluxo (lancar_mecanizacao.php
   chamando tools/extrair_relatorio_mecanizacao.py) por um leitor de PDF
   escrito à mão em JavaScript, no mesmo espírito de js/importar.js (que já
   lê .xlsx sem nenhuma biblioteca, descompactando o ZIP à mão com
   DecompressionStream). Aqui é a mesma ideia para PDF: acha os objetos do
   arquivo por busca direta nos bytes, descomprime os fluxos FlateDecode
   (zlib) e decodifica o texto usando o CMap ToUnicode da fonte.

   Same limitations as before (ver tools/extrair_relatorio_mecanizacao.py,
   mantido no repositório como referência/alternativa server-side, mas não
   é mais chamado por padrão): letra de mão sai com erro de OCR, e não dá
   pra saber qual caixa foi marcada com X.

   Expõe window.LANCAMENTO_EXTRAIR_PDF.doArquivo(file) -> Promise<{texto, campos}>
   no MESMO formato que lancar_mecanizacao.js já sabe aplicar no formulário. */
(function () {
  'use strict';

  /* ====================================================== leitor de PDF === */
  /* Byte <-> string 1-para-1 (código 0-255 = byte original). NÃO dá pra usar
     TextDecoder('latin1') aqui: apesar do nome, o padrão WHATWG manda os
     navegadores tratar "latin1" como apelido de windows-1252, que remapeia
     os bytes 0x80-0x9F para caracteres diferentes (ex.: 0x9C vira "œ") —
     isso corrompe justamente os bytes de cabeçalho zlib do FlateDecode. */
  function paraBinStr(bytes) {
    var PEDACO = 0x8000, partes = [];
    for (var i = 0; i < bytes.length; i += PEDACO) partes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + PEDACO)));
    return partes.join('');
  }
  function paraBytes(binStr) {
    var out = new Uint8Array(binStr.length);
    for (var i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i) & 0xFF;
    return out;
  }

  function inflar(bytesComprimidos) {
    if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('Navegador sem DecompressionStream (Chrome/Edge atualizados funcionam).'));
    var fluxo = new Blob([bytesComprimidos]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Response(fluxo).arrayBuffer().then(function (buf) { return paraBinStr(new Uint8Array(buf)); });
  }

  function localizarObjetos(bin) {
    var objetos = {};
    var re = /(\d+)\s+\d+\s+obj([\s\S]*?)endobj/g, m;
    while ((m = re.exec(bin))) objetos[m[1]] = { corpo: m[2] };
    return objetos;
  }

  function corpoStream(corpo) {
    var iStream = corpo.indexOf('stream');
    if (iStream < 0) return null;
    var dict = corpo.slice(0, iStream);
    var pos = iStream + 6;
    if (corpo[pos] === '\r') pos++;
    if (corpo[pos] === '\n') pos++;
    var iEnd = corpo.indexOf('endstream', pos);
    if (iEnd < 0) return null;
    var dados = corpo.slice(pos, iEnd).replace(/\r\n$|\n$|\r$/, '');
    return { dict: dict, dados: dados };
  }

  function ehFlateDecode(dict) { return /\/Filter\s*(\[[^\]]*\/FlateDecode[^\]]*\]|\/FlateDecode)/.test(dict); }

  function textoDoFluxo(corpo) {
    var s = corpoStream(corpo);
    if (!s) return Promise.resolve('');
    if (!ehFlateDecode(s.dict)) return Promise.resolve(s.dados);
    return inflar(paraBytes(s.dados)).catch(function () { return ''; });
  }

  /* --------------------------------------------- strings do content stream */
  function decodeLiteral(bin) {
    var out = [];
    for (var i = 0; i < bin.length; i++) {
      var c = bin[i];
      if (c === '\\') {
        var p = bin[i + 1];
        if (p === 'n') { out.push('\n'); i++; }
        else if (p === 'r') { out.push('\r'); i++; }
        else if (p === 't') { out.push('\t'); i++; }
        else if (p === 'b') { out.push('\b'); i++; }
        else if (p === 'f') { out.push('\f'); i++; }
        else if (p === '\n') { i++; }
        else if (p === '\r') { i++; if (bin[i + 1] === '\n') i++; }
        else if (p >= '0' && p <= '7') {
          var oct = p, k = 1;
          while (k < 3 && bin[i + 1 + k] >= '0' && bin[i + 1 + k] <= '7') { oct += bin[i + 1 + k]; k++; }
          out.push(String.fromCharCode(parseInt(oct, 8) & 0xFF));
          i += k;
        } else { out.push(p); i++; }
      } else out.push(c);
    }
    return out.join('');
  }

  function decodeHex(bin) {
    var limpo = bin.replace(/[^0-9A-Fa-f]/g, '');
    if (limpo.length % 2) limpo += '0';
    var out = [];
    for (var i = 0; i < limpo.length; i += 2) out.push(String.fromCharCode(parseInt(limpo.substr(i, 2), 16)));
    return out.join('');
  }

  var DELIM = /[\s\[\]()<>/%]/;

  /** Varre um content stream e devolve a lista de trechos mostrados como
      texto (Tj/TJ/'/") já com os escapes de string resolvidos, mais '\n'
      nos pontos em que o cursor de texto muda de posição (Td, TD, T-estrela,
      Tm) — serve só para não colar palavras de linhas diferentes. */
  function extrairMostrasDeTexto(bin) {
    var i = 0, n = bin.length, saida = [], pendente = null, numeros = [], ultimoY = null;
    function pularEspacos() {
      while (i < n) {
        if (bin[i] === '%') { while (i < n && bin[i] !== '\n' && bin[i] !== '\r') i++; continue; }
        if (/\s/.test(bin[i])) { i++; continue; }
        break;
      }
    }
    while (i < n) {
      pularEspacos();
      if (i >= n) break;
      var c = bin[i];
      if (c === '(') {
        var depth = 1, ini = ++i;
        while (i < n && depth > 0) {
          if (bin[i] === '\\') { i += 2; continue; }
          if (bin[i] === '(') depth++;
          else if (bin[i] === ')') { depth--; if (depth === 0) break; }
          i++;
        }
        pendente = decodeLiteral(bin.slice(ini, i));
        numeros = [];
        i++; continue;
      }
      if (c === '<' && bin[i + 1] === '<') {
        var d2 = 0;
        while (i < n) {
          if (bin[i] === '<' && bin[i + 1] === '<') { d2++; i += 2; continue; }
          if (bin[i] === '>' && bin[i + 1] === '>') { d2--; i += 2; if (d2 === 0) break; continue; }
          i++;
        }
        continue;
      }
      if (c === '<') {
        var ini2 = ++i;
        while (i < n && bin[i] !== '>') i++;
        pendente = decodeHex(bin.slice(ini2, i));
        numeros = [];
        i++; continue;
      }
      if (c === '[') {
        var d3 = 1, buf = []; i++;
        while (i < n && d3 > 0) {
          pularEspacos();
          var cc = bin[i];
          if (cc === undefined || cc === ']') { d3--; i++; break; }
          if (cc === '(') {
            var depth4 = 1, ini3 = ++i;
            while (i < n && depth4 > 0) {
              if (bin[i] === '\\') { i += 2; continue; }
              if (bin[i] === '(') depth4++;
              else if (bin[i] === ')') { depth4--; if (depth4 === 0) break; }
              i++;
            }
            buf.push(decodeLiteral(bin.slice(ini3, i))); i++; continue;
          }
          if (cc === '<') {
            var ini4 = ++i;
            while (i < n && bin[i] !== '>') i++;
            buf.push(decodeHex(bin.slice(ini4, i))); i++; continue;
          }
          var s5 = i;
          while (i < n && !DELIM.test(bin[i])) i++;
          if (i === s5) i++;
        }
        pendente = buf.join('');
        numeros = [];
        continue;
      }
      if (c === '/') {
        i++;
        while (i < n && !DELIM.test(bin[i])) i++;
        continue;
      }
      var s6 = i;
      while (i < n && !DELIM.test(bin[i])) i++;
      var palavra = bin.slice(s6, i);
      if (palavra === 'Tj' || palavra === "'" || palavra === '"' || palavra === 'TJ') {
        if (pendente != null) saida.push(pendente);
        pendente = null; numeros = [];
      } else if (palavra === 'Td' || palavra === 'TD') {
        // "tx ty Td" é um deslocamento RELATIVO: só é quebra de linha de
        // verdade quando ty muda (o eixo vertical do texto).
        var ty = numeros.length ? numeros[numeros.length - 1] : 0;
        saida.push(Math.abs(ty) > 0.05 ? '\n' : ' ');
        if (ultimoY != null) ultimoY += ty;
        pendente = null; numeros = [];
      } else if (palavra === 'T*') {
        saida.push('\n');
        pendente = null; numeros = [];
      } else if (palavra === 'Tm') {
        // "a b c d e f Tm" fixa a posição ABSOLUTA do texto na página; f é o
        // y. Este PDF (PDFium com camada de OCR) desenha CADA PALAVRA no seu
        // próprio bloco BT/ET com um Tm absoluto — sem comparar o y de uma
        // palavra com o da anterior, toda palavra vira uma "linha" e cortava
        // rótulos de mais de uma palavra ("Nome do Beneficiário: Fulano de
        // Tal" virava só "Fulano"). Variação pequena de y (ruído da caixa
        // delimitadora do OCR) = mesma linha; salto grande = linha nova.
        var f = numeros.length ? numeros[numeros.length - 1] : null;
        if (f != null) {
          saida.push(ultimoY == null || Math.abs(f - ultimoY) > 3 ? '\n' : ' ');
          ultimoY = f;
        } else {
          saida.push('\n');
        }
        pendente = null; numeros = [];
      } else if (palavra !== '' && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(palavra)) {
        numeros.push(parseFloat(palavra));
      } else if (palavra === '') {
        i++;
      } else {
        numeros = []; // outro operador qualquer: descarta números órfãos
      }
    }
    return saida;
  }

  /* ------------------------------------------------------------- ToUnicode */
  function hexParaUnicode(hex) {
    hex = hex.replace(/[<>\s]/g, '');
    var out = [];
    for (var i = 0; i + 4 <= hex.length; i += 4) out.push(String.fromCharCode(parseInt(hex.substr(i, 4), 16)));
    if (!out.length && hex.length) out.push(String.fromCharCode(parseInt(hex, 16) || 0));
    return out.join('');
  }

  function parseCMap(texto, mapa) {
    var reBloco = /begin(bfchar|bfrange)([\s\S]*?)end(?:bfchar|bfrange)/g, m;
    while ((m = reBloco.exec(texto))) {
      var corpo = m[2];
      if (m[1] === 'bfchar') {
        var reEntry = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, e;
        while ((e = reEntry.exec(corpo))) mapa.set(parseInt(e[1], 16), hexParaUnicode(e[2]));
      } else {
        var reR1 = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, r;
        while ((r = reR1.exec(corpo))) {
          var lo = parseInt(r[1], 16), hi = parseInt(r[2], 16), dstBase = parseInt(r[3], 16);
          // o código é sempre lido em 2 bytes (0x0000-0xFFFF), então esse é o teto real
          for (var c = lo; c <= hi && c - lo < 0x10000; c++) mapa.set(c, String.fromCharCode(dstBase + (c - lo)));
        }
        var reR2 = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g, r2;
        while ((r2 = reR2.exec(corpo))) {
          var lo2 = parseInt(r2[1], 16);
          var itens = r2[3].match(/<[0-9A-Fa-f]+>/g) || [];
          itens.forEach(function (it, idx) { mapa.set(lo2 + idx, hexParaUnicode(it)); });
        }
      }
    }
  }

  function decodificarComCMap(binStr, mapa) {
    if (!mapa.size) return binStr; // sem CMap: assume 1 byte por caractere (aproximação)
    var out = [];
    var i = 0;
    for (; i + 1 < binStr.length; i += 2) {
      var codigo = (binStr.charCodeAt(i) << 8) | binStr.charCodeAt(i + 1);
      var u = mapa.get(codigo);
      if (u != null) out.push(u);
    }
    if (i < binStr.length) {
      var ultimo = mapa.get(binStr.charCodeAt(i));
      if (ultimo != null) out.push(ultimo);
    }
    return out.join('');
  }

  /** Lê o PDF inteiro e devolve o texto reconhecido (uma string só, com \n
      separando trechos que mudam de posição no papel). */
  function extrairTexto(file) {
    return file.arrayBuffer().then(function (buf) {
      var bin = paraBinStr(new Uint8Array(buf));
      var objetos = localizarObjetos(bin);
      var chaves = Object.keys(objetos);
      var mapaUnicode = new Map();

      return Promise.all(chaves.map(function (k) {
        return textoDoFluxo(objetos[k].corpo).then(function (texto) {
          objetos[k].textoFluxo = texto; // guarda pra reaproveitar, evita descomprimir 2x
          if (texto.indexOf('beginbfchar') >= 0 || texto.indexOf('beginbfrange') >= 0) parseCMap(texto, mapaUnicode);
        });
      })).then(function () {
        var paginas = chaves.filter(function (k) { return /\/Type\s*\/Page(?!s)\b/.test(objetos[k].corpo); });
        var refs = [];
        paginas.forEach(function (k) {
          var corpo = objetos[k].corpo;
          var mUnico = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(corpo);
          if (mUnico) { refs.push(mUnico[1]); return; }
          var mArr = /\/Contents\s*\[([^\]]+)\]/.exec(corpo);
          if (mArr) {
            var re = /(\d+)\s+\d+\s+R/g, mm;
            while ((mm = re.exec(mArr[1]))) refs.push(mm[1]);
          }
        });
        if (!refs.length) refs = chaves; // sem /Type/Page localizável: tenta tudo

        var textoFinal = [];
        refs.forEach(function (k) {
          var texto = objetos[k] && objetos[k].textoFluxo;
          if (!texto) return;
          extrairMostrasDeTexto(texto).forEach(function (item) {
            textoFinal.push(item === '\n' ? '\n' : decodificarComCMap(item, mapaUnicode));
          });
        });
        return textoFinal.join(' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/[ \t]+/g, ' ').trim();
      });
    });
  }

  /* ================================================ reconhecer os campos === */
  var MUNICIPIOS_ACRE = [
    'Acrelândia', 'Assis Brasil', 'Brasiléia', 'Bujari', 'Capixaba',
    'Cruzeiro do Sul', 'Epitaciolândia', 'Feijó', 'Jordão', 'Mâncio Lima',
    'Manoel Urbano', 'Marechal Thaumaturgo', 'Plácido de Castro',
    'Porto Acre', 'Porto Walter', 'Rio Branco', 'Rodrigues Alves',
    'Santa Rosa do Purus', 'Sena Madureira', 'Senador Guiomard',
    'Tarauacá', 'Xapuri'
  ];
  var HOMOGLIFOS = {
    'а': 'a', 'А': 'A', 'е': 'e', 'Е': 'E', 'о': 'o', 'О': 'O',
    'р': 'p', 'Р': 'P', 'с': 'c', 'С': 'C', 'х': 'x', 'Х': 'X',
    'у': 'y', 'У': 'Y', 'к': 'k', 'К': 'K', 'м': 'm', 'М': 'M',
    'н': 'H', 'В': 'B', 'в': 'B', 'Т': 'T'
  };

  function semAcento(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function limparHomoglifos(s) { return s.replace(/[а-яА-Я]/g, function (c) { return HOMOGLIFOS[c] || c; }); }
  function limpar(s) {
    if (!s) return '';
    s = limparHomoglifos(s).replace(/\s+/g, ' ').trim();
    return s.replace(/^[\s:;._-]+|[\s:;._-]+$/g, '');
  }
  function campo(valor, confianca, origem) { return { valor: (valor === '' ? null : valor), confianca: confianca, origem: origem }; }

  function distanciaLevenshtein(a, b) {
    var m = a.length, n = b.length, dp = [];
    for (var j = 0; j <= n; j++) dp[j] = j;
    for (var i = 1; i <= m; i++) {
      var anterior = dp[0]; dp[0] = i;
      for (var j2 = 1; j2 <= n; j2++) {
        var temp = dp[j2];
        dp[j2] = a[i - 1] === b[j2 - 1] ? anterior : 1 + Math.min(anterior, dp[j2], dp[j2 - 1]);
        anterior = temp;
      }
    }
    return dp[n];
  }
  function similaridade(a, b) {
    var maxLen = Math.max(a.length, b.length);
    return maxLen ? 1 - distanciaLevenshtein(a, b) / maxLen : 1;
  }

  function extrairAposLabel(texto, labels, ate, maxLen) {
    maxLen = maxLen || 80;
    for (var i = 0; i < labels.length; i++) {
      var padrao = new RegExp(labels[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '[\\s:._-]*', 'i');
      var m = padrao.exec(texto);
      if (!m) continue;
      var resto = texto.slice(m.index + m[0].length, m.index + m[0].length + maxLen);
      if (ate) {
        var corte = new RegExp(ate, 'i').exec(resto);
        if (corte) resto = resto.slice(0, corte.index);
      }
      var valor = limpar(resto.split('\n')[0]);
      if (valor) return valor;
    }
    return '';
  }

  function melhorMunicipio(bruto) {
    if (!bruto) return null;
    var alvo = semAcento(bruto).toLowerCase();
    var melhor = null, melhorScore = 0;
    MUNICIPIOS_ACRE.forEach(function (m) {
      var score = similaridade(alvo, semAcento(m).toLowerCase());
      if (score > melhorScore) { melhorScore = score; melhor = m; }
    });
    if (melhorScore >= 0.6) return melhor;
    for (var i = 0; i < MUNICIPIOS_ACRE.length; i++) {
      var chave = semAcento(MUNICIPIOS_ACRE[i]).toLowerCase();
      if (alvo.indexOf(chave) >= 0 || chave.indexOf(alvo) >= 0) return MUNICIPIOS_ACRE[i];
    }
    return null;
  }

  function reconstruirData(bruto, minAno, maxAno) {
    minAno = minAno || 2015; maxAno = maxAno || 2035;
    if (!bruto) return null;
    var digitos = bruto.toUpperCase().replace(/Z/g, '2').replace(/S/g, '5').replace(/[^0-9]/g, '');
    if (digitos.length < 8) return null;
    digitos = digitos.slice(0, 8);
    var d = parseInt(digitos.slice(0, 2), 10), m = parseInt(digitos.slice(2, 4), 10), a = parseInt(digitos.slice(4, 8), 10);
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= minAno && a <= maxAno)) return null;
    return a + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function extrairCpf(texto) {
    var m = /CPF\s*:?\s*([0-9][0-9.\-\s]{9,16}[0-9])/i.exec(texto);
    if (!m) return null;
    var digitos = m[1].replace(/\D/g, '');
    if (digitos.length !== 11) return null;
    return digitos.slice(0, 3) + '.' + digitos.slice(3, 6) + '.' + digitos.slice(6, 9) + '-' + digitos.slice(9, 11);
  }

  function extrairTelefone(texto) {
    var m = /Telefone\s*:?\s*\(?\s*(\d{2,3})\s*\)?\s*[-.\s]*(\d{4,5})[-.\s]*(\d{4})/i.exec(texto);
    if (!m) return null;
    return '(' + m[1].slice(-2) + ') ' + m[2] + '-' + m[3];
  }

  function extrairValorDae(texto) {
    var m = /Valor\s+da\s+DAE\s*R\$\s*:?\s*([0-9][0-9.,]*)/i.exec(texto);
    if (!m) return null;
    var bruto = m[1];
    bruto = bruto.indexOf(',') >= 0 ? bruto.replace(/\./g, '').replace(',', '.') : bruto;
    var v = parseFloat(bruto);
    return isNaN(v) ? null : Math.round(v * 100) / 100;
  }

  function extrairPontosGeo(texto) {
    var m = /Georreferenciamento([\s\S]{0,600})/i.exec(texto);
    var trecho = m ? m[1] : texto;
    function primeiro(re) { var mm; re = new RegExp(re, 'gi'); while ((mm = re.exec(trecho))) if (mm[1]) return mm[1]; return ''; }
    var x = primeiro('X\\s*:?\\s*([0-9]{4,9})');
    var y = primeiro('Y\\s*:?\\s*([0-9]{4,9})');
    var zona = primeiro('Zona\\s*:?\\s*\\(?\\s*\\)?\\s*(18|19)');
    if (!x && !y) return [];
    return [{ ponto: 1, x: x, y: y, zona: zona }];
  }

  function detectarTipoServico(texto) {
    var baixo = semAcento(texto).toLowerCase();
    function conta(s) { return (baixo.match(new RegExp(s, 'g')) || []).length; }
    var pontosMec = conta('cultivo') + conta('area mecanizada') + conta('area cultivada');
    var pontosAcu = conta('acude') + conta('tanque') + conta('reforma de acude');
    if (!pontosMec && !pontosAcu) return null;
    return pontosAcu > pontosMec ? 'Açudagem' : 'Mecanização';
  }

  var PROXIMO_LABEL = '(?:Nome|CPF|Data\\s+d[ea]|Estado\\s+Civil|Sexo|Ind[ií]gena|Etnia|Possui\\s+DAP|' +
    'Telefone|Endere[cç]o|Munic[ií]pio|Escrit[oó]rio|Assinatura|3\\.\\d|2\\.\\d|1\\.\\d|$)';

  function montarCampos(texto) {
    var campos = {};

    campos.escritorio_local = campo(extrairAposLabel(texto, ['Escritório Local', 'Escritorio Local'], 'Data\\s+da\\s+Vistoria'), 'baixa', 'rótulo impresso');

    var dataVistoriaBruta = extrairAposLabel(texto, ['Data da Vistoria', 'Data da Vlstoria'], '[A-Za-zÀ-ú]{4}');
    campos.data_vistoria = campo(reconstruirData(dataVistoriaBruta), 'baixa', 'dígitos após "Data da Vistoria"');

    campos.responsavel_tecnico = campo(extrairAposLabel(texto, [
      'Nome do Responsável Técnico', 'Nome do Responsavel Tecnico', 'Nome do Responsávél Tecnico'
    ], PROXIMO_LABEL), 'baixa', 'rótulo impresso');

    campos.nome_beneficiario = campo(extrairAposLabel(texto, ['Nome do Beneficiário', 'Nome do Beneficiario'], PROXIMO_LABEL), 'baixa', 'rótulo impresso; escrita à mão');

    campos.cpf = campo(extrairCpf(texto), 'média', 'dígitos após "CPF"');

    var nascBruta = extrairAposLabel(texto, ['Data de Nascimento'], 'Estado\\s+Civil|Sexo|[A-Za-zÀ-ú]{5}');
    campos.data_nascimento = campo(reconstruirData(nascBruta), 'baixa', 'dígitos após "Data de Nascimento"');

    campos.telefone = campo(extrairTelefone(texto), 'média', 'dígitos após "Telefone"');

    campos.associacao_cooperativa = campo(extrairAposLabel(texto, ['Nome da Associação/Cooperativa', 'Nome da Associacao/Cooperativa'], PROXIMO_LABEL), 'baixa', 'rótulo impresso');

    campos.endereco = campo(extrairAposLabel(texto, [
      'Endereço (Projeto de Assentamento/Comunidade, BR/Ramal, Km, nº do lote)',
      'Endereco (Projeto de Assentamento/Comunidade, BR/Ramal, Km, n do lote)',
      'Endereço', 'Endereco'
    ], 'Nome\\s+da\\s+Propriedade', 120), 'baixa', 'rótulo impresso');

    campos.nome_propriedade = campo(extrairAposLabel(texto, ['Nome da Propriedade'], PROXIMO_LABEL), 'baixa', 'rótulo impresso');

    var municipioBruto = extrairAposLabel(texto, ['Município', 'Municipio'], PROXIMO_LABEL);
    var municipioAjustado = melhorMunicipio(municipioBruto);
    campos.municipio = campo(municipioAjustado || (municipioBruto || null), municipioAjustado ? 'média' : 'baixa',
      municipioAjustado ? 'comparado com a lista dos 22 municípios do Acre' : 'rótulo impresso, sem correspondência clara');

    campos.num_identificacao_patrimonio = campo(extrairAposLabel(texto, [
      'N° de Identificação/N° Patrimônio', 'N de Identificacao/N Patrimonio', 'Identificação/N° Patrimônio', 'Patrimônio', 'Patrimonio'
    ], PROXIMO_LABEL), 'baixa', 'rótulo impresso');

    var numDaeBruto = extrairAposLabel(texto, ['N° da DAE', 'N da DAE'], 'Assinatura|Valor');
    campos.num_dae = campo(/\d/.test(numDaeBruto || '') ? numDaeBruto : null, 'baixa', 'rótulo impresso');

    campos.valor_dae = campo(extrairValorDae(texto), 'média', 'dígitos após "Valor da DAE"');
    campos.pontos_geo = campo(extrairPontosGeo(texto), 'média', 'dígitos após "X:"/"Y:"/"Zona:"');
    campos.tipo_servico = campo(detectarTipoServico(texto), 'média', 'presença de "cultivo" (mecanização) ou "açude/tanque" (açudagem)');

    ['estado_civil', 'sexo', 'indigena', 'etnia', 'possui_dap', 'tipo_uso', 'tipo_trator',
      'maquinas', 'implementos', 'culturas', 'area_total_ha', 'horas_maquina',
      'quantidade_acudes', 'poligono'].forEach(function (chave) {
      campos[chave] = campo(null, 'nenhuma', 'não é possível identificar a partir do texto do PDF');
    });

    return campos;
  }

  function doArquivo(file) {
    return extrairTexto(file).then(function (texto) {
      if (!texto || !texto.trim()) throw new Error('O PDF não tem texto reconhecível (parece ser só imagem, sem OCR).');
      return { texto: texto, campos: montarCampos(texto) };
    });
  }

  window.LANCAMENTO_EXTRAIR_PDF = { doArquivo: doArquivo, extrairTexto: extrairTexto, montarCampos: montarCampos };
})();
