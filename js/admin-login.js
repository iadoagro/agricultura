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
  if (R) R.campos([document.getElementById('cadSenha')], { regras: true, semPin: true });

  function limparMsg() { msg.textContent = ''; msg.className = 'admin-msg'; }
  function mostrarErro(texto) { msg.textContent = texto; msg.className = 'admin-msg erro'; }

  if (!auth || !auth.online) {
    mostrarErro('O banco online ainda não foi configurado.');
    painelFormularios.hidden = true;
    return;
  }

  function redirecionar() { location.href = auth.deveTrocarSenha() ? 'admin-trocar-senha.html' : 'index.html'; }

  /* Convite depois do login, antes de ir pro Início: o cadastro e o 1º acesso
     são só com senha normal. A partir da 2ª entrada, quem usa senha normal e
     ainda não tem PIN é perguntado se quer cadastrar um. Cada "Agora não" conta
     uma recusa no banco (acesso_pin); na 5ª o convite para de aparecer até o
     root reexibir em Usuários. */
  var ofertas = { pin: false, restantes: 0 };
  var ofertaMostrada = false;
  // Durante o login por senha/PIN: o entrar() avisa "admin-auth-atualizado"
  // antes de sabermos se há convite a mostrar — sem esta trava, esse aviso
  // levava direto pro Início e o convite nunca aparecia.
  var decidindoOfertas = false;
  var painelPin = document.getElementById('painelPin');
  function mostrarPainel(painel, foco) {
    ofertaMostrada = true;
    [painelFormularios, painelStatus, painelPin].forEach(function (p) { p.hidden = p !== painel; });
    limparMsg();
    document.getElementById(foco).focus();
  }
  document.getElementById('pinSim').addEventListener('click', function () {
    location.href = 'admin-trocar-senha.html?modo=pin';
  });
  document.getElementById('pinAgoraNao').addEventListener('click', function () {
    auth.pinRecusar().catch(function () { /* sem banco: só segue */ }).then(function () { location.href = 'index.html'; });
  });

  function avaliarSessao() {
    var papel = auth.papel();
    if (ofertaMostrada || decidindoOfertas) return;
    if (!auth.sessaoAtual()) { painelStatus.hidden = true; painelFormularios.hidden = false; return; }
    if (papel === 'responsavel' || papel === 'aprovado') {
      if (!auth.deveTrocarSenha()) {
        if (ofertas.pin) {
          ofertas.pin = false;
          document.getElementById('pinRestantes').textContent = ofertas.restantes > 1
            ? 'Você pode adiar mais ' + (ofertas.restantes - 1) + ' vez' + (ofertas.restantes - 1 === 1 ? '' : 'es') + ' antes de eu parar de perguntar.'
            : 'Esta é a última vez que eu pergunto.';
          mostrarPainel(painelPin, 'pinSim'); return;
        }
      }
      redirecionar(); return;
    }
    painelFormularios.hidden = true;
    painelStatus.hidden = false;
    if (papel === 'pendente') {
      var email = (auth.sessaoAtual().user.email || '');
      var usuario = email.replace(/@sistema\.local$/i, '');
      statusTexto.innerHTML = '<strong>Cadastro solicitado!</strong><br>Seu usuário é <strong></strong>.<br>' +
        'Para entrar, digite esse usuário e a senha que você cadastrou na tela de login.<br>' +
        'Seu cadastro está <strong>pendente de aprovação</strong> do responsável: você só consegue entrar depois que ele aprovar.';
      statusTexto.querySelectorAll('strong')[1].textContent = usuario;
      limparMsg();
    }
    else if (papel === 'recusado') statusTexto.textContent = 'Seu cadastro foi recusado pelo responsável.';
    else statusTexto.textContent = 'Verificando seu cadastro…';
  }

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

  // O usuário é só nome.sobrenome: aceita apenas letras (a-z, sem acento, minúsculas) e um único ponto.
  // Vale para digitar e colar; números, "@" e qualquer símbolo são descartados na hora.
  // Única exceção: o responsável entra com root@root.com, então o campo aceita esse texto exato (digitado aos poucos).
  document.getElementById('entEmail').addEventListener('input', function () {
    if (auth.RESPONSAVEL_EMAIL.indexOf(this.value.toLowerCase()) === 0) return;
    var v = this.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z.]/g, '');
    var i = v.indexOf('.');
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
    if (v !== this.value) this.value = v;
  });

  // Ao digitar o usuário, confere no banco se a conta tem PIN: só então o modo PIN é liberado.
  var MOTIVOS_PIN = {
    vazio: 'Digite seu usuário primeiro: o PIN só fica disponível para quem já cadastrou um.',
    poucos_acessos: 'Você ainda não pode usar PIN: precisa de pelo menos 2 acessos com senha. A partir do 2º acesso o sistema oferece cadastrar o PIN.',
    recusou: 'Você recusou cadastrar o PIN 5 vezes e o convite foi desativado. Entre com a senha ou peça ao responsável para reexibir o PIN.',
    sem_pin: 'Você ainda não cadastrou um PIN. Entre com a senha: o convite para cadastrar o PIN aparece no login.'
  };
  var entUsuario = document.getElementById('entEmail');
  var seqPin = 0, timerPin = null;
  function verificarPin() {
    if (!campoEntrar) return;
    var login = entUsuario.value.trim(), seq = ++seqPin;
    if (!login) { campoEntrar.bloquearPin(MOTIVOS_PIN.vazio); return; }
    auth.pinSituacao(login).then(function (r) {
      if (seq !== seqPin) return;   // já digitou outra coisa
      if (r && r.tem_pin) campoEntrar.liberarPin();
      else campoEntrar.bloquearPin(MOTIVOS_PIN[(r && r.motivo)] || MOTIVOS_PIN.sem_pin);
    }).catch(function () { if (seq === seqPin) campoEntrar.liberarPin(); });   // sem conexão: não trava; o login acusa se errar
  }
  entUsuario.addEventListener('input', function () {
    if (campoEntrar) campoEntrar.bloquearPin(MOTIVOS_PIN.vazio);   // enquanto confere, PIN fica travado
    clearTimeout(timerPin); timerPin = setTimeout(verificarPin, 400);
  });
  if (campoEntrar) campoEntrar.bloquearPin(MOTIVOS_PIN.vazio);

  function atualizarPreviaLogin() { cadLogin.value = auth.previewLogin(cadNome.value, cadSobrenome.value); }
  // Nome e sobrenome: só letras e espaço (sem hífen, número ou símbolo). Com mais de um sobrenome, o
  // login usa o primeiro; se já existir, o sistema tenta o próximo.
  [cadNome, cadSobrenome].forEach(function (c) {
    c.addEventListener('input', function () {
      var v = c.value.replace(/[^A-Za-zÀ-ÿ ]/g, '');
      if (v !== c.value) c.value = v;
    });
  });
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
        // conta a entrada no banco; o convite só vem a partir da 2ª
        return auth.pinRegistrarEntrada().catch(function () {}).then(function () {
          if (entrouComPin) return;
          return auth.statusPin().then(function (st) {
            ofertas.pin = Boolean(st) && !st.usaPin && !st.naoPerguntar && st.entradas >= 2 && st.recusas < auth.MAX_RECUSAS_PIN;
            ofertas.restantes = st ? auth.MAX_RECUSAS_PIN - st.recusas : 0;
          });
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
