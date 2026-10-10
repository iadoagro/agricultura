/* Comportamento comum do formulário de lançamento de mecanização/açudagem —
   usado tanto pela aba "Lançamento" do painel (js/lancamento-mecanizacao.js,
   dentro de pages/dashboard.html) quanto pela página de edição
   (js/lancamento-editar.js, pages/lancamento-editar.html). As duas páginas
   têm cada uma o seu próprio <form id="lancForm"> com os mesmos ids
   internos (#lancCulturas, #lancMaquinas etc.) — um só lugar aqui evita
   ter que lembrar de mudar as linhas dinâmicas de cultura/DAE, os
   checkboxes de máquinas/implementos (com "Outra") e as regras de
   mostrar/esconder campo em dois arquivos toda vez que uma delas mudar. */
(function () {
  'use strict';

  var CULTURAS_FICHA = [
    'Pastagem - Corte', 'Pastagem - Leite', 'Milho - safra', 'Milho - safrinha',
    'Soja - safra', 'Soja - safrinha', 'Feijão', 'Mandioca', 'Açaí', 'Pupunha',
    'Seringueira', 'Banana', 'Café', 'Laranja', 'Limão', 'Maracujá', 'Graviola',
    'Abacaxi', 'Outras'
  ];
  var MAX_CULTURAS = 4;
  var SISTEMAS_CULTIVO = [
    ['M', 'M - Monocultivo'], ['SAF', 'SAF - Sistema Agroflorestal'],
    ['ILPF', 'ILPF - Integração Lavoura Pecuária Floresta'],
    ['ILP', 'ILP - Integração Lavoura Pecuária'], ['RO', 'RO - Roçado']
  ];
  var MAX_DAES = 10;
  // Mesmos nomes de js/importar.js (tabelas MAQUINAS/IMPLEMENTOS), só que
  // aqui são opções de marcar, não palavras-chave de reconhecimento.
  // Só o que já foi usado nas fichas do banco, do mais para o menos frequente
  // (contagem de mecanizacao_lancamentos em 25/09/2026).
  var MAQUINAS_OPCOES = [
    'Trator agrícola', 'Escavadeira hidráulica', 'Trator de pneu', 'Trator de esteira',
    'John Deere', 'Pá carregadeira', 'Massey Ferguson', 'New Holland',
    'Retroescavadeira', 'Solis 90'
  ];
  // Piscicultura e Tanque / açude não são implementos: são tipos de serviço
  // associados à Açudagem, não a máquinas de Mecanização (por isso saíram
  // daqui).
  var IMPLEMENTOS_OPCOES = [
    'Grade aradora', 'Grade niveladora', 'Destoca', 'Plantadeira', 'Colheitadeira',
    'Pulverizador', 'Jogadora de calcário', 'Roçadeira'
  ];

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function linhaCultura(valores) {
    valores = valores || {};
    var linha = document.createElement('div');
    linha.className = 'lanc-cultura-linha';
    linha.innerHTML =
      '<button type="button" class="lanc-cultura-remover" title="Remover" aria-label="Remover cultura">&times;</button>' +
      '<select class="lc-cultura">' + '<option value="">Cultura…</option>' +
      CULTURAS_FICHA.map(function (c) { return '<option' + (c === valores.cultura ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      // fichas importadas da planilha podem ter culturas fora da lista
      (valores.cultura && CULTURAS_FICHA.indexOf(valores.cultura) < 0 ? '<option selected>' + esc(valores.cultura) + '</option>' : '') +
      '</select>' +
      '<input class="lc-area" type="number" step="0.01" min="0" placeholder="Área (ha)" value="' + esc(valores.area_ha || '') + '">' +
      '<select class="lc-sistema"><option value="">Sistema…</option>' +
      SISTEMAS_CULTIVO.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === valores.sistema_cultivo ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; }).join('') +
      '</select>' +
      '<span class="lanc-add-slot"></span>';
    return linha;
  }

  function linhaDae(valores) {
    valores = valores || {};
    var linha = document.createElement('div');
    linha.className = 'lanc-dae-linha';
    linha.innerHTML =
      '<button type="button" class="lanc-cultura-remover" title="Remover" aria-label="Remover DAE">&times;</button>' +
      '<input class="ld-numero" type="text" placeholder="Nº da DAE" value="' + esc(valores.numero || '') + '">' +
      '<input class="ld-valor" type="number" step="0.01" min="0" placeholder="Valor (R$)" value="' + esc(valores.valor != null ? valores.valor : '') + '">' +
      '<span class="lanc-add-slot"></span>';
    return linha;
  }

  /** "Outra" fica de fora da lista comum: em vez de um valor fixo, marcar
      essa caixa destrava um campo de texto na mesma linha pra descrever o
      que não está nas opções (ver marcarCaixas/coletarMarcados). */
  /* Responsáveis técnicos, da coluna "Nome do responsável técnico" da planilha
     "Mecanização 2026 - Produção (6)". Limpeza: espaços sobrando, caixa e acento
     foram unificados, e só foram juntadas grafias MUITO parecidas (ex.:
     "Jorge Ney Ponte Araújo" → "Jorge Ney Pontes Araújo"). Nomes incompletos ou
     diferentes ficaram separados de propósito — ver o relatório da limpeza. */
  var TECNICOS = [
    'Antonio Pinto de Lima',
    'Antônio Alves Maia',
    'Antônio Francisco',
    'Antônio Francisco de Araújo do Nascimento',
    'João Lucas Felix dos Santos',
    'Jorge Ney Pontes',
    'Jorge Ney Pontes Araújo',
    'José Menezes Cruz',
    'Kelysomar Olivencio Santos',
    'Kemy Fernandes da Silva',
    'Leocélia Monteiro de Sousa',
    'Leocélia Monteiro Silva',
    'Lucas Paiva',
    'Magno Correa Costa',
    'Marcos Pereira de Souza',
    'Ricardo Ferreira de Azevedo',
    'Wilker Nazareno da Silva',
    'Wilson de Brito Amorim'
  ];

  /** 02330777230 → 023.307.772-30 (aceita digitação parcial: só números, até 11). */
  function formatarCpf(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 11);
    var r = d.slice(0, 3);
    if (d.length > 3) r += '.' + d.slice(3, 6);
    if (d.length > 6) r += '.' + d.slice(6, 9);
    if (d.length > 9) r += '-' + d.slice(9, 11);
    return r;
  }

  function caixasDeOpcoes(host, opcoes, name) {
    host.innerHTML = opcoes.map(function (o, i) {
      var id = name + i;
      return '<label for="' + id + '"><input type="checkbox" id="' + id + '" value="' + esc(o) + '"><span>' + esc(o) + '</span></label>';
    }).join('') +
      '<label class="lanc-caixa-outra" for="' + name + 'Outra">' +
        '<input type="checkbox" id="' + name + 'Outra" class="lc-outra-check"><span>Outro</span>' +
      '</label>' +
      // a linha de texto só aparece (inteira, abaixo das opções) com "Outro" marcado
      '<div class="lc-outra-linha" hidden>' +
        '<input type="text" class="lc-outra-texto" placeholder="Especifique qual…" aria-label="Especifique qual" disabled>' +
      '</div>';
  }

  /** Marca as opções já escolhidas (edição); o que sobrar (não bate com
      nenhuma opção conhecida) cai em "Outra", junto num texto só. Parte
      sempre de caixas recém-montadas (sem nada marcado ainda). */
  function marcarCaixas(host, valores) {
    var restantes = (valores || []).slice();
    Array.prototype.forEach.call(host.querySelectorAll('label:not(.lanc-caixa-outra)'), function (lbl) {
      var input = lbl.querySelector('input');
      var i = restantes.indexOf(input.value);
      if (i >= 0) { input.checked = true; restantes.splice(i, 1); }
    });
    var outraCheck = host.querySelector('.lc-outra-check');
    var outraTexto = host.querySelector('.lc-outra-texto');
    outraCheck.checked = restantes.length > 0;
    outraTexto.disabled = !outraCheck.checked;
    outraTexto.value = restantes.join(', ');
    var linhaOutra = host.querySelector('.lc-outra-linha');
    if (linhaOutra) linhaOutra.hidden = !outraCheck.checked;
  }

  function coletarMarcados(host) {
    var valores = Array.prototype.slice.call(host.querySelectorAll('label:not(.lanc-caixa-outra) input:checked'))
      .map(function (i) { return i.value; });
    var outraCheck = host.querySelector('.lc-outra-check');
    if (outraCheck && outraCheck.checked) {
      var texto = host.querySelector('.lc-outra-texto').value.trim();
      if (texto) valores.push(texto);
    }
    return valores;
  }

  /** Cria os ajudantes de UM formulário específico (um por página — cada
      página só tem um <form id="lancForm">). Funções que dependem de campos
      do form ficam fechadas sobre ele em vez de recebê-lo em todo lugar. */
  function criar(form) {
    // campos de data em dd/mm/aaaa em qualquer navegador (js/data-br.js)
    if (window.DATA_BR) window.DATA_BR.aplicarTodos(form);

    /** Preenche o select de responsável técnico. */
    function montarTecnicos() {
      var sel = form.elements['responsavel_tecnico'];
      if (!sel || sel.tagName !== 'SELECT') return;
      var atual = sel.value;
      sel.innerHTML = '<option value="">Selecione…</option>' +
        TECNICOS.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
      sel.value = atual;
    }

    /** Lançamentos antigos podem trazer um nome que não está na lista: ele entra
        como opção para não ser perdido ao editar. */
    function garantirTecnico(nome) {
      var sel = form.elements['responsavel_tecnico'];
      if (!sel || !nome) return;
      var existe = Array.prototype.some.call(sel.options, function (o) { return o.value === nome; });
      if (!existe) {
        var o = document.createElement('option');
        o.textContent = nome;
        sel.appendChild(o);
      }
      sel.value = nome;
    }
    montarTecnicos();


    /* ---- Menos cliques: selects de poucas opções viram botões lado a lado ----
       O <select> continua no formulário (escondido, mas focável, para a validação
       nativa) e é quem guarda o valor: todo o resto do código segue lendo e
       gravando form.elements[nome].value. O grupo de botões só espelha ele. */
    function segmentar(sel) {
      if (!sel || sel.getAttribute('data-seg') === '1') return;
      var opcoes = Array.prototype.filter.call(sel.options, function (o) { return o.value !== ''; });
      if (opcoes.length < 2) return;
      sel.setAttribute('data-seg', '1');
      var rotulo = sel.closest('label');
      var grupo = document.createElement('div');
      grupo.className = 'lanc-seg';
      grupo.setAttribute('role', 'radiogroup');
      var nomeGrupo = rotulo ? rotulo.textContent.replace(/\s+/g, ' ').replace(/\*/g, '').trim() : '';
      if (nomeGrupo) grupo.setAttribute('aria-label', nomeGrupo.slice(0, 60));
      var botoes = opcoes.map(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lanc-seg-op';
        b.setAttribute('role', 'radio');
        b.setAttribute('data-v', o.value);
        b.textContent = o.textContent;
        grupo.appendChild(b);
        return b;
      });
      sel.classList.add('lanc-seg-oculto');
      sel.tabIndex = -1;
      sel.setAttribute('aria-hidden', 'true');
      sel.parentNode.insertBefore(grupo, sel.nextSibling);

      function atualizar() {
        var v = sel.value;
        botoes.forEach(function (b) {
          var on = b.getAttribute('data-v') === v;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
          b.tabIndex = on || (!v && b === botoes[0]) ? 0 : -1;
        });
      }
      function escolher(valor) {
        if (sel.disabled) return;
        // opcional: clicar de novo no marcado desmarca; obrigatório: fica
        var novo = (valor === sel.value && !sel.required) ? '' : valor;
        sel.value = novo;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        atualizar();
      }
      grupo.addEventListener('click', function (e) {
        var b = e.target.closest('.lanc-seg-op');
        if (b) escolher(b.getAttribute('data-v'));
      });
      grupo.addEventListener('keydown', function (e) {
        var i = botoes.indexOf(document.activeElement);
        if (i < 0) return;
        var passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!passo) return;
        e.preventDefault();
        var alvo = botoes[(i + passo + botoes.length) % botoes.length];
        alvo.focus();
        escolher(alvo.getAttribute('data-v'));
      });
      // gravações por código (carregar para editar, limpar) também atualizam os botões
      var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      Object.defineProperty(sel, 'value', {
        configurable: true,
        get: function () { return desc.get.call(sel); },
        set: function (v) { desc.set.call(sel, v); atualizar(); }
      });
      sel.addEventListener('change', atualizar);
      form.addEventListener('reset', function () { setTimeout(atualizar, 0); });
      atualizar();
    }

    Array.prototype.forEach.call(
      form.querySelectorAll('select[name="sexo"], select[name="possui_dap"], select[name="indigena"], select[name="tipo_uso"], #lancPossuiAssociacao'),
      segmentar);

    /* Responsável técnico: onde um técnico responde por quase todos os
       lançamentos do município (planilha 2026), ele já vem escolhido — a pessoa
       só troca se for outro. */
    var TECNICO_DO_MUNICIPIO = {
      'assis brasil': 'Wilker Nazareno da Silva',
      'capixaba': 'Kemy Fernandes da Silva',
      'cruzeiro do sul': 'Marcos Pereira de Souza',
      'epitaciolandia': 'José Menezes Cruz',
      'feijo': 'Jorge Ney Pontes Araújo',
      'mancio lima': 'Magno Correa Costa',
      'placido de castro': 'Antonio Pinto de Lima',
      'xapuri': 'Antônio Alves Maia'
    };
    var tecnicoSugerido = '';   // o que foi preenchido sozinho (para trocar junto com o munic\u00edpio)
    function sugerirTecnico(mun) {
      var sel = form.elements['responsavel_tecnico'];
      if (!sel || sel.tagName !== 'SELECT' || sel.disabled) return;
      // s\u00f3 mexe se estiver vazio ou se ainda for o que a pr\u00f3pria sugest\u00e3o escolheu
      if (sel.value && sel.value !== tecnicoSugerido) return;
      var chave = String(mun || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      var nome = TECNICO_DO_MUNICIPIO[chave] || '';
      sel.value = nome;
      tecnicoSugerido = nome;
    }

    function montarMunicipios(municipios) {
      var sel = form.elements['municipio'];
      var atual = sel.value;
      sel.innerHTML = '<option value="">Selecione…</option>' +
        municipios.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('');
      sel.value = atual;
    }

    /** Opções do escritório para o município atual: os 21 municípios comuns
        têm um escritório só (o campo nem aparece destravado pra escolher);
        Rio Branco é o único com dois (ele mesmo e a Transacreana), então só
        ele mostra as duas opções pra escolher. Sem município selecionado, a
        lista fica vazia. */
    function opcoesEscritorio(municipio) {
      if (municipio === 'Rio Branco') return ['Escritório Local de Rio Branco', 'Escritório Local da Transacreana'];
      if (municipio) return ['Escritório Local de ' + municipio];
      return [];
    }

    function montarEscritorios(municipio) {
      var sel = form.elements['escritorio_local'];
      sel.innerHTML = '<option value="">Selecione…</option>' +
        opcoesEscritorio(municipio).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('');
    }

    /** Município escolhido já diz o escritório: cada um dos 22 tem só um, e
        o campo vem travado (só exibe o que já foi decidido pelo município).
        A exceção é Rio Branco, que tem dois — só aí o campo destrava, e só
        com essas duas opções na lista, pra quem está lançando escolher. */
    /* Zona UTM pelo município: o Acre cruza o meridiano 72° O. Os municípios do
       extremo oeste (Juruá) ficam na zona 18; todos os demais, na 19. O campo é
       só leitura — quem digita não escolhe a zona. */
    var MUNICIPIOS_ZONA_18 = ['cruzeiro do sul', 'mancio lima', 'rodrigues alves', 'marechal thaumaturgo', 'porto walter'];
    function atualizarZona(mun) {
      var campo = form.elements['geo_zona'];
      if (!campo) return;
      var chave = String(mun || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      campo.value = !chave ? '' : (MUNICIPIOS_ZONA_18.indexOf(chave) >= 0 ? '18' : '19');
    }

    function sincronizarEscritorioPorMunicipio() {
      var mun = form.elements['municipio'].value;
      atualizarZona(form.elements['municipio'].value);
      sugerirTecnico(form.elements['municipio'].value);
      var escSel = form.elements['escritorio_local'];
      var atual = escSel.value;
      montarEscritorios(mun);
      if (mun === 'Rio Branco') {
        escSel.disabled = false;
        escSel.value = (atual === 'Escritório Local de Rio Branco' || atual === 'Escritório Local da Transacreana') ? atual : '';
        return;
      }
      escSel.disabled = true;
      escSel.value = mun ? 'Escritório Local de ' + mun : '';
    }

    /** Data e hora (nessa ordem) de quando o formulário foi aberto — só
        informativo, por isso vem bloqueado e fora do FormData (campo sem
        "name": não existe coluna pra isso na tabela). */
    function marcarHorarioInsercao() {
      var campo = el('lancHorarioInsercao');
      if (!campo) return;
      campo.value = window.DATA_BR.dataHoraBr(new Date());
    }

    function culturasAtuais() {
      return Array.prototype.slice.call(el('lancCulturas').querySelectorAll('.lanc-cultura-linha')).map(function (linha) {
        return {
          cultura: linha.querySelector('.lc-cultura').value,
          area_ha: parseFloat(linha.querySelector('.lc-area').value) || 0,
          sistema_cultivo: linha.querySelector('.lc-sistema').value
        };
      }).filter(function (c) { return c.cultura; });
    }

    function daesAtuais() {
      return Array.prototype.slice.call(el('lancDaes').querySelectorAll('.lanc-dae-linha')).map(function (linha) {
        var numero = linha.querySelector('.ld-numero').value.trim();
        var valorTxt = linha.querySelector('.ld-valor').value;
        return { numero: numero, valor: valorTxt === '' ? null : parseFloat(valorTxt) };
      }).filter(function (d) { return d.numero || d.valor != null; });
    }

    function marcadosDe(host) { return coletarMarcados(host); }

    /* Soma automática das áreas das culturas em "Área total (ha)" — o campo
       continua um <input> normal, então a pessoa pode digitar outro valor
       por cima a qualquer momento (só volta a somar se mexer numa área). */
    function recalcularAreaTotal() {
      var soma = culturasAtuais().reduce(function (t, c) { return t + (c.area_ha || 0); }, 0);
      form.elements['area_total_ha'].value = soma ? Math.round(soma * 100) / 100 : '';
    }

    /* Só libera "+ Adicionar" quando a última linha já tem o essencial
       preenchido, e ainda não bateu no teto (4 culturas / 10 DAEs, como na
       ficha em papel). */
    /** O botão "+" vive no fim da ÚLTIMA linha (no lugar do antigo botão largo de
        baixo); sem nenhuma linha, volta para o lugar de origem. */
    var origemAdd = {};
    function encaixarAdd(botaoId, linhas) {
      var botao = el(botaoId);
      if (!botao) return;
      if (!origemAdd[botaoId]) origemAdd[botaoId] = { pai: botao.parentNode, depois: botao.nextSibling };
      var ultima = linhas[linhas.length - 1];
      var slot = ultima && ultima.querySelector('.lanc-add-slot');
      if (slot) { if (botao.parentNode !== slot) slot.appendChild(botao); }
      else if (botao.parentNode !== origemAdd[botaoId].pai) origemAdd[botaoId].pai.insertBefore(botao, origemAdd[botaoId].depois);
    }

    /** Devolve os botões "+" ao lugar de origem antes de apagar linhas — senão
        sairiam do documento junto com a linha onde estavam encaixados. */
    function resgatarAdd() {
      Object.keys(origemAdd).forEach(function (id) {
        var b = el(id), o = origemAdd[id];
        if (b && b.parentNode !== o.pai) {
          o.pai.insertBefore(b, o.depois && o.depois.parentNode === o.pai ? o.depois : null);
        }
      });
    }

    function atualizarBotoesAdicionar() {
      var culturas = el('lancCulturas').querySelectorAll('.lanc-cultura-linha');
      encaixarAdd('lancAddCultura', culturas);
      encaixarAdd('lancAddDae', el('lancDaes').querySelectorAll('.lanc-dae-linha'));
      var ultimaCultura = culturas[culturas.length - 1];
      var culturaPronta = !!(ultimaCultura && ultimaCultura.querySelector('.lc-cultura').value);
      el('lancAddCultura').disabled = !(culturaPronta && culturas.length < MAX_CULTURAS);

      var daes = el('lancDaes').querySelectorAll('.lanc-dae-linha');
      var ultimoDae = daes[daes.length - 1];
      var daePronto = !!(ultimoDae && (ultimoDae.querySelector('.ld-numero').value.trim() || ultimoDae.querySelector('.ld-valor').value !== ''));
      el('lancAddDae').disabled = !(daePronto && daes.length < MAX_DAES);
    }

    /* Campos obrigatórios ANTES do tipo de serviço que ainda estão em branco.
       Devolve os rótulos (e marca os campos) para a mensagem dizer quais faltam. */
    function camposAnterioresEmBranco() {
      var grupo = form.querySelector('.lanc-tipo-servico');
      var faltando = [];
      Array.prototype.forEach.call(form.querySelectorAll('.lanc-faltando'), function (c) { c.classList.remove('lanc-faltando'); });
      if (!grupo) return faltando;
      Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (campo) {
        if (!(grupo.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_PRECEDING)) return;   // só os de antes
        if (campo.disabled || campo.type === 'radio' || campo.type === 'checkbox') return;
        if (campo.closest('[hidden]')) return;
        var invalido = campo.validity && campo.validity.customError;   // ex.: data futura
        if (!invalido && (!campo.required || String(campo.value).trim() !== '')) return;
        var rotulo = campo.closest('label');
        var texto = campo.name;
        if (rotulo) {
          var c = rotulo.cloneNode(true);
          Array.prototype.forEach.call(c.querySelectorAll('input,select,textarea,.lanc-obrig,option'), function (n) { n.remove(); });
          texto = c.textContent.replace(/\s+/g, ' ').replace(/\*/g, '').trim() || campo.name;
        }
        campo.classList.add('lanc-faltando');
        faltando.push({ campo: campo, rotulo: invalido ? texto + ' (' + campo.validationMessage.replace(/\s*\(.*$/, '').replace(/\.$/, '') + ')' : texto });
      });
      return faltando;
    }

    /** true quando pode escolher o serviço; senão mostra quais campos faltam. */
    function liberarServico() {
      var faltando = camposAnterioresEmBranco();
      var aviso = el('lancServicoErro');
      if (!faltando.length) { aviso.hidden = true; return true; }
      var nomes = faltando.map(function (f) { return f.rotulo; });
      aviso.textContent = 'Antes de escolher o serviço, corrija/preencha: ' + nomes.join(', ') + '.';
      aviso.hidden = false;
      faltando[0].campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { faltando[0].campo.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
      return false;
    }

    function alternarSecoesServico() {
      var v = form.elements['tipo_servico'].value;   // RadioNodeList: '' quando nenhum marcado
      el('lancSecMecanizacao').hidden = v !== 'Mecanização';
      el('lancSecAcudagem').hidden = v !== 'Açudagem';
      // Maquinário, DAE e Observações só aparecem depois de escolher o serviço
      Array.prototype.forEach.call(form.querySelectorAll('.lanc-sec-servico'), function (sec) { sec.hidden = !v; });
      // Tipo de implemento só faz sentido em Mecanização (Açudagem não usa
      // implemento de máquina). Some tanto por padrão quanto fora dela, e
      // desmarca o que estava marcado pra não ir escondido no envio.
      var fsImpl = el('lancFieldsetImplementos');
      if (fsImpl) {
        var mostrarImpl = v === 'Mecanização';
        fsImpl.hidden = !mostrarImpl;
        if (!mostrarImpl) marcarCaixas(el('lancImplementos'), []);
      }
      // destaque visual do botão marcado: feito por classe (não por CSS
      // :has(), que não reagiu de forma confiável nos navegadores testados)
      Array.prototype.forEach.call(form.querySelectorAll('.lanc-radio-grande'), function (lbl) {
        var radio = lbl.querySelector('input[name="tipo_servico"]');
        lbl.classList.toggle('lanc-marcado', !!(radio && radio.checked));
      });
    }

    function alternarEtnia() {
      var marcado = el('lancIndigena').value === 'Sim';
      el('lancCampoEtnia').hidden = !marcado;
      if (!marcado) form.elements['etnia'].value = '';
    }

    function alternarAssociacao() {
      var marcado = el('lancPossuiAssociacao').value === 'Sim';
      el('lancCampoAssociacao').hidden = !marcado;
      if (!marcado) form.elements['associacao_cooperativa'].value = '';
    }

    /** Regras que o HTML5 required sozinho não cobre: pelo menos uma cultura
        na Mecanização, pelo menos 1 açude na Açudagem. */
    function validarServico() {
      var tipo = form.elements['tipo_servico'].value;
      el('lancCulturaErro').hidden = true;
      el('lancAcudeErro').hidden = true;
      if (tipo === 'Mecanização' && culturasAtuais().length < 1) {
        el('lancCulturaErro').hidden = false;
        el('lancCulturaErro').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      if (tipo === 'Açudagem' && !(parseInt(form.elements['quantidade_acudes'].value, 10) >= 1)) {
        el('lancAcudeErro').hidden = false;
        form.elements['quantidade_acudes'].focus();
        return false;
      }
      return true;
    }

    function montarCaixasVazias() {
      caixasDeOpcoes(el('lancMaquinas'), MAQUINAS_OPCOES, 'lancMaq');
      caixasDeOpcoes(el('lancImplementos'), IMPLEMENTOS_OPCOES, 'lancImpl');
    }

    /** Zera as linhas dinâmicas e reconstrói a partir de "dados" — usado
        tanto pro estado inicial vazio (sem dados) quanto pra carregar um
        lançamento existente na edição. As caixas de máquinas/implementos
        precisam já existir no DOM (ver montarCaixasVazias) antes de chamar
        isto. */
    function preencherDinamicos(dados) {
      dados = dados || {};
      resgatarAdd();
      el('lancCulturas').innerHTML = '';
      var culturas = (dados.culturas && dados.culturas.length) ? dados.culturas : [{}];
      culturas.forEach(function (c) { el('lancCulturas').appendChild(linhaCultura(c)); });
      el('lancDaes').innerHTML = '';
      var daes = (dados.daes && dados.daes.length) ? dados.daes : [{}];
      daes.forEach(function (d) { el('lancDaes').appendChild(linhaDae(d)); });
      marcarCaixas(el('lancMaquinas'), dados.maquinas);
      marcarCaixas(el('lancImplementos'), dados.implementos);
      atualizarBotoesAdicionar();
    }

    /** Liga os eventos genéricos do formulário — chamar uma vez só, depois
        de o DOM da aba/página já existir. Não inclui o "submit" (cada
        página grava de um jeito diferente: salvar/inserir ou editar/gravar
        por cima), nem os botões da lista/navegação, que são específicos de
        cada página. */
    function ligarEventosComuns() {
      el('lancAddCultura').addEventListener('click', function () { el('lancCulturas').appendChild(linhaCultura()); atualizarBotoesAdicionar(); });
      el('lancAddDae').addEventListener('click', function () { el('lancDaes').appendChild(linhaDae()); atualizarBotoesAdicionar(); });
      Array.prototype.forEach.call(form.querySelectorAll('.lanc-caixas'), function (host) {
        host.addEventListener('change', function (e) {
          if (!e.target.classList.contains('lc-outra-check')) return;
          var outraTexto = host.querySelector('.lc-outra-texto');
          var linhaOutra = host.querySelector('.lc-outra-linha');
          outraTexto.disabled = !e.target.checked;
          if (linhaOutra) linhaOutra.hidden = !e.target.checked;
          if (e.target.checked) outraTexto.focus(); else outraTexto.value = '';
        });
      });
      form.addEventListener('input', function (e) {
        if (e.target.name === 'cpf') {
          var formatado = formatarCpf(e.target.value);
          if (e.target.value !== formatado) e.target.value = formatado;
        }
        if (e.target.closest('.lanc-cultura-linha, .lanc-dae-linha')) atualizarBotoesAdicionar();
        if (e.target.classList && e.target.classList.contains('lc-area')) recalcularAreaTotal();
        if (e.target.name === 'quantidade_acudes') el('lancAcudeErro').hidden = true;
      });
      // barreira no clique: com campo anterior em branco o serviço nem chega a ser marcado
      form.addEventListener('click', function (e) {
        var rotuloServico = e.target.closest && e.target.closest('.lanc-radio-grande');
        if (rotuloServico && !liberarServico()) e.preventDefault();
      }, true);
      form.addEventListener('click', function (e) {
        if (e.target.classList && e.target.classList.contains('lanc-cultura-remover')) {
          var linha = e.target.closest('.lanc-cultura-linha, .lanc-dae-linha');
          if (linha) { resgatarAdd(); linha.remove(); atualizarBotoesAdicionar(); recalcularAreaTotal(); }
        }
      });
      form.addEventListener('change', function (e) {
        if (e.target.name === 'tipo_servico') {
          // pelo teclado (setas) o clique não passa pela barreira abaixo: desfaz aqui
          if (!liberarServico()) { e.target.checked = false; alternarSecoesServico(); return; }
          alternarSecoesServico();
          el('lancServicoErro').hidden = true;
        }
        if (e.target.id === 'lancIndigena') alternarEtnia();
        if (e.target.id === 'lancPossuiAssociacao') alternarAssociacao();
        if (e.target.closest('.lanc-cultura-linha, .lanc-dae-linha')) {
          atualizarBotoesAdicionar();
          if (e.target.classList.contains('lc-cultura')) el('lancCulturaErro').hidden = true;
        }
        if (e.target.name === 'quantidade_acudes') el('lancAcudeErro').hidden = true;
      });
      form.elements['municipio'].addEventListener('change', sincronizarEscritorioPorMunicipio);
    }

    return {
      montarMunicipios: montarMunicipios,
      garantirTecnico: garantirTecnico,
      formatarCpf: formatarCpf,
      montarCaixasVazias: montarCaixasVazias,
      sincronizarEscritorioPorMunicipio: sincronizarEscritorioPorMunicipio,
      atualizarZona: atualizarZona,
      marcarHorarioInsercao: marcarHorarioInsercao,
      preencherDinamicos: preencherDinamicos,
      culturasAtuais: culturasAtuais,
      daesAtuais: daesAtuais,
      marcadosDe: marcadosDe,
      recalcularAreaTotal: recalcularAreaTotal,
      atualizarBotoesAdicionar: atualizarBotoesAdicionar,
      alternarSecoesServico: alternarSecoesServico,
      alternarEtnia: alternarEtnia,
      alternarAssociacao: alternarAssociacao,
      validarServico: validarServico,
      ligarEventosComuns: ligarEventosComuns
    };
  }

  /** Manda o FormData (acao salvar/listar/carregar/editar/excluir) pro
      servidor e devolve {status, corpo}. Primeiro na Edge Function
      lancar-mecanizacao do Supabase — o GitHub Pages não executa PHP (o POST
      pro .php volta 405 sem JSON e nada era gravado); se ela ainda não foi
      publicada (404), cai pro lancar_mecanizacao.php (só no XAMPP). Mesmo
      esquema de chamarServidor() em js/admin-auth.js. */
  function enviar(fd) {
    function lerJson(r) {
      return r.json()
        .catch(function () { return { ok: false, erro: 'O servidor respondeu de um jeito inesperado (HTTP ' + r.status + ').' }; })
        .then(function (j) { return { status: r.status, corpo: j || {} }; });
    }
    var cfg = window.BANCO_CONFIG || {};
    var auth = window.ADMIN_AUTH;
    // token sempre atual: quem passou mais de 1 h preenchendo a ficha teria
    // o token vencido — garantirSessao() renova antes (ver admin-auth.js)
    var pronto = auth && auth.garantirSessao
      ? auth.garantirSessao().then(function (s) { if (s && s.access_token && fd.has('token')) fd.set('token', s.access_token); }, function () {})
      : Promise.resolve();
    return pronto.then(function () { return enviarAgora(fd, cfg, lerJson); }).then(function (res) {
      // 401 com token que parecia válido (relógio do computador atrasado, token invalidado):
      // força a renovação e tenta de novo uma vez antes de pedir pra entrar de novo
      if (res.status !== 401 || !fd.has('token') || !auth || !auth.renovarSessao) return res;
      return auth.renovarSessao().then(function (s) {
        if (!s || !s.access_token || s.access_token === fd.get('token')) return res;
        fd.set('token', s.access_token);
        return enviarAgora(fd, cfg, lerJson);
      }, function () { return res; });
    });
  }

  function enviarAgora(fd, cfg, lerJson) {
    var edge = cfg.url
      ? fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/lancar-mecanizacao', {
          method: 'POST', headers: { apikey: cfg.chavePublica }, body: fd
        }).then(function (r) { return r.status === 404 ? null : r; }, function () { return null; })
      : Promise.resolve(null);
    return edge.then(function (r) {
      return r || fetch('../lancar_mecanizacao.php', { method: 'POST', body: fd });
    }).then(lerJson);
  }

  window.LANCAMENTO_CAMPOS = { criar: criar, esc: esc, enviar: enviar, tecnicos: TECNICOS, formatarCpf: formatarCpf };
})();
