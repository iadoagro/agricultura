/* Painel do DEAGRO — SEAGRI/AC
   Lê js/dados-deagro.js (gerado de DEAGRO.xlsx) e desenha com as primitivas de
   js/graficos.js, no mesmo vocabulário visual do painel da mecanização.

   A planilha do departamento é um caderno: cada divisão tem suas bases, com
   colunas próprias. O painel não tenta unificá-las numa tabela só — mantém cada
   "conjunto" separado e cruza o que é comum a todos (município, ano, nome).

   As ABAS seguem os programas, não a lista de divisões. Três programas —
   usina de nitrogênio, calcário e café — são 57% da base e ficavam espremidos
   dentro da aba da sua divisão; e a atividade técnica é a mesma planilha
   repetida em três divisões, então vira uma aba só, com recorte por divisão. */
(function () {
  'use strict';

  var D = window.DADOS_DEAGRO;
  var CHAVE_TIPOS = 'seagri_deagro_tipos';
  var POR_PAGINA = 50;

  function el(id) { return document.getElementById(id); }
  function num(v, d) { return G.num(v, d); }
  function esc(s) { return G.esc(s); }

  if (!D) {
    document.querySelector('.conteudo-abas').innerHTML =
      '<p class="vazio">Base do DEAGRO não carregada. Verifique js/dados-deagro.js.</p>';
    return;
  }

  /* ------------------------------------------------------------------ base */
  var IDS = Object.keys(D.conjuntos);
  IDS.forEach(function (cid) {
    var c = D.conjuntos[cid];
    c.id = cid;
    // que filtros fazem sentido nesta base: aplicar "ano" a uma base sem data
    // nenhuma (silos, cafeicultura) esvaziaria o painel sem explicar por quê
    c.temAno = c.linhas.some(function (l) { return l.ano; });
    c.temMun = c.linhas.some(function (l) { return l.mun; });
    c.temNome = c.linhas.some(function (l) { return l.nome; });
  });
  var NOME_DIV = {};
  D.divisoes.forEach(function (d) { NOME_DIV[d.id] = d.nome; });

  /* Onde cada programa e cada divisão são detalhados. Sustenta o clique nos
     gráficos "Registros por programa" e "Registros por divisão". */
  var ABA_DE_ASSUNTO = {
    'Usina de nitrogênio': 'usina', 'Calcário': 'calcario', 'Café': 'cafe',
    'Armazenagem': 'armazenagem', 'Atividade técnica': 'atividade',
    'Central de Incubação': 'incubacao', 'Projeto Galinha Caipira': 'incubacao',
    'Pecuária Eficiente': 'pecefic', 'Energia solar': 'pecefic',
    'Melhoramento genético': 'genetica', 'Cursos': 'cursos', 'Eventos': 'eventos'
  };
  var ABA_DE_DIVISAO = {
    agricultura: 'cafe', aquicultura: 'aquicultura', incubacao: 'incubacao',
    pecuaria: 'pecefic', capacitacao: 'cursos'
  };

  var REGIONAIS = [
    { nome: 'Alto Acre', muns: ['Assis Brasil', 'Brasiléia', 'Epitaciolândia', 'Xapuri'] },
    { nome: 'Baixo Acre', muns: ['Acrelândia', 'Bujari', 'Capixaba', 'Plácido de Castro',
      'Porto Acre', 'Rio Branco', 'Senador Guiomard'] },
    { nome: 'Purus', muns: ['Manoel Urbano', 'Santa Rosa do Purus', 'Sena Madureira'] },
    { nome: 'Tarauacá/Envira', muns: ['Feijó', 'Jordão', 'Tarauacá'] },
    { nome: 'Juruá', muns: ['Cruzeiro do Sul', 'Mâncio Lima', 'Marechal Thaumaturgo',
      'Porto Walter', 'Rodrigues Alves'] }
  ];
  var REG_DE = {};
  REGIONAIS.forEach(function (r) {
    r.muns.forEach(function (m) { REG_DE[m] = r.nome; });
  });
  function regionalDe(mun) { return REG_DE[mun] || ''; }

  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  var FAIXAS = ['Até 29 anos', '30 a 39', '40 a 49', '50 a 59', '60 ou mais'];
  function faixaEtaria(idade) {
    if (!idade) return '';
    if (idade < 30) return FAIXAS[0];
    if (idade < 40) return FAIXAS[1];
    if (idade < 50) return FAIXAS[2];
    if (idade < 60) return FAIXAS[3];
    return FAIXAS[4];
  }

  /* ---------------------------------------------------------------- filtros */
  var F = { ano: [], mun: [], reg: [], nome: '' };
  var CACHE = {};

  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** Linhas de uma base depois dos filtros. Um filtro só vale para a base que
      tem o campo — ano marcado não apaga a lista de silos, que não tem data. */
  function linhas(cid) {
    if (CACHE[cid]) return CACHE[cid];
    var c = D.conjuntos[cid];
    var busca = F.nome ? semAcento(F.nome) : '';
    var out = c.linhas.filter(function (l) {
      if (F.ano.length && c.temAno && F.ano.indexOf(l.ano) < 0) return false;
      if (F.mun.length && c.temMun && F.mun.indexOf(l.mun) < 0) return false;
      if (F.reg.length && c.temMun && F.reg.indexOf(regionalDe(l.mun)) < 0) return false;
      if (busca && c.temNome && semAcento(l.nome).indexOf(busca) < 0) return false;
      return true;
    });
    CACHE[cid] = out;
    return out;
  }

  /** Linhas de várias bases numa lista só, cada uma marcada com a base de
      origem — usado onde o painel cruza planilhas diferentes. */
  function juntar(cids) {
    var out = [];
    cids.forEach(function (cid) {
      linhas(cid).forEach(function (l) { out.push({ l: l, c: D.conjuntos[cid] }); });
    });
    return out;
  }

  /** Concatena as linhas de várias bases acrescentando campos fixos a cada
      uma (a divisão de origem, por exemplo). */
  function mesclar(pares) {
    var out = [];
    pares.forEach(function (p) {
      linhas(p[0]).forEach(function (l) {
        var novo = {};
        Object.keys(l).forEach(function (k) { novo[k] = l[k]; });
        Object.keys(p[1] || {}).forEach(function (k) { novo[k] = p[1][k]; });
        out.push(novo);
      });
    });
    return out;
  }

  /* -------------------------------------------------------------- agregação */
  function ordenar(mapa) {
    return Object.keys(mapa).map(function (k) { return { rot: k, val: mapa[k] }; })
      .sort(function (a, b) { return b.val - a.val || a.rot.localeCompare(b.rot, 'pt-BR'); });
  }

  /** Conta linhas por campo (campoVal nulo) ou soma o campo indicado. */
  function agregar(rows, campoChave, campoVal) {
    var m = {};
    rows.forEach(function (l) {
      var k = typeof campoChave === 'function' ? campoChave(l) : l[campoChave];
      if (!k) return;
      var v = campoVal ? (l[campoVal] || 0) : 1;
      if (campoVal && !v) return;
      m[k] = (m[k] || 0) + v;
    });
    return ordenar(m);
  }

  /** Igual a agregar, mas mantém a ordem dada — para categorias que têm ordem
      própria (faixa etária, etapas de um funil), onde ordenar por valor
      embaralharia a leitura. */
  function agregarNaOrdem(rows, campoChave, ordem) {
    var m = {};
    rows.forEach(function (l) {
      var k = typeof campoChave === 'function' ? campoChave(l) : l[campoChave];
      if (k) m[k] = (m[k] || 0) + 1;
    });
    return ordem.filter(function (k) { return m[k]; })
      .map(function (k) { return { rot: k, val: m[k] }; });
  }

  /** Acima de `n` categorias a paleta recicla cor: o resto vira "Outros". */
  function topN(dados, n) {
    if (dados.length <= n) return dados;
    var resto = dados.slice(n - 1).reduce(function (a, d) { return a + d.val; }, 0);
    return dados.slice(0, n - 1).concat([{ rot: 'Outros', val: resto }]);
  }

  function soma(rows, campo) {
    return rows.reduce(function (a, l) { return a + (l[campo] || 0); }, 0);
  }

  function distintos(rows, campo) {
    var m = {};
    rows.forEach(function (l) { if (l[campo]) m[semAcento(l[campo])] = true; });
    return Object.keys(m).length;
  }

  /** Série anual contínua: anos sem lançamento entram como zero, senão a linha
      pularia de 2013 para 2020 como se fossem períodos vizinhos. */
  function serieAnos(rows, campoVal) {
    var m = {};
    rows.forEach(function (l) {
      if (!l.ano) return;
      var v = campoVal ? (l[campoVal] || 0) : 1;
      m[l.ano] = (m[l.ano] || 0) + v;
    });
    var anos = Object.keys(m).sort();
    if (!anos.length) return { rotulos: [], valores: [] };
    var rotulos = [], valores = [];
    for (var a = +anos[0]; a <= +anos[anos.length - 1]; a++) {
      rotulos.push(String(a));
      valores.push(m[String(a)] || 0);
    }
    return { rotulos: rotulos, valores: valores };
  }

  /** Série de 12 meses, somando todos os anos do recorte. */
  function serieMeses(rows, campoVal) {
    var m = {};
    rows.forEach(function (l) {
      if (!l.data) return;
      var k = +l.data.slice(5, 7);
      m[k] = (m[k] || 0) + (campoVal ? (l[campoVal] || 0) : 1);
    });
    var rotulos = [], valores = [];
    for (var i = 1; i <= 12; i++) { rotulos.push(MESES[i - 1]); valores.push(m[i] || 0); }
    return { rotulos: rotulos, valores: valores };
  }

  /** Contagem de visitas por técnico: a equipe vem como lista na linha. */
  function porTecnico(rows) {
    var m = {};
    rows.forEach(function (l) {
      (l.equipe || []).forEach(function (t) { m[t] = (m[t] || 0) + 1; });
    });
    return ordenar(m);
  }

  /* ------------------------------------------------------------------ tema */
  function tema() { return document.documentElement.getAttribute('data-tema') || 'claro'; }
  function pintarBotaoTema() {
    var escuro = tema() === 'escuro';
    el('temaBtn').innerHTML = (escuro
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>') +
      '<span>' + (escuro ? 'Tema claro' : 'Tema escuro') + '</span>';
  }
  function trocarTema() {
    var novo = tema() === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.setAttribute('data-tema', novo);
    try { localStorage.setItem('seagri_tema', novo); } catch (e) { /* modo privado */ }
    pintarBotaoTema();
    atualizar();  // as cores das séries vêm do CSS: todo desenho ficou velho
  }

  /* ------------------------------------------------- caixas de marcação */
  var MULTI = {}, BUSCA = {};

  function abrirMulti(id, on) {
    var caixa = el(id);
    if (!caixa) return;
    var btn = caixa.querySelector('.multi-btn'), lista = caixa.querySelector('.multi-lista');
    caixa.setAttribute('data-aberto', on ? '1' : '0');
    if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (lista) lista.hidden = !on;
  }
  function fecharMultis(exceto) {
    Object.keys(MULTI).forEach(function (id) { if (id !== exceto) abrirMulti(id, false); });
  }
  function filtrarItens(id) {
    var caixa = el(id), termo = semAcento(BUSCA[id] || ''), achou = 0;
    if (!caixa) return;
    caixa.querySelectorAll('.multi-item').forEach(function (it) {
      var casa = !termo || semAcento(it.textContent).indexOf(termo) >= 0;
      it.hidden = !casa;
      if (casa) achou++;
    });
    var sem = caixa.querySelector('.multi-sem');
    if (sem) sem.hidden = !!achou;
  }
  function resumoMulti(cfg) {
    if (!cfg.sel.length) return cfg.vazio;
    if (cfg.sel.length === 1) return cfg.sel[0];
    return cfg.sel.length + ' ' + cfg.plural;
  }
  function desenharMulti(id) {
    var cfg = MULTI[id], caixa = el(id);
    if (!cfg || !caixa) return;
    var aberto = caixa.getAttribute('data-aberto') === '1';
    var busca = cfg.itens.length > 12;
    caixa.innerHTML =
      '<button type="button" class="multi-btn" aria-haspopup="true" aria-expanded="' +
        (aberto ? 'true' : 'false') + '" aria-labelledby="' + cfg.rotulo + ' ' + id + 'Txt">' +
        '<span class="multi-txt" id="' + id + 'Txt">' + esc(resumoMulti(cfg)) + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="multi-lista"' + (aberto ? '' : ' hidden') + '>' +
        (busca ? '<input type="search" class="multi-busca" autocomplete="off"' +
          ' placeholder="Buscar&hellip;" aria-label="Buscar nas opções" value="' +
          esc(BUSCA[id] || '') + '">' : '') +
        cfg.itens.map(function (i) {
          return '<label class="multi-item"><input type="checkbox" value="' + esc(i) + '"' +
            (cfg.sel.indexOf(i) >= 0 ? ' checked' : '') + '>' + esc(i) + '</label>';
        }).join('') +
        (busca ? '<p class="multi-sem" hidden>Nada encontrado</p>' : '') +
        '<button type="button" class="btn multi-limpar"' + (cfg.sel.length ? '' : ' hidden') + '>' +
        esc(cfg.vazio) + '</button>' +
      '</div>';
    if (busca) filtrarItens(id);
  }
  function ligarMulti(id) {
    var caixa = el(id);
    if (!caixa || caixa.getAttribute('data-ligado') === '1') return;
    caixa.setAttribute('data-ligado', '1');
    caixa.addEventListener('click', function (e) {
      if (e.target.closest('.multi-btn')) {
        var abrindo = caixa.getAttribute('data-aberto') !== '1';
        fecharMultis(id);
        abrirMulti(id, abrindo);
        if (abrindo) {
          BUSCA[id] = '';
          var cb = caixa.querySelector('.multi-busca');
          if (cb) { cb.value = ''; filtrarItens(id); cb.focus(); }
        }
        return;
      }
      if (e.target.closest('.multi-limpar')) {
        MULTI[id].sel = [];
        MULTI[id].aoMudar([]);
      }
    });
    caixa.addEventListener('input', function (e) {
      if (!e.target.classList.contains('multi-busca')) return;
      BUSCA[id] = e.target.value;
      filtrarItens(id);
    });
    caixa.addEventListener('change', function (e) {
      var cx = e.target;
      if (!cx || cx.type !== 'checkbox') return;
      var cfg = MULTI[id], marcados = {};
      cfg.sel.forEach(function (v) { marcados[v] = true; });
      if (cx.checked) marcados[cx.value] = true; else delete marcados[cx.value];
      cfg.sel = cfg.itens.filter(function (v) { return marcados[v]; });
      cfg.aoMudar(cfg.sel.slice());
    });
    caixa.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      abrirMulti(id, false);
      var btn = caixa.querySelector('.multi-btn');
      if (btn) btn.focus();
    });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.multi')) fecharMultis(null);
  });

  function montarFiltros() {
    // o município herda a lista da regional marcada: marcar "Juruá" e um
    // município do Alto Acre ao mesmo tempo zeraria o painel
    var muns = D.municipios.filter(function (m) {
      return !F.reg.length || F.reg.indexOf(regionalDe(m)) >= 0;
    });

    MULTI.fAno = { itens: D.anos.slice().reverse(), sel: F.ano.slice(), vazio: 'Todos os anos',
      plural: 'anos', rotulo: 'rotAno',
      aoMudar: function (sel) { F.ano = sel; aplicar(); } };
    MULTI.fReg = { itens: REGIONAIS.map(function (r) { return r.nome; }), sel: F.reg.slice(),
      vazio: 'Todas as regionais', plural: 'regionais', rotulo: 'rotReg',
      aoMudar: function (sel) { F.reg = sel; F.mun = []; aplicar(); } };
    MULTI.fMun = { itens: muns, sel: F.mun.slice(), vazio: 'Todos os municípios',
      plural: 'municípios', rotulo: 'rotMun',
      aoMudar: function (sel) { F.mun = sel; aplicar(); } };

    ['fAno', 'fReg', 'fMun'].forEach(function (id) { ligarMulti(id); desenharMulti(id); });
  }

  function aplicar() {
    CACHE = {};
    pag = 1;
    montarFiltros();
    gravarUrl(false);
    atualizar();
  }

  function limpar() {
    F = { ano: [], mun: [], reg: [], nome: '' };
    el('buscaNome').value = '';
    aplicar();
  }

  /* ------------------------------------------------------------------ KPIs */
  function cartao(i) {
    return '<div class="kpi ' + (i.cls || '') + '">' +
      '<div class="kpi-rot">' + esc(i.rot) + '</div>' +
      '<div class="kpi-val">' + i.val + (i.un ? '<span class="kpi-un">' + esc(i.un) + '</span>' : '') + '</div>' +
      (i.sub ? '<div class="kpi-sub">' + esc(i.sub) + '</div>' : '') + '</div>';
  }
  /** grupos: [{sec, cards:[...]}] — cada seção vira uma faixa rotulada. */
  function tiles(alvo, grupos) {
    var box = el(alvo);
    if (!box) return;
    box.innerHTML = grupos.map(function (g) {
      var cards = g.cards.filter(Boolean);
      if (!cards.length) return '';
      return '<div class="kpis-grupo">' +
        (g.sec ? '<div class="kpis-sec"><span>' + esc(g.sec) + '</span></div>' : '') +
        '<div class="kpis-linha">' + cards.map(cartao).join('') + '</div></div>';
    }).join('');
  }

  /* -------------------------------------- registro de painéis e tipos */
  var TIPOS = {}, CARGA = {};
  var ROTULO_TIPO = {
    barras: 'Barras', colunas: 'Colunas', rosca: 'Rosca', pizza: 'Pizza',
    linha: 'Linha', area: 'Área', tabela: 'Tabela'
  };
  var ICONE_TIPO = {
    barras: '<rect x="3" y="5" width="14" height="3.2" rx="1.4"/><rect x="3" y="10.4" width="18" height="3.2" rx="1.4"/><rect x="3" y="15.8" width="9" height="3.2" rx="1.4"/>',
    colunas: '<rect x="4" y="11" width="4" height="9" rx="1.4"/><rect x="10" y="5" width="4" height="15" rx="1.4"/><rect x="16" y="14" width="4" height="6" rx="1.4"/>',
    rosca: '<path d="M12 3a9 9 0 109 9h-4.5a4.5 4.5 0 11-4.5-4.5z"/><path d="M13.4 3.1A9 9 0 0120.9 10.6l-4.4.9a4.5 4.5 0 00-3-3z" opacity=".55"/>',
    pizza: '<path d="M12 12V2.6A9.4 9.4 0 1121.4 12z" opacity=".55"/><path d="M12 12h9.4A9.4 9.4 0 1112 2.6z"/>',
    linha: '<path d="M3 17l5-6 4 3 5-8 4 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    area: '<path d="M3 17l5-6 4 3 5-8 4 5v9H3z" opacity=".5"/><path d="M3 17l5-6 4 3 5-8 4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    tabela: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9.5h18M9.5 9.5V20" fill="none" stroke="currentColor" stroke-width="1.8"/>'
  };
  var TIPOS_SALVOS = (function () {
    try { return JSON.parse(localStorage.getItem(CHAVE_TIPOS) || '{}') || {}; } catch (e) { return {}; }
  })();

  function montarControles() {
    document.querySelectorAll('[data-tipos]').forEach(function (div) {
      var id = div.id, tipos = div.getAttribute('data-tipos').split(',');
      TIPOS[id] = tipos.indexOf(TIPOS_SALVOS[id]) >= 0 ? TIPOS_SALVOS[id] : tipos[0];

      var grupo = document.createElement('div');
      grupo.className = 'tipos';
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-label', 'Tipo de gráfico');
      grupo.innerHTML = tipos.map(function (t) {
        var rot = ROTULO_TIPO[t] || t;
        return '<button type="button" class="tipo-btn' + (t === TIPOS[id] ? ' ativo' : '') +
          '" data-tipo="' + t + '" title="' + rot + '" aria-label="' + rot +
          '" aria-pressed="' + (t === TIPOS[id]) + '">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + ICONE_TIPO[t] + '</svg></button>';
      }).join('');
      grupo.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.tipo-btn');
        if (!btn) return;
        var t = btn.getAttribute('data-tipo');
        if (t === TIPOS[id]) return;
        TIPOS[id] = t;
        grupo.querySelectorAll('.tipo-btn').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('ativo', on);
          b.setAttribute('aria-pressed', on);
        });
        redesenhar(id);
        try { localStorage.setItem(CHAVE_TIPOS, JSON.stringify(TIPOS)); } catch (e) { /* modo privado */ }
      });

      var acoes = document.createElement('div');
      acoes.className = 'painel-acoes';
      acoes.appendChild(grupo);
      div.closest('.painel').querySelector('.painel-cab').appendChild(acoes);
    });
  }

  /** Clique numa marca: alterna o valor no filtro correspondente, ou abre a
      aba onde aquele programa é detalhado. */
  function aoClicarDe(div) {
    var campo = div.getAttribute('data-clique');
    if (!campo) return null;
    return function (rot) {
      if (rot === 'Outros' || rot === 'Não informado') return;
      if (campo === 'div') { return abrirAba(ABA_DE_DIVISAO[divisaoPeloNome(rot)] || 'geral'); }
      if (campo === 'assunto') { return abrirAba(ABA_DE_ASSUNTO[rot] || 'registros'); }
      var lista = F[campo];
      if (!lista) return;
      var i = lista.indexOf(rot);
      if (i < 0) lista.push(rot); else lista.splice(i, 1);
      if (campo === 'reg') F.mun = [];
      aplicar();
    };
  }

  function divisaoPeloNome(nome) {
    var d = D.divisoes.filter(function (x) { return x.nome === nome; })[0];
    return d ? d.id : '';
  }

  function opcoesDe(div) {
    return {
      unidade: div.getAttribute('data-unidade') || '',
      dec: +(div.getAttribute('data-dec') || 0),
      aoClicar: aoClicarDe(div)
    };
  }

  /** Guarda os dados e desenha no tipo escolhido. */
  function desenhar(id, dados, extra) {
    var div = el(id);
    if (!div) return;
    var o = opcoesDe(div);
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    CARGA[id] = { modo: 'cat', dados: dados, opts: o };
    redesenhar(id);
  }

  function desenharSerie(id, rotulos, series, extra) {
    var div = el(id);
    if (!div) return;
    var o = opcoesDe(div);
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    CARGA[id] = { modo: 'serie', rotulos: rotulos, series: series, opts: o };
    redesenhar(id);
  }

  function redesenhar(id) {
    var c = CARGA[id], div = el(id);
    if (!c || !div) return;
    if (c.modo === 'cat') {
      // rosca e pizza reciclam cor acima de 6 fatias: agrupa o resto
      var t = TIPOS[id];
      var dados = (t === 'rosca' || t === 'pizza') ? topN(c.dados, 6) : c.dados;
      G.categorico(t, div, dados, c.opts);
    } else {
      G.serie(TIPOS[id], div, c.rotulos, c.series, c.opts);
    }
  }

  /* ---------------------------------------------------------------- tabelas */
  function tabela(id, colunas, linhasTab, opts) {
    var div = el(id);
    if (!div) return;
    opts = opts || {};
    if (!linhasTab.length) return G.vazio(div, opts.vazio);
    var cab = colunas.map(function (c) {
      return '<th' + (c.num ? ' class="num-cab"' : '') + '>' + esc(c.rot) + '</th>';
    }).join('');
    var corpo = linhasTab.map(function (l) {
      return '<tr>' + colunas.map(function (c, i) {
        var v = c.val(l);
        if (c.num) {
          return '<td class="num' + (i === 0 ? ' forte' : '') + '">' +
            (v == null || v === '' ? '<span class="nada">—</span>' : num(v, c.dec || 0)) + '</td>';
        }
        return '<td' + (i === 0 ? ' class="forte"' : '') + '>' +
          (v ? esc(v) : '<span class="nada">—</span>') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var rodape = '';
    if (opts.total) {
      rodape = '<tr>' + colunas.map(function (c, i) {
        if (i === 0) return '<td class="forte">Total</td>';
        if (!c.num || c.semTotal) return '<td></td>';
        var s = linhasTab.reduce(function (a, l) { return a + (c.val(l) || 0); }, 0);
        return '<td class="num forte">' + num(s, c.dec || 0) + '</td>';
      }).join('') + '</tr>';
    }
    div.innerHTML = '<div class="tabela-scroll"><table class="dados">' +
      '<thead><tr>' + cab + '</tr></thead><tbody>' + corpo + rodape + '</tbody></table></div>' +
      (opts.rodape ? '<p class="tabela-nota">' + esc(opts.rodape) + '</p>' : '');
  }

  /** Moeda em pt-BR. O sufixo de unidade do KPI cola no número ("430.328R$"),
      e em português o símbolo vem antes — então o valor já sai formatado. */
  function moeda(v, dec) {
    return 'R$ ' + num(v || 0, dec == null ? 2 : dec);
  }

  function dataBR(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }

  /* =========================================================== ABA: GERAL */
  function verGeral() {
    var todas = juntar(IDS);
    var rows = todas.map(function (x) { return x.l; });
    var anos = rows.filter(function (l) { return l.ano; }).map(function (l) { return +l.ano; });
    var periodo = anos.length ? Math.min.apply(null, anos) + '–' + Math.max.apply(null, anos) : '—';

    var pintos = soma(linhas('incub'), 'total');
    var calcario = soma(linhas('calcario'), 'ton') +
      soma(linhas('pec_calcario'), 'kg') / 1000 + soma(linhas('cafe'), 'calc');
    var adubo = soma(linhas('pec_adubos'), 'total');
    var nitro = soma(linhas('nitrogenio'), 'kg');
    var armaz = soma(linhas('silos'), 'cap');
    var vacas = soma(linhas('ia'), 'vacas');
    var basesComDado = IDS.filter(function (cid) { return linhas(cid).length; });

    tiles('kpisGeral', [
      { cards: [
        { rot: 'Registros', val: num(rows.length), sub: 'linhas no recorte atual' },
        { rot: 'Pessoas atendidas', val: num(distintos(rows, 'nome')), sub: 'nomes distintos' },
        { rot: 'Municípios', val: num(distintos(rows, 'mun')), sub: 'com registro' },
        { rot: 'Período', val: periodo, cls: 'texto', sub: 'anos com data registrada' },
        { rot: 'Bases', val: num(basesComDado.length), sub: 'de ' + D.meta.conjuntos + ' na planilha' },
        { rot: 'Divisões', val: num(D.divisoes.length), sub: 'seções do departamento' }
      ] },
      { sec: 'Principais entregas', cards: [
        pintos ? { rot: 'Pintos distribuídos', val: num(pintos), un: 'un',
          sub: 'central de incubação' } : null,
        calcario ? { rot: 'Calcário entregue', val: num(calcario, 1), un: 't',
          sub: 'programa do calcário, unidades e café' } : null,
        adubo ? { rot: 'Adubo entregue', val: num(adubo), un: 'kg',
          sub: 'ureia, superfosfato, KCl e micros' } : null,
        nitro ? { rot: 'Nitrogênio líquido', val: num(nitro, 1), un: 'L',
          sub: 'fornecido pela usina' } : null,
        armaz ? { rot: 'Armazenagem', val: num(armaz), un: 't',
          sub: 'capacidade estática cadastrada' } : null,
        vacas ? { rot: 'Vacas inseminadas', val: num(vacas), un: 'un',
          sub: 'programa de melhoramento' } : null
      ] }
    ]);

    desenhar('gAssunto', agregar(todas, function (x) { return x.c.sub; }));
    desenhar('gDivisao', agregar(todas, function (x) { return NOME_DIV[x.c.div]; }));
    desenhar('gMun', topN(agregar(rows, 'mun'), 13));
    desenhar('gRegional', agregar(rows, function (l) { return regionalDe(l.mun); }));
    var sa = serieAnos(rows);
    desenharSerie('gAno', sa.rotulos, [{ nome: 'Registros', valores: sa.valores }]);
    desenhar('gSexo', agregar(rows, 'sexo'));
    desenhar('gConjuntos', topN(basesComDado.map(function (cid) {
      return { rot: D.conjuntos[cid].nome, val: linhas(cid).length };
    }).sort(function (a, b) { return b.val - a.val; }), 11));

    var indice = IDS.map(function (cid) { return D.conjuntos[cid]; })
      .sort(function (a, b) { return b.n - a.n; });
    tabela('tConjuntos', [
      { rot: 'Base', val: function (c) { return c.nome; } },
      { rot: 'Programa', val: function (c) { return c.sub; } },
      { rot: 'Divisão', val: function (c) { return NOME_DIV[c.div]; } },
      { rot: 'Registros', num: true, val: function (c) { return linhas(c.id).length; } },
      { rot: 'Total na planilha', num: true, val: function (c) { return c.n; } }
    ], indice, { total: true });

    // clicar numa linha da tabela abre a base na aba Registros. A última linha
    // é o total da tabela e não corresponde a base nenhuma.
    el('tConjuntos').querySelectorAll('tbody tr').forEach(function (tr, i) {
      if (!indice[i]) return;
      tr.classList.add('lin-clique');
      tr.tabIndex = 0;
      var ir = function () { abrirRegistros(indice[i].id); };
      tr.addEventListener('click', ir);
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
      });
    });
  }

  /* ============================================================= ABA: CAFÉ */
  function verCafe() {
    var cafe = linhas('cafe');
    var cursoProd = linhas('cafe_curso_prod'), cursoTec = linhas('cafe_curso_tec');
    var palestras = linhas('cafe_palestras'), concurso = linhas('cafe_concurso');
    var acoes = [
      { rot: 'Palestras do café (Expoacre)', val: palestras.length },
      { rot: 'Curso — técnicos', val: cursoTec.length },
      { rot: 'Curso — produtores', val: cursoProd.length },
      { rot: 'Concurso de qualidade', val: concurso.length }
    ].filter(function (d) { return d.val; }).sort(function (a, b) { return b.val - a.val; });
    var participantes = acoes.reduce(function (a, d) { return a + d.val; }, 0);

    tiles('kpisCafe', [
      { sec: 'Programa de cafeicultura', cards: [
        { rot: 'Beneficiários', val: num(cafe.length), sub: 'produtores atendidos' },
        { rot: 'Municípios', val: num(distintos(cafe, 'mun')), sub: 'com beneficiário' },
        { rot: 'Calcário', val: num(soma(cafe, 'calc'), 1), un: 't', sub: 'entregue aos cafeicultores' },
        { rot: 'Fertilizante NPK', val: num(soma(cafe, 'npk')), un: 'kg', sub: 'adubo de cobertura' },
        { rot: 'FTE BR12', val: num(soma(cafe, 'fte')), un: 'kg', sub: 'micronutrientes' },
        { rot: 'Mudas', val: num(soma(cafe, 'mudas')), un: 'un', sub: 'distribuídas' }
      ] },
      { sec: 'Formação e eventos', cards: [
        { rot: 'Participantes', val: num(participantes), sub: 'em cursos, palestras e concurso' },
        { rot: 'Técnicos', val: num(cursoTec.length), sub: 'capacitados no café' },
        { rot: 'Produtores', val: num(cursoProd.length), sub: 'em cursos de campo' },
        { rot: 'Instituições', val: num(distintos(cursoTec, 'inst')),
          sub: 'como grafadas na planilha' },
        { rot: 'Turmas', val: num(distintos(cursoProd.concat(cursoTec), 'turma')),
          sub: 'de cursos realizadas' },
        { rot: 'Concurso de qualidade', val: num(concurso.length), sub: 'produtores inscritos' }
      ] }
    ]);

    desenhar('gCafeMun', agregar(cafe, 'mun'));
    desenhar('gCafeSexo', agregar(cafe, 'sexo'));
    desenhar('gCafeCalc', agregar(cafe, 'mun', 'calc'));
    desenhar('gCafeNpk', agregar(cafe, 'mun', 'npk'));
    desenhar('gCafeMudas', agregar(cafe, 'mun', 'mudas'));
    desenhar('gCafeAcoes', acoes);
    desenhar('gCafeTurmas', agregar(cursoProd.concat(cursoTec), 'turma'));
    desenhar('gCafeInst', topN(agregar(cursoTec, 'inst'), 11));

    var insumos = [
      { rot: 'Calcário', val: soma(cafe, 'calc'), un: 't', dec: 1 },
      { rot: 'Fertilizante NPK', val: soma(cafe, 'npk'), un: 'kg', dec: 0 },
      { rot: 'FTE BR12', val: soma(cafe, 'fte'), un: 'kg', dec: 0 },
      { rot: 'Mudas de café', val: soma(cafe, 'mudas'), un: 'un', dec: 0 }
    ].filter(function (d) { return d.val; });
    tabela('tCafeInsumos', [
      { rot: 'Insumo', val: function (d) { return d.rot; } },
      { rot: 'Quantidade', num: true, dec: 1, val: function (d) { return d.val; } },
      { rot: 'Unidade', val: function (d) { return d.un; } }
    ], insumos, { rodape: D.conjuntos.cafe.nota });

    tabela('tCafeBenef', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Endereço', val: function (l) { return l.ender; } },
      { rot: 'Calcário (t)', num: true, dec: 1, val: function (l) { return l.calc; } },
      { rot: 'NPK (kg)', num: true, val: function (l) { return l.npk; } },
      { rot: 'FTE (kg)', num: true, val: function (l) { return l.fte; } },
      { rot: 'Mudas (un)', num: true, val: function (l) { return l.mudas; } }
    ], cafe, { total: true });
  }

  /* ====================================================== ABA: ARMAZENAGEM */
  function verArmazenagem() {
    var silos = linhas('silos');
    var publicas = silos.filter(function (s) { return s.tipo === 'Público'; });

    tiles('kpisArmaz', [
      { cards: [
        { rot: 'Unidades', val: num(silos.length), sub: 'silos e armazéns cadastrados' },
        { rot: 'Capacidade estática', val: num(soma(silos, 'cap')), un: 't', sub: 'somando as unidades' },
        { rot: 'Silo pulmão', val: num(soma(silos, 'pulmao')), un: 't', sub: 'capacidade de espera' },
        { rot: 'Investimento', val: moeda(soma(silos, 'invest'), 0), sub: 'construção e ampliação' },
        { rot: 'Municípios', val: num(distintos(silos, 'mun')), sub: 'com unidade instalada' },
        { rot: 'Unidades públicas', val: num(publicas.length),
          sub: num(soma(publicas, 'cap')) + ' t de capacidade' }
      ] }
    ]);

    desenhar('gSilosMun', agregar(silos, 'mun', 'cap'));
    desenhar('gSilosTipo', agregar(silos, 'tipo', 'cap'));
    desenhar('gSilosQtd', agregar(silos, 'tipo'));
    desenhar('gSilosInvest', agregar(silos, 'mun', 'invest'));

    tabela('tSilos', [
      { rot: 'Município', val: function (s) { return s.mun; } },
      { rot: 'Natureza', val: function (s) { return s.tipo; } },
      { rot: 'Cessionária / responsável', val: function (s) { return s.cess; } },
      { rot: 'Endereço', val: function (s) { return s.ender; } },
      { rot: 'Capacidade (t)', num: true, val: function (s) { return s.cap; } },
      { rot: 'Pulmão (t)', num: true, val: function (s) { return s.pulmao; } },
      { rot: 'Investimento (R$)', num: true, val: function (s) { return s.invest; } }
    ], silos.slice().sort(function (a, b) { return (b.cap || 0) - (a.cap || 0); }),
      { total: true, rodape: D.conjuntos.silos.nota });
  }

  /* ================================================ ABA: AQUICULTURA E PESCA */
  function verAquicultura() {
    var r = linhas('diap');

    tiles('kpisAqui', [
      { cards: [
        { rot: 'Atendimentos', val: num(r.length), sub: 'produtores visitados' },
        { rot: 'Produtores', val: num(distintos(r, 'nome')), sub: 'nomes distintos' },
        { rot: 'Municípios', val: num(distintos(r, 'mun')), sub: 'com visita registrada' },
        { rot: 'Mulheres atendidas', val: num(r.filter(function (l) {
          return l.sexo === 'Feminino'; }).length), sub: 'do total de atendimentos' },
        { rot: 'Quilometragem', val: num(soma(r, 'km')), un: 'km', sub: 'percorridos pela equipe' },
        { rot: 'Diárias', val: num(soma(r, 'diarias'), 1), sub: 'pagas às equipes' }
      ] }
    ]);

    desenhar('gAquiMun', agregar(r, 'mun'));
    desenhar('gAquiSexo', agregar(r, 'sexo'));
    var sm = serieMeses(r);
    desenharSerie('gAquiMes', sm.rotulos, [{ nome: 'Atendimentos', valores: sm.valores }]);
    desenhar('gAquiFaixa', agregarNaOrdem(r, function (l) { return faixaEtaria(l.idade); }, FAIXAS));
    desenhar('gAquiAtiv', agregar(r, 'ativ'));

    tabela('tAqui', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Data', val: function (l) { return dataBR(l.data); } },
      { rot: 'Sexo', val: function (l) { return l.sexo; } },
      { rot: 'Atividade', val: function (l) { return l.ativ; } },
      { rot: 'Equipe', val: function (l) { return (l.equipe || []).join(', '); } }
    ], r, { rodape: D.conjuntos.diap.nota });
  }

  /* ============================================= ABA: CENTRAL DE INCUBAÇÃO */
  function verIncubacao() {
    var r = linhas('incub');
    var total = soma(r, 'total'), corte = soma(r, 'corte'), postura = soma(r, 'postura');

    tiles('kpisIncub', [
      { cards: [
        { rot: 'Pintos distribuídos', val: num(total), un: 'un', sub: 'no recorte atual' },
        { rot: 'Entregas', val: num(r.length), sub: 'lançamentos de distribuição' },
        { rot: 'Beneficiários', val: num(distintos(r, 'nome')), sub: 'nomes distintos' },
        { rot: 'Municípios', val: num(distintos(r, 'mun')), sub: 'atendidos' },
        { rot: 'Média por entrega', val: num(r.length ? total / r.length : 0), un: 'un',
          sub: 'pintos por lançamento' },
        { rot: 'Unidades demonstrativas', val: num(linhas('galinha').length),
          sub: 'produtoras da galinha caipira' }
      ] }
    ]);

    var sa = serieAnos(r, 'total');
    desenharSerie('gIncubAno', sa.rotulos, [{ nome: 'Pintos', valores: sa.valores }], { dec: 0 });
    desenhar('gIncubMun', topN(agregar(r, 'mun', 'total'), 13));
    desenhar('gIncubTipo', [
      { rot: 'Corte', val: corte }, { rot: 'Postura', val: postura }
    ].filter(function (d) { return d.val; }));
    desenhar('gIncubSexo', agregar(r, 'sexo'));
    desenhar('gIncubBenef', topN(agregar(r, 'nome', 'total'), 11));

    tabela('tGalinha', [
      { rot: 'Produtora', val: function (l) { return l.nome; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Endereço', val: function (l) { return l.ender; } },
      { rot: 'Sexo', val: function (l) { return l.sexo; } }
    ], linhas('galinha'), { rodape: D.conjuntos.incub.nota });
  }

  /* ========================================================= ABA: CALCÁRIO */
  function verCalcario() {
    var r = linhas('calcario'), uds = linhas('pec_calcario');
    var ton = soma(r, 'ton');
    var comCar = r.filter(function (l) { return l.car; }).length;
    var distribuiu = r.filter(function (l) { return l.distrib === 'Sim'; }).length;
    var comResposta = r.filter(function (l) { return l.distrib; }).length;

    tiles('kpisCalc', [
      { sec: 'Programa do calcário', cards: [
        { rot: 'Beneficiários', val: num(r.length), sub: 'produtores atendidos' },
        { rot: 'Calcário entregue', val: num(ton, 1), un: 't', sub: 'no recorte atual' },
        { rot: 'Média por produtor', val: num(r.length ? ton / r.length : 0, 1), un: 't',
          sub: 'quantidade típica recebida' },
        { rot: 'Municípios', val: num(distintos(r, 'mun')), sub: 'com beneficiário' },
        { rot: 'Com registro no CAR', val: num(r.length ? comCar / r.length * 100 : 0, 1), un: '%',
          sub: num(comCar) + ' de ' + num(r.length) + ' beneficiários' },
        { rot: 'Já distribuído na área', val: num(comResposta ? distribuiu / comResposta * 100 : 0, 1),
          un: '%', sub: num(distribuiu) + ' de ' + num(comResposta) + ' com resposta' }
      ] },
      { sec: 'Unidades demonstrativas', cards: [
        { rot: 'Entregas', val: num(uds.length), sub: 'às unidades da Pecuária Eficiente' },
        { rot: 'Calcário às unidades', val: num(soma(uds, 'kg') / 1000, 1), un: 't',
          sub: 'convertido de quilos' },
        { rot: 'Unidades ativas', val: num(uds.filter(function (l) {
          return l.situacao === 'Ativo'; }).length), sub: 'de ' + uds.length + ' com entrega' }
      ] }
    ]);

    desenhar('gCalcMun', agregar(r, 'mun', 'ton'));
    desenhar('gCalcSexo', agregar(r, 'sexo'));
    desenhar('gCalcBenefMun', agregar(r, 'mun'));
    desenhar('gCalcDistrib', agregar(r, function (l) {
      return l.distrib === 'Sim' ? 'Distribuído' : l.distrib === 'Não' ? 'Ainda não' : '';
    }));
    desenhar('gCalcIndic', topN(agregar(r, 'indic'), 11));
    desenhar('gCalcFaixa', agregarNaOrdem(r, function (l) { return faixaEtaria(l.idade); }, FAIXAS));
    desenhar('gCalcTop', topN(agregar(r, 'nome', 'ton'), 16));

    tabela('tCalcUnidades', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Data', val: function (l) { return dataBR(l.data); } },
      { rot: 'Situação', val: function (l) { return l.situacao; } },
      { rot: 'Calcário (kg)', num: true, val: function (l) { return l.kg; } }
    ], uds.slice().sort(function (a, b) { return (b.kg || 0) - (a.kg || 0); }), { total: true });
  }

  /* ================================================ ABA: PECUÁRIA EFICIENTE */
  function verPecEficiente() {
    var uds = linhas('pec_ud').concat(linhas('pec_up'));
    var adub = linhas('pec_adubos'), solar = linhas('solar');
    var area = soma(uds, 'area'), rec = soma(uds, 'arearec');

    tiles('kpisPecEf', [
      { cards: [
        { rot: 'Unidades', val: num(uds.length), sub: 'demonstrativas e produtivas' },
        { rot: 'Área das unidades', val: num(area, 1), un: 'ha', sub: 'área total das propriedades' },
        { rot: 'Área recuperada', val: num(rec, 1), un: 'ha', sub: 'pastagem recuperada' },
        { rot: 'Proporção recuperada', val: num(area ? rec / area * 100 : 0, 1), un: '%',
          sub: 'da área das unidades' },
        { rot: 'Adubo entregue', val: num(soma(adub, 'total')), un: 'kg', sub: 'às unidades' },
        { rot: 'Municípios', val: num(distintos(uds, 'mun')), sub: 'com unidade instalada' }
      ] },
      { sec: 'Infraestrutura', cards: [
        { rot: 'Energia solar', val: num(solar.length), sub: 'propriedades com sistema' },
        { rot: 'Área com solar', val: num(soma(solar, 'area'), 1), un: 'ha',
          sub: 'somando as propriedades' },
        { rot: 'Municípios com solar', val: num(distintos(solar, 'mun')), sub: 'atendidos' }
      ] }
    ]);

    desenhar('gUnidadesMun', agregar(uds, 'mun', 'arearec'));
    desenhar('gUnidadesTipo', agregar(uds, 'tipo'));
    desenhar('gAdubos', [
      { rot: 'Ureia', val: soma(adub, 'ureia') },
      { rot: 'Superfosfato simples', val: soma(adub, 'super') },
      { rot: 'Cloreto de potássio', val: soma(adub, 'kcl') },
      { rot: 'Micronutrientes', val: soma(adub, 'micro') }
    ].filter(function (d) { return d.val; }));
    desenhar('gAdubosMun', agregar(adub, 'mun', 'total'));

    tabela('tUnidades', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Propriedade', val: function (l) { return l.prop; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Tipo', val: function (l) { return l.tipo; } },
      { rot: 'Área (ha)', num: true, dec: 1, val: function (l) { return l.area; } },
      { rot: 'Recuperada (ha)', num: true, dec: 1, val: function (l) { return l.arearec; } },
      { rot: '% recuperada', num: true, dec: 1, semTotal: true,
        val: function (l) { return l.area ? l.arearec / l.area * 100 : null; } }
    ], uds, { total: true });

    tabela('tAdubos', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Ureia (kg)', num: true, val: function (l) { return l.ureia; } },
      { rot: 'Superfosfato (kg)', num: true, val: function (l) { return l['super']; } },
      { rot: 'KCl (kg)', num: true, val: function (l) { return l.kcl; } },
      { rot: 'Micros (kg)', num: true, val: function (l) { return l.micro; } },
      { rot: 'Total (kg)', num: true, val: function (l) { return l.total; } }
    ], adub.slice().sort(function (a, b) { return (b.total || 0) - (a.total || 0); }), { total: true });

    tabela('tSolar', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Área (ha)', num: true, dec: 1, val: function (l) { return l.area; } }
    ], solar, { total: true });
  }

  /* ============================================== ABA: MELHORAMENTO GENÉTICO */
  function verGenetica() {
    var ia = linhas('ia'), touros = linhas('touros'), ens = linhas('ensimina');
    var recebidas = soma(touros, 'qtd') + soma(linhas('insumos_ia'), 'total');
    var vacas = soma(ia, 'vacas'), prenhez = soma(ia, 'prenhez'), bezerros = soma(ia, 'bezerros');
    var machos = soma(ia, 'machos'), femeas = soma(ia, 'femeas');

    tiles('kpisGen', [
      { sec: 'Inseminação artificial', cards: [
        { rot: 'Produtores', val: num(ia.length), sub: 'lotes acompanhados' },
        { rot: 'Vacas inseminadas', val: num(vacas), un: 'un', sub: 'no recorte atual' },
        { rot: 'Prenhezes', val: num(prenhez), un: 'un',
          sub: vacas ? num(prenhez / vacas * 100, 1) + '% de aproveitamento' : '' },
        { rot: 'Bezerros nascidos', val: num(bezerros), un: 'un',
          sub: prenhez ? num(bezerros / prenhez * 100, 1) + '% das prenhezes' : '' },
        { rot: 'Machos', val: num(machos), un: 'un',
          sub: bezerros ? num(machos / (machos + femeas || 1) * 100, 1) + '% dos nascimentos' : '' },
        { rot: 'Fêmeas', val: num(femeas), un: 'un',
          sub: bezerros ? num(femeas / (machos + femeas || 1) * 100, 1) + '% dos nascimentos' : '' }
      ] },
      { sec: 'Banco de sêmen', cards: [
        { rot: 'Touros', val: num(touros.length), sub: 'no banco' },
        { rot: 'Doses recebidas', val: num(recebidas), un: 'un', sub: 'sêmen adquirido' },
        { rot: 'Doses utilizadas', val: num(soma(touros, 'usadas')), un: 'un', sub: 'aplicadas em campo' },
        { rot: 'Doses disponíveis', val: num(soma(touros, 'disp')), un: 'un', sub: 'em estoque' },
        { rot: 'Ensimina', val: num(ens.length), sub: 'produtores atendidos' },
        { rot: 'Doses do Ensimina', val: num(soma(ens, 'doses')), un: 'un', sub: 'entregues aos produtores' }
      ] }
    ]);

    // funil: a ordem é a do processo, não a do tamanho — por isso montado à mão
    desenhar('gIAFunil', [
      { rot: 'Vacas inseminadas', val: vacas },
      { rot: 'Prenhezes confirmadas', val: prenhez },
      { rot: 'Bezerros nascidos', val: bezerros }
    ].filter(function (d) { return d.val; }));

    desenhar('gIASexoBezerro', [
      { rot: 'Machos', val: machos }, { rot: 'Fêmeas', val: femeas }
    ].filter(function (d) { return d.val; }));

    desenhar('gIATop', agregar(ia, 'nome', 'vacas'));
    desenhar('gDosesTouro', agregar(touros, 'nome', 'usadas'));

    tabela('tIA', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Início', val: function (l) { return dataBR(l.data); } },
      { rot: 'Vacas', num: true, val: function (l) { return l.vacas; } },
      { rot: 'Prenhez', num: true, val: function (l) { return l.prenhez; } },
      { rot: '% prenhez', num: true, semTotal: true, val: function (l) { return l.pctprenhez; } },
      { rot: 'Bezerros', num: true, val: function (l) { return l.bezerros; } },
      { rot: 'Machos', num: true, val: function (l) { return l.machos; } },
      { rot: 'Fêmeas', num: true, val: function (l) { return l.femeas; } }
    ], ia.slice().sort(function (a, b) { return (b.vacas || 0) - (a.vacas || 0); }),
      { total: true, rodape: D.conjuntos.ia.nota });

    tabela('tTouros', [
      { rot: 'Touro', val: function (l) { return l.nome; } },
      { rot: 'Raça', val: function (l) { return l.raca; } },
      { rot: 'Chegada', val: function (l) { return dataBR(l.data); } },
      { rot: 'Recebidas', num: true, val: function (l) { return l.qtd; } },
      { rot: 'Utilizadas', num: true, val: function (l) { return l.usadas; } },
      { rot: 'Disponíveis', num: true, val: function (l) { return l.disp; } }
    ], touros, { total: true });

    tabela('tEnsimina', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Início', val: function (l) { return dataBR(l.data); } },
      { rot: 'Touro', val: function (l) { return l.touro; } },
      { rot: 'Doses', num: true, val: function (l) { return l.doses; } }
    ], ens, { total: true });
  }

  /* =============================================== ABA: USINA DE NITROGÊNIO */
  function verUsina() {
    var r = linhas('nitrogenio');
    var litros = soma(r, 'kg'), valor = soma(r, 'valor');

    tiles('kpisUsina', [
      { cards: [
        { rot: 'Fornecimentos', val: num(r.length), sub: 'retiradas registradas' },
        { rot: 'Nitrogênio líquido', val: num(litros, 1), un: 'L', sub: 'fornecido no recorte' },
        { rot: 'Arrecadação', val: moeda(valor), sub: 'recolhido pelo fornecimento' },
        { rot: 'Clientes', val: num(distintos(r, 'nome')), sub: 'produtores e empresas' },
        { rot: 'Média por retirada', val: num(r.length ? litros / r.length : 0, 1), un: 'L',
          sub: 'volume típico' },
        { rot: 'Preço médio', val: moeda(litros ? valor / litros : 0), un: '/L',
          sub: 'no período filtrado' }
      ] }
    ]);

    var sl = serieAnos(r, 'kg'), sv = serieAnos(r, 'valor');
    desenharSerie('gNitroAno', sl.rotulos, [{
      nome: 'Litros fornecidos', valores: sl.valores,
      detalhe: { rot: 'Arrecadado', valores: sv.valores, un: 'R$', dec: 2, total: valor }
    }], { dec: 1 });

    desenhar('gNitroMun', topN(agregar(r, 'mun', 'kg'), 13));
    var sm = serieMeses(r), smv = serieMeses(r, 'kg');
    desenharSerie('gNitroMes', sm.rotulos, [{
      nome: 'Retiradas', valores: sm.valores,
      detalhe: { rot: 'Litros', valores: smv.valores, un: 'L', dec: 1, total: litros }
    }]);
    desenhar('gNitroClientes', topN(agregar(r, 'nome', 'kg'), 16));
    desenhar('gNitroValorMun', topN(agregar(r, 'mun', 'valor'), 11));

    // uma linha por cliente: retiradas, litros e valor
    var porCliente = {};
    r.forEach(function (l) {
      if (!l.nome) return;
      var c = porCliente[l.nome] || (porCliente[l.nome] =
        { nome: l.nome, mun: l.mun, n: 0, kg: 0, valor: 0 });
      c.n++; c.kg += l.kg || 0; c.valor += l.valor || 0;
      if (!c.mun && l.mun) c.mun = l.mun;
    });
    var clientes = Object.keys(porCliente).map(function (k) { return porCliente[k]; })
      .sort(function (a, b) { return b.kg - a.kg; });
    tabela('tNitroClientes', [
      { rot: 'Cliente', val: function (c) { return c.nome; } },
      { rot: 'Município', val: function (c) { return c.mun; } },
      { rot: 'Retiradas', num: true, val: function (c) { return c.n; } },
      { rot: 'Litros', num: true, dec: 1, val: function (c) { return c.kg; } },
      { rot: 'Valor (R$)', num: true, dec: 2, val: function (c) { return c.valor; } }
    ], clientes, { total: true, rodape: D.conjuntos.nitrogenio.nota });
  }

  /* ================================================ ABA: ATIVIDADE TÉCNICA */
  function verAtividade() {
    var r = mesclar([
      ['pec_ativ', { divisao: 'Pecuária' }],
      ['diap', { divisao: 'Aquicultura e Pesca' }],
      ['incub_ativ', { divisao: 'Central de Incubação' }]
    ]);
    var viagens = r.filter(function (l) { return l.dias; });

    tiles('kpisAtiv', [
      { cards: [
        { rot: 'Atendimentos', val: num(r.length), sub: 'produtores visitados' },
        { rot: 'Produtores', val: num(distintos(r, 'nome')), sub: 'nomes distintos' },
        { rot: 'Municípios', val: num(distintos(r, 'mun')), sub: 'com visita registrada' },
        { rot: 'Viagens', val: num(viagens.length), sub: 'saídas a campo lançadas' },
        { rot: 'Quilometragem', val: num(soma(r, 'km')), un: 'km', sub: 'percorridos' },
        { rot: 'Diárias', val: num(soma(r, 'diarias'), 1), sub: 'pagas às equipes' }
      ] }
    ]);

    desenhar('gAtivDiv', agregar(r, 'divisao'));
    desenhar('gAtivMun', topN(agregar(r, 'mun'), 13));
    var sq = serieAnos(r), sk = serieAnos(r, 'km');
    desenharSerie('gAtivAno', sq.rotulos, [{
      nome: 'Atendimentos', valores: sq.valores,
      detalhe: { rot: 'Percorridos', valores: sk.valores, un: 'km', dec: 0, total: soma(r, 'km') }
    }]);
    desenhar('gAtivEquipe', topN(porTecnico(r), 13));
    desenhar('gAtivSexo', agregar(r, 'sexo'));
    desenhar('gAtivKmMun', topN(agregar(r, 'mun', 'km'), 11));
    desenhar('gAtivTipo', agregar(r, 'ativ'));

    tabela('tAtiv', [
      { rot: 'Produtor', val: function (l) { return l.nome; } },
      { rot: 'Divisão', val: function (l) { return l.divisao; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Data', val: function (l) { return dataBR(l.data); } },
      { rot: 'Atividade', val: function (l) { return l.ativ; } },
      { rot: 'Equipe', val: function (l) { return (l.equipe || []).join(', '); } },
      { rot: 'Dias', num: true, val: function (l) { return l.dias; } },
      { rot: 'Km', num: true, val: function (l) { return l.km; } }
    ], r.slice().sort(function (a, b) {
      return (b.data || '').localeCompare(a.data || '');
    }), { total: true, rodape: D.conjuntos.pec_ativ.nota });
  }

  /* ========================================================== ABA: CURSOS */
  function verCursos() {
    var prod = linhas('curso_prod'), tec = linhas('curso_tec');
    var todos = prod.concat(tec);

    tiles('kpisCursos', [
      { cards: [
        { rot: 'Participantes', val: num(todos.length), sub: 'inscrições registradas' },
        { rot: 'Pessoas distintas', val: num(distintos(todos, 'nome')), sub: 'nomes sem repetição' },
        { rot: 'Cursos', val: num(distintos(todos, 'curso')), sub: 'temas ofertados' },
        { rot: 'Turmas', val: num(distintos(todos, 'data')), sub: 'períodos de realização' },
        { rot: 'Técnicos', val: num(tec.length), sub: 'de instituições parceiras' },
        { rot: 'Produtores', val: num(prod.length), sub: 'em cursos de campo' }
      ] }
    ]);

    desenhar('gCursos', agregar(todos, 'curso'));
    desenhar('gCursoPublico', [
      { rot: 'Produtores', val: prod.length }, { rot: 'Técnicos', val: tec.length }
    ].filter(function (d) { return d.val; }));
    desenhar('gCursoInst', topN(agregar(tec, 'inst'), 11));
    desenhar('gCursoMun', agregar(todos, 'mun'));
    var sa = serieAnos(todos);
    desenharSerie('gCursoAno', sa.rotulos, [{ nome: 'Participantes', valores: sa.valores }]);

    // uma linha por turma: o mesmo curso é ofertado em períodos diferentes
    var turmas = {};
    todos.forEach(function (l) {
      var k = (l.curso || '—') + '|' + (l.data || '') + '|' + (l.local || '');
      var t = turmas[k] || (turmas[k] = { curso: l.curso, data: l.data, local: l.local,
        mun: l.mun, publico: l.inst ? 'Técnicos' : 'Produtores', n: 0 });
      t.n++;
      if (!t.mun && l.mun) t.mun = l.mun;
    });
    tabela('tCursos', [
      { rot: 'Curso', val: function (t) { return t.curso; } },
      { rot: 'Público', val: function (t) { return t.publico; } },
      { rot: 'Período', val: function (t) { return dataBR(t.data); } },
      { rot: 'Local', val: function (t) { return t.local; } },
      { rot: 'Município', val: function (t) { return t.mun; } },
      { rot: 'Participantes', num: true, val: function (t) { return t.n; } }
    ], Object.keys(turmas).map(function (k) { return turmas[k]; })
      .sort(function (a, b) { return b.n - a.n; }), { total: true });
  }

  /* ========================================================= ABA: EVENTOS */
  function verEventos() {
    var pal = linhas('palestras_deagro'), sem = linhas('seminarios');
    var dias = linhas('dias_campo'), expo = linhas('expoacre');
    var todos = mesclar([
      ['palestras_deagro', { evento: 'Palestras do DEAGRO' }],
      ['seminarios', { evento: 'Seminários' }],
      ['dias_campo', { evento: 'Dias de campo — Expojuruá' }]
    ]);

    tiles('kpisEventos', [
      { cards: [
        { rot: 'Participantes', val: num(todos.length), sub: 'presenças registradas' },
        { rot: 'Pessoas distintas', val: num(distintos(todos, 'nome')), sub: 'nomes sem repetição' },
        { rot: 'Palestras', val: num(pal.length), sub: 'ouvintes do DEAGRO' },
        { rot: 'Dias de campo', val: num(dias.length), sub: 'participantes no Expojuruá' },
        { rot: 'Seminários', val: num(sem.length), sub: 'participantes' },
        { rot: 'Palestrantes', val: num(expo.length), sub: 'no Expoacre 2023 e 2024' }
      ] }
    ]);

    desenhar('gEventoTipo', agregar(todos, 'evento'));
    desenhar('gEventoMun', agregar(todos, 'mun'));
    var sa = serieAnos(todos);
    desenharSerie('gEventoAno', sa.rotulos, [{ nome: 'Participantes', valores: sa.valores }]);

    tabela('tExpoacre', [
      { rot: 'Palestrante', val: function (l) { return l.nome; } },
      { rot: 'Tema', val: function (l) { return l.tema; } },
      { rot: 'Edição', val: function (l) { return l.ano; } }
    ], expo);

    // uma linha por evento: mesmo nome, mesmo local e mesmo ano é o mesmo evento
    var eventos = {};
    todos.forEach(function (l) {
      var k = l.evento + '|' + (l.local || '') + '|' + (l.ano || '');
      var e = eventos[k] || (eventos[k] = { evento: l.evento, local: l.local, ano: l.ano,
        mun: l.mun, n: 0 });
      e.n++;
      if (!e.mun && l.mun) e.mun = l.mun;
    });
    tabela('tEventos', [
      { rot: 'Evento', val: function (e) { return e.evento; } },
      { rot: 'Local', val: function (e) { return e.local; } },
      { rot: 'Município', val: function (e) { return e.mun; } },
      { rot: 'Ano', val: function (e) { return e.ano; } },
      { rot: 'Participantes', num: true, val: function (e) { return e.n; } }
    ], Object.keys(eventos).map(function (k) { return eventos[k]; })
      .sort(function (a, b) { return b.n - a.n; }), { total: true });

    tabela('tEventoPessoas', [
      { rot: 'Participante', val: function (l) { return l.nome; } },
      { rot: 'Evento', val: function (l) { return l.evento; } },
      { rot: 'Município', val: function (l) { return l.mun; } },
      { rot: 'Ano', val: function (l) { return l.ano; } }
    ], todos);
  }

  /* ====================================================== ABA: MUNICÍPIOS --
     As duas abas seguintes cruzam as planilhas em vez de detalhar uma delas:
     uma pergunta o que cada município recebeu, a outra o que cada pessoa
     recebeu, somando todos os programas do departamento. */

  /** Quais bases somam em cada coluna do resumo por município e por pessoa. */
  var ATIVIDADE = ['pec_ativ', 'diap', 'incub_ativ'];
  var CAPACITACAO = ['curso_prod', 'curso_tec', 'seminarios', 'dias_campo',
    'palestras_deagro', 'cafe_curso_prod', 'cafe_curso_tec', 'cafe_palestras'];

  /** Acumula num objeto de resumo o que a linha `l` da base `cid` entregou. */
  function acumular(a, cid, l) {
    a.registros++;
    if (cid === 'incub') a.pintos += l.total || 0;
    if (cid === 'calcario') a.calc += l.ton || 0;
    if (cid === 'pec_calcario') a.calc += (l.kg || 0) / 1000;
    if (cid === 'cafe') { a.cafe++; a.calc += l.calc || 0; }
    if (cid === 'nitrogenio') a.nitro += l.kg || 0;
    if (cid === 'silos') a.armaz += l.cap || 0;
    if (ATIVIDADE.indexOf(cid) >= 0) a.visitas++;
    if (CAPACITACAO.indexOf(cid) >= 0) a.capac++;
  }

  function zerado(extra) {
    var a = { registros: 0, pintos: 0, calc: 0, nitro: 0, cafe: 0, armaz: 0,
      visitas: 0, capac: 0, programas: {} };
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
    return a;
  }

  function resumoMunicipios() {
    var m = {};
    IDS.forEach(function (cid) {
      var c = D.conjuntos[cid];
      linhas(cid).forEach(function (l) {
        if (!l.mun) return;
        var a = m[l.mun] || (m[l.mun] = zerado({ mun: l.mun, reg: regionalDe(l.mun), pessoas: {} }));
        a.programas[c.sub] = true;
        if (l.nome) a.pessoas[semAcento(l.nome)] = true;
        acumular(a, cid, l);
      });
    });
    return Object.keys(m).map(function (k) {
      var a = m[k];
      a.nPessoas = Object.keys(a.pessoas).length;
      a.nProgramas = Object.keys(a.programas).length;
      return a;
    }).sort(function (a, b) { return b.registros - a.registros; });
  }

  function verMunicipio() {
    var muns = resumoMunicipios();

    var maior = muns[0], maisPessoas = muns.slice().sort(function (a, b) {
      return b.nPessoas - a.nPessoas; })[0];
    var porReg = {};
    muns.forEach(function (a) { if (a.reg) porReg[a.reg] = (porReg[a.reg] || 0) + a.registros; });
    var regTop = ordenar(porReg)[0];

    tiles('kpisMunicipio', [
      { cards: [
        { rot: 'Municípios atendidos', val: num(muns.length), sub: 'com pelo menos um registro' },
        { rot: 'Mais registros', val: maior ? maior.mun : '—', cls: 'texto',
          sub: maior ? num(maior.registros) + ' registros' : '' },
        { rot: 'Mais pessoas', val: maisPessoas ? maisPessoas.mun : '—', cls: 'texto',
          sub: maisPessoas ? num(maisPessoas.nPessoas) + ' pessoas atendidas' : '' },
        { rot: 'Regional líder', val: regTop ? regTop.rot : '—', cls: 'texto',
          sub: regTop ? num(regTop.val) + ' registros' : '' },
        { rot: 'Cobertura', val: num(muns.filter(function (a) {
          return a.mun !== 'Fora do Acre'; }).length) + '/22', cls: 'texto',
          sub: 'dos municípios do Acre' },
        { rot: 'Média de programas', val: num(muns.length
          ? muns.reduce(function (s, a) { return s + a.nProgramas; }, 0) / muns.length : 0, 1),
          sub: 'por município atendido' }
      ] }
    ]);

    desenhar('gMunRegistros', topN(muns.map(function (a) {
      return { rot: a.mun, val: a.registros }; }), 14));
    desenhar('gMunRegional', ordenar(porReg));
    desenhar('gMunPessoas', topN(muns.map(function (a) {
      return { rot: a.mun, val: a.nPessoas }; })
      .sort(function (a, b) { return b.val - a.val; }), 14));
    desenhar('gMunProgramas', muns.map(function (a) {
      return { rot: a.mun, val: a.nProgramas }; })
      .sort(function (a, b) { return b.val - a.val; }));

    tabela('tMunicipios', [
      { rot: 'Município', val: function (a) { return a.mun; } },
      { rot: 'Regional', val: function (a) { return a.reg; } },
      { rot: 'Registros', num: true, val: function (a) { return a.registros; } },
      { rot: 'Pessoas', num: true, val: function (a) { return a.nPessoas; } },
      { rot: 'Programas', num: true, semTotal: true, val: function (a) { return a.nProgramas; } },
      { rot: 'Pintos', num: true, val: function (a) { return a.pintos; } },
      { rot: 'Calcário (t)', num: true, dec: 1, val: function (a) { return a.calc; } },
      { rot: 'Nitrogênio (L)', num: true, dec: 1, val: function (a) { return a.nitro; } },
      { rot: 'Café (benef.)', num: true, val: function (a) { return a.cafe; } },
      { rot: 'Armazenagem (t)', num: true, val: function (a) { return a.armaz; } },
      { rot: 'Visitas', num: true, val: function (a) { return a.visitas; } },
      { rot: 'Capacitações', num: true, val: function (a) { return a.capac; } }
    ], muns, { total: true,
      rodape: 'Os totais das colunas somam apenas as linhas com município informado — ' +
        'as bases sem esse campo (palestras, banco de sêmen) ficam de fora.' });

    // clicar numa linha filtra aquele município
    el('tMunicipios').querySelectorAll('tbody tr').forEach(function (tr, i) {
      if (!muns[i]) return;
      tr.classList.add('lin-clique');
      tr.tabIndex = 0;
      var ir = function () {
        var m = muns[i].mun, k = F.mun.indexOf(m);
        if (k < 0) F.mun.push(m); else F.mun.splice(k, 1);
        F.reg = [];
        aplicar();
      };
      tr.addEventListener('click', ir);
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
      });
    });
  }

  /* ==================================================== ABA: BENEFICIÁRIOS */
  function resumoPessoas() {
    var m = {};
    IDS.forEach(function (cid) {
      var c = D.conjuntos[cid];
      linhas(cid).forEach(function (l) {
        if (!l.nome) return;
        var k = semAcento(l.nome);
        var a = m[k] || (m[k] = zerado({ nome: l.nome, mun: '', sexo: '' }));
        a.programas[c.sub] = true;
        if (!a.mun && l.mun) a.mun = l.mun;
        if (!a.sexo && l.sexo) a.sexo = l.sexo;
        acumular(a, cid, l);
      });
    });
    return Object.keys(m).map(function (k) {
      var a = m[k];
      a.lista = Object.keys(a.programas).sort();
      a.nProgramas = a.lista.length;
      return a;
    }).sort(function (a, b) {
      return b.nProgramas - a.nProgramas || b.registros - a.registros ||
        a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }

  var TETO_FICHA = 100;

  function verBeneficiario() {
    var pes = resumoPessoas();
    var varios = pes.filter(function (a) { return a.nProgramas > 1; });

    tiles('kpisBenef', [
      { cards: [
        { rot: 'Pessoas atendidas', val: num(pes.length), sub: 'nomes distintos no recorte' },
        { rot: 'Em mais de um programa', val: num(varios.length),
          sub: pes.length ? num(varios.length / pes.length * 100, 1) + '% do público' : '' },
        { rot: 'Municípios', val: num(distintos(pes, 'mun')), sub: 'de origem' },
        { rot: 'Mulheres', val: num(pes.filter(function (a) {
          return a.sexo === 'Feminino'; }).length), sub: 'entre quem tem o campo preenchido' },
        { rot: 'Registros por pessoa', val: num(pes.length
          ? pes.reduce(function (s, a) { return s + a.registros; }, 0) / pes.length : 0, 1),
          sub: 'média de lançamentos' },
        { rot: 'Mais programas', val: pes[0] ? num(pes[0].nProgramas) : '0',
          sub: pes[0] ? pes[0].nome : '' }
      ] }
    ]);

    desenhar('gBenefProgramas', agregarNaOrdem(pes, function (a) {
      return a.nProgramas === 1 ? '1 programa' : a.nProgramas + ' programas';
    }, ['1 programa', '2 programas', '3 programas', '4 programas', '5 programas',
      '6 programas', '7 programas']));
    desenhar('gBenefTop', topN(pes.map(function (a) {
      return { rot: a.nome, val: a.registros }; })
      .sort(function (a, b) { return b.val - a.val; }), 14));
    desenhar('gBenefMun', topN(agregar(pes, 'mun'), 14));
    desenhar('gBenefSexo', agregar(pes, 'sexo'));

    var mostra = pes.slice(0, TETO_FICHA);
    tabela('tBeneficiarios', [
      { rot: 'Pessoa', val: function (a) { return a.nome; } },
      { rot: 'Município', val: function (a) { return a.mun; } },
      { rot: 'Programas', val: function (a) { return a.lista.join(', '); } },
      { rot: 'Registros', num: true, val: function (a) { return a.registros; } },
      { rot: 'Pintos', num: true, val: function (a) { return a.pintos; } },
      { rot: 'Calcário (t)', num: true, dec: 1, val: function (a) { return a.calc; } },
      { rot: 'Nitrogênio (L)', num: true, dec: 1, val: function (a) { return a.nitro; } },
      { rot: 'Visitas', num: true, val: function (a) { return a.visitas; } },
      { rot: 'Capacitações', num: true, val: function (a) { return a.capac; } }
    ], mostra, { vazio: 'Nenhuma pessoa dentro dos filtros.',
      rodape: pes.length > TETO_FICHA
        ? 'Mostrando as ' + TETO_FICHA + ' pessoas com mais programas, de ' + num(pes.length) +
          ' no recorte. Use a busca por nome, na barra de filtros, para achar alguém específico.'
        : '' });
  }

  /* ====================================================== ABA: REGISTROS */
  var conjuntoAtual = 'nitrogenio', pag = 1;

  var ROT_CAMPO = {
    nome: 'Nome', mun: 'Município', ender: 'Endereço', prop: 'Propriedade',
    sexo: 'Sexo', idade: 'Idade', data: 'Data', ano: 'Ano', geo: 'Coordenadas',
    tipo: 'Tipo', cess: 'Cessionária', termo: 'Termo de cessão', secagem: 'Secagem',
    cap: 'Capacidade (t)', pulmao: 'Silo pulmão (t)', invest: 'Investimento (R$)',
    calc: 'Calcário (t)', npk: 'NPK (kg)', fte: 'FTE BR12 (kg)', mudas: 'Mudas (un)',
    ativ: 'Atividade', equipe: 'Equipe técnica', diarias: 'Diárias', dias: 'Dias',
    km: 'Km percorridos', corte: 'Pintos de corte', postura: 'Pintos de postura',
    total: 'Total', area: 'Área (ha)', arearec: 'Área recuperada (ha)', car: 'Registro CAR',
    kg: 'Quantidade (kg)', ton: 'Quantidade (t)', situacao: 'Situação', doc: 'Documentação',
    distrib: 'Distribuído', indic: 'Indicação', ureia: 'Ureia (kg)',
    'super': 'Superfosfato (kg)', kcl: 'Cloreto de potássio (kg)', micro: 'Micronutrientes (kg)',
    vacas: 'Vacas inseminadas', touros: 'Touros', touro: 'Touro', leite: 'Doses leite',
    prenhez: 'Prenhezes', pctprenhez: '% prenhez', bezerros: 'Bezerros',
    pctbezerros: '% bezerros', machos: 'Machos', femeas: 'Fêmeas',
    pctmachos: '% machos', pctfemeas: '% fêmeas', parto: 'Previsão de parto',
    brincos: 'ID dos brincos', nasc: 'Nascimento', pai: 'Pai', avo: 'Avô materno',
    doses: 'Doses', usadas: 'Doses utilizadas',
    disp: 'Doses disponíveis', qtd: 'Doses recebidas', reg: 'Registro', raca: 'Raça',
    valor: 'Valor (R$)', curso: 'Curso', turma: 'Turma', inst: 'Instituição',
    local: 'Local', tema: 'Tema'
  };
  var DEC_CAMPO = { calc: 1, ton: 1, area: 1, arearec: 1, valor: 2, diarias: 1, kg: 1 };

  /* Campos gravados em AAAA-MM-DD e exibidos em dd/mm/aaaa. */
  var CAMPOS_DATA = { data: true, parto: true, nasc: true };

  /* O mesmo nome de campo quer dizer coisas diferentes conforme a base: "corte"
     é pinto na incubação e dose de sêmen na inseminação. Onde há ambiguidade,
     o rótulo da base manda. */
  var ROT_POR_BASE = {
    ia: { corte: 'Doses corte', leite: 'Doses leite', touros: 'Touros utilizados' },
    ensimina: { corte: 'Doses corte', leite: 'Doses leite', data: 'Início da inseminação' },
    insumos_ia: { corte: 'Doses corte', leite: 'Doses leite', total: 'Doses recebidas' },
    nitrogenio: { kg: 'Fornecido (L)' },
    incub: { total: 'Pintos (total)' },
    pec_adubos: { total: 'Total (kg)' },
    pec_calcario: { kg: 'Calcário (kg)' },
    touros: { nome: 'Touro', data: 'Chegada', ano: 'Ano de chegada' },
    silos: { tipo: 'Natureza' },
    pec_ud: { tipo: 'Unidade' }, pec_up: { tipo: 'Unidade' },
    expoacre: { nome: 'Palestrante', ano: 'Edição' },
    curso_tec: { nome: 'Técnico' }, cafe_curso_tec: { nome: 'Técnico' },
    galinha: { nome: 'Produtora' }, incub_uds: { nome: 'Produtora' }
  };

  function rotuloCampo(cid, k) {
    var por = ROT_POR_BASE[cid];
    return (por && por[k]) || ROT_CAMPO[k] || k;
  }

  function montarSeletor() {
    var sel = el('selConjunto');
    var porDiv = {};
    IDS.forEach(function (cid) {
      var c = D.conjuntos[cid];
      (porDiv[c.div] = porDiv[c.div] || []).push(c);
    });
    sel.innerHTML = D.divisoes.map(function (d) {
      var lista = porDiv[d.id] || [];
      return '<optgroup label="' + esc(d.nome) + '">' + lista.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.nome) + ' (' + c.n + ')</option>';
      }).join('') + '</optgroup>';
    }).join('');
    sel.value = conjuntoAtual;
    sel.addEventListener('change', function () {
      conjuntoAtual = sel.value;
      pag = 1;
      verRegistros();
    });
  }

  function abrirRegistros(cid) {
    conjuntoAtual = cid;
    pag = 1;
    el('selConjunto').value = cid;
    abrirAba('registros');
  }

  function verRegistros() {
    var c = D.conjuntos[conjuntoAtual], rows = linhas(conjuntoAtual);
    var nota = el('notaConjunto');
    nota.hidden = !c.nota;
    nota.textContent = c.nota || '';

    // colunas: só os campos que aparecem de fato, na ordem em que a base os usa
    var campos = [], vistos = {};
    rows.forEach(function (l) {
      Object.keys(l).forEach(function (k) {
        if (!vistos[k] && l[k] !== '' && l[k] != null) { vistos[k] = true; campos.push(k); }
      });
    });
    var colunas = campos.map(function (k) {
      var amostra = rows.filter(function (l) { return l[k] != null && l[k] !== ''; })[0];
      var ehNum = amostra && typeof amostra[k] === 'number';
      return {
        rot: rotuloCampo(conjuntoAtual, k), num: ehNum, dec: DEC_CAMPO[k] || 0,
        val: function (l) {
          var v = l[k];
          if (Array.isArray(v)) return v.join(', ');
          if (CAMPOS_DATA[k]) return dataBR(v);
          return v;
        }
      };
    });

    var paginas = Math.max(1, Math.ceil(rows.length / POR_PAGINA));
    if (pag > paginas) pag = paginas;
    var fatia = rows.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

    tabela('tRegistros', colunas, fatia,
      { vazio: 'Nenhum registro desta base dentro dos filtros.' });

    el('paginacao').innerHTML = rows.length > POR_PAGINA
      ? '<button class="btn" type="button" data-pag="' + (pag - 1) + '"' +
          (pag === 1 ? ' disabled' : '') + '>Anterior</button>' +
        '<span class="pag-info">' + ((pag - 1) * POR_PAGINA + 1) + '–' +
          Math.min(pag * POR_PAGINA, rows.length) + ' de ' + num(rows.length) + '</span>' +
        '<button class="btn" type="button" data-pag="' + (pag + 1) + '"' +
          (pag === paginas ? ' disabled' : '') + '>Próxima</button>'
      : (rows.length ? '<span class="pag-info">' + num(rows.length) + ' registro' +
          (rows.length > 1 ? 's' : '') + '</span>' : '');
  }

  el('paginacao').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pag = +b.getAttribute('data-pag');
    verRegistros();
    el('painel-registros').scrollIntoView({ block: 'start' });
  });

  /* ------------------------------------------------------------------- URL */
  /* Mesmo endereçamento do painel da mecanização: #aab1bb?ano=…&reg=…&mun=…&nome=…
     Sem isso o link compartilhado abre a aba certa com os filtros zerados, e
     recarregar a página perde a seleção. */
  var CAMPOS_URL = ['ano', 'reg', 'mun', 'nome'];

  function estadoParaHash() {
    var p = [];
    CAMPOS_URL.forEach(function (k) {
      var v = k === 'nome' ? F.nome : F[k].join(',');
      if (v) p.push(k + '=' + encodeURIComponent(v));
    });
    return '#' + ABA + (p.length ? '?' + p.join('&') : '');
  }

  function gravarUrl(novaEntrada) {
    var h = estadoParaHash();
    if (location.hash === h) return;
    try {
      if (novaEntrada) history.pushState(null, '', h);
      else history.replaceState(null, '', h);
    } catch (e) { location.hash = h; }   // file:// sem permissão
  }

  function lerHash() {
    var bruto = location.hash.slice(1);
    var i = bruto.indexOf('?');
    var filtros = {};
    (i < 0 ? '' : bruto.slice(i + 1)).split('&').forEach(function (par) {
      var j = par.indexOf('=');
      if (j < 0) return;
      var k = par.slice(0, j);
      if (CAMPOS_URL.indexOf(k) >= 0) filtros[k] = decodeURIComponent(par.slice(j + 1));
    });
    return { aba: (i < 0 ? bruto : bruto.slice(0, i)) || '', filtros: filtros };
  }

  function listaDaUrl(v) {
    return String(v || '').split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s; });
  }

  /** Aplica um estado vindo da URL: carga inicial ou botão Voltar. Valores que
      não existem na base são descartados — um link antigo ou editado à mão
      abriria o painel com um filtro impossível e nenhum registro. */
  function aplicarEstado(est) {
    var reg = listaDaUrl(est.filtros.reg).filter(function (r) {
      return REGIONAIS.some(function (x) { return x.nome === r; });
    });
    var mun = listaDaUrl(est.filtros.mun).filter(function (m) {
      // o município precisa existir E pertencer à regional marcada, senão o
      // par regional+município se anula e o recorte fica vazio
      return D.municipios.indexOf(m) >= 0 &&
        (!reg.length || reg.indexOf(regionalDe(m)) >= 0);
    });
    F = {
      ano: listaDaUrl(est.filtros.ano).filter(function (a) { return D.anos.indexOf(a) >= 0; }),
      mun: mun,
      reg: reg,
      nome: (est.filtros.nome || '').trim()
    };
    el('buscaNome').value = F.nome;
    CACHE = {};
    pag = 1;
    montarFiltros();
    abrirAba(DESENHO[est.aba] ? est.aba : 'geral', { semUrl: true });
  }

  /* ---------------------------------------------------------------- abas */
  var ABA = 'geral';
  var DESENHO = {
    geral: verGeral, cafe: verCafe, armazenagem: verArmazenagem,
    aquicultura: verAquicultura, incubacao: verIncubacao, calcario: verCalcario,
    pecefic: verPecEficiente, genetica: verGenetica, usina: verUsina,
    atividade: verAtividade, cursos: verCursos, eventos: verEventos,
    municipio: verMunicipio, beneficiario: verBeneficiario, registros: verRegistros
  };

  function abrirAba(nome, opc) {
    if (!DESENHO[nome]) return;
    opc = opc || {};
    ABA = nome;
    document.querySelectorAll('.aba').forEach(function (b) {
      var on = b.getAttribute('data-aba') === nome;
      b.classList.toggle('ativa', on);
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.aba-conteudo').forEach(function (d) {
      d.classList.toggle('ativa', d.getAttribute('data-aba') === nome);
    });
    // trocar de aba é navegação: entra no histórico. Mudança de filtro só
    // reescreve o endereço (gravarUrl(false)), senão o Voltar viraria um
    // desfazer de clique em clique
    if (!opc.semUrl) gravarUrl(true);
    // a aba escolhida pode estar fora da parte visível da pista de abas
    var botao = document.querySelector('.aba[data-aba="' + nome + '"]');
    if (botao && botao.scrollIntoView) {
      botao.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    // atualizar() reescreve o resumo dos filtros e desenha a aba agora ativa —
    // chamar só DESENHO deixaria o resumo em branco na primeira pintura
    atualizar();
  }

  document.getElementById('abas').addEventListener('click', function (e) {
    var b = e.target.closest('.aba');
    if (b) abrirAba(b.getAttribute('data-aba'));
  });

  /* ------------------------------------------------------------- atualizar */
  function atualizar() {
    var partes = [];
    if (F.ano.length) partes.push(F.ano.length === 1 ? 'ano de ' + F.ano[0] : F.ano.length + ' anos');
    if (F.reg.length) partes.push(F.reg.length === 1 ? 'regional ' + F.reg[0] : F.reg.length + ' regionais');
    if (F.mun.length) partes.push(F.mun.length === 1 ? F.mun[0] : F.mun.length + ' municípios');
    if (F.nome) partes.push('nome contendo "' + F.nome + '"');

    var total = IDS.reduce(function (a, cid) { return a + linhas(cid).length; }, 0);
    el('resumo').innerHTML = '<strong>' + num(total) + '</strong> registro' +
      (total === 1 ? '' : 's') + ' · ' +
      esc(partes.length ? partes.join(' · ') : 'sem filtros');

    DESENHO[ABA]();
  }

  /* ------------------------------------------------------------------ início */
  montarControles();
  montarFiltros();
  montarSeletor();
  pintarBotaoTema();
  el('temaBtn').addEventListener('click', trocarTema);
  el('btnLimpar').addEventListener('click', limpar);

  var tempoBusca = null;
  el('buscaNome').addEventListener('input', function (e) {
    clearTimeout(tempoBusca);
    var v = e.target.value;
    tempoBusca = setTimeout(function () { F.nome = v.trim(); aplicar(); }, 220);
  });

  var fonte = 'Fonte: ' + D.meta.arquivo + ' · atualizado em ' + D.meta.gerado_em +
    ' · ' + num(D.meta.registros) + ' registros em ' + D.meta.conjuntos + ' bases';
  // a regra de alcance dos filtros precisa estar à vista: sem ela, o total do
  // resumo parece não bater com o gráfico por município
  el('fonte').textContent = 'Ano, regional e município filtram apenas as bases ' +
    'que trazem esses campos — as demais (silos, palestras, banco de sêmen) ' +
    'aparecem inteiras. ' + fonte;
  el('rodapeFonte').textContent = fonte;

  // Voltar/Avançar percorrem as seleções, não só as abas
  window.addEventListener('popstate', function () { aplicarEstado(lerHash()); });

  aplicarEstado(lerHash());
  gravarUrl(false);   // deixa a URL refletir a seleção já no primeiro desenho
})();
