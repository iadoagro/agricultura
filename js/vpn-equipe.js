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
  function zapLink(n) {
    var d = String(n || '').replace(/\D/g, '');
    if (!d) return '';
    return '<a class="vpn-zap" href="https://wa.me/55' + esc(d) + '" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp">' + esc(zapBr(d)) + '</a>';
  }
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
  function linkLocal() {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    var root = Boolean(s && s.user && auth.RESPONSAVEL_EMAIL && String(s.user.email || '').toLowerCase() === auth.RESPONSAVEL_EMAIL);
    document.getElementById('vpnLinkLocalBox').hidden = !root;
    document.getElementById('vpnConfigBox').hidden = !root;
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

  var SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONE = {
    ver: SVG + '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    editar: SVG + '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    excluir: SVG + '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
  };
  function desenhar() {
    var q = semAcento(busca.value), st = filtro.value;
    var v = lista.filter(function (l) {
      if (st && l.status !== st) return false;
      return !q || semAcento([l.nome, l.cpf, cpfBr(l.cpf), l.matricula, l.email_funcional, l.setor, l.rg, l.whatsapp, l.observacoes, ROTULO_VINCULO[l.vinculo]].join(' ')).indexOf(q) >= 0;
    });
    if (!v.length) { tbody.innerHTML = '<tr><td colspan="13" class="vpn-vazio">Nenhuma solicitação encontrada.</td></tr>'; return; }
    tbody.innerHTML = v.map(function (l) {
      return '<tr><td>' + esc(l.numero) + '</td><td>' + esc(dataHoraBr(l.criado_em)) + '</td><td>' + esc(l.nome) + '</td>' +
        '<td>' + esc(cpfBr(l.cpf)) + '</td><td>' + esc(l.rg) + '</td><td>' + esc(dataBr(l.data_nascimento)) + '</td>' +
        '<td>' + esc(l.email_funcional) + '</td><td>' + zapLink(l.whatsapp) + '</td><td>' + esc(ROTULO_VINCULO[l.vinculo] || '') + '</td><td>' + esc(l.matricula) + '</td><td>' + esc(setorComSigla(l.setor)) + '</td>' +
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
      ultima = new Date();
      if (silencioso && JSON.stringify(nova) === JSON.stringify(lista)) return;
      lista = nova;
      desenhar();
    } catch (e) {
      if (silencioso) return;
      tbody.innerHTML = '<tr><td colspan="13" class="vpn-vazio">' + esc(e.message || 'Erro ao carregar.') + '</td></tr>';
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

  async function abrirDocumento(id, botao) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    var texto = botao.textContent; botao.disabled = true; botao.textContent = 'Abrindo…';
    var janela = window.open('', '_blank');   // abre já no clique, para o navegador não bloquear
    try {
      var r = await fetch(base() + '/storage/v1/object/sign/vpn-documentos/' + l.documento_path.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 300 })
      });
      var c = await r.json();
      if (!r.ok || !c.signedURL) throw new Error('Não foi possível abrir o documento.');
      var url = base() + '/storage/v1' + c.signedURL;
      if (janela) janela.location.href = url; else location.href = url;
    } catch (e) {
      if (janela) janela.close();
      alert(e.message || 'Não foi possível abrir o documento.');
    } finally { botao.disabled = false; botao.textContent = texto; }
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
  function abrirEdicao(id) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    editando = l; erroEd.hidden = true;
    var f = fe.elements;
    f.nome.value = l.nome || ''; f.cpf.value = maskCpf(l.cpf || ''); f.rg.value = l.rg || '';
    f.data_nascimento.value = String(l.data_nascimento || '').slice(0, 10);
    f.whatsapp.value = maskZap(l.whatsapp || ''); f.email_funcional.value = l.email_funcional || '';
    f.vinculo.value = l.vinculo || 'efetivo'; f.matricula.value = l.matricula || '';
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
      matricula: f.matricula.value.trim(), setor: f.setor.value.trim().replace(/\s+/g, ' '), observacoes: f.observacoes.value
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
    var itens = [
      ['Nº', l.numero], ['Recebida em', dataHoraBr(l.criado_em)], ['Nome completo', l.nome, 1], ['CPF', cpfBr(l.cpf)], ['RG', l.rg],
      ['Data de nascimento', dataBr(l.data_nascimento)], ['Vínculo', ROTULO_VINCULO[l.vinculo]], ['Matrícula', l.matricula],
      ['E-mail funcional', l.email_funcional, 1], ['WhatsApp', zapLink(l.whatsapp), 0, true], ['Setor', l.setor, 1],
      ['Situação', ROTULO[l.status]], ['Última atualização', l.atualizado_em ? dataHoraBr(l.atualizado_em) + (l.atualizado_por ? ' por ' + l.atualizado_por : '') : ''],
      ['Observações', l.observacoes, 1]
    ];
    document.getElementById('vpnVerDados').innerHTML = itens.map(function (i) {
      var v = i[3] ? i[1] : esc(i[1]);
      return '<div' + (i[2] ? ' class="vpn-largo"' : '') + '><dt>' + i[0] + '</dt><dd>' + (v || '—') + '</dd></div>';
    }).join('');
    dlgVer.showModal();
  }
  document.getElementById('vpnVerFechar').addEventListener('click', function () { dlgVer.close(); });
  document.getElementById('vpnVerEditar').addEventListener('click', function () { dlgVer.close(); abrirEdicao(verId); });
  document.getElementById('vpnVerDoc').addEventListener('click', function () { abrirDocumento(verId, this); });

  // ---- excluir: pede confirmação, apaga o arquivo do documento e depois o registro
  async function excluir(id, botao) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    if (!confirm('Excluir a solicitação nº ' + l.numero + ' de ' + l.nome + '?\n\nOs dados e o documento anexado serão apagados e não dá para desfazer.')) return;
    botao.disabled = true;
    try {
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
    var x = e.target.closest('[data-del]');
    if (x) excluir(x.getAttribute('data-del'), x);
    var b = e.target.closest('[data-ver]');
    if (b) abrirVisualizacao(b.getAttribute('data-ver'));
    var ed = e.target.closest('[data-edit]');
    if (ed) abrirEdicao(ed.getAttribute('data-edit'));
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
