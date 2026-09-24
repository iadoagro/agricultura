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
    enviar: 'Enviou formulário', erro: 'Erro na página', localizacao: 'Localização',
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
  var ROTULO_GRUPO = { pessoa: 'PESSOA', acao: 'AÇÃO', pessoa_acao: 'PESSOA → AÇÃO', pagina: 'PÁGINA', pessoa_pagina: 'PESSOA → PÁGINA',
    aparelho: 'APARELHO', pessoa_aparelho: 'PESSOA → APARELHO', modulo: 'MÓDULO' };
  var FUSO_LOCAL = 'America/Rio_Branco';
  var locais = {};   // ip → linha de ip_localizacao (database/log-eventos-localizacao.sql)

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
    if (tipo === 'aparelho') return valor;
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
    // Ambiente (js/ambiente-cliente.js + IP do banco): na visita e nas ações
    // de verdade (login, cadastros de fiscais...); em cada clique seria ruído.
    // Um chip é [texto] ou [texto, 'alerta'] — o que merece atenção sai em destaque.
    chips = chips.map(function (c) { return [c]; });
    if (l.acao === 'visita' || l.modulo !== 'navegacao') {
      if (l.ip) {
        var loc = locais[l.ip];
        chips.push([ipComLocal(l.ip), nomesIp[l.ip] ? 'ip conhecido' : 'ip', l.ip]);
        if (!nomesIp[l.ip] && loc && loc.uf && loc.uf !== 'AC') chips.push(['Fora do Acre', 'alerta']);
        if (loc && loc.proxy) chips.push(['VPN / proxy', 'alerta']);
        else if (loc && loc.datacenter) chips.push(['IP de servidor', 'alerta']);
      }
      // detalhes (navegador) é mais completo; as colunas (servidor, log-eventos-origem.sql) cobrem o resto
      var aparelho = [d.modelo || d.dispositivo || l.dispositivo, d.sistema || l.sistema].filter(Boolean).join(' · ');
      if (aparelho) chips.push([aparelho]);
      if (d.navegador || l.navegador) chips.push([d.navegador || l.navegador]);
      if (d.tela) chips.push(['Tela ' + d.tela]);
      if (d.conexao || (l.ip && locais[l.ip] && locais[l.ip].movel)) chips.push([d.conexao || 'Dados móveis']);
      if (d.fuso && d.fuso !== FUSO_LOCAL) chips.push(['Fuso ' + d.fuso, 'alerta']);
      if (d.aparelho_id) chips.push(['Aparelho ' + d.aparelho_id]);
    }
    if (d.geo && d.geo.lat != null) chips.push(['Posição do aparelho ±' + numero(d.geo.precisao_m) + ' m', 'geo', d.geo]);
    else if (l.acao === 'visita' && d.geo_permissao === 'negada') chips.push(['Localização negada', 'alerta']);
    if (d.destino) chips.push(['→ ' + d.destino]);
    if (l.acao === 'erro' && d.arquivo) chips.push([d.arquivo + (d.linha ? ':' + d.linha : '')]);
    return chips.length ? '<div class="logs-chips">' + chips.map(htmlChip).join('') + '</div>' : '';
  }

  // [texto], [texto, classe], [texto, 'ip', ip] (botão para dar nome) ou [texto, 'geo', posição] (link pro mapa)
  function htmlChip(c) {
    if (c[1] && c[1].indexOf('ip') === 0) {
      return '<button type="button" class="logs-chip-ip' + (c[1] === 'ip conhecido' ? ' conhecido' : '') + '" data-nomear-ip="' + escapar(c[2]) +
        '" title="Dar nome a este IP (ex.: SEAGRI – Sede)">' + escapar(c[0]) + '</button>';
    }
    if (c[1] === 'geo') {
      var g = c[2];
      return '<a class="logs-chip-geo" target="_blank" rel="noopener" title="Abrir no mapa" href="https://www.openstreetmap.org/?mlat=' +
        encodeURIComponent(g.lat) + '&amp;mlon=' + encodeURIComponent(g.lon) + '#map=17/' + encodeURIComponent(g.lat) + '/' + encodeURIComponent(g.lon) + '">' +
        escapar(c[0]) + '</a>';
    }
    return '<span' + (c[1] ? ' class="' + c[1] + '"' : '') + '>' + escapar(c[0]) + '</span>';
  }

  function textoLocal(loc) {
    var lugar = [loc.cidade, loc.uf && loc.pais === 'Brasil' ? loc.uf : loc.pais].filter(Boolean).join('/');
    return [lugar, loc.provedor].filter(Boolean).join(' · ');
  }

  /* Cidade/provedor dos IPs que estão na tela: o banco consulta os que
     ainda não conhece e guarda (função ip_localizar). Sem a função no banco
     a lista só fica sem a localização. */
  function localizarIPs(lista) {
    var faltando = {};
    (lista || linhas.map(function (l) { return l.ip; })).forEach(function (ip) { if (ip && !(ip in locais)) faltando[ip] = true; });
    var ips = Object.keys(faltando);
    if (!ips.length || !auth.localizarIPs) return;
    ips.forEach(function (ip) { locais[ip] = null; });   // não pede de novo enquanto espera
    auth.localizarIPs(ips).then(function (r) {
      (r || []).forEach(function (loc) { locais[loc.ip] = loc; });
      if (!agrupar.value) renderLista();
      renderAlertas();
    }).catch(function () { /* segue sem localização */ });
  }

  /* ---------------------------------------------------- locais conhecidos */
  // Nome dado pelo responsável a um IP fixo (database/ip-nomes.sql).
  var nomesIp = {};
  var dialogoIp = el('dialogoIp'), dialogoIpNome = el('dialogoIpNome');

  function carregarNomesIp() {
    if (!auth.listarNomesIP) return Promise.resolve();
    return auth.listarNomesIP().then(function (r) {
      nomesIp = {};
      (r || []).forEach(function (x) { nomesIp[x.ip] = x.nome; });
    }).catch(function () { /* tabela ainda não criada: segue sem nomes */ });
  }

  function redesenharTudo() {
    if (!agrupar.value) renderLista();
    renderAlertas();
    carregarMapa();
  }

  function nomearIp(ip) {
    var loc = locais[ip];
    el('dialogoIpInfo').textContent = 'IP ' + ip + (loc ? ' · ' + textoLocal(loc) : '');
    dialogoIpNome.value = nomesIp[ip] || '';
    el('dialogoIpRemover').hidden = !nomesIp[ip];
    dialogoIp.setAttribute('data-ip', ip);
    dialogoIp.returnValue = '';
    dialogoIp.showModal();
    dialogoIpNome.focus();
  }

  // No envio (Enter = Salvar, o 1º botão), não no "close" do diálogo: o
  // close só dispara no próximo quadro desenhado da página.
  dialogoIp.querySelector('form').addEventListener('submit', function (ev) {
    var ip = dialogoIp.getAttribute('data-ip');
    var acao = ev.submitter ? ev.submitter.value : 'salvar';
    var nome = dialogoIpNome.value.replace(/\s+/g, ' ').trim();
    if (acao === 'salvar' && !nome) acao = nomesIp[ip] ? 'remover' : '';
    if (acao !== 'salvar' && acao !== 'remover') return;
    var feito = acao === 'salvar' ? auth.salvarNomeIP(ip, nome) : auth.removerNomeIP(ip);
    feito.then(function () {
      if (acao === 'salvar') nomesIp[ip] = nome; else delete nomesIp[ip];
      redesenharTudo();
    }).catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; });
  });

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-nomear-ip]');
    if (b) nomearIp(b.getAttribute('data-nomear-ip'));
  });

  /* ------------------------------------------------ alertas de segurança */
  // Gerados pelo banco (database/log-alertas.sql); seguem a aba Equipe/Root/Todos e a pessoa.
  var alertas = [];
  var GRAVIDADE = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
  var painelAlertas = el('logsAlertas'), listaAlertas = el('logsAlertasLista');
  var numAlertas = el('logsAlertasNum'), verVistos = el('logsAlertasVistos');

  function filtrosAlertas() {
    var f = filtros();
    return { usuario: f.usuario, semUsuario: f.semUsuario };
  }

  // "SEAGRI – Sede · IP 170.83.174.130" quando o IP tem nome; senão cidade e provedor
  function ipComLocal(ip) {
    if (!ip) return '';
    if (nomesIp[ip]) return nomesIp[ip] + ' · IP ' + ip;
    var loc = locais[ip];
    return 'IP ' + ip + (loc ? ' · ' + textoLocal(loc) : '');
  }

  function renderAlertas() {
    if (!alertas.length) {
      listaAlertas.innerHTML = '<li class="vazio">' + (verVistos.checked ? 'Nenhum alerta registrado.' : 'Nenhum alerta pendente.') + '</li>';
      return;
    }
    listaAlertas.innerHTML = alertas.map(function (a) {
      var q = formatarQuando(a.criado_em), d = a.detalhes || {};
      var chips = [ipComLocal(a.ip), a.aparelho_desc ? a.aparelho_desc + (a.aparelho_id ? ' (' + a.aparelho_id + ')' : '') : ''];
      if (a.tipo === 'simultaneo') {
        chips.push('Outro: ' + [ipComLocal(d.outro_ip), d.outro_aparelho_desc].filter(Boolean).join(' · ') +
          (d.outro_em ? ' às ' + formatarQuando(d.outro_em).hora : ''));
      }
      var loc = a.ip && locais[a.ip];
      var extra = !nomesIp[a.ip] && loc && loc.uf && loc.uf !== 'AC' ? '<span class="alerta">Fora do Acre</span>' : '';
      if (loc && loc.proxy) extra += '<span class="alerta">VPN / proxy</span>';
      return '<li class="' + (a.visto ? 'visto' : '') + '">' +
        '<div><span class="logs-grav ' + escapar(a.gravidade) + '">' + escapar(GRAVIDADE[a.gravidade] || a.gravidade) + '</span></div>' +
        '<div class="logs-quando">' + escapar(q.data) + '<span>' + escapar(q.hora) + '</span></div>' +
        '<div class="logs-desc">' + escapar(a.descricao) +
          '<div class="logs-chips">' + chips.filter(Boolean).map(function (c) { return '<span>' + escapar(c) + '</span>'; }).join('') + extra + '</div>' +
          '<button type="button" class="logs-link" data-filtro-pessoa="' + escapar(a.usuario_email) + '">Ver eventos de ' + escapar(mostrarLogin(a.usuario_email)) + '</button>' +
        '</div>' +
        '<div>' + (a.visto ? '' : '<button type="button" class="logs-alerta-visto" data-alerta-visto="' + escapar(a.id) + '">Visto</button>') + '</div>' +
        '</li>';
    }).join('');
  }

  function carregarAlertas() {
    if (!auth.listarAlertas) return;
    var f = filtrosAlertas();
    f.incluirVistos = verVistos.checked;
    Promise.all([auth.listarAlertas(f), auth.contarAlertasNaoVistos(filtrosAlertas())]).then(function (r) {
      alertas = r[0] || [];
      painelAlertas.hidden = false;
      numAlertas.textContent = r[1] ? numero(r[1]) + (r[1] === 1 ? ' novo' : ' novos') : 'nenhum novo';
      numAlertas.classList.toggle('zero', !r[1]);
      el('logsAlertasTodos').hidden = !r[1];
      renderAlertas();
      localizarIPs([].concat.apply([], alertas.map(function (a) { return [a.ip, a.detalhes && a.detalhes.outro_ip]; })));
    }).catch(function () { painelAlertas.hidden = true; });   // tabela ainda não criada no banco
  }

  /* ---------------------------------------------------------------- lista */
  function renderLista() {
    var termo = busca.value.trim().toLowerCase();
    var visiveis = termo ? linhas.filter(function (l) {
      var d = l.detalhes || {}, loc = l.ip && locais[l.ip];
      return [l.usuario_email, l.descricao, l.ip, d.aparelho_id, d.modelo, loc && textoLocal(loc)].some(function (t) {
        return (t || '').toLowerCase().indexOf(termo) >= 0;
      });
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
      localizarIPs();
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
    var composto = tipo === 'pessoa_acao' || tipo === 'pessoa_pagina' || tipo === 'pessoa_aparelho';
    var subTipo = { pessoa_acao: 'acao', pessoa_pagina: 'pagina', pessoa_aparelho: 'aparelho' }[tipo];
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
    // "Samsung SM-A546E · Android 14 · Chrome (K3F9QX2A)"; eventos antigos não têm aparelho
    function rotuloAparelho(r, chave) {
      if (!chave || chave.charAt(0) === '(') return 'Sem identificação (eventos antigos)';
      return (r.rotulo ? r.rotulo + ' ' : '') + '(' + chave + ')';
    }

    var html = '';
    if (!composto) {
      linhasGrupo.slice().sort(function (a, b) { return b.eventos - a.eventos; }).forEach(function (r) {
        var nome = tipo === 'aparelho' ? rotuloAparelho(r, r.chave) : rotuloChave(chaveTipo, r.chave);
        html += linhaHtml(r, 'logs-grupo', escapar(nome), attr(chaveTipo, r.chave));
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
        var nomePessoa = escapar(mostrarLogin(k));
        if (subTipo === 'aparelho') {
          // aparelhos numerados na ordem em que apareceram; mais de um já fica à vista
          p.itens.sort(function (a, b) { return a.primeiro < b.primeiro ? -1 : 1; });
          var conhecidos = p.itens.filter(function (r) { return r.subchave && r.subchave.charAt(0) !== '('; }).length;
          if (conhecidos) nomePessoa += ' <small class="logs-aparelhos' + (conhecidos > 1 ? ' varios' : '') + '">' +
            conhecidos + (conhecidos === 1 ? ' aparelho' : ' aparelhos') + '</small>';
        } else p.itens.sort(function (a, b) { return b.eventos - a.eventos; });
        html += linhaHtml(p, 'logs-grupo logs-grupo-pai', nomePessoa, attr('pessoa', k));
        var n = 0;
        p.itens.forEach(function (r) {
          var rot = subTipo !== 'aparelho' ? rotuloChave(subTipo, r.subchave)
            : (r.subchave && r.subchave.charAt(0) !== '(' ? 'Aparelho ' + (++n) + ' — ' : '') + rotuloAparelho(r, r.subchave);
          html += linhaHtml(r, 'logs-grupo logs-grupo-filho', '<span>↳</span> ' + escapar(rot),
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

  /* ------------------------------------------------------- mapa dos acessos */
  // Pontos = cidades dos IPs (ip_localizacao.lat/lon) com os mesmos filtros da
  // tela. O Leaflet só é baixado quando o mapa é aberto pela primeira vez.
  var CHAVE_MAPA = 'logs-mapa-aberto';
  var mapaSecao = el('logsMapaSecao'), mapaCorpo = el('logsMapaCorpo'), mapaBotao = el('logsMapaBotao');
  var mapaL = null, camadaPontos = null, leaflet = null, pedidoMapa = 0;

  function carregarLeaflet() {
    if (leaflet) return leaflet;
    leaflet = new Promise(function (ok, falhou) {
      if (window.L) return ok();
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = function () { ok(); };
      js.onerror = function () { leaflet = null; falhou(new Error('Não foi possível carregar o mapa.')); };
      document.head.appendChild(js);
    });
    return leaflet;
  }

  // ip_localizar consulta no máximo 100 IPs novos por vez
  function localizarTodos(ips) {
    var faltando = ips.filter(function (ip) { return ip && !locais[ip]; });
    var lotes = [];
    for (var i = 0; i < faltando.length; i += 100) lotes.push(faltando.slice(i, i + 100));
    return lotes.reduce(function (p, lote) {
      return p.then(function () {
        return auth.localizarIPs(lote).then(function (r) { (r || []).forEach(function (loc) { locais[loc.ip] = loc; }); });
      });
    }, Promise.resolve());
  }

  function corPonto(p) { return p.suspeito ? '#c0392b' : p.conhecido ? '#2f6fd6' : p.foraAC ? '#d98200' : '#1f7a4d'; }

  // posições do aparelho (com permissão): ponto pequeno roxo no lugar exato
  function popupPosicao(e) {
    var g = e.detalhes.geo, q = formatarQuando(e.criado_em);
    return '<div class="logs-mapa-pop"><strong>' + escapar(mostrarLogin(e.usuario_email)) + '</strong>' +
      '<small>' + escapar(q.data + ' ' + q.hora) + ' · precisão ±' + numero(g.precisao_m) + ' m</small>' +
      '<small>' + escapar(e.descricao) + '</small>' +
      (e.ip ? '<small>' + escapar(ipComLocal(e.ip)) + '</small>' : '') +
      '<ul><li><button type="button" class="logs-link" data-filtro-pessoa="' + escapar(e.usuario_email) + '">Ver eventos desta pessoa</button></li></ul></div>';
  }

  function popupPonto(p) {
    var pessoas = Object.keys(p.pessoas).sort(function (a, b) { return p.pessoas[b] - p.pessoas[a]; });
    var q = formatarQuando(p.ultimo);
    return '<div class="logs-mapa-pop"><strong>' + escapar(p.lugar) + '</strong>' +
      '<small>' + numero(p.eventos) + ' eventos · ' + numero(pessoas.length) + (pessoas.length === 1 ? ' pessoa' : ' pessoas') +
      ' · ' + numero(p.ips.length) + (p.ips.length === 1 ? ' IP' : ' IPs') + '</small>' +
      (p.provedores.length ? '<small>' + escapar(p.provedores.join(', ')) + '</small>' : '') +
      (p.suspeito ? '<small style="color:#c0392b">VPN, proxy ou IP de servidor</small>' : '') +
      '<small>Último acesso: ' + escapar(q.data + ' ' + q.hora) + '</small>' +
      '<ul>' + pessoas.map(function (e) {
        return '<li><button type="button" class="logs-link" data-filtro-pessoa="' + escapar(e) + '">' + escapar(mostrarLogin(e)) +
          '</button><span>' + numero(p.pessoas[e]) + '</span></li>';
      }).join('') + '</ul></div>';
  }

  function desenharMapa(linhasIp, posicoes) {
    var pontos = {}, semLocal = {};
    linhasIp.forEach(function (r) {
      var ip = r.subchave;
      if (!ip || ip.charAt(0) === '(') return;
      var loc = locais[ip];
      if (!loc || loc.lat == null) { semLocal[ip] = true; return; }
      // um ponto por cidade (IPs da mesma cidade vêm com coordenadas um pouco diferentes);
      // IP com nome (local conhecido) vira um ponto próprio com o nome
      var nome = nomesIp[ip];
      var k = nome ? 'nome|' + nome : loc.cidade ? [loc.cidade, loc.uf, loc.pais].join('|') : (+loc.lat).toFixed(2) + ',' + (+loc.lon).toFixed(2);
      var cidade = textoLocal({ cidade: loc.cidade, uf: loc.uf, pais: loc.pais });
      var p = pontos[k] || (pontos[k] = { lat: +loc.lat, lon: +loc.lon, lugar: nome ? nome + (cidade ? ' (' + cidade + ')' : '') : cidade || k,
        conhecido: !!nome, eventos: 0, pessoas: {}, ips: [], provedores: [], ultimo: r.ultimo, foraAC: false, suspeito: false });
      p.eventos += +r.eventos;
      p.pessoas[r.chave] = (p.pessoas[r.chave] || 0) + +r.eventos;
      if (p.ips.indexOf(ip) < 0) p.ips.push(ip);
      if (loc.provedor && p.provedores.indexOf(loc.provedor) < 0) p.provedores.push(loc.provedor);
      if (r.ultimo > p.ultimo) p.ultimo = r.ultimo;
      if (loc.uf !== 'AC') p.foraAC = true;
      if (loc.proxy || loc.datacenter) p.suspeito = true;
    });
    var lista = Object.keys(pontos).map(function (k) { return pontos[k]; });
    var fora = lista.filter(function (p) { return p.foraAC; }).length;
    var nSem = Object.keys(semLocal).length;
    posicoes = (posicoes || []).filter(function (e) { return e.detalhes && e.detalhes.geo && e.detalhes.geo.lat != null; });
    el('logsMapaResumo').textContent = numero(lista.length) + (lista.length === 1 ? ' local' : ' locais') +
      (fora ? ' · ' + fora + ' fora do Acre' : '') +
      (posicoes.length ? ' · ' + numero(posicoes.length) + (posicoes.length === 1 ? ' posição do aparelho' : ' posições do aparelho') : '') +
      (nSem ? ' · ' + nSem + (nSem === 1 ? ' IP sem localização' : ' IPs sem localização') : '');

    if (!mapaL) {
      mapaL = L.map(el('logsMapa'), { scrollWheelZoom: false, maxZoom: 14 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(mapaL);
      camadaPontos = L.featureGroup().addTo(mapaL);
      // "ver só esta pessoa" dentro dos balões do mapa
      el('logsMapa').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-filtro-pessoa]');
        if (!b) return;
        filtrarPessoa(b.getAttribute('data-filtro-pessoa'));
        atualizar();
      });
    }
    camadaPontos.clearLayers();
    // maiores primeiro (embaixo), para os pequenos continuarem clicáveis
    lista.sort(function (a, b) { return b.eventos - a.eventos; }).forEach(function (p) {
      L.circleMarker([p.lat, p.lon], {
        radius: Math.min(28, 7 + Math.sqrt(p.eventos) * 1.2), color: '#fff', weight: 2,
        fillColor: corPonto(p), fillOpacity: .8
      }).bindPopup(popupPonto(p)).bindTooltip(p.lugar + ' — ' + numero(p.eventos) + ' eventos').addTo(camadaPontos);
    });
    posicoes.forEach(function (e) {
      var g = e.detalhes.geo;
      L.circleMarker([g.lat, g.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#6b21a8', fillOpacity: .9 })
        .bindPopup(popupPosicao(e)).bindTooltip(mostrarLogin(e.usuario_email) + ' — ±' + numero(g.precisao_m) + ' m').addTo(camadaPontos);
    });
    mapaL.invalidateSize();
    if (lista.length || posicoes.length) mapaL.fitBounds(camadaPontos.getBounds(), { padding: [40, 40], maxZoom: posicoes.length ? 15 : 9 });
    else mapaL.setView([-9.3, -70.3], 6);   // Acre inteiro
  }

  function carregarMapa() {
    if (mapaCorpo.hidden) return;
    var meu = ++pedidoMapa;
    el('logsMapaResumo').textContent = 'Carregando…';
    var linhasIp, posicoes;
    var fPos = filtros(); fPos.comGeo = true; fPos.limite = 500;
    Promise.all([carregarLeaflet(), auth.resumirEventos('pessoa_ip', filtros()),
      auth.listarEventos(fPos).catch(function () { return []; })]).then(function (r) {
      linhasIp = r[1] || [];
      posicoes = r[2] || [];
      return localizarTodos(linhasIp.map(function (x) { return x.subchave; }).filter(function (ip, i, a) {
        return ip && ip.charAt(0) !== '(' && a.indexOf(ip) === i;
      }));
    }).then(function () {
      if (meu === pedidoMapa) desenharMapa(linhasIp, posicoes);
    }).catch(function (e) {
      if (meu === pedidoMapa) el('logsMapaResumo').textContent = e.message;
    });
  }

  function abrirMapa(aberto) {
    mapaCorpo.hidden = !aberto;
    mapaBotao.textContent = aberto ? 'Esconder mapa' : 'Mostrar mapa';
    mapaBotao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    try { localStorage.setItem(CHAVE_MAPA, aberto ? '1' : ''); } catch (e) { /* modo privado */ }
    if (aberto) carregarMapa(); else el('logsMapaResumo').textContent = '';
  }
  mapaBotao.addEventListener('click', function () { abrirMapa(mapaCorpo.hidden); });

  /* ------------------------------------------------------------- controle */
  function atualizar() {
    var agrupado = !!agrupar.value;
    el('logsVisLista').hidden = agrupado;
    el('logsVisGrupos').hidden = !agrupado;
    el('logsBuscaRotulo').hidden = agrupado;   // a busca de texto é da lista
    if (agrupado) { botaoMais.hidden = true; carregarGrupos(); }
    else carregarLista(false);
    carregarAlertas();
    carregarMapa();
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
    // aparelho não tem filtro próprio: vai pela busca, que também procura o id
    var ap = item.getAttribute('data-aparelho');
    if (ap !== null && ap.charAt(0) !== '(') busca.value = ap;
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
  verVistos.addEventListener('change', carregarAlertas);
  el('logsAlertasTodos').addEventListener('click', function () {
    auth.marcarAlertasVistos(null, filtrosAlertas()).then(carregarAlertas)
      .catch(function (e) { msg.textContent = e.message; msg.className = 'admin-msg erro'; });
  });
  listaAlertas.addEventListener('click', function (ev) {
    var v = ev.target.closest('[data-alerta-visto]');
    if (v) {
      v.disabled = true;
      auth.marcarAlertasVistos([v.getAttribute('data-alerta-visto')]).then(carregarAlertas)
        .catch(function (e) { v.disabled = false; msg.textContent = e.message; msg.className = 'admin-msg erro'; });
      return;
    }
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
    mapaSecao.hidden = false;
    var mapaAberto = false;
    try { mapaAberto = localStorage.getItem(CHAVE_MAPA) === '1'; } catch (e) { /* modo privado */ }
    if (mapaAberto) {   // abre já; quem carrega os pontos é o atualizar() logo abaixo
      mapaCorpo.hidden = false;
      mapaBotao.textContent = 'Esconder mapa';
      mapaBotao.setAttribute('aria-expanded', 'true');
    }
    mostrarAba();
    carregarPessoas();
    carregarNomesIp().then(atualizar);
  }
})();
