/* Leitura de planilha .xlsx no navegador — SEAGRI
   Sem dependências: o .xlsx é um ZIP, descompactado com DecompressionStream
   ('deflate-raw'), e as planilhas são XML.

   ATENÇÃO: as normalizações abaixo espelham tools/gerar_dados_mecanizacao.py.
   Mexeu em uma, mexa na outra — senão o painel passa a mostrar números
   diferentes dependendo de como os dados entraram. */
(function (global) {
  'use strict';

  var ABA = 'dados';
  var NI = 'Não informado';
  var COLUNAS_DATA = ['Carimbo de data/hora', 'Data da Vistoria', 'Data de Nascimento'];

  /* ============================================================ ZIP + XML */
  function lerZip(buffer) {
    var dv = new DataView(buffer), u8 = new Uint8Array(buffer);
    var i = u8.length - 22;
    for (; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) break; }
    if (i < 0) throw new Error('Arquivo não parece ser um .xlsx válido (ZIP não reconhecido).');
    var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true);
    var td = new TextDecoder('utf-8'), arquivos = {};
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var metodo = dv.getUint16(p + 10, true);
      var tam = dv.getUint32(p + 20, true);
      var nomeLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var comLen = dv.getUint16(p + 32, true);
      var offLocal = dv.getUint32(p + 42, true);
      var nome = td.decode(u8.subarray(p + 46, p + 46 + nomeLen));
      var nl = dv.getUint16(offLocal + 26, true), el = dv.getUint16(offLocal + 28, true);
      var ini = offLocal + 30 + nl + el;
      arquivos[nome] = { metodo: metodo, dados: u8.subarray(ini, ini + tam) };
      p += 46 + nomeLen + extraLen + comLen;
    }
    return arquivos;
  }

  function comoTexto(entrada) {
    if (!entrada) return Promise.resolve('');
    if (entrada.metodo === 0) return Promise.resolve(new TextDecoder('utf-8').decode(entrada.dados));
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('Este navegador não descompacta o arquivo. Use Chrome ou Edge atualizado.'));
    }
    var fluxo = new Blob([entrada.dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(fluxo).text();
  }

  function desescapar(s) {
    return s.replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  /** Extrai o texto de cada <si> do sharedStrings (concatenando os <t>). */
  function lerSharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    var re = /<si>([\s\S]*?)<\/si>/g, m;
    while ((m = re.exec(xml))) {
      var partes = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      out.push(desescapar(partes.map(function (t) {
        return t.replace(/<t[^>]*>/, '').replace(/<\/t>$/, '');
      }).join('')));
    }
    return out;
  }

  function colunaParaIndice(ref) {
    var letras = (ref.match(/^[A-Z]+/) || ['A'])[0], n = 0;
    for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }

  /** Serial do Excel -> 'YYYY-MM-DD' (epoch 1899-12-30, já cobre o bug de 1900). */
  function serialParaIso(serial) {
    if (!isFinite(serial) || serial <= 0) return '';
    var d = new Date(Math.round((serial - 25569) * 86400000));
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') +
      '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function lerLinhas(xml, shared) {
    var linhas = [];
    var reLinha = /<row[^>]*>([\s\S]*?)<\/row>/g, m;
    while ((m = reLinha.exec(xml))) {
      var celulas = [], reCel = /<c\s+([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, c;
      while ((c = reCel.exec(m[1]))) {
        var attrs = c[1], corpo = c[3] || '';
        var ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || '';
        var tipo = (attrs.match(/t="([^"]+)"/) || [])[1] || 'n';
        var idx = ref ? colunaParaIndice(ref) : celulas.length;
        var valor = null;
        if (tipo === 's') {
          var iv = (corpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          valor = iv != null ? shared[+iv] : null;
        } else if (tipo === 'inlineStr') {
          var ts = corpo.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
          valor = desescapar(ts.map(function (t) {
            return t.replace(/<t[^>]*>/, '').replace(/<\/t>$/, '');
          }).join(''));
        } else {
          var vv = (corpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (vv != null) valor = tipo === 'str' ? desescapar(vv) : (isNaN(+vv) ? desescapar(vv) : +vv);
        }
        celulas[idx] = valor;
      }
      linhas.push(celulas);
    }
    return linhas;
  }

  /* ======================== normalizações (espelho do script Python) ======= */
  function semAcento(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function txt(v) {
    if (v == null) return '';
    if (typeof v === 'number' && Number.isInteger(v)) v = String(v);
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function ehNaoInformado(s) {
    var t = semAcento(s).toLowerCase().replace(/^[\s"'.]+|[\s"'.]+$/g, '');
    return ['', 'nao informado', 'nao informada', 'nao informando', 'nao inofrmado',
      'nao', 'n/a', 'na', '0', '-'].indexOf(t) >= 0;
  }
  function rotulo(s) { s = txt(s); return ehNaoInformado(s) ? NI : s; }
  function titulo(s) {
    return s.split(' ').map(function (p) {
      return p.length > 2 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase();
    }).join(' ');
  }
  function ehMaiuscula(s) { return s === s.toUpperCase() && /[A-ZÀ-Ú]/.test(s); }
  function numero(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    var t = txt(v);
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return 0;
    return /^0+(\.0+)?$/.test(t) ? 0 : parseFloat(t);
  }
  function dataIso(v) {
    if (typeof v === 'number') return serialParaIso(v);
    var t = txt(v);
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (m) return m[3] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    return m ? m[0].slice(0, 10) : '';
  }
  function normEscritorio(s) {
    s = txt(s).replace(/^Escrit[óo]rio\s+Local\s+(de|da|do)?\s*/i, '');
    var mapa = { transacrena: 'Transacreana', transacreana: 'Transacreana', brasileia: 'Brasiléia' };
    var c = semAcento(s).toLowerCase();
    return mapa[c] || (ehMaiuscula(s) ? titulo(s) : s) || NI;
  }
  function normEstadoCivil(s) {
    var c = semAcento(txt(s)).toLowerCase();
    if (c.indexOf('casado') === 0) return 'Casado(a)';
    if (c.indexOf('solt') === 0 || c.indexOf('solit') === 0) return 'Solteiro(a)';
    if (c.indexOf('amasiado') === 0) return 'Amasiado(a)';
    if (c.indexOf('viuvo') === 0) return 'Viúvo(a)';
    if (c.indexOf('divorciado') === 0) return 'Divorciado(a)';
    if (c.indexOf('separado') === 0) return 'Separado(a)';
    return NI;
  }
  /** Quem lançou a linha, tirado do e-mail: só o usuário, capitalizado a cada
      trecho ('lucaspaiva.agro2011@ac.gov.br' → 'Lucaspaiva.Agro2011'). É como
      as abas de inserção da planilha nomeiam essa pessoa, então os dois
      rankings podem ser conferidos lado a lado. Espelha norm_alimentador()
      de tools/gerar_dados_mecanizacao.py. */
  function normAlimentador() {
    for (var i = 0; i < arguments.length; i++) {
      var t = txt(arguments[i]);
      if (t.indexOf('@') > 0) {
        var u = t.split('@')[0].trim();
        if (u) {
          return u.replace(/(^|[._-])([a-zà-ú])/g, function (_, sep, letra) {
            return sep + letra.toUpperCase();
          });
        }
      }
    }
    return NI;
  }
  function normTecnico(s) {
    s = txt(s);
    if (ehMaiuscula(s)) s = titulo(s);
    var mapa = {
      'jorge ney pontes': 'Jorge Ney Pontes Araújo',
      'jorge ney pontes araujo': 'Jorge Ney Pontes Araújo',
      'antonio francisco': 'Antônio Francisco de Araújo do Nascimento'
    };
    return mapa[semAcento(s).toLowerCase()] || s || NI;
  }

  var IMPLEMENTOS = [
    ['Grade aradora', ['grade aradora', 'grade de arado', 'aradora', 'arado']],
    ['Grade niveladora', ['niveladora', 'nivelado']],
    ['Plantadeira', ['plantadeira']],
    ['Colheitadeira', ['colheitadeira']],
    ['Pulverizador', ['pulverizador']],
    ['Jogadora de calcário', ['calcario']],
    ['Destoca', ['destoca']],
    ['Roçadeira', ['rocad']],
    ['Piscicultura', ['piscicultura', 'psicultura', 'pisicultura', 'piscicultuta', 'picicultura']],
    ['Tanque / açude', ['tanque', 'acude', 'reforma']]
  ];
  var MAQUINAS = [
    ['Escavadeira hidráulica', ['escavadeira']],
    ['Pá carregadeira', ['pa carregadeira', 'pa mecanica', 'pa carregaderira', 'pa mecanic']],
    ['Trator de esteira', ['esteira']],
    ['Trator de pneu', ['pneu']],
    ['Trator agrícola', ['trator agricola']],
    ['Retroescavadeira', ['retroescavadeira']],
    ['New Holland', ['new holland']],
    ['Massey Ferguson', ['massey']],
    ['John Deere', ['john deere']],
    ['Solis 90', ['solis', 'soleis', 'soles']]
  ];
  function extrair(valor, tabela) {
    var c = semAcento(txt(valor)).toLowerCase();
    if (!c || ehNaoInformado(txt(valor))) return [];
    var out = [];
    tabela.forEach(function (par) {
      if (out.indexOf(par[0]) < 0 && par[1].some(function (k) { return c.indexOf(k) >= 0; })) out.push(par[0]);
    });
    return out;
  }

  /* ============================================================== montagem */
  function montar(linhas) {
    if (!linhas.length) throw new Error('A aba "' + ABA + '" está vazia.');
    var cab = linhas[0].map(txt);
    var dados = linhas.slice(1).filter(function (r) {
      return r.some(function (c) { return c != null && txt(c) !== ''; });
    });

    function idx(nome, ocorrencia) {
      var achados = [];
      cab.forEach(function (h, i) { if (h === nome) achados.push(i); });
      var i = achados[ocorrencia || 0];
      if (i == null) throw new Error('Coluna não encontrada na planilha: "' + nome + '". ' +
        'A estrutura precisa ser a mesma do formulário de mecanização.');
      return i;
    }

    /** Coluna que pode não existir em exportações mais antigas. */
    function idxOpc(nome) {
      var i = cab.indexOf(nome);
      return i < 0 ? -1 : i;
    }

    var I = {
      carimbo: idx('Carimbo de data/hora'),
      email: idxOpc('Endereço de e-mail'), email2: idxOpc('Email'),
      escritorio: idx('Escritório Local'),
      vistoria: idx('Data da Vistoria'), tecnico: idx('Nome do responsável técnico'),
      produtor: idx('Nome do produtor'), sexo: idx('Sexo'),
      civil: idx('Estado Civil'), assoc: idx('Nome da Associação/Cooperativa:'),
      dap: idx('Possui DAP:'), municipio: idx('Município:'),
      endereco: idx('Endereço (Projeto de Assentamento/Comunidade, BR/Ramal, Km, nº do lote):'),
      propriedade: idx('Nome da Propriedade:'), ponto: idx('Ponto de controle'),
      horas: idx('Quantidade de horas'), maquina: idx('Máquina'),
      total_mec: idx('Total mecanizado'), trator: idx('Nome do trator'),
      tipo_trator: idx('Tipo de trator'), tipo_impl: idx('Tipo de Implemento'),
      nome_impl: idx('Nome do implemento'), acudes: idx('Quantidade de açudes'),
      formulario: idx('Formulário de Mecanização'), obs: idx('Informe a observação'),
      geox: idx('Geo X'), geoy: idx('Geo Y')
    };
    var CULTURAS = [
      [idx('Primeira cultura'), idx('Área (hectare)', 0), idx('Sistema de Cultivo', 0)],
      [idx('Segunda cultura'), idx('Área (hectare)', 1), idx('Sistema de Cultivo', 1)],
      [idx('Terceira cultura'), idx('Área (hectare)', 2), idx('Sistema de Cultivo', 2)],
      [idx('Quarta cultura'), idx('Área (hectare)', 3), idx('Sistema de Cultivo', 3)]
    ];
    var DAE = [];
    for (var n = 1; n <= 10; n++) DAE.push(idx('Informe o valor da DAE - ' + n));

    /* Produtores distintos pelo NOME normalizado — a mesma chave do painel.
       A coluna CPF da planilha não é lida: nenhum dado pessoal sensível entra
       no pacote publicado, nem em forma derivada. */
    var produtores = Object.create(null), nProd = 0, registros = [];
    var qualidade = { sem_data_valida: 0, vistoria_outro_ano: 0,
      sem_geo: 0, sem_formulario: 0, acudes_texto: 0 };

    dados.forEach(function (r) {
      var data = dataIso(r[I.carimbo]);
      var vistoria = dataIso(r[I.vistoria]);
      if (!data) { data = vistoria; qualidade.sem_data_valida++; }
      if (vistoria && data && vistoria.slice(0, 4) !== data.slice(0, 4)) qualidade.vistoria_outro_ano++;

      var cult = [];
      CULTURAS.forEach(function (c) {
        var nome = txt(r[c[0]]);
        if (!nome || ehNaoInformado(nome)) return;
        cult.push([rotulo(nome), Math.round(numero(r[c[1]]) * 100) / 100, rotulo(r[c[2]])]);
      });

      var dae = 0;
      DAE.forEach(function (j) { dae += numero(r[j]); });

      if (!numero(r[I.geox]) || !numero(r[I.geoy])) qualidade.sem_geo++;
      // célula de "Quantidade de açudes" digitada como texto ('01'): o painel
      // converte e conta, mas o SOMA do Excel ignora — vale avisar
      if (typeof r[I.acudes] !== 'number' && numero(r[I.acudes]) > 0) qualidade.acudes_texto++;
      var form = txt(r[I.formulario]);
      if (form.indexOf('http') !== 0) { form = ''; qualidade.sem_formulario++; }
      var prod = txt(r[I.produtor]);
      var chaveProd = semAcento(prod).toLowerCase().replace(/\s+/g, ' ').trim();
      if (chaveProd && !(chaveProd in produtores)) { produtores[chaveProd] = 1; nProd++; }
      var dapBruto = txt(r[I.dap]);

      registros.push({
        d: data, ex: data.slice(0, 4), dv: vistoria,
        pc: rotulo(r[I.ponto]), mun: rotulo(r[I.municipio]), esc: normEscritorio(r[I.escritorio]),
        rt: normTecnico(r[I.tecnico]),
        alim: normAlimentador(I.email < 0 ? '' : r[I.email], I.email2 < 0 ? '' : r[I.email2]),
        prod: ehMaiuscula(prod) ? titulo(prod) : prod,
        sexo: rotulo(r[I.sexo]), ec: normEstadoCivil(r[I.civil]),
        dap: ['Sim', 'Não', 'Vencida'].indexOf(dapBruto) >= 0 ? dapBruto : NI,
        assoc: rotulo(r[I.assoc]), loc: txt(r[I.endereco]), propr: rotulo(r[I.propriedade]),
        cult: cult,
        ha: Math.round(numero(r[I.total_mec]) * 100) / 100,
        hrs: Math.round(numero(r[I.horas]) * 100) / 100,
        ac: Math.trunc(numero(r[I.acudes])),
        tt: rotulo(r[I.tipo_trator]),
        maq: extrair(r[I.trator], MAQUINAS).length ? extrair(r[I.trator], MAQUINAS) : extrair(r[I.maquina], MAQUINAS),
        impl: extrair(r[I.tipo_impl], IMPLEMENTOS).length ? extrair(r[I.tipo_impl], IMPLEMENTOS) : extrair(r[I.nome_impl], IMPLEMENTOS),
        dae: Math.round(dae * 100) / 100,
        form: form, obs: txt(r[I.obs])
      });
    });

    registros.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    var agora = new Date();
    var pad = function (v) { return String(v).padStart(2, '0'); };

    return {
      meta: {
        arquivo: '', aba: ABA,
        gerado_em: pad(agora.getDate()) + '/' + pad(agora.getMonth() + 1) + '/' + agora.getFullYear() +
          ' ' + pad(agora.getHours()) + ':' + pad(agora.getMinutes()),
        registros: registros.length,
        produtores: nProd,
        periodo: registros.length ? [registros[0].d, registros[registros.length - 1].d] : ['', ''],
        qualidade: qualidade
      },
      registros: registros
    };
  }

  /** Lê um File/Blob .xlsx e devolve {meta, registros} no mesmo formato do painel. */
  function lerPlanilha(arquivo) {
    return arquivo.arrayBuffer().then(function (buffer) {
      var arquivos = lerZip(buffer);
      if (!arquivos['xl/workbook.xml']) throw new Error('Arquivo .xlsx sem xl/workbook.xml — está corrompido?');
      return Promise.all([
        comoTexto(arquivos['xl/workbook.xml']),
        comoTexto(arquivos['xl/_rels/workbook.xml.rels']),
        comoTexto(arquivos['xl/sharedStrings.xml'])
      ]).then(function (partes) {
        var wb = partes[0], rels = partes[1], shared = lerSharedStrings(partes[2]);
        // atributos lidos separadamente: a ordem varia conforme quem gerou o arquivo
        var re = /<sheet\b[^>]*>/g, m, rid = null, nomes = [];
        while ((m = re.exec(wb))) {
          var nome = desescapar((m[0].match(/\bname="([^"]*)"/) || [])[1] || '');
          var id = (m[0].match(/r:id="([^"]*)"/) || [])[1];
          nomes.push(nome);
          if (nome.toLowerCase() === ABA && id) rid = id;
        }
        if (!rid) throw new Error('A planilha nao tem a aba "' + ABA + '". Abas encontradas: ' + nomes.join(', ') + '.');
        var alvo = (new RegExp('Id="' + rid + '"[^>]*Target="([^"]*)"').exec(rels) || [])[1];
        if (!alvo) throw new Error('Nao foi possivel localizar a aba "' + ABA + '" dentro do arquivo.');
        var caminho = 'xl/' + alvo.replace(/^\/?xl\//, '').replace(/^\//, '');
        if (!arquivos[caminho]) throw new Error('Aba "' + ABA + '" nao encontrada no pacote (' + caminho + ').');
        return comoTexto(arquivos[caminho]).then(function (xmlAba) {
          var pacote = montar(lerLinhas(xmlAba, shared));
          pacote.meta.arquivo = arquivo.name || 'planilha.xlsx';
          return pacote;
        });
      });
    });
  }

  global.IMPORTAR = { lerPlanilha: lerPlanilha, aba: ABA };
})(window);
