/* Página de edição de um lançamento já salvo (pages/lancamento-editar.html)
   — aberta a partir do botão "Editar" na lista da aba "Lançamento"
   (js/lancamento-mecanizacao.js). O comportamento do formulário em si é o
   mesmo da aba (ver js/lancamento-campos.js); aqui só entra o que é
   específico da edição: carregar o registro existente, preencher os
   campos com ele, e gravar por cima (PATCH) em vez de inserir. */
(function () {
  'use strict';

  // Mesmos 22 municípios do Acre que dashboard.js monta pra aba (ali fica
  // agrupado por regional, que a edição não precisa — só a lista plana).
  var REGIONAIS_MUNS = [
    ['Assis Brasil', 'Brasiléia', 'Epitaciolândia', 'Xapuri'],
    ['Acrelândia', 'Bujari', 'Capixaba', 'Plácido de Castro', 'Porto Acre', 'Rio Branco', 'Senador Guiomard'],
    ['Manoel Urbano', 'Santa Rosa do Purus', 'Sena Madureira'],
    ['Feijó', 'Jordão', 'Tarauacá'],
    ['Cruzeiro do Sul', 'Mâncio Lima', 'Marechal Thaumaturgo', 'Porto Walter', 'Rodrigues Alves']
  ];
  var MUNICIPIOS = [].concat.apply([], REGIONAIS_MUNS).sort();

  // Campos com o mesmo nome na tabela e no <input>/<select> — cópia direta,
  // sem regra especial (essa fica com tipo_servico, município/escritório,
  // indígena/etnia, associação e georreferenciamento, tratados à parte).
  var CAMPOS_DIRETOS = [
    'data_vistoria', 'responsavel_tecnico', 'nome_beneficiario', 'cpf', 'data_nascimento',
    'estado_civil', 'sexo', 'possui_dap', 'telefone', 'endereco', 'nome_propriedade',
    'tipo_trator', 'num_identificacao_patrimonio', 'tipo_uso', 'observacao',
    'horas_maquina', 'quantidade_acudes', 'area_total_ha'
  ];

  function el(id) { return document.getElementById(id); }
  var esc = window.LANCAMENTO_CAMPOS.esc;
  function aviso(alvoId, classe, html) {
    el(alvoId).innerHTML = html ? '<p class="aviso ' + classe + '">' + html + '</p>' : '';
  }
  function idDaUrl() {
    var m = /[?&]id=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function sessaoSite() {
    try {
      var auth = window.ADMIN_AUTH;
      return (auth && auth.sessaoAtual && auth.sessaoAtual()) || null;
    } catch (e) { return null; }
  }

  var form = el('lancForm'), ajuda, id = idDaUrl(), registroOriginal = null;
  // "?modo=ver": o botão de visualizar da lista abre esta mesma página, com
  // o formulário todo travado e sem salvar.
  var modoVer = /[?&]modo=ver(&|$)/.test(location.search);
  var chaveMotivo = 'lanc_motivo_' + id;

  function somenteLeitura() {
    Array.prototype.forEach.call(form.elements, function (campo) { campo.disabled = true; });
    form.classList.add('lanc-somente-leitura');
    el('lancSalvar').hidden = true;
    el('lancMotivoSec').hidden = true;
    el('lancVoltar').innerHTML = '&larr; Voltar';
  }

  /** Responsável (root@root.com) edita direto. Os demais: a edição vira um
      pedido de aprovação, com motivo obrigatório (vindo do pop-up da lista,
      em sessionStorage, mas editável aqui) — e se já houver um pedido
      pendente para este lançamento, só dá pra ver. */
  function prepararModo(ehResponsavel, pendente, podeEditar) {
    var descPendente = pendente
      ? 'Este lançamento tem uma solicitação de <b>' + (pendente.tipo === 'excluir' ? 'exclusão' : 'edição') +
        '</b> aguardando aprovação' + (pendente.motivo ? ' (motivo: ' + esc(pendente.motivo) + ')' : '') + '.'
      : '';
    if (modoVer) {
      el('lancEditarTitulo').textContent = 'Visualizando lançamento';
      document.title = 'Ver lançamento';
      somenteLeitura();
      if (pendente) aviso('lancEditarAviso', 'carregando', descPendente);
      return;
    }
    if (ehResponsavel) return;
    if (!podeEditar) {
      el('lancEditarTitulo').textContent = 'Visualizando lançamento';
      somenteLeitura();
      aviso('lancEditarAviso', 'erro', 'Este lançamento é de outra pessoa — você só pode visualizar.');
      return;
    }
    if (pendente) {
      el('lancEditarTitulo').textContent = 'Visualizando lançamento';
      somenteLeitura();
      aviso('lancEditarAviso', 'erro', descPendente + ' Não é possível pedir outra alteração até ela ser resolvida.');
      return;
    }
    var campoMotivo = el('lancMotivoEdicao');
    el('lancMotivoSec').hidden = false;
    campoMotivo.required = true;
    try { campoMotivo.value = sessionStorage.getItem(chaveMotivo) || ''; } catch (e) { /* modo privado */ }
    el('lancSalvar').textContent = 'Enviar para aprovação';
    aviso('lancEditarAviso', 'carregando', 'As alterações que você salvar aqui ficam <b>pendentes</b> até a conta responsável aprovar.');
  }

  function preencherFormulario(dados) {
    CAMPOS_DIRETOS.forEach(function (campo) {
      if (!form.elements[campo]) return;
      var v = dados[campo] != null ? dados[campo] : '';
      // datas vêm ISO do banco; o campo mostra dd/mm/aaaa (js/data-br.js)
      form.elements[campo].value = campo.indexOf('data_') === 0 ? window.DATA_BR.isoParaBr(v) : v;
    });

    if (dados.tipo_servico) form.elements['tipo_servico'].value = dados.tipo_servico;
    ajuda.alternarSecoesServico();

    form.elements['municipio'].value = dados.municipio || '';
    ajuda.sincronizarEscritorioPorMunicipio();
    // sincronizar já cobre os 21 municípios de escritório único; em Rio
    // Branco (o único caso destravado) o valor salvo manda, seja ele qual
    // for dos dois.
    if (dados.escritorio_local) form.elements['escritorio_local'].value = dados.escritorio_local;

    form.elements['indigena'].value = dados.indigena === true ? 'Sim' : dados.indigena === false ? 'Não' : '';
    ajuda.alternarEtnia();
    if (form.elements['etnia']) form.elements['etnia'].value = dados.etnia || '';

    el('lancPossuiAssociacao').value = dados.associacao_cooperativa ? 'Sim' : (dados.associacao_cooperativa === '' ? 'Não' : '');
    ajuda.alternarAssociacao();
    if (form.elements['associacao_cooperativa']) form.elements['associacao_cooperativa'].value = dados.associacao_cooperativa || '';

    var ponto = (dados.pontos_geo && dados.pontos_geo[0]) || {};
    form.elements['geo_x'].value = ponto.x || '';
    form.elements['geo_y'].value = ponto.y || '';
    form.elements['geo_zona'].value = ponto.zona || '';

    ajuda.preencherDinamicos(dados);
  }

  function salvar(e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (!ajuda.validarServico()) return;

    var fd = new FormData(form);
    fd.set('acao', 'editar');
    // campos de data estão em dd/mm/aaaa (js/data-br.js); o banco guarda ISO
    ['data_vistoria', 'data_nascimento'].forEach(function (c) { fd.set(c, window.DATA_BR.brParaIso(form.elements[c].value)); });
    fd.set('id', id);
    fd.set('escritorio_local', form.elements['escritorio_local'].value);
    fd.set('culturas', JSON.stringify(ajuda.culturasAtuais()));
    fd.set('daes', JSON.stringify(ajuda.daesAtuais()));
    var geoX = form.elements['geo_x'].value, geoY = form.elements['geo_y'].value, geoZona = form.elements['geo_zona'].value;
    fd.set('pontos_geo', JSON.stringify((geoX || geoY) ? [{ ponto: 1, x: geoX, y: geoY, zona: geoZona }] : []));
    fd.set('maquinas', JSON.stringify(ajuda.marcadosDe(el('lancMaquinas'))));
    fd.set('implementos', JSON.stringify(ajuda.marcadosDe(el('lancImplementos'))));
    var sessao = sessaoSite();
    if (sessao && sessao.access_token) fd.set('token', sessao.access_token);
    fd.delete('geo_x'); fd.delete('geo_y'); fd.delete('geo_zona');

    var botao = el('lancSalvar');
    botao.disabled = true;
    aviso('lancSalvarStatus', 'carregando', 'Salvando…');
    window.LANCAMENTO_CAMPOS.enviar(fd)
      .then(function (res) {
        botao.disabled = false;
        if (!res.corpo.ok) { aviso('lancSalvarStatus', 'erro', esc(res.corpo.erro || 'Não foi possível salvar.')); return; }
        var nome = form.elements['nome_beneficiario'].value;
        if (res.corpo.pendente) {
          try { sessionStorage.removeItem(chaveMotivo); } catch (e) { /* modo privado */ }
          window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('solicitar', 'mecanizacao', 'Solicitou a edição do lançamento de mecanização de "' + nome + '"', { motivo: el('lancMotivoEdicao').value });
          botao.disabled = true;
          aviso('lancSalvarStatus', 'ok', 'Alterações enviadas para aprovação. Voltando para a lista…');
          setTimeout(function () { location.href = 'dashboard.html#lancamento'; }, 1400);
          return;
        }
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('editar', 'mecanizacao', 'Editou o lançamento de mecanização de "' + nome + '"');
        aviso('lancSalvarStatus', 'ok', 'Alterações salvas. Voltando para a lista…');
        setTimeout(function () { location.href = 'dashboard.html#lancamento'; }, 900);
      })
      .catch(function () {
        botao.disabled = false;
        aviso('lancSalvarStatus', 'erro', 'Sem conexão com o servidor. Tente novamente.');
      });
  }

  function carregar() {
    if (!id) {
      aviso('lancEditarAviso', 'erro', 'Nenhum lançamento informado na URL.');
      el('lancEditarContexto').textContent = 'Não foi possível abrir a edição.';
      return;
    }
    var sessao = sessaoSite();
    if (!sessao || !sessao.access_token) {
      aviso('lancEditarAviso', 'erro', 'Sua sessão do site expirou. Recarregue a página e entre de novo.');
      return;
    }
    var fd = new FormData();
    fd.append('acao', 'carregar');
    fd.append('token', sessao.access_token);
    fd.append('id', id);
    window.LANCAMENTO_CAMPOS.enviar(fd)
      .then(function (res) {
        if (!res.corpo.ok) {
          el('lancEditarContexto').textContent = 'Não foi possível abrir este lançamento.';
          aviso('lancEditarAviso', 'erro', esc(res.corpo.erro || 'Não foi possível carregar o lançamento.'));
          return;
        }
        registroOriginal = res.corpo.lancamento;
        el('lancEditarContexto').textContent = 'Ficha de ' + registroOriginal.nome_beneficiario +
          ' — salva em ' + window.DATA_BR.dataHoraBr(registroOriginal.criado_em) + '.';
        if (/^https?:\/\//.test(registroOriginal.formulario_url || '')) {
          var a = document.createElement('a');
          a.href = registroOriginal.formulario_url; a.target = '_blank'; a.rel = 'noopener';
          a.textContent = ' Abrir formulário digitalizado ↗';
          el('lancEditarContexto').appendChild(a);
        }
        preencherFormulario(registroOriginal);
        form.hidden = false;
        prepararModo(!!res.corpo.eh_responsavel, res.corpo.pendente, res.corpo.pode_editar !== false);
      })
      .catch(function () {
        el('lancEditarContexto').textContent = 'Não foi possível abrir a edição.';
        aviso('lancEditarAviso', 'erro', 'Sem conexão com o servidor.');
      });
  }

  /* mesmo botão/ícone de tema do painel (js/dashboard.js), só que sem os
     gráficos pra redesenhar depois de trocar. */
  function pintarBotaoTema() {
    var escuro = document.documentElement.getAttribute('data-tema') === 'escuro';
    el('temaBtn').innerHTML = (escuro
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>') +
      '<span>' + (escuro ? 'Tema claro' : 'Tema escuro') + '</span>';
  }
  function ligarTema() {
    pintarBotaoTema();
    el('temaBtn').addEventListener('click', function () {
      var novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
      document.documentElement.setAttribute('data-tema', novo);
      try { localStorage.setItem('seagri_tema', novo); } catch (e) { /* modo privado */ }
      pintarBotaoTema();
    });
  }

  function montar() {
    ligarTema();
    ajuda = window.LANCAMENTO_CAMPOS.criar(form);
    ajuda.montarMunicipios(MUNICIPIOS);
    ajuda.montarCaixasVazias();
    ajuda.preencherDinamicos();   // uma linha vazia de cultura/DAE até o carregamento chegar
    ajuda.ligarEventosComuns();
    form.addEventListener('submit', salvar);
    carregar();
  }

  montar();
})();
