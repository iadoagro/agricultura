/* Tela de auditoria (pages/logs.html). Duas visões sobre log_eventos:
     - lista: os eventos um a um, mais novos primeiro, 100 por vez;
     - agrupada: o resumo de log_eventos_resumo (database/log-eventos-navegacao.sql)
       por pessoa, ação, página ou módulo — contado no banco, então vale para
       o período inteiro, não só para os 100 eventos carregados na lista.
   Clicar num grupo aplica aquele grupo como filtro e volta para a lista.
   As abas Equipe / Root / Todos separam as movimentações do root (quem
   administra e mais mexe no sistema) das do resto da equipe — senão o root
   domina a lista e esconde o que os outros fizeram. */
(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  function el(id) { return document.getElementById(id); }
  var lista = el('listaLogs'), listaGrupos = el('listaGrupos');
  var msg = el('logsMsg'), aviso = el('avisoAcesso'), painel = el('painelLogs');
  var busca = el('logsBusca'), agrupar = el('logsAgrupar'), pessoa = el('logsPessoa');
  var modulo = el('logsModulo'), acao = el('logsAcao'), pagina = el('logsPagina');
  var desde = el('logsDesde'), ate = el('logsAte');
  var contagem = el('logsContagem'), botaoMais = el('logsMais'), kpis = el('logsKpis');
  var DOMINIO_USUARIO = '@sistema.local';
  var LOTE = 100;
  var linhas = [];
  var acabou = false;
  var pedido = 0;   // descarta respostas antigas quando os filtros mudam rápido
  var ROOT = (auth && auth.RESPONSAVEL_EMAIL) || 'root@root.com';
  var CHAVE_ABA = 'logs-aba';
  var abaLogs = 'equipe';
  try { abaLogs = localStorage.getItem(CHAVE_ABA) || 'equipe'; } catch (e) { /* modo privado */ }
  if (['equipe', 'root', 'todos'].indexOf(abaLogs) < 0) abaLogs = 'equipe';
  var todasPessoas = [];

  var MODULOS = { navegacao: 'Navegação', acesso: 'Acesso', usuarios: 'Usuários', fiscais: 'Fiscais', bairros: 'Bairros', chamados: 'Chamados', mecanizacao: 'Mecanização' };
  var ACOES = {
    visita: 'Abriu página', saida: 'Tempo na página', aba: 'Trocou de aba', clique: 'Clique', filtro: 'Filtro / opção',
    enviar: 'Enviou formulário', erro: 'Erro na página',
    login: 'Login', logout: 'Logout', cadastro: 'Cadastro', criar: 'Criar', editar: 'Editar', excluir: 'Excluir',
    aprovar: 'Aprovar', recusar: 'Recusar', ativar: 'Ativar', desativar: 'Desativar', trocar_senha: 'Trocar senha', redefinir: 'Redefinir senha'
  };
  // Mesmos nomes de js/rastreio.js — o banco guarda o arquivo, a tela mostra o nome.
  var PAGINAS = {
    'index.html': 'Início', 'dashboard.html': 'Painel de Mecanização', 'dashboards.html': 'Dashboards',
    'deagro.html': 'DEAGRO', 'deagro-secoes.html': 'DEAGRO — Seções', 'eleicoes.html': 'Fiscais',
    'portarias.html': 'Portarias', 'organograma.html': 'Organograma', 'chamados.html': 'Chamados',
    'cadastros-chamados.html': 'Cadastros de chamados', 'contatos.html': 'Contatos',
    'cadastros-fiscais.html': 'Cadastro de fiscais', 'admin-usuarios.html': 'Usuários',
    'admin-permissoes.html': 'Acessos', 'logs.html': 'Logs', 'lancamento-editar.html': 'Editar lançamento',
    'admin-trocar-senha.html': 'Trocar senha', 'admin-login.html': 'Login'
  };
  var ROTULO_GRUPO = { pessoa: 'PESSOA', acao: 'AÇÃO', pessoa_acao: 'PESSOA → AÇÃO', pagina: 'PÁGINA', pessoa_pagina: 'PESSOA → PÁGINA', modulo: 'MÓDULO' };

  function escapar(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }
  function mostrarLogin(email) {
    email = email || '';
    return email.toLowerCase().endsWith(DOMINIO_USUARIO) ? email.slice(0, -DOMINIO_USUARIO.length) : email;
  }
  function nomePagina(arq) { return PAGINAS[arq] || arq || '—'; }
  function formatarQuando(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { data: iso, hora: '' };
    return {
      data: d.toLocaleDateString('pt-BR'),
      hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  }
  function duracao(seg) {
    seg = Math.round(+seg || 0);
    if (!seg) return '—';
    var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    return h ? h + ' h ' + m + ' min' : m ? m + ' min ' + s + ' s' : s + ' s';
  }
  function numero(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function rotuloChave(tipo, valor) {
    if (tipo === 'acao') return ACOES[valor] || valor;
    if (tipo === 'modulo') return MODULOS[valor] || valor;
    if (tipo === 'pagina') return nomePagina(valor);
    return mostrarLogin(valor);
  }

  /* As datas do filtro são dias no fuso de quem está olhando — convertidas
     para instante UTC aqui, senão o banco (em UTC) cortava o dia 5 h antes. */
  function filtros(semAba) {
    var f = {};
    if (!semAba) {
      if (abaLogs === 'root') f.usuario = ROOT;
      else {
        if (pessoa.value) f.usuario = pessoa.value;
        if (abaLogs === 'equipe') f.semUsuario = ROOT;
      }
    }
    if (modulo.value) f.modulo = modulo.value;
    if (acao.value) f.acao = acao.value;
    if (pagina.value) f.pagina = pagina.value;
    if (desde.value) f.desde = new Date(desde.value + 'T00:00:00').toISOString();
    if (ate.value) f.ate = new Date(ate.value + 'T23:59:59.999').toISOString();
    return f;
  }

  /* ------------------------------------------------------------- detalhes */
  function chipsDetalhes(l) {
    var d = l.detalhes || {};
    var chips = [];
    if (d.pagina && l.acao !== 'visita' && l.acao !== 'saida') chips.push('Página: ' + nomePagina(d.pagina));
    if (d.aba && l.acao !== 'aba') chips.push('Aba: ' + d.aba);
    if (l.acao === 'saida' && d.tempo_total_seg && d.tempo_total_seg !== d.duracao_seg) chips.push('Total na visita: ' + duracao(d.tempo_total_seg));
    if (l.acao === 'visita') {
      if (d.dispositivo) chips.push(d.dispositivo);
      if (d.navegador) chips.push(d.navegador + (d.sistema ? ' · ' + d.sistema : ''));
      if (d.tela) chips.push('Tela ' + d.tela);
    }
    if (d.destino) chips.push('→ ' + d.destino);
    if (l.acao === 'erro' && d.arquivo) chips.push(d.arquivo + (d.linha ? ':' + d.linha : ''));
    return chips.length ? '<div class="logs-chips">' + chips.map(function (c) { return '<span>' + escapar(c) + '</span>'; }).join('') + '</div>' : '';
  }

  /* ---------------------------------------------------------------- lista */
  function renderLista() {
    var termo = busca.value.trim().toLowerCase();
    var visiveis = termo ? linhas.filter(function (l) {
      return (l.usuario_email || '').toLowerCase().indexOf(termo) >= 0 || (l.descricao || '').toLowerCase().indexOf(termo) >= 0;
    }) : linhas;
    contagem.textContent = numero(visiveis.length) + (visiveis.length === 1 ? ' evento' : ' eventos') + (acabou ? '' : ' carregados');
    lista.innerHTML = '';
    if (!visiveis.length) {
      lista.innerHTML = '<li class="vazio">' + (linhas.length ? 'Nenhum evento encontrado.' : 'Nenhum evento registrado com esses filtros.') + '</li>';
      return;
    }
    var frag = document.createDocumentFragment();
    visiveis.forEach(function (l) {
      var q = formatarQuando(l.criado_em);
      var li = document.createElement('li');
      li.innerHTML =
        '<div class="logs-quando">' + escapar(q.data) + '<span>' + escapar(q.hora) + '</span></div>' +
        '<div class="logs-quem"><button type="button" class="logs-link" data-filtro-pessoa="' + escapar(l.usuario_email) + '" title="Ver só esta pessoa">' + escapar(mostrarLogin(l.usuario_email)) + '</button></div>' +
        '<div><span class="logs-badge ' + escapar(l.modulo) + '">' + escapar(MODULOS[l.modulo] || l.modulo) + '</span></div>' +
        '<div class="logs-acao ' + escapar(l.acao) + '">' + escapar(ACOES[l.acao] || l.acao) + '</div>' +
        '<div class="logs-desc">' + escapar(l.descricao) + chipsDetalhes(l) + '</div>';
      frag.appendChild(li);
    });
    lista.appendChild(frag);
  }

  function carregarLista(maisAntigos) {
    var f = filtros();
    f.limite = LOTE;
    if (maisAntigos && linhas.length) f.ate = linhas[linhas.length - 1].criado_em;
    var meu = ++pedido;
    msg.textContent = 'Carregando…'; msg.className = 'admin-msg';
    botaoMais.disabled = true;
    auth.listarEventos(f).then(function (dados) {
      if (meu !== pedido) return;
      msg.textContent = '';
      // "ate" = criado_em do último já carregado inclui ele mesmo de novo
      if (maisAntigos) {
        var vistos = {};
        linhas.forEach(function (l) { vistos[l.id] = true; });
        linhas = linhas.concat(dados.filter(function (l) { return !vistos[l.id]; }));
      } else linhas = dados;
      acabou = dados.length < LOTE;
      botaoMais.hidden = acabou;
      botaoMais.disabled = false;
      renderLista();
    }).catch(function (e) {
      if (meu !== pedido) return;
      msg.textContent = e.message; msg.className = 'admin-msg erro';
      botaoMais.disabled = false;
    });
  }

  /* -------------------------------------------------------------- resumo */
  function erroResumo(e) {
    return /admin_solicitacoes|404/.test(e.message)
      ? 'O resumo agrupado ainda não existe no banco. Rode database/log-eventos-navegacao.sql no SQL Editor do Supabase.'
      : e.message;
  }

  function renderKpis(porPessoa, porAcao) {
    var total = 0, tempo = 0, contaAcao = {};
    porPessoa.forEach(function (r) { total += +r.eventos; tempo += +r.tempo_seg; });
    porAcao.forEach(function (r) { contaAcao[r.chave] = +r.eventos; });
    var cards = [
      ['Eventos', numero(total), 'no período e filtros'],
      ['Pessoas', numero(porPessoa.length), 'com alguma atividade'],
      ['Tempo nas páginas', duracao(tempo), 'tempo com a página visível'],
      ['Páginas abertas', numero(contaAcao.visita), 'visitas registradas'],
      ['Cadastros / edições', numero((contaAcao.criar || 0) + (contaAcao.editar || 0)), numero(contaAcao.excluir || 0) + ' exclusões'],
      ['Erros', numero(contaAcao.erro), 'erros de JavaScript']
    ];
    kpis.innerHTML = cards.map(function (c) {
      return '<div class="logs-kpi"><span>' + escapar(c[0]) + '</span><strong>' + escapar(c[1]) + '</strong><small>' + escapar(c[2]) + '</small></div>';
    }).join('');
  }

  function carregarKpis() {
    var f = filtros();
    Promise.all([auth.resumirEventos('pessoa', f), auth.resumirEventos('acao', f)])
      .then(function (r) { renderKpis(r[0] || [], r[1] || []); })
      .catch(function () { kpis.innerHTML = ''; });
  }

  /* Pessoas do filtro: todas que já aparecem no log (sem os outros filtros,
     senão escolher uma ação escondia quem ainda não fez aquela ação). */
  function carregarPessoas() {
    return auth.resumirEventos('pessoa', {}).then(function (r) {
      todasPessoas = (r || []).map(function (x) { return x.chave; }).filter(function (e) { return e && e.charAt(0) !== '('; })
        .sort(function (a, b) { return mostrarLogin(a).localeCompare(mostrarLogin(b), 'pt-BR'); });
      montarPessoas();
    }).catch(function () { /* sem o resumo no banco, fica só "Todas" */ });
  }

  /** Na aba Equipe o root não entra na lista de pessoas; na aba Root o
      filtro de pessoa nem aparece (é sempre ele). */
  function montarPessoas() {
    var atual = pessoa.value;
    var emails = abaLogs === 'equipe' ? todasPessoas.filter(function (e) { return e !== ROOT; }) : todasPessoas;
    pessoa.innerHTML = '<option value="">Todas</option>' + emails.map(function (e) {
      return '<option value="' + escapar(e) + '">' + escapar(mostrarLogin(e)) + '</option>';
    }).join('');
    pessoa.value = emails.indexOf(atual) >= 0 ? atual : '';
  }

  /* Números nas abas: mesmos filtros de módulo/ação/página/período, sem o
     recorte da própria aba e sem o filtro de pessoa. */
  function carregarNumerosAbas() {
    var f = filtros(true);
    auth.resumirEventos('pessoa', f).then(function (r) {
      var root = 0, equipe = 0;
      (r || []).forEach(function (x) { if (x.chave === ROOT) root += +x.eventos; else equipe += +x.eventos; });
      el('logsNumEquipe').textContent = numero(equipe);
      el('logsNumRoot').textContent = numero(root);
      el('logsNumTodos').textContent = numero(root + equipe);
    }).catch(function () {
      ['logsNumEquipe', 'logsNumRoot', 'logsNumTodos'].forEach(function (id) { el(id).textContent = ''; });
    });
  }

  function mostrarAba() {
    document.querySelectorAll('.logs-aba').forEach(function (b) {
      var ativa = b.getAttribute('data-aba') === abaLogs;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-selected', ativa ? 'true' : 'false');
      b.tabIndex = ativa ? 0 : -1;
    });
    pessoa.closest('label').hidden = abaLogs === 'root';
    montarPessoas();
  }

  function trocarAba(nova) {
    if (nova === abaLogs) return;
    abaLogs = nova;
    try { localStorage.setItem(CHAVE_ABA, nova); } catch (e) { /* modo privado */ }
    mostrarAba();
    atualizar();
  }

  function renderGrupos(tipo, linhasGrupo) {
    el('logsColGrupo').textContent = ROTULO_GRUPO[tipo] || 'GRUPO';
    var composto = tipo === 'pessoa_acao' || tipo === 'pessoa_pagina';
    var subTipo = tipo === 'pessoa_acao' ? 'acao' : 'pagina';
    var chaveTipo = composto ? 'pessoa' : tipo;
    contagem.textContent = numero(linhasGrupo.length) + (linhasGrupo.length === 1 ? ' grupo' : ' grupos');
    if (!linhasGrupo.length) { listaGrupos.innerHTML = '<li class="vazio">Nenhum evento com esses filtros.</li>'; return; }

    function linhaHtml(r, classe, rotulo, dados) {
      return '<li class="' + classe + '" tabindex="0" role="button" ' + dados + '>' +
        '<div class="logs-grupo-nome">' + rotulo + '</div>' +
        '<div class="num">' + numero(r.eventos) + '</div>' +
        '<div class="num">' + escapar(duracao(r.tempo_seg)) + '</div>' +
        '<div class="num">' + numero(r.pessoas) + '</div>' +
        '<div class="logs-quando">' + escapar(formatarQuando(r.primeiro).data) + '<span>' + escapar(formatarQuando(r.primeiro).hora) + '</span></div>' +
        '<div class="logs-quando">' + escapar(formatarQuando(r.ultimo).data) + '<span>' + escapar(formatarQuando(r.ultimo).hora) + '</span></div>' +
        '</li>';
    }
    function attr(nome, valor) { return 'data-' + nome + '="' + escapar(valor) + '"'; }

    var html = '';
    if (!composto) {
      linhasGrupo.slice().sort(function (a, b) { return b.eventos - a.eventos; }).forEach(function (r) {
        html += linhaHtml(r, 'logs-grupo', escapar(rotuloChave(chaveTipo, r.chave)), attr(chaveTipo, r.chave));
      });
    } else {
      // pessoa como cabeçalho (com os totais dela), ações/páginas embaixo
      var porPessoa = {}, ordem = [];
      linhasGrupo.forEach(function (r) {
        if (!porPessoa[r.chave]) { porPessoa[r.chave] = { chave: r.chave, eventos: 0, tempo_seg: 0, pessoas: 1, primeiro: r.primeiro, ultimo: r.ultimo, itens: [] }; ordem.push(r.chave); }
        var p = porPessoa[r.chave];
        p.eventos += +r.eventos; p.tempo_seg += +r.tempo_seg;
        if (r.primeiro < p.primeiro) p.primeiro = r.primeiro;
        if (r.ultimo > p.ultimo) p.ultimo = r.ultimo;
        p.itens.push(r);
      });
      ordem.sort(function (a, b) { return porPessoa[b].eventos - porPessoa[a].eventos; }).forEach(function (k) {
        var p = porPessoa[k];
        html += linhaHtml(p, 'logs-grupo logs-grupo-pai', escapar(mostrarLogin(k)), attr('pessoa', k));
        p.itens.sort(function (a, b) { return b.eventos - a.eventos; }).forEach(function (r) {
          html += linhaHtml(r, 'logs-grupo logs-grupo-filho', '<span>↳</span> ' + escapar(rotuloChave(subTipo, r.subchave)),
            attr('pessoa', k) + ' ' + attr(subTipo, r.subchave));
        });
      });
    }
    listaGrupos.innerHTML = html;
  }

  function carregarGrupos() {
    var tipo = agrupar.value;
    var meu = ++pedido;
    msg.textContent = 'Carregando…'; msg.className = 'admin-msg';
    auth.resumirEventos(tipo, filtros()).then(function (r) {
      if (meu !== pedido) return;
      msg.textContent = '';
      renderGrupos(tipo, r || []);
    }).catch(function (e) {
      if (meu !== pedido) return;
      msg.textContent = erroResumo(e); msg.className = 'admin-msg erro';
      listaGrupos.innerHTML = '';
    });
  }

  /* ------------------------------------------------------------- controle */
  function atualizar() {
    var agrupado = !!agrupar.value;
    el('logsVisLista').hidden = agrupado;
    el('logsVisGrupos').hidden = !agrupado;
    el('logsBuscaRotulo').hidden = agrupado;   // a busca de texto é da lista
    if (agrupado) { botaoMais.hidden = true; carregarGrupos(); }
    else carregarLista(false);
    carregarKpis();
    carregarNumerosAbas();
  }

  /** Filtrar por uma pessoa leva pra aba certa: o root pra "Root", os
      demais pra "Equipe" (a não ser que já se esteja em "Todos"). */
  function filtrarPessoa(email) {
    if (email === ROOT) { if (abaLogs !== 'todos') { abaLogs = 'root'; mostrarAba(); } }
    else if (abaLogs === 'root') { abaLogs = 'equipe'; mostrarAba(); }
    if (abaLogs !== 'root') pessoa.value = email;
    try { localStorage.setItem(CHAVE_ABA, abaLogs); } catch (e) { /* modo privado */ }
  }

  function aplicarGrupo(item) {
    var p = item.getAttribute('data-pessoa'), a = item.getAttribute('data-acao');
    var pg = item.getAttribute('data-pagina'), m = item.getAttribute('data-modulo');
    if (p !== null) filtrarPessoa(p);
    if (a !== null) acao.value = a;
    if (pg !== null && pg.charAt(0) !== '(') pagina.value = pg;
    if (m !== null) modulo.value = m;
    agrupar.value = '';
    atualizar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function montarPaginas() {
    pagina.innerHTML = '<option value="">Todas</option>' + Object.keys(PAGINAS)
      .sort(function (a, b) { return PAGINAS[a].localeCompare(PAGINAS[b], 'pt-BR'); })
      .map(function (k) { return '<option value="' + escapar(k) + '">' + escapar(PAGINAS[k]) + '</option>'; }).join('');
  }

  busca.addEventListener('input', renderLista);
  [agrupar, pessoa, modulo, acao, pagina, desde, ate].forEach(function (campo) { campo.addEventListener('change', atualizar); });
  botaoMais.addEventListener('click', function () { carregarLista(true); });
  el('logsLimpar').addEventListener('click', function () {
    [pessoa, modulo, acao, pagina, desde, ate].forEach(function (c) { c.value = ''; });
    busca.value = '';
    atualizar();
  });
  lista.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-filtro-pessoa]');
    if (!b) return;
    filtrarPessoa(b.getAttribute('data-filtro-pessoa'));
    atualizar();
  });
  listaGrupos.addEventListener('click', function (ev) {
    var li = ev.target.closest('.logs-grupo');
    if (li) aplicarGrupo(li);
  });
  document.querySelector('.logs-abas').addEventListener('click', function (ev) {
    var b = ev.target.closest('.logs-aba');
    if (b) trocarAba(b.getAttribute('data-aba'));
  });
  // setas entre as abas, como nas abas do painel
  document.querySelector('.logs-abas').addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    var abas = Array.prototype.slice.call(document.querySelectorAll('.logs-aba'));
    var i = abas.findIndex(function (b) { return b.getAttribute('data-aba') === abaLogs; });
    var prox = abas[(i + (ev.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length];
    trocarAba(prox.getAttribute('data-aba'));
    prox.focus();
  });
  listaGrupos.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var li = ev.target.closest('.logs-grupo');
    if (li) { ev.preventDefault(); aplicarGrupo(li); }
  });

  if (!auth || !auth.online || auth.papel() !== 'responsavel') {
    aviso.hidden = false;
    painel.hidden = true;
    contagem.hidden = true;
  } else {
    montarPaginas();
    mostrarAba();
    carregarPessoas();
    atualizar();
  }
})();
