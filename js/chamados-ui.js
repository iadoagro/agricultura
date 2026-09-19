/* Utilitários de interface do módulo Chamados, compartilhados pelas três telas.
   Tudo que vem do usuário entra no DOM por textContent (nunca innerHTML), então
   um chamado com "<script>" no texto aparece como texto na tela da equipe. */
(function () {
  'use strict';
  var M = function () { return window.CHAMADOS.meta; };

  var CAMINHOS = {
    hardware: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    software: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
    rede: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
    acesso: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    impressora: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    telefonia: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    outro: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    buscar: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    atualizar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    quadro: '<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    suporte: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M9.17 14.83l-4.24 4.24"/>',
    enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    usuario: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    cadeado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    estrela: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
  };

  function icone(nome, tam) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.75');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (tam) { s.setAttribute('width', tam); s.setAttribute('height', tam); }
    s.innerHTML = CAMINHOS[nome] || '';           // caminhos fixos deste arquivo, nunca dados do usuário
    return s;
  }

  /* el('div', {class:'x', onclick:fn}, 'texto' | Node | [filhos]) */
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(filhos) ? filhos : [filhos]).forEach(function (f) {
      if (f == null || f === false) return;
      n.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    });
    return n;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmtData(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function relativo(iso) {
    if (!iso) return '';
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'agora mesmo';
    if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h';
    if (s < 86400 * 30) return 'há ' + Math.floor(s / 86400) + (Math.floor(s / 86400) === 1 ? ' dia' : ' dias');
    return fmtData(iso).slice(0, 10);
  }
  function duracao(ms) {
    var m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    if (h < 48) return h + ' h' + (m % 60 && h < 10 ? ' ' + (m % 60) + ' min' : '');
    return Math.floor(h / 24) + ' dias';
  }

  /* Prazo (SLA): só conta enquanto o chamado está em aberto. */
  function prazo(c) {
    var st = M().status[c.status];
    if (!st || !st.ativo || !c.prazo_em) return null;
    var falta = new Date(c.prazo_em).getTime() - Date.now();
    var total = M().prioridades[c.prioridade].horas * 3600000;
    if (falta < 0) return { nivel: 'estourado', texto: 'Vencido há ' + duracao(falta) };
    if (falta < total * 0.25) return { nivel: 'perto', texto: 'Vence em ' + duracao(falta) };
    return { nivel: 'ok', texto: 'Vence em ' + duracao(falta) };
  }

  function pilula(tipo, chave) {
    var t = tipo === 'status' ? M().status[chave] : M().prioridades[chave];
    return el('span', { class: 'ch-pilula ch-' + tipo + ' cor-' + (t ? t.cor : 'cinza') }, [
      el('i', { class: 'ch-ponto' }), t ? t.rot : chave
    ]);
  }

  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto);
    return new Promise(function (ok, erro) {
      var t = el('textarea', { style: 'position:fixed;opacity:0' });
      t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : erro(); } catch (e) { erro(e); }
      t.remove();
    });
  }

  /* Aviso curto no rodapé (reaproveita o visual de toast do sistema). */
  var avisoTimer = 0;
  function aviso(texto, tipo) {
    var n = document.getElementById('ch-aviso');
    if (!n) { n = el('div', { id: 'ch-aviso', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(n); }
    n.className = 'ch-aviso' + (tipo === 'erro' ? ' erro' : '');
    n.textContent = texto;
    void n.offsetWidth;
    n.classList.add('show');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { n.classList.remove('show'); }, tipo === 'erro' ? 6000 : 2800);
  }

  /* Texto de um evento da linha do tempo. */
  function textoEvento(e) {
    var meta = M();
    var st = function (k) { return meta.status[k] ? meta.status[k].rot : k; };
    var pr = function (k) { return meta.prioridades[k] ? meta.prioridades[k].rot : k; };
    switch (e.tipo) {
      case 'abertura': return 'Chamado aberto';
      case 'status': return 'Status: ' + st(e.de_valor) + ' → ' + st(e.para_valor);
      case 'prioridade': return 'Prioridade: ' + pr(e.de_valor) + ' → ' + pr(e.para_valor);
      case 'atribuicao': return e.para_valor ? 'Atribuído a ' + e.para_valor : 'Responsável removido';
      case 'avaliacao': return 'Avaliação: ' + e.para_valor + ' de 5';
      default: return null;
    }
  }

  window.CHUI = { el: el, icone: icone, fmtData: fmtData, relativo: relativo, duracao: duracao, prazo: prazo, pilula: pilula, copiar: copiar, aviso: aviso, textoEvento: textoEvento };
})();
