/* Página pública da apuração do 2º turno (eleicoes/index.html): sem login, sem menu, sem telas internas.
   1) pergunta ao banco, pela única função aberta ao público
   (apuracao_publica_ativa), se o link está ativo; 2) só então carrega os scripts da apuração, um a um. Sem token válido
   nada da apuração é carregado. Os scripts abaixo são os únicos que esta página usa — não há admin-auth, admin-gate,
   nav nem qualquer chave além da publicável. Veja database/apuracao-links.sql. */
(function () {
  'use strict';
  window.APURACAO_PUBLICA = true;   // eleicoes-2turno.js: sem botão de gerar link
  window.MODO_PUBLICO = true;
  var aviso = document.getElementById('apPubAviso'), app = document.getElementById('apPubApp');
  // raiz do site (…/agricultura/): calculada a partir deste próprio script, então vale em qualquer pasta
  var BASE = new URL('../', document.currentScript ? document.currentScript.src : location.href).href;
  var SCRIPTS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    BASE + 'js/tse-limite.js',
    BASE + 'js/dados-tche-2026.js',
    BASE + 'js/dados-governo-2026.js',
    BASE + 'js/dados-governo-2turno-2026.js',
    BASE + 'js/dados-governo-1turno-secoes.js',
    BASE + 'js/dados-perfil-2026.js',
    BASE + 'js/eleicao-painel.js',
    BASE + 'js/eleicoes-2turno.js',
    BASE + 'js/eleicoes-2turno-secoes.js'
  ];

  function negar(texto) {
    if (app) app.remove();
    if (aviso) { aviso.hidden = false; aviso.className = 'ap-aviso ap-negado'; aviso.innerHTML = '<h1>Acesso não autorizado</h1><p>' + texto + '</p><p class="ap-peq">Peça um novo link a quem compartilhou esta página.</p>'; }
    document.title = 'Acesso não autorizado';
  }
  function carrega(i) {
    return new Promise(function (ok, falha) {
      if (i >= SCRIPTS.length) { ok(); return; }
      var s = document.createElement('script'); s.src = SCRIPTS[i]; s.async = false; if (/^https:/.test(SCRIPTS[i])) s.crossOrigin = 'anonymous';
      s.onload = function () { carrega(i + 1).then(ok, falha); };
      s.onerror = function () { falha(new Error('Não foi possível carregar ' + SCRIPTS[i])); };
      document.head.appendChild(s);
    });
  }

  var cfg = window.BANCO_CONFIG;
  if (!cfg || !cfg.url) { negar('Não foi possível verificar o link agora.'); return; }

  // O link é fixo (…/pages/publico). O responsável liga e desliga no botão "Link público"; aqui só se pergunta se está ativo.
  fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/apuracao_publica_ativa', {
    method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json' },
    body: '{}'
  }).then(function (r) {
    if (!r.ok) throw new Error('verificação');
    return r.json();
  }).then(function (ativo) {
    if (ativo !== true) { negar('Este link foi desativado ou ainda não foi liberado.'); return; }
    if (aviso) aviso.hidden = true;
    if (app) app.hidden = false;
    return carrega(0);
  }).catch(function () {
    negar('Não foi possível verificar o link agora. Confira sua conexão e tente novamente.');
  });
})();
