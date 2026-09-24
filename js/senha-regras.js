/* Regras de senha do sistema (login, autocadastro e troca de senha). Duas
   formas aceitas:
     - senha normal: 8+ caracteres com letra maiúscula, minúscula, número e
       caractere especial;
     - PIN: exatamente 6 números, mas sem os fáceis de adivinhar (repetidos,
       sequências, padrões e os mais usados).
   As MESMAS regras estão no servidor, em supabase/functions/admin-usuarios
   (motivoSenhaFraca) — mudou aqui, muda lá.

   window.SENHA_REGRAS:
     avaliar(senha, modo) → { ok, tipo: 'pin'|'normal', itens: [{texto, ok}], erro }
       modo 'pin' ou 'senha' força o tipo; sem modo, 6 números = PIN.
     campos([input, …], { regras, modo }) → o campo de senha ganha o seletor
       Senha | PIN, o botão Mostrar e, no modo PIN, 6 quadrados que vão sendo
       preenchidos. regras: true mostra a lista de requisitos embaixo do
       primeiro campo, marcando o que já foi cumprido. Vários campos (senha e
       confirmação) dividem o mesmo seletor. Devolve { modo() }. */
(function () {
  'use strict';

  // PINs muito usados que as regras abaixo não pegam sozinhas
  var PINS_COMUNS = ['102030', '112233', '121314', '131313', '147258', '159753', '951753', '258369', '369258',
    '147369', '963852', '741852', '852963', '123321', '321123', '654456', '100200', '010203', '101010', '202020',
    '200000', '696969', '171717', '242424', '123654', '789456', '456789', '159357', '753951', '142536', '124578'];
  var CHAVE_MODO = 'seagri-modo-senha';   // último modo usado neste navegador (o login abre nele)

  function repeticaoSeguida(s, n) {   // mesmo dígito n vezes seguidas: 111...
    return new RegExp('(\\d)\\1{' + (n - 1) + '}').test(s);
  }
  function sequencia(s, n) {          // n dígitos em sequência: 1234, 9876
    for (var i = 0; i + n <= s.length; i++) {
      var sobe = true, desce = true;
      for (var j = i + 1; j < i + n; j++) {
        if (+s[j] !== +s[j - 1] + 1) sobe = false;
        if (+s[j] !== +s[j - 1] - 1) desce = false;
      }
      if (sobe || desce) return true;
    }
    return false;
  }
  function blocoRepetido(s) {         // 121212, 123123, 112112
    return s.slice(0, 2).repeat(3) === s || s.slice(0, 3).repeat(2) === s;
  }
  function distintos(s) { return new Set(s.split('')).size; }

  function avaliar(senha, modo) {
    senha = String(senha || '');
    var pin = modo ? modo === 'pin' : /^\d+$/.test(senha);
    if (pin) {
      var seis = /^\d{6}$/.test(senha);
      return resultado('pin', [
        { texto: 'Exatamente 6 números', ok: seis },
        { texto: 'Pelo menos 4 números diferentes', ok: seis && distintos(senha) >= 4 },
        { texto: 'Sem o mesmo número 3 vezes seguidas (ex.: 111)', ok: seis && !repeticaoSeguida(senha, 3) },
        { texto: 'Sem sequência de 4 números (ex.: 1234, 9876)', ok: seis && !sequencia(senha, 4) },
        { texto: 'Sem padrão repetido (ex.: 121212, 123123)', ok: seis && !blocoRepetido(senha) },
        { texto: 'Não pode ser um PIN comum (ex.: 102030, 147258)', ok: seis && PINS_COMUNS.indexOf(senha) < 0 }
      ]);
    }
    return resultado('normal', [
      { texto: 'Pelo menos 8 caracteres', ok: senha.length >= 8 },
      { texto: 'Uma letra maiúscula (A-Z)', ok: /[A-ZÀ-Ý]/.test(senha) },
      { texto: 'Uma letra minúscula (a-z)', ok: /[a-zß-ÿ]/.test(senha) },
      { texto: 'Um número (0-9)', ok: /\d/.test(senha) },
      { texto: 'Um caractere especial (ex.: ! @ # $ % * -)', ok: /[^A-Za-zÀ-ÿ0-9\s]/.test(senha) },
      { texto: 'Sem espaços', ok: senha.length > 0 && !/\s/.test(senha) }
    ]);
  }

  function resultado(tipo, itens) {
    var falta = itens.filter(function (i) { return !i.ok; });
    return {
      ok: !falta.length, tipo: tipo, itens: itens,
      erro: falta.length ? (tipo === 'pin' ? 'PIN fraco: ' : 'Senha fraca: ') + falta[0].texto.charAt(0).toLowerCase() + falta[0].texto.slice(1) + '.' : ''
    };
  }

  function lerModo() { try { return localStorage.getItem(CHAVE_MODO); } catch (e) { return null; } }
  function guardarModo(m) { try { localStorage.setItem(CHAVE_MODO, m); } catch (e) { /* modo privado */ } }

  /* ----------------------------------------------- campo Senha | PIN */
  function campos(inputs, op) {
    op = op || {};
    inputs = (inputs || []).filter(function (i) { return i && !i.dataset.senhaCampo; });   // já montado: não duplica
    if (!inputs.length) return null;
    inputs.forEach(function (i) { i.dataset.senhaCampo = '1'; });
    estilo();
    var modo = op.modo === 'pin' || op.modo === 'senha' ? op.modo : (lerModo() === 'pin' ? 'pin' : 'senha');
    var mostrar = false;

    // seletor Senha | PIN, antes do primeiro campo
    var seletor = document.createElement('div');
    seletor.className = 'senha-modo';
    seletor.setAttribute('role', 'group');
    seletor.setAttribute('aria-label', 'Tipo de senha');
    seletor.innerHTML = '<button type="button" data-modo="senha">Senha</button><button type="button" data-modo="pin">PIN de 6 números</button>';

    var montados = inputs.map(function (input) {
      // o login antigo tinha o próprio "Mostrar" num invólucro .login-password
      var antigo = input.parentElement.classList.contains('login-password') ? input.parentElement : null;
      var campo = document.createElement('div');
      campo.className = 'senha-campo';
      var area = document.createElement('div');
      area.className = 'senha-area';
      var caixas = document.createElement('div');
      caixas.className = 'senha-caixas';
      caixas.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < 6; k++) caixas.appendChild(document.createElement('span'));
      var botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'senha-mostrar';
      botao.setAttribute('aria-controls', input.id);
      (antigo || input).replaceWith(campo);
      area.append(caixas, input);
      campo.append(area, botao);
      input.removeAttribute('minlength');
      input.addEventListener('input', function () {
        if (modo === 'pin') {
          var so = input.value.replace(/\D/g, '').slice(0, 6);
          if (so !== input.value) input.value = so;
        }
        atualizar();
      });
      input.addEventListener('focus', function () { campo.classList.add('foco'); atualizar(); });
      input.addEventListener('blur', function () { campo.classList.remove('foco'); });
      botao.addEventListener('click', function () { mostrar = !mostrar; atualizar(); input.focus(); });
      return { input: input, campo: campo, caixas: caixas, botao: botao };
    });
    montados[0].campo.insertAdjacentElement('beforebegin', seletor);

    var lista = null;
    if (op.regras) {
      lista = document.createElement('div');
      lista.className = 'senha-regras';
      lista.id = inputs[0].id + 'Regras';
      lista.setAttribute('aria-live', 'polite');
      inputs[0].setAttribute('aria-describedby', lista.id);
      montados[0].campo.insertAdjacentElement('afterend', lista);
    }

    function atualizar() {
      var pin = modo === 'pin';
      seletor.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-modo') === modo));
      });
      montados.forEach(function (m) {
        var v = m.input.value;
        m.campo.classList.toggle('pin', pin);
        m.input.type = mostrar ? 'text' : 'password';
        if (pin) { m.input.setAttribute('inputmode', 'numeric'); m.input.maxLength = 6; }
        else { m.input.removeAttribute('inputmode'); m.input.removeAttribute('maxlength'); }
        m.input.placeholder = pin ? '' : (m.input.dataset.placeholder || m.input.placeholder);
        m.botao.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        m.botao.setAttribute('aria-pressed', String(mostrar));
        Array.prototype.forEach.call(m.caixas.children, function (c, i) {
          c.textContent = v[i] ? (mostrar ? v[i] : '•') : '';
          c.classList.toggle('cheia', Boolean(v[i]));
          c.classList.toggle('atual', i === Math.min(v.length, 5));
        });
      });
      if (lista) {
        var el = inputs[0], r = avaliar(el.value, modo);
        var titulo = !el.value
          ? (pin ? 'Escolha 6 números que não sejam fáceis de adivinhar.' : 'Pelo menos 8 caracteres, com maiúscula, minúscula, número e caractere especial.')
          : (pin ? 'PIN de 6 números' : 'Senha');
        lista.innerHTML = '<p>' + titulo + '</p>' + (el.value ? '<ul>' + r.itens.map(function (i) {
          return '<li class="' + (i.ok ? 'ok' : '') + '"><span aria-hidden="true">' + (i.ok ? '✓' : '•') + '</span>' + i.texto +
            '<span class="senha-regras-sr">' + (i.ok ? ' — cumprido' : ' — falta') + '</span></li>';
        }).join('') + '</ul>' + (r.ok ? '<p class="senha-regras-ok">' + (pin ? 'PIN aceito.' : 'Senha forte.') + '</p>' : '') : '');
        el.setCustomValidity(el.value && !r.ok ? r.erro : '');
      }
    }

    seletor.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-modo]');
      if (!b || b.getAttribute('data-modo') === modo) return;
      modo = b.getAttribute('data-modo');
      guardarModo(modo);
      montados.forEach(function (m) { m.input.value = ''; m.input.setCustomValidity(''); });
      atualizar();
      inputs[0].focus();
    });

    inputs.forEach(function (i) { i.dataset.placeholder = i.placeholder || ''; });
    atualizar();
    return { modo: function () { return modo; }, guardar: function () { guardarModo(modo); } };
  }

  // compatibilidade: só a lista de requisitos, sem o seletor
  function ligar(input) { return campos([input], { regras: true }); }

  var estiloPosto = false;
  function estilo() {
    if (estiloPosto) return;
    estiloPosto = true;
    var s = document.createElement('style');
    s.textContent =
      '.senha-modo{display:flex;gap:4px;margin:2px 0 8px;padding:3px;border:1px solid #dfe7f2;border-radius:10px;background:#f2f6fc}' +
      '.senha-modo button{flex:1;min-height:34px;border:0;border-radius:8px;background:none;color:#42536e;font:inherit;font-size:13px;font-weight:600;cursor:pointer}' +
      '.senha-modo button[aria-pressed="true"]{background:#fff;color:#153e75;box-shadow:0 1px 3px rgba(23,43,77,.15)}' +
      '.senha-campo{display:flex;align-items:center;gap:8px}' +
      '.senha-area{position:relative;flex:1;min-width:0}' +
      '.senha-area input{width:100%;box-sizing:border-box;margin:0}' +
      '.senha-caixas{display:none}' +
      '.senha-campo.pin .senha-caixas{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}' +
      '.senha-caixas span{display:grid;place-items:center;height:50px;border:1.5px solid #cbd8e9;border-radius:10px;background:#fff;color:#153e75;font-size:22px;font-weight:700;transition:border-color .15s,background .15s}' +
      '.senha-caixas span.cheia{border-color:#2563eb;background:#eef4ff}' +
      '.senha-campo.pin.foco .senha-caixas span.atual{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.2)}' +
      /* no PIN o campo de verdade fica por cima dos quadrados, invisível: recebe o toque/teclado */
      '.senha-campo.pin .senha-area input{position:absolute;inset:0;height:100%;opacity:0;cursor:pointer;caret-color:transparent;font-size:16px}' +
      '.senha-mostrar{flex:none;min-height:36px;padding:0 8px;border:0;border-radius:6px;background:none;color:#2563eb;font:inherit;font-size:13px;font-weight:600;cursor:pointer}' +
      '.senha-mostrar:hover{background:#eef4ff}' +
      '.senha-regras{margin:6px 0 10px;padding:8px 10px;border:1px solid #dfe7f2;border-radius:8px;background:#f7f9fc;font-size:12.5px;color:#42536e;text-align:left}' +
      '.senha-regras p{margin:0}' +
      '.senha-regras ul{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:2px}' +
      '.senha-regras li{display:flex;gap:6px;color:#8a4b00}' +
      '.senha-regras li span[aria-hidden]{width:12px;flex:none;text-align:center;font-weight:700}' +
      '.senha-regras li.ok{color:#1f7a4d}' +
      '.senha-regras .senha-regras-ok{margin-top:6px;font-weight:700;color:#1f7a4d}' +
      '.senha-regras-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';
    document.head.appendChild(s);
  }

  window.SENHA_REGRAS = { avaliar: avaliar, campos: campos, ligar: ligar, lerModo: lerModo, guardarModo: guardarModo };
})();
