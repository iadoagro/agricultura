/* Página inicial: uma central do dia, não mais uma grade de módulos (o menu
   lateral já leva a cada tela). Quatro blocos, cada um só para quem tem acesso
   àquela área:
     Precisa de você  — solicitações e cadastros pendentes, chamados, alertas
     Resumo do ano    — números da Mecanização, com variação contra o ano anterior
     Atalhos          — as ações que mais se repetem
     Últimos lançamentos / Atividade recente (esta só para root@root.com)
   Cada bloco busca os próprios dados e só aparece se tiver o que mostrar; uma
   falha num deles não derruba os outros. */
(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  var cfg = window.BANCO_CONFIG || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n, casas) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas || 0, minimumFractionDigits: casas || 0 }); }

  /* ------------------------------------------------- páginas do sistema */
  /* Quem tem acesso a um único módulo vai sempre direto para ele: esta tela
     só teria um bloco. Dentro do módulo a trilha não mostra "Início" (ver
     js/nav.js) e o Sair fica na barra do topo, então ninguém fica preso. */
  var MODULOS = [
    { href: 'admin-usuarios.html', admin: true },
    { href: 'eleicoes.html', chave: 'eleicoes' },
    { href: 'cadastros-fiscais.html', admin: true },
    { href: 'logs.html', admin: true },
    { href: 'portarias.html', chave: 'portarias' },
    { href: 'organograma.html', chave: 'organograma' },
    { href: 'chamados.html', chave: 'chamados' },
    { href: 'dashboard.html', chave: 'dashboards' },
    { href: 'contatos.html', chave: 'contatos' }
  ];
  function ehResponsavel() { return Boolean(auth) && auth.papel() === 'responsavel'; }
  function pode(chave) { return Boolean(auth) && auth.podeAcessar(chave); }
  function acessiveis() {
    return MODULOS.filter(function (m) { return m.admin ? ehResponsavel() : pode(m.chave); });
  }
  function irDireto() {
    if (!auth || !auth.liberado || !auth.liberado() || auth.deveTrocarSenha()) return false;
    var lista = acessiveis();
    if (lista.length !== 1) return false;
    location.replace(lista[0].href);
    return true;
  }

  /* ------------------------------------------------------------- saudação */
  function nomeDaConta() {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    var mail = (s && s.user && s.user.email) || '';
    var login = mail.split('@')[0];
    if (!login) return '';
    if (mail === (auth.RESPONSAVEL_EMAIL || 'root@root.com')) return 'responsável';
    return login.split('.')[0].replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function saudacao() {
    var h = new Date().getHours();
    var oi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    var nome = nomeDaConta();
    el('homeSaudacao').textContent = oi + (nome ? ', ' + nome : '');
    var data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    el('homeData').textContent = data.charAt(0).toUpperCase() + data.slice(1);
  }

  /* ------------------------------------------------------- lançamentos (API) */
  function chamarLancamentos(campos) {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    if (!s || !s.access_token || !window.LANCAMENTO_CAMPOS) return Promise.reject(new Error('sem sessão'));
    var fd = new FormData();
    fd.append('token', s.access_token);
    Object.keys(campos).forEach(function (c) { fd.append(c, campos[c]); });
    return window.LANCAMENTO_CAMPOS.enviar(fd).then(function (r) {
      if (!r.corpo || !r.corpo.ok) throw new Error((r.corpo && r.corpo.erro) || 'falha');
      return r.corpo;
    });
  }
  var cacheLancadores = null;
  function lancadores() {
    if (!cacheLancadores) cacheLancadores = chamarLancamentos({ acao: 'lancadores' }).catch(function () { return { lancadores: [] }; });
    return cacheLancadores;
  }
  function nomeDoEmail(email, mapa) {
    var e = String(email || '').toLowerCase();
    if (mapa[e]) return mapa[e];
    var login = e.split('@')[0];
    return login.split('.').map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
  }
  function quando(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    var hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dias <= 0 && new Date().getDate() === d.getDate()) return 'hoje, ' + hora;
    if (dias <= 1) return 'ontem, ' + hora;
    return d.toLocaleDateString('pt-BR') + ' ' + hora;
  }

  /* ------------------------------------------------------- Precisa de você */
  function cartaoPend(href, valor, rotulo, tom) {
    return '<a class="home-pend-item' + (tom ? ' ' + tom : '') + (valor ? '' : ' zero') + '" href="' + esc(href) + '">' +
      '<b>' + num(valor) + '</b><span>' + esc(rotulo) + '</span></a>';
  }
  function carregarPendencias() {
    var itens = [];   // promessas -> html
    if (ehResponsavel()) {
      itens.push(chamarLancamentos({ acao: 'solicitacoes' }).then(function (r) {
        return cartaoPend('dashboard.html#lancamento', (r.solicitacoes || []).length, 'solicitações de lançamentos', 'aviso');
      }));
      itens.push(auth.listarSolicitacoes().then(function (l) {
        var n = (l || []).filter(function (x) { return x.status === 'pendente'; }).length;
        return cartaoPend('admin-usuarios.html', n, 'cadastros de usuário para aprovar', 'aviso');
      }));
      itens.push(lancadores().then(function (r) {
        var n = (r.lancadores || []).filter(function (x) { return !x.nome && !x.usuario_email; }).length;
        return cartaoPend('dashboard.html#lancamento', n, 'e-mails de lançamento sem nome', '');
      }));
      itens.push(auth.contarAlertasNaoVistos().then(function (n) {
        return cartaoPend('logs.html', n, 'alertas de segurança novos', n ? 'perigo' : '');
      }));
    }
    if (pode('chamados') && window.CHAMADOS) {
      itens.push(window.CHAMADOS.listar().then(function (todos) {
        var ST = window.CHAMADOS.meta.status;
        var abertos = todos.filter(function (c) { return ST[c.status] && ST[c.status].ativo; });
        var urg = abertos.filter(function (c) { return c.prioridade === 'critica' || c.prioridade === 'alta'; }).length;
        var sem = abertos.filter(function (c) { return !c.responsavel_nome; }).length;
        return cartaoPend('chamados.html', abertos.length, 'chamados em aberto', '') +
          cartaoPend('chamados.html', urg, 'chamados urgentes (alta ou crítica)', urg ? 'perigo' : '') +
          cartaoPend('chamados.html', sem, 'chamados sem responsável', sem ? 'aviso' : '');
      }));
    }
    if (!itens.length) return;
    el('blocoPendencias').hidden = false;
    Promise.all(itens.map(function (p) { return p.catch(function () { return ''; }); })).then(function (htmls) {
      var html = htmls.join('');
      el('homePend').innerHTML = html
        ? html
        : '<p class="home-carregando">Não foi possível carregar as pendências agora.</p>';
    });
  }

  /* ---------------------------------------------------------- Resumo do ano */
  function anoDe(r) { return r.ex || String(r.d || '').slice(0, 4); }
  function resumir(regs) {
    return {
      ha: regs.reduce(function (t, r) { return t + (+r.ha || 0); }, 0),
      atend: regs.length,
      tanques: regs.reduce(function (t, r) { return t + (+r.ac || 0); }, 0),
      muns: Object.keys(regs.reduce(function (m, r) { if (r.mun) m[r.mun] = 1; return m; }, {})).length
    };
  }
  function variacao(atual, antes, rotuloAnterior) {
    if (!antes) return '';
    var pct = Math.round((atual - antes) / antes * 100);
    return '<small class="' + (pct >= 0 ? 'sobe' : 'desce') + '">' + (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '% vs ' + rotuloAnterior + '</small>';
  }
  function carregarResumo() {
    if (!pode('dashboards')) return;
    el('blocoResumo').hidden = false;
    var regs = [];
    function desenhar(ano, a, antes, b) {
      el('homeAno').textContent = ano;
      function kpi(rot, valor, ant, casas, un) {
        return '<div class="home-kpi"><span>' + rot + '</span><b>' + num(valor, casas) + (un ? '<em>' + un + '</em>' : '') + '</b>' +
          (b && ant ? variacao(valor, ant, antes) : '') + '</div>';
      }
      el('homeKpis').innerHTML =
        kpi('Hectares mecanizados', a.ha, b && b.ha, 1, 'ha') +
        kpi('Atendimentos', a.atend, b && b.atend, 0, '') +
        kpi('Tanques / açudes', a.tanques, b && b.tanques, 0, '') +
        kpi('Municípios atendidos', a.muns, b && b.muns, 0, '');
    }
    fetch('../data/mecanizacao.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('sem arquivo'); return r.json(); })
      .then(function (j) {
        regs = (j && j.registros) || [];
        if (!regs.length) throw new Error('vazio');
        var anos = Object.keys(regs.reduce(function (m, r) { m[anoDe(r)] = 1; return m; }, {})).sort();
        var ano = anos[anos.length - 1];
        var atual = resumir(regs.filter(function (r) { return anoDe(r) === ano; }));
        desenhar(ano, atual, null, null);
        // os exercícios encerrados ficam num arquivo grande à parte (o mesmo do painel):
        // só entra depois dos números do ano já estarem na tela, para comparar
        var s = document.createElement('script');
        s.src = '../js/dados-mecanizacao-historico.js?v=2026091101';
        s.async = true;
        s.onload = function () {
          var h = window.DADOS_MECANIZACAO_HISTORICO;
          var lista = (h && h.registros) || [];
          if (!lista.length) return;
          var anosH = Object.keys(lista.reduce(function (m, r) { m[anoDe(r)] = 1; return m; }, {})).sort();
          var antes = anosH[anosH.length - 1];
          if (!antes || antes >= ano) return;
          desenhar(ano, atual, antes, resumir(lista.filter(function (r) { return anoDe(r) === antes; })));
        };
        document.body.appendChild(s);
      })
      .catch(function () { el('blocoResumo').hidden = true; });
  }

  /* ---------------------------------------------------------------- Atalhos */
  var ICO = {
    mais: '<path d="M12 5v14M5 12h14"/>',
    chamado: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/>',
    contato: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    fiscal: '<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7z"/><path d="M22 19H2"/>',
    painel: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    org: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>'
  };
  function atalho(href, rotulo, icone, principal) {
    return '<a class="home-atalho' + (principal ? ' principal' : '') + '" href="' + esc(href) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[icone] + '</svg>' +
      '<span>' + esc(rotulo) + '</span></a>';
  }
  function montarAtalhos() {
    var h = '';
    if (pode('dashboards')) h += atalho('dashboard.html#lancamento', '+ Novo relatório', 'mais', true);
    if (pode('chamados')) h += atalho('abrir-chamado.html', 'Abrir chamado', 'chamado', false);
    if (pode('contatos')) h += atalho('contatos.html', 'Buscar contato', 'contato', false);
    if (pode('eleicoes')) h += atalho('eleicoes.html', 'Buscar fiscal', 'fiscal', false);
    if (pode('dashboards')) h += atalho('dashboard.html', 'Painel de Mecanização', 'painel', false) + atalho('deagro.html#geral', 'Painel do DEAGRO', 'painel', false);
    if (pode('portarias')) h += atalho('portarias.html', 'Portarias', 'doc', false);
    if (pode('organograma')) h += atalho('organograma.html', 'Organograma', 'org', false);
    if (!h) return;
    el('homeAtalhos').innerHTML = h;
    el('blocoAtalhos').hidden = false;
  }

  /* ---------------------------------------------------- Últimos lançamentos */
  function carregarLancamentos() {
    if (!pode('dashboards')) return;
    el('blocoLanc').hidden = false;
    var campos = { acao: 'listar', limite: '5', pagina: '1' };
    if (ehResponsavel()) campos.f_pessoa = 'todos';
    else el('tituloLanc').textContent = 'Seus últimos lançamentos';
    Promise.all([chamarLancamentos(campos), lancadores()]).then(function (r) {
      var linhas = r[0].lancamentos || [];
      var mapa = {};
      (r[1].lancadores || []).forEach(function (l) { if (l.nome) mapa[String(l.email || '').toLowerCase()] = l.nome; });
      el('homeLanc').innerHTML = linhas.length ? linhas.map(function (l) {
        return '<li><a href="dashboard.html#lancamento"><b>' + esc(l.nome_beneficiario) + '</b>' +
          '<span>' + esc(l.tipo_servico || '') + (l.municipio ? ' · ' + esc(l.municipio) : '') + '</span>' +
          '<small>' + esc(nomeDoEmail(l.criado_por_email, mapa)) + ' · ' + esc(quando(l.criado_em)) + '</small></a></li>';
      }).join('') : '<li class="home-carregando">Nenhum lançamento ainda.</li>';
    }).catch(function () { el('blocoLanc').hidden = true; });
  }

  /* -------------------------------------------------------- Atividade recente */
  function carregarEventos() {
    if (!ehResponsavel()) return;
    el('blocoEventos').hidden = false;
    // a navegação (páginas abertas, cliques, tempo) é muito volume: só o que mudou algo
    auth.listarEventos({ limite: 80 }).then(function (lista) {
      var uteis = (lista || []).filter(function (e) { return e.modulo !== 'navegacao'; }).slice(0, 6);
      el('homeEventos').innerHTML = uteis.length ? uteis.map(function (e) {
        var quem = String(e.usuario_email || '').split('@')[0];
        return '<li><a href="logs.html"><b>' + esc(e.descricao || e.acao) + '</b>' +
          '<small>' + esc(quem) + ' · ' + esc(quando(e.criado_em)) + '</small></a></li>';
      }).join('') : '<li class="home-carregando">Nada de novo por enquanto.</li>';
    }).catch(function () { el('blocoEventos').hidden = true; });
  }

  /* Na tela cheia (sem rolagem) as listas mostram só os itens que cabem inteiros:
     o resto some em vez de aparecer cortado pela metade. */
  function cortarExcesso() {
    document.querySelectorAll('.home-lista, .home-atalhos, .home-pend').forEach(function (caixa) {
      Array.prototype.forEach.call(caixa.children, function (x) { x.classList.remove('home-cortado'); });
      if (!window.matchMedia('(min-width:1100px) and (min-height:680px)').matches) return;
      var limite = caixa.getBoundingClientRect().bottom;
      Array.prototype.forEach.call(caixa.children, function (x) {
        if (x.getBoundingClientRect().bottom > limite + 1) x.classList.add('home-cortado');
      });
    });
  }
  var esperaCorte;
  function agendarCorte() { clearTimeout(esperaCorte); esperaCorte = setTimeout(cortarExcesso, 120); }
  window.addEventListener('resize', agendarCorte);
  if (window.MutationObserver) {
    new MutationObserver(agendarCorte).observe(document.getElementById('home'), { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------- início */
  var montado = false;
  function aplicar() {
    if (!auth || !auth.liberado || !auth.liberado()) return;
    if (irDireto()) return;
    if (montado) return;   // o perfil chega mais de uma vez; os dados só precisam ser buscados uma
    montado = true;
    saudacao();
    montarAtalhos();
    carregarPendencias();
    carregarResumo();
    carregarLancamentos();
    carregarEventos();
  }
  window.addEventListener('admin-auth-atualizado', aplicar);
  aplicar();
})();
