/* Aba "Lançamento" do painel de mecanização — digitação de uma vistoria por
   vez, a partir da ficha em papel (com ou sem PDF anexado), gravando direto
   em mecanizacao_lancamentos no Supabase via lancar_mecanizacao.php (nunca
   com a chave service_role no navegador — ver esse arquivo).

   Isolado deste jeito (módulo próprio, sem tocar no D/F/TODOS de
   dashboard.js) porque não é um gráfico: é um formulário. dashboard.js só
   chama LANCAMENTO_MECANIZACAO.abrir(municipios) quando a aba abre. */
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

  // Campos extraídos do PDF (ver js/lancamento-extrair-pdf.js) que têm um
  // <input>/<select> homônimo no formulário — cópia direta. escritorio_local
  // fica de fora: agora é preso à lista fixa "Escritório Local de <município>",
  // e o texto lido do PDF quase nunca bate exatamente com uma dessas opções.
  var CAMPOS_DIRETOS = [
    'tipo_servico', 'data_vistoria', 'responsavel_tecnico',
    'nome_beneficiario', 'cpf', 'data_nascimento', 'telefone',
    'associacao_cooperativa', 'endereco', 'nome_propriedade', 'municipio',
    'num_identificacao_patrimonio'
  ];
  // Depois que uma vistoria é salva, um lote costuma continuar com o mesmo
  // técnico, escritório, data e município (ver os 3 exemplos reais: mesma
  // vistoria, mesmo dia, 3 beneficiários diferentes) — vale a pena manter.
  var CAMPOS_MANTIDOS_APOS_SALVAR = ['tipo_servico', 'data_vistoria', 'escritorio_local', 'responsavel_tecnico', 'municipio'];

  var form, iniciado = false, arquivoAtual = null, extraiuAutomatico = false;
  var senhaMemoria = null;   // só em memória (nunca localStorage/sessionStorage): some ao recarregar a página
  var loteAnterior = null;  // {tipo_servico, data_vistoria, escritorio_local, responsavel_tecnico, municipio} do último salvo

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }
  function aviso(alvoId, classe, html) {
    el(alvoId).innerHTML = html ? '<p class="aviso ' + classe + '">' + html + '</p>' : '';
  }

  /* Nome legível a partir do e-mail de quem lançou — mesma ideia de
     normAlimentador() em js/importar.js ("lucaspaiva.agro2011@ac.gov.br" →
     "Lucaspaiva.Agro2011"), pra bater com os nomes já usados nos relatórios
     de "Inserções por pessoa" da base migrada. */
  function nomeDeEmail(email) {
    if (!email) return '—';
    var usuario = String(email).split('@')[0];
    return usuario.replace(/(^|[._-])([a-zà-ú])/g, function (_, sep, letra) { return sep + letra.toUpperCase(); });
  }

  function getSenha(forcarPrompt) {
    if (senhaMemoria && !forcarPrompt) return senhaMemoria;
    var s = prompt('Confirme a senha de administrador para gravar no banco:');
    if (s == null || s === '') return null;
    senhaMemoria = s;
    return s;
  }

  /* ------------------------------------------------------- montar formulário */
  function montarMunicipios(municipios) {
    var sel = form.elements['municipio'];
    var atual = sel.value;
    sel.innerHTML = '<option value="">Selecione…</option>' +
      municipios.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('');
    sel.value = atual;
  }

  /** "Escritório Local de <Município>" para cada um dos 22 municípios do
      Acre — um escritório por município, como pedido. */
  function montarEscritorios(municipios) {
    var sel = form.elements['escritorio_local'];
    var atual = sel.value;
    sel.innerHTML = '<option value="">Selecione…</option>' +
      municipios.map(function (m) { return '<option>Escritório Local de ' + esc(m) + '</option>'; }).join('');
    sel.value = atual;
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
    linha.querySelector('.lanc-cultura-remover').addEventListener('click', function () { linha.remove(); atualizarBotoesAdicionar(); recalcularAreaTotal(); });
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
    linha.querySelector('.lanc-cultura-remover').addEventListener('click', function () { linha.remove(); atualizarBotoesAdicionar(); });
    return linha;
  }

  function caixasDeOpcoes(host, opcoes, name) {
    host.innerHTML = opcoes.map(function (o, i) {
      var id = name + i;
      return '<label for="' + id + '"><input type="checkbox" id="' + id + '" value="' + esc(o) + '">' + esc(o) + '</label>';
    }).join('');
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

  function marcadosDe(host) {
    return Array.prototype.slice.call(host.querySelectorAll('input:checked')).map(function (i) { return i.value; });
  }

  /* Soma automática das áreas das culturas em "Área total (ha)" — o campo
     continua um <input> normal, então a pessoa pode digitar outro valor por
     cima a qualquer momento (só volta a somar se mexer numa área de novo). */
  function recalcularAreaTotal() {
    var soma = culturasAtuais().reduce(function (t, c) { return t + (c.area_ha || 0); }, 0);
    form.elements['area_total_ha'].value = soma ? Math.round(soma * 100) / 100 : '';
  }

  /* Só libera "+ Adicionar" quando a última linha já tem o essencial
     preenchido — "só depois poder adicionar outro", como pedido — e ainda
     não bateu no teto (4 culturas / 10 DAEs, como na ficha em papel). */
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
    Array.prototype.forEach.call(document.querySelectorAll('.lanc-radio-grande'), function (lbl) {
      var radio = lbl.querySelector('input[name="tipo_servico"]');
      lbl.classList.toggle('lanc-marcado', !!(radio && radio.checked));
    });
  }

  function alternarEtnia() {
    var marcado = el('lancIndigena').checked;
    el('lancCampoEtnia').hidden = !marcado;
    if (!marcado) form.elements['etnia'].value = '';
  }

  /* --------------------------------------------------------- pré-preenchimento */
  function marcarSugestao(campoNome, valor) {
    var campo = form.elements[campoNome];
    if (!campo || valor == null || valor === '') return false;
    // grupo de rádio (tipo_servico): RadioNodeList não tem classList — destaca
    // o <label> do rádio escolhido em vez do campo em si.
    if (campo.length != null && campo[0] && campo[0].type === 'radio') {
      var radio = Array.prototype.filter.call(campo, function (r) { return r.value === String(valor); })[0];
      if (!radio) return false;
      radio.checked = true;
      var lbl = radio.closest('label');
      if (lbl) lbl.classList.add('lanc-sugerido');
      return true;
    }
    if (campo.tagName === 'SELECT') {
      var existe = Array.prototype.some.call(campo.options, function (o) { return o.value === String(valor); });
      if (!existe) return false;
    }
    campo.value = valor;
    campo.classList.add('lanc-sugerido');
    return true;
  }

  function aplicarExtracao(campos) {
    var preenchidos = [];
    CAMPOS_DIRETOS.forEach(function (chave) {
      var c = campos[chave];
      if (c && marcarSugestao(chave, c.valor)) preenchidos.push(chave);
    });

    var numDae = campos.num_dae, valorDae = campos.valor_dae;
    if ((numDae && numDae.valor) || (valorDae && valorDae.valor != null)) {
      var primeiraDae = el('lancDaes').querySelector('.lanc-dae-linha');
      if (!primeiraDae) { primeiraDae = linhaDae(); el('lancDaes').appendChild(primeiraDae); }
      if (numDae && numDae.valor) {
        primeiraDae.querySelector('.ld-numero').value = numDae.valor;
        primeiraDae.querySelector('.ld-numero').classList.add('lanc-sugerido');
      }
      if (valorDae && valorDae.valor != null) {
        primeiraDae.querySelector('.ld-valor').value = valorDae.valor;
        primeiraDae.querySelector('.ld-valor').classList.add('lanc-sugerido');
      }
      preenchidos.push('dae');
    }

    var pontos = campos.pontos_geo && campos.pontos_geo.valor;
    if (pontos && pontos.length) {
      var p = pontos[0];
      if (p.x) { form.elements['geo_x'].value = p.x; form.elements['geo_x'].classList.add('lanc-sugerido'); }
      if (p.y) { form.elements['geo_y'].value = p.y; form.elements['geo_y'].classList.add('lanc-sugerido'); }
      if (p.zona) marcarSugestao('geo_zona', p.zona);
      if (p.x || p.y) preenchidos.push('georreferenciamento');
    }

    alternarSecoesServico();
    alternarEtnia();
    atualizarBotoesAdicionar();
    extraiuAutomatico = true;

    var msg = '<b>' + preenchidos.length + ' campo(s) sugerido(s) a partir do PDF</b> (destacados abaixo) — confira ' +
      'cada um antes de salvar. Nomes escritos à mão saem com erros de leitura com frequência.' +
      '<br>Estado civil, sexo, indígena, DAP, tipo de trator, implementos, escritório local e a tabela de ' +
      'culturas <b>não dá para ler de uma marcação com X</b>: preencha essa parte manualmente.';
    aviso('lancUpStatus', 'ok', msg);
  }

  function extrairPdf(arquivo) {
    if (!window.LANCAMENTO_EXTRAIR_PDF) {
      aviso('lancUpStatus', 'erro', 'Leitor de PDF não carregado (js/lancamento-extrair-pdf.js). Preencha manualmente.');
      return;
    }
    aviso('lancUpStatus', 'carregando', 'Lendo o PDF no navegador…');
    // Leitura 100% no navegador — nenhum arquivo é enviado a servidor nenhum
    // aqui (ver js/lancamento-extrair-pdf.js). Só salvar o lançamento depois
    // fala com o servidor, e só o suficiente para gravar no banco.
    window.LANCAMENTO_EXTRAIR_PDF.doArquivo(arquivo)
      .then(function (res) { aplicarExtracao(res.campos || {}); })
      .catch(function (e) { aviso('lancUpStatus', 'erro', esc(e.message || 'Não foi possível ler o PDF.')); });
  }

  function lerArquivo(arquivo) {
    if (!arquivo) return;
    if (!/pdf$/i.test(arquivo.type) && !/\.pdf$/i.test(arquivo.name)) {
      aviso('lancUpStatus', 'erro', 'Envie um arquivo PDF.');
      return;
    }
    arquivoAtual = arquivo;
    el('lancUpZona').querySelector('.upload-tit').textContent = arquivo.name;
    extrairPdf(arquivo);
  }

  /* -------------------------------------------------------------------- salvar */
  /** seedLote: pré-preenche com os campos (serviço, data, escritório, técnico,
      município) do último lançamento salvo — quem digita várias fichas do
      mesmo dia/lote não precisa repetir esses campos toda vez. */
  function limparFormulario(seedLote) {
    form.reset();
    if (seedLote && loteAnterior) {
      Object.keys(loteAnterior).forEach(function (c) { if (loteAnterior[c]) form.elements[c].value = loteAnterior[c]; });
    }
    Array.prototype.forEach.call(form.querySelectorAll('.lanc-sugerido'), function (i) { i.classList.remove('lanc-sugerido'); });
    el('lancCulturas').innerHTML = '';
    el('lancCulturas').appendChild(linhaCultura());
    el('lancDaes').innerHTML = '';
    el('lancDaes').appendChild(linhaDae());
    arquivoAtual = null;
    extraiuAutomatico = false;
    el('lancUpZona').querySelector('.upload-tit').textContent = 'Arraste o PDF aqui ou clique para escolher';
    el('lancArquivo').value = '';
    alternarSecoesServico();
    alternarEtnia();
    atualizarBotoesAdicionar();
  }

  /** Sessão do login do site (admin-auth.js) — é ela que o servidor confirma
      de verdade no Supabase (ver emailAutenticado() em lancar_mecanizacao.php)
      para saber quem está lançando e filtrar a lista pela própria pessoa. */
  function sessaoSite() {
    try {
      var auth = window.ADMIN_AUTH;
      return (auth && auth.sessaoAtual && auth.sessaoAtual()) || null;
    } catch (e) { return null; }
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

  function salvar(e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (!validarServico()) return;
    var senha = getSenha();
    if (!senha) return;

    var fd = new FormData(form);
    fd.set('senha', senha);
    fd.set('acao', 'salvar');
    fd.set('culturas', JSON.stringify(culturasAtuais()));
    fd.set('daes', JSON.stringify(daesAtuais()));
    var geoX = form.elements['geo_x'].value, geoY = form.elements['geo_y'].value, geoZona = form.elements['geo_zona'].value;
    fd.set('pontos_geo', JSON.stringify((geoX || geoY) ? [{ ponto: 1, x: geoX, y: geoY, zona: geoZona }] : []));
    fd.set('maquinas', JSON.stringify(marcadosDe(el('lancMaquinas'))));
    fd.set('implementos', JSON.stringify(marcadosDe(el('lancImplementos'))));
    fd.set('pdf_extraido_automatico', extraiuAutomatico ? '1' : '0');
    var sessao = sessaoSite();
    if (sessao && sessao.access_token) fd.set('token', sessao.access_token);
    if (sessao && sessao.user && sessao.user.email) fd.set('criado_por_email', sessao.user.email);
    if (arquivoAtual) fd.set('arquivo', arquivoAtual);
    // remove os campos auxiliares (não existem na tabela): evita confundir
    // com colunas de verdade quando o PHP monta o registro.
    fd.delete('geo_x'); fd.delete('geo_y'); fd.delete('geo_zona');

    var botao = el('lancSalvar');
    botao.disabled = true;
    aviso('lancSalvarStatus', 'carregando', 'Salvando…');
    fetch('../lancar_mecanizacao.php', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, corpo: j }; }); })
      .then(function (res) {
        botao.disabled = false;
        if (res.status === 403) { senhaMemoria = null; aviso('lancSalvarStatus', 'erro', 'Senha incorreta.'); return; }
        if (!res.corpo.ok) { aviso('lancSalvarStatus', 'erro', esc(res.corpo.erro || 'Não foi possível salvar.')); return; }
        loteAnterior = {};
        CAMPOS_MANTIDOS_APOS_SALVAR.forEach(function (c) { loteAnterior[c] = form.elements[c].value; });
        var nome = form.elements['nome_beneficiario'].value;
        limparFormulario(false);
        aviso('lancSalvarStatus', '', '');
        mostrarLista();
        aviso('lancListaAviso', 'ok', 'Lançamento salvo para <b>' + esc(nome) + '</b>.');
      })
      .catch(function () {
        botao.disabled = false;
        aviso('lancSalvarStatus', 'erro', 'Sem conexão com o servidor. Os campos foram mantidos — tente novamente.');
      });
  }

  /* ---------------------------------------------------- alternar lista/formulário */
  function mostrarLista() {
    el('lancListaView').hidden = false;
    el('lancFormView').hidden = true;
    carregarRecentes();
  }
  function mostrarFormulario() {
    el('lancListaView').hidden = true;
    el('lancFormView').hidden = false;
  }

  /* ------------------------------------------------------------- recentes */
  function carregarRecentes() {
    var senha = senhaMemoria;
    if (!senha) {
      el('lancRecentes').innerHTML = '<p class="nota">Os lançamentos ficam atrás da senha de administrador — ' +
        'a mesma usada para publicar planilhas.</p><button class="btn btn-verde" id="lancMostrarBtn" type="button">Mostrar lançamentos</button>';
      var botaoMostrar = el('lancMostrarBtn');
      if (botaoMostrar) botaoMostrar.addEventListener('click', function () { if (getSenha()) carregarRecentes(); });
      return;
    }
    el('lancRecentes').innerHTML = '<p class="nota">Carregando…</p>';
    var sessao = sessaoSite();
    if (!sessao || !sessao.access_token) {
      el('lancRecentes').innerHTML = '<p class="nota">Sua sessão do site expirou. Recarregue a página e entre de novo.</p>';
      return;
    }
    var fd = new FormData();
    fd.append('acao', 'listar');
    fd.append('senha', senha);
    fd.append('token', sessao.access_token);
    fd.append('limite', '15');
    fetch('../lancar_mecanizacao.php', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, corpo: j }; }); })
      .then(function (res) {
        if (res.status === 403) { senhaMemoria = null; carregarRecentes(); return; }
        if (res.status === 401) { el('lancRecentes').innerHTML = '<p class="nota">Sua sessão do site expirou. Recarregue a página e entre de novo.</p>'; return; }
        if (!res.corpo.ok) { el('lancRecentes').innerHTML = '<p class="nota">Não foi possível carregar os lançamentos.</p>'; return; }
        var linhas = res.corpo.lancamentos || [];
        var nota = res.corpo.vendo_de_todos
          ? '<p class="nota">Mostrando os lançamentos de todo mundo (conta root@root.com).</p>'
          : '<p class="nota">Mostrando só os seus lançamentos.</p>';
        if (!linhas.length) { el('lancRecentes').innerHTML = nota + '<p class="nota">Nenhum lançamento ainda.</p>'; return; }
        el('lancRecentes').innerHTML = nota + '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr>' +
          '<th>Salvo em</th><th>Lançado por</th><th>Serviço</th><th>Beneficiário</th><th>Município</th><th>Escritório</th>' +
          '<th>Vistoria</th><th class="num">ha</th><th class="num">h</th><th class="num">Açudes</th>' +
          '</tr></thead><tbody>' + linhas.map(function (r) {
            return '<tr><td>' + esc(new Date(r.criado_em).toLocaleString('pt-BR')) + '</td>' +
              '<td>' + esc(nomeDeEmail(r.criado_por_email)) + '</td>' +
              '<td>' + esc(r.tipo_servico || '—') + '</td><td>' + esc(r.nome_beneficiario) + '</td>' +
              '<td>' + esc(r.municipio || '—') + '</td><td>' + esc(r.escritorio_local || '—') + '</td>' +
              '<td>' + esc(r.data_vistoria || '—') + '</td>' +
              '<td class="num">' + esc(r.area_total_ha || '') + '</td>' +
              '<td class="num">' + esc(r.horas_maquina || '') + '</td>' +
              '<td class="num">' + esc(r.quantidade_acudes || '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      })
      .catch(function () { /* lista de conferência: falha aqui não impede o resto da aba */ });
  }

  /* --------------------------------------------------------------- montagem */
  function montar() {
    form = el('lancForm');
    el('lancCulturas').appendChild(linhaCultura());
    el('lancAddCultura').addEventListener('click', function () { el('lancCulturas').appendChild(linhaCultura()); atualizarBotoesAdicionar(); });
    el('lancDaes').appendChild(linhaDae());
    el('lancAddDae').addEventListener('click', function () { el('lancDaes').appendChild(linhaDae()); atualizarBotoesAdicionar(); });
    caixasDeOpcoes(el('lancMaquinas'), MAQUINAS_OPCOES, 'lancMaq');
    caixasDeOpcoes(el('lancImplementos'), IMPLEMENTOS_OPCOES, 'lancImpl');
    alternarSecoesServico();
    alternarEtnia();
    atualizarBotoesAdicionar();

    // um listener só, no formulário inteiro: tira o destaque de "sugestão"
    // assim que a pessoa mexe no campo, cuida do rádio de serviço, do
    // checkbox de indígena, e mantém os botões "+ Adicionar" atualizados
    // enquanto a pessoa preenche as linhas de cultura/DAE.
    form.addEventListener('input', function (e) {
      if (e.target.classList) e.target.classList.remove('lanc-sugerido');
      if (e.target.closest('.lanc-cultura-linha, .lanc-dae-linha')) atualizarBotoesAdicionar();
      if (e.target.classList && e.target.classList.contains('lc-area')) recalcularAreaTotal();
      if (e.target.name === 'quantidade_acudes') el('lancAcudeErro').hidden = true;
    });
    form.addEventListener('change', function (e) {
      if (e.target.classList) e.target.classList.remove('lanc-sugerido');
      var lbl = e.target.closest && e.target.closest('label');
      if (lbl) lbl.classList.remove('lanc-sugerido');
      if (e.target.name === 'tipo_servico') { alternarSecoesServico(); el('lancServicoErro').hidden = true; }
      if (e.target.id === 'lancIndigena') alternarEtnia();
      if (e.target.closest('.lanc-cultura-linha, .lanc-dae-linha')) {
        atualizarBotoesAdicionar();
        if (e.target.classList.contains('lc-cultura')) el('lancCulturaErro').hidden = true;
      }
      if (e.target.name === 'quantidade_acudes') el('lancAcudeErro').hidden = true;
    });

    var zona = el('lancUpZona');
    zona.addEventListener('click', function () { el('lancArquivo').click(); });
    el('lancArquivo').addEventListener('change', function () { lerArquivo(this.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('sobre'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('sobre'); });
    });
    zona.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) lerArquivo(e.dataTransfer.files[0]);
    });

    form.addEventListener('submit', salvar);
    el('lancLimpar').addEventListener('click', function () { limparFormulario(false); aviso('lancSalvarStatus', '', ''); aviso('lancUpStatus', '', ''); });
    el('lancVoltarLista').addEventListener('click', mostrarLista);
    el('lancNovoBtn').addEventListener('click', function () {
      aviso('lancListaAviso', '', '');
      limparFormulario(true);
      mostrarFormulario();
    });
  }

  function abrir(municipios) {
    municipios = municipios || [];
    if (!iniciado) { montar(); iniciado = true; }
    montarMunicipios(municipios);
    montarEscritorios(municipios);
    mostrarLista();
  }

  window.LANCAMENTO_MECANIZACAO = { abrir: abrir };
})();
