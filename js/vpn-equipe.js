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
  function ehRoot() {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    return Boolean(s && s.user && auth.RESPONSAVEL_EMAIL && String(s.user.email || '').toLowerCase() === auth.RESPONSAVEL_EMAIL);
  }
  function linkLocal() {
    var root = ehRoot();
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
  function desenhar() {
    var q = semAcento(busca.value), st = filtro.value;
    var v = lista.filter(function (l) {
      if (st && l.status !== st) return false;
      return !q || semAcento([l.nome, l.cpf, cpfBr(l.cpf), l.matricula, l.email_funcional, l.setor, l.rg, l.whatsapp, l.observacoes, ROTULO_VINCULO[l.vinculo]].join(' ')).indexOf(q) >= 0;
    });
    if (!v.length) { tbody.innerHTML = '<tr><td colspan="13" class="vpn-vazio">Nenhuma solicitação encontrada.</td></tr>'; return; }
    tbody.innerHTML = v.map(function (l) {
      return '<tr' + (l.visto_em ? '' : ' class="vpn-nova"') + '><td>' + esc(seq(l)) + '</td><td>' + esc(dataHoraBr(l.criado_em)) + '</td><td>' + (l.visto_em ? '' : '<button type="button" class="vpn-selo-novo" data-visto="' + esc(l.id) + '" title="Marcar como visto">Novo</button> ') + '<button type="button" class="vpn-nome-link" data-ver="' + esc(l.id) + '" title="Ver todas as informações">' + esc(l.nome) + '</button></td>' +
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

  // abre um arquivo do bucket privado numa nova aba, com link assinado de 5 minutos
  async function abrirArquivo(caminho, botao, bucket, baixarComo) {
    var texto = botao.textContent; botao.disabled = true; botao.textContent = 'Abrindo…';
    var janela = window.open('', '_blank');   // abre já no clique, para o navegador não bloquear
    try {
      var r = await fetch(base() + '/storage/v1/object/sign/' + (bucket || 'vpn-documentos') + '/' + caminho.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 300 })
      });
      var c = await r.json();
      if (!r.ok || !c.signedURL) throw new Error('Não foi possível abrir o documento.');
      var url = base() + '/storage/v1' + c.signedURL + (baixarComo ? '&download=' + encodeURIComponent(baixarComo) : '');
      if (janela) janela.location.href = url; else location.href = url;
    } catch (e) {
      if (janela) janela.close();
      alert(e.message || 'Não foi possível abrir o documento.');
    } finally { botao.disabled = false; botao.textContent = texto; }
  }
  function abrirDocumento(id, botao) {
    var l = lista.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    marcarVisto(id);
    return abrirArquivo(l.documento_path, botao);
  }
  // arquivos que a pessoa enviou depois do cadastro (vpn_anexos)
  async function buscarAnexos(id) {
    var r = await fetch(base() + '/rest/v1/vpn_anexos?select=id,arquivo_path,arquivo_nome,criado_em&solicitacao_id=eq.' + encodeURIComponent(id) + '&order=criado_em.asc', { headers: cab() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
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
      ['Data de nascimento', dataBr(l.data_nascimento)], ['Vínculo', ROTULO_VINCULO[l.vinculo]], ['Matrícula', l.matricula], ['Cargo/Função', l.vinculo === 'efetivo' ? l.cargo : 'CAS'],
      ['E-mail funcional', l.email_funcional, 1], ['WhatsApp', zapLink(l.whatsapp), 0, true], ['Setor', l.setor, 1],
      ['Situação', ROTULO[l.status]], ['Última atualização', l.atualizado_em ? dataHoraBr(l.atualizado_em) + (l.atualizado_por ? ' por ' + l.atualizado_por : '') : ''],
      ['Observações', l.observacoes, 1],
      ['Documentos', '<div class="vpn-docs">' +
        '<div class="vpn-doc"><span class="vpn-doc-nome">Documento de identificação</span><span class="vpn-doc-arqs">' +
        (l.documento_path ? '<button type="button" class="vpn-acao vpn-anexo" data-anexo="' + esc(l.documento_path) + '">' + esc(l.documento_nome || 'Abrir documento') + '</button>' : 'Não enviado.') + '</span></div>' +
        (ehRoot() ? '<div class="vpn-doc"><span class="vpn-doc-nome">Termo para assinatura</span><span class="vpn-doc-arqs">' +
        (l.termo_path ? '<button type="button" class="vpn-acao vpn-anexo" data-termo="' + esc(l.termo_path) + '" data-nome="' + esc('Termo VPN - ' + l.nome + '.pdf') + '">Baixar termo (PDF)</button>' : 'Ainda não gerado.') + '</span></div>' : '') +
        '<div class="vpn-doc"><span class="vpn-doc-nome">Termo preenchido e assinado</span><span class="vpn-doc-arqs" id="vpnVerAnexos">Carregando…</span></div>' +
        '</div>', 1, true]
    ];
    document.getElementById('vpnVerDados').innerHTML = itens.map(function (i) {
      var v = i[3] ? i[1] : esc(i[1]);
      return '<div' + (i[2] ? ' class="vpn-largo"' : '') + '><dt>' + i[0] + '</dt><dd>' + (v || '—') + '</dd></div>';
    }).join('');
    dlgVer.showModal();
    buscarAnexos(id).then(function (anexos) {
      var alvo = document.getElementById('vpnVerAnexos');
      if (!alvo || verId !== id) return;
      alvo.innerHTML = anexos.length ? anexos.map(function (a) {
        return '<span class="vpn-anexo-item"><button type="button" class="vpn-acao vpn-anexo" data-anexo="' + esc(a.arquivo_path) + '">' + esc(a.arquivo_nome || 'arquivo') + ' · ' + esc(dataHoraBr(a.criado_em)) + '</button>' +
          (ehRoot() ? '<button type="button" class="vpn-acao vpn-excluir vpn-anexo-del" data-anexo-del="' + esc(a.id) + '" title="Apagar este arquivo (só o responsável)" aria-label="Apagar este arquivo">' + ICONE.excluir + '</button>' : '') + '</span>';
      }).join(' ') : 'Nenhum termo enviado.';
    }).catch(function () {
      var alvo = document.getElementById('vpnVerAnexos'); if (alvo) alvo.textContent = 'Não foi possível carregar os arquivos.';
    });
  }
  document.getElementById('vpnVerDados').addEventListener('click', function (e) {
    var t = e.target.closest('[data-termo]');
    if (t) { abrirArquivo(t.getAttribute('data-termo'), t, 'vpn-termos', t.getAttribute('data-nome')); return; }
    var d = e.target.closest('[data-anexo-del]');
    if (d) { apagarAnexo(d.getAttribute('data-anexo-del'), d); return; }
    var b = e.target.closest('[data-anexo]');
    if (b) abrirArquivo(b.getAttribute('data-anexo'), b);
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
