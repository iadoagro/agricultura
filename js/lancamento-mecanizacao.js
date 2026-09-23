/* Aba "Lançamento" do painel de mecanização — digitação de uma vistoria por
   vez, a partir da ficha em papel, gravando direto em mecanizacao_lancamentos
   no Supabase via lancar_mecanizacao.php (nunca com a chave service_role no
   navegador — ver esse arquivo). O comportamento do formulário em si
   (linhas de cultura/DAE, máquinas/implementos, município↔escritório etc.)
   é compartilhado com a página de edição em js/lancamento-campos.js — aqui
   fica só o que é específico desta aba: a lista de lançamentos e salvar
   (inserir) um novo.

   Isolado deste jeito (módulo próprio, sem tocar no D/F/TODOS de
   dashboard.js) porque não é um gráfico: é um formulário. dashboard.js só
   chama LANCAMENTO_MECANIZACAO.abrir(municipios) quando a aba abre. */
(function () {
  'use strict';

  // Depois que uma vistoria é salva, um lote costuma continuar com o mesmo
  // técnico, escritório, data e município (ver os 3 exemplos reais: mesma
  // vistoria, mesmo dia, 3 beneficiários diferentes) — vale a pena manter.
  var CAMPOS_MANTIDOS_APOS_SALVAR = ['tipo_servico', 'data_vistoria', 'escritorio_local', 'responsavel_tecnico', 'municipio'];

  var form, ajuda, iniciado = false;
  var loteAnterior = null;  // {tipo_servico, data_vistoria, escritorio_local, responsavel_tecnico, municipio} do último salvo

  var esc = window.LANCAMENTO_CAMPOS.esc;
  function el(id) { return document.getElementById(id); }
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

  /** Sessão do login do site (admin-auth.js) — é ela que o servidor confirma
      de verdade no Supabase (ver emailAutenticado() em lancar_mecanizacao.php)
      para saber quem está lançando e filtrar a lista pela própria pessoa. */
  function sessaoSite() {
    try {
      var auth = window.ADMIN_AUTH;
      return (auth && auth.sessaoAtual && auth.sessaoAtual()) || null;
    } catch (e) { return null; }
  }

  /* -------------------------------------------------------------------- salvar */
  /** seedLote: pré-preenche com os campos (serviço, data, escritório, técnico,
      município) do último lançamento salvo — quem digita várias fichas do
      mesmo dia/lote não precisa repetir esses campos toda vez. */
  function limparFormulario(seedLote) {
    form.reset();
    ajuda.marcarHorarioInsercao();   // form.reset() também limpa este campo, sem "name"
    if (seedLote && loteAnterior) {
      Object.keys(loteAnterior).forEach(function (c) { if (loteAnterior[c]) form.elements[c].value = loteAnterior[c]; });
    }
    ajuda.sincronizarEscritorioPorMunicipio();   // trava/destrava conforme o município (seedado ou vazio)
    ajuda.preencherDinamicos();
    ajuda.alternarSecoesServico();
    ajuda.alternarEtnia();
    ajuda.alternarAssociacao();
    ajuda.atualizarBotoesAdicionar();
  }

  function salvar(e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (!ajuda.validarServico()) return;

    var fd = new FormData(form);
    fd.set('acao', 'salvar');
    // escritorio_local fica "disabled" fora de Rio Branco (travado no valor
    // que o município já decidiu) — campo desabilitado não entra no
    // FormData sozinho, por isso vai explícito aqui.
    fd.set('escritorio_local', form.elements['escritorio_local'].value);
    fd.set('culturas', JSON.stringify(ajuda.culturasAtuais()));
    fd.set('daes', JSON.stringify(ajuda.daesAtuais()));
    var geoX = form.elements['geo_x'].value, geoY = form.elements['geo_y'].value, geoZona = form.elements['geo_zona'].value;
    fd.set('pontos_geo', JSON.stringify((geoX || geoY) ? [{ ponto: 1, x: geoX, y: geoY, zona: geoZona }] : []));
    fd.set('maquinas', JSON.stringify(ajuda.marcadosDe(el('lancMaquinas'))));
    fd.set('implementos', JSON.stringify(ajuda.marcadosDe(el('lancImplementos'))));
    var sessao = sessaoSite();
    if (sessao && sessao.access_token) fd.set('token', sessao.access_token);
    if (sessao && sessao.user && sessao.user.email) fd.set('criado_por_email', sessao.user.email);
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
        if (!res.corpo.ok) { aviso('lancSalvarStatus', 'erro', esc(res.corpo.erro || 'Não foi possível salvar.')); return; }
        loteAnterior = {};
        CAMPOS_MANTIDOS_APOS_SALVAR.forEach(function (c) { loteAnterior[c] = form.elements[c].value; });
        var nome = form.elements['nome_beneficiario'].value;
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('criar', 'mecanizacao', 'Cadastrou o lançamento de mecanização de "' + nome + '"');
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
    ajuda.marcarHorarioInsercao();
  }

  /* ------------------------------------------------------------- recentes */
  /** Excluir é só da conta responsável (root@root.com) — os demais usuários
      só editam (ver lancar_mecanizacao.php). O botão aparece pra todo mundo
      (pra não parecer que "sumiu"), mas fica desabilitado pra quem não pode. */
  function excluir(id, nome) {
    if (!confirm('Excluir o lançamento de "' + nome + '"? Não tem como desfazer.')) return;
    var sessao = sessaoSite();
    if (!sessao || !sessao.access_token) { aviso('lancListaAviso', 'erro', 'Sua sessão do site expirou. Recarregue a página e entre de novo.'); return; }
    var fd = new FormData();
    fd.append('acao', 'excluir');
    fd.append('token', sessao.access_token);
    fd.append('id', id);
    aviso('lancListaAviso', 'carregando', 'Excluindo…');
    fetch('../lancar_mecanizacao.php', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, corpo: j }; }); })
      .then(function (res) {
        if (!res.corpo.ok) { aviso('lancListaAviso', 'erro', esc(res.corpo.erro || 'Não foi possível excluir.')); return; }
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('excluir', 'mecanizacao', 'Excluiu o lançamento de mecanização de "' + nome + '"');
        aviso('lancListaAviso', 'ok', 'Lançamento excluído.');
        carregarRecentes();
      })
      .catch(function () { aviso('lancListaAviso', 'erro', 'Sem conexão com o servidor.'); });
  }

  function carregarRecentes() {
    el('lancRecentes').innerHTML = '<p class="nota">Carregando…</p>';
    var sessao = sessaoSite();
    if (!sessao || !sessao.access_token) {
      el('lancRecentes').innerHTML = '<p class="nota">Sua sessão do site expirou. Recarregue a página e entre de novo.</p>';
      return;
    }
    var fd = new FormData();
    fd.append('acao', 'listar');
    fd.append('token', sessao.access_token);
    fd.append('limite', '15');
    fetch('../lancar_mecanizacao.php', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, corpo: j }; }); })
      .then(function (res) {
        if (res.status === 401) { el('lancRecentes').innerHTML = '<p class="nota">Sua sessão do site expirou. Recarregue a página e entre de novo.</p>'; return; }
        if (!res.corpo.ok) { el('lancRecentes').innerHTML = '<p class="nota">Não foi possível carregar os lançamentos.</p>'; return; }
        var linhas = res.corpo.lancamentos || [];
        var podeExcluir = !!res.corpo.vendo_de_todos;   // só root@root.com vê "vendo_de_todos"
        var nota = podeExcluir
          ? '<p class="nota">Mostrando os lançamentos de todo mundo (conta root@root.com).</p>'
          : '<p class="nota">Mostrando só os seus lançamentos.</p>';
        if (!linhas.length) { el('lancRecentes').innerHTML = nota + '<p class="nota">Nenhum lançamento ainda.</p>'; return; }
        el('lancRecentes').innerHTML = nota + '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr>' +
          '<th>Salvo em</th><th>Lançado por</th><th>Serviço</th><th>Beneficiário</th><th>Município</th><th>Escritório</th>' +
          '<th>Vistoria</th><th class="num">ha</th><th class="num">h</th><th class="num">Açudes</th><th>Ações</th>' +
          '</tr></thead><tbody>' + linhas.map(function (r) {
            return '<tr><td>' + esc(new Date(r.criado_em).toLocaleString('pt-BR')) + '</td>' +
              '<td>' + esc(nomeDeEmail(r.criado_por_email)) + '</td>' +
              '<td>' + esc(r.tipo_servico || '—') + '</td><td>' + esc(r.nome_beneficiario) + '</td>' +
              '<td>' + esc(r.municipio || '—') + '</td><td>' + esc(r.escritorio_local || '—') + '</td>' +
              '<td>' + esc(r.data_vistoria || '—') + '</td>' +
              '<td class="num">' + esc(r.area_total_ha || '') + '</td>' +
              '<td class="num">' + esc(r.horas_maquina || '') + '</td>' +
              '<td class="num">' + esc(r.quantidade_acudes || '') + '</td>' +
              '<td class="lanc-tabela-acoes">' +
                '<a class="btn" href="lancamento-editar.html?id=' + encodeURIComponent(r.id) + '">Editar</a> ' +
                '<button class="btn btn-excluir" type="button" data-id="' + esc(r.id) + '" data-nome="' + esc(r.nome_beneficiario) + '"' +
                  (podeExcluir ? '' : ' disabled title="Só a conta responsável pode excluir"') + '>Excluir</button>' +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
        Array.prototype.forEach.call(el('lancRecentes').querySelectorAll('.btn-excluir'), function (b) {
          b.addEventListener('click', function () { excluir(b.getAttribute('data-id'), b.getAttribute('data-nome')); });
        });
      })
      .catch(function () { /* lista de conferência: falha aqui não impede o resto da aba */ });
  }

  /* --------------------------------------------------------------- montagem */
  function montar() {
    form = el('lancForm');
    ajuda = window.LANCAMENTO_CAMPOS.criar(form);
    ajuda.montarCaixasVazias();
    ajuda.preencherDinamicos();
    ajuda.alternarSecoesServico();
    ajuda.alternarEtnia();
    ajuda.alternarAssociacao();
    ajuda.atualizarBotoesAdicionar();
    ajuda.ligarEventosComuns();

    form.addEventListener('submit', salvar);
    el('lancLimpar').addEventListener('click', function () { limparFormulario(false); aviso('lancSalvarStatus', '', ''); });
    el('lancVoltarLista').addEventListener('click', mostrarLista);
    el('lancNovoBtn').addEventListener('click', function () {
      aviso('lancListaAviso', '', '');
      limparFormulario(true);
      mostrarFormulario();
    });
  }

  function abrir(municipios) {
    municipios = municipios || [];
    var primeiraVez = !iniciado;
    if (primeiraVez) { montar(); iniciado = true; }
    ajuda.montarMunicipios(municipios);
    ajuda.sincronizarEscritorioPorMunicipio();
    // Reabertura (dashboard.js chama isto de novo sempre que a aba precisa
    // redesenhar, inclusive depois do "resize" que o teclado do celular
    // dispara ao focar um campo) não deve arrancar quem está no meio de um
    // lançamento de volta para a lista — só a primeira abertura da aba faz
    // isso, e só ela.
    if (primeiraVez) mostrarLista();
  }

  window.LANCAMENTO_MECANIZACAO = { abrir: abrir };
})();
