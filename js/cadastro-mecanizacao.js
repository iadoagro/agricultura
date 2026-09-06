(function () {
  var STORAGE_KEY = 'seagri_mecanizacao_cadastros_2026';

  var MUNICIPIOS = [
    'Acrelândia', 'Assis Brasil', 'Brasiléia', 'Bujari', 'Capixaba',
    'Cruzeiro do Sul', 'Epitaciolândia', 'Feijó', 'Jordão', 'Mâncio Lima',
    'Manoel Urbano', 'Marechal Thaumaturgo', 'Plácido de Castro', 'Porto Acre',
    'Porto Walter', 'Rio Branco', 'Rodrigues Alves', 'Santa Rosa do Purus',
    'Sena Madureira', 'Senador Guiomard', 'Tarauacá', 'Xapuri'
  ].sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  var ESCRITORIOS_LOCAIS = MUNICIPIOS.map(function (mun) {
    return 'Escritório Local de ' + mun;
  });

  var CULTURA_COLS = [
    ['Primeira cultura', 'Área (hectare)', 'Sistema de Cultivo ', 'Deseja cadastrar outra cultura?'],
    ['Segunda cultura', 'Área (hectare).1', 'Sistema de Cultivo .1', 'Deseja cadastrar outra cultura?.1'],
    ['Terceira cultura', 'Área (hectare).2', 'Sistema de Cultivo .2', 'Deseja adicionar outra cultura'],
    ['Quarta cultura', 'Área (hectare).3', 'Sistema de Cultivo .3', 'Deseja cadastrar quinta cultura?'],
    ['Quinta cultura', 'Área (hectare).4', 'Sistema de Cultivo .4', 'Finalizar culturas']
  ];

  var COLUNAS_ORIGINAIS = [
    'Carimbo de data/hora', 'Endereço de e-mail', 'Email ', 'Escritório Local',
    'Data da Vistoria', 'Nome do responsável técnico', 'Nome do produtor', 'Sexo',
    'CPF', 'Estado Civil', 'Data de Nascimento', 'Telefone',
    'Nome da Associação/Cooperativa:', 'Possui DAP:', 'Indígena', 'Informe a etnia',
    'Município:', 'Endereço (Projeto de Assentamento/Comunidade, BR/Ramal, Km, nº do lote):',
    'Nome da Propriedade:', 'Ponto de controle', 'Quantidade de horas ', 'Máquina',
    'Primeira cultura', 'Área (hectare)', 'Sistema de Cultivo ', 'Deseja cadastrar outra cultura?',
    'Segunda cultura', 'Área (hectare).1', 'Sistema de Cultivo .1',
    'Deseja cadastrar outra cultura?.1', 'Terceira cultura', 'Área (hectare).2',
    'Sistema de Cultivo .2', 'Deseja adicionar outra cultura', 'Quarta cultura',
    'Área (hectare).3', 'Sistema de Cultivo .3', 'Total mecanizado', 'Geo X ', 'Geo Y ',
    'Zona', 'Nº de Identificação/NºPatrimônio ', 'Nome do trator ', 'Tipo de trator ',
    'Tipo de Implemento ', 'Nome do implemento ', 'O número da DAE foi informada',
    'Informe o número da DAE - 1', 'O valor da DAE foi informado ',
    'Informe o valor da DAE - 1', 'Informe a observação ', 'Formulário de Mecanização ',
    'Informe o número da DAE - 2', 'Informe o número da DAE - 3',
    'Informe o número da DAE - 4', 'Informe o número da DAE - 5',
    'Informe o valor da DAE - 2', 'Informe o valor da DAE - 3',
    'Informe o valor da DAE - 4', 'Informe o valor da DAE - 5',
    'Quantidade de açudes', 'Deseja anexar o formulário digitalizado',
    'O telefone foi informado', 'Cultura soma geral', 'Total Hectares culturas',
    'teste1', 'teste2', 'teste3'
  ];

  var COLUNAS_EXTRAS = ['Número da DAP', 'Quinta cultura', 'Área (hectare).4', 'Sistema de Cultivo .4'];
  var COLUNAS_EXPORTACAO = COLUNAS_ORIGINAIS.concat(COLUNAS_EXTRAS);
  var MAX_DAES = 5;
  var opcoesSimNao = ['', 'Sim', 'Não'];
  var opcoesSistema = ['', 'Monocultivo - MO', 'Integração Lavoura Pecuária - ILP',
    'Integração Lavoura Pecuária Floresta - ILPF', 'Sistema Agroflorestal - SAF', 'Roçado - RO'];
  var idsUsados = {};

  function el(id) { return document.getElementById(id); }

  function slug(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function criar(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'className') e.className = attrs[k];
      else if (k === 'textContent') e.textContent = attrs[k];
      else if (k === 'hidden') e.hidden = attrs[k];
      else if (k === 'readonly') e.readOnly = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { e.appendChild(f); });
    return e;
  }

  function option(valor) {
    return criar('option', { value: valor, textContent: valor || 'Selecione' });
  }

  function inputCampo(label, tipo, opts) {
    opts = opts || {};
    var baseId = 'campo_' + slug(label);
    idsUsados[baseId] = (idsUsados[baseId] || 0) + 1;
    var id = baseId + (idsUsados[baseId] > 1 ? '_' + idsUsados[baseId] : '');
    var entrada;
    if (tipo === 'select') {
      entrada = criar('select', { id: id, name: label });
      (opts.opcoes || []).forEach(function (o) { entrada.appendChild(option(o)); });
    } else if (tipo === 'textarea') {
      entrada = criar('textarea', { id: id, name: label });
    } else {
      entrada = criar('input', { id: id, name: label, type: tipo || 'text' });
      if (tipo === 'number') entrada.step = opts.step || 'any';
      if (tipo === 'number' && opts.min !== undefined) entrada.min = opts.min;
      if (opts.inputmode) entrada.inputMode = opts.inputmode;
    }
    if (opts.readonly) entrada.readOnly = true;
    if (opts.placeholder) entrada.placeholder = opts.placeholder;
    if (opts.required) entrada.required = true;
    if (opts.value !== undefined) entrada.value = opts.value;
    return criar('div', { className: 'campo ' + (opts.classe || '') }, [
      criar('label', { for: id, textContent: label }),
      entrada
    ]);
  }

  function grupo(titulo, classe) {
    return criar('section', { className: 'grupo-form ' + (classe || '') }, [
      criar('h3', { textContent: titulo }),
      criar('div', { className: 'campos-grid' })
    ]);
  }

  function grade(g) { return g.querySelector('.campos-grid'); }

  function agoraLocal() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function valorMonetario(v) {
    var limpo = String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    return limpo ? Number(limpo).toFixed(2).replace('.', ',') : '';
  }

  function formatarMoeda(input) {
    var n = String(input.value || '').replace(/\D/g, '');
    if (!n) {
      input.value = '';
      return;
    }
    input.value = (Number(n) / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function criarCultura(i) {
    var cols = CULTURA_COLS[i];
    var bloco = criar('fieldset', {
      className: 'cultura-bloco',
      'data-cultura': String(i + 1),
      hidden: i > 0
    }, [criar('legend', { textContent: 'Terreno ' + (i + 1) })]);

    bloco.appendChild(inputCampo(cols[0], 'text', { required: i === 0 }));
    bloco.appendChild(inputCampo(cols[1], 'number', { min: 0, step: '0.01', required: i === 0 }));
    bloco.appendChild(inputCampo(cols[2], 'select', { opcoes: opcoesSistema, required: i === 0 }));

    if (i < CULTURA_COLS.length - 1) {
      var id = 'campo_' + slug(cols[3]);
      var resposta = criar('input', { id: id, name: cols[3], type: 'hidden', value: 'Não' });
      resposta.value = 'Não';
      resposta.defaultValue = 'Não';
      bloco.appendChild(criar('div', { className: 'campo campo-mais-cultura pergunta-cultura' }, [
        criar('label', { for: id, textContent: 'Outra cultura' }),
        resposta,
        criar('button', {
          type: 'button',
          className: 'btn-mais-cultura',
          title: 'Cadastrar outra cultura',
          'aria-label': 'Cadastrar outra cultura'
        }, [document.createTextNode('+')])
      ]));
    }
    return bloco;
  }

  function criarDae(i) {
    var numero = i + 1;
    var bloco = criar('fieldset', {
      className: 'dae-bloco',
      'data-dae': String(numero),
      hidden: i > 0
    }, [criar('legend', { textContent: 'DAE ' + numero })]);

    bloco.appendChild(inputCampo('Informe o número da DAE - ' + numero, 'text'));
    bloco.appendChild(inputCampo('Informe o valor da DAE - ' + numero, 'text', {
      inputmode: 'decimal',
      placeholder: '0,00'
    }));

    if (numero < MAX_DAES) {
      bloco.appendChild(criar('div', { className: 'campo campo-mais-cultura pergunta-dae' }, [
        criar('label', { textContent: 'Outra DAE' }),
        criar('button', {
          type: 'button',
          className: 'btn-mais-cultura btn-mais-dae',
          title: 'Cadastrar outra DAE',
          'aria-label': 'Cadastrar outra DAE'
        }, [document.createTextNode('+')])
      ]));
    }
    return bloco;
  }

  function montarFormulario() {
    var container = el('camposMecanizacao');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'form-secoes';

    var acao = grupo('Ação');
    grade(acao).appendChild(inputCampo('Carimbo de data/hora', 'datetime-local', {
      readonly: true, value: agoraLocal()
    }));
    grade(acao).appendChild(inputCampo('Data da Vistoria', 'date', { required: true }));
    grade(acao).appendChild(inputCampo('Nome do responsável técnico', 'text', { required: true }));
    grade(acao).appendChild(inputCampo('Escritório Local', 'select', {
      opcoes: [''].concat(ESCRITORIOS_LOCAIS),
      required: true
    }));
    grade(acao).appendChild(inputCampo('Município:', 'select', { opcoes: [''].concat(MUNICIPIOS), required: true }));

    var produtor = grupo('Produtor');
    grade(produtor).appendChild(inputCampo('Nome do produtor', 'text', { required: true }));
    grade(produtor).appendChild(inputCampo('Sexo', 'select', { opcoes: ['', 'Feminino', 'Masculino', 'Não informado'] }));
    grade(produtor).appendChild(inputCampo('CPF', 'text', { inputmode: 'numeric' }));
    grade(produtor).appendChild(inputCampo('Estado Civil', 'select', {
      opcoes: ['', 'Solteiro(a)', 'Casado(a)', 'Amasiado(a)', 'Separado(a)', 'Divorciado(a)', 'Viúvo(a)', 'Não informado']
    }));
    grade(produtor).appendChild(inputCampo('Data de Nascimento', 'date'));
    grade(produtor).appendChild(inputCampo('Telefone', 'tel'));
    grade(produtor).appendChild(inputCampo('Endereço de e-mail', 'email'));
    grade(produtor).appendChild(inputCampo('Email ', 'email'));
    grade(produtor).appendChild(inputCampo('Possui DAP:', 'select', { opcoes: opcoesSimNao }));
    grade(produtor).appendChild(inputCampo('Número da DAP', 'text', { classe: 'condicional', placeholder: 'Informe o número da DAP' }));
    grade(produtor).appendChild(inputCampo('Indígena', 'select', { opcoes: opcoesSimNao }));
    grade(produtor).appendChild(inputCampo('Informe a etnia', 'text', { classe: 'condicional', placeholder: 'Informe a etnia' }));

    var propriedade = grupo('Propriedade');
    grade(propriedade).appendChild(inputCampo('Nome da Propriedade:', 'text'));
    grade(propriedade).appendChild(inputCampo('Nome da Associação/Cooperativa:', 'text', { classe: 'largo' }));
    grade(propriedade).appendChild(inputCampo(
      'Endereço (Projeto de Assentamento/Comunidade, BR/Ramal, Km, nº do lote):',
      'text',
      { classe: 'inteiro' }
    ));

    var controle = grupo('Ponto de controle');
    grade(controle).appendChild(inputCampo('Ponto de controle', 'select', {
      opcoes: ['', 'Mecanização', 'Açudagem'], required: true
    }));

    var mecanizacao = grupo('Tipo da ação - Mecanização', 'servico-mecanizacao');
    var culturasWrap = criar('div', { className: 'culturas-wrap inteiro', id: 'culturasWrap' });
    CULTURA_COLS.forEach(function (_, i) { culturasWrap.appendChild(criarCultura(i)); });
    grade(mecanizacao).appendChild(culturasWrap);
    grade(mecanizacao).appendChild(inputCampo('Total mecanizado', 'number', { min: 0, step: '0.01' }));
    grade(mecanizacao).appendChild(inputCampo('Geo X ', 'number', { step: 'any' }));
    grade(mecanizacao).appendChild(inputCampo('Geo Y ', 'number', { step: 'any' }));
    grade(mecanizacao).appendChild(inputCampo('Zona', 'number', { step: '1' }));
    grade(mecanizacao).appendChild(inputCampo('Nº de Identificação/NºPatrimônio ', 'text', { classe: 'largo' }));
    grade(mecanizacao).appendChild(inputCampo('Nome do trator ', 'text'));
    grade(mecanizacao).appendChild(inputCampo('Tipo de trator ', 'text'));
    grade(mecanizacao).appendChild(inputCampo('Tipo de Implemento ', 'text'));
    grade(mecanizacao).appendChild(inputCampo('Nome do implemento ', 'text'));

    var acudagem = grupo('Tipo da ação - Açudagem', 'servico-acudagem');
    grade(acudagem).appendChild(inputCampo('Quantidade de horas ', 'number', { min: 0, step: '0.1' }));
    grade(acudagem).appendChild(inputCampo('Máquina', 'text'));
    grade(acudagem).appendChild(inputCampo('Quantidade de açudes', 'number', { min: 0, step: '1' }));

    var dae = grupo('DAEs');
    var daesWrap = criar('div', { className: 'culturas-wrap inteiro', id: 'daesWrap' });
    for (var d = 0; d < MAX_DAES; d++) daesWrap.appendChild(criarDae(d));
    grade(dae).appendChild(daesWrap);

    var anexos = grupo('Anexos');
    grade(anexos).appendChild(inputCampo('Deseja anexar o formulário digitalizado', 'select', { opcoes: opcoesSimNao }));
    grade(anexos).appendChild(inputCampo('Formulário de Mecanização ', 'text', { classe: 'largo' }));
    grade(anexos).appendChild(inputCampo('Informe a observação ', 'textarea', { classe: 'inteiro' }));

    [acao, produtor, propriedade, controle, mecanizacao, acudagem, dae, anexos].forEach(function (s) { container.appendChild(s); });
  }

  function setAtivoBloco(bloco, ativo) {
    bloco.querySelectorAll('input,select,textarea').forEach(function (campo) {
      campo.disabled = !ativo;
    });
  }

  function atualizarServico() {
    var pc = document.querySelector('[name="Ponto de controle"]');
    var valor = pc ? pc.value : '';
    var mec = document.querySelector('.servico-mecanizacao');
    var acu = document.querySelector('.servico-acudagem');
    if (mec) {
      mec.hidden = valor !== 'Mecanização';
      setAtivoBloco(mec, valor === 'Mecanização');
    }
    if (acu) {
      acu.hidden = valor !== 'Açudagem';
      setAtivoBloco(acu, valor === 'Açudagem');
    }
    atualizarCulturas();
  }

  function atualizarCondicionais() {
    var dap = document.querySelector('[name="Possui DAP:"]');
    var numDap = document.querySelector('[name="Número da DAP"]');
    if (numDap) {
      numDap.closest('.campo').hidden = !dap || dap.value !== 'Sim';
      numDap.disabled = !dap || dap.value !== 'Sim';
      numDap.required = !!dap && dap.value === 'Sim';
      if (numDap.disabled) numDap.value = '';
    }

    var indigena = document.querySelector('[name="Indígena"]');
    var etnia = document.querySelector('[name="Informe a etnia"]');
    if (etnia) {
      etnia.closest('.campo').hidden = !indigena || indigena.value !== 'Sim';
      etnia.disabled = !indigena || indigena.value !== 'Sim';
      etnia.required = !!indigena && indigena.value === 'Sim';
      if (etnia.disabled) etnia.value = '';
    }
  }

  function atualizarDae() {
    var blocos = Array.prototype.slice.call(document.querySelectorAll('.dae-bloco'));
    var mostrarProximo = true;
    blocos.forEach(function (bloco, i) {
      bloco.hidden = !mostrarProximo;
      bloco.querySelectorAll('input,select,textarea').forEach(function (campo) {
        campo.disabled = !mostrarProximo;
      });
      if (!mostrarProximo) return;
      mostrarProximo = bloco.getAttribute('data-abre-proximo') === '1';
      if (i === blocos.length - 1) mostrarProximo = false;
    });
  }

  function atualizarCulturas() {
    var blocos = Array.prototype.slice.call(document.querySelectorAll('.cultura-bloco'));
    var pc = document.querySelector('[name="Ponto de controle"]');
    var mecanizacaoAtiva = !!pc && pc.value === 'Mecanização';
    if (!mecanizacaoAtiva) {
      blocos.forEach(function (bloco) {
        bloco.hidden = true;
        bloco.querySelectorAll('input,select,textarea').forEach(function (campo) {
          campo.disabled = true;
        });
      });
      return;
    }
    var mostrarProximo = true;
    blocos.forEach(function (bloco, i) {
      bloco.hidden = !mostrarProximo;
      bloco.querySelectorAll('input,select,textarea').forEach(function (campo) {
        campo.disabled = !mostrarProximo;
      });
      if (!mostrarProximo) return;
      mostrarProximo = bloco.getAttribute('data-abre-proximo') === '1';
      if (i === blocos.length - 1) mostrarProximo = false;
    });
  }

  function cadastrosSalvos() {
    try {
      var dados = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(dados) ? dados : [];
    } catch (e) {
      return [];
    }
  }

  function atualizarStatus(msg) {
    var status = el('formStatus');
    var total = cadastrosSalvos().length;
    if (status) status.textContent = msg || (total ? total + ' cadastro(s) salvo(s) neste navegador.' : '');
  }

  function lerRegistro(form) {
    document.querySelector('[name="Carimbo de data/hora"]').value = agoraLocal();
    var fd = new FormData(form);
    var registro = {};
    COLUNAS_EXPORTACAO.forEach(function (c) { registro[c] = fd.get(c) || ''; });
    for (var i = 1; i <= MAX_DAES; i++) {
      var col = 'Informe o valor da DAE - ' + i;
      registro[col] = valorMonetario(registro[col]);
    }
    registro['O número da DAE foi informada'] = COLUNAS_EXPORTACAO.some(function (col) {
      return /^Informe o número da DAE - \d+$/.test(col) && registro[col];
    }) ? 'Sim' : 'Não';
    registro['O valor da DAE foi informado '] = COLUNAS_EXPORTACAO.some(function (col) {
      return /^Informe o valor da DAE - \d+$/.test(col) && registro[col];
    }) ? 'Sim' : 'Não';
    registro['Cultura soma geral'] = CULTURA_COLS.map(function (c) { return registro[c[0]]; })
      .filter(Boolean).join('; ');
    registro['Total Hectares culturas'] = CULTURA_COLS.reduce(function (soma, c) {
      var v = String(registro[c[1]] || '').replace(',', '.');
      return soma + (Number(v) || 0);
    }, 0);
    CULTURA_COLS.slice(0, -1).forEach(function (cols, i) {
      var prox = document.querySelector('[data-cultura="' + (i + 2) + '"]');
      registro[cols[3]] = prox && !prox.hidden ? 'Sim' : 'Não';
    });
    return registro;
  }

  function csvValor(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }

  function exportarCsv() {
    var dados = cadastrosSalvos();
    if (!dados.length) {
      atualizarStatus('Nenhum cadastro salvo para exportar.');
      return;
    }
    var linhas = [COLUNAS_EXPORTACAO.map(csvValor).join(';')].concat(dados.map(function (r) {
      return COLUNAS_EXPORTACAO.map(function (c) { return csvValor(r[c]); }).join(';');
    }));
    var blob = new Blob([linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'cadastros-mecanizacao-2026.csv';
    a.click();
    URL.revokeObjectURL(url);
    atualizarStatus(dados.length + ' cadastro(s) exportado(s).');
  }

  montarFormulario();

  var form = el('formMecanizacao');
  if (form) {
    form.addEventListener('change', function (e) {
      if (e.target.name === 'Ponto de controle') atualizarServico();
      if (e.target.name === 'Possui DAP:' || e.target.name === 'Indígena') atualizarCondicionais();
    });
    form.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-mais-cultura');
      if (!btn) return;
      var bloco = btn.closest('.cultura-bloco, .dae-bloco');
      if (bloco) bloco.setAttribute('data-abre-proximo', '1');
      var input = btn.parentNode.querySelector('input');
      if (input) input.value = 'Sim';
      atualizarCulturas();
      atualizarDae();
    });
    form.addEventListener('input', function (e) {
      if (/^Informe o valor da DAE - \d+$/.test(e.target.name)) formatarMoeda(e.target);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var registro = lerRegistro(form);
      var dados = cadastrosSalvos();
      dados.push(registro);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
      form.reset();
      document.querySelectorAll('.cultura-bloco').forEach(function (bloco) {
        bloco.removeAttribute('data-abre-proximo');
      });
      document.querySelectorAll('.dae-bloco').forEach(function (bloco) {
        bloco.removeAttribute('data-abre-proximo');
      });
      document.querySelectorAll('.pergunta-cultura input').forEach(function (input) { input.value = 'Não'; });
      document.querySelector('[name="Carimbo de data/hora"]').value = agoraLocal();
      atualizarCondicionais();
      atualizarServico();
      atualizarDae();
      atualizarStatus('Cadastro salvo neste navegador.');
    });
    form.addEventListener('reset', function () {
      setTimeout(function () {
        document.querySelectorAll('.cultura-bloco').forEach(function (bloco) {
          bloco.removeAttribute('data-abre-proximo');
        });
        document.querySelectorAll('.dae-bloco').forEach(function (bloco) {
          bloco.removeAttribute('data-abre-proximo');
        });
        document.querySelectorAll('.pergunta-cultura input').forEach(function (input) { input.value = 'Não'; });
        document.querySelector('[name="Carimbo de data/hora"]').value = agoraLocal();
        atualizarCondicionais();
        atualizarServico();
        atualizarDae();
      }, 0);
    });
  }

  var exportar = el('btnExportarCsv');
  if (exportar) exportar.addEventListener('click', exportarCsv);
  atualizarCondicionais();
  atualizarServico();
  atualizarDae();
  atualizarStatus();
})();
