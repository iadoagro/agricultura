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

  /* Nome de exibição de quem lançou. O nome definido pelo responsável na
     tela "Pessoas" (mecanizacao_lancadores) manda; sem ele, um palpite a
     partir do e-mail: "rosilene.cavalcante293@…" → "Rosilene Cavalcante". */
  var NOMES = {};   // e-mail → nome definido
  function nomeSugerido(email) {
    var usuario = String(email || '').split('@')[0].replace(/\d+/g, ' ').replace(/[._-]+/g, ' ').trim();
    return usuario.replace(/\S+/g, function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }) || String(email || '');
  }
  function nomeDeEmail(email) {
    if (!email) return '—';
    return NOMES[String(email).toLowerCase()] || nomeSugerido(email);
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
    // campos de data estão em dd/mm/aaaa (js/data-br.js); o banco guarda ISO
    ['data_vistoria', 'data_nascimento'].forEach(function (c) { fd.set(c, window.DATA_BR.brParaIso(form.elements[c].value)); });
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
    window.LANCAMENTO_CAMPOS.enviar(fd)
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
  var ICONES = {
    ver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    editar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
    excluir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
    cadeado: '<svg class="lanc-icone-cadeado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
    aprovar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    recusar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  };
  function botaoIcone(classe, icone, titulo, attrs) {
    return '<button class="btn lanc-btn-icone ' + classe + '" type="button" title="' + esc(titulo) + '" aria-label="' + esc(titulo) + '"' +
      (attrs || '') + '>' + icone + '</button>';
  }

  var ehResponsavel = false;   // vem do "listar" (vendo_de_todos): só root@root.com

  /* Pop-up de motivo (pedido de exclusão ou de edição) — quem não é o
     responsável não exclui nem edita direto: o pedido fica pendente até
     root@root.com aprovar (ver lancar_mecanizacao.php). Promise com o motivo
     digitado, ou null se cancelou. */
  function pedirMotivo(tipo, nome) {
    var dlg = el('lancMotivoDialogo'), campo = el('lancMotivoTexto');
    el('lancMotivoTitulo').textContent = tipo === 'excluir' ? 'Solicitar exclusão' : 'Solicitar edição';
    el('lancMotivoDescricao').innerHTML = (tipo === 'excluir'
      ? 'A exclusão do lançamento de <b>' + esc(nome) + '</b> só acontece depois de aprovada pela conta responsável.'
      : 'Você pode alterar o lançamento de <b>' + esc(nome) + '</b>, mas as alterações ficam pendentes até a conta responsável aprovar.');
    el('lancMotivoConfirmar').textContent = tipo === 'excluir' ? 'Enviar solicitação' : 'Continuar para edição';
    el('lancMotivoErro').hidden = true;
    campo.value = '';
    return new Promise(function (resolve) {
      function fechar(valor) {
        el('lancMotivoForm').onsubmit = null;
        el('lancMotivoCancelar').onclick = null;
        dlg.onclose = null;
        if (dlg.open) dlg.close();
        resolve(valor);
      }
      el('lancMotivoForm').onsubmit = function (e) {
        e.preventDefault();
        var motivo = campo.value.trim();
        if (!motivo) { el('lancMotivoErro').hidden = false; campo.focus(); return; }
        fechar(motivo);
      };
      el('lancMotivoCancelar').onclick = function () { fechar(null); };
      dlg.onclose = function () { fechar(null); };
      dlg.showModal();
      campo.focus();
    });
  }

  function enviarAcao(campos) {
    var sessao = sessaoSite();
    if (!sessao || !sessao.access_token) {
      aviso('lancListaAviso', 'erro', 'Sua sessão do site expirou. Recarregue a página e entre de novo.');
      return Promise.reject(null);
    }
    var fd = new FormData();
    fd.append('token', sessao.access_token);
    Object.keys(campos).forEach(function (c) { fd.append(c, campos[c]); });
    return window.LANCAMENTO_CAMPOS.enviar(fd);
  }

  /** Responsável: exclui direto (com confirmação). Demais: pop-up com motivo
      e o pedido fica pendente. */
  function excluir(id, nome) {
    var motivoPronto = ehResponsavel
      ? Promise.resolve(confirm('Excluir o lançamento de "' + nome + '"? Não tem como desfazer.') ? '' : null)
      : pedirMotivo('excluir', nome);
    motivoPronto.then(function (motivo) {
      if (motivo === null) return;
      aviso('lancListaAviso', 'carregando', ehResponsavel ? 'Excluindo…' : 'Enviando solicitação…');
      enviarAcao({ acao: 'excluir', id: id, motivo: motivo })
        .then(function (res) {
          if (!res.corpo.ok) { aviso('lancListaAviso', 'erro', esc(res.corpo.erro || 'Não foi possível excluir.')); return; }
          if (res.corpo.pendente) {
            window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('solicitar', 'mecanizacao', 'Solicitou a exclusão do lançamento de mecanização de "' + nome + '"', { motivo: motivo });
            aviso('lancListaAviso', 'ok', 'Solicitação de exclusão enviada. O lançamento continua na lista até a aprovação.');
          } else {
            window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('excluir', 'mecanizacao', 'Excluiu o lançamento de mecanização de "' + nome + '"');
            aviso('lancListaAviso', 'ok', 'Lançamento excluído.');
          }
          carregarRecentes();
        }, function (e) { if (e !== null) throw e; })
        .catch(function () { aviso('lancListaAviso', 'erro', 'Sem conexão com o servidor.'); });
    });
  }

  /** Responsável: vai direto para a edição. Demais: pop-up com motivo antes;
      o motivo segue para a página de edição, e salvar lá gera o pedido. */
  function editar(id, nome) {
    var destino = 'lancamento-editar.html?id=' + encodeURIComponent(id);
    if (ehResponsavel) { location.href = destino; return; }
    pedirMotivo('editar', nome).then(function (motivo) {
      if (motivo === null) return;
      try { sessionStorage.setItem('lanc_motivo_' + id, motivo); } catch (e) { /* a página de edição pede de novo */ }
      location.href = destino;
    });
  }

  /* ---------------------------------------------- solicitações (só responsável) */
  var ROTULOS = {
    tipo_servico: 'Serviço', data_vistoria: 'Data da vistoria', escritorio_local: 'Escritório local',
    responsavel_tecnico: 'Responsável técnico', ponto_controle: 'Ponto de controle',
    nome_beneficiario: 'Beneficiário', cpf: 'CPF', data_nascimento: 'Data de nascimento',
    estado_civil: 'Estado civil', sexo: 'Sexo', indigena: 'Indígena', etnia: 'Etnia', possui_dap: 'Possui DAP',
    associacao_cooperativa: 'Associação/Cooperativa', telefone: 'Telefone', endereco: 'Endereço',
    nome_propriedade: 'Propriedade', municipio: 'Município', culturas: 'Culturas', area_total_ha: 'Área total (ha)',
    horas_maquina: 'Horas-máquina', quantidade_acudes: 'Açudes', pontos_geo: 'Georreferenciamento',
    tipo_trator: 'Tipo de trator', maquinas: 'Máquinas', implementos: 'Implementos', tipo_uso: 'Tipo de uso',
    num_identificacao_patrimonio: 'Nº patrimônio', daes: 'DAEs', observacao: 'Observação'
  };
  function valorLegivel(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (v === true) return 'Sim';
    if (v === false) return 'Não';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBr(v);   // datas sempre dd/mm/aaaa
    if (Array.isArray(v)) {
      if (!v.length) return '—';
      return v.map(function (item) {
        return item && typeof item === 'object'
          ? Object.keys(item).map(function (k) { return item[k]; }).filter(function (x) { return x !== null && x !== ''; }).join(' / ')
          : String(item);
      }).join('; ');
    }
    return String(v);
  }
  function mesmoValor(a, b) {
    // Números e texto numérico ("3" vs 3, "3.00" vs 3) contam como iguais;
    // listas/objetos comparam pelo JSON.
    var norm = function (x) {
      if (x === '' || x === undefined) return null;
      if (x !== null && typeof x === 'object') return JSON.stringify(x, function (k, v) { return k && v !== null && typeof v !== 'object' ? norm(v) : v; });
      return x !== null && x !== true && x !== false && isFinite(Number(x)) ? String(Number(x)) : x;
    };
    return norm(a) === norm(b);
  }

  function verAlteracoes(sol) {
    var atual = sol.lancamento || {}, novo = sol.dados || {};
    var linhas = Object.keys(ROTULOS).filter(function (c) { return c in novo && !mesmoValor(atual[c], novo[c]); });
    el('lancDiffTitulo').textContent = 'Alterações propostas — ' + (sol.nome_beneficiario || '');
    el('lancDiffCorpo').innerHTML = '<p class="nota"><b>Motivo:</b> ' + esc(sol.motivo) + '</p>' + (linhas.length
      ? '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr><th>Campo</th><th>Atual</th><th>Proposto</th></tr></thead><tbody>' +
        linhas.map(function (c) {
          return '<tr><td>' + esc(ROTULOS[c]) + '</td><td class="lanc-diff-antes">' + esc(valorLegivel(atual[c])) + '</td>' +
            '<td class="lanc-diff-depois">' + esc(valorLegivel(novo[c])) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="nota">Nenhum campo diferente do lançamento atual.</p>');
    el('lancDiffDialogo').showModal();
  }

  function resolver(sol, decisao) {
    var nome = sol.nome_beneficiario || '';
    var pergunta = decisao === 'aprovar'
      ? (sol.tipo === 'excluir' ? 'Aprovar e EXCLUIR o lançamento de "' + nome + '"? Não tem como desfazer.' : 'Aprovar e aplicar as alterações no lançamento de "' + nome + '"?')
      : 'Recusar a solicitação para o lançamento de "' + nome + '"?';
    if (!confirm(pergunta)) return;
    aviso('lancSolicitacoesAviso', 'carregando', 'Registrando decisão…');
    enviarAcao({ acao: 'resolver', id: sol.id, decisao: decisao })
      .then(function (res) {
        if (!res.corpo.ok) { aviso('lancSolicitacoesAviso', 'erro', esc(res.corpo.erro || 'Não foi possível registrar a decisão.')); return; }
        var oque = sol.tipo === 'excluir' ? 'exclusão' : 'edição';
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento(decisao === 'aprovar' ? 'aprovar' : 'recusar', 'mecanizacao',
          (decisao === 'aprovar' ? 'Aprovou' : 'Recusou') + ' a ' + oque + ' do lançamento de mecanização de "' + nome + '"',
          { solicitado_por: sol.solicitado_por_email, motivo: sol.motivo });
        aviso('lancSolicitacoesAviso', 'ok', 'Solicitação ' + (decisao === 'aprovar' ? 'aprovada' : 'recusada') + '.');
        carregarSolicitacoes();
        carregarRecentes();
      }, function (e) { if (e !== null) throw e; })
      .catch(function () { aviso('lancSolicitacoesAviso', 'erro', 'Sem conexão com o servidor.'); });
  }

  function carregarSolicitacoes() {
    var sec = el('lancSolicitacoesSec');
    if (!ehResponsavel) { sec.hidden = true; return; }
    enviarAcao({ acao: 'solicitacoes' })
      .then(function (res) {
        var lista = (res.corpo.ok && res.corpo.solicitacoes) || [];
        sec.hidden = !lista.length && res.corpo.ok;
        if (!res.corpo.ok) { el('lancSolicitacoes').innerHTML = '<p class="nota">' + esc(res.corpo.erro || 'Não foi possível carregar as solicitações.') + '</p>'; return; }
        el('lancSolicitacoesQtd').textContent = lista.length;
        el('lancSolicitacoes').innerHTML = '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr>' +
          '<th>Pedido em</th><th>Tipo</th><th>Beneficiário</th><th>Solicitado por</th><th>Motivo</th><th>Ações</th>' +
          '</tr></thead><tbody>' + lista.map(function (s, i) {
            return '<tr><td>' + esc(window.DATA_BR.dataHoraBr(s.criado_em)) + '</td>' +
              '<td><span class="lanc-selo ' + (s.tipo === 'excluir' ? 'lanc-selo-excluir' : 'lanc-selo-editar') + '">' + (s.tipo === 'excluir' ? 'Exclusão' : 'Edição') + '</span></td>' +
              '<td>' + esc(s.nome_beneficiario || '—') + '</td>' +
              '<td>' + esc(nomeDeEmail(s.solicitado_por_email)) + '</td>' +
              '<td class="lanc-motivo">' + esc(s.motivo) + '</td>' +
              '<td class="lanc-tabela-acoes">' +
                (s.lancamento_id ? '<a class="btn lanc-btn-icone" href="lancamento-editar.html?modo=ver&id=' + encodeURIComponent(s.lancamento_id) + '" title="Ver lançamento" aria-label="Ver lançamento">' + ICONES.ver + '</a>' : '') +
                (s.tipo === 'editar' ? botaoIcone('lanc-sol-diff', ICONES.editar, 'Ver alterações propostas', ' data-i="' + i + '"') : '') +
                botaoIcone('lanc-btn-aprovar lanc-sol-aprovar', ICONES.aprovar, 'Aprovar', ' data-i="' + i + '"') +
                botaoIcone('btn-excluir lanc-sol-recusar', ICONES.recusar, 'Recusar', ' data-i="' + i + '"') +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
        [['.lanc-sol-diff', function (s) { verAlteracoes(s); }],
         ['.lanc-sol-aprovar', function (s) { resolver(s, 'aprovar'); }],
         ['.lanc-sol-recusar', function (s) { resolver(s, 'recusar'); }]].forEach(function (par) {
          Array.prototype.forEach.call(el('lancSolicitacoes').querySelectorAll(par[0]), function (b) {
            b.addEventListener('click', function () { par[1](lista[+b.getAttribute('data-i')]); });
          });
        });
      }, function () {})
      .catch(function () { /* painel de apoio: falha aqui não impede o resto */ });
  }

  /* ------------------------------------------------- filtros e paginação */
  // A lista inclui as fichas importadas da planilha (milhares de linhas):
  // o servidor filtra e devolve uma página por vez, com o total.
  var POR_PAGINA = 20;
  var paginaAtual = 1, totalLinhas = 0, pedidoLista = 0, filtrosProntos = false;
  var CAMPOS_FILTRO = ['f_busca', 'f_pessoa', 'f_ano', 'f_tipo_servico', 'f_municipio', 'f_escritorio'];
  var lancadores = [], meusEmails = [], usuariosSistema = [];

  /* Pessoas que já lançaram (e-mail → nome) — alimenta o filtro "Lançado
     por", os nomes da tabela e, para o responsável, a tela "Pessoas". */
  function carregarLancadores() {
    return enviarAcao({ acao: 'lancadores' })
      .then(function (res) {
        if (!res.corpo.ok) return;
        lancadores = res.corpo.lancadores || [];
        meusEmails = res.corpo.meus_emails || meusEmails;
        usuariosSistema = res.corpo.usuarios || [];
        NOMES = {};
        lancadores.forEach(function (l) { if (l.nome) NOMES[l.email] = l.nome; });
        montarFiltroPessoa();
      }, function () {})
      .catch(function () { /* sem a lista, o filtro fica só com "Meus" e "Todas" */ });
  }

  /* Opções do "Lançado por": vazio = os meus (padrão), "todos", e uma
     opção por pessoa — e-mails com o mesmo nome viram uma opção só. As
     pessoas vêm de quem lançou mais recentemente pra quem lançou há mais
     tempo (o campo tem busca — js/select-busca.js). */
  function montarFiltroPessoa() {
    var sel = el('lancFiltroPessoa'), atual = sel.value;
    var porNome = {};
    lancadores.forEach(function (l) {
      var nome = nomeDeEmail(l.email);
      var p = porNome[nome] = porNome[nome] || { emails: [], total: 0, ultimo: '' };
      p.emails.push(l.email);
      p.total += l.total || 0;
      if ((l.ultimo || '') > p.ultimo) p.ultimo = l.ultimo;
    });
    sel.innerHTML = '<option value="">Meus lançamentos</option><option value="todos">Todas as pessoas</option>' +
      Object.keys(porNome).sort(function (a, b) {
        var ua = new Date(porNome[a].ultimo || 0).getTime(), ub = new Date(porNome[b].ultimo || 0).getTime();
        return ub - ua || a.localeCompare(b, 'pt-BR');
      }).map(function (nome) {
        return '<option value="' + esc(porNome[nome].emails.join(',')) + '">' + esc(nome) + ' (' + porNome[nome].total.toLocaleString('pt-BR') + ')</option>';
      }).join('');
    sel.value = atual;
    if (sel.value !== atual) sel.value = '';
  }

  /* ------------------------------------------ "Pessoas" (só responsável) */
  /* Cada e-mail que já lançou, com o nome de exibição e o login do sistema
     ligado — ligar um e-mail da planilha ao login faz a pessoa ver essas
     fichas em "Meus lançamentos" (e poder pedir edição/exclusão delas). */
  var pessoasMarcadas = {};   // e-mail → true (seleção pra dar o mesmo nome a vários)

  // Chave pra deixar lado a lado os e-mails parecidos ("Silvadenoronhagenildo",
  // "Siilvadenoronhagenildo"…): o nome exibido, só letras, sem acento.
  function chaveParecida(email) {
    return nomeDeEmail(email).normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
  }

  function opcoesUsuario(atual, comManter) {
    return (comManter ? '<option value="__manter__">(manter o login)</option>' : '') +
      '<option value="">— nenhum —</option>' + usuariosSistema.slice().sort().map(function (u) {
        return '<option value="' + esc(u) + '"' + (u === atual ? ' selected' : '') + '>' + esc(u.replace(/@sistema\.local$/, '')) + '</option>';
      }).join('');
  }

  function desenharPessoas() {
    var termo = el('lancPessoasBusca').value.trim().toLowerCase();
    var soSemNome = el('lancPessoasSemNome').checked;
    var linhas = lancadores.filter(function (l) {
      if (soSemNome && l.nome) return false;
      return !termo || l.email.indexOf(termo) >= 0 || nomeDeEmail(l.email).toLowerCase().indexOf(termo) >= 0 ||
        String(l.tecnico || '').toLowerCase().indexOf(termo) >= 0;
    }).sort(function (a, b) { return chaveParecida(a.email).localeCompare(chaveParecida(b.email)) || a.email.localeCompare(b.email); });

    // nomes já digitados (e técnicos) viram sugestão — escolher um deles junta
    // o e-mail na mesma pessoa, escrito exatamente igual
    var nomes = {};
    lancadores.forEach(function (l) { if (l.nome) nomes[l.nome] = 1; if (l.tecnico) nomes[l.tecnico] = 1; });
    el('lancPessoasNomes').innerHTML = Object.keys(nomes).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); })
      .map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    el('lancPessoasLoteUsuario').innerHTML = opcoesUsuario('__manter__', true);

    el('lancPessoasCorpo').innerHTML = !linhas.length ? '<p class="nota">Nenhuma pessoa encontrada.</p>' :
      '<div class="tabela-scroll"><table class="lanc-tabela lanc-pessoas"><thead><tr>' +
      '<th><input type="checkbox" id="lancPessoasTodos" title="Marcar todos da lista" aria-label="Marcar todos da lista"></th>' +
      '<th>E-mail usado no lançamento</th><th class="num">Qtd.</th><th>Técnico mais frequente</th><th>Nome de exibição</th><th>Login do sistema</th><th></th>' +
      '</tr></thead><tbody>' + linhas.map(function (l) {
        var marcado = !!pessoasMarcadas[l.email];
        return '<tr data-email="' + esc(l.email) + '"' + (marcado ? ' class="lanc-pessoa-marcada"' : '') + '>' +
          '<td><input type="checkbox" class="lanc-pessoa-marca" aria-label="Selecionar ' + esc(l.email) + '"' + (marcado ? ' checked' : '') + '></td>' +
          '<td class="lanc-pessoa-email">' + esc(l.email) + '</td>' +
          '<td class="num">' + (l.total || 0).toLocaleString('pt-BR') + '</td>' +
          '<td>' + (l.tecnico ? '<button type="button" class="lanc-pessoa-tecnico" title="Usar este nome">' + esc(l.tecnico) + '</button>' : '—') + '</td>' +
          '<td><input type="text" class="lanc-pessoa-nome" list="lancPessoasNomes" maxlength="120" value="' + esc(l.nome || '') + '" placeholder="' + esc(nomeSugerido(l.email)) + '"></td>' +
          '<td><select class="lanc-pessoa-usuario">' + opcoesUsuario(l.usuario_email || '') + '</select></td>' +
          '<td>' + botaoIcone('lanc-btn-aprovar lanc-pessoa-salvar', ICONES.aprovar, 'Salvar') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    atualizarContagemMarcadas();
  }

  function atualizarContagemMarcadas() {
    var n = Object.keys(pessoasMarcadas).length;
    el('lancPessoasQtd').textContent = n === 1 ? '1 selecionado' : n + ' selecionados';
    el('lancPessoasLoteAplicar').disabled = !n;
  }

  /** Grava nome/login de um e-mail; usuario === undefined mantém o login atual.
      O nome vai exatamente como foi digitado (só sem espaços nas pontas). */
  function gravarLancador(email, nome, usuario) {
    var atual = lancadores.filter(function (l) { return l.email === email; })[0] || {};
    if (usuario === undefined) usuario = atual.usuario_email || '';
    return enviarAcao({ acao: 'salvar_lancador', email: email, nome: nome, usuario_email: usuario })
      .then(function (res) {
        if (!res.corpo.ok) throw new Error(res.corpo.erro || 'Não foi possível salvar.');
        atual.nome = nome || null; atual.usuario_email = usuario || null;
        if (nome) NOMES[email] = nome; else delete NOMES[email];
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('editar', 'mecanizacao', 'Definiu o nome de "' + email + '" como "' + (nome || nomeSugerido(email)) + '"', { usuario_email: usuario });
      });
  }

  function depoisDeSalvarPessoas(msg) {
    aviso('lancPessoasAviso', 'ok', msg);
    montarFiltroPessoa();
    desenharPessoas();
    carregarRecentes();
  }

  function salvarPessoa(tr) {
    var email = tr.getAttribute('data-email');
    var nome = tr.querySelector('.lanc-pessoa-nome').value.trim();
    var usuario = tr.querySelector('.lanc-pessoa-usuario').value;
    aviso('lancPessoasAviso', 'carregando', 'Salvando…');
    gravarLancador(email, nome, usuario)
      .then(function () {
        depoisDeSalvarPessoas('Salvo: <b>' + esc(email) + '</b> → ' + esc(nome || nomeSugerido(email)) + (usuario ? ' (login ' + esc(usuario) + ')' : '') + '.');
      })
      .catch(function (e) { aviso('lancPessoasAviso', 'erro', esc(e && e.message ? e.message : 'Sem conexão com o servidor.')); });
  }

  /** Mesmo nome (e, se escolhido, mesmo login) para todos os marcados. */
  function aplicarAosMarcados() {
    var emails = Object.keys(pessoasMarcadas);
    var nome = el('lancPessoasLoteNome').value.trim();
    var usuarioSel = el('lancPessoasLoteUsuario').value;
    var usuario = usuarioSel === '__manter__' ? undefined : usuarioSel;
    if (!emails.length) return;
    if (!nome) { aviso('lancPessoasAviso', 'erro', 'Digite o nome para os selecionados.'); el('lancPessoasLoteNome').focus(); return; }
    aviso('lancPessoasAviso', 'carregando', 'Salvando ' + emails.length + ' e-mail(s)…');
    el('lancPessoasLoteAplicar').disabled = true;
    var feitos = 0;
    emails.reduce(function (p, email) {
      return p.then(function () { return gravarLancador(email, nome, usuario).then(function () { feitos++; }); });
    }, Promise.resolve())
      .then(function () {
        pessoasMarcadas = {};
        el('lancPessoasLoteNome').value = '';
        depoisDeSalvarPessoas(feitos + ' e-mail(s) agora aparecem como <b>' + esc(nome) + '</b>.');
      })
      .catch(function (e) {
        aviso('lancPessoasAviso', 'erro', feitos + ' salvo(s); parou com erro: ' + esc(e && e.message ? e.message : 'sem conexão com o servidor.'));
        atualizarContagemMarcadas();
      });
  }

  function abrirPessoas() {
    aviso('lancPessoasAviso', '', '');
    el('lancPessoasBusca').value = '';
    pessoasMarcadas = {};
    desenharPessoas();
    el('lancPessoasDialogo').showModal();
    carregarLancadores().then(desenharPessoas);   // atualiza contagens
  }

  function marcarPessoa(caixa, marcado) {
    var tr = caixa.closest('tr'), email = tr.getAttribute('data-email');
    caixa.checked = marcado;
    tr.classList.toggle('lanc-pessoa-marcada', marcado);
    if (marcado) pessoasMarcadas[email] = true; else delete pessoasMarcadas[email];
  }

  function ligarPessoas() {
    el('lancPessoasBtn').addEventListener('click', abrirPessoas);
    el('lancPessoasFechar').addEventListener('click', function () { el('lancPessoasDialogo').close(); });
    el('lancPessoasBusca').addEventListener('input', desenharPessoas);
    el('lancPessoasSemNome').addEventListener('change', desenharPessoas);
    el('lancPessoasLoteAplicar').addEventListener('click', aplicarAosMarcados);
    el('lancPessoasLoteNome').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicarAosMarcados(); } });
    var corpo = el('lancPessoasCorpo');
    corpo.addEventListener('click', function (e) {
      var b = e.target.closest('.lanc-pessoa-salvar');
      if (b) { salvarPessoa(b.closest('tr')); return; }
      var t = e.target.closest('.lanc-pessoa-tecnico');
      if (t) {
        var campo = t.closest('tr').querySelector('.lanc-pessoa-nome');
        campo.value = t.textContent;
        campo.focus();
      }
    });
    corpo.addEventListener('change', function (e) {
      if (e.target.id === 'lancPessoasTodos') {
        Array.prototype.forEach.call(corpo.querySelectorAll('.lanc-pessoa-marca'), function (c) { marcarPessoa(c, e.target.checked); });
        atualizarContagemMarcadas();
      } else if (e.target.classList.contains('lanc-pessoa-marca')) {
        marcarPessoa(e.target, e.target.checked);
        atualizarContagemMarcadas();
      }
    });
    corpo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList.contains('lanc-pessoa-nome')) { e.preventDefault(); salvarPessoa(e.target.closest('tr')); }
    });
  }

  /** "Lançado por" ao abrir (e ao limpar os filtros): o responsável vê todo
      mundo de cara; os demais, só os próprios lançamentos. */
  function pessoaPadrao() {
    var sessao = sessaoSite();
    var email = sessao && sessao.user && sessao.user.email;
    return String(email || '').toLowerCase() === 'root@root.com' ? 'todos' : '';
  }

  function montarFiltros(municipios) {
    var anoSel = el('lancFiltroAno');
    if (!filtrosProntos) {
      var esteAno = new Date().getFullYear();
      var anos = [];
      for (var a = esteAno; a >= 2023; a--) anos.push(a);
      // padrão: todos os anos, do mais recente pro mais antigo (a ordem vem do servidor)
      anoSel.innerHTML = '<option value="">Todos os anos</option>' + anos.map(function (a) { return '<option>' + a + '</option>'; }).join('');
      el('lancFiltroPessoa').value = pessoaPadrao();
      var espera;
      el('lancFiltros').addEventListener('input', function (e) {
        clearTimeout(espera);
        // texto livre espera a pessoa parar de digitar; selects aplicam na hora
        espera = setTimeout(function () { paginaAtual = 1; carregarRecentes(); }, e.target.tagName === 'INPUT' ? 400 : 0);
      });
      el('lancFiltrosLimpar').addEventListener('click', function () {
        el('lancFiltros').reset();
        el('lancFiltroPessoa').value = pessoaPadrao();
        paginaAtual = 1;
        carregarRecentes();
      });
      el('lancPaginacao').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-pagina]');
        if (!b || b.disabled) return;
        paginaAtual = +b.getAttribute('data-pagina');
        carregarRecentes();
        el('lancFiltros').scrollIntoView({ block: 'nearest' });
      });
      filtrosProntos = true;
    }
    var munSel = el('lancFiltroMunicipio'), escSel = el('lancFiltroEscritorio');
    var munAtual = munSel.value, escAtual = escSel.value;
    munSel.innerHTML = '<option value="">Todos os municípios</option>' +
      municipios.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('');
    var escritorios = municipios.map(function (m) { return 'Escritório Local de ' + m; })
      .concat('Escritório Local da Transacreana').sort();
    escSel.innerHTML = '<option value="">Todos os escritórios</option>' +
      escritorios.map(function (e) { return '<option value="' + esc(e) + '">' + esc(e.replace(/^Escritório Local d[aeo] /, '')) + '</option>'; }).join('');
    munSel.value = munAtual; escSel.value = escAtual;
  }

  function paginacaoHtml() {
    var paginas = Math.max(1, Math.ceil(totalLinhas / POR_PAGINA));
    if (totalLinhas <= POR_PAGINA) return '';
    var ini = (paginaAtual - 1) * POR_PAGINA + 1, fim = Math.min(totalLinhas, paginaAtual * POR_PAGINA);
    function bt(p, rotulo, titulo, atual) {
      return '<button type="button" class="btn' + (atual ? ' lanc-pag-atual' : '') + '" data-pagina="' + p + '"' +
        (p < 1 || p > paginas || atual ? ' disabled' : '') + ' title="' + titulo + '"' + (atual ? ' aria-current="page"' : '') + '>' + rotulo + '</button>';
    }
    // até 5 números em volta da página atual
    var de = Math.max(1, Math.min(paginaAtual - 2, paginas - 4)), ate = Math.min(paginas, de + 4);
    var nums = '';
    for (var p = de; p <= ate; p++) nums += bt(p, p, 'Página ' + p, p === paginaAtual);
    return '<span class="lanc-pag-info">' + ini.toLocaleString('pt-BR') + '–' + fim.toLocaleString('pt-BR') + ' de ' + totalLinhas.toLocaleString('pt-BR') + '</span>' +
      '<span class="lanc-pag-botoes">' +
      bt(1, '«', 'Primeira página') + bt(paginaAtual - 1, '‹', 'Página anterior') + nums +
      bt(paginaAtual + 1, '›', 'Próxima página') + bt(paginas, '»', 'Última página') + '</span>';
  }

  function dataBr(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
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
    fd.append('limite', String(POR_PAGINA));
    fd.append('pagina', String(paginaAtual));
    var filtros = el('lancFiltros').elements;
    CAMPOS_FILTRO.forEach(function (c) { if (filtros[c] && filtros[c].value) fd.append(c, filtros[c].value); });
    var meuPedido = ++pedidoLista;   // resposta de um filtro antigo não sobrescreve a do atual
    window.LANCAMENTO_CAMPOS.enviar(fd)
      .then(function (res) {
        if (meuPedido !== pedidoLista) return;
        if (res.status === 401) { el('lancRecentes').innerHTML = '<p class="nota">Sua sessão do site expirou. Recarregue a página e entre de novo.</p>'; return; }
        if (!res.corpo.ok) { el('lancRecentes').innerHTML = '<p class="nota">Não foi possível carregar os lançamentos.</p>'; return; }
        var linhas = res.corpo.lancamentos || [];
        var pendencias = res.corpo.pendencias || {};
        totalLinhas = +res.corpo.total || linhas.length;
        if (!linhas.length && totalLinhas && paginaAtual > 1) {
          paginaAtual = Math.ceil(totalLinhas / POR_PAGINA);   // página além do fim: vai pra última
          carregarRecentes();
          return;
        }
        el('lancPaginacao').innerHTML = paginacaoHtml();
        var eraResponsavel = ehResponsavel;
        ehResponsavel = !!res.corpo.vendo_de_todos;   // só root@root.com
        meusEmails = res.corpo.meus_emails || meusEmails;
        el('lancPessoasBtn').hidden = !ehResponsavel;
        if (!eraResponsavel) carregarSolicitacoes();   // primeira carga; depois, só quando resolve um pedido
        var pessoaSel = el('lancFiltroPessoa');
        var nota = '<p class="nota">' + (pessoaSel.value === ''
          ? 'Mostrando só os seus lançamentos. Para ver os de outras pessoas, use o filtro “Lançado por”.'
          : 'Mostrando lançamentos de: <b>' + esc(pessoaSel.value === 'todos' ? 'todas as pessoas' : pessoaSel.options[pessoaSel.selectedIndex].text.replace(/ \([\d.]+\)$/, '')) + '</b>.') + '</p>';
        if (!linhas.length) { el('lancRecentes').innerHTML = nota + '<p class="nota">Nenhum lançamento encontrado com esses filtros.</p>'; return; }
        el('lancRecentes').innerHTML = nota + '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr>' +
          '<th>Salvo em</th><th>Lançado por</th><th>Serviço</th><th>Beneficiário</th><th>Município</th><th>Escritório</th>' +
          '<th>Vistoria</th><th class="num">ha</th><th class="num">h</th><th class="num">Açudes</th><th>Ações</th>' +
          '</tr></thead><tbody>' + linhas.map(function (r) {
            var pend = pendencias[r.id];
            var selo = pend
              ? ' <span class="lanc-selo ' + (pend === 'excluir' ? 'lanc-selo-excluir' : 'lanc-selo-editar') + '">' +
                  (pend === 'excluir' ? 'Exclusão pendente' : 'Edição pendente') + '</span>'
              : '';
            var dataAttrs = ' data-id="' + esc(r.id) + '" data-nome="' + esc(r.nome_beneficiario) + '"';
            // Com pedido pendente, quem não é o responsável não pede de novo
            // (o servidor também barra) — só visualiza.
            var travado = pend && !ehResponsavel ? ' disabled' : '';
            // Lançamento de outra pessoa: só visualizar (o servidor também barra).
            var meu = ehResponsavel || meusEmails.indexOf(String(r.criado_por_email || '').toLowerCase()) >= 0;
            return '<tr><td>' + esc(window.DATA_BR.dataHoraBr(r.criado_em)) + '</td>' +
              '<td title="' + esc(r.criado_por_email || '') + '">' + esc(nomeDeEmail(r.criado_por_email)) + '</td>' +
              '<td>' + esc(r.tipo_servico || '—') + '</td><td>' + esc(r.nome_beneficiario) + selo + '</td>' +
              '<td>' + esc(r.municipio || '—') + '</td><td>' + esc(r.escritorio_local || '—') + '</td>' +
              '<td>' + esc(dataBr(r.data_vistoria)) + '</td>' +
              '<td class="num">' + esc(r.area_total_ha || '') + '</td>' +
              '<td class="num">' + esc(r.horas_maquina || '') + '</td>' +
              '<td class="num">' + esc(r.quantidade_acudes || '') + '</td>' +
              '<td class="lanc-tabela-acoes">' +
                '<a class="btn lanc-btn-icone" href="lancamento-editar.html?modo=ver&id=' + encodeURIComponent(r.id) + '" title="Ver lançamento" aria-label="Ver lançamento">' + ICONES.ver + '</a>' +
                (meu
                  ? botaoIcone('lanc-editar', ICONES.editar + (ehResponsavel ? '' : ICONES.cadeado),
                      ehResponsavel ? 'Editar' : (pend ? 'Aguardando aprovação' : 'Editar (precisa de aprovação)'), dataAttrs + travado) +
                    botaoIcone('btn-excluir lanc-excluir' + (ehResponsavel ? '' : ' lanc-bloqueado'), ICONES.excluir + (ehResponsavel ? '' : ICONES.cadeado),
                      ehResponsavel ? 'Excluir' : (pend ? 'Aguardando aprovação' : 'Solicitar exclusão'), dataAttrs + travado)
                  : '') +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
        Array.prototype.forEach.call(el('lancRecentes').querySelectorAll('.lanc-excluir'), function (b) {
          b.addEventListener('click', function () { excluir(b.getAttribute('data-id'), b.getAttribute('data-nome')); });
        });
        Array.prototype.forEach.call(el('lancRecentes').querySelectorAll('.lanc-editar'), function (b) {
          b.addEventListener('click', function () { editar(b.getAttribute('data-id'), b.getAttribute('data-nome')); });
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
    el('lancDiffFechar').addEventListener('click', function () { el('lancDiffDialogo').close(); });
    ligarPessoas();
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
    montarFiltros(municipios);
    ajuda.sincronizarEscritorioPorMunicipio();
    // Reabertura (dashboard.js chama isto de novo sempre que a aba precisa
    // redesenhar, inclusive depois do "resize" que o teclado do celular
    // dispara ao focar um campo) não deve arrancar quem está no meio de um
    // lançamento de volta para a lista — só a primeira abertura da aba faz
    // isso, e só ela.
    // nomes das pessoas antes da primeira lista, pra tabela já sair com eles
    if (primeiraVez) carregarLancadores().then(mostrarLista);
  }

  window.LANCAMENTO_MECANIZACAO = { abrir: abrir };
})();
