/* Página VPN (equipe): link público, lista das solicitações, abrir o documento e marcar a situação.
   Lê com a sessão de quem está logado (policies de database/vpn.sql). */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var auth = window.ADMIN_AUTH;
  var lista = [];
  var tbody = document.getElementById('vpnLista');
  var busca = document.getElementById('vpnBusca');
  var filtro = document.getElementById('vpnFiltro');
  var ROTULO = { pendente: 'Pendente', atendida: 'Atendida', recusada: 'Recusada' };
  var ROTULO_VINCULO = { efetivo: 'Efetivo', comissionado: 'Comissionado', terceirizado: 'Terceirizado' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function base() { return String(cfg.url || '').replace(/\/$/, ''); }
  function token() {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    if (!s || s.expires_at * 1000 <= Date.now()) throw new Error('Sua sessão expirou. Entre de novo.');
    return s.access_token;
  }
  function cab(extra) {
    var h = { apikey: cfg.chavePublica, Authorization: 'Bearer ' + token() };
    Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function cpfBr(c) { return String(c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
  function zapBr(n) { return String(n || '').replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'); }
  // número com link direto para abrir a conversa no WhatsApp (wa.me, com o 55 do Brasil)
  function zapLink(l) {
    var d = String(l.whatsapp || '').replace(/\D/g, '');
    if (!d) return '';
    return '<a class="vpn-zap" data-zap="' + esc(l.id) + '" href="https://wa.me/55' + esc(d) + '" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp">' + esc(zapBr(d)) + '</a>';
  }
  // atendente = quem clicou por último no número do WhatsApp (responsável pelo contato)
  function atendenteHtml(l) {
    if (!l.whatsapp_por) return '<span class="vpn-doc-vazio" title="Ninguém chamou ainda">—</span>';
    return '<span class="vpn-atendente" title="Último a abrir a conversa no WhatsApp">' + esc(l.whatsapp_por) + '</span><small class="vpn-atendente-em">' + esc(dataCurtaHoraBr(l.whatsapp_em)) + '</small>';
  }
  function atendenteHtmlDialogo(l) {
    return l.whatsapp_por ? esc(l.whatsapp_por) + ' · ' + esc(dataHoraBr(l.whatsapp_em)) : '';
  }
  function dataCurtaHoraBr(t) {
    var d = new Date(t); if (isNaN(d)) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  }
  // clicou no número: grava quem foi (o link abre normalmente, a gravação segue em paralelo)
  function registrarZap(id) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    var email = String((s && s.user && s.user.email) || '').split('@')[0].replace(/\./g, ' ');
    var antes = { por: l.whatsapp_por, em: l.whatsapp_em };
    l.whatsapp_por = nomeProprio(email); l.whatsapp_em = new Date().toISOString();
    desenhar(); atualizarZapNoDialogo(l);
    fetch(base() + '/rest/v1/rpc/vpn_registrar_whatsapp', { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id }) })
      .then(function (r) { if (!r.ok) throw new Error(); })
      .catch(function () { l.whatsapp_por = antes.por; l.whatsapp_em = antes.em; desenhar(); atualizarZapNoDialogo(l); });
  }
  function atualizarZapNoDialogo(l) {
    var alvo = document.getElementById('vpnVerZap'), at = document.getElementById('vpnVerAtendente');
    if (alvo && verId === l.id) alvo.innerHTML = zapLink(l);
    if (at && verId === l.id) at.innerHTML = atendenteHtmlDialogo(l);
  }
  document.addEventListener('click', function (e) {
    var z = e.target.closest && e.target.closest('a[data-zap]');
    if (z) { var zid = z.getAttribute('data-zap'); setTimeout(function () { registrarZap(zid); }, 0); }   // depois do clique, para o link abrir antes de a tabela ser redesenhada
  });
  function nomeProprio(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ').map(function (p, i) {
      if (i > 0 && /^(de|da|do|das|dos|e)$/.test(p)) return p;
      return p.replace(/(^|['\u2019-])(\S)/g, function (m, a, c) { return a + c.toUpperCase(); });
    }).join(' ');
  }
  // Sigla do setor: vem das caixas do organograma (o banco guarda só o nome do setor)
  var siglas = {};
  function chaveSetor(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function guardarSiglas(dados) {
    siglas = {};
    ((dados && dados.nos) || []).forEach(function (n) {
      if (n.title && n.sigla && chaveSetor(n.sigla) !== chaveSetor(n.title)) siglas[chaveSetor(n.title)] = n.sigla;
    });
  }
  function setorComSigla(setor) {
    var s = siglas[chaveSetor(setor)];
    return s ? setor + ' (' + s + ')' : (setor || '');
  }
  if (window.OrgContatos) {
    var emCache = window.OrgContatos.doCache();
    if (emCache) guardarSiglas(emCache);
    window.OrgContatos.carregar().then(function (r) { guardarSiglas(r.dados); if (lista.length) desenhar(); }, function () { /* sem sigla: mostra só o nome */ });
  }
  function dataBr(d) { var p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function dataHoraBr(t) {
    var d = new Date(t); if (isNaN(d)) return '';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  // link público: sempre o do GitHub Pages, mesmo quando a página é aberta em localhost
  document.getElementById('vpnLink').value = 'https://iadoagro.github.io/agricultura/pages/vpn-formulario.html';
  // link público: ativo/desativado (página em branco) e senha de acesso — só o responsável altera
  var cfgAtivo = document.getElementById('vpnCfgAtivo'), cfgSenha = document.getElementById('vpnCfgSenha'), cfgMsg = document.getElementById('vpnCfgMsg');
  var cfgCarregada = false;
  async function carregarConfig() {
    if (cfgCarregada) return;
    cfgCarregada = true;
    try {
      var r = await fetch(base() + '/rest/v1/rpc/vpn_config_ler', { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: '{}' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var c = await r.json();
      cfgAtivo.checked = Boolean(c.link_ativo); cfgSenha.checked = Boolean(c.senha_ativa);
    } catch (e) { cfgCarregada = false; cfgMsg.textContent = 'Não foi possível ler a configuração. Rode database/vpn.sql no Supabase.'; }
  }
  async function salvarConfig() {
    cfgAtivo.disabled = cfgSenha.disabled = true;
    try {
      var r = await fetch(base() + '/rest/v1/rpc/vpn_config_salvar', {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ p_link_ativo: cfgAtivo.checked, p_senha_ativa: cfgSenha.checked })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      cfgMsg.textContent = (cfgAtivo.checked ? 'Link ativo' : 'Link desativado: quem abrir vê uma página em branco') + (cfgAtivo.checked && cfgSenha.checked ? ', com senha.' : '.') + ' Salvo.';
    } catch (e) { cfgMsg.textContent = 'Não foi possível salvar. Tente de novo.'; cfgCarregada = false; carregarConfig(); }
    cfgAtivo.disabled = cfgSenha.disabled = false;
  }
  cfgAtivo.addEventListener('change', salvarConfig);
  cfgSenha.addEventListener('change', salvarConfig);

  // link local: só a conta responsável (root) vê, para testar o formulário no XAMPP
  var LINK_LOCAL = 'http://localhost/agricultura/pages/vpn-formulario.html';
  function ehRoot() {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    return Boolean(s && s.user && auth.RESPONSAVEL_EMAIL && String(s.user.email || '').toLowerCase() === auth.RESPONSAVEL_EMAIL);
  }
  function linkLocal() {
    var root = ehRoot();
    document.getElementById('vpnLinkLocalBox').hidden = !root;
    document.getElementById('vpnConfigBox').hidden = !root;
    document.getElementById('vpnTermosTodos').hidden = false;
    if (root) carregarConfig();
    document.getElementById('vpnLinkLocal').value = LINK_LOCAL;
    document.getElementById('vpnAbrirLocal').href = LINK_LOCAL;
  }
  linkLocal();
  window.addEventListener('admin-auth-atualizado', linkLocal);
  document.getElementById('vpnCopiar').addEventListener('click', function () {
    var campo = document.getElementById('vpnLink'), b = this;
    function ok() { b.textContent = 'Link copiado'; setTimeout(function () { b.textContent = 'Copiar link'; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(campo.value).then(ok, function () { campo.select(); });
    else { campo.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* seleção fica à vista */ } }
  });

  // ---- tema claro/escuro (mesmo data-tema e mesma preferência 'seagri_tema' dos painéis; o menu lateral aciona este botão)
  var btnTema = document.getElementById('temaBtn');
  function temaAtual() { return document.documentElement.getAttribute('data-tema') || 'claro'; }
  function pintarTema() {
    if (!btnTema) return;
    var escuro = temaAtual() === 'escuro';
    btnTema.innerHTML = (escuro
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>') +
      '<span>' + (escuro ? 'Tema claro' : 'Tema escuro') + '</span>';
    btnTema.setAttribute('aria-label', escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro');
  }
  if (btnTema) {
    pintarTema();
    btnTema.addEventListener('click', function () {
      var novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
      document.documentElement.setAttribute('data-tema', novo);
      try { localStorage.setItem('seagri_tema', novo); } catch (e) { /* modo privado */ }
      pintarTema();
    });
  }

  var SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONE = {
    ver: SVG + '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    editar: SVG + '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    excluir: SVG + '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
  };
  // "Novo" (destaque verde) até a equipe ver: abrir Visualizar, Editar ou o documento marca sozinho; clicar em "Novo" marca na mão
  function marcarVisto(id) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l || l.visto_em) return;
    l.visto_em = new Date().toISOString();
    desenhar();
    fetch(base() + '/rest/v1/rpc/vpn_marcar_visto', { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id }) })
      .then(function (r) { if (!r.ok) throw new Error(); })
      .catch(function () { l.visto_em = null; desenhar(); });   // não gravou: volta a aparecer como novo
  }
  // Nº = posição na lista dos cadastros que existem (1, 2, 3…): sem buracos quando alguém é excluído
  var seqMapa = null, seqRef = null, seqTotal = -1;
  function ordemCadastro(a, b) { return (new Date(a.criado_em) - new Date(b.criado_em)) || (a.numero - b.numero); }
  function seq(l) {
    if (seqRef !== lista || seqTotal !== lista.length) {
      seqMapa = {}; seqRef = lista; seqTotal = lista.length;
      lista.slice().sort(ordemCadastro).forEach(function (x, i) { seqMapa[x.id] = i + 1; });
    }
    return seqMapa[l.id] || l.numero;
  }
  function celulaDoc(html) { return html || '<span class="vpn-doc-vazio" title="Não enviado">—</span>'; }
  function desenhar() {
    var q = semAcento(busca.value), st = filtro.value;
    var v = lista.filter(function (l) {
      if (st && l.status !== st) return false;
      return !q || semAcento([l.nome, l.cpf, cpfBr(l.cpf), l.matricula, l.email_funcional, l.setor, l.rg, l.whatsapp, l.observacoes, ROTULO_VINCULO[l.vinculo]].join(' ')).indexOf(q) >= 0;
    });
    if (!v.length) { tbody.innerHTML = '<tr><td colspan="16" class="vpn-vazio">Nenhuma solicitação encontrada.</td></tr>'; return; }
    tbody.innerHTML = v.map(function (l) {
      return '<tr' + (l.visto_em ? '' : ' class="vpn-nova"') + '><td>' + esc(seq(l)) + '</td><td>' + esc(dataHoraBr(l.criado_em)) + '</td><td>' + (l.visto_em ? '' : '<button type="button" class="vpn-selo-novo" data-visto="' + esc(l.id) + '" title="Marcar como visto">Novo</button> ') + '<button type="button" class="vpn-nome-link" data-ver="' + esc(l.id) + '" title="Ver todas as informações">' + esc(l.nome) + '</button>' + termoDlHtml(l) + '</td>' +
        '<td>' + esc(cpfBr(l.cpf)) + '</td><td>' + esc(l.rg) + '</td><td>' + esc(dataBr(l.data_nascimento)) + '</td>' +
        '<td>' + esc(l.email_funcional) + '</td><td>' + zapLink(l) + '</td><td>' + atendenteHtml(l) + '</td><td>' + esc(ROTULO_VINCULO[l.vinculo] || '') + '</td><td>' + esc(l.matricula) + '</td><td>' + esc(setorComSigla(l.setor)) + '</td>' +
        '<td>' + celulaDoc(l.documento_path ? '<button type="button" class="vpn-doc-link" data-doc-abrir="' + esc(l.id) + '" title="' + esc(l.documento_nome || 'Abrir documento de identificação') + '">Abrir</button>' : '') + '</td>' +
        '<td>' + celulaDoc(l.chamado_path ? '<button type="button" class="vpn-doc-link" data-chamado-abrir="' + esc(l.id) + '" title="' + esc((l.chamado_nome || 'Chamado') + ' · ' + dataHoraBr(l.chamado_em)) + '">Abrir</button>' : '') + '</td>' +
        '<td>' + celulaDoc(l.termos_n ? '<button type="button" class="vpn-doc-link vpn-doc-ok" ' + (l.termos_n === 1 && l.termos_path ? 'data-termo-abrir="' + esc(l.id) + '"' : 'data-ver="' + esc(l.id) + '"') + ' title="Enviado em ' + esc(dataHoraBr(l.termos_em)) + '">Abrir' + (l.termos_n > 1 ? ' (' + l.termos_n + ')' : '') + '</button>' : '') + '</td>' +
        '<td class="vpn-acoes"><button type="button" class="vpn-acao" data-ver="' + esc(l.id) + '" title="Visualizar" aria-label="Visualizar">' + ICONE.ver + '</button>' +
        '<button type="button" class="vpn-acao" data-edit="' + esc(l.id) + '" title="Editar" aria-label="Editar">' + ICONE.editar + '</button>' +
        '<button type="button" class="vpn-acao vpn-excluir" data-del="' + esc(l.id) + '" title="Excluir" aria-label="Excluir">' + ICONE.excluir + '</button></td></tr>';
    }).join('');
  }

  // silencioso = atualização automática: não troca a tabela por mensagem de erro e só redesenha se algo mudou
  var carregando = false;
  async function carregar(silencioso) {
    if (carregando) return;
    carregando = true;
    try {
      var r = await fetch(base() + '/rest/v1/vpn_solicitacoes?select=*&order=criado_em.desc&limit=1000', { headers: cab() });
      if (r.status === 404) throw new Error('O módulo VPN ainda não foi instalado no banco. Rode database/vpn.sql no SQL Editor do Supabase.');
      if (r.status === 401 || r.status === 403) throw new Error('Esta conta não tem acesso às solicitações de VPN.');
      if (!r.ok) throw new Error('Não foi possível carregar (' + r.status + ').');
      var nova = await r.json();
      // termos assinados enviados pelas pessoas (vpn_anexos): quantidade e data do último, para o selo na linha
      try {
        var ra = await fetch(base() + '/rest/v1/vpn_anexos?select=solicitacao_id,arquivo_path,criado_em&order=criado_em.asc&limit=5000', { headers: cab() });
        if (ra.ok) {
          var mapa = {};
          (await ra.json()).forEach(function (a) { var m = mapa[a.solicitacao_id] || (mapa[a.solicitacao_id] = { n: 0, em: null }); m.n++; m.em = a.criado_em; m.path = a.arquivo_path; });
          nova.forEach(function (l) { if (mapa[l.id]) { l.termos_n = mapa[l.id].n; l.termos_em = mapa[l.id].em; l.termos_path = mapa[l.id].path; } });
        }
      } catch (x) { /* sem selo nesta leitura */ }
      try {
        var rd = await fetch(base() + '/rest/v1/vpn_termo_downloads?select=solicitacao_id,baixado_por,baixado_em&order=baixado_em.asc&limit=10000', { headers: cab() });
        if (rd.ok) {
          var md = {};
          (await rd.json()).forEach(function (x) { var m = md[x.solicitacao_id] || (md[x.solicitacao_id] = { n: 0 }); m.n++; m.por = x.baixado_por; m.em = x.baixado_em; });
          nova.forEach(function (l) { if (md[l.id]) { l.termo_dl_n = md[l.id].n; l.termo_dl_por = md[l.id].por; l.termo_dl_em = md[l.id].em; } });
        }
      } catch (x) { /* sem o histórico de downloads nesta leitura */ }
      ultima = new Date();
      if (silencioso && JSON.stringify(nova) === JSON.stringify(lista)) return;
      lista = nova;
      desenhar();
    } catch (e) {
      if (silencioso) return;
      tbody.innerHTML = '<tr><td colspan="16" class="vpn-vazio">' + esc(e.message || 'Erro ao carregar.') + '</td></tr>';
    } finally { carregando = false; restante = INTERVALO; mostrarAtualizacao(); }
  }

  // atualização automática a cada 10 s (contagem regressiva na barra, com a hora da última leitura);
  // pausa com a aba escondida, pop-up aberto ou situação sendo mudada
  var INTERVALO = 10, restante = INTERVALO, ultima = null;
  var rotuloAtualiza = document.getElementById('vpnAtualiza');
  function pausado() {
    if (document.hidden || dlg.open || dlgVer.open) return true;
    var a = document.activeElement;
    if (a && a.matches && a.matches('select[data-st]')) return true;
    return Boolean(tbody.querySelector('select[data-st]:disabled'));
  }
  function mostrarAtualizacao() {
    if (!ultima) { rotuloAtualiza.textContent = carregado ? 'Carregando…' : 'Aguardando login…'; return; }
    var hora = ultima.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
    var prox = carregando ? 'Atualizando…' : pausado() ? 'Atualização automática em pausa' : 'Atualiza em <b>' + restante + 's</b>';
    rotuloAtualiza.innerHTML = prox + '<br>Última atualização: <b>' + esc(hora) + '</b>';
  }
  setInterval(function () {
    if (!carregado) return;
    if (!pausado() && !carregando && --restante <= 0) carregar(true);
    mostrarAtualizacao();
  }, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && carregado) carregar(true); });

  // abre um arquivo do bucket privado numa nova aba, com link assinado de 5 minutos
  async function abrirArquivo(caminho, botao, bucket, baixarComo) {
    var texto = botao.textContent; botao.disabled = true; botao.textContent = 'Abrindo…';
    var janela = baixarComo ? null : window.open('', '_blank');   // abre já no clique, para o navegador não bloquear; com nome de download, baixa direto na própria página
    try {
      var r = await fetch(base() + '/storage/v1/object/sign/' + (bucket || 'vpn-documentos') + '/' + caminho.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 300 })
      });
      var c = await r.json();
      if (!r.ok || !c.signedURL) throw new Error('Não foi possível abrir o documento.');
      var url = base() + '/storage/v1' + c.signedURL + (baixarComo ? '&download=' + encodeURIComponent(baixarComo) : '');
      if (janela) janela.location.href = url;
      else if (baixarComo) { var ancora = document.createElement('a'); ancora.href = url; ancora.download = baixarComo; document.body.appendChild(ancora); ancora.click(); ancora.remove(); }
      else location.href = url;
    } catch (e) {
      if (janela) janela.close();
      alert(e.message || 'Não foi possível abrir o documento.');
    } finally { botao.disabled = false; botao.textContent = texto; }
  }
  // ---- downloads do termo: quem baixou e quando (vpn_termo_downloads)
  function termoDlHtml(l) {
    if (!l.termo_dl_n) return '';
    return '<span class="vpn-termo-dl" title="Último download do termo para assinatura' + (l.termo_dl_n > 1 ? ' (' + l.termo_dl_n + ' downloads)' : '') + '">Termo baixado por ' + esc(l.termo_dl_por) + ' · ' + esc(dataCurtaHoraBr(l.termo_dl_em)) + (l.termo_dl_n > 1 ? ' (' + l.termo_dl_n + 'x)' : '') + '</span>';
  }
  function registrarDownloads(ids, forma) {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    var quem = nomeProprio(String((s && s.user && s.user.email) || '').split('@')[0].replace(/\./g, ' '));
    return fetch(base() + '/rest/v1/rpc/vpn_registrar_download_termo', {
      method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_ids: ids, p_forma: forma })
    }).then(function (r) {
      if (!r.ok) throw new Error();
      var agora = new Date().toISOString();
      ids.forEach(function (id) {
        var l = lista.filter(function (x) { return x.id === id; })[0];
        if (l) { l.termo_dl_n = (l.termo_dl_n || 0) + 1; l.termo_dl_por = quem; l.termo_dl_em = agora; }
      });
      desenhar();
      if (verId && ids.indexOf(verId) >= 0) mostrarDownloadsDoTermo(verId);
    }).catch(function () { /* o arquivo já foi baixado; sem registro (banco ainda sem vpn_termo_downloads) */ });
  }
  async function mostrarDownloadsDoTermo(id) {
    var alvo = document.getElementById('vpnVerTermoDl');
    if (!alvo) return;
    try {
      var r = await fetch(base() + '/rest/v1/vpn_termo_downloads?select=baixado_por,baixado_em,forma&solicitacao_id=eq.' + encodeURIComponent(id) + '&order=baixado_em.desc&limit=10', { headers: cab() });
      if (!r.ok) throw new Error();
      var d = await r.json();
      if (verId !== id) return;
      alvo.innerHTML = d.length ? d.map(function (x) {
        return '<div class="vpn-termo-dl-item">Baixado por <b>' + esc(x.baixado_por || '—') + '</b> em ' + esc(dataHoraBr(x.baixado_em)) + (x.forma === 'lote' ? ' (download em lote)' : '') + '</div>';
      }).join('') : '<div class="vpn-termo-dl-item">Ainda não foi baixado.</div>';
    } catch (e) { alvo.innerHTML = ''; }
  }

  // termo para quem ainda não tem PDF: montado na hora, com a data de hoje (a do download)
  async function gerarTermo(id, botao) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    var texto = botao.textContent; botao.disabled = true; botao.textContent = 'Gerando…';
    try { await window.vpnTermo.baixar(l); registrarDownloads([l.id], 'individual'); }
    catch (e) { alert(e.message || 'Não foi possível gerar o termo.'); }
    finally { botao.disabled = false; botao.textContent = texto; }
  }
  function nomeDownload(tipo, l, caminho) {
    var ext = (String(caminho || '').match(/\.([A-Za-z0-9]{2,5})$/) || [])[1];
    return tipo + ' - ' + String(l.nome || '').replace(/[\\/:*?"<>|]/g, '') + (ext ? '.' + ext.toLowerCase() : '');
  }
  function abrirDocumento(id, botao) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    marcarVisto(id);
    return abrirArquivo(l.documento_path, botao, null, nomeDownload('Documento de identificação', l, l.documento_path));
  }
  // ---- documento de abertura de chamado: qualquer um da equipe VPN anexa, troca ou remove (PDF até 2 MB)
  var CHAMADO_MAX = 2 * 1024 * 1024;
  function chamadoHtml(l) {
    var tem = Boolean(l.chamado_path);
    return (tem
      ? '<span class="vpn-anexo-item"><button type="button" class="vpn-acao vpn-anexo" data-chamado="' + esc(l.id) + '">' + esc(l.chamado_nome || 'Abrir chamado') + ' · ' + esc(dataHoraBr(l.chamado_em)) + (l.chamado_por ? ' · ' + esc(l.chamado_por) : '') + '</button>' +
        '<button type="button" class="vpn-acao vpn-excluir vpn-anexo-del" data-chamado-del="' + esc(l.id) + '" title="Remover o documento do chamado" aria-label="Remover o documento do chamado">' + ICONE.excluir + '</button></span> '
      : 'Nenhum arquivo. ') +
      '<button type="button" class="vpn-acao" data-chamado-enviar="' + esc(l.id) + '">' + (tem ? 'Trocar PDF' : 'Enviar PDF') + '</button>' +
      '<input type="file" accept="application/pdf,.pdf" hidden data-chamado-arq="' + esc(l.id) + '">';
  }
  function redesenharChamado(l) {
    var alvo = document.getElementById('vpnVerChamado');
    if (alvo && verId === l.id) alvo.innerHTML = chamadoHtml(l);
  }
  async function erroApi(r, padrao) {
    var c = null; try { c = await r.json(); } catch (x) { /* sem corpo */ }
    if (r.status === 404 || (c && c.code === 'PGRST202')) return 'O envio de chamado ainda não foi ativado no banco. Rode database/vpn.sql.';
    return (c && c.message && r.status === 400) ? c.message : padrao + ' (' + r.status + ').';
  }
  async function enviarChamado(id, arquivo, input) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l || !arquivo) return;
    var botao = input.parentNode.querySelector('[data-chamado-enviar]'), texto = botao.textContent;
    try {
      var cabeca = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
      var ehPdf = String.fromCharCode.apply(null, cabeca) === '%PDF-';
      if (!ehPdf) throw new Error('Envie um arquivo PDF.');
      if (arquivo.size > CHAMADO_MAX) throw new Error('O PDF passa de 2 MB (' + (arquivo.size / 1048576).toFixed(1).replace('.', ',') + ' MB). Reduza o arquivo e tente de novo.');
      if (!arquivo.size) throw new Error('O arquivo está vazio.');
      botao.disabled = true; botao.textContent = 'Enviando…';
      var caminho = id + '/' + Date.now() + '-chamado.pdf';
      var up = await fetch(base() + '/storage/v1/object/vpn-chamados/' + caminho.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', headers: cab({ 'Content-Type': 'application/pdf', 'x-upsert': 'false' }), body: arquivo
      });
      if (!up.ok) throw new Error(up.status === 404 || up.status === 400 ? 'O envio de chamado ainda não foi ativado no banco. Rode database/vpn.sql.' : 'Não foi possível enviar o arquivo (' + up.status + ').');
      var r = await fetch(base() + '/rest/v1/rpc/vpn_registrar_chamado', {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id, p_path: caminho, p_nome: arquivo.name })
      });
      if (!r.ok) {
        await fetch(base() + '/storage/v1/object/vpn-chamados/' + caminho.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
        throw new Error(await erroApi(r, 'Não foi possível registrar o chamado'));
      }
      var antigo = await r.json();
      if (antigo) await fetch(base() + '/storage/v1/object/vpn-chamados/' + String(antigo).split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
      l.chamado_path = caminho; l.chamado_nome = arquivo.name; l.chamado_em = new Date().toISOString();
      l.chamado_por = nomeProprio(String(((auth.sessaoAtual() || {}).user || {}).email || '').split('@')[0].replace(/\./g, ' '));
      redesenharChamado(l);
    } catch (e) {
      alert(e.message || 'Não foi possível enviar o chamado.');
      botao.disabled = false; botao.textContent = texto; input.value = '';
    }
  }
  async function removerChamado(id, botao) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l || !l.chamado_path) return;
    if (!confirm('Remover o documento do chamado de ' + l.nome + '?\n\nO arquivo será apagado e não dá para desfazer.')) return;
    botao.disabled = true;
    try {
      var r = await fetch(base() + '/rest/v1/rpc/vpn_remover_chamado', { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id }) });
      if (!r.ok) throw new Error(await erroApi(r, 'Não foi possível remover'));
      var caminho = await r.json();
      if (caminho) await fetch(base() + '/storage/v1/object/vpn-chamados/' + String(caminho).split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
      l.chamado_path = l.chamado_nome = l.chamado_em = l.chamado_por = null;
      redesenharChamado(l);
    } catch (e) { alert(e.message || 'Não foi possível remover.'); botao.disabled = false; }
  }

  // arquivos que a pessoa enviou depois do cadastro (vpn_anexos)
  async function buscarAnexos(id) {
    var q = '&solicitacao_id=eq.' + encodeURIComponent(id) + '&order=criado_em.asc';
    var r = await fetch(base() + '/rest/v1/vpn_anexos?select=id,arquivo_path,arquivo_nome,criado_em,origem,enviado_por' + q, { headers: cab() });
    if (!r.ok) r = await fetch(base() + '/rest/v1/vpn_anexos?select=id,arquivo_path,arquivo_nome,criado_em' + q, { headers: cab() });   // banco ainda sem as colunas novas
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  // ---- termo assinado recebido por fora do sistema: o operador anexa (a pessoa deixa de poder enviar pelo link público)
  var TERMO_MAX = 3 * 1024 * 1024;
  function tipoPeloConteudo(b) {
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    return '';
  }
  function listaAnexosHtml(anexos) {
    return anexos.length ? anexos.map(function (a) {
      return '<span class="vpn-anexo-item"><button type="button" class="vpn-acao vpn-anexo" data-anexo="' + esc(a.arquivo_path) + '">' + esc(a.arquivo_nome || 'arquivo') + ' · ' + esc(dataHoraBr(a.criado_em)) + (a.origem === 'equipe' ? ' · anexado pela equipe' + (a.enviado_por ? ' (' + esc(a.enviado_por) + ')' : '') : '') + '</button>' +
        (ehRoot() ? '<button type="button" class="vpn-acao vpn-excluir vpn-anexo-del" data-anexo-del="' + esc(a.id) + '" title="Apagar este arquivo (só o responsável)" aria-label="Apagar este arquivo">' + ICONE.excluir + '</button>' : '') + '</span>';
    }).join(' ') : 'Nenhum termo enviado.';
  }
  async function recarregarAnexos(id) {
    var anexos = await buscarAnexos(id);
    var alvo = document.getElementById('vpnVerAnexos');
    if (alvo && verId === id) alvo.innerHTML = listaAnexosHtml(anexos);
    return anexos;
  }
  async function anexarTermoEquipe(id, arquivo, input) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l || !arquivo) return;
    var botao = input.parentNode.querySelector('[data-termo-equipe-enviar]'), texto = botao.textContent;
    try {
      var tipo = tipoPeloConteudo(new Uint8Array(await arquivo.slice(0, 8).arrayBuffer()));
      if (!tipo) throw new Error('Use um arquivo PDF, JPG ou PNG.');
      if (!arquivo.size) throw new Error('O arquivo está vazio.');
      if (arquivo.size > TERMO_MAX) throw new Error('O arquivo passa de 3 MB.');
      if (!confirm('Anexar o termo de ' + l.nome + '?\n\nConfirme que ele está assinado pelo servidor e pela secretaria.\nDepois disso, a pessoa não poderá mais enviar o termo pelo link público.')) { input.value = ''; return; }
      botao.disabled = true; botao.textContent = 'Enviando…';
      var caminho = id + '/termo-equipe-' + Date.now() + '.' + tipo;
      var up = await fetch(base() + '/storage/v1/object/vpn-documentos/' + caminho.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', headers: cab({ 'Content-Type': { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' }[tipo], 'x-upsert': 'false' }), body: arquivo
      });
      if (!up.ok) throw new Error(up.status === 403 || up.status === 400 ? 'O envio pela equipe ainda não foi ativado no banco. Rode database/vpn.sql.' : 'Não foi possível enviar o arquivo (' + up.status + ').');
      var r = await fetch(base() + '/rest/v1/rpc/vpn_anexar_termo_equipe', {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id, p_path: caminho, p_nome: arquivo.name })
      });
      if (!r.ok) {
        await fetch(base() + '/storage/v1/object/vpn-documentos/' + caminho.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
        var c = null; try { c = await r.json(); } catch (x) { /* sem corpo */ }
        throw new Error(r.status === 404 || (c && c.code === 'PGRST202') ? 'O envio pela equipe ainda não foi ativado no banco. Rode database/vpn.sql.' : (c && c.message && r.status === 400) ? c.message : 'Não foi possível registrar o termo (' + r.status + ').');
      }
      var anexos = await recarregarAnexos(id);
      l.termos_n = anexos.length; l.termos_em = new Date().toISOString(); l.termos_path = caminho;
      desenhar();
    } catch (e) {
      alert(e.message || 'Não foi possível anexar o termo.');
    } finally { botao.disabled = false; botao.textContent = texto; input.value = ''; }
  }

  async function mudarStatus(id, status, sel) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    var antes = l.status; sel.disabled = true;
    try {
      var r = await fetch(base() + '/rest/v1/rpc/vpn_atualizar_status', {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id, p_status: status })
      });
      if (!r.ok) throw new Error('Não foi possível salvar a situação.');
      l.status = status;
    } catch (e) { sel.value = antes; alert(e.message); }
    sel.disabled = false;
  }

  // ---- edição: abre uma janela com todos os dados e as observações da equipe
  var dlg = document.getElementById('vpnEditar'), fe = document.getElementById('vpnEditarForm');
  var erroEd = document.getElementById('vpnEditarErro'), salvarEd = document.getElementById('vpnEditarSalvar');
  var editando = null;
  function maskCpf(v) {
    var d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  function maskZap(v) {
    var d = v.replace(/\D/g, '').slice(0, 11);
    return d.length > 7 ? d.replace(/(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : d.length > 2 ? d.replace(/(\d{2})(\d+)/, '($1) $2') : d;
  }
  fe.elements.cpf.addEventListener('input', function (e) { e.target.value = maskCpf(e.target.value); });
  fe.elements.whatsapp.addEventListener('input', function (e) { e.target.value = maskZap(e.target.value); });
  // cargo/função: visível, mas só libera quando o vínculo é efetivo
  function cargoLiberado() {
    var ef = fe.elements.vinculo.value === 'efetivo';
    fe.elements.cargo.disabled = !ef;
    if (!ef) fe.elements.cargo.value = '';
  }
  fe.elements.vinculo.addEventListener('change', cargoLiberado);
  function abrirEdicao(id) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    editando = l; erroEd.hidden = true;
    marcarVisto(id);
    var f = fe.elements;
    f.nome.value = l.nome || ''; f.cpf.value = maskCpf(l.cpf || ''); f.rg.value = l.rg || '';
    f.data_nascimento.value = String(l.data_nascimento || '').slice(0, 10);
    f.whatsapp.value = maskZap(l.whatsapp || ''); f.email_funcional.value = l.email_funcional || '';
    f.vinculo.value = l.vinculo || 'efetivo'; f.matricula.value = l.matricula || ''; f.cargo.value = l.cargo || ''; cargoLiberado();
    f.setor.value = l.setor || ''; f.observacoes.value = l.observacoes || '';
    dlg.showModal();
  }
  document.getElementById('vpnEditarCancelar').addEventListener('click', function () { dlg.close(); });
  fe.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!editando) return;
    var f = fe.elements, id = editando.id;
    var dados = {
      nome: nomeProprio(f.nome.value), cpf: f.cpf.value, rg: f.rg.value.trim(), data_nascimento: f.data_nascimento.value,
      email_funcional: f.email_funcional.value.trim().toLowerCase(), whatsapp: f.whatsapp.value, vinculo: f.vinculo.value,
      matricula: f.matricula.value.trim(), cargo: f.cargo.value.trim().replace(/\s+/g, ' '), setor: f.setor.value.trim().replace(/\s+/g, ' '), observacoes: f.observacoes.value
    };
    salvarEd.disabled = true; salvarEd.textContent = 'Salvando…'; erroEd.hidden = true;
    try {
      var r = await fetch(base() + '/rest/v1/rpc/vpn_editar', {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id, p: dados })
      });
      var corpo = null; try { corpo = await r.json(); } catch (x) { /* sem corpo */ }
      if (!r.ok) {
        if (r.status === 404 || (corpo && corpo.code === 'PGRST202')) throw new Error('A edição ainda não foi ativada no banco. Rode database/vpn.sql.');
        throw new Error((corpo && corpo.message && r.status === 400) ? corpo.message : 'Não foi possível salvar (' + r.status + ').');
      }
      var d = dados.cpf.replace(/\D/g, '');
      Object.assign(editando, dados, { cpf: d, whatsapp: dados.whatsapp.replace(/\D/g, ''), observacoes: dados.observacoes.trim() || null });
      dlg.close(); desenhar();
    } catch (err) {
      erroEd.textContent = err.message || 'Não foi possível salvar.'; erroEd.hidden = false;
    } finally { salvarEd.disabled = false; salvarEd.textContent = 'Salvar'; }
  });

  // ---- visualizar: todas as informações da solicitação num pop-up
  var dlgVer = document.getElementById('vpnVer'), verId = null;
  function abrirVisualizacao(id) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    verId = id;
    marcarVisto(id);
    var itens = [
      ['Nº', seq(l)], ['Recebida em', dataHoraBr(l.criado_em)], ['Nome completo', l.nome, 1], ['CPF', cpfBr(l.cpf)], ['RG', l.rg],
      ['Data de nascimento', dataBr(l.data_nascimento)], ['Vínculo', ROTULO_VINCULO[l.vinculo]], ['Matrícula', l.matricula], ['Cargo/Função', l.cargo || (l.vinculo === 'comissionado' ? 'CAS' : l.vinculo === 'terceirizado' ? 'Terceirizado' : '')],
      ['E-mail funcional', l.email_funcional, 1], ['WhatsApp', '<span id="vpnVerZap">' + zapLink(l) + '</span>', 0, true], ['Atendente', '<span id="vpnVerAtendente">' + atendenteHtmlDialogo(l) + '</span>', 0, true], ['Setor', l.setor, 1],
      ['Situação', ROTULO[l.status]], ['Última atualização', l.atualizado_em ? dataHoraBr(l.atualizado_em) + (l.atualizado_por ? ' por ' + l.atualizado_por : '') : ''],
      ['Observações', l.observacoes, 1],
      ['Documentos', '<div class="vpn-docs">' +
        '<div class="vpn-doc"><span class="vpn-doc-nome">Documento de identificação</span><span class="vpn-doc-arqs">' +
        (l.documento_path ? '<button type="button" class="vpn-acao vpn-anexo" data-anexo="' + esc(l.documento_path) + '">' + esc(l.documento_nome || 'Abrir documento') + '</button>' : 'Não enviado.') + '</span></div>' +
        '<div class="vpn-doc"><span class="vpn-doc-nome">Termo para assinatura</span><span class="vpn-doc-arqs">' +
        '<button type="button" class="vpn-acao vpn-anexo" data-termo-gerar="' + esc(l.id) + '">Baixar termo (PDF)</button><span id="vpnVerTermoDl" class="vpn-termo-dl-lista"></span></span></div>' +
        '<div class="vpn-doc"><span class="vpn-doc-nome">Abertura de chamado (PDF, até 2 MB)</span><span class="vpn-doc-arqs" id="vpnVerChamado">' + chamadoHtml(l) + '</span></div>' +
        '<div class="vpn-doc"><span class="vpn-doc-nome">Termo preenchido e assinado</span><span class="vpn-doc-arqs"><span id="vpnVerAnexos">Carregando…</span> <button type="button" class="vpn-acao" data-termo-equipe-enviar="' + esc(l.id) + '" title="Termo assinado recebido por fora do sistema (PDF, JPG ou PNG, até 3 MB)">Anexar termo assinado</button><input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" hidden data-termo-equipe-arq="' + esc(l.id) + '"></span></div>' +
        '</div>', 1, true]
    ];
    document.getElementById('vpnVerDados').innerHTML = itens.map(function (i) {
      var v = i[3] ? i[1] : esc(i[1]);
      return '<div' + (i[2] ? ' class="vpn-largo"' : '') + '><dt>' + i[0] + '</dt><dd>' + (v || '—') + '</dd></div>';
    }).join('');
    dlgVer.showModal();
    mostrarDownloadsDoTermo(id);
    recarregarAnexos(id).catch(function () {
      var alvo = document.getElementById('vpnVerAnexos'); if (alvo) alvo.textContent = 'Não foi possível carregar os arquivos.';
    });
  }
  document.getElementById('vpnVerDados').addEventListener('click', function (e) {
    var te = e.target.closest('[data-termo-equipe-enviar]');
    if (te) { var it = te.parentNode.querySelector('[data-termo-equipe-arq]'); it.value = ''; it.click(); return; }
    var ce = e.target.closest('[data-chamado-enviar]');
    if (ce) { var inp = ce.parentNode.querySelector('[data-chamado-arq]'); inp.value = ''; inp.click(); return; }
    var cd = e.target.closest('[data-chamado-del]');
    if (cd) { removerChamado(cd.getAttribute('data-chamado-del'), cd); return; }
    var ca = e.target.closest('[data-chamado]');
    if (ca) { var lc = lista.filter(function (x) { return x.id === ca.getAttribute('data-chamado'); })[0]; if (lc && lc.chamado_path) abrirArquivo(lc.chamado_path, ca, 'vpn-chamados'); return; }
    var g = e.target.closest('[data-termo-gerar]');
    if (g) { gerarTermo(g.getAttribute('data-termo-gerar'), g); return; }
    var t = e.target.closest('[data-termo]');
    if (t) { abrirArquivo(t.getAttribute('data-termo'), t, 'vpn-termos', t.getAttribute('data-nome')); return; }
    var d = e.target.closest('[data-anexo-del]');
    if (d) { apagarAnexo(d.getAttribute('data-anexo-del'), d); return; }
    var b = e.target.closest('[data-anexo]');
    if (b) abrirArquivo(b.getAttribute('data-anexo'), b);
  });
  document.getElementById('vpnVerDados').addEventListener('change', function (e) {
    var i = e.target.closest('[data-chamado-arq]');
    if (i && i.files && i.files[0]) enviarChamado(i.getAttribute('data-chamado-arq'), i.files[0], i);
    var it = e.target.closest('[data-termo-equipe-arq]');
    if (it && it.files && it.files[0]) anexarTermoEquipe(it.getAttribute('data-termo-equipe-arq'), it.files[0], it);
  });
  // só o root apaga um arquivo enviado na segunda fase: primeiro o registro (o banco confere quem é), depois o arquivo
  async function apagarAnexo(idAnexo, botao) {
    var item = botao.closest('.vpn-anexo-item');
    var nome = item ? item.querySelector('.vpn-anexo').textContent : 'este arquivo';
    if (!confirm('Apagar o arquivo enviado?\n\n' + nome + '\n\nEle será removido de vez e não dá para desfazer.')) return;
    botao.disabled = true;
    try {
      var r = await fetch(base() + '/rest/v1/rpc/vpn_excluir_anexo', { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: idAnexo }) });
      if (!r.ok) {
        var c = null; try { c = await r.json(); } catch (x) { /* sem corpo */ }
        throw new Error(r.status === 404 || (c && c.code === 'PGRST202') ? 'A exclusão de arquivos ainda não foi ativada no banco. Rode database/vpn.sql.' : (c && c.message) || 'Não foi possível apagar (' + r.status + ').');
      }
      var caminho = await r.json();
      if (caminho) await fetch(base() + '/storage/v1/object/vpn-documentos/' + String(caminho).split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
      if (item) item.remove();
      var alvo = document.getElementById('vpnVerAnexos');
      if (alvo && !alvo.querySelector('.vpn-anexo-item')) alvo.textContent = 'Nenhum termo enviado.';
    } catch (err) {
      alert(err.message || 'Não foi possível apagar o arquivo.');
      botao.disabled = false;
    }
  }
  document.getElementById('vpnVerFechar').addEventListener('click', function () { dlgVer.close(); });
  document.getElementById('vpnVerEditar').addEventListener('click', function () { dlgVer.close(); abrirEdicao(verId); });

  // ---- exportar: PDF com todos os cadastros (jsPDF + autoTable, baixados só no clique)
  var LIBS_PDF = {
    jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
    autotable: ['https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js']
  };
  function carregarLib(urls, pronto) {
    if (pronto()) return Promise.resolve();
    return urls.reduce(function (p, url) {
      return p.catch(function () {
        return new Promise(function (ok, falha) {
          var s = document.createElement('script');
          s.src = url; s.onload = function () { pronto() ? ok() : falha(new Error('lib')); }; s.onerror = function () { falha(new Error('rede')); };
          document.head.appendChild(s);
        });
      });
    }, Promise.reject(new Error('início')));
  }
  async function exportarPdf(botao) {
    if (!lista.length) { alert('Não há cadastros para exportar.'); return; }
    var rotulo = botao.innerHTML; botao.disabled = true; botao.textContent = 'Gerando PDF…';
    try {
      await carregarLib(LIBS_PDF.jspdf, function () { return window.jspdf && window.jspdf.jsPDF; });
      await carregarLib(LIBS_PDF.autotable, function () { return window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable; });
      var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      var LARG = doc.internal.pageSize.getWidth(), ALT = doc.internal.pageSize.getHeight(), MG = 12;
      var AZUL = [21, 62, 117], AZUL2 = [37, 99, 235], LINHA = [224, 224, 224], TEXTO = [33, 33, 33];   // cores do sistema (css/base.css)
      var agora = new Date();
      var total = lista.length;
      function cabecalho() {
        doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]); doc.rect(0, 0, LARG, 24, 'F');
        doc.setFillColor(AZUL2[0], AZUL2[1], AZUL2[2]); doc.rect(0, 24, LARG, 1.2, 'F');
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('SISTEMA', MG, 9.5);
        doc.setFontSize(15); doc.text('Solicitações de acesso à VPN', MG, 17.5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text('Gerado em ' + agora.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), LARG - MG, 9.5, { align: 'right' });
        doc.text(total + ' cadastro' + (total === 1 ? '' : 's'), LARG - MG, 17.5, { align: 'right' });
      }
      var ordenada = lista.slice().sort(ordemCadastro);
      doc.autoTable({
        startY: 31,
        head: [['Nº', 'Data e horário', 'Nome', 'Matrícula', 'Vínculo', 'Setor']],
        body: ordenada.map(function (l) {
          return [seq(l), dataHoraBr(l.criado_em), l.nome || '', l.matricula || '—', ROTULO_VINCULO[l.vinculo] || '—', setorComSigla(l.setor)];
        }),
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 }, overflow: 'linebreak', textColor: TEXTO, lineColor: LINHA, lineWidth: 0.2 },
        headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
        alternateRowStyles: { fillColor: [243, 246, 251] },
        columnStyles: { 0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: AZUL }, 1: { cellWidth: 27 }, 3: { cellWidth: 22 }, 4: { cellWidth: 25 } },
        margin: { top: 31, left: MG, right: MG, bottom: 16 },
        didDrawPage: function (dados) {
          cabecalho();
          doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]); doc.setLineWidth(0.2); doc.line(MG, ALT - 11, LARG - MG, ALT - 11);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
          doc.text('Sistema · VPN', MG, ALT - 6.5);
          doc.text('Página ' + dados.pageNumber, LARG - MG, ALT - 6.5, { align: 'right' });
        }
      });
      var p2 = function (n) { return String(n).padStart(2, '0'); };
      doc.save('solicitacoes-vpn-' + agora.getFullYear() + p2(agora.getMonth() + 1) + p2(agora.getDate()) + '.pdf');
    } catch (e) {
      alert('Não foi possível gerar o PDF. Confira a conexão com a internet e tente de novo.');
    } finally { botao.disabled = false; botao.innerHTML = rotulo; }
  }
  // gera de uma vez o termo de todos que ainda não têm PDF (ZIP, com a data de hoje)
  document.getElementById('vpnTermosTodos').addEventListener('click', async function () {
    var b = this, texto = b.textContent; b.disabled = true; b.textContent = 'Gerando…';
    try {
      var r = await window.vpnTermo.baixarTodos(lista);
      if (r.ids && r.ids.length) registrarDownloads(r.ids, 'lote');
      alert(r.gerados + ' termo(s) gerado(s).' + (r.pendentes.length ? '\n\nNão saíram por cadastro incompleto (' + r.pendentes.length + '):\n' + r.pendentes.join('\n') : ''));
    } catch (e) { alert(e.message || 'Não foi possível gerar os termos.'); }
    finally { b.disabled = false; b.textContent = texto; }
  });
  document.getElementById('vpnExportar').addEventListener('click', function () { exportarPdf(this); });

  // ---- excluir: pede confirmação, apaga o arquivo do documento e depois o registro
  async function excluir(id, botao) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    if (!confirm('Excluir a solicitação nº ' + seq(l) + ' de ' + l.nome + '?\n\nOs dados e o documento anexado serão apagados e não dá para desfazer.')) return;
    botao.disabled = true;
    try {
      try {
        var extras = await buscarAnexos(id);
        for (var ix = 0; ix < extras.length; ix++) {
          await fetch(base() + '/storage/v1/object/vpn-documentos/' + extras[ix].arquivo_path.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
        }
      } catch (x) { /* sem anexos legíveis: segue com o documento principal */ }
      if (l.chamado_path) await fetch(base() + '/storage/v1/object/vpn-chamados/' + l.chamado_path.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
      if (l.documento_path) {
        var d = await fetch(base() + '/storage/v1/object/vpn-documentos/' + l.documento_path.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: cab() });
        if (!d.ok && d.status !== 404) throw new Error('Não foi possível apagar o documento (' + d.status + ').');
      }
      var r = await fetch(base() + '/rest/v1/rpc/vpn_excluir', {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_id: id })
      });
      if (!r.ok) {
        var c = null; try { c = await r.json(); } catch (x) { /* sem corpo */ }
        if (r.status === 404 || (c && c.code === 'PGRST202')) throw new Error('A exclusão ainda não foi ativada no banco. Rode database/vpn.sql.');
        throw new Error('Não foi possível excluir (' + r.status + ').');
      }
      lista = lista.filter(function (x) { return x.id !== id; });
      desenhar();
    } catch (err) {
      alert(err.message || 'Não foi possível excluir.');
      botao.disabled = false;
    }
  }

  tbody.addEventListener('click', function (e) {
    var nv = e.target.closest('[data-visto]');
    if (nv) marcarVisto(nv.getAttribute('data-visto'));
    var x = e.target.closest('[data-del]');
    if (x) excluir(x.getAttribute('data-del'), x);
    var b = e.target.closest('[data-ver]');
    if (b) abrirVisualizacao(b.getAttribute('data-ver'));
    var ed = e.target.closest('[data-edit]');
    if (ed) abrirEdicao(ed.getAttribute('data-edit'));
    var d1 = e.target.closest('[data-doc-abrir]');
    if (d1) abrirDocumento(d1.getAttribute('data-doc-abrir'), d1);
    var d2 = e.target.closest('[data-chamado-abrir]');
    if (d2) { var lc = lista.filter(function (y) { return y.id === d2.getAttribute('data-chamado-abrir'); })[0]; if (lc && lc.chamado_path) abrirArquivo(lc.chamado_path, d2, 'vpn-chamados', nomeDownload('Chamado', lc, lc.chamado_path)); }
    var d3 = e.target.closest('[data-termo-abrir]');
    if (d3) { var lt = lista.filter(function (y) { return y.id === d3.getAttribute('data-termo-abrir'); })[0]; if (lt && lt.termos_path) { marcarVisto(lt.id); abrirArquivo(lt.termos_path, d3, null, nomeDownload('Termo assinado', lt, lt.termos_path)); } }
  });
  tbody.addEventListener('change', function (e) {
    var s = e.target.closest('[data-st]');
    if (s) mudarStatus(s.getAttribute('data-st'), s.value, s);
  });
  busca.addEventListener('input', desenhar);
  filtro.addEventListener('change', desenhar);

  // a sessão pode ainda estar sendo restaurada: tenta já e de novo quando o auth avisar
  var carregado = false;
  function tentar() {
    if (carregado || !auth || !auth.sessaoAtual || !auth.sessaoAtual()) return;
    carregado = true; carregar();
  }
  tentar();
  window.addEventListener('admin-auth-atualizado', tentar);
})();
