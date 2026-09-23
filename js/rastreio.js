/* Rastreio de navegação para o registro de auditoria (pages/logs.html).
   Grava em log_eventos, módulo "navegacao", tudo o que dá pra saber sem
   ler o que a pessoa digita:
     visita  — abriu a página (com navegador, sistema, tela, página anterior)
     saida   — tempo que a página ficou VISÍVEL (detalhes.duracao_seg); é
               gravado ao sair, e também ao trocar de aba/minimizar — no
               celular o navegador pode matar a aba escondida sem avisar.
               Voltando, começa um novo trecho; o tempo total da visita é a
               soma das "saida" com o mesmo detalhes.visita_id.
     aba     — trocou de aba dentro da página (painéis com .aba / role=tab)
     clique  — botão ou link clicado (o texto do botão, nunca um campo)
     filtro  — mudou um <select>, checkbox ou campo de data (o rótulo e a
               opção escolhida; campos de texto livre não são registrados)
     enviar  — enviou um formulário
     erro    — erro de JavaScript na página
   Os eventos vão numa fila e são enviados em lote (a cada 8 s, ao esconder
   a página e ao sair, com keepalive) — uma requisição por clique pesaria.
   Carregar depois de admin-auth.js. */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var auth = window.ADMIN_AUTH;
  if (!auth || !auth.online || !cfg.url || !cfg.chavePublica) return;

  var NOMES = {
    'index.html': 'Início', 'dashboard.html': 'Painel de Mecanização', 'dashboards.html': 'Dashboards',
    'deagro.html': 'DEAGRO', 'deagro-secoes.html': 'DEAGRO — Seções', 'eleicoes.html': 'Fiscais',
    'portarias.html': 'Portarias', 'organograma.html': 'Organograma', 'chamados.html': 'Chamados',
    'cadastros-chamados.html': 'Cadastros de chamados', 'contatos.html': 'Contatos',
    'cadastros-fiscais.html': 'Cadastro de fiscais', 'admin-usuarios.html': 'Usuários',
    'admin-permissoes.html': 'Acessos', 'logs.html': 'Logs', 'lancamento-editar.html': 'Editar lançamento',
    'admin-trocar-senha.html': 'Trocar senha'
  };
  var arquivo = location.pathname.split('/').pop() || 'index.html';
  var paginaNome = NOMES[arquivo] || arquivo.replace(/\.html$/, '');
  // Na própria página de logs só a visita e o tempo contam: registrar os
  // cliques de quem está lendo os logs só enche a lista de ruído.
  var registraInteracoes = arquivo !== 'logs.html';

  function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  var visitaId = novoId();
  var navegacaoId;   // uma por aba do navegador — junta o caminho página a página
  try {
    navegacaoId = sessionStorage.getItem('rastreio-navegacao');
    if (!navegacaoId) { navegacaoId = novoId(); sessionStorage.setItem('rastreio-navegacao', navegacaoId); }
  } catch (e) { navegacaoId = visitaId; }

  var abaAtual = null;
  var fila = [];

  function sessao() {
    var s = auth.sessaoAtual && auth.sessaoAtual();
    return s && s.user && s.access_token && s.expires_at * 1000 > Date.now() ? s : null;
  }

  function registrar(acao, descricao, extras) {
    var detalhes = { pagina: arquivo, pagina_nome: paginaNome, visita_id: visitaId, navegacao_id: navegacaoId };
    if (abaAtual) detalhes.aba = abaAtual;
    if (extras) Object.keys(extras).forEach(function (k) { detalhes[k] = extras[k]; });
    detalhes.hora_navegador = new Date().toISOString();
    fila.push({ acao: acao, modulo: 'navegacao', descricao: String(descricao).slice(0, 500), detalhes: detalhes });
    if (fila.length > 200) fila.shift();   // sessão vencida por muito tempo: não cresce sem fim
    if (fila.length >= 25) enviar(false);
  }

  function enviar(saindo) {
    if (!fila.length) return;
    var s = sessao();
    if (!s) { if (saindo) fila = []; return; }   // sem login válido: guarda até o login voltar
    var lote = fila.splice(0, fila.length).map(function (e) {
      return {
        usuario_id: s.user.id, usuario_email: s.user.email, acao: e.acao, modulo: e.modulo,
        descricao: e.descricao, detalhes: e.detalhes
      };
    });
    try {
      fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/log_eventos', {
        method: 'POST', keepalive: true,
        headers: {
          apikey: cfg.chavePublica, Authorization: 'Bearer ' + s.access_token,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify(lote)
      }).catch(function () { /* auditoria nunca trava a página */ });
    } catch (e) { /* idem */ }
  }

  /* ------------------------------------------------ tempo visível na página */
  var inicioTrecho = document.visibilityState === 'visible' ? Date.now() : null;
  var tempoTotal = 0;
  var saiu = false;

  function fecharTrecho(motivo) {
    if (inicioTrecho === null) return;
    var seg = Math.round((Date.now() - inicioTrecho) / 1000);
    inicioTrecho = null;
    tempoTotal += seg;
    if (seg < 1) return;
    registrar('saida',
      (motivo === 'saiu' ? 'Saiu de ' : 'Deixou em segundo plano ') + paginaNome + ' — ficou ' + duracaoTexto(seg),
      { duracao_seg: seg, tempo_total_seg: tempoTotal, motivo: motivo });
  }

  function duracaoTexto(seg) {
    var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + (h ? '' : s + ' s');
  }

  document.addEventListener('visibilitychange', function () {
    if (saiu) return;
    if (document.visibilityState === 'hidden') { fecharTrecho('ocultou'); enviar(true); }
    else if (inicioTrecho === null) inicioTrecho = Date.now();
  });
  window.addEventListener('pagehide', function () {
    if (saiu) return;
    saiu = true;
    fecharTrecho('saiu');
    enviar(true);
  });
  setInterval(function () { enviar(false); }, 8000);

  /* -------------------------------------------------------------- visita */
  function ambiente() {
    var ua = navigator.userAgent || '';
    var navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' :
      /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Outro';
    var sistema = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
      /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Outro';
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer) : ''; } catch (e) { ref = ''; }
    var anterior = ref && ref.origin === location.origin ? (NOMES[ref.pathname.split('/').pop()] || ref.pathname.split('/').pop()) : (ref ? ref.hostname : '');
    return {
      navegador: navegador, sistema: sistema,
      dispositivo: /Mobi|Android|iPhone|iPod/.test(ua) ? 'Celular' : /iPad|Tablet/.test(ua) ? 'Tablet' : 'Computador',
      tela: screen.width + '×' + screen.height, janela: innerWidth + '×' + innerHeight,
      idioma: navigator.language || '', pagina_anterior: anterior || null,
      endereco: location.pathname + location.search + location.hash
    };
  }

  function registrarVisita() {
    var amb = ambiente();
    registrar('visita', 'Abriu ' + paginaNome + (amb.pagina_anterior ? ' (vindo de ' + amb.pagina_anterior + ')' : ''), amb);
  }

  /* ---------------------------------------------------------- interações */
  function textoDe(elemento) {
    var t = elemento.getAttribute('aria-label') || elemento.getAttribute('title') || elemento.textContent || elemento.value || elemento.id || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function rotuloCampo(campo) {
    var r = '';
    if (campo.labels && campo.labels[0]) {
      // <label>Módulo<select>…</select></label>: sem tirar o campo de dentro,
      // o textContent traria junto o texto de todas as opções
      var copia = campo.labels[0].cloneNode(true);
      Array.prototype.forEach.call(copia.querySelectorAll('select, input, textarea, button'), function (n) { n.remove(); });
      r = copia.textContent;
    }
    r = r.trim() || campo.getAttribute('aria-label') || campo.name || campo.id || 'campo';
    return r.replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  var ultimoClique = { t: '', em: 0 };
  document.addEventListener('click', function (ev) {
    if (!registraInteracoes) return;
    var alvo = ev.target.closest && ev.target.closest('button, a, [role="tab"], [role="button"], summary, .aba');
    if (!alvo) return;
    var texto = textoDe(alvo);
    if (!texto) return;
    var agora = Date.now();
    if (texto === ultimoClique.t && agora - ultimoClique.em < 1000) return;   // duplo clique / repetição
    ultimoClique = { t: texto, em: agora };

    if (alvo.matches('.aba, [role="tab"]')) {
      abaAtual = alvo.getAttribute('data-aba') || texto;
      registrar('aba', 'Abriu a aba "' + texto + '" em ' + paginaNome, { aba: abaAtual });
      return;
    }
    var extras = { elemento: alvo.tagName.toLowerCase() };
    if (alvo.tagName === 'A' && alvo.getAttribute('href')) extras.destino = alvo.getAttribute('href').slice(0, 200);
    registrar('clique', 'Clicou em "' + texto + '" em ' + paginaNome, extras);
  }, true);

  document.addEventListener('change', function (ev) {
    if (!registraInteracoes) return;
    var c = ev.target;
    if (!c || !c.tagName) return;
    var tipo = (c.type || '').toLowerCase();
    var valor;
    if (c.tagName === 'SELECT') valor = c.multiple
      ? Array.prototype.filter.call(c.options, function (o) { return o.selected; }).map(function (o) { return o.text.trim(); }).join(', ')
      : (c.options[c.selectedIndex] ? c.options[c.selectedIndex].text.trim() : c.value);
    else if (tipo === 'checkbox' || tipo === 'radio') valor = (c.checked ? 'marcou ' : 'desmarcou ') + (rotuloCampo(c) || c.value);
    else if (/^(date|month|week|time|datetime-local|range|color)$/.test(tipo)) valor = c.value;
    else return;   // texto livre (nomes, CPF, senha...) nunca é registrado
    registrar('filtro', 'Alterou "' + rotuloCampo(c) + '" para "' + String(valor).slice(0, 120) + '" em ' + paginaNome, { campo: rotuloCampo(c) });
  }, true);

  document.addEventListener('submit', function (ev) {
    if (!registraInteracoes) return;
    var f = ev.target;
    registrar('enviar', 'Enviou o formulário ' + (f.getAttribute('aria-label') || f.id || '') + ' em ' + paginaNome, { formulario: f.id || null });
  }, true);

  window.addEventListener('error', function (ev) {
    registrar('erro', 'Erro na página ' + paginaNome + ': ' + (ev.message || 'desconhecido'),
      { arquivo: ev.filename ? ev.filename.split('/').pop() : null, linha: ev.lineno || null });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    registrar('erro', 'Erro na página ' + paginaNome + ': ' + ((r && r.message) || String(r)).slice(0, 200));
  });

  // A sessão pode ainda estar sendo confirmada (admin-auth.js); a visita
  // entra na fila agora e só vai quando houver login válido.
  registrarVisita();
})();
