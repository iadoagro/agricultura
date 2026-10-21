/* Formulário público de solicitação de VPN (pages/vpn-formulario.html). Sem login: usa só a chave
   publicável. O documento vai para o bucket privado "vpn-documentos" (o público só envia, não lê) e
   depois a função enviar_vpn_solicitacao grava os dados (database/vpn.sql). */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var form = document.getElementById('vpnForm');
  var botao = document.getElementById('vpnEnviar');
  var aviso = document.getElementById('vpnAviso');
  var enviando = false;
  var TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  var MAX = 5 * 1024 * 1024;

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

  function ler() {
    var f = form.elements;
    return {
      nome: f.nome.value.trim().replace(/\s+/g, ' '), cpf: f.cpf.value, rg: f.rg.value.trim(),
      data_nascimento: f.data_nascimento.value, email_funcional: f.email_funcional.value.trim().toLowerCase(),
      vinculo: vinculoAtual(), matricula: f.matricula.value.trim(), setor: f.setor.value, arquivo: f.documento.files[0] || null
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
    form.querySelector('[data-campo="matricula"] label').textContent = terc ? 'Matrícula (se tiver)' : 'Matrícula';
    if (terc) erroCampo('matricula', '');
    if (vinculoAtual()) erroCampo('vinculo', '');
  }
  form.querySelectorAll('input[name="vinculo"]').forEach(function (r) { r.addEventListener('change', atualizarVinculo); });

  function validar(d) {
    var primeiro = null;
    function marcar(n, m) { erroCampo(n, m); if (!primeiro) primeiro = n; }
    ['nome', 'cpf', 'rg', 'data_nascimento', 'email_funcional', 'vinculo', 'matricula', 'setor', 'documento'].forEach(function (n) { erroCampo(n, ''); });
    if (d.nome.length < 5 || d.nome.indexOf(' ') < 0) marcar('nome', 'Informe o nome completo.');
    if (!cpfValido(d.cpf)) marcar('cpf', 'CPF inválido.');
    if (d.rg.length < 3) marcar('rg', 'Informe o RG.');
    var nasc = d.data_nascimento && new Date(d.data_nascimento + 'T00:00:00');
    var limite = new Date(); limite.setFullYear(limite.getFullYear() - 14);
    if (!nasc || isNaN(nasc) || nasc > limite || nasc.getFullYear() < 1900) marcar('data_nascimento', 'Informe uma data de nascimento válida.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email_funcional)) marcar('email_funcional', 'Informe um e-mail válido.');
    if (!d.vinculo) marcar('vinculo', 'Informe se é comissionado ou terceirizado.');
    if (!d.matricula && d.vinculo !== 'terceirizado') marcar('matricula', 'Informe a matrícula.');
    if (!d.setor) marcar('setor', 'Selecione o setor.');
    if (!d.arquivo) marcar('documento', 'Anexe o documento de identificação com foto.');
    else if (!TIPOS[d.arquivo.type]) marcar('documento', 'Use uma imagem (JPG, PNG, WEBP) ou PDF.');
    else if (d.arquivo.size > MAX) marcar('documento', 'O arquivo passa de 5 MB.');
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

  async function subirDocumento(arquivo) {
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
        vinculo: d.vinculo, matricula: d.matricula, setor: d.setor, documento: caminho, documento_nome: d.arquivo.name
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
      var caminho = await subirDocumento(d.arquivo);
      var res = await gravar(d, caminho);
      document.getElementById('vpnNumero').textContent = '#' + (res && res.numero);
      form.hidden = true;
      document.getElementById('vpnOk').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      mostrar((err && err.message) || 'Não foi possível enviar. Tente novamente.', 'erro');
    } finally {
      enviando = false; botao.disabled = false; botao.textContent = 'Enviar solicitação';
    }
  });

  document.getElementById('vpnOutra').addEventListener('click', function () {
    form.reset(); busca.value = ''; oculto.value = ''; atualizarVinculo(); form.hidden = false; document.getElementById('vpnOk').hidden = true;
  });
})();
