/* Ambiente de quem está usando o sistema, para o registro de auditoria
   (log_eventos.detalhes): navegador e sistema com versão, tipo de
   dispositivo e resolução da tela. O IP não sai daqui — o navegador não
   sabe o próprio IP público; quem grava é o banco, pelo cabeçalho da
   requisição (database/log-eventos-ip.sql).
   Carregar antes de admin-auth.js e rastreio.js. */
(function () {
  'use strict';

  function versao(ua, re) {
    var m = ua.match(re);
    return m ? m[1].split(/[._]/).slice(0, 2).join('.').replace(/\.0$/, '') : '';
  }

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
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';   // o navegador não distingue 10 de 11 pelo UA
    if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
    if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Android/.test(ua)) { var a = versao(ua, /Android ([\d.]+)/); return 'Android' + (a ? ' ' + a : ''); }
    if (/iPhone|iPad|iPod/.test(ua)) { var i = versao(ua, /OS ([\d_]+) like Mac/); return 'iOS' + (i ? ' ' + i : ''); }
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Outro';
  }

  function coletar() {
    var ua = navigator.userAgent || '';
    var dpr = window.devicePixelRatio || 1;
    return {
      navegador: navegador(ua),
      sistema: sistema(ua),
      dispositivo: /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobi/.test(ua)) ? 'Tablet'
        : /Mobi|iPhone|iPod/.test(ua) ? 'Celular' : 'Computador',
      tela: screen.width + '×' + screen.height + (dpr !== 1 ? ' @' + Math.round(dpr * 100) / 100 + 'x' : ''),
      janela: innerWidth + '×' + innerHeight,
      idioma: navigator.language || ''
    };
  }

  window.AMBIENTE_CLIENTE = { coletar: coletar };
})();
