/* Navegação única do sistema — a mesma em todas as páginas com login.
   Antes cada página tinha o próprio "voltar" (← Menu, ← Início, ← Página
   inicial, ← Painéis, ← Seções…), algumas não tinham nenhum (Logs, Usuários)
   e "Sair" só existia no Início.

   Duas peças:
     - Menu lateral fixo (.sb): todas as páginas agrupadas por módulo, só as
       que a pessoa pode abrir (mesma regra de admin-gate.js / admin-home.js),
       com busca (Ctrl+K), quem está logado e Sair. No computador fica sempre
       à esquerda e o ☰ da barra do topo o recolhe numa faixa só de ícones (a
       escolha fica guardada). No celular (até 900px) não há menu lateral nem
       ☰: navega-se pelo Início (cartões grandes) e pela trilha, e o Sair fica
       na barra do topo — mais simples no toque.
     - Barra do topo (.snav): o ☰ e a trilha Início › Painéis › DEAGRO,
       em que cada nível é um link — "voltar um nível" é o item anterior.
   Tudo o que a navegação sabe sobre o sistema está em MAPA: página nova entra
   ali (com "pai" pra trilha) e aparece no menu e na trilha.

   Carregar no <head>, depois de admin-auth.js e admin-gate.js: as classes
   do <html> que reservam o espaço do menu entram antes da primeira pintura,
   sem a página "pular" pro lado. O CSS é css/nav.css. */
(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  if (window.MODO_PUBLICO) return;   // versão pública do painel: sem menu, sem login
  if (!auth || !auth.online) return;

  /* chave: a mesma de admin-gate.js / Acessos (null = qualquer conta aprovada).
     admin: só o responsável. menu: false = só aparece na trilha, não no menu. */
  var MAPA = {
    'index.html':              { nome: 'Início', grupo: null, chave: null },
    'eleicoes.html':           { nome: 'Fiscais', grupo: 'Fiscais', chave: 'eleicoes', pai: 'index.html' },
    'cadastros-fiscais.html':  { nome: 'Bairros dos fiscais', grupo: 'Fiscais', admin: true, pai: 'eleicoes.html' },
    // Painéis: dois itens no menu, Mecanização e DEAGRO.
    'dashboard.html':          { nome: 'Mecanização', grupo: 'Painéis', chave: 'dashboards', pai: 'index.html' },
    'lancamento-editar.html':  { nome: 'Editar lançamento', grupo: 'Painéis', chave: 'dashboards', pai: 'dashboard.html', paiHash: '#lancamento', menu: false, marca: 'dashboard.html' },
    // O DEAGRO abre direto na Visão geral (href): a página de seções fica só como
    // endereço antigo. A barra de abas do próprio painel faz o papel dela.
    'deagro-secoes.html':      { nome: 'DEAGRO', grupo: 'Painéis', chave: 'dashboards', pai: 'index.html', menu: false, marca: 'deagro.html' },
    'deagro.html':             { nome: 'DEAGRO', grupo: 'Painéis', chave: 'dashboards', pai: 'index.html', href: 'deagro.html#geral' },
    'chamados.html':           { nome: 'Fila de chamados', grupo: 'Chamados', chave: 'chamados', pai: 'index.html' },
    'cadastros-chamados.html': { nome: 'Cadastros auxiliares', grupo: 'Chamados', chave: 'chamados', pai: 'chamados.html' },
    // o formulário é público (link compartilhado), mas no menu só pra quem tem Chamados:
    // por padrão as contas veem só Fiscais
    'abrir-chamado.html':      { nome: 'Abrir chamado', grupo: 'Chamados', chave: 'chamados', pai: 'chamados.html' },
    'portarias.html':          { nome: 'Portarias', grupo: 'Documentos', chave: 'portarias', pai: 'index.html' },
    'organograma.html':        { nome: 'Organograma', grupo: 'Documentos', chave: 'organograma', pai: 'index.html' },
    'contatos.html':           { nome: 'Contatos', grupo: 'Documentos', chave: 'contatos', pai: 'index.html' },
    'admin-usuarios.html':     { nome: 'Usuários', grupo: 'Administração', admin: true, pai: 'index.html' },
    'logs.html':               { nome: 'Logs', grupo: 'Administração', admin: true, pai: 'index.html' },
    'admin-trocar-senha.html': { nome: 'Trocar senha', grupo: null, menu: false }
  };
  var GRUPOS = ['Fiscais', 'Painéis', 'Chamados', 'Documentos', 'Administração'];
  // Grupo com um item só que vira link solto no menu (como o Início), sem título de grupo.
  var GRUPOS_SOLTOS = {};
  var ICONES = {
    'Início': '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    'Fiscais': '<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7z"/><path d="M22 19H2"/>',
    'Painéis': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    'Chamados': '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/>',
    'Documentos': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    'Administração': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    'busca': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'sair': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    'fechar': '<path d="M18 6 6 18M6 6l12 12"/>',
    'lua': '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    'sol': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>'
  };
  var CHAVE_MINI = 'seagri_nav_mini';
  var DOMINIO_USUARIO = '@sistema.local';
  var raiz = document.documentElement;

  var arquivo = location.pathname.split('/').pop() || 'index.html';
  var atual = MAPA[arquivo];
  if (!atual) return;   // página fora do sistema com login (abrir chamado, login…)
  var restrita = arquivo === 'admin-trocar-senha.html';   // sem menu até trocar a senha
  var marcada = atual.marca || arquivo;   // página que fica acesa no menu

  // Espaço do menu reservado já no <head> (ver o comentário do topo).
  if (!restrita) {
    raiz.classList.add('sb-on');
    try { if (localStorage.getItem(CHAVE_MINI) === '1') raiz.classList.add('sb-mini'); } catch (e) { /* modo privado */ }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icone(nome, classe) {
    return '<svg class="' + (classe || 'sb-ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[nome] || '') + '</svg>';
  }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function celular() { return window.matchMedia('(max-width: 900px)').matches; }

  function pode(arq) {
    var p = MAPA[arq];
    if (!p) return false;
    var papel = auth.papel && auth.papel();
    if (papel !== 'responsavel' && papel !== 'aprovado') return false;
    if (p.admin) return papel === 'responsavel';
    return !p.chave || auth.podeAcessar(p.chave);
  }

  // Módulos (páginas logo abaixo do Início) que a pessoa pode abrir.
  function modulosAcessiveis() {
    return Object.keys(MAPA).filter(function (a) { return MAPA[a].pai === 'index.html' && MAPA[a].menu !== false && pode(a); });
  }

  function trilha() {
    var passos = [], arq = arquivo, guarda = 0;
    while (arq && MAPA[arq] && guarda++ < 8) {
      passos.unshift(arq);
      arq = MAPA[arq].pai;
    }
    // Um módulo só: o Início leva direto a ele (js/admin-home.js), então não
    // entra na trilha — senão o link voltava pro mesmo lugar.
    if (passos.length > 1 && passos[0] === 'index.html' && modulosAcessiveis().length === 1) passos.shift();
    return passos;
  }

  var barra, lateral, busca, veu;

  /* ------------------------------------------------------------ barra do topo */
  function montarBarra() {
    barra = document.createElement('nav');
    barra.className = 'snav';
    barra.setAttribute('aria-label', 'Onde você está');
    var passos = trilha();
    var trilhaHtml = passos.map(function (arq, i) {
      var p = MAPA[arq], ultimo = i === passos.length - 1;
      var nome = p.trilha || p.nome;
      var href = arq + (arq === atual.pai && atual.paiHash ? atual.paiHash : '');
      return '<li>' + (ultimo
        ? '<span aria-current="page">' + esc(nome) + '</span>'
        : '<a href="' + esc(href) + '">' + (i === 0 ? icone('Início', 'sb-ico snav-ico-inicio') : '') + '<span>' + esc(nome) + '</span></a>') + '</li>';
    }).join('');
    barra.innerHTML =
      (restrita ? '' : '<button type="button" class="snav-menu" aria-controls="sbLateral" aria-expanded="true" title="Mostrar/recolher o menu">' + icone('menu') + '</button>') +
      '<ol class="snav-trilha">' + trilhaHtml + '</ol>' +
      // Sair na barra: sempre na troca de senha; no celular (sem menu lateral) também
      '<button type="button" class="snav-sair' + (restrita ? '' : ' snav-sair-celular') + '">' + icone('sair') + '<span>Sair</span></button>';
    document.body.insertBefore(barra, document.body.firstChild);
    var bm = barra.querySelector('.snav-menu');
    if (bm) bm.addEventListener('click', alternarMenu);
    var bs = barra.querySelector('.snav-sair');
    if (bs) bs.addEventListener('click', sair);
  }

  /* ------------------------------------------------------------ menu lateral */
  function itemHtml(arq) {
    var p = MAPA[arq], aceso = arq === marcada;
    return '<a class="sb-item' + (aceso ? ' atual' : '') + '" href="' + esc(p.href || arq) + '"' + (aceso ? ' aria-current="page"' : '') +
      ' data-busca="' + esc(semAcento(p.nome + ' ' + (p.grupo || ''))) + '"><span>' + esc(p.nome) + '</span></a>';
  }

  function montarLateral() {
    lateral = document.createElement('aside');
    lateral.className = 'sb';
    lateral.id = 'sbLateral';
    lateral.setAttribute('aria-label', 'Menu do sistema');
    document.body.insertBefore(lateral, document.body.firstChild);
    veu = document.createElement('div');
    veu.className = 'sb-veu';
    veu.addEventListener('click', function () { fecharGaveta(); });
    document.body.insertBefore(veu, lateral.nextSibling);

    lateral.addEventListener('input', function (ev) { if (ev.target === busca) filtrar(); });
    lateral.addEventListener('keydown', teclas);
    lateral.addEventListener('click', function (ev) {
      var g = ev.target.closest('.sb-grupo-ico');
      if (g && raiz.classList.contains('sb-mini')) {   // faixa de ícones: abre o menu no grupo
        ev.preventDefault();
        definirMini(false);
        var alvo = lateral.querySelector('.sb-grupo[data-grupo="' + g.getAttribute('data-grupo') + '"]');
        if (alvo) alvo.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (ev.target.closest('.sb-fechar')) { fecharGaveta(true); return; }
      if (ev.target.closest('.sb-sair')) sair();
      if (ev.target.closest('.sb-tema')) {
        var real = document.getElementById('temaBtn');
        if (real) {
          real.click();
          var novo = lateral.querySelector('.sb-tema');
          if (novo) novo.outerHTML = temaHtml();
        }
      }
    });
    preencherLateral();
  }

  function preencherLateral() {
    var html =
      '<div class="sb-topo">' +
        '<a class="sb-marca" href="index.html" title="Início"><span class="sb-logo" aria-hidden="true">S</span><span class="sb-marca-txt">SISTEMA</span></a>' +
        '<button type="button" class="sb-fechar" title="Fechar o menu" aria-label="Fechar o menu">' + icone('fechar') + '</button>' +
      '</div>' +
      '<label class="sb-busca">' + icone('busca') +
        '<input type="search" placeholder="Buscar página…" aria-label="Buscar página" autocomplete="off"><kbd>Ctrl K</kbd></label>' +
      '<nav class="sb-lista" aria-label="Módulos">' +
        '<a class="sb-inicio' + (arquivo === 'index.html' ? ' atual' : '') + '" href="index.html"' + (arquivo === 'index.html' ? ' aria-current="page"' : '') +
          ' data-busca="inicio pagina inicial" title="Início">' + icone('Início') + '<span>Início</span></a>';
    GRUPOS.forEach(function (g) {
      var itens = Object.keys(MAPA).filter(function (a) { return MAPA[a].grupo === g && MAPA[a].menu !== false && pode(a); });
      if (!itens.length) return;
      if (GRUPOS_SOLTOS[g] && itens.length === 1) {
        var arqSolto = itens[0], acesoSolto = arqSolto === marcada;
        html += '<a class="sb-inicio sb-solto' + (acesoSolto ? ' atual' : '') + '" href="' + esc(arqSolto) + '"' + (acesoSolto ? ' aria-current="page"' : '') +
          ' data-busca="' + esc(semAcento(MAPA[arqSolto].nome + ' mecanizacao deagro dashboards')) + '" title="' + esc(MAPA[arqSolto].nome) + '">' +
          icone(g) + '<span>' + esc(MAPA[arqSolto].nome) + '</span></a>';
        return;
      }
      var aceso = atual.grupo === g;
      html += '<section class="sb-grupo' + (aceso ? ' atual' : '') + '" data-grupo="' + esc(g) + '">' +
        '<h3><button type="button" class="sb-grupo-ico" data-grupo="' + esc(g) + '" title="' + esc(g) + '" tabindex="-1">' + icone(g) + '</button><span>' + esc(g) + '</span></h3>' +
        itens.map(itemHtml).join('') + '</section>';
    });
    html += '<p class="sb-vazio" hidden>Nenhuma página encontrada.</p></nav>' +
      '<div class="sb-rodape"><span class="sb-usuario"></span>' + temaHtml() +
        '<button type="button" class="sb-sair" title="Sair">' + icone('sair') + '<span>Sair</span></button></div>';
    lateral.innerHTML = html;
    busca = lateral.querySelector('.sb-busca input');
    atualizarUsuario();
    // a página atual sempre à vista, mesmo quando é um dos últimos itens
    var aceso = lateral.querySelector('.sb-item.atual');
    if (aceso) {
      var lista = lateral.querySelector('.sb-lista');
      var margem = aceso.offsetTop - lista.offsetTop - lista.clientHeight + aceso.offsetHeight + 24;
      if (margem > 0) lista.scrollTop = margem;
    }
  }

  /* Tema claro/escuro ao lado do usuário. O botão de verdade fica na própria
     página (#temaBtn, que sabe redesenhar os gráficos); este só o aciona. */
  function temaHtml() {
    if (!document.getElementById('temaBtn')) return '';
    var escuro = raiz.getAttribute('data-tema') === 'escuro';
    var rotulo = escuro ? 'Tema claro' : 'Tema escuro';
    return '<button type="button" class="sb-tema" title="' + rotulo + '" aria-label="' + rotulo + '">' + icone(escuro ? 'sol' : 'lua') + '</button>';
  }

  function atualizarUsuario() {
    var s = auth.sessaoAtual && auth.sessaoAtual();
    var alvo = lateral && lateral.querySelector('.sb-usuario');
    if (!alvo) return;
    var email = s && s.user && s.user.email;
    if (!email) { alvo.innerHTML = ''; return; }
    var login = email.toLowerCase().endsWith(DOMINIO_USUARIO) ? email.slice(0, -DOMINIO_USUARIO.length) : email;
    alvo.innerHTML = '<span class="sb-avatar" aria-hidden="true">' + esc(login.charAt(0).toUpperCase()) + '</span><span class="sb-login">' + esc(login) + '</span>';
    alvo.title = email;
  }

  function sair() {
    try { sessionStorage.removeItem('seagri_home_direto'); } catch (e) { /* idem admin-home.js */ }
    var ir = function () { location.href = 'admin-login.html'; };
    try { auth.sair().then(ir, ir); } catch (e) { ir(); }
  }

  /* ------------------------------------------------------------------ busca */
  function itensBusca() { return Array.prototype.slice.call(lateral.querySelectorAll('.sb-item, .sb-inicio')); }
  function filtrar() {
    var q = semAcento(busca.value.trim());
    var algum = false;
    itensBusca().forEach(function (it) {
      var casa = !q || it.getAttribute('data-busca').indexOf(q) >= 0;
      it.hidden = !casa;
      if (casa) algum = true;
    });
    lateral.querySelectorAll('.sb-grupo').forEach(function (g) { g.hidden = !g.querySelector('.sb-item:not([hidden])'); });
    lateral.querySelector('.sb-vazio').hidden = algum;
  }
  function visiveis() { return itensBusca().filter(function (it) { return !it.hidden && !(it.closest('.sb-grupo') || {}).hidden; }); }

  function teclas(ev) {
    if (ev.key === 'Escape') {
      if (busca.value) { busca.value = ''; filtrar(); busca.focus(); }
      else if (raiz.classList.contains('sb-gaveta')) fecharGaveta(true);
      else busca.blur();
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Enter' && ev.target === busca) {
      var q = busca.value.trim();
      var primeiro = q && visiveis()[0];
      if (primeiro) { ev.preventDefault(); location.href = primeiro.getAttribute('href'); }
      return;
    }
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (ev.target === busca || ev.target.closest('.sb-lista'))) {
      var itens = visiveis();
      if (!itens.length) return;
      ev.preventDefault();
      var i = itens.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') (itens[i + 1] || itens[0]).focus();
      else if (i <= 0) busca.focus();
      else itens[i - 1].focus();
    }
  }

  /* -------------------------------------------------- recolher / gaveta */
  function definirMini(mini) {
    raiz.classList.toggle('sb-mini', mini);
    try { localStorage.setItem(CHAVE_MINI, mini ? '1' : '0'); } catch (e) { /* modo privado */ }
    sincronizarBotao();
    avisarLayout();
  }
  function abrirGaveta() {
    raiz.classList.add('sb-gaveta');
    sincronizarBotao();
    busca.focus();
  }
  function fecharGaveta(devolverFoco) {
    if (!raiz.classList.contains('sb-gaveta')) return;
    raiz.classList.remove('sb-gaveta');
    sincronizarBotao();
    var bm = barra && barra.querySelector('.snav-menu');
    if (devolverFoco && bm) bm.focus();
  }
  function alternarMenu() {
    if (celular()) { if (raiz.classList.contains('sb-gaveta')) fecharGaveta(true); else abrirGaveta(); }
    else definirMini(!raiz.classList.contains('sb-mini'));
  }
  function sincronizarBotao() {
    var bm = barra && barra.querySelector('.snav-menu');
    if (!bm) return;
    var aberto = celular() ? raiz.classList.contains('sb-gaveta') : !raiz.classList.contains('sb-mini');
    bm.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  }
  /* Painéis que medem a própria altura/largura (gráficos, mapa, organograma)
     precisam saber que a área útil mudou quando o menu recolhe/abre. */
  function avisarLayout() {
    setTimeout(function () {
      try { window.dispatchEvent(new Event('resize')); } catch (e) { /* navegador antigo */ }
    }, 220);
  }

  document.addEventListener('keydown', function (ev) {
    if (restrita || !lateral) return;
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      if (celular()) abrirGaveta();
      else { if (raiz.classList.contains('sb-mini')) definirMini(false); busca.focus(); busca.select(); }
    }
  });
  window.addEventListener('resize', function () {
    if (!celular()) raiz.classList.remove('sb-gaveta');
    sincronizarBotao();
  });

  /* ---------------------------------------------------------------- início */
  function iniciar() {
    if (!restrita) montarLateral();
    montarBarra();
    if (barra && lateral) document.body.insertBefore(barra, lateral.nextSibling.nextSibling);
    sincronizarBotao();
    // painéis que medem a altura útil na carga (dashboard.js, deagro.js)
    // mediram antes da barra existir — o "resize" faz eles medirem de novo
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* navegador antigo */ }
  }
  window.addEventListener('admin-auth-atualizado', function () {
    // redesenha pras permissões novas, mas não no meio de uma busca
    if (lateral && document.activeElement !== busca) preencherLateral();
    else atualizarUsuario();
  });
  if (document.body) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar);
})();
