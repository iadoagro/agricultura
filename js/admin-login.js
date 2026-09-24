(function () {
  'use strict';
  var auth = window.ADMIN_AUTH;
  try { sessionStorage.removeItem('seagri_home_direto'); } catch (e) {}   // novo login: a home pode levar direto ao módulo único
  var msg = document.getElementById('adminMsg');
  var linkParaCadastro = document.getElementById('linkParaCadastro');
  var linkParaEntrar = document.getElementById('linkParaEntrar');
  var formCadastrar = document.getElementById('formCadastrar');
  var formEntrar = document.getElementById('formEntrar');
  var painelStatus = document.getElementById('painelStatus');
  var painelFormularios = document.getElementById('painelFormularios');
  var statusTexto = document.getElementById('statusTexto');
  var cadNome = document.getElementById('cadNome');
  var cadSobrenome = document.getElementById('cadSobrenome');
  var cadLogin = document.getElementById('cadLogin');

  // Senha | PIN, Mostrar e os quadrados do PIN (js/senha-regras.js). O login
  // abre no modo usado da última vez neste navegador.
  var R = window.SENHA_REGRAS;
  var campoEntrar = R ? R.campos([document.getElementById('entSenha')], { regras: false }) : null;
  if (R) R.campos([document.getElementById('cadSenha')], { regras: true });

  function limparMsg() { msg.textContent = ''; msg.className = 'admin-msg'; }
  function mostrarErro(texto) { msg.textContent = texto; msg.className = 'admin-msg erro'; }

  if (!auth || !auth.online) {
    mostrarErro('O banco online ainda não foi configurado.');
    painelFormularios.hidden = true;
    return;
  }

  function redirecionar() { location.href = auth.deveTrocarSenha() ? 'admin-trocar-senha.html' : 'index.html'; }

  /* Convites depois do login, um de cada vez, antes de ir pro Início:
       1) PIN — entrou com senha normal e ainda não tem PIN;
       2) biometria — o aparelho tem digital/rosto e ainda não foi cadastrado.
     Cada um volta em todo login até a pessoa aceitar ou marcar "Não perguntar
     de novo" (marca no banco, acesso_pin — vale em qualquer aparelho; neste
     navegador também, caso o banco falhe). Quem entra pela biometria não vê
     convite nenhum. */
  var ofertas = { pin: false, bio: false };
  var ofertaMostrada = false;
  // Durante o login por senha/PIN: o entrar() avisa "admin-auth-atualizado"
  // antes de sabermos se há convite a mostrar — sem esta trava, esse aviso
  // levava direto pro Início e o convite nunca aparecia.
  var decidindoOfertas = false;
  var painelPin = document.getElementById('painelPin');
  var painelBio = document.getElementById('painelBiometria');
  var BIO = window.BIOMETRIA;
  function chaveNunca(tipo) {
    var s = auth.sessaoAtual();
    return 'seagri-' + tipo + '-nao:' + ((s && s.user && s.user.email) || '');
  }
  function naoPerguntarLocal(tipo) { try { return localStorage.getItem(chaveNunca(tipo)) === '1'; } catch (e) { return false; } }
  function mostrarPainel(painel, foco) {
    ofertaMostrada = true;
    [painelFormularios, painelStatus, painelPin, painelBio].forEach(function (p) { p.hidden = p !== painel; });
    limparMsg();
    document.getElementById(foco).focus();
  }
  // próximo passo depois de um convite: o de biometria (se valer) ou o Início
  function seguir() {
    if (ofertas.bio && !naoPerguntarLocal('biometria')) { ofertas.bio = false; mostrarPainel(painelBio, 'bioSim'); return; }
    location.href = 'index.html';
  }
  function marcarNunca(tipo, caixa, rpc) {
    if (!document.getElementById(caixa).checked) return Promise.resolve();
    try { localStorage.setItem(chaveNunca(tipo), '1'); } catch (e) { /* modo privado */ }
    return rpc().catch(function () { /* fica a marca deste navegador */ });
  }
  document.getElementById('pinSim').addEventListener('click', function () {
    marcarNunca('pin', 'pinNunca', auth.pinNaoPerguntar).then(function () { location.href = 'admin-trocar-senha.html?modo=pin'; });
  });
  document.getElementById('pinAgoraNao').addEventListener('click', function () {
    marcarNunca('pin', 'pinNunca', auth.pinNaoPerguntar).then(seguir);
  });
  document.getElementById('bioSim').addEventListener('click', function () {
    var botao = this; botao.disabled = true;
    limparMsg();
    msg.textContent = 'Siga as instruções do aparelho (digital, rosto ou desbloqueio)…';
    BIO.cadastrar().then(function () {
      msg.textContent = 'Biometria cadastrada. No próximo acesso, use "Entrar com biometria".';
      msg.className = 'admin-msg';
      setTimeout(function () { location.href = 'index.html'; }, 1500);
    }).catch(function (err) { mostrarErro(err.message); botao.disabled = false; });
  });
  document.getElementById('bioAgoraNao').addEventListener('click', function () {
    marcarNunca('biometria', 'bioNunca', auth.biometriaNaoPerguntar).then(function () { location.href = 'index.html'; });
  });

  function avaliarSessao() {
    var papel = auth.papel();
    if (ofertaMostrada || decidindoOfertas) return;
    if (!auth.sessaoAtual()) { painelStatus.hidden = true; painelFormularios.hidden = false; return; }
    if (papel === 'responsavel' || papel === 'aprovado') {
      if (!auth.deveTrocarSenha()) {
        if (ofertas.pin && !naoPerguntarLocal('pin')) { ofertas.pin = false; mostrarPainel(painelPin, 'pinSim'); return; }
        if (ofertas.bio && !naoPerguntarLocal('biometria')) { ofertas.bio = false; mostrarPainel(painelBio, 'bioSim'); return; }
      }
      redirecionar(); return;
    }
    painelFormularios.hidden = true;
    painelStatus.hidden = false;
    if (papel === 'pendente') statusTexto.textContent = 'Seu cadastro ainda está aguardando aprovação do responsável.';
    else if (papel === 'recusado') statusTexto.textContent = 'Seu cadastro foi recusado pelo responsável.';
    else statusTexto.textContent = 'Verificando seu cadastro…';
  }

  // "Entrar com biometria": só nos aparelhos que já cadastraram
  var botaoBio = document.getElementById('entrarBiometria');
  if (BIO && BIO.suportado() && BIO.temNoAparelho()) botaoBio.hidden = false;
  botaoBio.addEventListener('click', function () {
    botaoBio.disabled = true;
    limparMsg();
    BIO.entrar().then(avaliarSessao)
      .catch(function (err) { mostrarErro(err.message); })
      .finally(function () { botaoBio.disabled = false; });
  });

  document.getElementById('statusSair').addEventListener('click', function () {
    auth.sair().then(avaliarSessao);
  });

  function mostrar(aba) {
    var cad = aba === 'cadastrar';
    formCadastrar.hidden = !cad; formEntrar.hidden = cad;
    limparMsg();
    (cad ? cadNome : document.getElementById('entEmail')).focus();
  }
  linkParaCadastro.addEventListener('click', function (e) { e.preventDefault(); mostrar('cadastrar'); });
  linkParaEntrar.addEventListener('click', function (e) { e.preventDefault(); mostrar('entrar'); });

  function atualizarPreviaLogin() { cadLogin.value = auth.previewLogin(cadNome.value, cadSobrenome.value); }
  cadNome.addEventListener('input', atualizarPreviaLogin);
  cadSobrenome.addEventListener('input', atualizarPreviaLogin);

  formCadastrar.addEventListener('submit', function (e) {
    e.preventDefault();
    var botao = formCadastrar.querySelector('button'); botao.disabled = true;
    limparMsg();
    auth.cadastrarConta(cadNome.value.trim(), cadSobrenome.value.trim(), document.getElementById('cadSenha').value)
      .then(function () {
        formCadastrar.reset(); cadLogin.value = '';
        avaliarSessao();
      })
      .catch(function (err) { mostrarErro(err.message); })
      .finally(function () { botao.disabled = false; });
  });

  formEntrar.addEventListener('submit', function (e) {
    e.preventDefault();
    var botao = formEntrar.querySelector('button[type="submit"]'); botao.disabled = true;
    limparMsg();
    var senha = document.getElementById('entSenha').value;
    decidindoOfertas = true;
    auth.entrar(document.getElementById('entEmail').value.trim(), senha)
      .then(function () {
        if (campoEntrar) campoEntrar.guardar();   // próximo login abre no mesmo modo
        var entrouComPin = /^\d{6}$/.test(senha);
        return Promise.all([auth.statusPin(), BIO ? BIO.disponivelNoAparelho() : false]).then(function (r) {
          var st = r[0];
          ofertas.pin = !entrouComPin && !(st && (st.usaPin || st.naoPerguntar));
          ofertas.bio = Boolean(r[1]) && !BIO.temNoAparelho() && !(st && st.biometriaNaoPerguntar);
        });
      })
      .catch(function (err) { mostrarErro(err.message); })
      .then(function () { decidindoOfertas = false; avaliarSessao(); })
      .finally(function () { botao.disabled = false; });
  });

  window.addEventListener('admin-auth-atualizado', avaliarSessao);
  mostrar('entrar');
  avaliarSessao();
})();
