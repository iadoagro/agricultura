/* Formulário público de solicitação de VPN (pages/vpn-formulario.html). Sem login: usa só a chave
   publicável. O documento vai para a pasta do Drive (ou, sem driveUrl, para o bucket "vpn-documentos") e
   depois a função enviar_vpn_solicitacao grava os dados (database/vpn.sql). */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var form = document.getElementById('vpnForm');
  var botao = document.getElementById('vpnEnviar');
  var aviso = document.getElementById('vpnAviso');
  var enviando = false;
  var TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
  var MAX = 3 * 1024 * 1024;

  function base() { return String(cfg.url || '').replace(/\/$/, ''); }
  function cabecalhos(extra) {
    var h = { apikey: cfg.chavePublica, Authorization: 'Bearer ' + cfg.chavePublica };
    Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function mostrar(msg, tipo) { aviso.textContent = msg || ''; aviso.hidden = !msg; aviso.className = 'vpn-aviso' + (tipo ? ' ' + tipo : ''); }
  function erroCampo(nome, msg) {
    var c = form.querySelector('[data-campo="' + nome + '"]');
    if (!c) return;
    c.classList.toggle('com-erro', Boolean(msg));
    c.querySelector('.vpn-erro').textContent = msg || '';
  }

  function cpfValido(c) {
    c = String(c).replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    function dv(n) {
      var s = 0, i;
      for (i = 0; i < n; i++) s += +c[i] * (n + 1 - i);
      var r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    }
    return dv(9) === +c[9] && dv(10) === +c[10];
  }

  form.elements.cpf.addEventListener('input', function (e) {
    var d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  });

  form.elements.whatsapp.addEventListener('input', function (e) {
    var d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.length > 7 ? d.replace(/(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : d.length > 2 ? d.replace(/(\d{2})(\d+)/, '($1) $2') : d;
  });

  // Nome com iniciais maiúsculas (nunca tudo maiúsculo); de/da/do/das/dos/e ficam minúsculas
  function nomeProprio(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ').map(function (p, i) {
      if (i > 0 && /^(de|da|do|das|dos|e)$/.test(p)) return p;
      return p.replace(/(^|['\u2019-])(\S)/g, function (m, a, c) { return a + c.toUpperCase(); });
    }).join(' ');
  }
  form.elements.nome.addEventListener('blur', function (e) { e.target.value = nomeProprio(e.target.value); });

  // visual do envio de arquivo: caixa de escolher/arrastar e, depois, o nome e o tamanho com botão para remover
  function tamanhoLegivel(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function atualizarUpload(input) {
    var caixa = input.closest('.vpn-upload'), arq = input.files && input.files[0];
    caixa.classList.toggle('com-arquivo', Boolean(arq));
    var det = caixa.querySelector('.vpn-upload-arq'); det.hidden = !arq;
    if (arq) { caixa.querySelector('.vpn-upload-nome').textContent = arq.name; caixa.querySelector('.vpn-upload-tam').textContent = tamanhoLegivel(arq.size); }
  }
  document.querySelectorAll('.vpn-upload').forEach(function (caixa) {
    var input = caixa.querySelector('input[type="file"]');
    input.addEventListener('change', function () { atualizarUpload(input); });
    caixa.querySelector('.vpn-upload-remover').addEventListener('click', function () { input.value = ''; atualizarUpload(input); input.dispatchEvent(new Event('change', { bubbles: true })); });
    ['dragenter', 'dragover'].forEach(function (ev) { caixa.addEventListener(ev, function (e) { if (input.disabled) return; e.preventDefault(); caixa.classList.add('arrastando'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { caixa.addEventListener(ev, function () { caixa.classList.remove('arrastando'); }); });
    caixa.addEventListener('drop', function (e) {
      if (input.disabled) return;
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        try { input.files = e.dataTransfer.files; } catch (x) { return; }
        atualizarUpload(input); input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  function ler() {
    var f = form.elements;
    return {
      nome: nomeProprio(f.nome.value), cpf: f.cpf.value, rg: f.rg.value.trim(),
      data_nascimento: f.data_nascimento.value, email_funcional: f.email_funcional.value.trim().toLowerCase(),
      whatsapp: f.whatsapp.value, vinculo: vinculoAtual(), matricula: f.matricula.value.trim(), cargo: f.cargo.value.trim().replace(/\s+/g, ' '), setor: f.setor.value, arquivo: f.documento.files[0] || null
    };
  }

  // Setores = as caixas do organograma (mesma leitura da página Contatos), agrupadas por diretoria.
  // Campo de setor com pesquisa: digita para filtrar (sem acento), clica ou usa ↑ ↓ Enter para escolher.
  var busca = document.getElementById('setorBusca'), oculto = document.getElementById('setor'), listaEl = document.getElementById('setorLista');
  var opcoes = [], visiveis = [], ativo = -1;

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function preencherSetores(dados) {
    opcoes = [];
    dados.grupos.forEach(function (g) {
      dados.nos.filter(function (n) { return n.grupo === g.nome; }).forEach(function (n) {
        var rot = n.sigla && n.sigla !== n.title.toUpperCase() && n.sigla.length < 12 ? n.title + ' (' + n.sigla + ')' : n.title;
        opcoes.push({ grupo: g.nome, valor: n.title, rotulo: rot, chave: norm(rot + ' ' + g.nome) });
      });
    });
    busca.placeholder = 'Digite para pesquisar o setor…';
    if (oculto.value && !opcoes.some(function (o) { return o.valor === oculto.value; })) { oculto.value = ''; busca.value = ''; }
  }
  function abrirLista() {
    var q = norm(busca.value.trim()), grupo = null, html = '';
    visiveis = opcoes.filter(function (o) { return !q || o.chave.indexOf(q) >= 0; });
    visiveis.forEach(function (o, i) {
      if (o.grupo !== grupo) { grupo = o.grupo; html += '<li class="vpn-combo-grupo" role="presentation">' + o.grupo.replace(/[&<>]/g, '') + '</li>'; }
      html += '<li role="option" data-i="' + i + '"' + (o.valor === oculto.value ? ' aria-selected="true"' : '') + '>' + o.rotulo.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</li>';
    });
    listaEl.innerHTML = html || '<li class="vpn-combo-vazio" role="presentation">' + (opcoes.length ? 'Nenhum setor encontrado.' : 'Carregando setores…') + '</li>';
    listaEl.hidden = false; busca.setAttribute('aria-expanded', 'true');
    ativo = visiveis.length && q ? 0 : -1; marcarAtivo(false);
  }
  function fecharLista() { listaEl.hidden = true; busca.setAttribute('aria-expanded', 'false'); }
  function marcarAtivo(rolar) {
    Array.prototype.forEach.call(listaEl.querySelectorAll('[data-i]'), function (li) {
      var on = +li.getAttribute('data-i') === ativo;
      li.classList.toggle('ativo', on);
      if (on && rolar) li.scrollIntoView({ block: 'nearest' });
    });
  }
  function escolher(i) {
    var o = visiveis[i]; if (!o) return;
    oculto.value = o.valor; busca.value = o.rotulo; erroCampo('setor', ''); fecharLista();
  }
  busca.addEventListener('focus', abrirLista);
  busca.addEventListener('input', function () { oculto.value = ''; abrirLista(); });
  busca.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (listaEl.hidden) abrirLista();
      ativo = Math.max(0, Math.min(visiveis.length - 1, ativo + (e.key === 'ArrowDown' ? 1 : -1))); marcarAtivo(true);
    } else if (e.key === 'Enter') {
      if (!listaEl.hidden && ativo >= 0) { e.preventDefault(); escolher(ativo); }
    } else if (e.key === 'Escape') fecharLista();
  });
  listaEl.addEventListener('mousedown', function (e) {
    var li = e.target.closest('[data-i]');
    e.preventDefault();   // mantém o foco no campo
    if (li) escolher(+li.getAttribute('data-i'));
  });
  busca.addEventListener('blur', function () {
    fecharLista();
    if (!oculto.value) busca.value = '';   // texto solto, sem escolher um setor da lista, não vale
  });

  if (window.OrgContatos) {
    var emCache = window.OrgContatos.doCache();
    if (emCache) preencherSetores(emCache);
    window.OrgContatos.carregar().then(function (r) { preencherSetores(r.dados); }, function () {
      if (!emCache) busca.placeholder = 'Não foi possível carregar os setores. Recarregue a página.';
    });
  }

  function vinculoAtual() {
    var m = form.querySelector('input[name="vinculo"]:checked');
    return m ? m.value : '';
  }
  function atualizarVinculo() {
    var terc = vinculoAtual() === 'terceirizado';
    var mat = form.elements.matricula;
    mat.disabled = terc;   // terceirizado não tem matrícula: o campo fica bloqueado e vazio
    if (terc) { mat.value = ''; erroCampo('matricula', ''); }
    mat.placeholder = terc ? 'Não se aplica a terceirizado' : '';
    // cargo: o campo fica à vista, mas só libera para efetivo
    var cg = form.elements.cargo, efetivo = vinculoAtual() === 'efetivo';
    cg.disabled = !efetivo;
    if (!efetivo) { cg.value = ''; erroCampo('cargo', ''); }
    cg.placeholder = efetivo ? 'Informe o seu cargo' : 'Disponível só para efetivo';
    if (vinculoAtual()) erroCampo('vinculo', '');
  }
  form.querySelectorAll('input[name="vinculo"]').forEach(function (r) { r.addEventListener('change', atualizarVinculo); });

  function validar(d) {
    var primeiro = null;
    function marcar(n, m) { erroCampo(n, m); if (!primeiro) primeiro = n; }
    ['nome', 'cpf', 'rg', 'data_nascimento', 'email_funcional', 'whatsapp', 'vinculo', 'matricula', 'cargo', 'setor', 'documento'].forEach(function (n) { erroCampo(n, ''); });
    if (d.nome.length < 5 || d.nome.indexOf(' ') < 0) marcar('nome', 'Informe o nome completo.');
    if (!cpfValido(d.cpf)) marcar('cpf', 'CPF inválido.');
    if (d.rg.length < 3) marcar('rg', 'Informe o RG.');
    var nasc = d.data_nascimento && new Date(d.data_nascimento + 'T00:00:00');
    var limite = new Date(); limite.setFullYear(limite.getFullYear() - 14);
    if (!nasc || isNaN(nasc) || nasc > limite || nasc.getFullYear() < 1900) marcar('data_nascimento', 'Informe uma data de nascimento válida.');
    if (!/^[^@\s]+@ac\.gov\.br$/.test(d.email_funcional)) marcar('email_funcional', 'Use o e-mail funcional, que termina com @ac.gov.br.');
    var zap = d.whatsapp.replace(/\D/g, '');
    if (zap.length < 10 || zap.length > 11 || (zap.length === 11 && zap[2] !== '9')) marcar('whatsapp', 'Informe o WhatsApp com DDD.');
    if (!d.vinculo) marcar('vinculo', 'Informe se é efetivo, comissionado ou terceirizado.');
    if (!d.matricula && d.vinculo !== 'terceirizado') marcar('matricula', 'Informe a matrícula.');
    if (d.vinculo === 'efetivo' && d.cargo.length < 2) marcar('cargo', 'Informe o cargo.');
    if (!d.setor) marcar('setor', 'Selecione o setor.');
    if (!d.arquivo) marcar('documento', 'Anexe o documento de identificação com foto.');
    else if (!TIPOS[d.arquivo.type]) marcar('documento', 'Use um arquivo JPG, PNG ou PDF.');
    else if (d.arquivo.size > MAX) marcar('documento', 'O arquivo passa de 3 MB.');
    if (primeiro) {
      var c = form.querySelector('[data-campo="' + primeiro + '"]');
      c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var foco = c.querySelector('input, select'); if (foco) foco.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  // Já existe cadastro com este CPF e/ou nome? (consulta antes de enviar o documento)
  async function consultarDuplicado(d) {
    try {
      var r = await fetch(base() + '/rest/v1/rpc/vpn_verificar_duplicado', {
        method: 'POST', headers: cabecalhos({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ p_cpf: d.cpf, p_nome: d.nome })
      });
      if (!r.ok) return null;   // função ainda não instalada: o banco confere de novo ao gravar
      return await r.json();
    } catch (e) { return null; }
  }
  var dlgDup = document.getElementById('vpnDuplicado'), btnDupCpf = document.getElementById('vpnDupCpf'), btnDupNome = document.getElementById('vpnDupNome');
  function avisarDuplicado(dup) {
    var cpf = Boolean(dup.cpf), nome = Boolean(dup.nome);
    document.getElementById('vpnDuplicadoTexto').textContent = cpf && nome ? 'Já existe um cadastro com este CPF e com este nome.'
      : cpf ? 'Já existe um cadastro com este CPF.' : 'Já existe um cadastro com este nome.';
    btnDupCpf.hidden = !cpf; btnDupNome.hidden = !nome;
    if (cpf) erroCampo('cpf', 'CPF já cadastrado.');
    if (nome) erroCampo('nome', 'Nome já cadastrado.');
    dlgDup.showModal();
  }
  function editarCampo(nome) {
    dlgDup.close();
    var c = form.querySelector('[data-campo="' + nome + '"]');
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var i = c.querySelector('input'); i.focus({ preventScroll: true }); i.select();
  }
  btnDupCpf.addEventListener('click', function () { editarCampo('cpf'); });
  btnDupNome.addEventListener('click', function () { editarCampo('nome'); });
  document.getElementById('vpnDupFechar').addEventListener('click', function () { dlgDup.close(); });
  function duplicadoDoErro(msg) {
    var m = String(msg || '');
    if (!/Já existe/i.test(m)) return null;
    return { cpf: /CPF/.test(m), nome: /nome/.test(m) };
  }

  async function subirDocumento(arquivo, pasta) {
    if (window.AgroDrive && AgroDrive.ativo()) return AgroDrive.enviar(arquivo, arquivo.name, pasta || 'VPN/Documentos', { senha: senhaGuardada() });   // pasta privada do Drive (js/drive-arquivos.js)
    var caminho = uuid() + '/documento.' + TIPOS[arquivo.type];
    var r = await fetch(base() + '/storage/v1/object/vpn-documentos/' + caminho, {
      method: 'POST', headers: cabecalhos({ 'Content-Type': arquivo.type, 'x-upsert': 'false' }), body: arquivo
    });
    if (!r.ok) throw new Error('Não foi possível enviar o documento (' + r.status + '). Confira o arquivo e tente de novo.');
    return caminho;
  }

  async function gravar(d, caminho) {
    var r = await fetch(base() + '/rest/v1/rpc/enviar_vpn_solicitacao', {
      method: 'POST', headers: cabecalhos({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p: {
        nome: d.nome, cpf: d.cpf, rg: d.rg, data_nascimento: d.data_nascimento, email_funcional: d.email_funcional,
        whatsapp: d.whatsapp, vinculo: d.vinculo, matricula: d.matricula, cargo: d.cargo, setor: d.setor, senha: senhaGuardada(), documento: caminho, documento_nome: d.arquivo.name
      } })
    });
    var corpo = null;
    try { corpo = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) {
      if (r.status === 404 || (corpo && corpo.code === 'PGRST202')) throw new Error('O formulário ainda não foi ativado no banco. Avise a equipe de TI.');
      var m = corpo && corpo.message;
      throw new Error(m && r.status === 400 ? m : 'Não foi possível registrar a solicitação (' + r.status + '). Tente novamente.');
    }
    return corpo;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (enviando || document.getElementById('site').value) return;
    mostrar('');
    var d = ler();
    if (!validar(d)) return;
    enviando = true; botao.disabled = true; botao.textContent = 'Enviando…';
    try {
      var dup = await consultarDuplicado(d);
      if (dup && (dup.cpf || dup.nome)) { avisarDuplicado(dup); return; }
      var caminho = await subirDocumento(d.arquivo);
      var res = await gravar(d, caminho);
      document.getElementById('vpnNumero').textContent = '#' + (res && res.numero);
      mostrarTela('ok');
      document.getElementById('vpnPopupNumero').textContent = '#' + (res && res.numero);
      var popup = document.getElementById('vpnPopup');
      if (popup.showModal) popup.showModal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (/Senha incorreta/i.test(err && err.message)) { pedirSenha(); return; }
      if (/desativado/i.test(err && err.message)) { paginaEmBranco(); return; }
      var dd = duplicadoDoErro(err && err.message);
      if (dd) avisarDuplicado(dd);
      else mostrar((err && err.message) || 'Não foi possível enviar. Tente novamente.', 'erro');
    } finally {
      enviando = false; botao.disabled = false; botao.textContent = 'Enviar solicitação';
    }
  });


  // ---- link desativado (página em branco) e senha de acesso: configurados na página VPN pelo responsável
  var caixaSenha = document.getElementById('vpnSenhaBox'), formSenha = document.getElementById('vpnSenhaForm');
  function senhaGuardada() { try { return sessionStorage.getItem('vpn_senha') || ''; } catch (e) { return ''; } }
  function guardarSenha(v) { try { sessionStorage.setItem('vpn_senha', v); } catch (e) { /* sem armazenamento */ } }
  function rpcPublica(nome, corpo) {
    return fetch(base() + '/rest/v1/rpc/' + nome, { method: 'POST', headers: cabecalhos({ 'Content-Type': 'application/json' }), body: JSON.stringify(corpo || {}) })
      .then(function (r) {
        if (r.ok) return r.json();
        return r.json().catch(function () { return null; }).then(function (c) { throw new Error((c && c.message) || 'HTTP ' + r.status); });
      });
  }
  function paginaEmBranco() {
    document.title = ' ';
    document.documentElement.style.background = '#fff';
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#fff;margin:0';
    document.body.classList.remove('vpn-carregando');
  }
  // telas: senha, escolha (cadastrar ou já cadastrado), identificação, envio de arquivo e o formulário de cadastro
  var TELAS = { senha: caixaSenha, escolha: document.getElementById('vpnEscolha'), ident: document.getElementById('vpnIdent'), anexo: document.getElementById('vpnAnexo'), form: form, ok: document.getElementById('vpnOk') };
  var SUBTITULO = { senha: 'Informe a senha para continuar.', escolha: 'Escolha uma opção para continuar.', ident: 'Identifique-se para enviar o termo assinado.', anexo: 'Envie o termo assinado para a equipe responsável.', form: 'Preencha todos os campos e anexe um documento de identificação com foto.', ok: '' };
  function mostrarTela(nome) {
    Object.keys(TELAS).forEach(function (k) { TELAS[k].hidden = k !== nome; });
    if (SUBTITULO[nome]) document.getElementById('vpnSub').textContent = SUBTITULO[nome];
    window.scrollTo({ top: 0 });
  }
  function mostrarFormulario() { mostrarTela('form'); }
  function mostrarEscolha() { mostrarTela('escolha'); }
  function pedirSenha() { mostrarTela('senha'); setTimeout(function () { document.getElementById('vpnSenha').focus(); }, 50); }
  async function iniciar() {
    Object.keys(TELAS).forEach(function (k) { TELAS[k].hidden = true; });
    try {
      var c = await rpcPublica('vpn_config_publica');
      if (c && c.ativo === false) { paginaEmBranco(); return; }
      if (c && c.senha) {
        var guardada = senhaGuardada();
        var ok = guardada && await rpcPublica('vpn_verificar_senha', { p_senha: guardada }).catch(function () { return false; });
        if (ok === true) mostrarEscolha(); else pedirSenha();
      } else mostrarEscolha();
    } catch (e) {
      mostrarEscolha();   // configuração ainda não instalada no banco: abre normalmente
    }
    document.body.classList.remove('vpn-carregando');
  }
  formSenha.addEventListener('submit', async function (e) {
    e.preventDefault();
    var campo = document.getElementById('vpnSenha'), erro = document.getElementById('vpnSenhaErro'), b = document.getElementById('vpnSenhaEntrar');
    var v = campo.value.trim();
    erro.hidden = true;
    if (!v) { erro.textContent = 'Informe a senha.'; erro.hidden = false; return; }
    b.disabled = true;
    try {
      var ok = await rpcPublica('vpn_verificar_senha', { p_senha: v });
      if (ok === true) { guardarSenha(v); campo.value = ''; mostrarEscolha(); }
      else { erro.textContent = 'Senha incorreta.'; erro.hidden = false; campo.select(); }
    } catch (x) { erro.textContent = 'Não foi possível conferir a senha. Tente de novo.'; erro.hidden = false; }
    b.disabled = false;
  });
  // ---- quem já se cadastrou: identifica (CPF + nascimento) e envia outro arquivo
  var identCpf = document.getElementById('identCpf'), identNasc = document.getElementById('identNasc');
  var identErro = document.getElementById('vpnIdentErro'), identCad = document.getElementById('vpnIdentCadastrar');
  var anexoErro = document.getElementById('vpnAnexoErro'), pessoa = null;
  var anexoForm = document.getElementById('vpnAnexoForm'), anexoAviso = document.getElementById('vpnAnexoAviso'), anexoCampo = document.getElementById('vpnAnexoCampo'), anexoBtn = document.getElementById('vpnAnexoEnviar');
  function respostaAssinatura(nome) { var m = anexoForm.querySelector('input[name="' + nome + '"]:checked'); return m ? m.value : ''; }
  // o envio só abre quando as duas respostas são "Sim": assinado pelo servidor e pela secretaria
  function atualizarAssinaturas() {
    var a = respostaAssinatura('assServidor'), b = respostaAssinatura('assSecretaria'), liberado = a === 'sim' && b === 'sim';
    anexoCampo.classList.toggle('bloqueado', !liberado);
    document.getElementById('anexoArquivo').disabled = !liberado; anexoBtn.disabled = !liberado;
    if (!liberado) { document.getElementById('anexoArquivo').value = ''; atualizarUpload(document.getElementById('anexoArquivo')); }
    anexoAviso.hidden = !(a === 'nao' || b === 'nao');
    anexoErro.hidden = true;
  }
  anexoForm.querySelectorAll('input[type="radio"]').forEach(function (r) { r.addEventListener('change', atualizarAssinaturas); });
  function paraIdent(cpf) {
    identErro.hidden = true; identCad.hidden = true;
    if (cpf) identCpf.value = cpf;
    mostrarTela('ident');
    setTimeout(function () { (identCpf.value ? identNasc : identCpf).focus(); }, 50);
  }
  identCpf.addEventListener('input', function (e) {
    var d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  });
  document.getElementById('vpnEscCadastrar').addEventListener('click', mostrarFormulario);
  document.getElementById('vpnEscEnviar').addEventListener('click', function () { paraIdent(''); });
  document.getElementById('vpnIdentVoltar').addEventListener('click', mostrarEscolha);
  identCad.addEventListener('click', mostrarFormulario);
  document.getElementById('vpnAnexoVoltar').addEventListener('click', mostrarEscolha);
  document.getElementById('vpnDupEnviar').addEventListener('click', function () { dlgDup.close(); paraIdent(form.elements.cpf.value); });
  document.getElementById('vpnIdentForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var b = document.getElementById('vpnIdentContinuar');
    identErro.hidden = true; identCad.hidden = true;
    if (!cpfValido(identCpf.value) || !identNasc.value) { identErro.textContent = 'Informe um CPF válido e a data de nascimento.'; identErro.hidden = false; return; }
    b.disabled = true;
    try {
      var r = await rpcPublica('vpn_identificar', { p: { cpf: identCpf.value, data_nascimento: identNasc.value, senha: senhaGuardada() } });
      if (r && r.encontrado && r.bloqueado) {
        identErro.textContent = 'Olá, ' + r.nome + '! O seu termo assinado já foi recebido pela equipe da VPN. Não é preciso enviar de novo.'; identErro.hidden = false;
      } else if (r && r.encontrado) {
        pessoa = { cpf: identCpf.value, data_nascimento: identNasc.value };
        document.getElementById('vpnAnexoTitulo').textContent = 'Olá, ' + r.nome + '!';
        document.getElementById('anexoArquivo').value = ''; anexoForm.reset(); atualizarAssinaturas(); atualizarUpload(document.getElementById('anexoArquivo'));
        mostrarTela('anexo');
      } else {
        identErro.textContent = 'Não encontramos um cadastro com estes dados. Confira o CPF e a data de nascimento ou faça o cadastro.'; identErro.hidden = false; identCad.hidden = false;
      }
    } catch (x) { identErro.textContent = 'Não foi possível conferir agora. Tente de novo.'; identErro.hidden = false; }
    b.disabled = false;
  });
  document.getElementById('vpnAnexoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var arq = document.getElementById('anexoArquivo').files[0], b = document.getElementById('vpnAnexoEnviar');
    anexoErro.hidden = true;
    if (respostaAssinatura('assServidor') !== 'sim' || respostaAssinatura('assSecretaria') !== 'sim') { atualizarAssinaturas(); return; }
    var msg = !arq ? 'Anexe o termo assinado.' : !TIPOS[arq.type] ? 'Use um arquivo JPG, PNG ou PDF.' : arq.size > MAX ? 'O arquivo passa de 3 MB.' : '';
    if (msg) { anexoErro.textContent = msg; anexoErro.hidden = false; return; }
    if (!pessoa) { mostrarEscolha(); return; }
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      var caminho = await subirDocumento(arq, 'VPN/Termos assinados');
      await rpcPublica('vpn_enviar_anexo', { p: { cpf: pessoa.cpf, data_nascimento: pessoa.data_nascimento, senha: senhaGuardada(), arquivo: caminho, arquivo_nome: arq.name, assinado_servidor: 'true', assinado_secretaria: 'true' } });
      document.getElementById('anexoArquivo').value = ''; atualizarUpload(document.getElementById('anexoArquivo'));
      var pp = document.getElementById('vpnAnexoPopup'); if (pp.showModal) pp.showModal();
      mostrarEscolha();
    } catch (x) {
      anexoErro.textContent = /Senha incorreta/.test(x.message) ? 'A senha mudou. Recarregue a página.' : /já foi recebido pela equipe/.test(x.message) ? 'O seu termo assinado já foi recebido pela equipe da VPN. Não é preciso enviar de novo.' : 'Não foi possível enviar o termo. Tente de novo.'; anexoErro.hidden = false;
    }
    b.textContent = 'Enviar termo'; atualizarAssinaturas();
  });
  document.getElementById('vpnAnexoPopupOk').addEventListener('click', function () { document.getElementById('vpnAnexoPopup').close(); });

  setTimeout(function () { document.body.classList.remove('vpn-carregando'); }, 5000);   // rede lenta: não deixa a tela escondida
  iniciar();

  document.getElementById('vpnPopupOk').addEventListener('click', function () { document.getElementById('vpnPopup').close(); });
  document.getElementById('vpnOutra').addEventListener('click', function () {
    form.reset(); busca.value = ''; oculto.value = ''; atualizarVinculo(); atualizarUpload(document.getElementById('documento')); mostrarTela('form');
  });
})();
