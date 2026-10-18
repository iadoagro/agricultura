/* Visão "Configurações" de "Mostrar mais" (só o responsável/root): ligar e desligar, numa tela só, o que
   aparece para o PÚBLICO (link sem login) e para o USUÁRIO LOGADO que não é root; link público e senha
   opcional. Cada mudança salva sozinha e vale na hora para todos; o root sempre vê tudo.

   A tela se ajusta à altura disponível (js: ajustarAltura) para o conteúdo inteiro caber sem rolar a
   página; os filtros da lateral não aparecem aqui (não se aplicam).

   Extras: "Ver como" (pré-visualiza a barra de abas de outro perfil), Desfazer, ligar uma visão liga a
   própria "Mostrar mais", e avisos quando um perfil ficaria sem nenhuma aba.
   A lista de itens e a aplicação da visibilidade estão em js/painel-publico.js. */
(function () {
  'use strict';
  var A = window.PAINEL_API, P = window.PainelPublico;
  if (!A || !P || A.modoPublico()) return;
  var G = A.G;
  var botao = document.getElementById('insBtnConfig');   // visão de "Mostrar mais", só para o root

  var PAI = 'insercoes';
  var abas = P.ITENS.abas.filter(function (i) { return i.k !== PAI; });
  var pai = P.ITENS.abas.filter(function (i) { return i.k === PAI; })[0];
  var visoes = P.ITENS.visoes;
  var todos = P.ITENS.abas.concat(visoes);
  // as visões de "Mostrar mais" em dois grupos, para as colunas ficarem curtas e caberem na tela
  var GRUPO_LISTAS = ['registros', 'pessoa', 'dia', 'semana', 'mes', 'imun', 'iesc', 'iserv', 'itec', 'ihora', 'pontos'];
  var visoesListas = visoes.filter(function (v) { return GRUPO_LISTAS.indexOf(v.k) >= 0; });
  var visoesAnalises = visoes.filter(function (v) { return GRUPO_LISTAS.indexOf(v.k) < 0; });
  var filhos = visoes.map(function (v) { return v.k; });

  var estado = { pub: {}, log: {} };
  var base = '';              // estado salvo por último (JSON)
  var pendenteAntes = null;   // estado salvo antes das alterações ainda não gravadas
  var anterior = null;        // estado anterior à última gravação (para desfazer)
  var timer = null, salvando = false, carregadoEm = 0;
  var previa = null, banner = null;

  /* ------------------------------------------------------------ ícones */
  var ICONES = {
    geral: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    mecanizacao: '<circle cx="7" cy="17" r="3"/><circle cx="18" cy="17" r="2"/><path d="M4 14V7h6l2 5h6v5"/>',
    acudagem: '<path d="M12 3c3 4 5 6.5 5 9a5 5 0 01-10 0c0-2.5 2-5 5-9z"/>',
    cultura: '<path d="M12 22V9"/><path d="M12 9c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 13C9 13 6 10.5 6 6c3.5 0 6 2.5 6 7z"/>',
    municipio: '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
    mapa: '<path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z"/><path d="M9 7v13M15 4v13"/>',
    escritorio: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
    beneficiario: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/>',
    relatorio: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13v5M12 11v7M16 15v3"/>',
    relatorios: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 15h8"/>',
    lancamento: '<path d="M12 5v14M5 12h14"/>',
    insercoes: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    registros: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    pessoa: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a6 6 0 00-6-6h-4a6 6 0 00-6 6v2"/>',
    dia: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 15h.01"/>',
    semana: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M7 15h10"/>',
    mes: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    imun: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    iesc: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
    iserv: '<path d="M14.7 6.3a4 4 0 01-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.2-.5-.5-2.2z"/>',
    itec: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a6 6 0 00-6-6h-4a6 6 0 00-6 6v2M9 7h6"/>',
    ihora: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pontos: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    comparativo: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    metas: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    tendencias: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    cruzamentos: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    alertas: '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
    _pub: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"/>',
    _log: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/>',
    _cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'
  };
  function icone(k) {
    var p = ICONES[k];
    return p ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>' : '';
  }

  function el(id) { return document.getElementById(id); }
  function mostrarBotao() { if (botao) botao.hidden = !A.ehResponsavel(); }
  window.addEventListener('admin-auth-atualizado', function () { mostrarBotao(); if (previa) sairPrevia(); });
  A.aoCarregar(mostrarBotao);
  mostrarBotao();

  /* ------------------------------------------------------------ estado */
  function carregarEstado(cfg) {
    var lp = (cfg && cfg.itens_publico) || P.padraoPublico;
    var ll = (cfg && cfg.itens_logado) || P.padraoLogado;
    estado.pub = {}; estado.log = {};
    todos.forEach(function (i) {
      estado.pub[i.k] = i.pub && lp.indexOf(i.k) >= 0;
      estado.log[i.k] = ll.indexOf(i.k) >= 0;
    });
    base = snapshot();
    anterior = null;
    pendenteAntes = null;
  }
  function snapshot() { return JSON.stringify(estado); }
  function listas() {
    var f = function (col) { return todos.filter(function (i) { return estado[col][i.k]; }).map(function (i) { return i.k; }); };
    return { pub: f('pub'), log: f('log') };
  }
  function contar(col) {
    var total = 0, on = 0;
    todos.forEach(function (i) {
      if (col === 'pub' && !i.pub) return;
      total++;
      if (estado[col][i.k]) on++;
    });
    return { on: on, total: total };
  }
  function hora() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* --------------------------------------------------------- gravação */
  function status(tipo, texto) {
    var s = el('cfgStatus');
    if (!s) return;
    s.className = 'cfg-status' + (tipo ? ' cfg-st-' + tipo : '');
    s.textContent = texto || '';
  }
  function atualizarDesfazer() {
    var b = el('cfgDesfazer');
    if (b) b.disabled = anterior === null || anterior === snapshot();
  }

  function salvarAgora() {
    clearTimeout(timer);
    timer = null;
    var json = snapshot();
    if (json === base) { pendenteAntes = null; status('', ''); atualizarDesfazer(); return Promise.resolve(); }
    var l = listas();
    salvando = true;
    status('busy', 'Salvando…');
    return P.salvar(l.pub, l.log).then(function () {
      anterior = pendenteAntes !== null ? pendenteAntes : base;
      pendenteAntes = null;
      base = json;
      salvando = false;
      status('ok', 'Salvo às ' + hora() + ' — já vale para todos');
      atualizarDesfazer();
      A.auditar('alterar', 'Alterou a visibilidade (público: ' + l.pub.length + ' item(ns); logado: ' + l.log.length + ' item(ns))');
    }).catch(function (e) {
      salvando = false;
      status('err', e.status === 403 || e.status === 401 ? 'Só o responsável (root) pode salvar.' : 'Não foi possível salvar (' + e.message + '). Tente de novo.');
    });
  }
  function agendar() {
    if (pendenteAntes === null) pendenteAntes = base;
    clearTimeout(timer);
    status('busy', 'Salvando…');
    timer = setTimeout(salvarAgora, 450);
    atualizarDesfazer();
  }
  /** Grava na hora o que estiver pendente (usado antes de uma pré-visualização). */
  function descarregar() { return timer ? salvarAgora() : Promise.resolve(); }

  /* ------------------------------------------------------------- ações */
  function ligar(col, k, v) {
    estado[col][k] = v;
    // ligar uma visão liga a própria "Mostrar mais"; senão ela nem apareceria
    if (v && filhos.indexOf(k) >= 0) estado[col][PAI] = true;
  }
  function alternar(col, k, v) {
    ligar(col, k, v);
    render();
    var c = document.querySelector('input[data-col="' + col + '"][data-k="' + k + '"]');
    if (c) c.focus();
    agendar();
  }
  function emMassa(col, v) {
    todos.forEach(function (i) { if (col !== 'pub' || i.pub) ligar(col, i.k, v); });
    if (!v) estado[col][PAI] = false;
    render();
    agendar();
  }
  function padrao(col) {
    var lista = col === 'pub' ? P.padraoPublico : P.padraoLogado;
    todos.forEach(function (i) { estado[col][i.k] = (col !== 'pub' || i.pub) && lista.indexOf(i.k) >= 0; });
    render();
    agendar();
  }
  function desfazer() {
    if (anterior === null) return;
    var alvo = JSON.parse(anterior);
    if (pendenteAntes === null) pendenteAntes = base;
    estado = alvo;
    render();
    agendar();
  }

  /* ------------------------------------------------------------ desenho */
  function linha(i, filho) {
    var sw = function (col) {
      var pode = col === 'pub' ? i.pub : true;
      if (!pode) {
        return '<span class="cfg-sw cfg-bloq" title="Mostra nomes de pessoas ou dados internos: nunca vai ao público">' + icone('_cadeado') + '</span>';
      }
      var off = filho && !estado[col][PAI];
      return '<label class="cfg-sw' + (off ? ' cfg-dim' : '') + '"' +
        (off ? ' title="&ldquo;Mostrar mais&rdquo; está desligada: esta visão só aparece quando ela for ligada"' : '') + '>' +
        '<input type="checkbox" role="switch" data-col="' + col + '" data-k="' + i.k + '"' + (estado[col][i.k] ? ' checked' : '') +
        ' aria-label="' + G.esc(i.r) + ' — ' + (col === 'pub' ? 'público' : 'usuário logado') + '"><i></i></label>';
    };
    var ehPai = i.k === PAI;
    var nota = ehPai ? '<small>aba inteira</small>' : '';
    return '<div class="cfg-lin' + (filho ? ' cfg-filho' : '') + (ehPai ? ' cfg-pai' : '') + '">' +
      '<span class="cfg-nome" title="' + G.esc(i.nota || i.r) + '">' + icone(i.k) + '<span>' + G.esc(i.r) + '</span>' + nota + '</span>' +
      sw('pub') + sw('log') + '</div>';
  }

  function cartao(titulo, linhas) {
    return '<section class="cfg-card"><div class="cfg-card-cab"><span class="cfg-card-tit">' + titulo + '</span>' +
      '<span class="cfg-col-tit" title="Público (sem login)">Público</span><span class="cfg-col-tit" title="Usuário logado (não root)">Logado</span></div>' +
      '<div class="cfg-lista">' + linhas + '</div></section>';
  }

  function perfil(col, titulo, sub) {
    var c = contar(col), pct = c.total ? Math.round(c.on / c.total * 100) : 0;
    return '<div class="cfg-perfil">' +
      '<span class="cfg-perfil-tit">' + icone(col === 'pub' ? '_pub' : '_log') + titulo + ' <small>' + sub + '</small></span>' +
      '<span class="cfg-perfil-n"><span><b>' + c.on + '</b> de ' + c.total + '</span><i class="cfg-bar"><b style="width:' + pct + '%"></b></i></span>' +
      '<span class="cfg-perfil-acoes">' +
      '<button type="button" data-todos="' + col + '" data-v="1" title="Ligar tudo que pode ser liberado">Todos</button>' +
      '<button type="button" data-todos="' + col + '" data-v="0" title="Desligar tudo">Nenhum</button>' +
      '<button type="button" data-padrao="' + col + '" title="Voltar ao padrão desta coluna">Padrão</button></span></div>';
  }

  function avisos() {
    var out = [];
    var pubAbas = abas.filter(function (i) { return i.pub && estado.pub[i.k]; }).length;
    var pubVisoes = visoes.filter(function (i) { return i.pub && estado.pub[i.k]; }).length;
    var pubMais = estado.pub[PAI] && pubVisoes > 0;
    if (!pubAbas && !pubMais) out.push(['err', 'O público não verá nenhuma aba. Ligue ao menos uma.']);
    else if (!estado.pub.geral) out.push(['info', 'Visão geral desligada para o público: ele abre na primeira aba liberada.']);
    if (estado.pub[PAI] && !pubVisoes) out.push(['info', '“Mostrar mais” ligada para o público, mas sem visão: não aparece.']);
    var logAbas = abas.filter(function (i) { return estado.log[i.k]; }).length;
    var logVisoes = visoes.filter(function (i) { return estado.log[i.k]; }).length;
    if (!logAbas && !(estado.log[PAI] && logVisoes)) out.push(['err', 'O usuário logado (não root) não verá nenhuma aba.']);
    return out.map(function (a) { return '<span class="cfg-aviso cfg-av-' + a[0] + '">' + a[1] + '</span>'; }).join('');
  }

  function render() {
    var perfis = el('cfgPerfis'), alvo = el('cfgVisib'), av = el('cfgAvisos');
    if (!alvo) return;
    if (perfis) perfis.innerHTML = perfil('pub', 'Público', 'sem login') + perfil('log', 'Usuário logado', 'não root');
    alvo.innerHTML =
      cartao('Abas', abas.map(function (i) { return linha(i, false); }).join('')) +
      cartao('Mostrar mais · listas', (pai ? linha(pai, false) : '') + visoesListas.map(function (i) { return linha(i, true); }).join('')) +
      cartao('Mostrar mais · análises', visoesAnalises.map(function (i) { return linha(i, true); }).join(''));
    if (av) av.innerHTML = avisos();
    atualizarDesfazer();
    marcarPrevia();
    ajustarAltura();
  }

  /** Faz a tela inteira caber na altura que sobra da janela (sem rolar a página): o contêiner ocupa o
      espaço livre e a altura das linhas se adapta; abaixo de ~27 px os controles ficam mais compactos. */
  function ajustarAltura() {
    var c = el('painel-configuracoes');
    if (!c || c.offsetParent === null) return;
    var estreito = window.innerWidth <= 900;
    if (estreito) { c.style.removeProperty('--cfg-alt'); return; }
    var wrap = document.querySelector('.wrap'), rodape = document.querySelector('body > footer');
    var rodapePag = (wrap ? (parseFloat(getComputedStyle(wrap).paddingBottom) || 0) : 0) + (rodape ? rodape.getBoundingClientRect().height : 0);
    var topo = c.getBoundingClientRect().top + window.scrollY;
    var alt = Math.floor(window.innerHeight - topo - rodapePag - 2);
    c.style.setProperty('--cfg-alt', Math.max(300, alt) + 'px');
    var corpo = el('cfgVisib');
    if (!corpo) return;
    var cab = corpo.querySelector('.cfg-card-cab');
    var livre = corpo.clientHeight - (cab ? cab.offsetHeight : 0) - 2;
    var maxLinhas = Math.max(abas.length, visoesListas.length + 1, visoesAnalises.length);
    var lin = Math.floor(livre / maxLinhas);
    lin = Math.max(19, Math.min(48, lin));
    c.style.setProperty('--cfg-lin', lin + 'px');
    // chaves e letras acompanham a altura da linha (telas altas ficam arejadas, telas baixas compactas)
    var sh = Math.max(14, Math.min(26, Math.round(lin * 0.56)));
    c.style.setProperty('--sw-h', sh + 'px');
    c.style.setProperty('--sw-w', Math.round(sh * 1.8) + 'px');
    c.style.setProperty('--cfg-fs', Math.max(11.5, Math.min(14.5, 9.5 + lin * 0.105)).toFixed(1) + 'px');
  }
  var tAjuste = null;
  window.addEventListener('resize', function () { clearTimeout(tAjuste); tAjuste = setTimeout(ajustarAltura, 120); });

  function renderSenha(cfg) {
    var alvo = el('cfgSenha');
    if (!alvo) return;
    var tem = !!(cfg && cfg.exige_senha);
    alvo.innerHTML =
      '<div class="cfg-senha-cab"><h3>Senha do link</h3><span class="cfg-senha-st ' + (tem ? 'cfg-com' : 'cfg-sem') + '">' +
      (tem ? 'Protegido por senha' : 'Sem senha') + '</span></div>' +
      '<div class="cfg-senha-linha"><input type="password" id="cfgSenhaNova" autocomplete="new-password" aria-label="' + (tem ? 'Nova senha' : 'Senha') +
      '" placeholder="' + (tem ? 'Nova senha (mín. 4)' : 'Definir senha (mín. 4)') + '">' +
      '<button type="button" class="btn" id="cfgSenhaSalvar">' + (tem ? 'Trocar' : 'Definir') + '</button>' +
      (tem ? '<button type="button" class="btn" id="cfgSenhaRemover">Remover</button>' : '') + '</div>' +
      '<p class="cfg-sub" id="cfgSenhaMsg" role="status"></p>';
  }

  function trocarSenha(senha) {
    var m = el('cfgSenhaMsg'), l = listas();
    m.textContent = 'Salvando…';
    P.salvar(l.pub, l.log, senha).then(function () {
      A.auditar('alterar', senha === '' ? 'Removeu a senha do link público' : 'Definiu uma senha no link público');
      return P.recarregar();
    }).then(function (c) {
      renderSenha(c);
      el('cfgSenhaMsg').textContent = senha === '' ? 'Senha removida ✓' : 'Senha salva ✓';
    }).catch(function (e) { m.textContent = 'Não foi possível salvar (' + e.message + ').'; });
  }

  /** Botões "Abrir" dos links apontam para o que está nos campos (preenchidos pelo js/dashboard.js). */
  function ligarLinks() {
    [['linkPublicoWeb', 'linkPublicoWebAbrir'], ['linkPublicoLocal', 'linkPublicoLocalAbrir']].forEach(function (p) {
      var c = el(p[0]), a = el(p[1]);
      if (c && a && c.value) a.href = c.value;
    });
  }

  /* ------------------------------------------------- pré-visualização */
  function marcarPrevia() {
    document.querySelectorAll('#painel-configuracoes [data-previa]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-previa') === previa ? 'true' : 'false');
    });
  }
  function sairPrevia() {
    previa = null;
    P.aplicarVisibilidade({ publico: false, root: true });
    if (banner) { banner.remove(); banner = null; }
    marcarPrevia();
  }
  function entrarPrevia(modo) {
    if (previa === modo) { sairPrevia(); return; }
    descarregar().then(function () {
      previa = modo;
      P.aplicarVisibilidade({ publico: modo === 'publico', root: false });
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'cfg-banner';
        banner.setAttribute('role', 'status');
        document.body.appendChild(banner);
        banner.addEventListener('click', function (e) { if (e.target.closest('button')) sairPrevia(); });
      }
      banner.innerHTML = '<span>Prévia: a barra de abas aparece como para ' + (modo === 'publico' ? '<b>o público</b>' : '<b>o usuário logado (não root)</b>') +
        '. Só a exibição muda; você continua como root.</span><button type="button">Sair da prévia</button>';
      marcarPrevia();
    });
  }

  /* ----------------------------------------------------------- eventos */
  var raiz = el('painel-configuracoes');
  if (raiz) {
    raiz.addEventListener('change', function (e) {
      var c = e.target.closest('input[type=checkbox][data-k]');
      if (c) alternar(c.getAttribute('data-col'), c.getAttribute('data-k'), c.checked);
    });
    raiz.addEventListener('click', function (e) {
      var t = e.target.closest('[data-todos]');
      if (t) { emMassa(t.getAttribute('data-todos'), t.getAttribute('data-v') === '1'); return; }
      var d = e.target.closest('[data-padrao]');
      if (d) { padrao(d.getAttribute('data-padrao')); return; }
      var pv = e.target.closest('[data-previa]');
      if (pv) { entrarPrevia(pv.getAttribute('data-previa')); return; }
      if (e.target.closest('#cfgDesfazer')) { desfazer(); return; }
      if (e.target.closest('#cfgPadrao')) {
        if (!window.confirm('Voltar ao padrão? O público vê tudo que pode ser liberado e o usuário logado vê tudo, menos Registros, Por lançador, Por dia, Por semana, Por mês e Mapa de pontos.')) return;
        P.salvar(null, null).then(function () { return P.recarregar(); }).then(function (c) {
          carregarEstado(c);
          render();
          status('ok', 'Padrão restaurado ✓');
          A.auditar('alterar', 'Restaurou a visibilidade padrão');
        }).catch(function (er) { status('err', 'Não foi possível restaurar (' + er.message + ').'); });
        return;
      }
      if (e.target.closest('#cfgSenhaSalvar')) {
        var s = el('cfgSenhaNova').value;
        if (s.length < 4) { el('cfgSenhaMsg').textContent = 'Use ao menos 4 caracteres.'; return; }
        trocarSenha(s);
      } else if (e.target.closest('#cfgSenhaRemover')) {
        trocarSenha('');
      }
    });
  }

  A.registrarAba('configuracoes', function () {
    if (!A.ehResponsavel()) {
      var a = el('cfgVisib');
      if (a) a.innerHTML = '<p class="vazio">Somente o responsável (root) pode alterar as configurações.</p>';
      return;
    }
    // não busca de novo enquanto há alteração pendente ou acabou de carregar: não pisa no que está na tela
    var recente = carregadoEm && (Date.now() - carregadoEm < 60000);
    if (timer || salvando || recente) { render(); renderSenha(P.config()); ligarLinks(); return; }
    P.recarregar().then(function (c) {
      carregarEstado(c);
      carregadoEm = Date.now();
      render();
      renderSenha(c);
      ligarLinks();
    }).catch(function () {
      var a = el('cfgVisib');
      if (a) a.innerHTML = '<p class="aviso erro">Não foi possível ler a configuração. Rode database/mecanizacao-visibilidade.sql no Supabase.</p>';
    });
  });
})();
