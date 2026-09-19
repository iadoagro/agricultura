/* Tela pública "Abrir chamado".
   Campos: nome; setor, departamento e diretoria (basta um dos três: um setor, um
   departamento ou uma diretoria também podem abrir chamado),
   problema (quadradinhos) e descrição. Setor, departamento e diretoria vêm dos
   cadastros auxiliares e se ajudam: escolher o setor preenche o departamento e
   a diretoria a que ele pertence; escolher departamento/diretoria filtra as
   listas de baixo. Se um nível ainda não tem nada cadastrado, o campo vira
   texto livre — o formulário nunca trava por falta de cadastro.
   Não há código para o usuário: ao enviar ele vai para a lista de
   acompanhamento (o código fica só como chave secreta neste navegador). */
(function () {
  'use strict';
  var C = window.CHAMADOS, U = window.CHUI, el = U.el, T = C.meta.tiposAux;
  var PERFIL = 'seagri_chamados_perfil';
  var form = document.getElementById('formChamado');
  var enviar = document.getElementById('enviar');
  var enviando = false;
  var aux = { problema: [], diretoria: [], departamento: [], setor: [] };
  var sel = { setor: '', departamento: '', diretoria: '' };      // ids escolhidos
  var txt = { setor: '', departamento: '', diretoria: '' };      // texto livre (níveis sem cadastro)
  var perfil = {};

  document.getElementById('marcaIcone').appendChild(U.icone('suporte'));
  if (C.modo === 'local') document.getElementById('faixaDemo').hidden = false;

  try { perfil = JSON.parse(localStorage.getItem(PERFIL) || 'null') || {}; } catch (e) { perfil = {}; }
  if (perfil.nome) form.elements.nome.value = perfil.nome;

  /* ------------------------------------------------ setor > departamento > diretoria */
  var ORDEM = ['setor', 'departamento', 'diretoria'];             // ordem na tela
  var porId = function (tipo, id) { return id ? aux[tipo].filter(function (i) { return i.id === id; })[0] : null; };
  var temLista = function (tipo) { return aux[tipo].length > 0; };

  function opcoes(tipo) {
    var l = aux[tipo];
    if (tipo === 'setor') {
      if (sel.departamento) return l.filter(function (x) { return x.pai_id === sel.departamento; });
      if (sel.diretoria) {
        var deps = aux.departamento.filter(function (d) { return d.pai_id === sel.diretoria; }).map(function (d) { return d.id; });
        return l.filter(function (x) { return deps.indexOf(x.pai_id) >= 0; });
      }
    }
    if (tipo === 'departamento' && sel.diretoria) return l.filter(function (x) { return x.pai_id === sel.diretoria; });
    return l;
  }
  // sem o nível de cima escolhido, mostra a quem pertence para diferenciar nomes iguais
  function rotulo(tipo, i) {
    var pai = tipo === 'setor' && !sel.departamento ? porId('departamento', i.pai_id)
      : tipo === 'departamento' && !sel.diretoria ? porId('diretoria', i.pai_id) : null;
    return pai ? i.nome + ' — ' + pai.nome : i.nome;
  }

  /* Quem define (e trava) o campo: escolher o setor preenche e trava departamento e
     diretoria; escolher o departamento preenche e trava a diretoria. Para mudar,
     é preciso limpar o nível de baixo (Selecione…). */
  function travadoPor(tipo) {
    var st = porId('setor', sel.setor), dp = porId('departamento', sel.departamento);
    if (tipo === 'departamento') return st && dp && st.pai_id === dp.id ? 'setor' : '';
    if (tipo === 'diretoria') {
      if (!dp || !sel.diretoria || dp.pai_id !== sel.diretoria) return '';
      return st && st.pai_id === dp.id ? 'setor' : 'departamento';
    }
    return '';
  }

  function repovoar(tipo) {
    var s = document.getElementById('f-' + tipo);
    if (!s || s.tagName !== 'SELECT') return;
    var ops = opcoes(tipo);
    if (sel[tipo] && !ops.some(function (i) { return i.id === sel[tipo]; })) sel[tipo] = '';
    s.replaceChildren.apply(s, [el('option', { value: '', text: 'Selecione…' })]
      .concat(ops.map(function (i) { return el('option', { value: i.id, selected: sel[tipo] === i.id ? true : null, text: rotulo(tipo, i) }); })));
    s.value = sel[tipo];
    var por = travadoPor(tipo), nota = document.getElementById('trava-' + tipo);
    s.disabled = Boolean(por);
    if (nota) {
      nota.replaceChildren();
      if (por) nota.append(U.icone('cadeado', 12), document.createTextNode(' definido ' + (por === 'setor' ? 'pelo setor' : 'pelo departamento')));
    }
  }
  function repovoarTodos() { ORDEM.forEach(repovoar); }

  function definir(tipo, id) {           // só o estado; quem chama repovoa as listas
    sel[tipo] = id;
    if (id && tipo === 'setor') {
      var st = porId('setor', id), dep = st && porId('departamento', st.pai_id);
      if (dep) { sel.departamento = dep.id; if (dep.pai_id && porId('diretoria', dep.pai_id)) sel.diretoria = dep.pai_id; }
    } else if (id && tipo === 'departamento') {
      var d = porId('departamento', id);
      if (d && d.pai_id && porId('diretoria', d.pai_id)) sel.diretoria = d.pai_id;
      var s2 = porId('setor', sel.setor);
      if (s2 && s2.pai_id !== id) sel.setor = '';
    } else if (id && tipo === 'diretoria') {
      var d2 = porId('departamento', sel.departamento);
      if (d2 && d2.pai_id !== id) sel.departamento = '';
      var s3 = porId('setor', sel.setor), dd = s3 && porId('departamento', s3.pai_id);
      if (s3 && (!dd || dd.pai_id !== id)) sel.setor = '';
    }
  }
  function aoEscolher(tipo, id) { definir(tipo, id); repovoarTodos(); }

  function construirCampo(tipo) {
    var box = document.getElementById('campo-' + tipo), nomeT = T[tipo].rot;
    var alvo = form.querySelector('[data-campo="' + tipo + '"]');
    alvo.classList.remove('erro'); alvo.querySelector('.ch-erro-msg').textContent = '';
    var rot = function () { return el('label', { for: 'f-' + tipo }, [nomeT, ' ', el('small', { id: 'trava-' + tipo, class: 'ch-trava' })]); };
    if (temLista(tipo)) {
      var s = el('select', { id: 'f-' + tipo });
      s.addEventListener('change', function () { erroCampo(tipo, ''); aoEscolher(tipo, s.value); });
      box.replaceChildren(rot(), s);
      repovoar(tipo);
    } else {
      var inp = el('input', { id: 'f-' + tipo, type: 'text', maxlength: '120', value: txt[tipo] || '', placeholder: tipo === 'setor' ? 'Ex.: Financeiro' : '' });
      inp.addEventListener('input', function () { txt[tipo] = inp.value; erroCampo(tipo, ''); });
      box.replaceChildren(rot(), inp);
    }
  }
  function construirOrg() { ORDEM.forEach(construirCampo); }

  /* ------------------------------------------------ problemas em quadradinhos */
  /* Todos juntos, sem cabeçalho de categoria. Mostra os 6 primeiros; o quadrado
     "Mostrar mais" revela o resto e o quadrado "Outro" cobre o que não está na lista. */
  var VISIVEIS = 6, expandido = false;
  function tile(valor, nome, cat) {
    return el('label', { class: 'ch-prob' }, [
      el('input', { type: 'radio', name: 'problema', value: valor }),
      el('span', { class: 'ch-prob-caixa' }, [U.icone(cat), el('b', { text: nome })])
    ]);
  }
  function itensProblema() {
    if (!aux.problema.length) {   // sem cadastro (ou banco indisponível): categorias gerais
      return Object.keys(C.meta.categorias).filter(function (k) { return k !== 'outro'; })
        .map(function (cat) { return { valor: 'cat:' + cat, nome: C.meta.categorias[cat].rot, cat: cat }; });
    }
    var ordemCat = Object.keys(C.meta.categorias);
    return aux.problema
      .filter(function (p) { return !(p.categoria === 'outro' && /^outro/i.test(p.nome)); })   // o quadrado "Outro" já cobre
      .sort(function (a, b) { return ordemCat.indexOf(a.categoria) - ordemCat.indexOf(b.categoria) || a.nome.localeCompare(b.nome, 'pt-BR'); })
      .map(function (p) { return { valor: p.id, nome: p.nome, cat: p.categoria }; });
  }
  function desenharProblemas() {
    var box = document.getElementById('problemas');
    var marcado = (form.querySelector('input[name="problema"]:checked') || {}).value;
    var todos = itensProblema();
    var mostrar = expandido ? todos : todos.filter(function (i, n) { return n < VISIVEIS || i.valor === marcado; });
    var escondidos = todos.length - mostrar.length;
    var filhos = mostrar.map(function (i) { return tile(i.valor, i.nome, i.cat); });
    if (todos.length > VISIVEIS && (escondidos > 0 || expandido)) {
      var mais = el('button', { type: 'button', class: 'ch-prob-caixa ch-prob-mais', 'aria-expanded': expandido ? 'true' : 'false' },
        [el('span', { class: 'ch-prob-mais-sinal', text: expandido ? '−' : '+' }), el('b', { text: expandido ? 'Mostrar menos' : 'Mostrar mais (' + escondidos + ')' })]);
      mais.addEventListener('click', function () { expandido = !expandido; desenharProblemas(); });
      filhos.push(el('div', { class: 'ch-prob' }, mais));
    }
    filhos.push(tile('outro', 'Outro (não está na lista)', 'outro'));
    box.classList.toggle('expandido', expandido);
    box.replaceChildren(el('div', { class: 'ch-probs' }, filhos));
    if (marcado) { var r = box.querySelector('input[value="' + marcado + '"]'); if (r) r.checked = true; }
  }
  document.getElementById('problemas').addEventListener('change', function () { erroCampo('problema', ''); });

  function carregarCadastros() {
    return C.cadastros(false).then(function (lista) {
      Object.keys(aux).forEach(function (k) { aux[k] = []; });
      lista.forEach(function (i) { if (aux[i.tipo]) aux[i.tipo].push(i); });
      Object.keys(aux).forEach(function (k) { aux[k].sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }); });
    }, function (e) {
      U.aviso('Não consegui carregar as listas (' + e.message + ') O formulário continua funcionando com campos livres.', 'erro');
    }).then(function () {
      desenharProblemas();
      // lembra a última escolha desta pessoa (só se o item ainda existe)
      if (perfil.setorId && porId('setor', perfil.setorId)) definir('setor', perfil.setorId);
      else if (perfil.departamentoId && porId('departamento', perfil.departamentoId)) definir('departamento', perfil.departamentoId);
      else if (perfil.diretoriaId && porId('diretoria', perfil.diretoriaId)) sel.diretoria = perfil.diretoriaId;
      ORDEM.forEach(function (k) { if (perfil[k + 'Txt']) txt[k] = perfil[k + 'Txt']; });
      construirOrg();
    });
  }

  /* ------------------------------------------------------------- formulário */
  var descricao = document.getElementById('descricao'), contador = document.getElementById('contador');
  descricao.addEventListener('input', function () { contador.textContent = descricao.value.length + ' / 4000'; });

  function erroCampo(nome, msg) {
    var campo = form.querySelector('[data-campo="' + nome + '"]');
    if (!campo) return;
    campo.classList.toggle('erro', Boolean(msg));
    campo.querySelector('.ch-erro-msg').textContent = msg || '';
  }
  Array.prototype.forEach.call(form.querySelectorAll('[data-campo] input,[data-campo] textarea'), function (i) {
    i.addEventListener('input', function () { erroCampo(i.name, ''); });
  });

  function ler() {
    var f = form.elements, v = function (n) { return (f[n].value || '').trim(); };
    var d = {
      nome: v('nome'),
      prioridade: (form.querySelector('input[name="prioridade"]:checked') || {}).value || 'media',
      descricao: v('descricao')
    };
    ORDEM.forEach(function (tipo) {
      if (temLista(tipo)) { var it = porId(tipo, sel[tipo]); d[tipo + '_id'] = it ? it.id : null; d[tipo] = it ? it.nome : ''; }
      else d[tipo] = (txt[tipo] || '').trim();
    });
    var pv = (form.querySelector('input[name="problema"]:checked') || {}).value || '';
    if (pv === 'outro') { d.categoria = 'outro'; d.problema = 'Outro problema'; }
    else if (pv.indexOf('cat:') === 0) { d.categoria = pv.slice(4); d.problema = C.meta.categorias[d.categoria].rot; }
    else if (pv) {
      var p = porId('problema', pv);
      d.problema_id = pv; d.problema = p ? p.nome : ''; d.categoria = p ? p.categoria : 'outro';
    }
    d._problemaEscolhido = Boolean(pv);
    // O assunto não é um campo: é o nome do problema escolhido (ou o começo da descrição, no "Outro").
    var resumo = function (t) {
      t = (t || '').replace(/\s+/g, ' ').trim();
      if (t.length <= 60) return t;
      var c = t.slice(0, 60), i = c.lastIndexOf(' ');
      return (i > 30 ? c.slice(0, i) : c) + '…';
    };
    d.assunto = d.problema === 'Outro problema' ? (resumo(d.descricao) || 'Outro problema') : (d.problema || resumo(d.descricao) || 'Solicitação de suporte');
    return d;
  }

  function validar(d) {
    var primeiro = null, marcar = function (nome, msg, alvo) { erroCampo(nome, msg); if (!primeiro) primeiro = alvo || form.querySelector('[data-campo="' + nome + '"]'); };
    ['nome', 'descricao', 'problema', 'setor'].forEach(function (n) { erroCampo(n, ''); });
    if (d.nome.length < 2) marcar('nome', 'Informe seu nome.');
    if (!d.setor && !d.departamento && !d.diretoria) marcar('setor', 'Selecione o seu setor, departamento ou diretoria.');
    if (!d._problemaEscolhido) marcar('problema', 'Escolha o problema.');
    if (d.descricao.length < 10) marcar('descricao', 'Conte um pouco mais do problema (mínimo 10 caracteres).');
    if (primeiro) {
      var alvo = primeiro.closest ? (primeiro.closest('[data-campo]') || primeiro) : primeiro;
      alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var foco = alvo.querySelector('select:not([disabled]),input:not([disabled]),textarea');
      if (foco) foco.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  function guardarPerfil(d) {
    try {
      localStorage.setItem(PERFIL, JSON.stringify({
        nome: d.nome, setorId: sel.setor, departamentoId: sel.departamento, diretoriaId: sel.diretoria,
        setorTxt: txt.setor, departamentoTxt: txt.departamento, diretoriaTxt: txt.diretoria
      }));
    } catch (e) {}
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando) return;
    if (document.getElementById('site').value) return;          // robô preencheu a armadilha
    var d = ler();
    if (!validar(d)) return;
    enviando = true;
    enviar.disabled = true;
    enviar.textContent = 'Enviando…';
    C.abrir(d).then(function (r) {
      C.lembrar(r.codigo, d.assunto, r.numero);                // chave secreta só neste navegador
      guardarPerfil(d);
      var link = document.querySelector('.ch-topo nav a[href*="acomp"]');
      location.href = (link ? link.getAttribute('href') : 'acompanhar-chamado.html') + '?novo=' + encodeURIComponent(r.numero);
    }, function (err) {
      U.aviso(err.message || 'Não foi possível enviar o chamado.', 'erro');
      enviando = false; enviar.disabled = false; enviar.textContent = 'Enviar chamado';
    });
  });

  construirOrg(); desenharProblemas();
  carregarCadastros();
})();
