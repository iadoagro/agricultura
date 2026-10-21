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
      matricula: f.matricula.value.trim(), setor: f.setor.value.trim().replace(/\s+/g, ' '), arquivo: f.documento.files[0] || null
    };
  }

  function validar(d) {
    var primeiro = null;
    function marcar(n, m) { erroCampo(n, m); if (!primeiro) primeiro = n; }
    ['nome', 'cpf', 'rg', 'data_nascimento', 'email_funcional', 'matricula', 'setor', 'documento'].forEach(function (n) { erroCampo(n, ''); });
    if (d.nome.length < 5 || d.nome.indexOf(' ') < 0) marcar('nome', 'Informe o nome completo.');
    if (!cpfValido(d.cpf)) marcar('cpf', 'CPF inválido.');
    if (d.rg.length < 3) marcar('rg', 'Informe o RG.');
    var nasc = d.data_nascimento && new Date(d.data_nascimento + 'T00:00:00');
    var limite = new Date(); limite.setFullYear(limite.getFullYear() - 14);
    if (!nasc || isNaN(nasc) || nasc > limite || nasc.getFullYear() < 1900) marcar('data_nascimento', 'Informe uma data de nascimento válida.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email_funcional)) marcar('email_funcional', 'Informe um e-mail válido.');
    if (!d.matricula) marcar('matricula', 'Informe a matrícula.');
    if (d.setor.length < 2) marcar('setor', 'Informe o setor.');
    if (!d.arquivo) marcar('documento', 'Anexe o documento de identificação com foto.');
    else if (!TIPOS[d.arquivo.type]) marcar('documento', 'Use uma imagem (JPG, PNG, WEBP) ou PDF.');
    else if (d.arquivo.size > MAX) marcar('documento', 'O arquivo passa de 5 MB.');
    if (primeiro) {
      var c = form.querySelector('[data-campo="' + primeiro + '"]');
      c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var foco = c.querySelector('input'); if (foco) foco.focus({ preventScroll: true });
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
        matricula: d.matricula, setor: d.setor, documento: caminho, documento_nome: d.arquivo.name
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
    form.reset(); form.hidden = false; document.getElementById('vpnOk').hidden = true;
  });
})();
