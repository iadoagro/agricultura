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
  var MAQUINAS_OPCOES = [
    'Escavadeira hidráulica', 'Pá carregadeira', 'Trator de esteira', 'Trator de pneu',
    'Trator agrícola', 'Retroescavadeira', 'New Holland', 'Massey Ferguson',
    'John Deere', 'Solis 90'
  ];
  var IMPLEMENTOS_OPCOES = [
    'Grade aradora', 'Grade niveladora', 'Plantadeira', 'Colheitadeira', 'Pulverizador',
    'Jogadora de calcário', 'Destoca', 'Roçadeira', 'Piscicultura', 'Tanque / açude'
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
      '<select class="lc-cultura">' + '<option value="">Cultura…</option>' +
      CULTURAS_FICHA.map(function (c) { return '<option' + (c === valores.cultura ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select>' +
      '<input class="lc-area" type="number" step="0.01" min="0" placeholder="Área (ha)" value="' + esc(valores.area_ha || '') + '">' +
      '<select class="lc-sistema"><option value="">Sistema…</option>' +
      SISTEMAS_CULTIVO.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === valores.sistema_cultivo ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; }).join('') +
      '</select>' +
      '<button type="button" class="lanc-cultura-remover" title="Remover" aria-label="Remover cultura">&times;</button>';
    return linha;
  }

  function linhaDae(valores) {
    valores = valores || {};
    var linha = document.createElement('div');
    linha.className = 'lanc-dae-linha';
    linha.innerHTML =
      '<input class="ld-numero" type="text" placeholder="Nº da DAE" value="' + esc(valores.numero || '') + '">' +
      '<input class="ld-valor" type="number" step="0.01" min="0" placeholder="Valor (R$)" value="' + esc(valores.valor != null ? valores.valor : '') + '">' +
      '<button type="button" class="lanc-cultura-remover" title="Remover" aria-label="Remover DAE">&times;</button>';
    return linha;
  }

  /** "Outra" fica de fora da lista comum: em vez de um valor fixo, marcar
      essa caixa destrava um campo de texto na mesma linha pra descrever o
      que não está nas opções (ver marcarCaixas/coletarMarcados). */
  function caixasDeOpcoes(host, opcoes, name) {
    host.innerHTML = opcoes.map(function (o, i) {
      var id = name + i;
      return '<label for="' + id + '"><input type="checkbox" id="' + id + '" value="' + esc(o) + '"><span>' + esc(o) + '</span></label>';
    }).join('') +
      '<label class="lanc-caixa-outra" for="' + name + 'Outra">' +
        '<input type="checkbox" id="' + name + 'Outra" class="lc-outra-check"><span>Outra</span>' +
        '<input type="text" class="lc-outra-texto" placeholder="Especifique…" disabled>' +
      '</label>';
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
    function sincronizarEscritorioPorMunicipio() {
      var mun = form.elements['municipio'].value;
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
      var agora = new Date();
      campo.value = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    function atualizarBotoesAdicionar() {
      var culturas = el('lancCulturas').querySelectorAll('.lanc-cultura-linha');
      var ultimaCultura = culturas[culturas.length - 1];
      var culturaPronta = !!(ultimaCultura && ultimaCultura.querySelector('.lc-cultura').value);
      el('lancAddCultura').disabled = !(culturaPronta && culturas.length < MAX_CULTURAS);

      var daes = el('lancDaes').querySelectorAll('.lanc-dae-linha');
      var ultimoDae = daes[daes.length - 1];
      var daePronto = !!(ultimoDae && (ultimoDae.querySelector('.ld-numero').value.trim() || ultimoDae.querySelector('.ld-valor').value !== ''));
      el('lancAddDae').disabled = !(daePronto && daes.length < MAX_DAES);
    }

    function alternarSecoesServico() {
      var v = form.elements['tipo_servico'].value;   // RadioNodeList: '' quando nenhum marcado
      el('lancSecMecanizacao').hidden = v !== 'Mecanização';
      el('lancSecAcudagem').hidden = v !== 'Açudagem';
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
          outraTexto.disabled = !e.target.checked;
          if (e.target.checked) outraTexto.focus(); else outraTexto.value = '';
        });
      });
      form.addEventListener('input', function (e) {
        if (e.target.closest('.lanc-cultura-linha, .lanc-dae-linha')) atualizarBotoesAdicionar();
        if (e.target.classList && e.target.classList.contains('lc-area')) recalcularAreaTotal();
        if (e.target.name === 'quantidade_acudes') el('lancAcudeErro').hidden = true;
      });
      form.addEventListener('click', function (e) {
        if (e.target.classList && e.target.classList.contains('lanc-cultura-remover')) {
          var linha = e.target.closest('.lanc-cultura-linha, .lanc-dae-linha');
          if (linha) { linha.remove(); atualizarBotoesAdicionar(); recalcularAreaTotal(); }
        }
      });
      form.addEventListener('change', function (e) {
        if (e.target.name === 'tipo_servico') { alternarSecoesServico(); el('lancServicoErro').hidden = true; }
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
      montarCaixasVazias: montarCaixasVazias,
      sincronizarEscritorioPorMunicipio: sincronizarEscritorioPorMunicipio,
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
    var edge = cfg.url
      ? fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/lancar-mecanizacao', {
          method: 'POST', headers: { apikey: cfg.chavePublica }, body: fd
        }).then(function (r) { return r.status === 404 ? null : r; }, function () { return null; })
      : Promise.resolve(null);
    return edge.then(function (r) {
      return r || fetch('../lancar_mecanizacao.php', { method: 'POST', body: fd });
    }).then(lerJson);
  }

  window.LANCAMENTO_CAMPOS = { criar: criar, esc: esc, enviar: enviar };
})();
