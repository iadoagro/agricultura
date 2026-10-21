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
  function dataBr(d) { var p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function dataHoraBr(t) {
    var d = new Date(t); if (isNaN(d)) return '';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  // link público: sempre o do GitHub Pages, mesmo quando a página é aberta em localhost
  document.getElementById('vpnLink').value = 'https://iadoagro.github.io/agricultura/pages/vpn-formulario.html';
  // link local: só a conta responsável (root) vê, para testar o formulário no XAMPP
  var LINK_LOCAL = 'http://localhost/agricultura/pages/vpn-formulario.html';
  function linkLocal() {
    var s = auth && auth.sessaoAtual && auth.sessaoAtual();
    var root = Boolean(s && s.user && auth.RESPONSAVEL_EMAIL && String(s.user.email || '').toLowerCase() === auth.RESPONSAVEL_EMAIL);
    document.getElementById('vpnLinkLocalBox').hidden = !root;
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

  function desenhar() {
    var q = semAcento(busca.value), st = filtro.value;
    var v = lista.filter(function (l) {
      if (st && l.status !== st) return false;
      return !q || semAcento([l.nome, l.cpf, cpfBr(l.cpf), l.matricula, l.email_funcional, l.setor, l.rg, l.whatsapp, l.observacoes, ROTULO_VINCULO[l.vinculo]].join(' ')).indexOf(q) >= 0;
    });
    if (!v.length) { tbody.innerHTML = '<tr><td colspan="14" class="vpn-vazio">Nenhuma solicitação encontrada.</td></tr>'; return; }
    tbody.innerHTML = v.map(function (l) {
      return '<tr><td>' + esc(l.numero) + '</td><td>' + esc(dataHoraBr(l.criado_em)) + '</td><td>' + esc(l.nome) + '</td>' +
        '<td>' + esc(cpfBr(l.cpf)) + '</td><td>' + esc(l.rg) + '</td><td>' + esc(dataBr(l.data_nascimento)) + '</td>' +
        '<td>' + esc(l.email_funcional) + '</td><td>' + zapLink(l.whatsapp) + '</td><td>' + esc(ROTULO_VINCULO[l.vinculo] || '') + '</td><td>' + esc(l.matricula) + '</td><td>' + esc(l.setor) + '</td>' +
        '<td class="vpn-obs">' + esc(l.observacoes) + '</td>' +
        '<td><select data-st="' + esc(l.id) + '" aria-label="Situação">' +
        Object.keys(ROTULO).map(function (k) { return '<option value="' + k + '"' + (k === l.status ? ' selected' : '') + '>' + ROTULO[k] + '</option>'; }).join('') +
        '</select></td>' +
        '<td class="vpn-acoes"><button type="button" class="vpn-acao" data-ver="' + esc(l.id) + '" title="Ver todas as informações">Visualizar</button>' +
        '<button type="button" class="vpn-acao" data-edit="' + esc(l.id) + '" title="Editar os dados e as observações">Editar</button></td></tr>';
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
      tbody.innerHTML = '<tr><td colspan="14" class="vpn-vazio">' + esc(e.message || 'Erro ao carregar.') + '</td></tr>';
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
      nome: f.nome.value.trim().replace(/\s+/g, ' '), cpf: f.cpf.value, rg: f.rg.value.trim(), data_nascimento: f.data_nascimento.value,
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

  tbody.addEventListener('click', function (e) {
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
