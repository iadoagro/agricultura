/* Tranca a página inteira até o login aprovado, e — para quem não é
   responsável — até a página estar entre as "paginas" liberadas pra ele.
   Carregar depois de banco-config.js e admin-auth.js, o mais cedo possível
   no <head>. */
(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  if (!auth || !auth.online) return;

  var CHAVES_POR_ARQUIVO = {
    'eleicoes.html': 'eleicoes',
    'portarias.html': 'portarias',
    'organograma.html': 'organograma',
    'chamados.html': 'chamados',
    'contatos.html': 'contatos',
    'dashboards.html': 'dashboards',
    'dashboard.html': 'dashboards',
    'deagro.html': 'dashboards',
    'deagro-secoes.html': 'dashboards',
    'mecanizacao.html': 'dashboards',
    'mecanizacao-secoes.html': 'dashboards'
  };
  var arquivo = location.pathname.split('/').pop();
  var chave = CHAVES_POR_ARQUIVO[arquivo] || null;

  function paraLogin() {
    if (!/(^|\/)admin-login\.html$/.test(location.pathname)) location.replace('admin-login.html');
  }
  function paraInicio() {
    if (!/(^|\/)index\.html$/.test(location.pathname)) location.replace('index.html');
  }
  function checar() {
    var sessao = auth.sessaoAtual();
    if (!sessao) { paraLogin(); return; }
    var papel = auth.papel();
    if (papel !== 'responsavel' && papel !== 'aprovado') { paraLogin(); return; }
    if (chave && !auth.podeAcessar(chave)) { paraInicio(); return; }
  }
  checar();
  window.addEventListener('admin-auth-atualizado', checar);
})();
