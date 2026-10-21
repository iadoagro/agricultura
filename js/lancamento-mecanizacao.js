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
  // Máquinas e implementos usados também se repetem no lote (mesmo trator, mesmo
  // dia): vão junto, em loteCaixas, e se desmarcam com um clique quando mudam.
  var CAMPOS_MANTIDOS_APOS_SALVAR = ['tipo_servico', 'data_vistoria', 'escritorio_local', 'responsavel_tecnico', 'municipio',
    'tipo_uso', 'num_identificacao_patrimonio'];

  var form, ajuda, iniciado = false;
  var loteAnterior = null;  // {tipo_servico, data_vistoria, escritorio_local, responsavel_tecnico, municipio, ...} do último salvo
  var loteCaixas = null;    // {maquinas, implementos} marcados no último salvo

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
    form.removeAttribute('data-simulacao');   // sai do modo simulação do root
    var sair = el('lancSimSair'); if (sair) sair.hidden = true;
    form.reset();
    ajuda.marcarHorarioInsercao();   // form.reset() também limpa este campo, sem "name"
    if (seedLote && loteAnterior) {
      Object.keys(loteAnterior).forEach(function (c) { if (loteAnterior[c]) form.elements[c].value = loteAnterior[c]; });
    }
    ajuda.sincronizarEscritorioPorMunicipio();   // trava/destrava conforme o município (seedado ou vazio)
    ajuda.preencherDinamicos(seedLote && loteCaixas ? loteCaixas : undefined);
    ajuda.alternarSecoesServico();
    ajuda.alternarEtnia();
    ajuda.alternarAssociacao();
    ajuda.atualizarBotoesAdicionar();
  }

  var ux = null;   // js/lancamento-ux.js: progresso, atalhos e "salvar e lançar outro"

  function salvar(e) {
    e.preventDefault();
    if (form.getAttribute('data-simulacao') === '1') {
      aviso('lancSalvarStatus', 'ok', 'Simulação: nada foi gravado. Use "Sair da simulação" para voltar ao formulário vazio.');
      return;
    }
    if (!form.reportValidity()) return;
    if (!ajuda.validarServico()) return;

    // PDF opcional: 1 arquivo, só PDF, até 3 MB (o servidor confere de novo)
    var pdfInput = el('lancPdf');
    var pdf = pdfInput && pdfInput.files && pdfInput.files[0];
    if (pdf) {
      if (!/\.pdf$/i.test(pdf.name) || (pdf.type && pdf.type !== 'application/pdf')) {
        aviso('lancSalvarStatus', 'erro', 'Anexe somente arquivo PDF.'); return;
      }
      if (pdf.size > 3 * 1024 * 1024) {
        aviso('lancSalvarStatus', 'erro', 'O PDF deve ter no máximo 3 MB.'); return;
      }
    }

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
    fd.set('token', (sessao && sessao.access_token) || '');
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
        if (!res.corpo.ok) {
          aviso('lancSalvarStatus', 'erro', esc(res.corpo.erro || 'Não foi possível salvar.'));
          // a pendência passou a valer com o formulário aberto (virou o dia): pede o código e deixa salvar de novo
          if (res.corpo.exige_codigo) {
            pedirCodigo(res.corpo).then(function (liberou) { if (liberou) aviso('lancSalvarStatus', 'ok', 'Código aceito. Clique em Salvar de novo.'); });
            return;
          }
          // fica no log: "Enviou o formulário" sozinho não diz se gravou
          window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('erro', 'mecanizacao', 'Não conseguiu salvar o lançamento de mecanização (HTTP ' + res.status + '): ' + (res.corpo.erro || 'sem detalhe'));
          return;
        }
        loteAnterior = {};
        CAMPOS_MANTIDOS_APOS_SALVAR.forEach(function (c) { loteAnterior[c] = form.elements[c].value; });
        loteCaixas = { maquinas: ajuda.marcadosDe(el('lancMaquinas')), implementos: ajuda.marcadosDe(el('lancImplementos')) };
        var nome = form.elements['nome_beneficiario'].value;
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('criar', 'mecanizacao', 'Cadastrou o lançamento de mecanização de "' + nome + '"');
        perguntarOutro(res.corpo.registro || {}, nome);
      })
      .catch(function () {
        botao.disabled = false;
        aviso('lancSalvarStatus', 'erro', 'Sem conexão com o servidor. Os campos foram mantidos — tente novamente.');
      });
  }

  /* ----------------------------------------------- simulação (só root) */
  /** Mostra TODAS as seções e campos do formulário, em branco (Mecanização e Açudagem juntas, implementos, georreferenciamento,
      DAE, observações...), sem bloqueio entre seções e sem gravar. Serve para o root ver o que existe sem preencher nada. */
  function verTudo() {
    limparFormulario(false);
    form.setAttribute('data-simulacao', '1');
    ['lancSecMecanizacao', 'lancSecAcudagem', 'lancFieldsetImplementos'].forEach(function (id) { if (el(id)) el(id).hidden = false; });
    Array.prototype.forEach.call(form.querySelectorAll('.lanc-sec-servico'), function (sec) { sec.hidden = false; });
    el('lancSimSair').hidden = false;
    aviso('lancSalvarStatus', 'carregando', 'Visualização de todos os campos (em branco): nada será gravado.');
    if (ux) ux.atualizar();
    window.scrollTo({ top: 0 });
  }

  /** Preenche um lançamento de exemplo (Mecanização ou Açudagem), libera todas as seções e trava o salvar:
      serve para o root ver o formulário completo, como se alguém estivesse lançando, sem preencher nada. */
  function simular(tipo) {
    limparFormulario(false);
    form.setAttribute('data-simulacao', '1');
    var hoje = new Date(), iso = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);
    function definir(c, v) {
      if (!c) return;
      c.value = v;
      c.dispatchEvent(new Event('input', { bubbles: true }));
      c.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var campo = function (n) { return form.elements[n]; };
    try {
      var radio = form.querySelector('input[name="tipo_servico"][value="' + tipo + '"]');
      radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true }));
      definir(campo('data_vistoria'), window.DATA_BR.isoParaBr(iso));
      definir(campo('municipio'), 'Rio Branco');
      ajuda.garantirTecnico('Técnico de exemplo');
      definir(campo('responsavel_tecnico'), 'Técnico de exemplo');
      definir(campo('nome_beneficiario'), 'Beneficiário de Exemplo');
      definir(campo('cpf'), '529.982.247-25');
      definir(campo('data_nascimento'), '01/01/1980');
      definir(campo('telefone'), '(68) 99999-0000');
      definir(campo('estado_civil'), 'Solteiro(a)');
      definir(campo('sexo'), 'F');
      definir(campo('possui_dap'), 'Sim');
      definir(campo('indigena'), 'Não');
      definir(el('lancPossuiAssociacao'), 'Não');
      definir(campo('endereco'), 'Ramal de exemplo, km 10');
      definir(campo('nome_propriedade'), 'Sítio Exemplo');
      if (tipo === 'Mecanização') {
        var linha = form.querySelector('.lanc-cultura-linha');
        if (linha) {
          definir(linha.querySelector('.lc-cultura'), 'Milho - safra');
          definir(linha.querySelector('.lc-area'), '2');
          definir(linha.querySelector('.lc-sistema'), 'M');
        }
        definir(campo('destoca'), 'Sim');
      } else {
        definir(campo('quantidade_acudes'), '1');
        definir(campo('horas_maquina'), '8');
        definir(campo('piscicultura'), 'Sim');
      }
      var maq = form.querySelector('#lancMaquinas input[value="' + (tipo === 'Mecanização' ? 'Trator agrícola' : 'Escavadeira hidráulica') + '"]');
      if (maq) { maq.checked = true; maq.dispatchEvent(new Event('change', { bubbles: true })); }
    } catch (e) { /* simulação é só para ver: se um campo faltar, o resto continua */ }
    el('lancSimSair').hidden = false;
    aviso('lancSalvarStatus', 'carregando', 'Simulação de ' + tipo + ': nada será gravado.');
    if (ux) ux.atualizar();
    window.scrollTo({ top: 0 });
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
    var barraSim = el('lancSimulacao'); if (barraSim) barraSim.hidden = !ehResponsavel;   // só o root simula
    ajuda.marcarHorarioInsercao();
    if (ux) { ux.atualizar(); setTimeout(ux.focarPrimeiro, 120); }
  }

  /* ------------------------------------------------------------- recentes */
  var ICONES = {
    ver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    editar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
    excluir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/></svg>',
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

  /* Pop-up do código de liberação (pendência de um dia anterior). Promise com
     true quando o servidor aceitou o código, ou false se cancelou. O código
     digitado fica registrado, com a hora, na aba de solicitações do responsável. */
  function pedirCodigo(info) {
    var dlg = el('lancCodigoDialogo'), campo = el('lancCodigoTexto'), erro = el('lancCodigoErro'), ok = el('lancCodigoConfirmar');
    erro.hidden = true;
    // o código aparece para a própria pessoa; o limite é de 3 códigos por pendência (depois só o responsável destrava)
    var cod = String((info && info.codigo) || '');
    el('lancCodigoMostrar').textContent = cod ? cod.slice(0, 4) + '-' + cod.slice(4) : '—';
    var restam = info && info.restantes;
    el('lancCodigoRestam').textContent = restam ? (restam === 1 ? 'Este é o seu último código de liberação.' : 'Você ainda tem ' + restam + ' códigos de liberação (um por dia).') : '';
    campo.value = '';
    return new Promise(function (resolve) {
      function fechar(valor) {
        el('lancCodigoForm').onsubmit = null;
        el('lancCodigoCancelar').onclick = null;
        dlg.onclose = null;
        if (dlg.open) dlg.close();
        resolve(valor);
      }
      el('lancCodigoForm').onsubmit = function (e) {
        e.preventDefault();
        var codigo = campo.value.trim();
        if (!codigo) { erro.textContent = 'Digite o código.'; erro.hidden = false; campo.focus(); return; }
        ok.disabled = true;
        enviarAcao({ acao: 'liberar', codigo: codigo })
          .then(function (res) {
            ok.disabled = false;
            if (!res.corpo.ok) { erro.textContent = res.corpo.erro || 'Código inválido.'; erro.hidden = false; campo.select(); return; }
            window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('liberar', 'mecanizacao', 'Digitou o código de liberação ' + codigo.toUpperCase() + ' para lançar com pendência de dia anterior');
            fechar(true);
          })
          .catch(function () { ok.disabled = false; erro.textContent = 'Sem conexão com o servidor.'; erro.hidden = false; });
      };
      el('lancCodigoCancelar').onclick = function () { fechar(false); };
      dlg.onclose = function () { fechar(false); };
      dlg.showModal();
      campo.focus();
    });
  }

  function enviarAcao(campos) {
    // sem token na mão, o enviar() renova ou pede a senha (sem recarregar a página)
    var sessao = sessaoSite();
    var fd = new FormData();
    fd.append('token', (sessao && sessao.access_token) || '');
    Object.keys(campos).forEach(function (c) { fd.append(c, campos[c]); });
    return window.LANCAMENTO_CAMPOS.enviar(fd);
  }

  /** Responsável: exclui direto (com confirmação). Demais: pop-up com motivo
      e o pedido fica pendente. */
  function excluir(id, nome) {
    var motivoPronto = ehResponsavel
      ? window.Modal.confirmar({
          titulo: 'Excluir lançamento',
          mensagem: 'Excluir o lançamento de "' + nome + '"? Não tem como desfazer.',
          confirmar: 'Excluir', perigo: true
        }).then(function (ok) { return ok ? '' : null; })
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
    estado_civil: 'Estado civil', sexo: 'Sexo', indigena: 'Indígena', etnia: 'Etnia', possui_dap: 'Possui CAF',
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
    window.Modal.confirmar({
      titulo: decisao === 'aprovar' ? 'Aprovar solicitação' : 'Recusar solicitação',
      mensagem: pergunta,
      confirmar: decisao === 'aprovar' ? 'Aprovar' : 'Recusar',
      perigo: decisao !== 'aprovar' || sol.tipo === 'excluir'
    }).then(function (ok) { if (ok) executarResolucao(sol, decisao); });
  }

  function executarResolucao(sol, decisao) {
    var nome = sol.nome_beneficiario || '';
    aviso('lancSolicitacoesAviso', 'carregando', 'Registrando decisão…');
    function concluido() {
      var oque = sol.tipo === 'excluir' ? 'exclusão' : 'edição';
      window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento(decisao === 'aprovar' ? 'aprovar' : 'recusar', 'mecanizacao',
        (decisao === 'aprovar' ? 'Aprovou' : 'Recusou') + ' a ' + oque + ' do lançamento de mecanização de "' + nome + '"',
        { solicitado_por: sol.solicitado_por_email, motivo: sol.motivo });
      aviso('lancSolicitacoesAviso', 'ok', 'Solicitação ' + (decisao === 'aprovar' ? 'aprovada' : 'recusada') + '.');
      carregarSolicitacoes();
      carregarRecentes();
    }
    /* A resposta pode se perder (conexão oscilando, função demorando) com a decisão já gravada no banco: antes
       de mostrar erro, confere se o pedido ainda está pendente. Se saiu da lista, a decisão valeu. */
    function confirmar() {
      aviso('lancSolicitacoesAviso', 'carregando', 'Confirmando se a decisão foi registrada…');
      return enviarAcao({ acao: 'solicitacoes' }).then(function (r) {
        var lista = r.corpo.ok ? (r.corpo.solicitacoes || []) : null;
        if (lista && !lista.some(function (s) { return s.id === sol.id; })) { concluido(); return; }
        aviso('lancSolicitacoesAviso', 'erro', lista ? 'A decisão não foi registrada. Tente de novo.' : 'Não foi possível confirmar se a decisão foi registrada. Recarregue a página para conferir.');
      });
    }
    enviarAcao({ acao: 'resolver', id: sol.id, decisao: decisao })
      .then(function (res) {
        if (res.status === 404) return confirmar();   // "não encontrada ou já resolvida": uma tentativa anterior pode ter valido
        if (!res.corpo.ok) { aviso('lancSolicitacoesAviso', 'erro', esc(res.corpo.erro || 'Não foi possível registrar a decisão.')); return; }
        concluido();
      }, function () { return confirmar(); })
      .catch(function () { aviso('lancSolicitacoesAviso', 'erro', 'Sem conexão com o servidor. Recarregue a página para conferir se a decisão foi registrada.'); });
  }

  /* Abas da lista: "Lançamentos" (tabela de sempre) e, só para o responsável, "Solicitações pendentes",
     que troca a tabela de lançamentos pelos pedidos de edição/exclusão aguardando aprovação. */
  var abaAtual = 'lancamentos';
  function mostrarAba(nome) {
    if (nome === 'solicitacoes' && !ehResponsavel) nome = 'lancamentos';
    abaAtual = nome;
    el('lancListaCartao').hidden = nome !== 'lancamentos';
    el('lancSolicitacoesSec').hidden = nome !== 'solicitacoes';
    var ind = el('lancAbaSolic');
    ind.classList.toggle('ativa', nome === 'solicitacoes');
    ind.setAttribute('aria-pressed', nome === 'solicitacoes' ? 'true' : 'false');
  }

  /* Códigos de liberação (só responsável): o código de cada pessoa bloqueada e, para os já digitados, quem digitou e quando. */
  function carregarCodigos() {
    enviarAcao({ acao: 'codigos' })
      .then(function (res) {
        if (!res.corpo.ok) { el('lancCodigos').innerHTML = '<p class="nota">' + esc(res.corpo.erro || 'Não foi possível carregar os códigos.') + '</p>'; return; }
        var lista = res.corpo.codigos || [];
        // quem gastou os 3 códigos e segue com pedido pendente: só volta a lançar quando o responsável aprovar/recusar
        var alerta = (res.corpo.travados || []).map(function (t) {
          var usos = lista.filter(function (c) { return c.usuario_email === t.usuario_email && c.usado_em && c.usado_em >= t.desde; })
            .map(function (c) { return '<span class="lanc-codigo-txt">' + esc(c.codigo.slice(0, 4) + '-' + c.codigo.slice(4)) + '</span> (' + esc(window.DATA_BR.dataHoraBr(c.usado_em)) + ')'; });
          return '<div class="lanc-codigos-alerta"><b>' + esc(nomeDeEmail(t.usuario_email)) + '</b> já usou os 3 códigos de liberação: ' + usos.join(', ') +
            '. Está impedida de lançar até você <b>aprovar ou recusar</b> as solicitações pendentes dela.</div>';
        }).join('');
        if (!lista.length) { el('lancCodigos').innerHTML = '<p class="nota">Nenhum código gerado ainda.</p>'; return; }
        el('lancCodigos').innerHTML = alerta + '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr>' +
          '<th>Código</th><th>Pessoa</th><th>Gerado em</th><th>Situação</th>' +
          '</tr></thead><tbody>' + lista.map(function (c) {
            var cod = String(c.codigo || '');
            return '<tr><td><span class="lanc-codigo-txt">' + esc(cod.slice(0, 4) + '-' + cod.slice(4)) + '</span></td>' +
              '<td>' + esc(nomeDeEmail(c.usuario_email)) + '</td>' +
              '<td>' + esc(window.DATA_BR.dataHoraBr(c.criado_em)) + '</td>' +
              '<td>' + (c.usado_em
                ? '<span class="lanc-selo lanc-selo-editar">Digitado em ' + esc(window.DATA_BR.dataHoraBr(c.usado_em)) + '</span>'
                : '<span class="lanc-selo lanc-selo-excluir">Aguardando digitação</span>') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }, function () {})
      .catch(function () { /* painel de apoio: falha aqui não impede o resto */ });
  }

  function carregarSolicitacoes() {
    var aba = el('lancAbaSolic');
    if (!ehResponsavel) { aba.hidden = true; mostrarAba('lancamentos'); return; }
    aba.hidden = false;
    carregarCodigos();
    enviarAcao({ acao: 'solicitacoes' })
      .then(function (res) {
        var lista = (res.corpo.ok && res.corpo.solicitacoes) || [];
        if (!res.corpo.ok) { el('lancSolicitacoes').innerHTML = '<p class="nota">' + esc(res.corpo.erro || 'Não foi possível carregar as solicitações.') + '</p>'; return; }
        el('lancSolicitacoesQtd').textContent = lista.length;
        el('lancAbaSolic').classList.toggle('lanc-ind-zero', !lista.length);
        if (!lista.length) { el('lancSolicitacoes').innerHTML = '<p class="nota">Nenhuma solicitação pendente.</p>'; return; }
        el('lancSolicitacoes').innerHTML = '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr>' +
          '<th>Pedido em</th><th>Tipo</th><th>Beneficiário</th><th>Solicitado por</th><th>Motivo</th><th>Ações</th>' +
          '</tr></thead><tbody>' + lista.map(function (s, i) {
            return '<tr><td>' + esc(window.DATA_BR.dataHoraBr(s.criado_em)) + '</td>' +
              '<td><span class="lanc-selo ' + (s.tipo === 'excluir' ? 'lanc-selo-excluir' : 'lanc-selo-editar') + '">' + (s.tipo === 'excluir' ? 'Exclusão' : 'Edição') + '</span></td>' +
              '<td>' + esc(nomeFmt(s.nome_beneficiario) || '—') + '</td>' +
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
  /* Registros por página: a pessoa escolhe ao lado do paginador (10 é o padrão) e
     a escolha fica neste navegador. O servidor aceita até 100 por página. */
  var OPCOES_POR_PAGINA = [10, 20, 50, 100];
  var CHAVE_POR_PAGINA = 'seagri_lanc_por_pagina';
  var POR_PAGINA = (function () {
    try {
      var v = +localStorage.getItem(CHAVE_POR_PAGINA);
      if (OPCOES_POR_PAGINA.indexOf(v) >= 0) return v;
    } catch (e) { /* modo privado */ }
    return 10;
  })();
  /* Em tela larga (filtros ao lado da lista) a página tem exatamente as linhas que
     cabem entre o topo da lista e o rodapé da tela: sem rolagem, com paginação. A
     altura de uma linha é medida na primeira tabela desenhada; até lá vale 45px. */
  var alturaLinha = 45;
  function porPaginaQueCabe() {
    return POR_PAGINA;   // o tamanho da página é o que a pessoa escolheu
  }
  var paginaAtual = 1, totalLinhas = 0, pedidoLista = 0, filtrosProntos = false;
  var CAMPOS_FILTRO = ['f_busca', 'f_pessoa', 'f_ano', 'f_mes', 'f_dia', 'f_tipo_servico', 'f_municipio', 'f_escritorio'];
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
        if (usuariosSistema.length) atualizarProgresso();   // só o responsável recebe "usuarios"
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
    // "Ver como" (só root): as mesmas pessoas, para ver a lista como cada uma a enxerga
    var vc = el('lancVerComo'), vcAtual = vc.value;
    vc.innerHTML = '<option value="">Eu mesmo (root)</option>' + Object.keys(porNome).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); })
      .map(function (nome) { return '<option value="' + esc(porNome[nome].emails.join(',')) + '">' + esc(nome) + '</option>'; }).join('');
    vc.value = vcAtual;
    if (vc.value !== vcAtual) vc.value = '';
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

  /* Linhas da tela: cada e-mail sem nome é uma linha; os e-mails que já
     receberam o MESMO nome viram uma linha só (a pessoa) — assim, conforme
     os iguais vão sendo agrupados, as repetições somem da lista. */
  function listaMunicipios(texto) {
    return String(texto || '').split(', ').filter(Boolean);
  }

  var MUNICIPIOS_LISTA = [];   // os 22 municípios (montarFiltros)

  /* Município da pessoa: um select pra o responsável alterar. "Automático"
     = o que mais aparece nas fichas; escolhido = gravado em
     mecanizacao_lancadores.municipio. O "+N" lista onde mais ela lançou. */
  function municipioHtml(it) {
    var outros = it.municipios.filter(function (m) { return m !== (it.municipioDefinido || it.municipio); });
    var lista = MUNICIPIOS_LISTA.slice();
    if (it.municipioDefinido && lista.indexOf(it.municipioDefinido) < 0) lista.push(it.municipioDefinido);
    return '<select class="lanc-pessoa-municipio-sel" aria-label="Município">' +
      '<option value="">' + esc(it.municipio ? 'Automático (' + it.municipio + ')' : 'Automático') + '</option>' +
      lista.map(function (m) { return '<option' + (m === it.municipioDefinido ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') +
      '</select>' +
      (outros.length ? ' <span class="lanc-pessoa-mais" title="Lançou em: ' + esc(it.municipios.slice().sort().join(', ')) + '">+' + outros.length + '</span>' : '');
  }

  function opcoesMunicipioLote() {
    return '<option value="__manter__">(manter o município)</option><option value="">Automático</option>' +
      MUNICIPIOS_LISTA.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('');
  }

  /* Ordens da tela "Pessoas" (select "Ordenar por"). */
  function porTexto(campo) {
    return function (a, b) { return String(campo(a) || '￿').localeCompare(String(campo(b) || '￿'), 'pt-BR') || a.emails[0].localeCompare(b.emails[0]); };
  }
  var ORDENS_PESSOAS = {
    // parecidos lado a lado ("Egrecio"/"Egracio"…) — bom pra agrupar
    parecidos: function (a, b) { return a.chave.localeCompare(b.chave) || a.emails[0].localeCompare(b.emails[0]); },
    recente: function (a, b) { return new Date(b.ultimo || 0) - new Date(a.ultimo || 0) || a.emails[0].localeCompare(b.emails[0]); },
    antigo: function (a, b) { return new Date(a.ultimo || 0) - new Date(b.ultimo || 0) || a.emails[0].localeCompare(b.emails[0]); },
    mais: function (a, b) { return b.total - a.total || a.emails[0].localeCompare(b.emails[0]); },
    menos: function (a, b) { return a.total - b.total || a.emails[0].localeCompare(b.emails[0]); },
    email: function (a, b) { return a.emails[0].localeCompare(b.emails[0]); },
    nome: porTexto(function (it) { return it.nome || nomeSugerido(it.emails[0]); }),
    municipio: porTexto(function (it) { return it.municipioDefinido || it.municipio; }),
    tecnico: porTexto(function (it) { return it.tecnico; })
  };

  function pessoasAgrupadas() {
    var porNome = {}, itens = [];
    lancadores.forEach(function (l) {
      if (!l.nome) {
        itens.push({ nome: '', emails: [l.email], total: l.total || 0, tecnico: l.tecnico || '', usuario: l.usuario_email || '', chave: chaveParecida(l.email),
          municipio: l.municipio || '', maiorTotal: l.total || 0, municipios: listaMunicipios(l.municipios), ultimo: l.ultimo || '',
          municipioDefinido: l.municipio_definido || '' });
        return;
      }
      var g = porNome[l.nome];
      if (!g) {
        g = porNome[l.nome] = { nome: l.nome, emails: [], total: 0, tecnico: l.tecnico || '', usuario: l.usuario_email || '', chave: chaveParecida(l.email),
          municipio: '', maiorTotal: -1, municipios: [], ultimo: '', municipioDefinido: '' };
        itens.push(g);
      }
      g.emails.push(l.email);
      g.total += l.total || 0;
      if (!g.tecnico && l.tecnico) g.tecnico = l.tecnico;
      // município principal do grupo = o do e-mail com mais lançamentos
      if (new Date(l.ultimo || 0) > new Date(g.ultimo || 0)) g.ultimo = l.ultimo;
      if ((l.total || 0) > g.maiorTotal && l.municipio) { g.maiorTotal = l.total || 0; g.municipio = l.municipio; }
      listaMunicipios(l.municipios).forEach(function (m) { if (g.municipios.indexOf(m) < 0) g.municipios.push(m); });
      if ((l.usuario_email || '') !== g.usuario) g.usuario = g.usuario || l.usuario_email || '';
      if (!g.municipioDefinido && l.municipio_definido) g.municipioDefinido = l.municipio_definido;
    });
    return itens;
  }

  function desenharPessoas() {
    var termo = el('lancPessoasBusca').value.trim().toLowerCase();
    // já agrupados (com nome) somem da lista; "Mostrar já agrupados" traz de volta pra editar
    var mostrarAgrupados = el('lancPessoasAgrupados').checked;
    var linhas = pessoasAgrupadas().filter(function (it) {
      if (!mostrarAgrupados && it.nome) return false;
      return !termo || it.nome.toLowerCase().indexOf(termo) >= 0 || it.tecnico.toLowerCase().indexOf(termo) >= 0 ||
        (it.municipios.join(' ') + ' ' + it.municipioDefinido).toLowerCase().indexOf(termo) >= 0 ||
        it.emails.some(function (e) { return e.indexOf(termo) >= 0 || nomeDeEmail(e).toLowerCase().indexOf(termo) >= 0; });
    }).sort(ORDENS_PESSOAS[el('lancPessoasOrdem').value] || ORDENS_PESSOAS.parecidos);

    // nomes já digitados (e técnicos) viram sugestão — escolher um deles junta
    // o e-mail na mesma pessoa, escrito exatamente igual
    var nomes = {};
    lancadores.forEach(function (l) { if (l.nome) nomes[l.nome] = 1; if (l.tecnico) nomes[l.tecnico] = 1; });
    el('lancPessoasNomes').innerHTML = Object.keys(nomes).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); })
      .map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    el('lancPessoasLoteUsuario').innerHTML = opcoesUsuario('__manter__', true);
    el('lancPessoasLoteMunicipio').innerHTML = opcoesMunicipioLote();

    el('lancPessoasCorpo').innerHTML = !linhas.length
      ? '<p class="nota">' + (!mostrarAgrupados && !termo && lancadores.length ? 'Todos os e-mails já foram agrupados. Marque “Mostrar já agrupados” para revisar.' : 'Nenhuma pessoa encontrada.') + '</p>' :
      '<div class="tabela-scroll"><table class="lanc-tabela lanc-pessoas"><thead><tr>' +
      '<th><input type="checkbox" id="lancPessoasTodos" title="Marcar todos da lista" aria-label="Marcar todos da lista"></th>' +
      '<th>E-mail usado no lançamento</th><th class="num">Qtd.</th><th>Município</th><th>Técnico mais frequente</th><th>Nome de exibição</th><th>Login do sistema</th><th></th>' +
      '</tr></thead><tbody>' + linhas.map(function (it) {
        var marcado = it.emails.every(function (e) { return pessoasMarcadas[e]; });
        var emailsHtml = it.emails.length === 1
          ? esc(it.emails[0])
          : '<details><summary>' + it.emails.length + ' e-mails agrupados</summary><ul class="lanc-pessoa-emails">' +
              it.emails.map(function (e) {
                return '<li>' + esc(e) + ' <button type="button" class="lanc-pessoa-desagrupar" data-email="' + esc(e) + '" title="Tirar este e-mail do grupo">&times;</button></li>';
              }).join('') + '</ul></details>';
        return '<tr data-emails="' + esc(it.emails.join(',')) + '" data-municipio="' + esc(it.municipioDefinido) + '"' + (marcado ? ' class="lanc-pessoa-marcada"' : '') + (it.nome ? ' data-agrupado="1"' : '') + '>' +
          '<td><input type="checkbox" class="lanc-pessoa-marca" aria-label="Selecionar ' + esc(it.nome || it.emails[0]) + '"' + (marcado ? ' checked' : '') + '></td>' +
          '<td class="lanc-pessoa-email">' + emailsHtml + '</td>' +
          '<td class="num">' + it.total.toLocaleString('pt-BR') + '</td>' +
          '<td class="lanc-pessoa-municipio">' + municipioHtml(it) + '</td>' +
          '<td>' + (it.tecnico ? '<button type="button" class="lanc-pessoa-tecnico" title="Usar este nome">' + esc(it.tecnico) + '</button>' : '—') + '</td>' +
          '<td><input type="text" class="lanc-pessoa-nome" list="lancPessoasNomes" maxlength="120" value="' + esc(it.nome) + '" placeholder="' + esc(nomeSugerido(it.emails[0])) + '"></td>' +
          '<td><select class="lanc-pessoa-usuario">' + opcoesUsuario(it.usuario) + '</select></td>' +
          '<td>' + botaoIcone('lanc-btn-aprovar lanc-pessoa-salvar', ICONES.aprovar, 'Salvar') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var grupos = pessoasAgrupadas().filter(function (it) { return it.nome; }).length;
    el('lancPessoasResumo').textContent = grupos + ' pessoa(s) já agrupada(s)' + (mostrarAgrupados ? '' : ' (ocultas)');
    atualizarProgresso();
    atualizarContagemMarcadas();
  }

  /* Progresso da conferência: um e-mail está conferido quando tem nome. */
  function atualizarProgresso() {
    var total = lancadores.length;
    var feitos = lancadores.filter(function (l) { return l.nome; }).length;
    var faltam = total - feitos;
    var pct = total ? Math.round(feitos * 100 / total) : 0;
    el('lancPessoasProgresso').innerHTML = !total ? '' :
      '<div class="lanc-progresso-texto">' + (faltam
        ? 'Faltam <b>' + faltam.toLocaleString('pt-BR') + '</b> de ' + total.toLocaleString('pt-BR') + ' e-mails para terminar de conferir'
        : '<b>Conferência terminada</b> — todos os ' + total.toLocaleString('pt-BR') + ' e-mails têm nome') +
      ' <span>(' + pct + '% conferido)</span></div>' +
      '<div class="lanc-progresso-barra" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + feitos + '"><span style="width:' + pct + '%"></span></div>';
    var btn = el('lancPessoasBtn');
    btn.textContent = 'Pessoas';
    if (faltam) {
      var s = document.createElement('span');
      s.className = 'lanc-btn-contador';
      s.textContent = faltam;
      s.title = faltam + ' e-mail(s) ainda sem nome';
      btn.appendChild(s);
    }
  }

  function emailsDaLinha(tr) {
    return tr.getAttribute('data-emails').split(',');
  }

  function atualizarContagemMarcadas() {
    var n = Object.keys(pessoasMarcadas).length;
    el('lancPessoasQtd').textContent = n === 1 ? '1 e-mail selecionado' : n + ' e-mails selecionados';
    el('lancPessoasLoteAplicar').disabled = !n;
  }

  /** Grava o mesmo nome/login/município em vários e-mails, um de cada vez.
      Resolve com { feitos, fichas } — fichas = lançamentos que mudaram de município. */
  function gravarVarios(emails, nome, usuario, municipio) {
    var feitos = 0, fichas = 0;
    return emails.reduce(function (p, email) {
      return p.then(function () {
        return gravarLancador(email, nome, usuario, municipio).then(function (n) { feitos++; fichas += n || 0; });
      });
    }, Promise.resolve()).then(function () { return { feitos: feitos, fichas: fichas }; }, function (e) { e.feitos = feitos; throw e; });
  }

  function textoFichas(municipio, fichas) {
    if (municipio === undefined || !fichas) return '';
    return ' ' + fichas.toLocaleString('pt-BR') + ' ficha(s) ' + (municipio ? 'agora com o município <b>' + esc(municipio) + '</b>' : 'voltaram ao município original') + '.';
  }

  /** Grava nome/login/município de um e-mail; usuario ou municipio ===
      undefined mantém o que já estava (municipio '' = volta ao automático).
      O nome vai exatamente como foi digitado (só sem espaços nas pontas). */
  function gravarLancador(email, nome, usuario, municipio) {
    var atual = lancadores.filter(function (l) { return l.email === email; })[0] || {};
    if (usuario === undefined) usuario = atual.usuario_email || '';
    var campos = { acao: 'salvar_lancador', email: email, nome: nome, usuario_email: usuario };
    if (municipio !== undefined) campos.municipio = municipio;
    return enviarAcao(campos)
      .then(function (res) {
        if (!res.corpo.ok) throw new Error(res.corpo.erro || 'Não foi possível salvar.');
        atual.nome = nome || null; atual.usuario_email = usuario || null;
        if (municipio !== undefined) atual.municipio_definido = municipio || null;
        if (nome) NOMES[email] = nome; else delete NOMES[email];
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('editar', 'mecanizacao', 'Definiu o nome de "' + email + '" como "' + (nome || nomeSugerido(email)) + '"' +
          (municipio !== undefined ? ' e o município como "' + (municipio || 'automático') + '"' : ''),
          { usuario_email: usuario, municipio: municipio, fichas_alteradas: res.corpo.fichas_alteradas });
        return res.corpo.fichas_alteradas || 0;
      });
  }

  function depoisDeSalvarPessoas(msg) {
    aviso('lancPessoasAviso', 'ok', msg);
    montarFiltroPessoa();
    desenharPessoas();
    carregarRecentes();
    // contagens/municípios das fichas podem ter mudado: recarrega do banco
    carregarLancadores().then(desenharPessoas);
  }

  function erroAoSalvar(e) {
    aviso('lancPessoasAviso', 'erro', (e && e.feitos ? e.feitos + ' salvo(s); parou com erro: ' : '') +
      esc(e && e.message ? e.message : 'Sem conexão com o servidor.'));
    atualizarContagemMarcadas();
  }

  /** Linha salva: vale para todos os e-mails dela (uma pessoa agrupada
      renomeada continua sendo uma pessoa só). */
  function salvarPessoa(tr) {
    var emails = emailsDaLinha(tr);
    var nome = tr.querySelector('.lanc-pessoa-nome').value.trim();
    var usuario = tr.querySelector('.lanc-pessoa-usuario').value;
    // município só vai quando mudou: trocar o das fichas mexe em todas elas
    var municipio = tr.querySelector('.lanc-pessoa-municipio-sel').value;
    if (municipio === tr.getAttribute('data-municipio')) municipio = undefined;
    (municipio !== undefined ? window.Modal.confirmar({
      titulo: 'Mudar município das fichas',
      mensagem: municipio
      ? 'Mudar o município de TODAS as fichas desta pessoa para "' + municipio + '"? O município antigo de cada ficha fica guardado — voltar para "Automático" desfaz.'
      : 'Voltar ao "Automático"? As fichas desta pessoa recebem de volta o município que tinham antes.',
      confirmar: 'Confirmar'
    }) : Promise.resolve(true)).then(function (ok) {
      if (!ok) return;
      aviso('lancPessoasAviso', 'carregando', 'Salvando…');
      gravarVarios(emails, nome, usuario, municipio)
        .then(function (r) {
          emails.forEach(function (e) { delete pessoasMarcadas[e]; });
          depoisDeSalvarPessoas('Salvo: ' + (emails.length > 1 ? emails.length + ' e-mails' : '<b>' + esc(emails[0]) + '</b>') + ' → ' +
            esc(nome || nomeSugerido(emails[0])) + (usuario ? ' (login ' + esc(usuario) + ')' : '') + '.' + textoFichas(municipio, r.fichas));
        })
        .catch(erroAoSalvar);
    });

  }

  /** Mesmo nome (e, se escolhido, mesmo login) para todos os marcados —
      eles viram uma linha só na lista. */
  function aplicarAosMarcados() {
    var emails = Object.keys(pessoasMarcadas);
    var nome = el('lancPessoasLoteNome').value.trim();
    var usuarioSel = el('lancPessoasLoteUsuario').value;
    var usuario = usuarioSel === '__manter__' ? undefined : usuarioSel;
    var municipioSel = el('lancPessoasLoteMunicipio').value;
    var municipio = municipioSel === '__manter__' ? undefined : municipioSel;
    if (!emails.length) return;
    if (!nome) { aviso('lancPessoasAviso', 'erro', 'Digite o nome para os selecionados.'); el('lancPessoasLoteNome').focus(); return; }
    (municipio !== undefined ? window.Modal.confirmar({
      titulo: 'Mudar município das fichas',
      mensagem: municipio
      ? 'Mudar o município de TODAS as fichas desses ' + emails.length + ' e-mail(s) para "' + municipio + '"? O município antigo de cada ficha fica guardado.'
      : 'Voltar ao "Automático"? As fichas desses e-mails recebem de volta o município que tinham antes.',
      confirmar: 'Confirmar'
    }) : Promise.resolve(true)).then(function (ok) {
      if (!ok) return;
      aviso('lancPessoasAviso', 'carregando', 'Salvando ' + emails.length + ' e-mail(s)…');
      el('lancPessoasLoteAplicar').disabled = true;
      gravarVarios(emails, nome, usuario, municipio)
        .then(function (r) {
          pessoasMarcadas = {};
          el('lancPessoasLoteNome').value = '';
          depoisDeSalvarPessoas(r.feitos + ' e-mail(s) agrupados como <b>' + esc(nome) + '</b>.' + textoFichas(municipio, r.fichas));
        })
        .catch(erroAoSalvar);
    });

  }

  /** Tira um e-mail de um grupo (apaga o nome dele — volta a ser linha própria). */
  function desagrupar(email) {
    aviso('lancPessoasAviso', 'carregando', 'Salvando…');
    gravarLancador(email, '', undefined)
      .then(function () { depoisDeSalvarPessoas('<b>' + esc(email) + '</b> saiu do grupo e voltou a aparecer sozinho na lista.'); })
      .catch(erroAoSalvar);
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
    var tr = caixa.closest('tr');
    caixa.checked = marcado;
    tr.classList.toggle('lanc-pessoa-marcada', marcado);
    emailsDaLinha(tr).forEach(function (email) {
      if (marcado) pessoasMarcadas[email] = true; else delete pessoasMarcadas[email];
    });
  }

  function ligarPessoas() {
    el('lancPessoasBtn').addEventListener('click', abrirPessoas);
    el('lancPessoasFechar').addEventListener('click', function () { el('lancPessoasDialogo').close(); });
    el('lancPessoasBusca').addEventListener('input', desenharPessoas);
    el('lancPessoasAgrupados').addEventListener('change', desenharPessoas);
    el('lancPessoasOrdem').addEventListener('change', desenharPessoas);
    el('lancPessoasLoteAplicar').addEventListener('click', aplicarAosMarcados);
    el('lancPessoasLoteNome').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicarAosMarcados(); } });
    var corpo = el('lancPessoasCorpo');
    corpo.addEventListener('click', function (e) {
      var b = e.target.closest('.lanc-pessoa-salvar');
      if (b) { salvarPessoa(b.closest('tr')); return; }
      var d = e.target.closest('.lanc-pessoa-desagrupar');
      if (d) { desagrupar(d.getAttribute('data-email')); return; }
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
      var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      el('lancFiltroMes').innerHTML = '<option value="">Todos os meses</option>' + MESES.map(function (n, i) { return '<option value="' + (i + 1) + '">' + n + '</option>'; }).join('');
      var dias = '<option value="">Todos os dias</option>';
      for (var d = 1; d <= 31; d++) dias += '<option>' + d + '</option>';
      el('lancFiltroDia').innerHTML = dias;
      el('lancFiltroPessoa').value = pessoaPadrao();
      var espera;
      function aoMudarFiltro(e) {
        clearTimeout(espera);
        mostrarAba('lancamentos');   // os filtros valem para a tabela de lançamentos
        // texto livre espera a pessoa parar de digitar; selects aplicam na hora
        espera = setTimeout(function () { paginaAtual = 1; carregarRecentes(); }, e.target.tagName === 'INPUT' ? 400 : 0);
      }
      el('lancFiltros').addEventListener('input', aoMudarFiltro);
      el('lancFiltrosLimpar').addEventListener('click', function () {
        el('lancFiltros').reset();
        el('lancFiltroPessoa').value = pessoaPadrao();
        paginaAtual = 1;
        carregarRecentes();
      });
      el('lancPaginacao').addEventListener('click', function (e) {
        var t = e.target.closest('button[data-tam]');
        if (t) {   // quantos registros por página
          var novo = +t.getAttribute('data-tam');
          if (OPCOES_POR_PAGINA.indexOf(novo) < 0 || novo === POR_PAGINA) return;
          var primeiro = (paginaAtual - 1) * POR_PAGINA;   // mantém o primeiro item à vista
          POR_PAGINA = novo;
          paginaAtual = Math.floor(primeiro / POR_PAGINA) + 1;
          try { localStorage.setItem(CHAVE_POR_PAGINA, String(novo)); } catch (err) { /* sem armazenamento */ }
          carregarRecentes();
          return;
        }
        var b = e.target.closest('button[data-pagina]');
        if (!b || b.disabled) return;
        paginaAtual = +b.getAttribute('data-pagina');
        carregarRecentes();
        el('lancFiltros').scrollIntoView({ block: 'nearest' });
      });
      filtrosProntos = true;
    }
    MUNICIPIOS_LISTA = municipios.slice();
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
    if (!totalLinhas) return '';
    var ini = (paginaAtual - 1) * POR_PAGINA + 1, fim = Math.min(totalLinhas, paginaAtual * POR_PAGINA);
    function bt(p, rotulo, titulo, atual) {
      return '<button type="button" class="btn' + (atual ? ' lanc-pag-atual' : '') + '" data-pagina="' + p + '"' +
        (p < 1 || p > paginas || atual ? ' disabled' : '') + ' title="' + titulo + '"' + (atual ? ' aria-current="page"' : '') + '>' + rotulo + '</button>';
    }
    // até 5 números em volta da página atual
    var de = Math.max(1, Math.min(paginaAtual - 2, paginas - 4)), ate = Math.min(paginas, de + 4);
    var nums = '';
    for (var p = de; p <= ate; p++) nums += bt(p, p, 'Página ' + p, p === paginaAtual);
    // "Por página: 10 20 50 100": botões ao lado do paginador (ficam mesmo com uma página só)
    var tam = '<span class="lanc-pag-tam">Por página ' + OPCOES_POR_PAGINA.map(function (n) {
      return '<button type="button" class="btn' + (n === POR_PAGINA ? ' lanc-pag-atual' : '') + '" data-tam="' + n + '"' +
        ' aria-pressed="' + (n === POR_PAGINA ? 'true' : 'false') + '">' + n + '</button>';
    }).join('') + '</span>';
    var botoes = paginas > 1
      ? '<span class="lanc-pag-botoes">' +
        bt(1, '«', 'Primeira página') + bt(paginaAtual - 1, '‹', 'Página anterior') + nums +
        bt(paginaAtual + 1, '›', 'Próxima página') + bt(paginas, '»', 'Última página') + '</span>'
      : '';
    return '<span class="lanc-pag-info">' + ini.toLocaleString('pt-BR') + '–' + fim.toLocaleString('pt-BR') + ' de ' + totalLinhas.toLocaleString('pt-BR') + '</span>' +
      '<span class="lanc-pag-dir">' +
      tam + botoes + '</span>';
  }

  // nomes na mesma regra do formulário (João Silva de Souza), mesmo os de fichas antigas
  function nomeFmt(n) {
    return window.LANC_NOMES && n ? window.LANC_NOMES.formatar(String(n), 'nome') : (n || '');
  }

  function dataBr(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
  }

  /** ha só existe na mecanização; horas e açudes, só na açudagem. Onde não se
      aplica ao serviço do lançamento, a célula mostra "-". */
  function medidaDe(r, qual) {
    var servico = r.tipo_servico;
    var valor = qual === 'ha' ? r.area_total_ha : qual === 'h' ? r.horas_maquina : r.quantidade_acudes;
    var aplica = servico === 'Mecanização' ? qual === 'ha' : servico === 'Açudagem' ? qual !== 'ha' : true;
    if (!aplica) return '-';
    return valor === null || valor === undefined || valor === '' ? '-' : String(valor);
  }

  /* Ordenação da tabela: o servidor ordena (a lista tem milhares de linhas e vem paginada). Clicar no cabeçalho
     ordena por aquela coluna; clicar de novo inverte. Datas e números começam do maior/mais recente. */
  var ordemCol = 'criado_em', ordemDir = 'desc';
  var COLUNAS = [
    ['criado_em', 'Salvo em', '', 'desc'], ['tipo_servico', 'Serviço', '', 'asc'], ['nome_beneficiario', 'Beneficiário', '', 'asc'],
    ['municipio', 'Município', '', 'asc'], ['escritorio_local', 'Escritório', '', 'asc'], ['data_vistoria', 'Vistoria', '', 'desc'],
    ['area_total_ha', 'ha', 'num', 'desc'], ['horas_maquina', 'h', 'num', 'desc'], ['quantidade_acudes', 'Açudes', 'num', 'desc'],
    ['criado_por_email', 'Lançado por', '', 'asc']
  ];
  function cabecalhoOrdenavel() {
    return COLUNAS.map(function (c) {
      var ativo = c[0] === ordemCol;
      return '<th data-ord="' + c[0] + '" tabindex="0" title="Ordenar por ' + c[1] + '"' + (c[2] ? ' class="' + c[2] + '"' : '') +
        (ativo ? ' aria-sort="' + (ordemDir === 'asc' ? 'ascending' : 'descending') + '"' : '') + '>' + c[1] + '</th>';
    }).join('') + '<th>Ações</th>';
  }
  function ordenarPor(col) {
    var def = COLUNAS.filter(function (c) { return c[0] === col; })[0];
    if (!def) return;
    if (ordemCol === col) ordemDir = ordemDir === 'asc' ? 'desc' : 'asc';
    else { ordemCol = col; ordemDir = def[3]; }
    paginaAtual = 1;
    carregarRecentes();
  }

  function carregarRecentes() {
    var cabem = porPaginaQueCabe();
    if (cabem !== POR_PAGINA) {   // mudou o tamanho da página: mantém o primeiro item à vista
      var primeiro = (paginaAtual - 1) * POR_PAGINA;
      POR_PAGINA = cabem;
      paginaAtual = Math.floor(primeiro / POR_PAGINA) + 1;
    }
    el('lancRecentes').innerHTML = '<p class="nota">Carregando…</p>';
    var sessao = sessaoSite();
    var fd = new FormData();
    fd.append('acao', 'listar');
    fd.append('token', (sessao && sessao.access_token) || '');
    fd.append('limite', String(POR_PAGINA));
    fd.append('pagina', String(paginaAtual));
    fd.append('ordem', ordemCol);
    fd.append('dir', ordemDir);
    var filtros = el('lancFiltros').elements;
    CAMPOS_FILTRO.forEach(function (c) { if (filtros[c] && filtros[c].value) fd.append(c, filtros[c].value); });
    // "Ver como": lista só da pessoa escolhida, desenhada como ela vê (sem poderes de root)
    var verComo = ehResponsavel ? el('lancVerComo').value : '';
    if (verComo) fd.set('f_pessoa', verComo);
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
        el('lancVerComoRotulo').hidden = !ehResponsavel;
        el('lancFiltroPessoa').closest('label').hidden = !ehResponsavel;   // cada pessoa vê só os próprios
        var simulado = ehResponsavel && !!verComo;
        if (simulado) meusEmails = verComo.split(',').map(function (e) { return e.trim().toLowerCase(); });
        var comPoder = ehResponsavel && !simulado;   // root de verdade (fora do "Ver como")
        if (!eraResponsavel) carregarSolicitacoes();   // primeira carga; depois, só quando resolve um pedido
        // sem a frase "Mostrando lançamentos de…": o filtro "Lançado por" já diz de quem é a lista
        var nota = '';
        if (!linhas.length) { el('lancRecentes').innerHTML = nota + '<p class="nota">Nenhum lançamento encontrado com esses filtros.</p>'; return; }
        // página cheia (10 ou mais linhas): a tabela estica até o fim do cartão, sem sobrar espaço embaixo
        el('lancRecentes').innerHTML = nota + '<div class="tabela-scroll' + (linhas.length >= 10 ? ' lanc-cheia' : '') + '"><table class="lanc-tabela"><thead><tr>' +
          cabecalhoOrdenavel() +
          '</tr></thead><tbody>' + linhas.map(function (r) {
            var pend = pendencias[r.id];
            var selo = pend
              ? ' <span class="lanc-selo ' + (pend === 'excluir' ? 'lanc-selo-excluir' : 'lanc-selo-editar') + '">' +
                  (pend === 'excluir' ? 'Exclusão pendente' : 'Edição pendente') + '</span>'
              : '';
            var dataAttrs = ' data-id="' + esc(r.id) + '" data-nome="' + esc(r.nome_beneficiario) + '"';
            // Com pedido pendente, quem não é o responsável não pede de novo
            // (o servidor também barra) — só visualiza.
            // No "Ver como" os botões só ilustram (cadeado/prazo): não agem, pra o root não excluir sem querer.
            var travado = (pend && !comPoder) || simulado ? ' disabled' : '';
            // Lançamento de outra pessoa: só visualizar (o servidor também barra).
            var meu = comPoder || meusEmails.indexOf(String(r.criado_por_email || '').toLowerCase()) >= 0;
            return '<tr><td>' + esc(window.DATA_BR.dataHoraBr(r.criado_em)) + '</td>' +
              '<td>' + esc(r.tipo_servico || '—') + '</td><td>' + esc(nomeFmt(r.nome_beneficiario)) + selo + '</td>' +
              '<td>' + esc(r.municipio || '—') + '</td><td>' + esc(r.escritorio_local || '—') + '</td>' +
              '<td>' + esc(dataBr(r.data_vistoria)) + '</td>' +
              '<td class="num">' + esc(medidaDe(r, 'ha')) + '</td>' +
              '<td class="num">' + esc(medidaDe(r, 'h')) + '</td>' +
              '<td class="num">' + esc(medidaDe(r, 'acudes')) + '</td>' +
              '<td title="' + esc(r.criado_por_email || '') + '">' + esc(nomeDeEmail(r.criado_por_email)) + '</td>' +
              '<td class="lanc-tabela-acoes">' +
                '<a class="btn lanc-btn-icone" href="lancamento-editar.html?modo=ver&id=' + encodeURIComponent(r.id) + '" title="Ver lançamento" aria-label="Ver lançamento">' + ICONES.ver + '</a>' +
                botaoIcone('lanc-pdf-linha', ICONES.pdf, 'Baixar PDF deste lançamento', dataAttrs) +
                (meu
                  ? botaoIcone('lanc-editar', ICONES.editar + (comPoder ? '' : ICONES.cadeado),
                      comPoder ? 'Editar' : (pend ? 'Aguardando aprovação' : 'Editar (precisa de aprovação)'), dataAttrs + travado) +
                    // excluir: só o responsável (root); os demais não veem o botão
                    (comPoder ? botaoIcone('btn-excluir lanc-excluir', ICONES.excluir, 'Excluir', dataAttrs + travado) : '')
                  : '') +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
        Array.prototype.forEach.call(el('lancRecentes').querySelectorAll('.lanc-pdf-linha'), function (b) {
          b.addEventListener('click', function () { baixarPdfLinha(b); });
        });
        Array.prototype.forEach.call(el('lancRecentes').querySelectorAll('.lanc-excluir'), function (b) {
          b.addEventListener('click', function () { excluir(b.getAttribute('data-id'), b.getAttribute('data-nome')); });
        });
        Array.prototype.forEach.call(el('lancRecentes').querySelectorAll('.lanc-editar'), function (b) {
          b.addEventListener('click', function () { editar(b.getAttribute('data-id'), b.getAttribute('data-nome')); });
        });
        // altura real da linha (o estimado pode errar): se mudar quantas cabem, refaz uma vez
        var trMedida = el('lancRecentes').querySelector('tbody tr');
        if (trMedida) {
          var h = trMedida.getBoundingClientRect().height;
          if (h > 20 && Math.abs(h - alturaLinha) > 1) { alturaLinha = h; if (porPaginaQueCabe() !== POR_PAGINA) carregarRecentes(); }
        }
      })
      .catch(function () { /* lista de conferência: falha aqui não impede o resto da aba */ });
  }

  /* ------------------------------------------------------ PDF de uma linha */
  /* A lista só traz o resumo; o PDF é da ficha inteira, então busca o lançamento
     completo (ação "carregar", a mesma do botão de ver) e gera a ficha. */
  function baixarPdfLinha(botao) {
    if (botao.disabled) return;
    var id = botao.getAttribute('data-id');
    var original = botao.innerHTML;
    botao.disabled = true;
    botao.classList.add('lanc-carregando');
    enviarAcao({ acao: 'carregar', id: id })
      .then(function (res) {
        if (!res.corpo.ok || !res.corpo.lancamento) throw new Error(res.corpo.erro || 'Não foi possível abrir o lançamento.');
        var reg = res.corpo.lancamento;
        return window.LANCAMENTO_PDF.ficha(reg, { lancadoPor: nomeDeEmail(reg.criado_por_email) });
      })
      .catch(function (e) {
        if (e === null) return;   // sessão expirada: enviarAcao já avisou
        aviso('lancListaAviso', 'erro', esc((e && e.message) || 'Não foi possível gerar o PDF.'));
      })
      .then(function () {
        botao.disabled = false;
        botao.classList.remove('lanc-carregando');
        botao.innerHTML = original;
      });
  }

  /* ------------------------------------------------- depois de salvar */
  var CONTAGEM_SEGUNDOS = 10;
  var relogioSucesso = null;

  /** Confirma o cadastro com os principais dados e pergunta se quer lançar
      outro. Sem resposta em 10 s, volta para a lista de lançamentos. */
  function perguntarOutro(reg, nome) {
    var dlg = el('lancSucessoDialogo');
    var d = window.DATA_BR;
    var itens = [
      ['Beneficiário', reg.nome_beneficiario || nome],
      ['Serviço', reg.tipo_servico],
      ['Município', reg.municipio],
      ['Data da vistoria', reg.data_vistoria ? d.isoParaBr(reg.data_vistoria) : ''],
      ['Responsável técnico', reg.responsavel_tecnico],
      reg.tipo_servico === 'Açudagem'
        ? ['Tanques/açudes', reg.quantidade_acudes]
        : ['Área total', reg.area_total_ha != null ? String(reg.area_total_ha).replace('.', ',') + ' ha' : ''],
      ['PDF anexado', reg.pdf_arquivo ? 'Sim' : '']
    ].filter(function (i) { return i[1] !== '' && i[1] != null; });
    el('lancSucessoInfo').innerHTML = itens.map(function (i) {
      return '<div><dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd></div>';
    }).join('');

    var restante = CONTAGEM_SEGUNDOS;
    function texto() {
      el('lancSucessoContagem').textContent = 'Sem resposta, volto para a lista em ' + restante + ' s.';
    }
    function encerrar() {
      clearInterval(relogioSucesso);
      relogioSucesso = null;
      if (dlg.open) dlg.close();
    }
    function sim() {
      encerrar();
      // segue no formulário: serviço, data, município, escritório e técnico ficam; o resto zera
      limparFormulario(true);
      aviso('lancSalvarStatus', '', '');
      form.scrollIntoView({ behavior: 'auto', block: 'start' });
      if (ux) { ux.atualizar(); setTimeout(ux.focarPrimeiro, 250); }
    }
    function nao() {
      encerrar();
      limparFormulario(false);
      aviso('lancSalvarStatus', '', '');
      mostrarLista();
      aviso('lancListaAviso', 'ok', 'Lançamento salvo para <b>' + esc(nome) + '</b>.');
    }
    el('lancSucessoSim').onclick = sim;
    el('lancSucessoNao').onclick = nao;
    dlg.oncancel = function (ev) { ev.preventDefault(); nao(); };   // Esc = não
    texto();
    clearInterval(relogioSucesso);
    relogioSucesso = setInterval(function () {
      restante--;
      if (restante <= 0) { nao(); return; }
      texto();
    }, 1000);
    if (!dlg.open) dlg.showModal();
    el('lancSucessoSim').focus();
  }

  /* ----------------------------------------------------------------- anexo */
  /** Área de soltar do PDF: mostra o arquivo escolhido (nome e tamanho), valida
      na hora (só PDF, até 3 MB) e deixa remover. O <input> continua sendo o
      dono do arquivo, então o FormData do envio não muda. */
  function ligarAnexo() {
    var raiz = el('lancAnexo'), input = el('lancPdf');
    if (!raiz || !input) return;
    var MAX = 3 * 1024 * 1024;
    function tamanho(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
    function erro(msg) { var e = el('lancAnexoErro'); e.textContent = msg || ''; e.hidden = !msg; }
    function mostrar() {
      var f = input.files && input.files[0];
      el('lancAnexoZona').hidden = !!f;
      el('lancAnexoArquivo').hidden = !f;
      if (f) { el('lancAnexoNome').textContent = f.name; el('lancAnexoTam').textContent = tamanho(f.size) + ' · PDF'; }
    }
    function escolher(f) {
      erro('');
      if (f && (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf'))) { erro('Anexe somente arquivo PDF.'); input.value = ''; }
      else if (f && f.size > MAX) { erro('O PDF deve ter no máximo 3 MB (este tem ' + tamanho(f.size) + ').'); input.value = ''; }
      mostrar();
    }
    input.addEventListener('change', function () { escolher(input.files && input.files[0]); });
    el('lancAnexoRemover').addEventListener('click', function () { input.value = ''; erro(''); mostrar(); });
    form.addEventListener('reset', function () { setTimeout(function () { erro(''); mostrar(); }, 0); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      raiz.addEventListener(ev, function (e) { e.preventDefault(); raiz.classList.add('lanc-arrastando'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      raiz.addEventListener(ev, function (e) { e.preventDefault(); raiz.classList.remove('lanc-arrastando'); });
    });
    raiz.addEventListener('drop', function (e) {
      var arqs = e.dataTransfer && e.dataTransfer.files;
      if (!arqs || !arqs.length) return;
      if (arqs.length > 1) { erro('Anexe apenas 1 arquivo.'); return; }
      try { input.files = arqs; } catch (er) { return; }
      escolher(arqs[0]);
    });
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
    if (window.LANCAMENTO_UX) ux = window.LANCAMENTO_UX.ligar(form, {});

    ligarAnexo();
    form.addEventListener('submit', salvar);
    el('lancLimpar').addEventListener('click', function () { limparFormulario(false); aviso('lancSalvarStatus', '', ''); });
    el('lancVoltarLista').addEventListener('click', mostrarLista);
    el('lancSimTudo').addEventListener('click', verTudo);
    el('lancSimMec').addEventListener('click', function () { simular('Mecanização'); });
    el('lancSimAcu').addEventListener('click', function () { simular('Açudagem'); });
    el('lancSimSair').addEventListener('click', function () { limparFormulario(false); aviso('lancSalvarStatus', '', ''); if (ux) ux.atualizar(); });
    el('lancDiffFechar').addEventListener('click', function () { el('lancDiffDialogo').close(); });
    ligarPessoas();
    var esperaRedimensionar;
    window.addEventListener('resize', function () {
      clearTimeout(esperaRedimensionar);
      esperaRedimensionar = setTimeout(function () {
        var lista = el('lancRecentes');
        if (lista && lista.offsetParent && porPaginaQueCabe() !== POR_PAGINA) carregarRecentes();
      }, 300);
    });
    function cliqueOrdem(e) {
      var th = e.target.closest && e.target.closest('th[data-ord]');
      if (th && (e.type === 'click' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ordenarPor(th.getAttribute('data-ord')); }
    }
    el('lancRecentes').addEventListener('click', cliqueOrdem);
    el('lancRecentes').addEventListener('keydown', cliqueOrdem);
    el('lancAbas').addEventListener('click', function (e) {
      var b = e.target.closest('.lanc-aba');
      if (!b || b.hidden) return;
      var alvo = b.getAttribute('data-aba');
      mostrarAba(abaAtual === alvo ? 'lancamentos' : alvo);   // o indicador alterna entre lançamentos e solicitações
    });
    el('lancNovoBtn').addEventListener('click', function () {
      aviso('lancListaAviso', '', '');
      var btn = el('lancNovoBtn');
      btn.disabled = true;
      // pedido de edição pendente de um dia anterior: não abre o formulário (o servidor também recusa ao salvar)
      enviarAcao({ acao: 'bloqueio' })
        .then(function (res) {
          if (res.corpo && res.corpo.bloqueado) {
            if (res.corpo.travado) { aviso('lancListaAviso', 'erro', esc(res.corpo.erro)); return; }
            return pedirCodigo(res.corpo).then(function (liberou) {
              if (!liberou) { aviso('lancListaAviso', 'erro', esc(res.corpo.erro)); return; }
              limparFormulario(true);
              mostrarFormulario();
            });
          }
          limparFormulario(true);
          mostrarFormulario();
        })
        .catch(function () { limparFormulario(true); mostrarFormulario(); })   // sem resposta: deixa abrir; o servidor decide ao salvar
        .then(function () { btn.disabled = false; });
    });
  }

  /* Em tela larga a lista cabe na janela sem rolar a página: se a altura natural (cartão de Filtros e lista, que
     têm a mesma altura) passar do que sobra embaixo do cabeçalho, os dois encolhem até caber; o Filtros rola por
     dentro e a tabela mostra menos linhas por tela. Mede sempre a altura natural primeiro (limpa e remede),
     então volta a crescer sozinho quando a janela aumenta. */
  var ALTURA_MINIMA_LISTA = 260;
  function ajustarAlturaLista() {
    var f = el('lancFiltros'), cartoes = [el('lancListaCartao'), el('lancSolicitacoesSec')];
    if (!f) return;
    f.style.height = ''; f.style.minHeight = ''; f.style.overflowY = '';
    cartoes.forEach(function (c) { c.style.height = ''; c.style.minHeight = ''; });
    var largo = window.matchMedia && window.matchMedia('(min-width:1500px)').matches;
    if (!largo || !f.offsetParent) return;
    var y = window.pageYOffset || 0;
    var topo = f.getBoundingClientRect().top + y;
    var fim = f.parentNode.getBoundingClientRect().bottom + y;
    // o que a página ainda põe embaixo dos cartões: margem inferior do conteúdo + rodapé (medidos, não estimados)
    var wrap = f.closest('.wrap'), rodape = document.querySelector('footer');
    var abaixo = (wrap ? parseFloat(getComputedStyle(wrap).paddingBottom) || 0 : 0) + (rodape ? rodape.offsetHeight : 0);
    var natural = fim - topo;
    var disponivel = Math.max(ALTURA_MINIMA_LISTA, Math.floor(window.innerHeight - topo - abaixo - 2));
    // os cartões ocupam exatamente o que sobra da janela: a página não rola; o Filtros e a tabela rolam por dentro
    var alvo = disponivel;
    function aplicar(h) {
      f.style.height = h + 'px'; f.style.overflowY = 'auto';
      cartoes.forEach(function (c) { c.style.height = h + 'px'; });
    }
    aplicar(alvo);
    // conferência: se a página ainda rola (algo abaixo que a conta não previu), tira o excesso dos cartões
    var sobra = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if (sobra > 0) aplicar(Math.max(ALTURA_MINIMA_LISTA, alvo - sobra));
  }

  function abrir(municipios) {
    municipios = municipios || [];
    var primeiraVez = !iniciado;
    if (primeiraVez) {
      montar(); iniciado = true;
      window.addEventListener('resize', ajustarAlturaLista);
      window.addEventListener('load', ajustarAlturaLista);
    }
    setTimeout(ajustarAlturaLista, 0);
    setTimeout(ajustarAlturaLista, 400);   // depois do layout e das fontes assentarem
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
