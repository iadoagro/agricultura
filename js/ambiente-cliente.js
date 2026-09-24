/* Ambiente de quem está usando o sistema, para o registro de auditoria
   (log_eventos.detalhes): navegador e sistema com versão, modelo do
   aparelho, um identificador do aparelho, resolução da tela, conexão e
   fuso horário. O IP não sai daqui — o navegador não sabe o próprio IP
   público; quem grava é o banco, pelo cabeçalho da requisição
   (database/log-eventos-ip.sql), e a cidade/provedor desse IP também vêm
   do banco (database/log-eventos-localizacao.sql).

   Modelo do celular e versão exata do sistema (Windows 11, Android 14)
   só vêm das Client Hints (Chrome, Edge, Samsung, Opera): o userAgent
   desses navegadores hoje diz sempre "Windows NT 10" e "Android 10; K".
   A resposta é assíncrona — `pronto` resolve quando chegou (ou em 1,5 s)
   e fica guardada na aba, então da segunda página em diante já vem na hora.
   Safari e Firefox não têm Client Hints: lá fica o que o userAgent diz.

   Carregar antes de admin-auth.js e rastreio.js. */
(function () {
  'use strict';
  var CHAVE_APARELHO = 'seagri-aparelho-id';
  var CHAVE_HINTS = 'seagri-ambiente-hints';

  function versao(ua, re) {
    var m = ua.match(re);
    return m ? m[1].split(/[._]/).slice(0, 2).join('.').replace(/\.0$/, '') : '';
  }

  /* Identificador do aparelho: sorteado uma vez e guardado no navegador.
     Muda se a pessoa limpar os dados do site ou usar aba anônima. */
  var aparelhoId = null;
  try {
    aparelhoId = localStorage.getItem(CHAVE_APARELHO);
    if (!aparelhoId) {
      aparelhoId = (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8)).toUpperCase();
      localStorage.setItem(CHAVE_APARELHO, aparelhoId);
    }
  } catch (e) { aparelhoId = null; }

  var hints = null;
  try { hints = JSON.parse(sessionStorage.getItem(CHAVE_HINTS) || 'null'); } catch (e) { hints = null; }

  var pronto = hints || !(navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)
    ? Promise.resolve()
    : Promise.race([
        navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList']).then(function (v) {
          hints = { model: v.model || '', platform: v.platform || '', platformVersion: v.platformVersion || '' };
          try { sessionStorage.setItem(CHAVE_HINTS, JSON.stringify(hints)); } catch (e) { /* modo privado */ }
        }).catch(function () { /* navegador recusou: fica o userAgent */ }),
        new Promise(function (ok) { setTimeout(ok, 1500); })
      ]);

  function navegador(ua) {
    var lista = [
      ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/], ['Opera', /(?:OPR|OPT)\/([\d.]+)/],
      ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
      ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/]
    ];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i][1].test(ua)) {
        var v = versao(ua, lista[i][1]);
        // Chrome/Edge/Firefox: só a versão principal ("Chrome 128") basta
        return lista[i][0] + (v ? ' ' + (lista[i][0] === 'Safari' ? v : v.split('.')[0]) : '');
      }
    }
    return 'Outro';
  }

  function sistema(ua) {
    var pv = hints && hints.platformVersion ? hints.platformVersion.split('.') : null;
    if (/Windows NT 10/.test(ua)) {
      // Client Hints: platformVersion 13+ é Windows 11, 1 a 10 é Windows 10
      if (pv) return +pv[0] >= 13 ? 'Windows 11' : 'Windows 10';
      return 'Windows 10/11';
    }
    if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
    if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Android/.test(ua)) {
      if (pv && pv[0]) return 'Android ' + pv[0];
      var a = versao(ua, /Android ([\d.]+)/); return 'Android' + (a ? ' ' + a : '');
    }
    if (/iPhone|iPad|iPod/.test(ua)) { var i = versao(ua, /OS ([\d_]+) like Mac/); return 'iOS' + (i ? ' ' + i : ''); }
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Mac OS X/.test(ua)) return 'macOS' + (pv && pv[0] ? ' ' + pv[0] : '');
    if (/Linux/.test(ua)) return 'Linux';
    return 'Outro';
  }

  function modelo(ua) {
    var m = hints && hints.model;
    if (!m) {
      // navegador sem Client Hints: o modelo às vezes ainda vem no userAgent
      var r = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?\)/);
      m = r && r[1] !== 'K' ? r[1].trim() : '';
    }
    if (!m && /iPhone/.test(ua)) return 'iPhone';   // a Apple não informa o modelo
    if (!m && /iPad/.test(ua)) return 'iPad';
    if (/^SM-/.test(m)) return 'Samsung ' + m;
    if (/^XT\d/.test(m)) return 'Motorola ' + m;
    return m;
  }

  function conexao() {
    var c = navigator.connection;
    if (!c) return '';
    // type (wifi/cellular) só o Chrome do Android informa
    var tipo = { wifi: 'Wi-Fi', cellular: 'Dados móveis', ethernet: 'Cabo', bluetooth: 'Bluetooth' }[c.type] || '';
    // effectiveType é a classe de velocidade medida ("4g" até num PC com
    // cabo), não a tecnologia da rede — só vale mencionar quando é lenta
    var lenta = /^(slow-2g|2g|3g)$/.test(c.effectiveType || '') ? 'conexão lenta' : '';
    return [tipo, lenta].filter(Boolean).join(', ');
  }

  function coletar() {
    var ua = navigator.userAgent || '';
    var dpr = window.devicePixelRatio || 1;
    var dados = {
      navegador: navegador(ua),
      sistema: sistema(ua),
      modelo: modelo(ua) || null,
      dispositivo: /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobi/.test(ua)) ? 'Tablet'
        : /Mobi|iPhone|iPod/.test(ua) ? 'Celular' : 'Computador',
      tela: screen.width + '×' + screen.height + (dpr !== 1 ? ' @' + Math.round(dpr * 100) / 100 + 'x' : ''),
      janela: innerWidth + '×' + innerHeight,
      idioma: navigator.language || '',
      conexao: conexao() || null,
      fuso: null,
      aparelho_id: aparelhoId
    };
    try { dados.fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { /* navegador antigo */ }
    dados.aparelho_desc = [dados.modelo || dados.dispositivo, dados.sistema, dados.navegador.split(' ')[0]].join(' · ');
    return dados;
  }

  /* Localização do aparelho (API de geolocalização do navegador). Só com
     permissão: o navegador sempre pergunta, e isso nunca é disparado sem a
     pessoa clicar em "Permitir" no aviso de js/rastreio.js. Com o GPS
     desligado o navegador usa Wi-Fi e antenas (20 a 100 m, em geral).
     posicao() não pergunta nada: devolve null se a permissão não foi dada. */
  var GEO_OPCOES = { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 4000 };

  function estadoPermissao() {
    if (!navigator.geolocation) return Promise.resolve('indisponivel');
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('desconhecido');   // Safari antigo
    return navigator.permissions.query({ name: 'geolocation' })
      .then(function (s) { return s.state; })   // granted | denied | prompt
      .catch(function () { return 'desconhecido'; });
  }

  function lerPosicao() {
    return new Promise(function (ok) {
      navigator.geolocation.getCurrentPosition(function (p) {
        ok({
          lat: Math.round(p.coords.latitude * 1e5) / 1e5,
          lon: Math.round(p.coords.longitude * 1e5) / 1e5,
          precisao_m: Math.round(p.coords.accuracy),
          em: new Date(p.timestamp).toISOString()
        });
      }, function () { ok(null); }, GEO_OPCOES);
    });
  }

  // Safari sem permissions.query: vale o que a pessoa respondeu da última vez
  var CHAVE_GEO = 'seagri-geo-permitida';
  function jaPermitiu() { try { return localStorage.getItem(CHAVE_GEO) === '1'; } catch (e) { return false; } }

  function posicao() {
    return estadoPermissao().then(function (e) {
      return e === 'granted' || (e === 'desconhecido' && jaPermitiu()) ? lerPosicao() : null;
    });
  }

  // Chamar só a partir de um clique: é o que abre a pergunta do navegador.
  function pedirPosicao() {
    if (!navigator.geolocation) return Promise.resolve(null);
    return lerPosicao().then(function (p) {
      try { localStorage.setItem(CHAVE_GEO, p ? '1' : ''); } catch (e) { /* modo privado */ }
      return p;
    });
  }

  window.AMBIENTE_CLIENTE = { coletar: coletar, pronto: pronto, estadoPermissao: estadoPermissao, posicao: posicao, pedirPosicao: pedirPosicao };
})();
