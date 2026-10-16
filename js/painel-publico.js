/* Visibilidade do painel de Mecanização: o que aparece para (a) o público sem login e (b) usuários
   logados que NÃO são o responsável (root), mais a senha opcional do link público.
   O responsável sempre vê tudo. A lista de cada grupo guarda as chaves das abas (data-aba) e das
   visões de "Mostrar mais" (data-sec); NULL = comportamento padrão. Quem edita é a aba
   Configurações (js/painel-config.js). Precisa carregar ANTES do js/dashboard.js.

   Segurança: é um controle de EXIBIÇÃO e de acesso leve (a senha é conferida pelo banco); os dados
   que a página recebe continuam sendo os que a função do servidor entrega (coordenadas e nomes
   internos só chegam a quem está logado). Veja database/mecanizacao-visibilidade.sql. */
(function () {
  'use strict';

  /* Itens configuráveis. pub = pode ser liberado ao público (sem login); os demais mostram nomes de
     pessoas ou dados internos e nunca vão ao público. */
  var ITENS = {
    abas: [
      { k: 'geral', r: 'Visão geral', pub: true }, { k: 'mecanizacao', r: 'Mecanização', pub: true },
      { k: 'acudagem', r: 'Açudagem', pub: true }, { k: 'cultura', r: 'Cultura', pub: true },
      { k: 'municipio', r: 'Município', pub: true }, { k: 'mapa', r: 'Mapa', pub: true },
      { k: 'escritorio', r: 'Escritório Local', pub: true }, { k: 'beneficiario', r: 'Produtor', pub: false },
      { k: 'relatorio', r: 'Exportar', pub: true }, { k: 'lancamento', r: 'Lançar relatórios', pub: false },
      { k: 'insercoes', r: 'Mostrar mais', pub: true, nota: 'no público aparece sozinha quando alguma visão dela é liberada' }
    ],
    visoes: [
      { k: 'registros', r: 'Registros', pub: false }, { k: 'pessoa', r: 'Por pessoa', pub: false },
      { k: 'dia', r: 'Por dia', pub: false }, { k: 'semana', r: 'Por semana', pub: false },
      { k: 'mes', r: 'Por mês', pub: false }, { k: 'pontos', r: 'Mapa de pontos', pub: false },
      { k: 'comparativo', r: 'Comparativo', pub: true }, { k: 'metas', r: 'Metas', pub: true },
      { k: 'tendencias', r: 'Tendências', pub: true }, { k: 'cruzamentos', r: 'Cruzamentos', pub: true },
      { k: 'alertas', r: 'Alertas', pub: false }, { k: 'relatorios', r: 'Relatórios', pub: false }
    ]
  };
  var CFG = null;   // { itens_publico, itens_logado, exige_senha }
  // padrões (quando a lista no banco é NULL): o público vê tudo que pode ser liberado; o usuário logado
  // vê tudo, menos as visões que listam registros e pessoas (Registros, Por pessoa/dia/semana/mês, Mapa de pontos)
  var PADRAO_PUBLICO = ITENS.abas.concat(ITENS.visoes).filter(function (i) { return i.pub; }).map(function (i) { return i.k; });
  var PADRAO_LOGADO = ITENS.abas.concat(ITENS.visoes).map(function (i) { return i.k; }).filter(function (k) {
    return ['registros', 'pessoa', 'dia', 'semana', 'mes', 'pontos'].indexOf(k) < 0;
  });

  function rpc(nome, corpo, comSessao) {
    var cfg = window.BANCO_CONFIG || {};
    var h = { apikey: cfg.chavePublica, 'Content-Type': 'application/json' };
    if (comSessao) {
      var s = window.ADMIN_AUTH && ADMIN_AUTH.sessaoAtual && ADMIN_AUTH.sessaoAtual();
      if (!s || !s.access_token) return Promise.reject(new Error('Entre novamente para continuar.'));
      h.Authorization = 'Bearer ' + s.access_token;
    }
    return fetch(String(cfg.url || '').replace(/\/$/, '') + '/rest/v1/rpc/' + nome, {
      method: 'POST', headers: h, body: JSON.stringify(corpo || {}), cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.text();
    }).then(function (t) { return t ? JSON.parse(t) : null; });
  }

  /** Listas antigas podem ter uma visão de "Mostrar mais" sem a própria "Mostrar mais": liga a aba-mãe. */
  function normalizar(c) {
    if (!c) return c;
    var filhos = ITENS.visoes.map(function (v) { return v.k; });
    ['itens_publico', 'itens_logado'].forEach(function (campo) {
      var l = c[campo];
      if (!Array.isArray(l)) return;
      if (l.indexOf('insercoes') < 0 && l.some(function (k) { return filhos.indexOf(k) >= 0; })) c[campo] = l.concat(['insercoes']);
    });
    if (Array.isArray(c.itens_publico)) c.abas = c.itens_publico;
    return c;
  }

  function papelDaSessao() {
    try { return (window.ADMIN_AUTH && ADMIN_AUTH.papel && ADMIN_AUTH.papel()) || null; } catch (e) { return null; }
  }

  function oculta(el, sim) {
    if (!el) return;
    if (sim) { el.hidden = true; el.setAttribute('data-oculta-lista', '1'); }
    else if (el.getAttribute('data-oculta-lista')) { el.hidden = false; el.removeAttribute('data-oculta-lista'); }
  }

  /** Aplica a lista do grupo que está olhando. ctx = { publico: boolean, root: boolean }. */
  function aplicarVisibilidade(ctx) {
    if (!CFG) return;
    // logado sem perfil conhecido ainda (a sessão chega depois): não esconde nada por engano
    if (!ctx.publico && !ctx.root && !papelDaSessao()) return;
    var lista = ctx.root ? null : (ctx.publico ? (CFG.itens_publico || PADRAO_PUBLICO) : (CFG.itens_logado || PADRAO_LOGADO));
    var tem = function (k) { return !Array.isArray(lista) || lista.indexOf(k) >= 0; };
    // root vê tudo: desfaz o que uma passada anterior tenha escondido
    document.querySelectorAll('.aba[data-aba]').forEach(function (b) {
      var k = b.getAttribute('data-aba');
      if (k === 'insercoes' || k === 'configuracoes') return;
      oculta(b, !tem(k));
    });
    var algumaVisao = false;
    document.querySelectorAll('#insNav button[data-sec]').forEach(function (b) {
      var k = b.getAttribute('data-sec');
      var nao = !tem(k);
      oculta(b, nao);
      if (!nao && (!ctx.publico || ITENS.visoes.some(function (v) { return v.k === k && v.pub; }))) algumaVisao = true;
    });
    var mais = document.getElementById('aba-insercoes');
    if (mais) {
      if (Array.isArray(lista)) {
        // "Mostrar mais" aparece se foi liberada e tem ao menos uma visão disponível
        var libera = tem('insercoes') && algumaVisao;
        if (libera) { mais.hidden = false; mais.removeAttribute('data-oculta-lista'); }
        else { mais.hidden = true; mais.setAttribute('data-oculta-lista', '1'); }
      } else if (mais.getAttribute('data-oculta-lista')) {
        // root: volta a ver "Mostrar mais"
        mais.removeAttribute('data-oculta-lista');
        mais.hidden = false;
      }
    }
  }

  /** Lê a configuração. No público aplica a lista e pede a senha, se houver. Nunca impede o painel de abrir por falha de rede.
      Enquanto confere, a página fica oculta (classe pub-checando): sem isso ela piscaria sem desfoque antes do login. */
  function preparar() {
    var publico = !!window.MODO_PUBLICO;
    var raiz = document.documentElement;
    if (publico) raiz.classList.add('pub-checando');
    var fim = function () { raiz.classList.remove('pub-checando'); };
    // sem resposta em 5 s: segue com o padrão (o painel não pode ficar preso numa tela em branco)
    var limite = new Promise(function (_, falha) { setTimeout(function () { falha(new Error('tempo esgotado')); }, 5000); });
    return Promise.race([rpc('mecanizacao_publico_config_publica'), limite]).then(function (c) {
      CFG = normalizar(c) || null;
      if (!c) { fim(); return; }
      if (!publico) {
        // usuário logado: aplica a lista dele (o root não é afetado)
        aplicarVisibilidade({ publico: false, root: papelDaSessao() === 'responsavel' });
        return;
      }
      aplicarVisibilidade({ publico: true, root: false });
      if (!c.exige_senha) { fim(); return; }
      try { if (sessionStorage.getItem('seagri_mec_pub_ok') === '1') { fim(); return; } } catch (e) { /* privado */ }
      var espera = pedirSenhaPublica();   // o login já está na tela (síncrono): só agora a página "de fundo" volta a existir
      fim();
      return espera;
    }).catch(function () { fim(); /* sem rede para a configuração: abre com o padrão */ });
  }

  var SVG_CADEADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"/></svg>';
  var SVG_CHAVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/></svg>';
  var SVG_OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var SVG_OLHO_RISCADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0112 19C5 19 1 12 1 12a18.5 18.5 0 015.1-5.9M9.9 5.2A9.8 9.8 0 0112 5c7 0 11 7 11 7a18.6 18.6 0 01-2.2 3.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 11-4.2-4.2"/></svg>';

  /** Tela de acesso do link público: tudo atrás fica desfocado e com só 10% de visibilidade. */
  function pedirSenhaPublica() {
    return new Promise(function (ok) {
      var ov = document.createElement('div');
      ov.className = 'pub-login-ov';
      ov.innerHTML =
        '<div class="pub-login" role="dialog" aria-modal="true" aria-labelledby="pubTit" aria-describedby="pubDesc">' +
          '<div class="pub-login-marca" aria-hidden="true">' + SVG_CADEADO + '</div>' +
          '<p class="pub-login-eyebrow">Acesso protegido</p>' +
          '<h1 id="pubTit">Painel da Mecanização</h1>' +
          '<p class="pub-login-desc" id="pubDesc">Digite a senha para abrir o painel.</p>' +
          '<form class="pub-login-form" novalidate>' +
            '<div class="pub-campo">' +
              '<span class="pub-campo-ico" aria-hidden="true">' + SVG_CHAVE + '</span>' +
              '<input type="password" id="pubSenha" name="senha" autocomplete="current-password" placeholder="Senha de acesso" aria-label="Senha" aria-describedby="pubSenhaErro" autocapitalize="off" spellcheck="false">' +
              '<button type="button" class="pub-olho" aria-label="Mostrar senha" aria-pressed="false">' + SVG_OLHO + '</button>' +
            '</div>' +
            '<p class="pub-caps" hidden>Caps Lock está ligado</p>' +
            '<p class="pub-erro" id="pubSenhaErro" role="alert" aria-live="assertive"></p>' +
            '<button type="submit" class="pub-entrar"><span class="pub-entrar-txt">Entrar</span><span class="pub-spin" aria-hidden="true"></span></button>' +
          '</form>' +
          '<p class="pub-login-rodape"><span aria-hidden="true">' + SVG_CADEADO + '</span>Somente leitura. Não tem a senha? Peça a quem compartilhou o link.</p>' +
        '</div>';
      // foco, leitor de tela e rolagem ficam só no login
      var irmaos = Array.prototype.filter.call(document.body.children, function (n) { return n.nodeType === 1; });
      document.body.appendChild(ov);
      irmaos.forEach(function (n) { n.inert = true; });
      document.documentElement.classList.add('pub-travado');

      var f = ov.querySelector('form'), i = ov.querySelector('#pubSenha'), er = ov.querySelector('#pubSenhaErro');
      var btn = ov.querySelector('.pub-entrar'), olho = ov.querySelector('.pub-olho'), caps = ov.querySelector('.pub-caps');
      var campo = ov.querySelector('.pub-campo');
      setTimeout(function () { i.focus(); }, 60);

      olho.addEventListener('click', function () {
        var ver = i.type === 'password';
        i.type = ver ? 'text' : 'password';
        olho.innerHTML = ver ? SVG_OLHO_RISCADO : SVG_OLHO;
        olho.setAttribute('aria-pressed', ver ? 'true' : 'false');
        olho.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
        i.focus();
      });
      var avisarCaps = function (e) { caps.hidden = !(e.getModifierState && e.getModifierState('CapsLock')); };
      i.addEventListener('keydown', avisarCaps);
      i.addEventListener('keyup', avisarCaps);
      i.addEventListener('input', function () { er.textContent = ''; });

      function ocupado(sim) {
        btn.disabled = sim;
        btn.classList.toggle('pub-carregando', sim);
        btn.querySelector('.pub-entrar-txt').textContent = sim ? 'Verificando…' : 'Entrar';
      }
      function falhou(texto) {
        ocupado(false);
        er.textContent = texto;
        campo.classList.remove('pub-tremer');
        void campo.offsetWidth;   // reinicia a animação
        campo.classList.add('pub-tremer');
        i.value = '';
        i.focus();
        // uma pausa curta entre tentativas (o botão volta ao normal, mas só reabre depois dela)
        btn.disabled = true;
        setTimeout(function () { btn.disabled = false; }, 700);
      }
      function abrir() {
        try { sessionStorage.setItem('seagri_mec_pub_ok', '1'); } catch (x) { /* privado */ }
        irmaos.forEach(function (n) { n.inert = false; });
        document.documentElement.classList.remove('pub-travado');
        ov.classList.add('pub-saindo');
        setTimeout(function () { ov.remove(); }, 320);
        ok();
      }

      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (btn.disabled) return;
        if (!i.value) { er.textContent = 'Digite a senha.'; i.focus(); return; }
        er.textContent = '';
        ocupado(true);
        rpc('mecanizacao_publico_verificar', { p_senha: i.value }).then(function (v) {
          if (v === true) abrir();
          else falhou('Senha incorreta. Tente novamente.');
        }).catch(function () { falhou('Não foi possível conferir agora. Verifique a conexão e tente de novo.'); });
      });
    });
  }

  /** Salva as duas listas (e, se p_senha não for undefined, a senha: '' remove). */
  function salvar(publico, logado, senha) {
    return rpc('mecanizacao_visibilidade_salvar', {
      p_publico: publico, p_logado: logado, p_senha: senha === undefined ? null : senha
    }, true).then(function () {
      if (CFG) { CFG.itens_publico = publico; CFG.itens_logado = logado; if (senha !== undefined) CFG.exige_senha = senha !== ''; }
    });
  }

  window.PainelPublico = {
    ITENS: ITENS,
    padraoPublico: PADRAO_PUBLICO,
    padraoLogado: PADRAO_LOGADO,
    preparar: preparar,
    aplicarVisibilidade: aplicarVisibilidade,
    config: function () { return CFG; },
    recarregar: function () { return rpc('mecanizacao_publico_config_publica').then(function (c) { CFG = normalizar(c); return CFG; }); },
    salvar: salvar
  };
})();
