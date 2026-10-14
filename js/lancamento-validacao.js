/* Conferências do formulário de lançamento (e da edição) para a pessoa errar
   menos. Nada aqui muda o que é gravado: só avisa na hora, embaixo do campo.

   - "erro": impede de salvar (CPF inválido, nome sem sobrenome, telefone ou
     data de nascimento impossíveis, lançamento repetido: mesmo CPF + serviço +
     data da vistoria);
   - "aviso": não impede, só pede para conferir (valores fora do esperado para
     o Acre, área muito grande);
   - perguntar antes de sair da página com ficha preenchida e não salva. */
(function () {
  'use strict';

  var form = document.getElementById('lancForm');
  if (!form) return;
  var EDITANDO = !!document.getElementById('lancEditarContexto');

  function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }
  function num(v) {
    var n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.'));
    if (isNaN(n)) n = parseFloat(String(v || '').replace(',', '.'));
    return n;
  }

  /* ------------------------------------------------------------ mensagem */
  function msgDe(campo) {
    var alvo = campo.closest('label') || campo.parentNode;
    var m = alvo.querySelector(':scope > .lanc-msg');
    if (!m) {
      m = document.createElement('small');
      m.className = 'lanc-msg';
      m.hidden = true;
      alvo.appendChild(m);
    }
    return m;
  }

  /** tipo: 'erro' (bloqueia o salvar), 'aviso', 'ok' ou '' (limpa). */
  function mostrar(campo, tipo, texto) {
    var m = msgDe(campo);
    campo._lancErro = tipo === 'erro';
    if (tipo === 'erro') campo.setCustomValidity(texto);
    else if (campo.validity.customError && campo._lancMeu) campo.setCustomValidity('');
    campo._lancMeu = tipo === 'erro';
    campo.classList.toggle('lanc-campo-erro', tipo === 'erro');
    campo.classList.toggle('lanc-campo-aviso', tipo === 'aviso');
    m.className = 'lanc-msg' + (tipo ? ' lanc-msg-' + tipo : '');
    m.textContent = tipo ? texto : '';
    m.hidden = !tipo;
  }

  /** Mensagem própria de outro script (ex.: data-br.js) tem prioridade. */
  function deOutro(campo) { return campo.validity.customError && !campo._lancMeu; }

  /* --------------------------------------------------------------- regras */
  function cpfValido(d) {
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (var t = 9; t < 11; t++) {
      var soma = 0;
      for (var i = 0; i < t; i++) soma += parseInt(d.charAt(i), 10) * (t + 1 - i);
      var dv = ((soma * 10) % 11) % 10;
      if (dv !== parseInt(d.charAt(t), 10)) return false;
    }
    return true;
  }

  /* Repetido = mesmo CPF + mesmo serviço + mesma data da vistoria. Um produtor
     pode ter vários lançamentos de Mecanização ou Açudagem; só barra o igual. */
  var respostasDuplicado = {};   // chave -> true (repetido) / false
  function idDaUrl() {
    var m = /[?&]id=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function verificarCpf(campo, aoSair) {
    var d = soDigitos(campo.value);
    if (!d) { mostrar(campo, '', ''); return; }
    if (d.length < 11) {
      if (aoSair) mostrar(campo, 'erro', 'CPF incompleto: faltam ' + (11 - d.length) + ' dígito(s).');
      else mostrar(campo, '', '');
      return;
    }
    if (!cpfValido(d)) { mostrar(campo, 'erro', 'CPF inválido: confira os números.'); return; }
    mostrar(campo, '', '');
    conferirRepetido();
  }

  /** Barra (erro no campo CPF) quando já existe lançamento igual. */
  function conferirRepetido() {
    var campo = form.elements['cpf'];
    if (!campo || !window.LANCAMENTO_CAMPOS || !window.LANCAMENTO_CAMPOS.enviar) return;
    var d = soDigitos(campo.value);
    var tipo = form.elements['tipo_servico'] ? form.elements['tipo_servico'].value : '';
    var campoData = form.elements['data_vistoria'];
    var iso = campoData && window.DATA_BR ? window.DATA_BR.brParaIso(campoData.value) : '';
    if (d.length !== 11 || !cpfValido(d) || !tipo || !/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return;
    var chave = d + '|' + tipo + '|' + iso;
    var br = window.DATA_BR.isoParaBr(iso);
    var aplicar = function (repetido) {
      if (soDigitos(campo.value) !== d) return;
      if (repetido) mostrar(campo, 'erro', 'Já existe lançamento de ' + tipo + ' deste CPF em ' + br + '. Não é possível cadastrar de novo.');
      else if (campo._lancMeu && /^Já existe lançamento/.test(campo.validationMessage)) mostrar(campo, '', '');
    };
    if (chave in respostasDuplicado) { aplicar(respostasDuplicado[chave]); return; }
    var auth = window.ADMIN_AUTH, sessao = null;
    try { sessao = auth && auth.sessaoAtual && auth.sessaoAtual(); } catch (e) { /* sem sessão */ }
    if (!sessao || !sessao.access_token) return;
    var fd = new FormData();
    fd.append('acao', 'duplicado');
    fd.append('token', sessao.access_token);
    fd.append('cpf', window.LANCAMENTO_CAMPOS.formatarCpf(d));
    fd.append('tipo_servico', tipo);
    fd.append('data_vistoria', iso);
    if (EDITANDO) fd.append('id', idDaUrl());
    window.LANCAMENTO_CAMPOS.enviar(fd).then(function (res) {
      if (!res.corpo || !res.corpo.ok) return;   // sem resposta: o servidor barra ao salvar
      var repetido = !!(res.corpo.itens && res.corpo.itens.length);
      respostasDuplicado[chave] = repetido;
      aplicar(repetido);
    }, function () { /* sem conexão: o servidor confere ao salvar */ });
  }

  function verificarNome(campo, aoSair) {
    var v = campo.value.trim().replace(/\s+/g, ' ');
    if (!v || !aoSair) { if (!v) mostrar(campo, '', ''); return; }
    var palavras = v.split(' ').filter(function (p) { return p.length > 0; });
    if (palavras.length < 2) mostrar(campo, 'erro', 'Informe o nome completo (nome e sobrenome).');
    else if (/\d/.test(v)) mostrar(campo, 'erro', 'O nome não deve ter números.');
    else mostrar(campo, '', '');
  }

  function verificarNascimento(campo) {
    if (deOutro(campo)) return;
    var v = campo.value.trim();
    if (!v) { mostrar(campo, '', ''); return; }
    var iso = window.DATA_BR ? window.DATA_BR.brParaIso(v) : v;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) { mostrar(campo, '', ''); return; }
    var hoje = new Date();
    var idade = hoje.getFullYear() - +m[1] - ((hoje.getMonth() + 1 < +m[2] || (hoje.getMonth() + 1 === +m[2] && hoje.getDate() < +m[3])) ? 1 : 0);
    if (idade < 16 || idade > 110) mostrar(campo, 'erro', 'Confira a data de nascimento (resulta em ' + idade + ' anos).');
    else mostrar(campo, '', '');
  }

  function verificarTelefone(campo, aoSair) {
    var d = soDigitos(campo.value);
    if (!d) { mostrar(campo, '', ''); return; }
    if (!aoSair && d.length < 10) return;
    if (d.length < 10 || d.length > 11) mostrar(campo, 'erro', 'Telefone deve ter DDD + número (10 ou 11 dígitos).');
    else mostrar(campo, '', '');
  }

  function verificarGeo(campo) {
    var v = campo.value.trim();
    if (!v) { mostrar(campo, '', ''); return; }
    var n = num(v);
    var x = campo.name === 'geo_x';
    var ok = !isNaN(n) && (x ? (n >= 100000 && n <= 999999.99) : (n >= 8000000 && n <= 10100000));
    if (ok) mostrar(campo, '', '');
    else mostrar(campo, 'aviso', x
      ? 'X costuma ter 6 dígitos (ex.: 612345). Confira.'
      : 'Y costuma ter 7 dígitos, começando por 8 ou 9 (ex.: 8765432). Confira.');
  }

  function verificarNumeroGrande(campo, limite, rotulo) {
    var n = num(campo.value);
    if (!isNaN(n) && n > limite) mostrar(campo, 'aviso', rotulo + ' acima de ' + limite + ' — confira se não é erro de digitação.');
    else mostrar(campo, '', '');
  }

  /* área das culturas: o aviso fica numa linha só, abaixo da lista */
  function avisoAreas() {
    var lista = document.getElementById('lancCulturas');
    if (!lista) return;
    var p = document.getElementById('lancAreaAviso');
    if (!p) {
      p = document.createElement('p');
      p.id = 'lancAreaAviso';
      p.className = 'lanc-msg lanc-msg-aviso';
      p.hidden = true;
      lista.parentNode.insertBefore(p, lista.nextSibling);
    }
    var grandes = Array.prototype.filter.call(lista.querySelectorAll('.lc-area'), function (i) { return num(i.value) > 200; });
    Array.prototype.forEach.call(lista.querySelectorAll('.lc-area'), function (i) { i.classList.toggle('lanc-campo-aviso', grandes.indexOf(i) >= 0); });
    p.textContent = 'Há área acima de 200 ha — confira se não é erro de digitação.';
    p.hidden = !grandes.length;
  }

  /* --------------------------------------------------------------- eventos */
  function rodar(e, aoSair) {
    var c = e.target;
    if (!c || !c.classList) return;
    switch (c.name) {
      case 'cpf': verificarCpf(c, aoSair); break;
      case 'nome_beneficiario': verificarNome(c, aoSair); break;
      case 'data_nascimento': setTimeout(function () { verificarNascimento(c); }, 0); break;
      case 'telefone': verificarTelefone(c, aoSair); break;
      case 'tipo_servico': conferirRepetido(); break;
      case 'data_vistoria': setTimeout(conferirRepetido, 0); break;
      case 'geo_x': case 'geo_y': if (aoSair) verificarGeo(c); break;
      case 'quantidade_acudes': verificarNumeroGrande(c, 30, 'Quantidade'); break;
      case 'horas_maquina': verificarNumeroGrande(c, 300, 'Horas'); break;
      default:
        if (c.classList && c.classList.contains('lc-area')) avisoAreas();
    }
  }
  form.addEventListener('input', function (e) { rodar(e, false); marcarSujo(); });
  form.addEventListener('change', function (e) { rodar(e, true); marcarSujo(); });
  form.addEventListener('focusout', function (e) { rodar(e, true); });

  /* na hora de salvar, confere tudo de uma vez (o autopreenchimento do
     navegador pode ter pulado os eventos acima) */
  form.addEventListener('submit', function () {
    ['cpf', 'nome_beneficiario', 'data_nascimento', 'telefone'].forEach(function (n) {
      var c = form.elements[n];
      if (c) rodar({ target: c }, true);
    });
  }, true);

  form.addEventListener('reset', function () {
    respostasDuplicado = {};
    sujo = false;
    setTimeout(function () {
      Array.prototype.forEach.call(form.querySelectorAll('.lanc-msg'), function (m) { m.hidden = true; m.textContent = ''; });
      Array.prototype.forEach.call(form.querySelectorAll('.lanc-campo-erro,.lanc-campo-aviso'), function (c) {
        c.classList.remove('lanc-campo-erro', 'lanc-campo-aviso');
        if (c.setCustomValidity && c._lancMeu) { c.setCustomValidity(''); c._lancMeu = false; }
      });
    }, 0);
  });

  /* ------------------------------------------- sair com ficha não salva */
  var sujo = false;
  function marcarSujo() { sujo = true; }
  if (!EDITANDO) {
    window.addEventListener('beforeunload', function (e) {
      if (!sujo) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }
})();
