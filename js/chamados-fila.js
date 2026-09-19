/* Central de Chamados — fila da equipe de TI (página com login). */
(function () {
  'use strict';
  var C = window.CHAMADOS, U = window.CHUI, el = U.el, M = C.meta;
  var todos = [], vistos = null, novos = {}, aberto = null, carregando = false, refazer = false, ultimaCarga = null;
  var filtro = { busca: '', status: 'ativos', prioridade: '', categoria: '', diretoria: '', resp: '', ordem: 'urgencia', visao: 'lista', vencidos: false };
  var area = document.getElementById('area');

  function nomeEquipe() {
    var a = window.ADMIN_AUTH, s = a && a.sessaoAtual && a.sessaoAtual();
    var mail = (s && s.user && s.user.email) || '';
    if (!mail) return 'Equipe de TI';
    return mail.split('@')[0].split('.').map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
  }
  var eu = nomeEquipe();
  function iniciais(n) { return (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join(''); }
  function ativo(c) { return M.status[c.status].ativo; }
  function baseUrl(pag) { return new URL(pag, location.href).href; }

  /* --------------------------------------------------------------- filtros */
  function passa(c) {
    var f = filtro;
    if (f.status === 'ativos' && !ativo(c)) return false;
    if (f.status === 'resolvidos' && ativo(c)) return false;
    if (f.status !== 'ativos' && f.status !== 'resolvidos' && f.status !== 'todos' && c.status !== f.status) return false;
    if (f.vencidos) { var p = U.prazo(c); if (!p || p.nivel !== 'estourado') return false; }
    if (f.prioridade && c.prioridade !== f.prioridade) return false;
    if (f.categoria && c.categoria !== f.categoria) return false;
    if (f.diretoria && c.diretoria !== f.diretoria) return false;
    if (f.resp === '__meus' && c.responsavel_nome !== eu) return false;
    if (f.resp === '__sem' && c.responsavel_nome) return false;
    if (f.resp && f.resp.charAt(0) !== '_' && c.responsavel_nome !== f.resp) return false;
    if (f.busca) {
      var alvo = [c.codigo, '#' + c.numero, c.assunto, c.solicitante_nome, c.diretoria, c.departamento, c.setor, c.problema, c.local, c.descricao, c.responsavel_nome].join(' ').toLowerCase();
      if (f.busca.toLowerCase().split(/\s+/).some(function (t) { return alvo.indexOf(t) < 0; })) return false;
    }
    return true;
  }
  function ordenar(lista) {
    var o = filtro.ordem;
    return lista.slice().sort(function (a, b) {
      if (o === 'recentes') return a.criado_em < b.criado_em ? 1 : -1;
      if (o === 'antigos') return a.criado_em < b.criado_em ? -1 : 1;
      var aa = ativo(a), ab = ativo(b);
      if (aa !== ab) return aa ? -1 : 1;
      if (aa) return new Date(a.prazo_em || a.criado_em) - new Date(b.prazo_em || b.criado_em);
      return a.atualizado_em < b.atualizado_em ? 1 : -1;
    });
  }

  /* ------------------------------------------------------------------ KPIs */
  function desenharKpis() {
    var ct = { aberto: 0, em_atendimento: 0, aguardando_usuario: 0 }, venc = 0, enc7 = 0, notas = [];
    var lim = Date.now() - 7 * 86400000;
    todos.forEach(function (c) {
      if (ct[c.status] != null) ct[c.status]++;
      var p = U.prazo(c); if (p && p.nivel === 'estourado') venc++;
      if (!ativo(c) && c.status !== 'cancelado' && c.resolvido_em && new Date(c.resolvido_em).getTime() > lim) enc7++;
      if (c.avaliacao_nota) notas.push(c.avaliacao_nota);
    });
    var media = notas.length ? (notas.reduce(function (s, n) { return s + n; }, 0) / notas.length).toFixed(1).replace('.', ',') : null;
    var defs = [
      { k: 'aberto', rot: 'Na fila', v: ct.aberto, sub: 'esperando um técnico', cor: 'azul', on: filtro.status === 'aberto' && !filtro.vencidos },
      { k: 'em_atendimento', rot: 'Em atendimento', v: ct.em_atendimento, sub: 'sendo resolvidos', cor: 'ambar', on: filtro.status === 'em_atendimento' && !filtro.vencidos },
      { k: 'aguardando_usuario', rot: 'Aguardando usuário', v: ct.aguardando_usuario, sub: 'pendentes de resposta', cor: 'roxo', on: filtro.status === 'aguardando_usuario' && !filtro.vencidos },
      { k: '__vencidos', rot: 'Prazo vencido', v: venc, sub: 'precisam de atenção', cor: 'vermelho', on: filtro.vencidos, alerta: venc > 0 },
      { k: 'resolvidos', rot: 'Encerrados (7 dias)', v: enc7, sub: media ? 'satisfação média ' + media + ' / 5' : 'sem avaliações ainda', cor: 'verde', on: filtro.status === 'resolvidos' && !filtro.vencidos }
    ];
    document.getElementById('kpis').replaceChildren.apply(document.getElementById('kpis'), defs.map(function (d) {
      var b = el('button', { type: 'button', class: 'ch-kpi cor-' + d.cor + (d.on ? ' on' : '') + (d.alerta ? ' alerta' : ''), 'aria-pressed': d.on ? 'true' : 'false' },
        [el('small', { text: d.rot }), el('b', { text: String(d.v) }), el('span', { text: d.sub })]);
      b.addEventListener('click', function () {
        if (d.k === '__vencidos') { filtro.vencidos = !filtro.vencidos; if (filtro.vencidos) filtro.status = 'ativos'; }
        else { filtro.vencidos = false; filtro.status = d.on ? 'ativos' : d.k; }
        sincronizarControles(); desenhar();
      });
      return b;
    }));
  }

  /* --------------------------------------------------------------- cartões */
  function cartao(c) {
    var pz = U.prazo(c), cat = M.categorias[c.categoria];
    var b = el('button', { type: 'button', class: 'ch-item cor-prio-' + c.prioridade, 'data-id': c.id, 'aria-label': 'Abrir chamado ' + c.numero + ': ' + c.assunto }, [
      el('span', { class: 'ch-num', text: '#' + c.numero }),
      el('div', { class: 'ch-corpo' }, [
        el('div', { class: 'ch-assunto' }, [novos[c.id] ? el('span', { class: 'ch-novo', text: 'NOVO' }) : null, c.assunto]),
        el('div', { class: 'ch-meta' }, [
          el('span', null, [U.icone('usuario'), c.solicitante_nome]),
          el('span', { text: [c.departamento, c.setor].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' › ') || '—' }),
          el('span', null, [U.icone(c.categoria), c.problema || (cat ? cat.rot : c.categoria)])
        ])
      ]),
      el('div', { class: 'ch-lado' }, [
        el('div', { class: 'ch-lado-linha' }, [U.pilula('prioridade', c.prioridade), U.pilula('status', c.status)]),
        el('div', { class: 'ch-lado-linha' }, [
          pz ? el('span', { class: 'ch-prazo ' + pz.nivel }, [U.icone('relogio'), pz.texto]) : el('span', { class: 'ch-tempo-rel', text: 'atualizado ' + U.relativo(c.atualizado_em) }),
          el('span', { class: 'ch-avatar' + (c.responsavel_nome ? '' : ' vazio'), 'data-tip': c.responsavel_nome || 'Sem responsável', text: c.responsavel_nome ? iniciais(c.responsavel_nome) : '?' })
        ])
      ])
    ]);
    b.addEventListener('click', function () { abrirGaveta(c.id); });
    return b;
  }

  function desenhar() {
    desenharKpis();
    var lista = ordenar(todos.filter(passa));
    var ativos = todos.filter(ativo).length;
    document.getElementById('statusFila').textContent = lista.length + (lista.length === 1 ? ' chamado' : ' chamados') + ' na visualização · ' + todos.length + ' no total' +
      (ultimaCarga ? ' · atualizado às ' + ultimaCarga : '');
    document.title = (ativos ? '(' + ativos + ') ' : '') + 'Chamados | Fila de atendimento';

    if (!todos.length) {
      area.replaceChildren(el('div', { class: 'ch-vazio ch-cartao', style: 'background:#fff;border:1px solid var(--ch-linha);border-radius:16px' }, [U.icone('suporte'), el('div', { text: 'Nenhum chamado ainda. Quando alguém abrir um pelo formulário público, ele aparece aqui.' })]));
      return;
    }
    if (!lista.length) {
      area.replaceChildren(el('div', { class: 'ch-vazio', style: 'background:#fff;border:1px solid var(--ch-linha);border-radius:16px' }, [U.icone('buscar'), el('div', { text: 'Nenhum chamado combina com esses filtros.' })]));
      return;
    }
    if (filtro.visao === 'quadro') {
      var cols = [['aberto', 'Na fila'], ['em_atendimento', 'Em atendimento'], ['aguardando_usuario', 'Aguardando usuário']];
      if (filtro.status !== 'ativos') cols.push(['resolvido', 'Resolvidos']);   // com "Em aberto" essa coluna nunca teria nada
      area.replaceChildren(el('div', { class: 'ch-quadro' }, cols.map(function (col) {
        var itens = lista.filter(function (c) { return col[0] === 'resolvido' ? (c.status === 'resolvido' || c.status === 'fechado') : c.status === col[0]; });
        return el('div', { class: 'ch-col cor-' + M.status[col[0]].cor }, [
          el('h3', null, [col[1], el('span', { text: String(itens.length) })]),
          itens.length ? el('div', { class: 'ch-lista' }, itens.map(cartao)) : el('div', { class: 'ch-col-vazia', text: 'Nada aqui' })
        ]);
      })));
    } else {
      area.replaceChildren(el('div', { class: 'ch-lista' }, lista.map(cartao)));
    }
  }

  /* -------------------------------------------------------------- gaveta */
  var gaveta = document.getElementById('gaveta'), fundo = document.getElementById('fundo'), retorno = null, modoNota = false;

  function fechar() {
    aberto = null;
    gaveta.classList.remove('show'); fundo.classList.remove('show');
    gaveta.setAttribute('aria-hidden', 'true');
    setTimeout(function () { if (!aberto) fundo.hidden = true; }, 420);
    if (retorno && retorno.focus) retorno.focus();
  }
  fundo.addEventListener('click', fechar);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberto) fechar(); });

  function abrirGaveta(id) {
    aberto = id; retorno = document.activeElement; modoNota = false;
    fundo.hidden = false; void fundo.offsetWidth;
    fundo.classList.add('show'); gaveta.classList.add('show'); gaveta.setAttribute('aria-hidden', 'false');
    desenharGaveta(true);
    gaveta.focus({ preventScroll: true });
  }

  function fato(t, v) { return el('div', { class: 'ch-fato' }, [el('dt', { text: t }), el('dd', null, v == null || v === '' ? '—' : v)]); }

  function timelineEquipe(evs) {
    var ul = el('ol', { class: 'ch-tempo' });
    var ico = { abertura: 'check', status: 'atualizar', prioridade: 'alerta', atribuicao: 'usuario', resposta: 'enviar', solicitante: 'usuario', avaliacao: 'estrela', nota: 'cadeado' };
    evs.slice().reverse().forEach(function (e) {
      var tit = U.textoEvento(e);
      ul.appendChild(el('li', { class: 'ch-ev ' + e.tipo + (e.tipo === 'resposta' ? ' equipe' : '') }, [
        el('span', { class: 'ch-ev-no' }, U.icone(ico[e.tipo] || 'relogio')),
        el('div', { class: 'ch-ev-cab' }, [
          el('b', { text: tit || e.autor + (e.tipo === 'solicitante' ? ' (solicitante)' : '') }),
          tit ? el('span', { class: 'ch-dica', text: 'por ' + e.autor }) : null,
          e.tipo === 'nota' ? el('span', { class: 'ch-etiqueta-nota', text: 'Nota interna' }) : null,
          el('time', { datetime: e.criado_em, text: U.fmtData(e.criado_em) })
        ]),
        e.texto && e.tipo !== 'abertura' ? el('div', { class: 'ch-ev-msg', text: e.texto }) : null
      ]));
    });
    return ul;
  }

  function aplicar(id, mudancas, msgOk) {
    return C.atualizar(id, mudancas).then(function () {
      if (msgOk) U.aviso(msgOk);
      return carregar(true);
    }, function (e) { U.aviso(e.message, 'erro'); });
  }

  function desenharGaveta(recarregarEventos) {
    var c = todos.filter(function (x) { return x.id === aberto; })[0];
    if (!c) { fechar(); return; }
    var pz = U.prazo(c);
    var rascunhoEl = document.getElementById('gTexto'), rascunho = rascunhoEl ? rascunhoEl.value : '';

    var selStatus = el('select', { id: 'gStatus' }, Object.keys(M.status).map(function (k) { return el('option', { value: k, selected: k === c.status, text: M.status[k].rot }); }));
    var selPrio = el('select', { id: 'gPrio' }, Object.keys(M.prioridades).map(function (k) { return el('option', { value: k, selected: k === c.prioridade, text: M.prioridades[k].rot }); }));
    selStatus.addEventListener('change', function () { aplicar(c.id, { status: selStatus.value }, 'Status atualizado.'); });
    selPrio.addEventListener('change', function () { aplicar(c.id, { prioridade: selPrio.value }, 'Prioridade atualizada — prazo recalculado.'); });

    var nomes = {}; todos.forEach(function (x) { if (x.responsavel_nome) nomes[x.responsavel_nome] = 1; }); nomes[eu] = 1;
    var respIn = el('input', { type: 'text', id: 'gResp', list: 'gRespLista', maxlength: '100', placeholder: 'Nome do técnico', value: c.responsavel_nome || '' });
    var respLista = el('datalist', { id: 'gRespLista' }, Object.keys(nomes).map(function (n) { return el('option', { value: n }); }));
    var btnResp = el('button', { class: 'ch-btn pequeno', type: 'button', text: 'Salvar' });
    btnResp.addEventListener('click', function () { aplicar(c.id, { responsavel: respIn.value.trim() }, 'Responsável atualizado.'); });

    var btnAssumir = c.responsavel_nome !== eu ? el('button', { class: 'ch-btn primario pequeno', type: 'button', text: 'Assumir este chamado' }) : null;
    if (btnAssumir) btnAssumir.addEventListener('click', function () { aplicar(c.id, { assumir: true }, 'Você assumiu o chamado.'); });

    var area2 = el('textarea', { id: 'gTexto', maxlength: '4000', placeholder: modoNota ? 'Anotação visível só para a equipe de TI…' : 'Mensagem para o solicitante (ele vê pela tela de acompanhamento)…' });
    if (rascunho) area2.value = rascunho;
    var btnEnviar = el('button', { class: 'ch-btn primario', type: 'button' }, [U.icone('enviar'), modoNota ? 'Salvar nota' : 'Enviar resposta']);
    btnEnviar.addEventListener('click', function () {
      var t = area2.value.trim();
      if (!t) { U.aviso('Escreva a mensagem antes de enviar.', 'erro'); area2.focus(); return; }
      btnEnviar.disabled = true;
      aplicar(c.id, { texto: t, publico: !modoNota }, modoNota ? 'Nota interna salva.' : 'Resposta enviada ao solicitante.').then(function () { btnEnviar.disabled = false; });
    });
    var btnResolver = el('button', { class: 'ch-btn', type: 'button', text: 'Marcar como resolvido' });
    btnResolver.addEventListener('click', function () {
      var t = area2.value.trim();
      aplicar(c.id, { status: 'resolvido', texto: t || 'Chamado resolvido. Se o problema voltar, responda por aqui que reabrimos.', publico: true }, 'Chamado resolvido.');
    });
    var seg = el('div', { class: 'ch-seg', role: 'group', 'aria-label': 'Tipo de mensagem' }, [
      el('button', { type: 'button', class: modoNota ? '' : 'on', text: 'Resposta pública' }),
      el('button', { type: 'button', class: modoNota ? 'on' : '', text: 'Nota interna' })
    ]);
    seg.children[0].addEventListener('click', function () { modoNota = false; desenharGaveta(false); });
    seg.children[1].addEventListener('click', function () { modoNota = true; desenharGaveta(false); });
    var rapidas = ['Pode descrever com mais detalhes?', 'Estamos verificando e retornamos em breve.', 'Precisamos ir até o seu local. Qual o melhor horário?', 'Já resolvemos. Pode confirmar se está tudo certo?']
      .map(function (t) { return el('button', { type: 'button', text: t, onclick: function () { area2.value = (area2.value ? area2.value + ' ' : '') + t; area2.focus(); } }); });

    var lista = el('div', { id: 'gTempo' }, el('p', { class: 'ch-dica', text: 'Carregando histórico…' }));

    gaveta.replaceChildren(
      el('div', { class: 'ch-g-cab' }, [
        el('span', { class: 'cod' }, [c.codigo, el('small', { text: '#' + c.numero })]),
        el('div', { style: 'display:flex;gap:8px' }, [
          el('button', { class: 'ch-btn pequeno', type: 'button', onclick: function () {
            U.copiar(baseUrl('acompanhar-chamado.html') + '?codigo=' + encodeURIComponent(c.codigo)).then(function () { U.aviso('Link de acompanhamento copiado.'); }, function () { U.aviso('Não consegui copiar.', 'erro'); });
          } }, [U.icone('link'), 'Link público']),
          el('button', { class: 'ch-btn pequeno', type: 'button', 'aria-label': 'Fechar', onclick: fechar }, U.icone('fechar'))
        ])
      ]),
      el('div', { class: 'ch-g-corpo' }, [
        el('h2', { text: c.assunto }),
        el('div', { class: 'ch-g-pilulas' }, [U.pilula('status', c.status), U.pilula('prioridade', c.prioridade),
          pz ? el('span', { class: 'ch-prazo ' + pz.nivel }, [U.icone('relogio'), pz.texto]) : null]),
        el('div', { class: 'ch-g-acoes' }, [
          btnAssumir ? el('div', { class: 'cheia' }, btnAssumir) : null,
          el('div', { class: 'ch-campo' }, [el('label', { for: 'gStatus', text: 'Situação' }), selStatus]),
          el('div', { class: 'ch-campo' }, [el('label', { for: 'gPrio', text: 'Prioridade' }), selPrio]),
          el('div', { class: 'ch-campo cheia' }, [el('label', { for: 'gResp', text: 'Responsável' }), el('div', { class: 'linha' }, [respIn, btnResp]), respLista])
        ]),
        el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Descrição do problema' }), el('div', { class: 'ch-descricao', text: c.descricao })]),
        el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Solicitante' }), el('dl', { class: 'ch-fatos' }, [
          fato('Nome', c.solicitante_nome), fato('Diretoria', c.diretoria), fato('Departamento', c.departamento), fato('Setor', c.setor + (c.local ? ' · ' + c.local : '')),
          fato('E-mail', c.solicitante_email ? el('a', { href: 'mailto:' + c.solicitante_email, text: c.solicitante_email }) : null),
          fato('Telefone / ramal', c.solicitante_telefone ? el('a', { href: 'tel:' + c.solicitante_telefone.replace(/[^\d+]/g, ''), text: c.solicitante_telefone }) : null),
          fato('Problema', c.problema), fato('Categoria', (M.categorias[c.categoria] || {}).rot), fato('Aberto em', U.fmtData(c.criado_em)),
          fato('Prazo (SLA)', U.fmtData(c.prazo_em) + ' · ' + M.prioridades[c.prioridade].horas + ' h'),
          fato('Avaliação', c.avaliacao_nota ? c.avaliacao_nota + ' de 5' + (c.avaliacao_comentario ? ' — ' + c.avaliacao_comentario : '') : null)
        ])]),
        el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Responder' }), el('div', { class: 'ch-compor' + (modoNota ? ' nota' : '') }, [
          seg, area2,
          modoNota ? el('p', { class: 'ch-aviso-nota', text: 'Notas internas não aparecem na tela pública de acompanhamento.' }) : el('div', { class: 'ch-rapidas' }, rapidas),
          el('div', { class: 'ch-compor-bar' }, [btnResolver, btnEnviar])
        ])]),
        el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Histórico' }), lista])
      ])
    );
    if (recarregarEventos !== false || !gaveta.__eventos) {
      C.eventos(c.id).then(function (evs) {
        gaveta.__eventos = evs;
        var alvo = document.getElementById('gTempo');
        if (alvo && aberto === c.id) alvo.replaceChildren(timelineEquipe(evs));
      }, function (e) { var alvo = document.getElementById('gTempo'); if (alvo) alvo.textContent = e.message; });
    } else {
      document.getElementById('gTempo').replaceChildren(timelineEquipe(gaveta.__eventos));
    }
  }

  /* -------------------------------------------------------------- carregar */
  function carregar(silencioso) {
    if (carregando) { refazer = true; return Promise.resolve(); }   // pedido durante uma carga: repete ao terminar
    carregando = true;
    var st = document.getElementById('statusFila');
    if (!silencioso && !todos.length) st.textContent = 'Carregando chamados…';
    return C.listar().then(function (lista) {
      var ids = {}; lista.forEach(function (c) { ids[c.id] = 1; });
      if (vistos) lista.forEach(function (c) { if (!vistos[c.id]) novos[c.id] = true; });
      vistos = ids;
      todos = lista;
      var d = new Date(); ultimaCarga = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
      desenhar();
      if (aberto) desenharGaveta(true);
    }, function (e) { st.textContent = ''; U.aviso(e.message, 'erro'); area.replaceChildren(el('div', { class: 'ch-vazio', style: 'background:#fff;border:1px solid var(--ch-linha);border-radius:16px' }, [U.icone('alerta'), el('div', { text: e.message })])); })
      .then(function () {
        carregando = false;
        if (refazer) { refazer = false; return carregar(true); }
      });
  }

  /* ---------------------------------------------------------------- controles */
  function sincronizarControles() {
    Array.prototype.forEach.call(document.querySelectorAll('#segStatus button'), function (b) { b.classList.toggle('on', b.dataset.v === filtro.status && !filtro.vencidos); });
    Array.prototype.forEach.call(document.querySelectorAll('#segVisao button'), function (b) { b.classList.toggle('on', b.dataset.v === filtro.visao); });
  }
  function popularSelects() {
    var p = document.getElementById('fPrioridade'), c = document.getElementById('fCategoria'), r = document.getElementById('fResp');
    Object.keys(M.prioridades).reverse().forEach(function (k) { p.appendChild(el('option', { value: k, text: M.prioridades[k].rot })); });
    Object.keys(M.categorias).forEach(function (k) { c.appendChild(el('option', { value: k, text: M.categorias[k].rot })); });
    r.dataset.base = r.innerHTML;
  }
  function atualizarDiretorias() {
    var s = document.getElementById('fDiretoria'), atual = s.value, nomes = {};
    todos.forEach(function (c) { if (c.diretoria) nomes[c.diretoria] = 1; });
    s.replaceChildren.apply(s, [el('option', { value: '', text: 'Toda diretoria' })].concat(Object.keys(nomes).sort().map(function (n) { return el('option', { value: n, text: n }); })));
    s.value = atual;
    s.hidden = !Object.keys(nomes).length;
  }
  function atualizarResponsaveis() {
    var r = document.getElementById('fResp'), atual = r.value, nomes = {};
    todos.forEach(function (c) { if (c.responsavel_nome && c.responsavel_nome !== eu) nomes[c.responsavel_nome] = 1; });
    r.innerHTML = r.dataset.base;
    Object.keys(nomes).sort().forEach(function (n) { r.appendChild(el('option', { value: n, text: n })); });
    r.value = atual;
  }

  function csv() {
    var cab = ['Número', 'Código', 'Aberto em', 'Situação', 'Prioridade', 'Categoria', 'Problema', 'Assunto', 'Solicitante', 'Diretoria', 'Departamento', 'Setor', 'Local', 'E-mail', 'Telefone', 'Responsável', 'Prazo (SLA)', 'Resolvido em', 'Avaliação'];
    var esc = function (v) { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var linhas = ordenar(todos.filter(passa)).map(function (c) {
      return [c.numero, c.codigo, U.fmtData(c.criado_em), M.status[c.status].rot, M.prioridades[c.prioridade].rot, (M.categorias[c.categoria] || {}).rot, c.problema, c.assunto, c.solicitante_nome, c.diretoria, c.departamento, c.setor, c.local,
        c.solicitante_email, c.solicitante_telefone, c.responsavel_nome, U.fmtData(c.prazo_em), U.fmtData(c.resolvido_em), c.avaliacao_nota].map(esc).join(';');
    });
    var blob = new Blob(['﻿' + [cab.join(';')].concat(linhas).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'chamados-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    U.aviso('Planilha gerada com ' + linhas.length + ' chamados.');
  }

  function ligar() {
    document.getElementById('icoBusca').appendChild(U.icone('buscar'));
    var botao = function (id, ico, txt) { document.getElementById(id).replaceChildren(U.icone(ico), document.createTextNode(txt)); };
    botao('btnAtualizar', 'atualizar', 'Atualizar'); botao('btnCsv', 'baixar', 'Exportar'); botao('btnLinks', 'link', 'Link para usuários'); botao('btnCadastros', 'lista', 'Cadastros auxiliares');
    document.querySelector('#segVisao [data-v="lista"]').appendChild(U.icone('lista'));
    document.querySelector('#segVisao [data-v="quadro"]').appendChild(U.icone('quadro'));
    popularSelects();
    if (C.modo === 'local') document.getElementById('faixaDemo').hidden = false;

    var t = 0;
    document.getElementById('busca').addEventListener('input', function (e) { clearTimeout(t); var v = e.target.value.trim(); t = setTimeout(function () { filtro.busca = v; desenhar(); }, 160); });
    document.getElementById('segStatus').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; filtro.status = b.dataset.v; filtro.vencidos = false; sincronizarControles(); desenhar(); });
    document.getElementById('segVisao').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; filtro.visao = b.dataset.v; sincronizarControles(); desenhar(); });
    [['fPrioridade', 'prioridade'], ['fCategoria', 'categoria'], ['fDiretoria', 'diretoria'], ['fResp', 'resp'], ['fOrdem', 'ordem']].forEach(function (p) {
      document.getElementById(p[0]).addEventListener('change', function (e) { filtro[p[1]] = e.target.value; desenhar(); });
    });
    document.getElementById('btnAtualizar').addEventListener('click', function () { novos = {}; carregar(false).then(function () { U.aviso('Fila atualizada.'); }); });
    document.getElementById('btnCsv').addEventListener('click', csv);
    document.getElementById('btnLinks').addEventListener('click', function () {
      U.copiar(baseUrl('abrir-chamado.html')).then(function () { U.aviso('Link do formulário copiado — compartilhe com os usuários.'); }, function () { U.aviso('Não consegui copiar o link.', 'erro'); });
    });
    var demo = document.getElementById('btnDemo');
    if (demo) demo.addEventListener('click', function () { C._povoarDemo().then(function () { return carregar(true); }).then(function () { U.aviso('Chamados de exemplo criados.'); }); });

    setInterval(function () { if (!document.hidden) carregar(true).then(function () { atualizarResponsaveis(); atualizarDiretorias(); }); }, 45000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) carregar(true); });
    carregar(false).then(function () { atualizarResponsaveis(); atualizarDiretorias(); });
  }
  ligar();
})();
