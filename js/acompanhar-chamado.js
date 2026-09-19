/* Tela pública "Acompanhar chamados": lista de TODOS os chamados de todos os
   setores, com a situação de cada um. Sem login e sem código: a lista e o
   detalhe vêm de listar_chamados_publico / detalhe_chamado_publico, que nunca
   devolvem e-mail, telefone, notas internas nem o código secreto do chamado.
   Só os chamados abertos neste navegador ("meus") permitem responder e avaliar,
   porque só este navegador guarda o código. */
(function () {
  'use strict';
  var C = window.CHAMADOS, U = window.CHUI, el = U.el, M = C.meta;
  var lista = [], meus = {};                       // meus: número -> código secreto
  var filtro = { busca: '', sit: 'todos', diretoria: '', setor: '', meus: false };
  var aberto = null, retorno = null, destaque = null, carregando = false, erroCarga = '';
  var gaveta = document.getElementById('gaveta'), fundo = document.getElementById('fundo');

  document.getElementById('marcaIcone').appendChild(U.icone('suporte'));
  document.getElementById('icoBusca').appendChild(U.icone('buscar'));
  if (C.modo === 'local') document.getElementById('faixaDemo').hidden = false;
  document.getElementById('btnAtualizar').replaceChildren(U.icone('atualizar'), document.createTextNode('Atualizar'));

  var ativo = function (c) { return M.status[c.status].ativo; };

  /* ------------------------------------------------ "meus chamados" (neste navegador) */
  function mapearMeus() {
    var pendentes = [];
    meus = {};
    C.meus().forEach(function (m) {
      if (m.numero) meus[m.numero] = m.codigo;
      else pendentes.push(m);
    });
    // registros antigos sem número: descobre pelo código, uma vez
    return Promise.all(pendentes.map(function (m) {
      return C.consultar(m.codigo).then(function (d) {
        if (d) { C.lembrar(m.codigo, m.assunto, d.chamado.numero); meus[d.chamado.numero] = m.codigo; }
      }, function () {});
    }));
  }

  /* --------------------------------------------------------------- filtros */
  function passa(c) {
    var f = filtro;
    if (f.sit === 'abertos' && !ativo(c)) return false;
    if (f.sit === 'resolvidos' && ativo(c)) return false;
    if (f.diretoria && c.diretoria !== f.diretoria) return false;
    if (f.setor && c.setor !== f.setor) return false;
    if (f.meus && !meus[c.numero]) return false;
    if (f.busca) {
      var alvo = [c.numero, '#' + c.numero, c.solicitante, c.diretoria, c.departamento, c.setor, c.problema, c.responsavel_nome, M.status[c.status].rot].join(' ').toLowerCase();
      if (f.busca.toLowerCase().split(/\s+/).some(function (t) { return alvo.indexOf(t) < 0; })) return false;
    }
    return true;
  }

  function desenharKpis() {
    var ct = { aberto: 0, em_atendimento: 0, aguardando_usuario: 0, enc: 0 };
    lista.forEach(function (c) { if (ct[c.status] != null) ct[c.status]++; else if (!ativo(c) && c.status !== 'cancelado') ct.enc++; });
    var defs = [
      ['Aguardando atendimento', ct.aberto, 'na fila da equipe', 'azul', 'abertos'],
      ['Em atendimento', ct.em_atendimento, 'um técnico cuidando', 'ambar', 'abertos'],
      ['Aguardando resposta', ct.aguardando_usuario, 'esperando o solicitante', 'roxo', 'abertos'],
      ['Resolvidos', ct.enc, 'chamados concluídos', 'verde', 'resolvidos']
    ];
    var box = document.getElementById('kpis');
    box.replaceChildren.apply(box, defs.map(function (d) {
      var b = el('button', { type: 'button', class: 'ch-kpi cor-' + d[3] }, [el('small', { text: d[0] }), el('b', { text: String(d[1]) }), el('span', { text: d[2] })]);
      b.addEventListener('click', function () { filtro.sit = d[4]; sincronizar(); desenhar(); });
      return b;
    }));
  }

  function popularSelects() {
    var dirs = {}, sets = {};
    lista.forEach(function (c) { if (c.diretoria) dirs[c.diretoria] = 1; if (c.setor) sets[c.setor] = 1; });
    [['fDiretoria', dirs, 'Toda diretoria', 'diretoria'], ['fSetor', sets, 'Todo setor', 'setor']].forEach(function (p) {
      var s = document.getElementById(p[0]), nomes = Object.keys(p[1]).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
      s.replaceChildren.apply(s, [el('option', { value: '', text: p[2] })].concat(nomes.map(function (n) { return el('option', { value: n, text: n }); })));
      s.value = filtro[p[3]] || '';
      s.hidden = !nomes.length;
    });
  }

  function sincronizar() {
    Array.prototype.forEach.call(document.querySelectorAll('#segSit button'), function (b) { b.classList.toggle('on', b.dataset.v === filtro.sit); });
    Array.prototype.forEach.call(document.querySelectorAll('#segMeus button'), function (b) { b.classList.toggle('on', (b.dataset.v === 'meus') === filtro.meus); });
  }

  /* ---------------------------------------------------------------- tabela */
  // "Diretoria › Departamento" sem repetir o que já aparece como setor (chamado aberto por um departamento ou diretoria)
  function hierarquia(c) { return [c.diretoria, c.departamento].filter(function (x) { return x && x !== c.setor; }).join(' › '); }

  function linha(c) {
    var meu = Boolean(meus[c.numero]);
    var tr = el('tr', { class: (meu ? 'meu ' : '') + (destaque === c.numero ? 'destaque' : ''), tabindex: '0', role: 'button', 'aria-label': 'Abrir chamado ' + c.numero }, [
      el('td', null, [el('span', { class: 'num', text: '#' + c.numero }), meu ? el('span', { class: 'ch-meu-tag', text: 'MEU' }) : null]),
      el('td', { class: 'data', text: U.fmtData(c.criado_em) }),
      el('td', { class: 'nome', text: c.solicitante }),
      el('td', { class: 'setor' }, [c.setor || '—', hierarquia(c) ? el('small', { text: hierarquia(c) }) : null]),
      el('td', null, el('div', { class: 'ch-prob-mini' }, [el('i', null, U.icone(c.categoria)), el('span', { text: c.problema || (M.categorias[c.categoria] || {}).rot || '—' })])),
      el('td', null, U.pilula('status', c.status)),
      el('td', { class: 'resp' + (c.responsavel_nome ? '' : ' vazio'), text: c.responsavel_nome || 'Ainda sem técnico' })
    ]);
    var abrir = function () { abrirGaveta(c.numero); };
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    return tr;
  }

  function desenhar() {
    desenharKpis();
    var vis = lista.filter(passa);
    document.getElementById('statusFila').textContent = vis.length + (vis.length === 1 ? ' chamado' : ' chamados') + ' na lista · ' + lista.length + ' no total';
    var cab = el('tr', null, ['Nº', 'Aberto em', 'Nome', 'Setor', 'Problema', 'Situação', 'Atendente'].map(function (t) { return el('th', { text: t }); }));
    var corpo = vis.length ? vis.map(linha)
      : [el('tr', null, el('td', { colspan: '7', class: 'vazio-msg', text: erroCarga && !lista.length ? erroCarga : lista.length ? 'Nenhum chamado combina com esses filtros.' : 'Nenhum chamado aberto até agora.' }))];
    document.getElementById('tabela').replaceChildren(el('thead', null, cab), el('tbody', null, corpo));
  }

  /* --------------------------------------------------------------- gaveta */
  function fechar() {
    aberto = null;
    gaveta.classList.remove('show'); fundo.classList.remove('show'); gaveta.setAttribute('aria-hidden', 'true');
    setTimeout(function () { if (!aberto) fundo.hidden = true; }, 420);
    if (retorno && retorno.focus) retorno.focus();
  }
  fundo.addEventListener('click', fechar);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberto) fechar(); });

  function abrirGaveta(numero) {
    aberto = numero; retorno = document.activeElement;
    fundo.hidden = false; void fundo.offsetWidth;
    fundo.classList.add('show'); gaveta.classList.add('show'); gaveta.setAttribute('aria-hidden', 'false');
    gaveta.replaceChildren(el('div', { class: 'ch-g-corpo' }, el('p', { class: 'ch-dica', text: 'Carregando…' })));
    carregarDetalhe(numero, true);
    gaveta.focus({ preventScroll: true });
  }

  function etapas(status) {
    var f = { aberto: 0, em_atendimento: 1, aguardando_usuario: 1, resolvido: 2, fechado: 2, cancelado: -1 }[status];
    if (f < 0) return null;
    var nomes = [['Aberto', 'Na fila da equipe'], ['Em atendimento', status === 'aguardando_usuario' ? 'Esperando resposta' : 'Técnico cuidando'], ['Resolvido', 'Problema solucionado']];
    return el('div', { class: 'ch-etapas', role: 'list' }, nomes.map(function (n, i) {
      var cls = 'ch-etapa' + (i <= f ? ' feita' : '') + (i === f ? ' atual' : '');
      if (i === 2 && f === 2) cls += ' ok';
      if (i === 1 && f === 1 && status === 'aguardando_usuario') cls += ' pendente-usuario';
      return el('div', { class: cls, role: 'listitem' }, [el('i', null, U.icone('check')), n[0], el('small', { text: n[1] })]);
    }));
  }
  var ICO_EV = { abertura: 'check', status: 'atualizar', prioridade: 'alerta', atribuicao: 'usuario', resposta: 'enviar', solicitante: 'usuario', avaliacao: 'estrela', nota: 'cadeado' };
  function linhaTempo(eventos) {
    var ol = el('ol', { class: 'ch-tempo' });
    eventos.slice().reverse().forEach(function (e) {
      var titulo = U.textoEvento(e), msg = e.texto && e.tipo !== 'abertura' ? e.texto : null;
      ol.appendChild(el('li', { class: 'ch-ev ' + e.tipo + (e.tipo === 'resposta' ? ' equipe' : '') }, [
        el('span', { class: 'ch-ev-no' }, U.icone(ICO_EV[e.tipo] || 'relogio')),
        el('div', { class: 'ch-ev-cab' }, [
          el('b', { text: titulo || (e.tipo === 'resposta' ? (/equipe/i.test(e.autor) ? e.autor : e.autor + ' · equipe de TI') : e.autor) }),
          titulo ? el('span', { class: 'ch-dica', text: 'por ' + e.autor }) : null,
          el('time', { datetime: e.criado_em, text: U.fmtData(e.criado_em) })
        ]),
        msg ? el('div', { class: 'ch-ev-msg', text: msg }) : null
      ]));
    });
    return ol;
  }
  function fato(t, v) { return el('div', { class: 'ch-fato' }, [el('dt', { text: t }), el('dd', null, v || '—')]); }

  /* responder / avaliar: só para chamados abertos neste navegador */
  function blocoResposta(c, codigo) {
    if (c.status === 'fechado' || c.status === 'cancelado') return null;
    var espera = c.status === 'aguardando_usuario', resolvido = c.status === 'resolvido';
    var area = el('textarea', { id: 'textoResposta', maxlength: '2000', placeholder: espera ? 'Escreva a informação que a equipe pediu…' : resolvido ? 'O problema voltou? Conte aqui e reabrimos o chamado.' : 'Quer acrescentar alguma informação?' });
    var btn = el('button', { class: 'ch-btn primario', type: 'button' }, [U.icone('enviar'), resolvido ? 'Reabrir chamado' : 'Enviar mensagem']);
    btn.addEventListener('click', function () {
      var t = area.value.trim();
      if (t.length < 2) { U.aviso('Escreva a mensagem antes de enviar.', 'erro'); area.focus(); return; }
      btn.disabled = true;
      C.responder(codigo, t).then(function () {
        U.aviso(resolvido ? 'Chamado reaberto. A equipe foi avisada.' : 'Mensagem enviada.');
        return Promise.all([carregarDetalhe(c.numero, true), carregar(true)]);
      }, function (e) { U.aviso(e.message, 'erro'); }).then(function () { btn.disabled = false; });
    });
    return el('div', { class: 'ch-g-secao' }, [el('h3', { text: espera ? 'A equipe precisa de você' : resolvido ? 'Não resolveu?' : 'Enviar uma mensagem' }), el('div', { class: 'ch-resposta' }, [area, el('div', null, btn)])]);
  }
  function blocoAvaliacao(c, codigo) {
    if (c.avaliacao_nota) return el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Sua avaliação' }), el('p', { class: 'ch-dica', text: 'Você avaliou este atendimento com ' + c.avaliacao_nota + ' de 5. Obrigado!' })]);
    if (c.status !== 'resolvido' && c.status !== 'fechado') return null;
    var nota = 0, estrelas = el('div', { class: 'ch-estrelas', role: 'radiogroup', 'aria-label': 'Nota do atendimento' });
    var botoes = [1, 2, 3, 4, 5].map(function (n) {
      var b = el('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': n + (n === 1 ? ' estrela' : ' estrelas') }, U.icone('estrela'));
      b.addEventListener('click', function () { nota = n; botoes.forEach(function (x, i) { x.classList.toggle('on', i < n); x.setAttribute('aria-checked', i === n - 1 ? 'true' : 'false'); }); });
      estrelas.appendChild(b); return b;
    });
    var com = el('textarea', { maxlength: '1000', placeholder: 'Quer deixar um comentário? (opcional)' });
    var env = el('button', { class: 'ch-btn', type: 'button', text: 'Enviar avaliação' });
    env.addEventListener('click', function () {
      if (!nota) { U.aviso('Toque nas estrelas para dar uma nota.', 'erro'); return; }
      env.disabled = true;
      C.avaliar(codigo, nota, com.value.trim()).then(function () { U.aviso('Obrigado pela avaliação!'); return carregarDetalhe(c.numero, true); },
        function (e) { U.aviso(e.message, 'erro'); }).then(function () { env.disabled = false; });
    });
    return el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Como foi o atendimento?' }), estrelas, el('div', { class: 'ch-resposta' }, [com, el('div', null, env)])]);
  }

  function desenharDetalhe(d) {
    var c = d.chamado, st = M.status[c.status], codigo = meus[c.numero], pz = U.prazo(c);
    var rascunho = (document.getElementById('textoResposta') || {}).value || '';
    var callout = null;
    if (c.status === 'aguardando_usuario') callout = el('div', { class: 'ch-callout cor-roxo' }, [U.icone('alerta'), el('div', null, [el('b', { text: 'Aguardando resposta do solicitante' }), el('span', { text: codigo ? 'A equipe precisa de uma resposta sua. Escreva abaixo.' : 'A equipe pediu mais informações a quem abriu o chamado.' })])]);
    else if (c.status === 'resolvido') callout = el('div', { class: 'ch-callout cor-verde' }, [U.icone('check'), el('div', null, [el('b', { text: 'Chamado resolvido' }), el('span', { text: codigo ? 'Se o problema voltar, responda abaixo que reabrimos.' : 'O problema foi solucionado.' })])]);
    else if (c.status === 'cancelado' || c.status === 'fechado') callout = el('div', { class: 'ch-callout cor-cinza' }, [U.icone('cadeado'), el('div', null, [el('b', { text: st.rot }), el('span', { text: st.desc })])]);

    gaveta.replaceChildren(
      el('div', { class: 'ch-g-cab' }, [
        el('span', { class: 'cod' }, ['Chamado #' + c.numero, codigo ? el('small', { text: 'seu chamado' }) : null]),
        el('button', { class: 'ch-btn pequeno', type: 'button', 'aria-label': 'Fechar', onclick: fechar }, U.icone('fechar'))
      ]),
      el('div', { class: 'ch-g-corpo' }, [
        el('h2', { text: c.problema || c.assunto }),
        el('div', { class: 'ch-g-pilulas' }, [U.pilula('status', c.status), U.pilula('prioridade', c.prioridade),
          pz ? el('span', { class: 'ch-prazo ' + pz.nivel }, [U.icone('relogio'), pz.nivel === 'estourado' ? 'Prazo previsto ultrapassado' : 'Previsão: ' + U.fmtData(c.prazo_em)]) : null]),
        etapas(c.status), callout,
        el('dl', { class: 'ch-fatos' }, [
          fato('Nome', c.solicitante_nome), fato('Setor', c.setor + (c.local ? ' · ' + c.local : '')),
          c.diretoria ? fato('Diretoria', c.diretoria) : null, c.departamento ? fato('Departamento', c.departamento) : null,
          fato('Aberto em', U.fmtData(c.criado_em)), fato('Atualizado', U.relativo(c.atualizado_em)),
          fato('Atendente', c.responsavel_nome || 'Ainda sem técnico'), fato('Categoria', (M.categorias[c.categoria] || {}).rot)
        ]),
        el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Descrição' }), el('div', { class: 'ch-descricao', text: c.descricao })]),
        codigo ? blocoResposta(c, codigo) : null,
        codigo ? blocoAvaliacao(c, codigo) : null,
        el('div', { class: 'ch-g-secao' }, [el('h3', { text: 'Histórico' }), linhaTempo(d.eventos)])
      ])
    );
    var nova = document.getElementById('textoResposta');
    if (nova && rascunho) nova.value = rascunho;
  }

  function carregarDetalhe(numero, forcar) {
    return C.detalhePublico(numero).then(function (d) {
      if (aberto !== numero) return;
      if (!d) { gaveta.replaceChildren(el('div', { class: 'ch-g-corpo' }, el('p', { class: 'ch-dica', text: 'Chamado não encontrado.' }))); return; }
      desenharDetalhe(d);
    }, function (e) { if (aberto === numero) gaveta.replaceChildren(el('div', { class: 'ch-g-corpo' }, el('p', { class: 'ch-erro-msg', text: e.message }))); });
  }

  /* ---------------------------------------------------------------- carga */
  function carregar(silencioso) {
    if (carregando) return Promise.resolve();
    carregando = true;
    var st = document.getElementById('statusFila');
    if (!silencioso && !lista.length) st.textContent = 'Carregando chamados…';
    return Promise.all([C.listarPublico(), mapearMeus()]).then(function (r) {
      erroCarga = ''; lista = r[0]; popularSelects(); desenhar();
    }, function (e) {
      st.textContent = ''; erroCarga = e.message; desenhar();
      U.aviso(e.message, 'erro');
    }).then(function () { carregando = false; });
  }

  /* -------------------------------------------------------------- controles */
  var t = 0;
  document.getElementById('busca').addEventListener('input', function (e) { clearTimeout(t); var v = e.target.value.trim(); t = setTimeout(function () { filtro.busca = v; desenhar(); }, 150); });
  document.getElementById('segSit').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; filtro.sit = b.dataset.v; sincronizar(); desenhar(); });
  document.getElementById('segMeus').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; filtro.meus = b.dataset.v === 'meus'; sincronizar(); desenhar(); });
  document.getElementById('fDiretoria').addEventListener('change', function (e) { filtro.diretoria = e.target.value; desenhar(); });
  document.getElementById('fSetor').addEventListener('change', function (e) { filtro.setor = e.target.value; desenhar(); });
  document.getElementById('btnAtualizar').addEventListener('click', function () { carregar(false).then(function () { if (aberto) carregarDetalhe(aberto, true); U.aviso('Lista atualizada.'); }); });
  setInterval(function () { if (!document.hidden) { carregar(true); if (aberto) carregarDetalhe(aberto, false); } }, 30000);

  /* chamado recém-enviado: destaca na lista e abre o detalhe */
  var novo = Number(new URLSearchParams(location.search).get('novo'));
  carregar(false).then(function () {
    if (!novo) return;
    destaque = novo;
    var banner = document.getElementById('bannerNovo');
    banner.replaceChildren(U.icone('check'),
      el('div', null, [el('b', { text: 'Chamado #' + novo + ' enviado!' }), el('span', { text: 'A equipe de TI já recebeu. Ele aparece na lista abaixo com a marca "MEU"; acompanhe a situação por aqui.' })]),
      el('button', { type: 'button', 'aria-label': 'Fechar aviso', onclick: function () { banner.hidden = true; } }, U.icone('fechar')));
    banner.hidden = false;
    history.replaceState(null, '', location.pathname);
    desenhar();
    abrirGaveta(novo);
  });
})();
