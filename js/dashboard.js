/* Painel da Mecanização — SEAGRI
   Fonte dos dados do ANO CORRENTE, na ordem em que é tentada:
     1. data/mecanizacao.json  — publicado pelo admin na aba "Atualizar dados"
     2. localStorage           — carga de teste feita só neste navegador
     3. js/dados-mecanizacao.js— arquivo embutido, gerado por tools/gerar_dados_mecanizacao.py

   Os exercícios ENCERRADOS (2023–2025) vêm sempre de
   js/dados-mecanizacao-historico.js, gerado por tools/gerar_historico_mecanizacao.py.
   Ficam num arquivo à parte de propósito: são dados fechados, que não mudam,
   e assim publicar uma planilha nova do ano corrente não apaga o histórico.

   Regras do painel:
   - o EXERCÍCIO de um registro é o da planilha em que ele foi lançado, e é por
     ele que o filtro "Período" recorta. Assim o total de cada ano bate com o
     SOMA do Excel daquela planilha;
   - dentro do exercício, o MÊS é o da VISTORIA (quando o serviço foi feito)
     sempre que ela é plausível; quando não é — ano digitado errado, data
     futura — vale a data de INSERÇÃO ("Carimbo de data/hora") e a listagem
     marca a célula. Ver anoDe()/dataRef()/vistoriaValida() logo abaixo;
   - mecanização se mede em hectares; açudagem, em horas de máquina e nº de tanques;
   - todo gráfico aceita mais de um tipo de visualização, coerente com o dado;
   - clicar numa marca filtra e leva para a aba correspondente;
   - o filtro "Período" (2026…2023, Geral) escolhe o recorte de ano; todas as
     abas de seção têm a mesma estrutura em qualquer período. */
(function () {
  'use strict';

  var NI = 'Não informado';
  var MEC = 'Mecanização';
  var ACU = 'Açudagem';
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  /* Não há hash de senha aqui: quem confere é salvar_mecanizacao.php. Um hash
     neste arquivo seria baixado por qualquer visitante e quebrado offline. */
  var CHAVE_LOCAL = 'seagri_mecanizacao';
  /* Preferências de apresentação. Ficam no navegador porque são de quem olha,
     não da seleção: quem prefere barras reclicava 32 painéis a cada visita. */
  var CHAVE_TIPOS = 'seagri_tipos_grafico';
  var CHAVE_POR_PAG = 'seagri_por_pagina';

  function lerPref(chave, padrao) {
    try {
      var v = localStorage.getItem(chave);
      return v == null ? padrao : v;
    } catch (e) { return padrao; }   // modo privado
  }

  var CONSOLIDADO = 'todos';

  /* Versão usada no cache-busting dos assets, lida do próprio <script> para o
     histórico carregado sob demanda usar exatamente a mesma. */
  var VERSAO = (function () {
    var s = document.currentScript;
    var m = s && s.src && s.src.match(/[?&]v=([^&]+)/);
    return m ? m[1] : '';
  })();

  var TODOS = [], META = {}, META_HIST = {}, FONTE = '', ANOS = [];
  var N_CORRENTE = 0;   // registros vindos da planilha do ano corrente (sem o histórico)
  var ORDEM = { tipo: [MEC, ACU], sistema: [] };

  /* ------------------------------------------------- data de referência ----
     O EXERCÍCIO de um registro é o da planilha em que ele foi lançado, não o
     da Data da Vistoria. É o que faz o total do painel bater com o SOMA do
     Excel: a planilha de 2026 tem 632 linhas somando 4.667,4 ha, e as 60 cujo
     serviço foi feito em 2025 continuam contando em 2026, porque é lá que
     estão. Antes elas migravam para 2025 e o painel mostrava 4.231,0 ha —
     correto pela data do serviço, mas impossível de conferir contra a planilha.

     Dentro do exercício, o MÊS ainda é o do serviço: a Data da Vistoria quando
     é plausível (ocorreu até o lançamento e no máximo 18 meses antes), senão a
     data de lançamento. Só que ela tem digitação errada — anos como 1949 ou
     0023, datas futuras —, e nesses casos a listagem marca a célula. */
  var JANELA_VISTORIA = 18;   // meses

  function difMeses(a, b) {
    return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  }

  function vistoriaValida(r) {
    if (!r.dv || !r.d) return false;
    if (r.dv > r.d) return false;                       // serviço "no futuro"
    return difMeses(r.dv, r.d) <= JANELA_VISTORIA;      // ou velho demais
  }

  /** Data do serviço. Manda no mês, na ordenação e no período exibido — não no
      exercício, que é o da planilha (ver anoDe). */
  function dataRef(r) { return vistoriaValida(r) ? r.dv : r.d; }

  /** Exercício: a planilha a que a linha pertence. No pacote do ano corrente
      `ex` é o ano do lançamento; no histórico vem da coluna "Ano". */
  function anoDe(r) { return r.ex || r.d.slice(0, 4); }

  /** Mês do registro dentro do seu exercício ("2026-11"). O ano vem do
      EXERCÍCIO, não da vistoria: senão um serviço de novembro/2025 lançado na
      planilha de 2026 contaria como um mês à parte de novembro/2026, e o
      contador "Meses com vistoria" passaria dos 12 dentro de um único ano. */
  function mesChave(r) { return anoDe(r) + '-' + dataRef(r).slice(5, 7); }

  /* -------------------------------------------------------------- utilidades */
  function el(id) { return document.getElementById(id); }
  /** Espera parar de digitar antes de refazer o trabalho. Sem isto cada tecla
      refiltrava a base inteira, o que travava a digitação no "Geral". */
  function atrasar(fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }
  function unicos(arr) {
    return Array.from(new Set(arr)).filter(function (v) { return v && v !== NI; })
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }
  function soma(arr, f) { return arr.reduce(function (a, r) { return a + (f(r) || 0); }, 0); }
  function contar(arr, f) {
    var m = new Map();
    arr.forEach(function (r) {
      var vs = f(r);
      (Array.isArray(vs) ? vs : [vs]).forEach(function (v) {
        if (v == null || v === '') return;
        m.set(v, (m.get(v) || 0) + 1);
      });
    });
    return m;
  }
  function somarPor(arr, chave, valor) {
    var m = new Map();
    arr.forEach(function (r) {
      var k = chave(r);
      if (k == null || k === '') return;
      m.set(k, (m.get(k) || 0) + (valor(r) || 0));
    });
    return m;
  }
  function distintosPor(arr, chave, valor) {
    var m = new Map();
    arr.forEach(function (r) {
      var k = chave(r), v = valor(r);
      if (k == null || k === '' || v == null || v === '' || v < 0) return;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    });
    var out = new Map();
    m.forEach(function (s, k) { out.set(k, s.size); });
    return out;
  }
  function ranking(m, lim, agrupar) {
    var l = Array.from(m, function (e) { return { rot: e[0], val: e[1] }; })
      .filter(function (d) { return d.val > 0; })
      .sort(function (a, b) { return b.val - a.val || a.rot.localeCompare(b.rot, 'pt-BR'); });
    if (lim && l.length > lim) {
      var resto = l.slice(lim - (agrupar ? 1 : 0));
      l = l.slice(0, lim - (agrupar ? 1 : 0));
      if (agrupar) l.push({ rot: 'Outros', val: resto.reduce(function (a, d) { return a + d.val; }, 0) });
    }
    return l;
  }
  function faixas(D, valor, cortes) {
    var m = new Map();
    cortes.forEach(function (c) { m.set(c.rot, 0); });
    D.forEach(function (r) {
      var v = valor(r);
      if (!v) return;
      for (var i = 0; i < cortes.length; i++) {
        if (v <= cortes[i].max) { m.set(cortes[i].rot, m.get(cortes[i].rot) + 1); break; }
      }
    });
    return Array.from(m, function (e) { return { rot: e[0], val: e[1] }; })
      .filter(function (d) { return d.val > 0; });
  }
  function moeda(v) {
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function dataBR(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  /** Cor da etiqueta de serviço. Há registro sem Ponto de controle preenchido:
      sem o caso neutro ele saía com a etiqueta de açudagem, dizendo "Não
      informado" em cima da cor de um serviço que ele não é. */
  function tagServico(pc) {
    return pc === MEC ? 'tag-mec' : pc === ACU ? 'tag-acu' : 'tag-ni';
  }
  /** Rótulo de mês. Sem o ano: dentro de um exercício o ano já está dito no
      seletor de período, e imprimi-lo aqui mentiria nas vistorias feitas no ano
      anterior — um serviço de dezembro/2025 lançado na planilha de 2026 saía
      como "dez/26", um mês que ainda não aconteceu. */
  function mesRot(ym) { return MESES[+ym.slice(5, 7) - 1]; }
  function rotParaMes(rot) {
    var i = MESES.indexOf(String(rot).split('/')[0]);
    return i < 0 ? '' : String(i + 1).padStart(2, '0');
  }
  /** Quantas categorias distintas existem num campo, DESPREZANDO
      "Não informado" e vazio. Sem isto, um único registro sem município faz o
      painel anunciar um município a mais do que realmente foi atendido. */
  function nDistintos(D, f) {
    var s = new Set();
    D.forEach(function (r) {
      var v = f(r);
      if (v && v !== NI) s.add(v);
    });
    return s.size;
  }

  /** Identidade do produtor: o NOME, normalizado (sem acento, sem caixa, sem
      espaço dobrado). É a única identidade que o painel conhece — documentos
      pessoais não são lidos da planilha nem publicados nos dados.
      Não usamos nome+imóvel: 209 produtores aparecem com o imóvel grafado de
      formas diferentes (ou em branco num registro e preenchido noutro), o que
      inflava a contagem em 307 pessoas que não existem. */
  function chaveProdutor(r) { return chaveBusca(r.prod).replace(/\s+/g, ' ').trim(); }

  /** Produtores distintos. O mesmo produtor atendido várias vezes no ano — ou
      em exercícios diferentes — conta uma vez só. */
  function nProdutores(D) {
    var s = new Set();
    D.forEach(function (r) {
      var k = chaveProdutor(r);
      if (k) s.add(k);
    });
    return s.size;
  }

  /** Quantos atendimentos cada produtor teve na seleção. */
  function atendimentosPorProdutor(D) {
    var m = new Map();
    D.forEach(function (r) {
      var k = chaveProdutor(r);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }

  /* ------------------------------------------------------------------- tema */
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
    atualizar(); // as cores das séries vêm do CSS: todo desenho ficou velho
  }

  /* ------------------------------------------------------------- regionais --
     Regionais de desenvolvimento do Acre. A planilha não traz esse campo: o
     município é a única informação territorial da linha, então a regional é
     derivada dele por esta tabela. Os 22 municípios do estado estão aqui,
     mesmo os que ainda não aparecem na base — assim uma linha nova de Jordão
     ou Porto Walter já cai na regional certa sem mexer no código. */
  var REGIONAIS = [
    { nome: 'Alto Acre', muns: ['Assis Brasil', 'Brasiléia', 'Epitaciolândia', 'Xapuri'] },
    { nome: 'Baixo Acre', muns: ['Acrelândia', 'Bujari', 'Capixaba', 'Plácido de Castro',
      'Porto Acre', 'Rio Branco', 'Senador Guiomard'] },
    { nome: 'Purus', muns: ['Manoel Urbano', 'Santa Rosa do Purus', 'Sena Madureira'] },
    { nome: 'Tarauacá/Envira', muns: ['Feijó', 'Jordão', 'Tarauacá'] },
    { nome: 'Juruá', muns: ['Cruzeiro do Sul', 'Mâncio Lima', 'Marechal Thaumaturgo',
      'Porto Walter', 'Rodrigues Alves'] }
  ];

  /** Município → regional. A chave passa por chaveBusca (sem acento, sem caixa)
      porque a planilha grafa o mesmo município de formas diferentes — "Brasileia"
      sem acento e "BRASILÉIA" em caixa alta convivem na base. */
  var REG_DE_MUN = (function () {
    var m = {};
    REGIONAIS.forEach(function (r) {
      r.muns.forEach(function (mun) { m[chaveBusca(mun)] = r.nome; });
    });
    return m;
  })();

  /** Regional de um registro. Vazio quando o município é desconhecido ou não
      informado — esses só aparecem quando nenhuma regional está marcada. */
  function regionalDe(mun) { return REG_DE_MUN[chaveBusca(mun || '')] || ''; }

  /* ---------------------------------------------------------------- filtros */
  /* TODO filtro é uma LISTA e aceita mais de um valor: "2025 e 2026",
     "jan a mar", "Rio Branco e Xapuri", "Café e Mandioca". Lista vazia é "sem
     recorte" — no período significa o consolidado; nos demais, todos.
     O painel abre com tudo vazio, exceto o período, que abre no exercício mais
     recente: a tela inicial é o ano corrente inteiro. */
  var F = { ano: [], mes: [], pc: [], reg: [], mun: [], esc: [], cult: [], tec: [] };

  /* --------------------------------------------- caixa de seleção múltipla --
     TODOS os filtros da lateral são iguais: um botão que abre uma lista de
     caixas de marcação. Ver .multi no CSS para o porquê de não ser um
     <select multiple>.
     MULTI[id] = { itens:[{v,rot}], sel:[], vazio, plural, rotulo, aoMudar }

     A lista abre com tudo DESMARCADO, e nada marcado é "sem recorte": o painel
     mostra todos os registros do período. Marcar é sempre restringir, nunca o
     contrário — por isso o estado cheio é guardado como lista vazia, e não
     como a lista inteira. É também o que mantém a seleção honesta quando o
     conjunto muda: o histórico chega depois do primeiro desenho e traz
     municípios novos, que assim entram na conta sozinhos, em vez de ficarem
     calados fora de uma lista congelada. */
  var MULTI = {};

  /* Listas longas ganham um campo de busca no topo. No "Geral" são mais de 100
     técnicos e 36 culturas: rolar até achar alguém é pior do que digitar três
     letras. As curtas (período, mês, serviço, regional) não ganham — ali o
     campo só tomaria espaço. O texto digitado vive fora do cfg porque a caixa é
     redesenhada a cada marcação, e perder o que se está digitando no meio da
     escolha seria o mesmo que não ter busca. */
  // 12 é o tamanho de um ano em meses: assim o filtro de mês nunca ganha busca,
  // por mais cheio que esteja, e município, escritório, cultura e técnico ganham
  var MIN_ITENS_BUSCA = 12;
  var BUSCA_MULTI = {};

  function temBuscaMulti(cfg) { return cfg.itens.length > MIN_ITENS_BUSCA; }

  /** Esconde os itens que não casam com o texto. Esconder em vez de redesenhar
      preserva as marcações e o cursor de quem está digitando. */
  function filtrarItensMulti(id) {
    var caixa = el(id);
    if (!caixa) return;
    var q = chaveBusca((BUSCA_MULTI[id] || '').trim());
    var achou = 0;
    caixa.querySelectorAll('.multi-item').forEach(function (item) {
      var casa = !q || chaveBusca(item.textContent).indexOf(q) >= 0;
      item.hidden = !casa;
      if (casa) achou++;
    });
    var sem = caixa.querySelector('.multi-sem');
    if (sem) sem.hidden = !!achou;
  }

  function resumoMulti(cfg) {
    if (!cfg.sel.length) return cfg.vazio;
    if (cfg.sel.length === 1) {
      var achado = cfg.itens.filter(function (i) { return i.v === cfg.sel[0]; })[0];
      return achado ? achado.rot : cfg.sel[0];
    }
    return cfg.sel.length + ' ' + cfg.plural;
  }

  /** Redesenha a caixa inteira. Só quando a LISTA muda (troca de base, outro
      filtro mexeu nas opções) — marcar um item não passa por aqui, senão o
      checkbox recém-clicado sumiria debaixo do cursor e o foco se perderia. */
  function desenharMulti(id) {
    var cfg = MULTI[id], caixa = el(id);
    if (!cfg || !caixa) return;
    var aberto = caixa.getAttribute('data-aberto') === '1';
    /* Marcar um mês refaz as listas de todos os filtros, e isso passa por aqui:
       sem devolver o foco, quem navega por teclado era jogado para o começo da
       página a cada item marcado. */
    var focado = document.activeElement;
    var dentro = focado && caixa.contains(focado);
    var vFocado = (dentro && focado.type === 'checkbox') ? focado.value : null;
    var buscaFocada = dentro && focado.classList &&
      focado.classList.contains('multi-busca');
    var busca = temBuscaMulti(cfg);
    caixa.innerHTML =
      '<button type="button" class="multi-btn" aria-haspopup="true" aria-expanded="' +
        (aberto ? 'true' : 'false') + '" aria-labelledby="' + cfg.rotulo + ' ' + id + 'Txt">' +
        '<span class="multi-txt" id="' + id + 'Txt">' + G.esc(resumoMulti(cfg)) + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="multi-lista"' + (aberto ? '' : ' hidden') + '>' +
        (busca ? '<input type="search" class="multi-busca" autocomplete="off"' +
          ' placeholder="Buscar&hellip;" aria-label="Buscar nas op&ccedil;&otilde;es" value="' +
          G.esc(BUSCA_MULTI[id] || '') + '">' : '') +
        cfg.itens.map(function (i) {
          return '<label class="multi-item"><input type="checkbox" value="' + G.esc(i.v) + '"' +
            (cfg.sel.indexOf(i.v) >= 0 ? ' checked' : '') + '>' + G.esc(i.rot) + '</label>';
        }).join('') +
        (busca ? '<p class="multi-sem" hidden>Nada encontrado</p>' : '') +
        '<button type="button" class="btn multi-limpar"' + (cfg.sel.length ? '' : ' hidden') + '>' +
        G.esc(cfg.vazio) + '</button>' +
      '</div>';
    if (busca) filtrarItensMulti(id);
    if (buscaFocada) {
      var cb = caixa.querySelector('.multi-busca');
      // o cursor vai para o fim: devolver o foco com a seleção inteira marcada
      // apagaria o que foi digitado na tecla seguinte
      if (cb) { cb.focus(); cb.setSelectionRange(cb.value.length, cb.value.length); }
    } else if (vFocado != null) {
      var volta = caixa.querySelector('input[value="' + vFocado.replace(/"/g, '\\"') + '"]');
      if (volta) volta.focus();
    }
  }

  /** Só o que muda ao marcar/desmarcar: resumo do botão e o botão de limpar. */
  function atualizarResumoMulti(id) {
    var cfg = MULTI[id], caixa = el(id);
    if (!cfg || !caixa) return;
    var txt = el(id + 'Txt'), limpar = caixa.querySelector('.multi-limpar');
    if (txt) txt.textContent = resumoMulti(cfg);
    if (limpar) limpar.hidden = !cfg.sel.length;
  }

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

  /** Liga os eventos uma vez só: o conteúdo é redesenhado, o container não. */
  function ligarMulti(id) {
    var caixa = el(id);
    if (!caixa || caixa.getAttribute('data-ligado') === '1') return;
    caixa.setAttribute('data-ligado', '1');

    caixa.addEventListener('click', function (e) {
      if (e.target.closest('.multi-btn')) {
        var abrindo = caixa.getAttribute('data-aberto') !== '1';
        fecharMultis(id);
        abrirMulti(id, abrindo);
        // abrir é sempre do zero: uma busca velha esconderia opções sem que
        // ninguém tivesse pedido. Com a lista já na tela, o cursor vai direto
        // para o campo — quem abriu a caixa dos técnicos quer digitar
        if (abrindo) {
          BUSCA_MULTI[id] = '';
          var cb = caixa.querySelector('.multi-busca');
          if (cb) { cb.value = ''; filtrarItensMulti(id); cb.focus(); }
        }
        return;
      }
      if (e.target.closest('.multi-limpar')) {
        MULTI[id].sel = [];
        desenharMulti(id);
        abrirMulti(id, true);
        MULTI[id].aoMudar([]);
      }
    });

    // busca dentro da lista: filtra a cada tecla, sem redesenhar
    caixa.addEventListener('input', function (e) {
      if (!e.target.classList.contains('multi-busca')) return;
      BUSCA_MULTI[id] = e.target.value;
      filtrarItensMulti(id);
    });

    caixa.addEventListener('change', function (e) {
      var cx = e.target;
      if (!cx || cx.type !== 'checkbox') return;
      var cfg = MULTI[id];
      var marcados = {};
      cfg.sel.forEach(function (v) { marcados[v] = true; });
      if (cx.checked) marcados[cx.value] = true; else delete marcados[cx.value];
      // reordena pela ordem da lista: a seleção vira rótulo e URL, e "2026,2025"
      // saindo em ordem de clique deixaria links iguais com textos diferentes
      cfg.sel = cfg.itens.map(function (i) { return i.v; })
        .filter(function (v) { return marcados[v]; });
      atualizarResumoMulti(id);
      cfg.aoMudar(cfg.sel.slice());
    });

    caixa.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      // com busca digitada, Esc limpa a busca; só o segundo Esc fecha a caixa
      if (e.target.classList.contains('multi-busca') && e.target.value) {
        e.stopPropagation();
        e.target.value = '';
        BUSCA_MULTI[id] = '';
        filtrarItensMulti(id);
        return;
      }
      abrirMulti(id, false);
      var btn = caixa.querySelector('.multi-btn');
      if (btn) btn.focus();
    });
  }

  /** Registra/atualiza uma caixa. `itens` e `sel` chegam prontos de quem chama. */
  function montarMulti(id, cfg) {
    MULTI[id] = cfg;
    ligarMulti(id);
    desenharMulti(id);
  }

  // clique fora fecha as listas abertas
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.multi')) fecharMultis(null);
  });

  /** Opções de um filtro: o que ainda existe na seleção, mais o que já está
      marcado. O marcado entra mesmo sem registros — senão a escolha sumiria da
      lista ao mexer noutro campo, continuando a valer em silêncio. */
  function itensDe(valores, marcados) {
    var l = unicos(valores);
    marcados.forEach(function (v) { if (l.indexOf(v) < 0) l.push(v); });
    return l.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); })
      .map(function (v) { return { v: v, rot: v }; });
  }

  /** Registra uma caixa de filtro. Todas se comportam igual: marcar restringe,
      nada marcado é tudo, e mexer numa reajusta as listas das outras. */
  function multiFiltro(id, campo, cfg) {
    montarMulti(id, {
      itens: cfg.itens, sel: F[campo].slice(), vazio: cfg.vazio,
      plural: cfg.plural, rotulo: cfg.rotulo,
      aoMudar: cfg.aoMudar || function (sel) {
        F[campo] = sel;
        pag = 1;
        popularFiltros();   // as outras listas se ajustam à nova escolha
        atualizar();
      }
    });
  }

  /** Filtros dinâmicos: cada campo lista só o que ainda existe depois de
      aplicados os OUTROS filtros. Escolhido "Xapuri", a lista de técnicos passa
      a mostrar apenas quem atendeu lá — nunca uma opção que zera a seleção.
      O próprio campo não entra na conta: senão ele mostraria só o seu valor. */
  function popularFiltros() {
    var meses = Array.from(new Set(filtrar('mes').map(function (r) {
      return dataRef(r).slice(5, 7);
    }))).sort();
    // os meses já marcados ficam na lista mesmo sem registros: sumir da lista
    // enquanto continuam valendo no filtro seria mentir sobre a seleção
    F.mes.forEach(function (m) { if (meses.indexOf(m) < 0) meses.push(m); });
    meses.sort();
    multiFiltro('fMes', 'mes', {
      itens: meses.map(function (m) {
        return { v: m, rot: MESES[+m - 1].charAt(0).toUpperCase() + MESES[+m - 1].slice(1) };
      }),
      vazio: 'Todos os meses', plural: 'meses', rotulo: 'rotMes'
    });

    multiFiltro('fPonto', 'pc', {
      itens: itensDe(filtrar('pc').map(function (r) { return r.pc; }), F.pc),
      vazio: 'Todos os serviços', plural: 'serviços', rotulo: 'rotPonto'
    });

    /* Regionais: só as que têm registro no recorte, na ordem geográfica da
       tabela (Alto Acre → Juruá), não em ordem alfabética. Uma regional sem
       nenhum atendimento no período não entra: marcá-la zeraria o painel. */
    var comReg = {};
    filtrar(['reg', 'mun']).forEach(function (r) {
      var g = regionalDe(r.mun);
      if (g) comReg[g] = true;
    });
    F.reg.forEach(function (g) { comReg[g] = true; });
    multiFiltro('fReg', 'reg', {
      itens: REGIONAIS.filter(function (r) { return comReg[r.nome]; })
        .map(function (r) { return { v: r.nome, rot: r.nome }; }),
      vazio: 'Todas as regionais', plural: 'regionais', rotulo: 'rotReg',
      aoMudar: function (sel) {
        F.reg = sel;
        /* A regional manda no município: marcar o Juruá tem de mostrar o Juruá
           inteiro, e não a interseção com um município do Alto Acre que ficou
           marcado de antes — isso esvaziaria o painel sem explicar por quê.
           Zerar o município deixa valendo a regional sozinha. */
        F.mun = [];
        pag = 1;
        popularFiltros();
        atualizar();
      }
    });

    /* Municípios: a lista já sai recortada pela regional, porque filtrar('mun')
       aplica todos os outros filtros — inclusive o de regional. */
    multiFiltro('fMun', 'mun', {
      itens: itensDe(filtrar('mun').map(function (r) { return r.mun; }), F.mun),
      vazio: 'Todos os municípios', plural: 'municípios', rotulo: 'rotMun'
    });

    multiFiltro('fEsc', 'esc', {
      itens: itensDe(filtrar('esc').map(function (r) { return r.esc; }), F.esc),
      vazio: 'Todos os escritórios', plural: 'escritórios', rotulo: 'rotEsc'
    });

    var culturas = [];
    filtrar('cult').forEach(function (r) { r.cult.forEach(function (c) { culturas.push(c[0]); }); });
    multiFiltro('fCult', 'cult', {
      itens: itensDe(culturas, F.cult),
      vazio: 'Todas as culturas', plural: 'culturas', rotulo: 'rotCult'
    });

    multiFiltro('fTec', 'tec', {
      itens: itensDe(filtrar('tec').map(function (r) { return r.rt; }), F.tec),
      vazio: 'Todos os técnicos', plural: 'técnicos', rotulo: 'rotTec'
    });
  }

  function ligarFiltros() {
    // todo filtro da lateral é caixa de marcação: liga-se em montarMulti()
    el('btnLimpar').addEventListener('click', function () {
      // o exercício não é um filtro comum: continua sendo o do período escolhido
      F = { ano: F.ano, mes: [], pc: [], reg: [], mun: [], esc: [], cult: [], tec: [] };
      el('busca').value = '';
      pag = 1;
      popularFiltros();
      atualizar();
    });
  }

  /** Aplica a seleção. `exceto` deixa um filtro de fora — é o que permite
      montar a lista de opções de um campo sem que ele restrinja a si mesmo.
      Aceita uma lista de campos: a de regionais precisa ignorar também o
      município, porque escolher outra regional zera o município. */
  function filtrar(exceto, anoAlvo) {
    var fora = Array.isArray(exceto) ? exceto : [exceto];
    function sem(k) { return fora.indexOf(k) >= 0; }
    // anoAlvo é sempre um exercício só (a comparação com o ano anterior)
    var anos = (anoAlvo === undefined) ? F.ano : (anoAlvo ? [anoAlvo] : []);
    return TODOS.filter(function (r) {
      if (anos.length && anos.indexOf(anoDe(r)) < 0) return false;
      if (!sem('mes') && F.mes.length && F.mes.indexOf(dataRef(r).slice(5, 7)) < 0) return false;
      if (!sem('pc') && F.pc.length && F.pc.indexOf(r.pc) < 0) return false;
      /* Regional e município são listas, e lista vazia é TODOS. A regional é
         derivada do município (ver REGIONAIS): marcá-la traz de uma vez os
         registros de todos os municípios dela. */
      if (!sem('reg') && F.reg.length && F.reg.indexOf(regionalDe(r.mun)) < 0) return false;
      if (!sem('mun') && F.mun.length && F.mun.indexOf(r.mun) < 0) return false;
      if (!sem('esc') && F.esc.length && F.esc.indexOf(r.esc) < 0) return false;
      if (!sem('tec') && F.tec.length && F.tec.indexOf(r.rt) < 0) return false;
      // basta UMA das culturas do atendimento estar marcada
      if (!sem('cult') && F.cult.length &&
        !r.cult.some(function (c) { return F.cult.indexOf(c[0]) >= 0; })) return false;
      return true;
    });
  }

  /* ----------------------------------------------------- seletor de período */
  /** Uma caixa por exercício encontrado na base. Nada marcado é o consolidado:
      não há item "Geral" na lista, ele é o estado de lista vazia — assim marcar
      2025 e 2026 e depois desmarcar os dois volta ao geral sem passo extra.
      Trocar de período não muda a estrutura do painel: as mesmas abas e os
      mesmos gráficos são redesenhados com o novo recorte. */
  function montarSeletorAno() {
    var caixa = el('filtroExercicio');
    if (!caixa || !el('fExercicio')) return;
    caixa.hidden = ANOS.length <= 1;   // ANOS vem do mais recente para o mais antigo
    montarMulti('fExercicio', {
      itens: ANOS.map(function (a) { return { v: a, rot: a }; }),
      sel: F.ano.slice(), vazio: 'Geral', plural: 'exercícios', rotulo: 'rotExercicio',
      aoMudar: selecionarAnos
    });
  }

  /** Período coberto pela seleção, para títulos e legendas. */
  function rotuloAno() {
    if (F.ano.length) return F.ano.slice().sort().join(', ');
    var anos = ANOS.slice().sort();
    return anos.length ? anos[0] + ' a ' + anos[anos.length - 1] : '';
  }

  function sincronizarAno() {
    var cfg = MULTI.fExercicio;
    if (cfg) { cfg.sel = F.ano.slice(); desenharMulti('fExercicio'); }
    var tit = el('tituloPainel');
    if (tit) {
      tit.textContent = 'SISTEMA';
    }
  }

  /** Troca o período. Os demais filtros são zerados porque foram escolhidos
      dentro de outro recorte — manter "Cultura = Café" ao pular para 2023
      esconde dados sem o usuário perceber.
      A escolha vale só para a visita: recarregar volta ao ano corrente. */
  function selecionarAnos(anos) {
    // escolha manual cancela os anos pendentes da URL: o histórico pode chegar
    // depois, e trocar o período debaixo de quem acabou de escolher é pior
    // do que ignorar o link
    anoPendenteUrl = [];
    F = { ano: anos.slice(), mes: [], pc: [], reg: [], mun: [], esc: [], cult: [], tec: [] };
    if (el('busca')) el('busca').value = '';
    pag = 1;
    popularFiltros();
    sincronizarAno();
    atualizar();
  }

  /** O painel sempre abre no ano corrente — o mais recente da base. Devolve
      lista para casar com F.ano; base vazia dá lista vazia, e não [''], que
      seria um exercício inexistente filtrando tudo para fora. */
  function anosIniciais() {
    return ANOS.length ? [ANOS[0]] : [];   // ANOS vem do mais recente para o mais antigo
  }

  /* ------------------------------- registro de painéis e tipos de gráfico */
  var TIPOS = {}, PAYLOAD = {};
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

  /** Tipo escolhido por painel na última visita. */
  var TIPOS_SALVOS = (function () {
    try { return JSON.parse(lerPref(CHAVE_TIPOS, '{}')) || {}; } catch (e) { return {}; }
  })();

  function salvarTipos() {
    try { localStorage.setItem(CHAVE_TIPOS, JSON.stringify(TIPOS)); } catch (e) { /* modo privado */ }
  }

  function montarControles() {
    document.querySelectorAll('[data-tipos]').forEach(function (div) {
      var id = div.id;
      var tipos = div.getAttribute('data-tipos').split(',');
      // a tabela é a visão padrão de todo painel: encabeça os botões e é o que
      // aparece na primeira visita
      var iTab = tipos.indexOf('tabela');
      if (iTab > 0) {
        tipos.splice(iTab, 1);
        tipos.unshift('tabela');
      }
      // a escolha da última visita vale, desde que ainda seja um tipo válido
      // para este painel (a lista de tipos pode ter mudado no HTML)
      TIPOS[id] = tipos.indexOf(TIPOS_SALVOS[id]) >= 0 ? TIPOS_SALVOS[id] : tipos[0];

      var cab = div.closest('.painel').querySelector('.painel-cab');
      var acoes = document.createElement('div');
      acoes.className = 'painel-acoes';

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
        salvarTipos();
      });
      acoes.appendChild(grupo);

      var ir = div.getAttribute('data-ir');
      if (ir) {
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'painel-link';
        link.textContent = 'ver detalhes →';
        link.addEventListener('click', function () { abrirAba(ir); });
        acoes.appendChild(link);
      }
      cab.appendChild(acoes);
    });
  }

  function aoClicarDe(div) {
    var campo = div.getAttribute('data-clique');
    if (!campo) return null;
    var irPadrao = div.getAttribute('data-ir');
    return function (rot) {
      if (rot === 'Outros') return;
      // variável local: reatribuir a do closure fazia o destino escolhido num
      // clique valer para os cliques seguintes no mesmo gráfico
      var ir = irPadrao;
      if (campo === 'mes') {
        // no consolidado o eixo do tempo é o ano: clicar abre aquele exercício
        if (porAno()) return selecionarAnos([rot]);
        var m = rotParaMes(rot);
        // clicar alterna o mês dentro da seleção: dá para somar meses no gráfico
        var iM = F.mes.indexOf(m);
        if (iM < 0) F.mes = F.mes.concat([m]).sort(); else F.mes.splice(iM, 1);
      } else if (campo === 'pc') {
        var ligando = !(F.pc.length === 1 && F.pc[0] === rot);
        F.pc = ligando ? [rot] : [];
        // desmarcar o serviço não é "ir para o serviço": só abre a aba ao ligar
        ir = ligando ? (rot === ACU ? 'acudagem' : rot === MEC ? 'mecanizacao' : irPadrao) : irPadrao;
      } else {
        var k = { mun: 'mun', esc: 'esc', cult: 'cult', tec: 'tec' }[campo];
        if (!k) return;
        /* Clicar numa barra é ir para aquele valor, não somá-lo à seleção: quem
           clica quer o detalhe de um. Clicar no que já está sozinho na seleção
           desfaz e volta para todos. Somar vários é trabalho da caixa lateral. */
        F[k] = (F[k].length === 1 && F[k][0] === rot) ? [] : [rot];
      }
      // clicar num gráfico é escolher um filtro: as demais listas se ajustam
      popularFiltros();
      pag = 1;
      if (ir) { invalidar(); abrirAba(ir); } else atualizar();
    };
  }

  /** Título do painel que contém o gráfico. Vira o aria-label do SVG: sem ele
      todos os gráficos da tela se anunciavam como "Distribuição" ou "Série
      temporal", um rótulo igual para coisas diferentes. */
  function tituloDoPainel(div) {
    var p = div.closest('.painel');
    var h = p && p.querySelector('.painel-cab-tit h2');
    return h ? h.textContent.trim() : '';
  }

  function pintarCat(id, dados, extra) {
    var div = el(id);
    if (!div) return;
    var opts = Object.assign({
      dec: +(div.getAttribute('data-dec') || 0),
      unidade: div.getAttribute('data-unidade') || '',
      titulo: tituloDoPainel(div),
      aoClicar: aoClicarDe(div)
    }, extra || {});
    PAYLOAD[id] = { tipo: 'cat', dados: dados, opts: opts };
    G.categorico(TIPOS[id], div, dados, opts);
  }

  function pintarSerie(id, rotulos, series, extra) {
    var div = el(id);
    if (!div) return;
    var opts = Object.assign({
      dec: +(div.getAttribute('data-dec') || 0),
      titulo: tituloDoPainel(div),
      aoClicar: aoClicarDe(div)
    }, extra || {});
    PAYLOAD[id] = { tipo: 'ser', rotulos: rotulos, series: series, opts: opts };
    G.serie(TIPOS[id], div, rotulos, series, opts);
  }

  function redesenhar(id) {
    var p = PAYLOAD[id];
    if (!p) return;
    if (p.tipo === 'cat') G.categorico(TIPOS[id], el(id), p.dados, p.opts);
    else G.serie(TIPOS[id], el(id), p.rotulos, p.series, p.opts);
  }

  /* ------------------------------------------------------- altura útil da tela */
  /** Altura que sobra abaixo da barra de abas (que é fixa no topo). Vira a
      variável CSS --alt-util, usada pelos contadores da visão geral e pela
      coluna de filtros — as duas terminam na mesma linha e cabem sem rolagem. */
  function ajustarAlturaUtil() {
    var wrap = document.querySelector('.wrap');
    if (!wrap) return;
    // distância do topo do documento até o começo do conteúdo (cabeçalho +
    // barra de abas + respiro). Medida com scroll no topo, que é o pior caso:
    // é ali que o cabeçalho ainda ocupa espaço.
    var pad = parseFloat(getComputedStyle(wrap).paddingTop) || 0;
    var topo = wrap.getBoundingClientRect().top + window.scrollY + pad;
    var h = window.innerHeight - topo - 16;
    document.documentElement.style.setProperty('--alt-util', Math.max(340, Math.round(h)) + 'px');
  }

  /* ------------------------------------------------------------- stat tiles */
  /* itens com { _sec: 'Título' } abrem uma seção. Cada seção vira um bloco
     (cabeçalho + grade de cartões) em vez de tudo numa grade só: assim a área
     de contadores consegue dividir a altura disponível entre as seções e
     caber na tela sem rolagem. */
  function cartaoKpi(i) {
    var tag = i.ir ? 'button' : 'div';
    return '<' + tag + ' class="kpi ' + (i.cls || '') + '"' +
      (i.ir ? ' type="button" data-ir="' + i.ir + '" title="Ver detalhes"' : '') + '>' +
      '<div class="kpi-rot">' + i.rot + '</div>' +
      '<div class="kpi-val">' + i.val + (i.un ? '<span class="kpi-un">' + i.un + '</span>' : '') + '</div>' +
      /* sem sub, sem div: uma linha vazia ainda ocupava a margem dela embaixo
         do valor, e os cartões da mesma linha ficavam com alturas diferentes */
      (i.sub ? '<div class="kpi-sub">' + i.sub + '</div>' : '') + '</' + tag + '>';
  }

  function tiles(alvo, itens) {
    if (!el(alvo)) return;
    var grupos = [], atual = null;
    itens.forEach(function (i) {
      if (i._sec || !atual) {
        atual = { sec: i._sec || '', cards: [] };
        grupos.push(atual);
      }
      if (!i._sec) atual.cards.push(i);
    });
    el(alvo).innerHTML = grupos.map(function (g) {
      return '<div class="kpis-grupo">' +
        (g.sec ? '<div class="kpis-sec"><span>' + G.esc(g.sec) + '</span></div>' : '') +
        '<div class="kpis-linha">' + g.cards.map(cartaoKpi).join('') + '</div></div>';
    }).join('');
    el(alvo).querySelectorAll('.kpi[data-ir]').forEach(function (b) {
      b.addEventListener('click', function () { abrirAba(b.getAttribute('data-ir')); });
    });
  }

  /* ------------------------------------------------------- séries temporais */
  /** Eixo do tempo. Dentro de um exercício a unidade é o MÊS; no consolidado é
      o ANO — 46 colunas de mês lado a lado não se leem, e o que interessa ali
      é comparar um exercício com o outro.
      Só entram períodos com registro na seleção: período sem dado não vira
      coluna zerada (a queda a zero não significaria nada). */
  /* Com um exercício só, o eixo é o mês. Sem nenhum (consolidado) ou com vários
     marcados, é o ano — 24 colunas de mês de dois exercícios lado a lado não se
     leem, e comparar os anos é justamente o motivo de marcar mais de um. */
  function porAno() { return F.ano.length !== 1; }

  function chaveTempo(r) { return porAno() ? anoDe(r) : mesChave(r); }

  function chavesTempo(D) {
    return Array.from(new Set(D.map(chaveTempo))).sort();
  }

  function rotTempo(k) { return porAno() ? k : mesRot(k); }
  function tituloTempo() { return porAno() ? 'ano' : 'm&ecirc;s'; }
  function colunaTempo() { return porAno() ? 'Ano' : 'M&ecirc;s'; }

  /* Os títulos dos painéis de série falam em "mês"; no consolidado o eixo é o
     exercício, então o texto acompanha — senão o gráfico contradiz o título. */
  var TITULO_SERIE = {
    gSerie: ['Atendimentos por m&ecirc;s de vistoria',
      'Vistorias realizadas em cada m&ecirc;s do ano, separadas por servi&ccedil;o. Clique num m&ecirc;s para filtrar.',
      'Atendimentos por ano',
      'Vistorias realizadas em cada ano, separadas por servi&ccedil;o. Clique num ano para abrir o per&iacute;odo.'],
    gSerieMec: ['Hectares mecanizados por m&ecirc;s',
      'Soma da &aacute;rea mecanizada em cada m&ecirc;s.',
      'Hectares mecanizados por ano',
      'Soma da &aacute;rea mecanizada em cada ano.'],
    gSerieAcu: ['Horas de m&aacute;quina por m&ecirc;s',
      'Horas de escavadeira registradas em cada m&ecirc;s de vistoria.',
      'Horas de m&aacute;quina por ano',
      'Horas de escavadeira registradas em cada ano.'],
    gSerieAc: ['Tanques e a&ccedil;udes por m&ecirc;s',
      'Quantidade atendida em cada m&ecirc;s.',
      'Tanques e a&ccedil;udes por ano',
      'Quantidade atendida em cada ano.']
  };

  function rotularSeries() {
    var i = porAno() ? 2 : 0;
    Object.keys(TITULO_SERIE).forEach(function (id) {
      var div = el(id);
      if (!div) return;
      var cab = div.closest('.painel').querySelector('.painel-cab-tit');
      if (!cab) return;
      cab.querySelector('h2').innerHTML = TITULO_SERIE[id][i];
      var sub = cab.querySelector('.sub');
      if (sub) sub.innerHTML = TITULO_SERIE[id][i + 1];
    });
  }

  function serieDe(id, D, valor, nomeUnico) {
    var ks = chavesTempo(D);
    if (!ks.length) {
      PAYLOAD[id] = null;
      if (el(id)) G.vazio(el(id));
      return;
    }
    var rot = ks.map(function (k) { return porAno() ? k : mesRot(k); });
    // mês sem valor vira null (buraco no gráfico), nunca zero: um mês em que
    // um dos serviços não teve lançamento não deve aparecer como coluna/ponto 0
    var vals = function (m) { return ks.map(function (k) { return m.get(k) || null; }); };
    var series;
    if (nomeUnico) {
      var m = somarPor(D, chaveTempo, valor);
      series = [{ nome: nomeUnico, slot: nomeUnico === ACU ? 1 : 0, valores: vals(m) }];
    } else {
      // gráfico com as duas séries (ex.: "atendimentos por mês")
      // — mecanização leva o total de ha como detalhe, açudagem leva as horas
      var Dmec = D.filter(function (r) { return r.pc === MEC; });
      var Dacu = D.filter(function (r) { return r.pc === ACU; });
      var mMec = somarPor(Dmec, chaveTempo, valor);
      var mAcu = somarPor(Dacu, chaveTempo, valor);
      var dMecHa  = somarPor(Dmec, chaveTempo, function (r) { return r.ha; });
      var dAcuHrs = somarPor(Dacu, chaveTempo, function (r) { return r.hrs; });
      var totHa  = soma(Dmec, function (r) { return r.ha; });
      var totHrs = soma(Dacu, function (r) { return r.hrs; });
      series = [];
      if (!F.pc.length || F.pc.indexOf(MEC) >= 0) series.push({
        nome: MEC, slot: 0, valores: vals(mMec),
        detalhe: { rot: 'Área mecanizada', valores: vals(dMecHa), dec: 1, un: 'ha', total: totHa }
      });
      if (!F.pc.length || F.pc.indexOf(ACU) >= 0) series.push({
        nome: ACU, slot: 1, valores: vals(mAcu),
        detalhe: { rot: 'Horas de máquina', valores: vals(dAcuHrs), dec: 1, un: 'h', total: totHrs }
      });
    }
    pintarSerie(id, rot, series);
  }

  /* -------------------------------------------------------- tabelas resumo */
  function tabelaResumo(alvoId, D, chave, rotuloChave) {
    if (!el(alvoId)) return;
    var chaves = Array.from(new Set(D.map(chave))).filter(Boolean);
    var linhas = chaves.map(function (k) {
      var sub = D.filter(function (r) { return chave(r) === k; });
      var mec = sub.filter(function (r) { return r.pc === MEC; });
      return {
        k: k, n: sub.length, mec: mec.length, acu: sub.length - mec.length,
        ha: soma(mec, function (r) { return r.ha; }),
        hrs: soma(sub, function (r) { return r.hrs; }),
        ac: soma(sub, function (r) { return r.ac; }),
        prod: nProdutores(sub),
        dae: soma(sub, function (r) { return r.dae; })
      };
    }).sort(function (a, b) { return b.n - a.n; });

    if (!linhas.length) return G.vazio(el(alvoId));
    var tot = linhas.reduce(function (a, l) {
      return {
        n: a.n + l.n, mec: a.mec + l.mec, acu: a.acu + l.acu, ha: a.ha + l.ha,
        hrs: a.hrs + l.hrs, ac: a.ac + l.ac, dae: a.dae + l.dae
      };
    }, { n: 0, mec: 0, acu: 0, ha: 0, hrs: 0, ac: 0, dae: 0 });
    var z = function (v, dec) { return v ? G.num(v, dec) : '<span class="nada">—</span>'; };

    el(alvoId).innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>' + G.esc(rotuloChave) + '</th><th>Atend.</th><th>Mecaniz.</th><th>Açudagem</th>' +
      '<th>Hectares</th><th>Horas</th><th>Tanques</th><th>Produtores</th><th>DAE</th>' +
      '</tr></thead><tbody>' +
      linhas.map(function (l) {
        return '<tr><td class="forte">' + G.esc(l.k) + '</td>' +
          '<td class="num">' + G.num(l.n) + '</td><td class="num">' + z(l.mec) + '</td>' +
          '<td class="num">' + z(l.acu) + '</td><td class="num">' + z(l.ha, 1) + '</td>' +
          '<td class="num">' + z(l.hrs, 1) + '</td><td class="num">' + z(l.ac) + '</td>' +
          '<td class="num">' + z(l.prod) + '</td><td class="num">' + (l.dae ? moeda(l.dae) : '—') + '</td></tr>';
      }).join('') +
      '<tr><td class="forte">Total</td><td class="num forte">' + G.num(tot.n) + '</td>' +
      '<td class="num forte">' + G.num(tot.mec) + '</td><td class="num forte">' + G.num(tot.acu) + '</td>' +
      '<td class="num forte">' + G.num(tot.ha, 1) + '</td><td class="num forte">' + G.num(tot.hrs, 1) + '</td>' +
      '<td class="num forte">' + G.num(tot.ac) + '</td><td class="num forte">' + G.num(nProdutores(D)) + '</td>' +
      '<td class="num forte">' + (tot.dae ? moeda(tot.dae) : '—') + '</td></tr></tbody></table></div>';
  }

  function tabelaCulturaMunicipio(D) {
    if (!el('tCultMun')) return;
    var areaTotal = new Map();
    D.forEach(function (r) { r.cult.forEach(function (c) { areaTotal.set(c[0], (areaTotal.get(c[0]) || 0) + c[1]); }); });
    var culturas = ranking(areaTotal, 8).map(function (d) { return d.rot; });
    var mat = new Map(), totMun = new Map();
    D.forEach(function (r) {
      r.cult.forEach(function (c) {
        mat.set(r.mun + '|' + c[0], (mat.get(r.mun + '|' + c[0]) || 0) + c[1]);
        totMun.set(r.mun, (totMun.get(r.mun) || 0) + c[1]);
      });
    });
    var muns = Array.from(totMun.keys()).sort(function (a, b) { return totMun.get(b) - totMun.get(a); });
    if (!culturas.length || !muns.length) return G.vazio(el('tCultMun'));

    el('tCultMun').innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr><th>Município</th>' +
      culturas.map(function (c) { return '<th>' + G.esc(c) + '</th>'; }).join('') +
      '<th>Total (ha)</th></tr></thead><tbody>' +
      muns.map(function (m) {
        return '<tr><td class="forte">' + G.esc(m) + '</td>' +
          culturas.map(function (c) {
            var v = mat.get(m + '|' + c) || 0;
            return '<td class="num">' + (v ? G.num(v, 1) : '<span class="nada">—</span>') + '</td>';
          }).join('') +
          '<td class="num forte">' + G.num(totMun.get(m), 1) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ------------------------------------------------------ ficha do produtor */
  var NOMES_PROD = [];

  /** Remove acentos e caixa para a busca casar "joao" com "João".
      Não mexe em espaços: realcar() usa o índice do resultado para recortar o
      nome original, então a chave precisa ter o mesmo comprimento da entrada. */
  function chaveBusca(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /** Nomes que casam com o texto digitado. Sem texto, ninguém casa: a aba só
      mostra alguém depois que o usuário procura. */
  function acharProdutores() {
    var q = chaveBusca(el('buscaProd') ? el('buscaProd').value.trim() : '');
    if (!q) return [];
    return NOMES_PROD.filter(function (n) { return chaveBusca(n).indexOf(q) >= 0; });
  }

  /** O produtor da vez: o que o usuário digitou por extenso (ou escolheu na
      lista de sugestões) ou, se a busca só deixou um nome de pé, esse nome. */
  function produtorBuscado() {
    var lista = acharProdutores();
    if (!lista.length) return '';
    var q = chaveBusca(el('buscaProd').value.trim());
    var exato = lista.filter(function (n) { return chaveBusca(n) === q; });
    if (exato.length) return exato[0];
    return lista.length === 1 ? lista[0] : '';
  }

  /* ------------------------------------------------- autocomplete da busca */
  /* Lista própria em vez de <datalist>: o menu nativo é inconsistente entre
     navegadores e não permite destacar o trecho digitado. */
  var iSugestao = -1, SUGESTOES = [], TETO_SUGESTOES = 40;

  /** Destaca no nome o trecho que casou com a busca. */
  function realcar(nome, q) {
    var i = chaveBusca(nome).indexOf(q);
    if (i < 0) return G.esc(nome);
    return G.esc(nome.slice(0, i)) + '<b>' + G.esc(nome.slice(i, i + q.length)) +
      '</b>' + G.esc(nome.slice(i + q.length));
  }

  function fecharSugestoes() {
    iSugestao = -1;
    el('listaProd').hidden = true;
    el('buscaProd').setAttribute('aria-expanded', 'false');
    el('buscaProd').removeAttribute('aria-activedescendant');
  }

  /** Refaz a lista a cada tecla. Só abre com algo digitado e com mais de um
      candidato: quando sobra um nome só, a ficha dele já está na tela. */
  function montarSugestoes(abrir) {
    var q = el('buscaProd').value.trim();
    SUGESTOES = acharProdutores();

    el('prodContagem').textContent = !q
      ? G.num(NOMES_PROD.length) + ' produtores ' +
        (F.mun.length ? 'em ' + rotuloMun() : 'no período')
      : !SUGESTOES.length ? 'Nenhum produtor encontrado'
        : G.num(SUGESTOES.length) + ' de ' + G.num(NOMES_PROD.length) + ' produtores';

    if (!abrir || !q || SUGESTOES.length < 2) return fecharSugestoes();

    var chave = chaveBusca(q);
    var mostra = SUGESTOES.slice(0, TETO_SUGESTOES);
    el('listaProd').innerHTML = mostra.map(function (n, i) {
      // id por opção: é o que aria-activedescendant aponta para o leitor de
      // tela saber qual sugestão está sob as setas
      return '<li class="prod-sugestao" role="option" id="prodSug' + i +
        '" aria-selected="false" data-i="' + i + '">' + realcar(n, chave) + '</li>';
    }).join('') + (SUGESTOES.length > mostra.length
      ? '<li class="prod-sugestoes-mais">+' + G.num(SUGESTOES.length - mostra.length) +
        ' — refine a busca</li>' : '');
    iSugestao = -1;
    el('listaProd').hidden = false;
    el('buscaProd').setAttribute('aria-expanded', 'true');
  }

  function moverSugestao(passo) {
    var itens = el('listaProd').querySelectorAll('.prod-sugestao');
    if (!itens.length) return;
    iSugestao = (iSugestao + passo + itens.length) % itens.length;
    itens.forEach(function (li, i) {
      var on = i === iSugestao;
      li.classList.toggle('ativa', on);
      li.setAttribute('aria-selected', on);
      if (on && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    });
    el('buscaProd').setAttribute('aria-activedescendant', 'prodSug' + iSugestao);
  }

  function escolherSugestao(i) {
    if (i < 0 || i >= SUGESTOES.length) return;
    el('buscaProd').value = SUGESTOES[i];
    fecharSugestoes();
    montarSugestoes(false);
    ficha(filtrar());
  }

  function montarSelProd(D) {
    NOMES_PROD = Array.from(new Set(D.map(function (r) { return r.prod; }).filter(Boolean)))
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    montarSugestoes(false);
    ficha(D);
  }

  /* ------------------------------------------------ ficha completa do produtor */
  /* Rótulos dos dados cadastrais — usados cheios e vazios, para a ficha em
     branco ter exatamente a mesma forma da preenchida. */
  var FICHA_ROTULOS = ['Produtor', 'Município', 'Escritório local', 'Propriedade',
    'Endereço / local', 'Sexo', 'Estado civil', 'Associação / coop.', 'DAP', 'Técnico(s)'];
  var HIST_COLUNAS = ['Inserção', 'Vistoria', 'Serviço', 'Município', 'Culturas / área',
    'Hectares', 'Horas', 'Tanques', 'Técnico', 'Obs.', 'Form.'];

  function fichaItem(rot, val) {
    return '<div class="ficha-item"><div class="ficha-rot">' + G.esc(rot) +
      '</div><div class="ficha-val">' + (val || '—') + '</div></div>';
  }

  /** Contadores do produtor, embutidos na própria ficha — os números e o
      cadastro/histórico aparecem juntos, no mesmo bloco, ao escolher alguém. */
  function blocoKpis(itens) {
    return '<div class="kpis kpis-ficha"><div class="kpis-grupo">' +
      '<div class="kpis-linha">' + itens.map(cartaoKpi).join('') + '</div></div></div>';
  }

  function benVazio() {
    /* A aba mostra a ficha inteira desde o começo, só que sem valores: assim
       dá para ver quais campos existem antes de procurar alguém. */
    var q = el('buscaProd').value.trim();
    var achados = acharProdutores().length;
    var msg = !q ? 'Digite o nome do produtor acima para preencher a ficha.'
      : !achados ? 'Nenhum produtor encontrado com esse nome.'
        : G.num(achados) + ' produtores contêm esse texto — continue digitando ou escolha um na lista.';

    el('fichaProd').innerHTML =
      '<div class="ben-vazio">' +
      '<p class="vazio" style="padding:10px 0 16px">' + G.esc(msg) + '</p>' +
      '<h3 class="ben-sec">Resumo</h3>' +
      blocoKpis([
        { rot: 'Atendimentos', val: '—' },
        { rot: 'Hectares mecanizados', val: '—', un: 'ha', cls: 'mec' },
        { rot: 'Horas de máquina', val: '—', un: 'h', cls: 'acu' },
        { rot: 'Tanques / açudes', val: '—', cls: 'acu' },
        { rot: 'DAE arrecadada', val: '—', cls: 'texto' },
        { rot: 'Período', val: '—' }
      ]) +
      '<h3 class="ben-sec">Dados cadastrais</h3>' +
      '<div class="ficha">' + FICHA_ROTULOS.map(function (r) { return fichaItem(r, ''); }).join('') + '</div>' +
      '<h3 class="ben-sec">Culturas mecanizadas</h3>' +
      '<div class="ficha">' + fichaItem('Cultura', '') + '</div>' +
      '<h3 class="ben-sec">Equipamentos utilizados</h3>' +
      '<div class="ficha">' + fichaItem('Máquina', '') + fichaItem('Implemento', '') + '</div>' +
      '<h3 class="ben-sec">Histórico de atendimentos</h3>' +
      '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      HIST_COLUNAS.map(function (c) { return '<th>' + G.esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody><tr>' +
      HIST_COLUNAS.map(function () { return '<td>—</td>'; }).join('') +
      '</tr></tbody></table></div></div>';
  }

  /** Rótulo do recorte de município, para os textos da aba. */
  function rotuloMun() {
    if (F.mun.length === 1) return F.mun[0];
    return F.mun.length + ' municípios';
  }

  /** Um produtor por linha, com os números somados no recorte recebido. */
  function linhasBeneficiario(D) {
    var porNome = new Map();
    D.forEach(function (r) {
      if (!r.prod) return;
      var b = porNome.get(r.prod);
      if (!b) {
        b = { nome: r.prod, muns: [], n: 0, ha: 0, hrs: 0, ac: 0 };
        porNome.set(r.prod, b);
      }
      b.n++;
      b.ha += r.ha || 0;
      b.hrs += r.hrs || 0;
      b.ac += r.ac || 0;
      if (r.mun && b.muns.indexOf(r.mun) < 0) b.muns.push(r.mun);
    });
    // ordem alfabética: a aba serve para ACHAR alguém, e o campo de busca
    // acima já cobre quem sabe o nome
    return Array.from(porNome.values())
      .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  }

  /** Blocos da lista. Com mais de um exercício em jogo — dois anos marcados ou
      o consolidado — o nome solto não diz QUANDO a pessoa foi atendida, e a
      mesma pessoa aparece repetida sem explicação. Então a lista se divide em
      dois níveis, exercício e mês, do mais recente para o mais antigo. Com um
      exercício só, uma lista alfabética basta.

      São dois níveis, e não um rótulo "Dez/2026", porque o ano é o do
      EXERCÍCIO e o mês é o da VISTORIA: um serviço feito em dezembro de 2025 e
      lançado na planilha de 2026 sairia como "Dez/2026", um mês que ainda não
      aconteceu. Com o mês pendurado no exercício, o rótulo não mente — é a
      mesma razão pela qual mesRot() não imprime o ano. */
  function blocosBeneficiarios(D) {
    if (!porAno()) return [{ rot: '', meses: [{ rot: '', linhas: linhasBeneficiario(D) }] }];
    var porChave = new Map();
    D.forEach(function (r) {
      var k = mesChave(r);
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k).push(r);
    });
    var chaves = Array.from(porChave.keys()).sort().reverse();
    var anos = [];
    chaves.forEach(function (k) {
      var ano = k.slice(0, 4), m = mesRot(k);
      var bloco = anos[anos.length - 1];
      if (!bloco || bloco.ano !== ano) {
        bloco = { ano: ano, rot: 'Exercício ' + ano, meses: [] };
        anos.push(bloco);
      }
      bloco.meses.push({
        rot: m.charAt(0).toUpperCase() + m.slice(1),
        linhas: linhasBeneficiario(porChave.get(k))
      });
    });
    return anos;
  }

  function linhaBeneficiario(b) {
    return '<tr class="ben-lin" data-nome="' + G.esc(b.nome) + '" tabindex="0" role="button"' +
      ' aria-label="Abrir a ficha de ' + G.esc(b.nome) + '">' +
      '<td class="forte">' + G.esc(b.nome) + '</td>' +
      '<td>' + G.esc(b.muns.join(', ') || '—') + '</td>' +
      '<td class="num">' + G.num(b.n) + '</td>' +
      '<td class="num">' + (b.ha  ? G.num(b.ha,  1) : '—') + '</td>' +
      '<td class="num">' + (b.hrs ? G.num(b.hrs, 1) : '—') + '</td>' +
      '<td class="num">' + (b.ac  ? G.num(b.ac)     : '—') + '</td>' +
      '</tr>';
  }

  /** Lista dos beneficiários da seleção. É o que a aba mostra quando há
      município marcado na lateral e ninguém foi procurado ainda: escolhido o
      município, a aba já abre com quem foi atendido lá, em vez de uma ficha em
      branco pedindo um nome. Cada linha abre a ficha daquele produtor. */
  function benLista(D) {
    // o total do título são as pessoas distintas: nos blocos por mês quem foi
    // atendido em março e em julho aparece duas vezes, e somar os blocos
    // contaria a mesma pessoa duas vezes
    var quantos = linhasBeneficiario(D).length;
    if (!quantos) {
      el('fichaProd').innerHTML = '<p class="vazio" style="padding:10px 0">' +
        'Nenhum produtor atendido em ' + G.esc(rotuloMun()) + ' nesta seleção.</p>';
      return;
    }
    var blocos = blocosBeneficiarios(D);

    el('fichaProd').innerHTML =
      '<h3 class="ben-sec">Benefici&aacute;rios de ' + G.esc(rotuloMun()) +
      ' (' + G.num(quantos) + ')</h3>' +
      '<p class="ben-dica">Clique num nome para abrir a ficha completa.' +
      (porAno() ? ' Separados por ano e m&ecirc;s da vistoria.' : '') + '</p>' +
      '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>Produtor</th><th>Munic&iacute;pio</th><th>Atendimentos</th>' +
      '<th>Hectares</th><th>Horas</th><th>Tanques</th>' +
      '</tr></thead><tbody>' +
      blocos.map(function (bl) {
        return (bl.rot ? '<tr class="ben-ano"><td colspan="6">' + G.esc(bl.rot) +
          '</td></tr>' : '') +
          bl.meses.map(function (m) {
            return (m.rot
              ? '<tr class="ben-grupo"><td colspan="6">' + G.esc(m.rot) + ' &middot; ' +
                G.num(m.linhas.length) + ' produtor' + (m.linhas.length > 1 ? 'es' : '') +
                '</td></tr>'
              : '') + m.linhas.map(linhaBeneficiario).join('');
          }).join('');
      }).join('') +
      '</tbody></table></div>';
  }

  /** Abre a ficha de quem foi clicado na lista, como se o nome tivesse sido
      digitado na busca — assim o campo continua dizendo quem está na tela. */
  function abrirFichaDe(nome) {
    el('buscaProd').value = nome;
    fecharSugestoes();
    montarSugestoes(false);
    ficha(contexto().D);
  }

  /** Volta da ficha para a lista do município: só limpa a busca. */
  function voltarALista() {
    el('buscaProd').value = '';
    fecharSugestoes();
    montarSugestoes(false);
    ficha(contexto().D);
  }

  function ficha(D) {
    var nome = produtorBuscado();
    // com município marcado, o estado de repouso da aba é a lista de lá
    if (!nome) return F.mun.length ? benLista(D) : benVazio();

    var R = D.filter(function (r) { return r.prod === nome; });
    if (!R.length) return F.mun.length ? benLista(D) : benVazio();

    var mec = R.filter(function (r) { return r.pc === MEC; });
    var acu = R.filter(function (r) { return r.pc === ACU; });
    var haP  = soma(mec, function (r) { return r.ha; });
    var hrsP = soma(acu, function (r) { return r.hrs; });
    var acP  = soma(acu, function (r) { return r.ac; });
    var daeP = soma(R,   function (r) { return r.dae; });

    var uniV = function (f) {
      var vs = Array.from(new Set(R.map(f))).filter(function (v) { return v && v !== NI; });
      return vs.length ? G.esc(vs.join(', ')) : '—';
    };

    /* KPIs do produtor selecionado */
    var areaCultP = new Map();
    mec.forEach(function (r) {
      r.cult.forEach(function (c) { areaCultP.set(c[0], (areaCultP.get(c[0]) || 0) + c[1]); });
    });
    var maqP  = Array.from(new Set([].concat.apply([], R.map(function (r) { return r.maq; }))));
    var implP = Array.from(new Set([].concat.apply([], R.map(function (r) { return r.impl; }))));
    var cultP = ranking(areaCultP, 30);

    var secResumo = (F.mun.length
      ? '<button type="button" class="painel-link ben-voltar">&larr; benefici&aacute;rios de ' +
        G.esc(rotuloMun()) + '</button>' : '') +
      '<h3 class="ben-sec ben-nome">' + G.esc(nome) + '</h3>' +
      blocoKpis([
        { rot: 'Atendimentos', val: G.num(R.length), sub: G.num(mec.length) + ' mecaniz. + ' + G.num(acu.length) + ' açudagem' },
        { rot: 'Hectares mecanizados', val: G.num(haP, 1), un: 'ha', cls: 'mec',
          sub: mec.length ? 'média ' + G.num(haP / mec.length, 1) + ' ha/atend.' : '—' },
        { rot: 'Horas de máquina', val: G.num(hrsP, 1), un: 'h', cls: 'acu',
          sub: acu.length ? 'média ' + G.num(hrsP / acu.length, 1) + ' h/atend.' : '—' },
        { rot: 'Tanques / açudes', val: G.num(acP), cls: 'acu' },
        { rot: 'DAE arrecadada', val: moeda(daeP), cls: 'texto',
          sub: G.num(R.filter(function (r) { return r.dae > 0; }).length) + ' registros com DAE' },
        { rot: 'Período', val: G.num(new Set(R.map(function (r) { return mesChave(r); })).size) }
      ]);

    /* Dados cadastrais — mesma ordem de FICHA_ROTULOS, para a ficha preenchida
       e a vazia terem exatamente o mesmo desenho */
    var valores = [
      G.esc(nome),
      uniV(function (r) { return r.mun; }),
      uniV(function (r) { return r.esc; }),
      uniV(function (r) { return r.propr; }),
      uniV(function (r) { return r.loc; }),
      uniV(function (r) { return r.sexo; }),
      uniV(function (r) { return r.ec; }),
      uniV(function (r) { return r.assoc; }),
      uniV(function (r) { return r.dap; }),
      uniV(function (r) { return r.rt; })
    ];

    var secFicha = '<h3 class="ben-sec">Dados cadastrais</h3>' +
      '<div class="ficha">' + FICHA_ROTULOS.map(function (rot, i) {
        return fichaItem(rot, valores[i]);
      }).join('') + '</div>';

    /* Culturas */
    var secCult = '';
    if (cultP.length) {
      secCult = '<h3 class="ben-sec">Culturas mecanizadas</h3>' +
        '<div class="ficha">' + cultP.map(function (c) {
          return '<div class="ficha-item"><div class="ficha-rot">' + G.esc(c.rot) +
            '</div><div class="ficha-val">' + G.num(c.val, 1) + '<span class="kpi-un"> ha</span></div></div>';
        }).join('') + '</div>';
    }

    /* Máquinas e implementos */
    var secMaq = (maqP.length || implP.length) ?
      '<h3 class="ben-sec">Equipamentos utilizados</h3>' +
      '<div class="ficha">' +
      maqP.map(function (m) {
        return '<div class="ficha-item"><div class="ficha-rot">Máquina</div><div class="ficha-val">' + G.esc(m) + '</div></div>';
      }).join('') +
      implP.map(function (i) {
        return '<div class="ficha-item"><div class="ficha-rot">Implemento</div><div class="ficha-val">' + G.esc(i) + '</div></div>';
      }).join('') +
      '</div>' : '';

    /* Tabela de registros */
    var secTabela = '<h3 class="ben-sec">Histórico de atendimentos (' + G.num(R.length) + ')</h3>' +
      '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      HIST_COLUNAS.map(function (c) { return '<th>' + G.esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      R.map(function (r) {
        return '<tr>' +
          '<td class="num">' + dataBR(r.d) + '</td>' +
          '<td class="num">' + dataBR(r.dv) + '</td>' +
          '<td><span class="tag ' + tagServico(r.pc) + '">' + G.esc(r.pc) + '</span></td>' +
          '<td>' + G.esc(r.mun || '—') + '</td>' +
          '<td>' + (r.cult.length ? r.cult.map(function (c) { return G.esc(c[0]) + ' (' + G.num(c[1], 1) + ' ha)'; }).join(', ') : '—') + '</td>' +
          '<td class="num">' + (r.ha  ? G.num(r.ha,  1) : '—') + '</td>' +
          '<td class="num">' + (r.hrs ? G.num(r.hrs, 1) : '—') + '</td>' +
          '<td class="num">' + (r.ac  ? G.num(r.ac)    : '—') + '</td>' +
          '<td>' + G.esc(r.rt || '—') + '</td>' +
          '<td class="fraco">' + G.esc(r.obs || '—') + '</td>' +
          '<td>' + (r.form ? '<a href="' + G.esc(r.form) + '" target="_blank" rel="noopener">abrir</a>' : '—') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';

    el('fichaProd').innerHTML = secResumo + secFicha + secCult + secMaq + secTabela;
  }

  /* -------------------------------------------------------------- renderizar */
  /* O painel tem 9 abas, 32 gráficos e ~150 contadores — e uma aba visível por
     vez. Redesenhar tudo a cada clique custava 167 ms no ano corrente e 570 ms
     no "Geral", com a thread travada, e o custo subia a cada exercício novo.

     O trabalho agora é dividido em três:
       contexto()  calcula UMA vez por seleção os agregados que as abas dividem
                   — inclusive os que o código antigo refazia 3 ou 4 vezes;
       ABAS[nome]  desenha uma aba a partir desse contexto;
       render()    desenha só a aba visível e marca as outras como sujas.
     Abrir uma aba suja a desenha; voltar a uma já desenhada não custa nada. */

  var CTX = null;      // contexto da seleção atual (null = recalcular)
  var SUJAS = {};      // aba -> true quando o desenho está desatualizado
  var abaAtiva = 'geral';

  /** Filtro, período ou base mudou: todo desenho existente está velho. */
  function invalidar() {
    CTX = null;
    Object.keys(ABAS).forEach(function (k) { SUJAS[k] = true; });
  }

  /** Invalida, registra a seleção na URL e redesenha a aba visível.
      É o que toda mudança de filtro chama. */
  function atualizar() {
    invalidar();
    gravarUrl(false);
    render();
  }

  /* ---------------------------------------------------------------- contexto */
  /** Tudo que as abas compartilham, calculado uma vez por seleção. */
  function contexto() {
    if (CTX) return CTX;

    var D = filtrar();
    var mec = D.filter(function (r) { return r.pc === MEC; });
    var acu = D.filter(function (r) { return r.pc === ACU; });
    var ha  = soma(mec, function (r) { return r.ha; });
    var hrs = soma(acu, function (r) { return r.hrs; });
    var nAc = soma(acu, function (r) { return r.ac; });

    /* Agregados usados por mais de um gráfico ou contador. Antes cada um era
       recalculado onde fosse preciso: somarPor(mec, mun, ha) rodava 4 vezes e
       contar(D, esc) 3 vezes no mesmo render. */
    var haPorMun    = somarPor(mec, function (r) { return r.mun; }, function (r) { return r.ha; });
    var hrsPorMun   = somarPor(acu, function (r) { return r.mun; }, function (r) { return r.hrs; });
    var acPorMun    = somarPor(acu, function (r) { return r.mun; }, function (r) { return r.ac; });
    var haPorEsc    = somarPor(mec, function (r) { return r.esc; }, function (r) { return r.ha; });
    var hrsPorEsc   = somarPor(acu, function (r) { return r.esc; }, function (r) { return r.hrs; });
    var atendPorEsc = contar(D, function (r) { return r.esc; });
    var atendPorMun = contar(D, function (r) { return r.mun; });
    var atendPorTec = contar(D, function (r) { return r.rt; });
    var atendPorPc  = contar(D, function (r) { return r.pc; });
    var maqMec      = contar(mec, function (r) { return r.maq; });
    var implMec     = contar(mec, function (r) { return r.impl; });
    var maqAcu      = contar(acu, function (r) { return r.maq; });
    var prodPorMun  = distintosPor(D, function (r) { return r.mun; }, chaveProdutor);

    var areaCult = new Map(), qtdCult = new Map(), sis = new Map(), haCult = 0, nCult = 0;
    D.forEach(function (r) {
      r.cult.forEach(function (c) {
        areaCult.set(c[0], (areaCult.get(c[0]) || 0) + c[1]);
        qtdCult.set(c[0], (qtdCult.get(c[0]) || 0) + 1);
        if (c[2]) sis.set(c[2], (sis.get(c[2]) || 0) + 1);
        haCult += c[1];
        nCult++;
      });
    });

    // o período não conta como filtro: ele é o recorte, não um corte dentro dele
    var ativos = Object.keys(F).filter(function (k) {
      return k !== 'ano' && F[k].length;
    }).length;
    var noAno = TODOS.filter(function (r) {
      return !F.ano.length || F.ano.indexOf(anoDe(r)) >= 0;
    }).length;

    var contProd = atendimentosPorProdutor(D);
    var nProd = contProd.size;
    var nProdRec = Array.from(contProd.values()).filter(function (v) { return v > 1; }).length;

    var nEsc  = nDistintos(D, function (r) { return r.esc; });
    var nTec  = nDistintos(D, function (r) { return r.rt; });
    var nMun  = nDistintos(D, function (r) { return r.mun; });
    var nAssoc = new Set(D.map(function (r) { return r.assoc; })
      .filter(function (a) { return a && a !== NI; })).size;
    var nMeses = new Set(D.map(function (r) { return mesChave(r); })).size;
    var dae = soma(D, function (r) { return r.dae; });
    var nComDae  = D.filter(function (r) { return r.dae > 0; }).length;
    var nComForm = D.filter(function (r) { return r.form; }).length;
    var nComCult = D.filter(function (r) { return r.cult.length; }).length;
    var nMulher  = D.filter(function (r) { return r.sexo === 'Feminino'; }).length;

    /* ---- comparação com o exercício anterior ------------------------------
       Só faz sentido com UM exercício escolhido: no "Geral" não há com o que
       comparar, e com vários marcados não existe "o ano anterior" — comparar
       2025+2026 contra 2024 seria dois anos contra um. Os demais filtros são
       mantidos: comparar "Xapuri 2026" com "Xapuri 2025", não com 2025 todo. */
    var anoAnt = F.ano.length === 1 ? String(+F.ano[0] - 1) : '';
    var temAnt = !!anoAnt && ANOS.indexOf(anoAnt) >= 0;
    var Dant = temAnt ? filtrar(null, anoAnt) : [];
    var mecAnt = Dant.filter(function (r) { return r.pc === MEC; });
    var acuAnt = Dant.filter(function (r) { return r.pc === ACU; });

    /* ---- produtividade da açudagem ---------------------------------------
       Só vistorias que têm hora E tanque: 7 registros com horas e zero tanques
       entravam no numerador e não no denominador, inflando a média. */
    var acuProd = acu.filter(function (r) { return r.hrs > 0 && r.ac > 0; });
    var acProd  = soma(acuProd, function (r) { return r.ac; });
    var horasPorTanque = acProd ? soma(acuProd, function (r) { return r.hrs; }) / acProd : 0;

    var temDae = D.some(function (r) { return r.dae > 0; });

    var C = {
      D: D, mec: mec, acu: acu, ha: ha, hrs: hrs, nAc: nAc,
      haPorMun: haPorMun, hrsPorMun: hrsPorMun, acPorMun: acPorMun,
      haPorEsc: haPorEsc, hrsPorEsc: hrsPorEsc, prodPorMun: prodPorMun,
      atendPorEsc: atendPorEsc, atendPorMun: atendPorMun,
      atendPorTec: atendPorTec, atendPorPc: atendPorPc,
      maqMec: maqMec, implMec: implMec, maqAcu: maqAcu,
      areaCult: areaCult, qtdCult: qtdCult, sis: sis, haCult: haCult, nCult: nCult,
      ativos: ativos, noAno: noAno,
      nProd: nProd, nProdRec: nProdRec, nEsc: nEsc, nTec: nTec, nMun: nMun,
      nAssoc: nAssoc, nMeses: nMeses, dae: dae, nComDae: nComDae,
      nComForm: nComForm, nComCult: nComCult, nMulher: nMulher,
      anoAnt: anoAnt, temAnt: temAnt, Dant: Dant, mecAnt: mecAnt, acuAnt: acuAnt,
      acuProd: acuProd, horasPorTanque: horasPorTanque,
      semServico: D.length - mec.length - acu.length,
      maxHa:  mec.reduce(function (a, r) { return Math.max(a, r.ha); }, 0),
      maxHrs: acu.reduce(function (a, r) { return Math.max(a, r.hrs); }, 0),
      maxAc:  acu.reduce(function (a, r) { return Math.max(a, r.ac); }, 0),

      topMun:      ranking(haPorMun, 1)[0],
      topMunHrs:   ranking(hrsPorMun, 1)[0],
      topMunAc:    ranking(acPorMun, 1)[0],
      topMunAt:    ranking(atendPorMun, 1)[0],
      topEscAt:    ranking(atendPorEsc, 1)[0],
      topEscHa:    ranking(haPorEsc, 1)[0],
      topEscHrs:   ranking(hrsPorEsc, 1)[0],
      topTec:      ranking(atendPorTec, 1)[0],
      topMaq:      ranking(maqMec, 1)[0],
      topCult:     ranking(areaCult, 1)[0],
      topCultQtd:  ranking(qtdCult, 1)[0],
      topSis:      ranking(sis, 1)[0],

      /** "▲ 22% vs 2025" no subtítulo do contador, e SÓ quando subiu. Queda e
          estabilidade não vão para o cartão: o contador mostra o resultado do
          exercício, e a comparação entra ali como destaque de avanço. Quem
          precisa do número da queda tem a série por período nos gráficos e a
          comparação completa na tabela de resumo. */
      vs: function (atual, anterior, texto) {
        texto = texto || '';
        if (!temAnt || !anterior) return texto;
        var d = (atual - anterior) / anterior * 100;
        if (d <= 0.5) return texto;
        return (texto ? texto + ' · ' : '') + '▲ ' + G.num(d, 0) + '% vs ' + anoAnt;
      },
      /* DAE: distinguir "zero arrecadado" de "não coletado no exercício" */
      daeVal: function (v) { return temDae ? moeda(v) : '—'; },
      daeSub: function (n) {
        return temDae ? G.num(n) + ' atendimentos com DAE' : 'não coletado neste exercício';
      },
      pct: function (n, t) { return t ? (n / t * 100).toFixed(1).replace('.', ',') + '%' : '—'; }
    };

    CTX = C;
    return C;
  }

  /* ------------------------------------------------------ linha de resumo */
  /** Fica acima das abas, então acompanha qualquer seleção — não é de aba. */
  function linhaResumo(C) {
    var D = C.D;
    el('resumo').innerHTML = '<strong>' + G.num(D.length) + '</strong> de ' + G.num(C.noAno) +
      ' registros ' + (F.ano.length ? 'em ' + G.esc(rotuloAno()) : 'no geral (' + G.esc(rotuloAno()) + ')') +
      (C.ativos ? ' (' + C.ativos + ' filtro' + (C.ativos > 1 ? 's' : '') +
        ' ativo' + (C.ativos > 1 ? 's' : '') + ')' : '') +
      (D.length ? ' &middot; vistorias de ' + dataBR(dataRef(D[0])) +
        ' a ' + dataBR(dataRef(D[D.length - 1])) : '');
  }

  /* ============================================================ ABA: GERAL */
  function abaGeral(C) {
    var D = C.D, mec = C.mec, acu = C.acu;
    tiles('kpis', [
      /* ── SEÇÃO 1: Resultados gerais ─────────────────────────────────── */
      { _sec: 'Resultados gerais' },
      { rot: 'Hectares mecanizados', val: G.num(C.ha, 1), un: 'ha', cls: 'mec', ir: 'mecanizacao',
        sub: C.vs(C.ha, soma(C.mecAnt, function (r) { return r.ha; })) },
      { rot: 'Horas de máquina', val: G.num(C.hrs, 1), un: 'h', cls: 'acu', ir: 'acudagem',
        sub: C.vs(C.hrs, soma(C.acuAnt, function (r) { return r.hrs; })) },
      { rot: 'Tanques / açudes', val: G.num(C.nAc), cls: 'acu', ir: 'acudagem',
        sub: C.vs(C.nAc, soma(C.acuAnt, function (r) { return r.ac; })) },
      { rot: 'Atendimentos', val: G.num(D.length), ir: 'registros',
        sub: C.vs(D.length, C.Dant.length) },
      { rot: 'Produtores atendidos', val: G.num(C.nProd), ir: 'beneficiario',
        sub: C.vs(C.nProd, nProdutores(C.Dant)) },
      { rot: 'Municípios atendidos', val: G.num(C.nMun), ir: 'municipio',
        sub: C.vs(C.nMun, nDistintos(C.Dant, function (r) { return r.mun; })) },

      /* ── SEÇÃO 2: Mecanização e açudagem ─────────────────────────── */
      { _sec: 'Mecanização e açudagem' },
      { rot: 'Vistorias de mecanização', val: G.num(mec.length), cls: 'mec', ir: 'mecanizacao',
        sub: G.num(C.ha, 1) + ' ha registrados' },
      { rot: 'Vistorias de açudagem', val: G.num(acu.length), cls: 'acu', ir: 'acudagem',
        sub: G.num(C.hrs, 1) + ' h de máquina' },
      { rot: 'Média por atendimento', val: G.num(mec.length ? C.ha / mec.length : 0, 1), un: 'ha', cls: 'mec',
        ir: 'mecanizacao' },
      { rot: 'Horas por tanque', val: G.num(C.horasPorTanque, 1), un: 'h', cls: 'acu',
        ir: 'acudagem' },
      { rot: 'Maior área atendida', val: G.num(C.maxHa, 1),
        un: 'ha', cls: 'mec', ir: 'mecanizacao' },
      { rot: 'Maior serviço de açudagem', val: G.num(C.maxHrs, 1),
        un: 'h', cls: 'acu', ir: 'acudagem' },

      /* ── SEÇÃO 3: Culturas e território ──────────────────────────── */
      { _sec: 'Culturas e território' },
      { rot: 'Culturas diferentes', val: G.num(C.areaCult.size), cls: 'mec', ir: 'cultura',
        sub: G.num(C.nCult) + ' declarações no total' },
      { rot: 'Área das culturas', val: G.num(C.haCult, 1), un: 'ha', cls: 'mec', ir: 'cultura' },
      { rot: 'Cultura com mais área', val: C.topCult ? G.esc(C.topCult.rot) : '—', cls: 'mec texto',
        ir: 'cultura', sub: C.topCult ? G.num(C.topCult.val, 1) + ' ha declarados' : '' },
      { rot: 'Município com mais hectares', val: C.topMun ? G.esc(C.topMun.rot) : '—', cls: 'mec texto',
        ir: 'municipio', sub: C.topMun ? G.num(C.topMun.val, 1) + ' ha mecanizados' : '' },
      { rot: 'Município com mais horas', val: C.topMunHrs ? G.esc(C.topMunHrs.rot) : '—', cls: 'acu texto',
        ir: 'municipio', sub: C.topMunHrs ? G.num(C.topMunHrs.val, 1) + ' h de máquina' : '' },
      { rot: 'Escritórios locais', val: G.num(C.nEsc), ir: 'escritorio',
        sub: G.num(C.nTec) + ' técnicos atuando' },

      /* ── SEÇÃO 4: Perfil dos beneficiários ───────────────────────── */
      { _sec: 'Perfil dos beneficiários' },
      { rot: 'Produtores recorrentes', val: G.num(C.nProdRec), ir: 'beneficiario',
        sub: C.pct(C.nProdRec, C.nProd) + ' voltaram mais de uma vez' },
      { rot: 'Mulheres atendidas', val: G.num(C.nMulher), ir: 'beneficiario',
        sub: D.length ? (C.nMulher / D.length * 100).toFixed(1).replace('.', ',') + '% dos atendimentos' : '' },
      // nomes distintos, não registros: o cartão está na seção de perfil dos
      // beneficiários, ao lado de "Produtores recorrentes", e contar linhas
      // fazia o mesmo produtor aparecer uma vez por atendimento
      { rot: 'Produtores com DAP', val: G.num(nProdutores(D.filter(function (r) { return r.dap === 'Sim'; }))),
        ir: 'beneficiario' },
      { rot: 'Associações e cooperativas', val: G.num(C.nAssoc), ir: 'beneficiario' },
      { rot: 'DAE arrecadada', val: C.daeVal(C.dae), cls: 'texto', ir: 'registros',
        sub: C.daeSub(C.nComDae) },
      { rot: 'Meses com vistoria', val: G.num(C.nMeses), ir: 'registros',
        sub: 'em ' + rotuloAno() }
    ]);

    pintarCat('gMunHa', ranking(C.haPorMun, 14));
    pintarCat('gTipo', ranking(C.atendPorPc, 2), { ordem: ORDEM.tipo, unidade: 'atendimentos', multicor: true });
    pintarCat('gCultGeral', ranking(C.areaCult, 10, true), { cor: 'var(--s4)' });
    pintarCat('gSistemaGeral', ranking(C.sis, 5, true), { unidade: 'culturas', ordem: ORDEM.sistema, multicor: true });
    serieDe('gSerie', D, function () { return 1; });
    pintarCat('gMunHrs', ranking(C.hrsPorMun, 12), { cor: 'var(--s2)' });
    pintarCat('gMunAc', ranking(C.acPorMun, 12), { cor: 'var(--s2)' });
    pintarCat('gEscGeral', ranking(C.atendPorEsc, 12), { cor: 'var(--s3)' });
  }

  /* ====================================================== ABA: MECANIZAÇÃO */
  function abaMecanizacao(C) {
    var D = C.D, mec = C.mec;
    tiles('kpisMec', [
      { _sec: 'Resultados da mecanização' },
      { rot: 'Hectares mecanizados', val: G.num(C.ha, 1), un: 'ha', cls: 'mec' },
      { rot: 'Vistorias de mecanização', val: G.num(mec.length), cls: 'mec', sub: C.pct(mec.length, D.length) + ' dos atendimentos' },
      { rot: 'Produtores atendidos', val: G.num(nProdutores(mec)), cls: 'mec', ir: 'beneficiario' },
      { rot: 'Municípios atendidos', val: G.num(nDistintos(mec, function (r) { return r.mun; })), cls: 'mec',
        ir: 'municipio' },
      { rot: 'Média por atendimento', val: G.num(mec.length ? C.ha / mec.length : 0, 1), un: 'ha', cls: 'mec' },
      { rot: 'Maior área atendida', val: G.num(C.maxHa, 1), un: 'ha', cls: 'mec' },

      { _sec: 'Culturas e áreas' },
      { rot: 'Hectares em culturas', val: G.num(C.haCult, 1), un: 'ha', cls: 'mec', ir: 'cultura' },
      { rot: 'Culturas diferentes', val: G.num(C.areaCult.size), cls: 'mec', ir: 'cultura', sub: G.num(C.nCult) + ' declarações' },
      { rot: 'Cultura com mais área', val: C.topCult ? G.esc(C.topCult.rot) : '—', cls: 'mec texto', ir: 'cultura',
        sub: C.topCult ? G.num(C.topCult.val, 1) + ' ha declarados' : '' },
      { rot: 'Município com mais hectares', val: C.topMun ? G.esc(C.topMun.rot) : '—', cls: 'mec texto', ir: 'municipio',
        sub: C.topMun ? G.num(C.topMun.val, 1) + ' ha mecanizados' : '' },
      { rot: 'Atendimentos com cultura', val: G.num(C.nComCult), cls: 'mec', sub: 'de ' + G.num(D.length) + ' no total' },
      { rot: 'Culturas por atendimento', val: G.num(C.nComCult ? C.nCult / C.nComCult : 0, 1), cls: 'mec' },

      { _sec: 'Máquinas e arrecadação' },
      { rot: 'Tipos de máquina', val: G.num(C.maqMec.size), cls: 'mec' },
      { rot: 'Máquina mais usada', val: C.topMaq ? G.esc(C.topMaq.rot) : '—', cls: 'mec texto',
        sub: C.topMaq ? G.num(C.topMaq.val) + ' atendimentos' : '' },
      { rot: 'Implementos e serviços', val: G.num(C.implMec.size), cls: 'mec' },
      { rot: 'DAE arrecadada', val: C.daeVal(soma(mec, function (r) { return r.dae; })), cls: 'mec texto',
        sub: C.daeSub(mec.filter(function (r) { return r.dae > 0; }).length) },
      { rot: 'Escritórios envolvidos', val: G.num(nDistintos(mec, function (r) { return r.esc; })), cls: 'mec',
        ir: 'escritorio' },
      { rot: 'Meses com vistoria', val: G.num(new Set(mec.map(function (r) { return mesChave(r); })).size), cls: 'mec',
        ir: 'registros', sub: 'em ' + rotuloAno() }
    ]);
    serieDe('gSerieMec', mec, function (r) { return r.ha; }, MEC);
    pintarCat('gMecMun', ranking(C.haPorMun, 14));
    pintarCat('gMaq', ranking(C.maqMec, 10), { cor: 'var(--s1)' });
    pintarCat('gImpl', ranking(C.implMec, 10), { cor: 'var(--s5)' });
    pintarCat('gTrator', ranking(contar(mec, function (r) { return r.tt; }), 4), { unidade: 'atendimentos', multicor: true });
    pintarCat('gFaixa', faixas(mec, function (r) { return r.ha; }, [
      { rot: 'até 2 ha', max: 2 }, { rot: '2 a 5 ha', max: 5 }, { rot: '5 a 10 ha', max: 10 },
      { rot: '10 a 20 ha', max: 20 }, { rot: '20 a 50 ha', max: 50 }, { rot: 'acima de 50 ha', max: Infinity }
    ]), { cor: 'var(--s1)' });
  }

  /* ========================================================= ABA: AÇUDAGEM */
  function abaAcudagem(C) {
    var D = C.D, acu = C.acu;
    tiles('kpisAcu', [
      { _sec: 'Resultados da açudagem' },
      { rot: 'Horas de máquina', val: G.num(C.hrs, 1), un: 'h', cls: 'acu' },
      { rot: 'Tanques / açudes', val: G.num(C.nAc), cls: 'acu' },
      { rot: 'Vistorias de açudagem', val: G.num(acu.length), cls: 'acu', sub: C.pct(acu.length, D.length) + ' dos atendimentos' },
      { rot: 'Produtores atendidos', val: G.num(nProdutores(acu)), cls: 'acu', ir: 'beneficiario' },
      { rot: 'Municípios atendidos', val: G.num(nDistintos(acu, function (r) { return r.mun; })), cls: 'acu',
        ir: 'municipio' },
      { rot: 'Escritórios envolvidos', val: G.num(nDistintos(acu, function (r) { return r.esc; })), cls: 'acu',
        ir: 'escritorio' },

      { _sec: 'Produtividade' },
      { rot: 'Horas por tanque', val: G.num(C.horasPorTanque, 1), un: 'h', cls: 'acu',
        sub: G.num(C.acuProd.length) + ' vistorias com hora e tanque' },
      { rot: 'Horas por vistoria', val: G.num(acu.length ? C.hrs / acu.length : 0, 1), un: 'h', cls: 'acu' },
      { rot: 'Tanques por vistoria', val: G.num(acu.length ? C.nAc / acu.length : 0, 1), cls: 'acu' },
      { rot: 'Maior serviço', val: G.num(C.maxHrs, 1), un: 'h', cls: 'acu' },
      { rot: 'Mais tanques numa vistoria', val: G.num(C.maxAc), cls: 'acu' },
      { rot: 'Meses com vistoria', val: G.num(new Set(acu.map(function (r) { return mesChave(r); })).size), cls: 'acu',
        ir: 'registros', sub: 'em ' + rotuloAno() },

      { _sec: 'Território e arrecadação' },
      { rot: 'Município com mais horas', val: C.topMunHrs ? G.esc(C.topMunHrs.rot) : '—', cls: 'acu texto', ir: 'municipio',
        sub: C.topMunHrs ? G.num(C.topMunHrs.val, 1) + ' h de máquina' : '' },
      { rot: 'Município com mais tanques', val: C.topMunAc ? G.esc(C.topMunAc.rot) : '—', cls: 'acu texto', ir: 'municipio',
        sub: C.topMunAc ? G.num(C.topMunAc.val) + ' tanques' : '' },
      { rot: 'Escritório com mais horas', val: C.topEscHrs ? G.esc(C.topEscHrs.rot) : '—', cls: 'acu texto', ir: 'escritorio',
        sub: C.topEscHrs ? G.num(C.topEscHrs.val, 1) + ' h de máquina' : '' },
      { rot: 'DAE arrecadada', val: C.daeVal(soma(acu, function (r) { return r.dae; })), cls: 'acu texto',
        sub: C.daeSub(acu.filter(function (r) { return r.dae > 0; }).length) },
      { rot: 'Técnicos atuando', val: G.num(nDistintos(acu, function (r) { return r.rt; })), cls: 'acu',
        ir: 'escritorio' },
      { rot: 'Tipos de máquina', val: G.num(C.maqAcu.size), cls: 'acu' }
    ]);
    serieDe('gSerieAcu', acu, function (r) { return r.hrs; }, ACU);
    serieDe('gSerieAc', acu, function (r) { return r.ac; }, ACU);
    pintarCat('gAcuMun', ranking(C.acPorMun, 12), { cor: 'var(--s2)' });
    pintarCat('gAcuEsc', ranking(C.hrsPorEsc, 12), { cor: 'var(--s2)' });
    pintarCat('gMaqAcu', ranking(C.maqAcu, 8), { cor: 'var(--s2)' });
    pintarCat('gAcuQtd', faixas(acu, function (r) { return r.ac; }, [
      { rot: '1 tanque', max: 1 }, { rot: '2 tanques', max: 2 },
      { rot: '3 tanques', max: 3 }, { rot: '4 ou mais', max: Infinity }
    ]), { cor: 'var(--s2)' });
  }

  /* ========================================================== ABA: CULTURA */
  function abaCultura(C) {
    var D = C.D, acu = C.acu;
    tiles('kpisCult', [
      { _sec: 'Áreas e declarações' },
      { rot: 'Hectares em culturas', val: G.num(C.haCult, 1), un: 'ha', cls: 'mec' },
      { rot: 'Culturas diferentes', val: G.num(C.areaCult.size), cls: 'mec',
        sub: C.vs(C.areaCult.size, (function () { var m = new Set(); C.Dant.forEach(function (r) {
          r.cult.forEach(function (c) { m.add(c[0]); }); }); return m.size; })()) },
      { rot: 'Declarações de cultura', val: G.num(C.nCult), cls: 'mec' },
      { rot: 'Área média declarada', val: G.num(C.nCult ? C.haCult / C.nCult : 0, 1), un: 'ha', cls: 'mec' },
      { rot: 'Atendimentos com cultura', val: G.num(C.nComCult), cls: 'mec', sub: 'de ' + G.num(D.length) + ' no total' },
      { rot: 'Culturas por atendimento', val: G.num(C.nComCult ? C.nCult / C.nComCult : 0, 1), cls: 'mec' },

      { _sec: 'Destaques' },
      { rot: 'Cultura com mais área', val: C.topCult ? G.esc(C.topCult.rot) : '—', cls: 'mec texto',
        sub: C.topCult ? G.num(C.topCult.val, 1) + ' ha declarados' : '' },
      { rot: 'Cultura mais frequente', val: C.topCultQtd ? G.esc(C.topCultQtd.rot) : '—', cls: 'mec texto',
        sub: C.topCultQtd ? G.num(C.topCultQtd.val) + ' declarações' : '' },
      { rot: 'Sistema predominante', val: C.topSis ? G.esc(C.topSis.rot) : '—', cls: 'mec texto',
        sub: C.topSis ? G.num(C.topSis.val) + ' culturas' : '' },
      { rot: 'Sistemas de cultivo', val: G.num(C.sis.size), cls: 'mec' },
      { rot: 'Município com mais hectares', val: C.topMun ? G.esc(C.topMun.rot) : '—', cls: 'mec texto', ir: 'municipio',
        sub: C.topMun ? G.num(C.topMun.val, 1) + ' ha mecanizados' : '' },
      { rot: 'Municípios com cultura', val: G.num(nDistintos(D.filter(function (r) { return r.cult.length; }),
        function (r) { return r.mun; })), cls: 'mec', ir: 'municipio' },
      // o recorte destes contadores é TODA a seleção, não só mecanização:
      // este cartão mostra quanto da conta vem da açudagem
      { rot: 'Declarações em açudagem', val: G.num(acu.filter(function (r) { return r.cult.length; }).length),
        cls: 'acu' }
    ]);
    var rkCult = ranking(C.areaCult, 14);
    rkCult.forEach(function (d) { d.sub = '(' + G.num(C.qtdCult.get(d.rot) || 0) + ' reg.)'; });
    pintarCat('gCult', rkCult, { cor: 'var(--s4)' });
    pintarCat('gCultQtd', ranking(C.qtdCult, 14), { cor: 'var(--s4)' });
    pintarCat('gSistema', ranking(C.sis, 5, true), { unidade: 'culturas', ordem: ORDEM.sistema, multicor: true });
    // D, e não mec: 84 vistorias de açudagem também declaram cultura, e o
    // contador "Atendimentos com cultura" ao lado já conta essas
    pintarCat('gCultPorReg', faixas(D, function (r) { return r.cult.length; }, [
      { rot: '1 cultura', max: 1 }, { rot: '2 culturas', max: 2 },
      { rot: '3 culturas', max: 3 }, { rot: '4 culturas', max: 4 }
    ]), { cor: 'var(--s4)' });
    tabelaCulturaMunicipio(D);
  }

  /* ======================================================== ABA: MUNICÍPIO */
  function abaMunicipio(C) {
    var D = C.D;
    tiles('kpisMun', [
      { _sec: 'Cobertura territorial' },
      { rot: 'Municípios atendidos', val: G.num(C.nMun) },
      { rot: 'Atendimentos', val: G.num(D.length), ir: 'registros' },
      { rot: 'Produtores atendidos', val: G.num(C.nProd), ir: 'beneficiario',
        sub: G.num(C.nProd ? D.length / C.nProd : 0, 1) + ' atendimentos por produtor' },
      { rot: 'Escritórios locais', val: G.num(C.nEsc), ir: 'escritorio', sub: G.num(C.nTec) + ' técnicos atuando' },
      { rot: 'Atendimentos por município', val: G.num(C.nMun ? D.length / C.nMun : 0, 1) },
      { rot: 'Meses com vistoria', val: G.num(C.nMeses), ir: 'registros', sub: 'em ' + rotuloAno() },

      { _sec: 'Volume por território' },
      { rot: 'Hectares mecanizados', val: G.num(C.ha, 1), un: 'ha', cls: 'mec', ir: 'mecanizacao' },
      { rot: 'Horas de máquina', val: G.num(C.hrs, 1), un: 'h', cls: 'acu', ir: 'acudagem' },
      { rot: 'Tanques / açudes', val: G.num(C.nAc), cls: 'acu', ir: 'acudagem' },
      { rot: 'Hectares por município', val: G.num(C.nMun ? C.ha / C.nMun : 0, 1), un: 'ha', cls: 'mec' },
      { rot: 'Horas por município', val: G.num(C.nMun ? C.hrs / C.nMun : 0, 1), un: 'h', cls: 'acu' },
      { rot: 'DAE arrecadada', val: C.daeVal(C.dae), cls: 'texto', ir: 'registros', sub: C.daeSub(C.nComDae) },

      { _sec: 'Destaques por município' },
      { rot: 'Mais hectares', val: C.topMun ? G.esc(C.topMun.rot) : '—', cls: 'mec texto',
        sub: C.topMun ? G.num(C.topMun.val, 1) + ' ha mecanizados' : '' },
      { rot: 'Mais horas de máquina', val: C.topMunHrs ? G.esc(C.topMunHrs.rot) : '—', cls: 'acu texto',
        sub: C.topMunHrs ? G.num(C.topMunHrs.val, 1) + ' h de escavadeira' : '' },
      { rot: 'Mais tanques', val: C.topMunAc ? G.esc(C.topMunAc.rot) : '—', cls: 'acu texto',
        sub: C.topMunAc ? G.num(C.topMunAc.val) + ' tanques' : '' },
      { rot: 'Mais atendimentos', val: C.topMunAt ? G.esc(C.topMunAt.rot) : '—', cls: 'texto',
        sub: C.topMunAt ? G.num(C.topMunAt.val) + ' vistorias' : '' },
      { rot: 'Culturas diferentes', val: G.num(C.areaCult.size), cls: 'mec', ir: 'cultura' },
      { rot: 'Municípios sem açudagem', val: G.num(C.nMun - nDistintos(C.acu, function (r) { return r.mun; })) }
    ]);
    pintarCat('gMunHa2', ranking(C.haPorMun, 14));
    pintarCat('gMunHrs2', ranking(C.hrsPorMun, 14), { cor: 'var(--s2)' });
    pintarCat('gMunAc2', ranking(C.acPorMun, 14), { cor: 'var(--s2)' });
    pintarCat('gMunProd', ranking(C.prodPorMun, 14), { cor: 'var(--s3)' });
    tabelaResumo('tMun', D, function (r) { return r.mun; }, 'Município');
  }

  /* ============================================================ ABA: MAPA
     Não há coordenada por vistoria (ver nota() mais abaixo, "sem coordenada
     geográfica utilizável"), então o mapa é por MUNICÍPIO: cada polígono
     mostra se houve mecanização, açudagem ou os dois, dentro do filtro
     ativo. O desenho (window.MapaMunicipios, que usa window.MAPA_ACRE) roda
     uma vez só; toda chamada seguinte apenas repinta as cores e refaz as
     listas do painel lateral — refazer os 22 caminhos a cada filtro seria
     desperdício. O painel lateral não tem estado próprio: ele pilota
     F.pc/F.reg/F.mun através de MULTI.fPonto/fReg/fMun.aoMudar(), os mesmos
     filtros da lateral esquerda, para o mapa nunca discordar do resto do
     painel. */
  var MAPA_MEC = null;
  var MAPA_MEC_ID_POR_NOME = null;   // chaveBusca(nome IBGE) -> id (string)

  function mapaMecIdPorNome(nome) {
    if (!MAPA_MEC_ID_POR_NOME) {
      MAPA_MEC_ID_POR_NOME = {};
      if (window.MAPA_ACRE) {
        window.MAPA_ACRE.localidades.forEach(function (m) {
          MAPA_MEC_ID_POR_NOME[chaveBusca(m.nome)] = String(m.id);
        });
      }
    }
    return MAPA_MEC_ID_POR_NOME[chaveBusca(nome || '')] || '';
  }

  function mapaMecNomePorId(id) {
    if (!window.MAPA_ACRE) return '';
    var achado = window.MAPA_ACRE.localidades.filter(function (l) { return String(l.id) === id; })[0];
    return achado ? achado.nome : '';
  }

  /* A base grava o mesmo município com grafias diferentes (ver REG_DE_MUN
     acima) — um clique no mapa precisa marcar TODAS as variantes daquele
     município no filtro, senão o painel zeraria em silêncio. */
  function mapaMecVariantes(nomeCanonico) {
    var chave = chaveBusca(nomeCanonico);
    var vistas = {}, lista = [];
    TODOS.forEach(function (r) {
      if (chaveBusca(r.mun) === chave && !vistas[r.mun]) { vistas[r.mun] = true; lista.push(r.mun); }
    });
    return lista;
  }

  function mapaMecCorCategoria(cat) {
    if (cat === 'mec') return 'var(--mec)';
    if (cat === 'acu') return 'var(--acu)';
    if (cat === 'both') return 'color-mix(in srgb, var(--mec) 50%, var(--acu) 50%)';
    return 'var(--grade)';
  }

  function mapaMecCliqueMapa(id) {
    var nome = mapaMecNomePorId(id);
    if (!nome) return;
    var variantes = mapaMecVariantes(nome);
    if (!variantes.length) return;
    var jaAtivo = F.mun.length === variantes.length &&
      variantes.every(function (v) { return F.mun.indexOf(v) >= 0; });
    if (MULTI.fMun) MULTI.fMun.aoMudar(jaAtivo ? [] : variantes);
  }

  function mapaMecCliqueMunicipio(mun) {
    var jaAtivo = F.mun.length === 1 && F.mun[0] === mun;
    if (MULTI.fMun) MULTI.fMun.aoMudar(jaAtivo ? [] : [mun]);
  }

  function mapaMecDestacado() {
    if (!F.mun.length) return '';
    var ids = unicos(F.mun.map(mapaMecIdPorNome).filter(Boolean));
    return ids.length === 1 ? ids[0] : '';
  }

  function mapaMecDesenharTipo() {
    var host = el('mapaMecTipo');
    if (!host) return;
    var opcoes = [
      { v: MEC, rot: 'Mecanização', cls: 'mec' },
      { v: ACU, rot: 'Açudagem', cls: 'acu' },
      { v: '', rot: 'Os dois', cls: 'ambos' }
    ];
    host.innerHTML = opcoes.map(function (o) {
      var ativo = o.v ? (F.pc.length === 1 && F.pc[0] === o.v) : !F.pc.length;
      return '<button type="button" class="mapa-mec-tipo-btn' + (ativo ? ' ativo' : '') +
        '" data-v="' + G.esc(o.v) + '"><span class="ponto ' + o.cls + '"></span>' + G.esc(o.rot) + '</button>';
    }).join('');
    if (host.getAttribute('data-ligado') !== '1') {
      host.setAttribute('data-ligado', '1');
      host.addEventListener('click', function (e) {
        var btn = e.target.closest('.mapa-mec-tipo-btn');
        if (!btn || !MULTI.fPonto) return;
        var v = btn.getAttribute('data-v');
        MULTI.fPonto.aoMudar(v ? [v] : []);
      });
    }
  }

  function mapaMecDesenharRegionais(C) {
    var host = el('mapaMecRegionais');
    if (!host) return;
    var contPorReg = {};
    C.D.forEach(function (r) {
      var g = regionalDe(r.mun);
      if (g) contPorReg[g] = (contPorReg[g] || 0) + 1;
    });
    host.innerHTML = REGIONAIS.map(function (r) {
      var ativo = F.reg.length === 1 && F.reg[0] === r.nome;
      return '<li><button type="button" class="' + (ativo ? 'ativo' : '') + '" data-v="' + G.esc(r.nome) + '">' +
        '<span>' + G.esc(r.nome) + '</span><span class="qtd">' + G.num(contPorReg[r.nome] || 0) + '</span></button></li>';
    }).join('');
    if (host.getAttribute('data-ligado') !== '1') {
      host.setAttribute('data-ligado', '1');
      host.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-v]');
        if (!btn || !MULTI.fReg) return;
        var v = btn.getAttribute('data-v');
        var jaAtivo = F.reg.length === 1 && F.reg[0] === v;
        MULTI.fReg.aoMudar(jaAtivo ? [] : [v]);
      });
    }
  }

  function mapaMecDesenharMunicipios(C) {
    var host = el('mapaMecMunicipios');
    if (!host) return;
    var lista = ranking(C.atendPorMun, 999);
    host.innerHTML = lista.map(function (item) {
      var ativo = F.mun.length === 1 && F.mun[0] === item.rot;
      return '<li><button type="button" class="' + (ativo ? 'ativo' : '') + '" data-v="' + G.esc(item.rot) + '">' +
        '<span>' + G.esc(item.rot) + '</span><span class="qtd">' + G.num(item.val) + '</span></button></li>';
    }).join('');
    if (host.getAttribute('data-ligado') !== '1') {
      host.setAttribute('data-ligado', '1');
      host.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-v]');
        if (btn) mapaMecCliqueMunicipio(btn.getAttribute('data-v'));
      });
    }
  }

  function abaMapa(C) {
    var svg = el('mapaMec'), status = el('mapaMecStatus');
    if (!svg) return;
    if (!MAPA_MEC) {
      if (!window.MapaMunicipios || !window.MAPA_ACRE) {
        if (status) status.textContent = 'Não foi possível carregar o mapa.';
        return;
      }
      MAPA_MEC = window.MapaMunicipios.desenhar(svg, { aoClicar: mapaMecCliqueMapa });
      if (status) status.hidden = true;
    }
    if (!MAPA_MEC) return;

    var catPorId = {};
    C.D.forEach(function (r) {
      var id = mapaMecIdPorNome(r.mun);
      if (!id) return;
      var atual = catPorId[id] || 'none';
      var este = r.pc === MEC ? 'mec' : r.pc === ACU ? 'acu' : 'none';
      catPorId[id] = atual === 'none' ? este : atual === este ? atual : 'both';
    });
    MAPA_MEC.pintar(function (id) { return mapaMecCorCategoria(catPorId[id] || 'none'); });
    MAPA_MEC.destacar(mapaMecDestacado());

    mapaMecDesenharTipo();
    mapaMecDesenharRegionais(C);
    mapaMecDesenharMunicipios(C);
  }

  /* ================================================= ABA: ESCRITÓRIO LOCAL */
  function abaEscritorio(C) {
    var D = C.D;
    tiles('kpisEsc', [
      { _sec: 'Estrutura de atendimento' },
      { rot: 'Escritórios locais', val: G.num(C.nEsc) },
      { rot: 'Técnicos atuando', val: G.num(C.nTec) },
      { rot: 'Atendimentos', val: G.num(D.length), ir: 'registros' },
      { rot: 'Municípios cobertos', val: G.num(C.nMun), ir: 'municipio' },
      { rot: 'Produtores atendidos', val: G.num(C.nProd), ir: 'beneficiario',
        sub: G.num(C.nProd ? D.length / C.nProd : 0, 1) + ' atendimentos por produtor' },
      { rot: 'Atendimentos por escritório', val: G.num(C.nEsc ? D.length / C.nEsc : 0, 1) },

      { _sec: 'Produção por escritório' },
      { rot: 'Hectares mecanizados', val: G.num(C.ha, 1), un: 'ha', cls: 'mec', ir: 'mecanizacao' },
      { rot: 'Horas de máquina', val: G.num(C.hrs, 1), un: 'h', cls: 'acu', ir: 'acudagem' },
      { rot: 'Tanques / açudes', val: G.num(C.nAc), cls: 'acu', ir: 'acudagem' },
      { rot: 'Hectares por escritório', val: G.num(C.nEsc ? C.ha / C.nEsc : 0, 1), un: 'ha', cls: 'mec' },
      { rot: 'Atendimentos por técnico', val: G.num(C.nTec ? D.length / C.nTec : 0, 1) },
      { rot: 'DAE arrecadada', val: C.daeVal(C.dae), cls: 'texto', ir: 'registros', sub: C.daeSub(C.nComDae) },

      { _sec: 'Destaques' },
      { rot: 'Mais atendimentos', val: C.topEscAt ? G.esc(C.topEscAt.rot) : '—', cls: 'texto',
        sub: C.topEscAt ? G.num(C.topEscAt.val) + ' vistorias' : '' },
      { rot: 'Mais hectares', val: C.topEscHa ? G.esc(C.topEscHa.rot) : '—', cls: 'mec texto',
        sub: C.topEscHa ? G.num(C.topEscHa.val, 1) + ' ha mecanizados' : '' },
      { rot: 'Mais horas de máquina', val: C.topEscHrs ? G.esc(C.topEscHrs.rot) : '—', cls: 'acu texto',
        sub: C.topEscHrs ? G.num(C.topEscHrs.val, 1) + ' h de escavadeira' : '' },
      { rot: 'Técnico com mais vistorias', val: C.topTec ? G.esc(C.topTec.rot) : '—', cls: 'texto',
        sub: C.topTec ? G.num(C.topTec.val) + ' atendimentos' : '' },
      { rot: 'Vistorias de mecanização', val: G.num(C.mec.length), cls: 'mec', ir: 'mecanizacao', sub: C.pct(C.mec.length, D.length) + ' do total' },
      { rot: 'Vistorias de açudagem', val: G.num(C.acu.length), cls: 'acu', ir: 'acudagem', sub: C.pct(C.acu.length, D.length) + ' do total' }
    ]);
    pintarCat('gEsc', ranking(C.atendPorEsc, 14), { cor: 'var(--s3)' });
    pintarCat('gEscHa', ranking(C.haPorEsc, 14));
    pintarCat('gEscHrs', ranking(C.hrsPorEsc, 14), { cor: 'var(--s2)' });
    pintarCat('gTec', ranking(C.atendPorTec, 14), { cor: 'var(--s3)' });
    tabelaResumo('tEsc', D, function (r) { return r.esc; }, 'Escritório local');
  }

  /* ===================================================== ABA: BENEFICIÁRIO */
  /* Só a consulta por produtor: nada aparece até alguém ser escolhido na
     busca — ficha() é quem preenche contadores e histórico. Montar a lista de
     ~2.600 nomes com localeCompare é caro, e antes rodava em todo render. */
  function abaBeneficiario(C) {
    montarSelProd(C.D);
  }

  /* ======================================================== ABA: REGISTROS */
  function abaRegistros(C) {
    var D = C.D;
    var comDap   = D.filter(function (r) { return r.dap !== NI; }).length;
    var comPropr = D.filter(function (r) { return r.propr && r.propr !== NI; }).length;
    var comObs   = D.filter(function (r) { return r.obs; }).length;

    tiles('kpisReg', [
      { _sec: 'Volume de registros' },
      { rot: 'Registros na seleção', val: G.num(D.length), sub: 'de ' + G.num(C.noAno) + ' no período' },
      { rot: 'Vistorias de mecanização', val: G.num(C.mec.length), cls: 'mec', ir: 'mecanizacao', sub: C.pct(C.mec.length, D.length) + ' do total' },
      { rot: 'Vistorias de açudagem', val: G.num(C.acu.length), cls: 'acu', ir: 'acudagem', sub: C.pct(C.acu.length, D.length) + ' do total' },
      // mec + acu nem sempre fecha o total: há registro sem Ponto de controle
      { rot: 'Sem serviço informado', val: G.num(C.semServico),
        sub: C.semServico ? 'não entram em mecanização nem açudagem' : 'todos classificados' },
      { rot: 'Meses com vistoria', val: G.num(C.nMeses), sub: 'em ' + rotuloAno() },
      { rot: 'Registros por mês', val: G.num(C.nMeses ? D.length / C.nMeses : 0, 1) },

      { _sec: 'Conteúdo dos registros' },
      { rot: 'Hectares mecanizados', val: G.num(C.ha, 1), un: 'ha', cls: 'mec', ir: 'mecanizacao' },
      { rot: 'Horas de máquina', val: G.num(C.hrs, 1), un: 'h', cls: 'acu', ir: 'acudagem' },
      { rot: 'Tanques / açudes', val: G.num(C.nAc), cls: 'acu', ir: 'acudagem' },
      { rot: 'DAE arrecadada', val: C.daeVal(C.dae), cls: 'texto', sub: C.daeSub(C.nComDae) },
      { rot: 'Culturas diferentes', val: G.num(C.areaCult.size), cls: 'mec', ir: 'cultura', sub: G.num(C.nCult) + ' declarações' },
      { rot: 'Associações citadas', val: G.num(C.nAssoc), ir: 'beneficiario' },

      { _sec: 'Abrangência' },
      { rot: 'Municípios', val: G.num(C.nMun), ir: 'municipio' },
      { rot: 'Escritórios locais', val: G.num(C.nEsc), ir: 'escritorio' },
      { rot: 'Técnicos responsáveis', val: G.num(C.nTec), ir: 'escritorio' },
      { rot: 'Produtores atendidos', val: G.num(C.nProd), ir: 'beneficiario' },
      { rot: 'Atendimentos por município', val: G.num(C.nMun ? D.length / C.nMun : 0, 1) },
      // só o caso que pede aviso: com filtro ativo o próprio número já diz tudo
      { rot: 'Filtros ativos', val: G.num(C.ativos), sub: C.ativos ? '' : 'nenhum filtro aplicado' },

      /* Quanto do cadastro está de fato preenchido. Antes isso só existia no
         texto da nota, que quase ninguém abre — e não respondia aos filtros. */
      { _sec: 'Qualidade do cadastro' },
      { rot: 'DAP informada', val: C.pct(comDap, D.length), cls: 'texto',
        sub: G.num(D.length - comDap) + ' sem resposta sobre DAP' },
      { rot: 'Propriedade informada', val: C.pct(comPropr, D.length), cls: 'texto',
        sub: G.num(D.length - comPropr) + ' sem nome do imóvel' },
      { rot: 'Formulário digitalizado', val: C.pct(C.nComForm, D.length), cls: 'texto',
        sub: G.num(D.length - C.nComForm) + ' sem link do formulário' },
      { rot: 'Cultura declarada', val: C.pct(C.nComCult, D.length), cls: 'mec texto',
        sub: G.num(D.length - C.nComCult) + ' sem nenhuma cultura' },
      { rot: 'Observação preenchida', val: C.pct(comObs, D.length), cls: 'texto',
        sub: G.num(comObs) + ' registros com anotação' }
    ]);
    tabela(D);
  }

  /* ======================================================== ABA: RELATÓRIO */
  function abaRelatorio(C) {
    var D = C.D;
    tiles('kpisRel', [
      { _sec: 'Abrangência do relatório' },
      { rot: 'Municípios com registro', val: G.num(C.nMun) },
      { rot: 'Atendimentos', val: G.num(D.length), ir: 'registros' },
      { rot: 'Produtores atendidos', val: G.num(C.nProd), ir: 'beneficiario',
        sub: G.num(C.nProd ? D.length / C.nProd : 0, 1) + ' atendimentos por produtor' },
      { rot: 'Escritórios locais', val: G.num(C.nEsc), ir: 'escritorio', sub: G.num(C.nTec) + ' técnicos atuando' },
      { rot: 'Meses com vistoria', val: G.num(C.nMeses), sub: 'em ' + rotuloAno() },
      { rot: 'Atendimentos por município', val: G.num(C.nMun ? D.length / C.nMun : 0, 1) },

      { _sec: 'Totais consolidados' },
      { rot: 'Hectares mecanizados', val: G.num(C.ha, 1), un: 'ha', cls: 'mec', ir: 'mecanizacao', sub: G.num(C.mec.length) + ' vistorias' },
      { rot: 'Horas de máquina', val: G.num(C.hrs, 1), un: 'h', cls: 'acu', ir: 'acudagem', sub: G.num(C.acu.length) + ' vistorias' },
      { rot: 'Tanques / açudes', val: G.num(C.nAc), cls: 'acu', ir: 'acudagem' },
      { rot: 'Culturas diferentes', val: G.num(C.areaCult.size), cls: 'mec', ir: 'cultura', sub: G.num(C.haCult, 1) + ' ha declarados' },
      { rot: 'DAE arrecadada', val: C.daeVal(C.dae), cls: 'texto', sub: C.daeSub(C.nComDae) },
      { rot: 'Município com mais hectares', val: C.topMun ? G.esc(C.topMun.rot) : '—', cls: 'mec texto', ir: 'municipio',
        sub: C.topMun ? G.num(C.topMun.val, 1) + ' ha mecanizados' : '' }
    ]);
    renderRelatorio(D);
  }

  /* ================== ABAS DE INSERÇÃO E CULTURAS (admin) ==================
     Reproduzem as planilhas "Inserções por pessoa", "Inserções por dia",
     "Inserção por mes" e "culturas" do arquivo de mecanização.

     A diferença para o resto do painel: aqui a unidade é o LANÇAMENTO — uma
     linha da planilha — e a data é a de INSERÇÃO (Carimbo de data/hora),
     nunca a da vistoria. É produtividade de quem alimenta o formulário, não
     de quem faz o serviço. Como nomeiam quem lançou cada linha, ficam atrás
     da senha, junto com "Atualizar dados".

     Os números batem com as abas da planilha quando o Período é o exercício
     dela e nenhum outro filtro está marcado. */

  var MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  /** Dia da semana de uma data ISO. Ao meio-dia UTC de propósito: com
      'YYYY-MM-DD' puro o JS assume UTC 00:00 e, em fuso negativo como o do
      Acre, a data volta um dia — 25/01/2026 saía sábado em vez de domingo. */
  function diaSemana(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }
  function fimDeSemana(iso) { var s = diaSemana(iso); return s === 0 || s === 6; }
  function diasNoMes(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }
  function iso2(v) { return String(v).padStart(2, '0'); }
  function mesLongo(ym) { return MESES_LONGO[+ym.slice(5, 7) - 1]; }
  /** Chave mais frequente de um Map de contagens ('' quando não há nenhuma). */
  function maisFrequente(m) {
    var rot = '', val = 0;
    m.forEach(function (v, k) { if (v > val) { val = v; rot = k; } });
    return { rot: rot, val: val };
  }
  function variacao(atual, anterior) {
    if (anterior == null) return null;
    return { dif: atual - anterior, pct: anterior ? (atual - anterior) / anterior * 100 : null };
  }
  /** "▲ +7 (47%)" — a seta e a cor dizem o sinal, para não depender só do "-". */
  function celVariacao(v) {
    if (!v) return '<td class="num"><span class="nada">—</span></td>';
    if (!v.dif) return '<td class="num"><span class="nada">=</span></td>';
    var cls = v.dif > 0 ? 'var-sobe' : 'var-cai';
    var pct = v.pct == null ? '' : ' (' + (v.pct > 0 ? '+' : '') + G.num(v.pct, 0) + '%)';
    return '<td class="num ' + cls + '">' + (v.dif > 0 ? '▲ +' : '▼ ') + G.num(v.dif) + pct + '</td>';
  }

  /** Agregados de inserção da seleção corrente, calculados uma vez e
      guardados no contexto: as três abas de inserção leem o mesmo objeto. */
  function insercoes(C) {
    if (C._ins) return C._ins;

    var dias = new Map();      // 'YYYY-MM-DD' -> { n, alim, mun }
    var pessoas = new Map();   // inseridor    -> { n, dias, ini, fim, mun, mes }
    var meses = new Map();     // 'YYYY-MM'    -> { n, dias }
    var ultimo = '';

    C.D.forEach(function (r) {
      if (!r.d) return;
      var quem = r.alim || NI, onde = r.mun || NI, ym = r.d.slice(0, 7);

      var dia = dias.get(r.d);
      if (!dia) dias.set(r.d, dia = { n: 0, alim: new Map(), mun: new Map() });
      dia.n++;
      dia.alim.set(quem, (dia.alim.get(quem) || 0) + 1);
      dia.mun.set(onde, (dia.mun.get(onde) || 0) + 1);

      var p = pessoas.get(quem);
      if (!p) pessoas.set(quem, p = { n: 0, dias: new Set(), ini: r.d, fim: r.d, mun: new Map(), mes: new Map() });
      p.n++;
      p.dias.add(r.d);
      if (r.d < p.ini) p.ini = r.d;
      if (r.d > p.fim) p.fim = r.d;
      p.mun.set(onde, (p.mun.get(onde) || 0) + 1);
      p.mes.set(ym, (p.mes.get(ym) || 0) + 1);

      var m = meses.get(ym);
      if (!m) meses.set(ym, m = { n: 0, dias: new Set() });
      m.n++;
      m.dias.add(+r.d.slice(8, 10));
      if (r.d > ultimo) ultimo = r.d;
    });

    var diasOrd = Array.from(dias.keys()).sort().map(function (iso, i, todos) {
      var d = dias.get(iso), top = maisFrequente(d.alim);
      return {
        iso: iso, n: d.n,
        semana: diaSemana(iso),
        mun: maisFrequente(d.mun).rot,
        alim: top.rot,
        // participação do maior inseridor no dia: 100% = o dia foi de um só
        part: d.n ? top.val / d.n * 100 : 0,
        vari: variacao(d.n, i ? dias.get(todos[i - 1]).n : null)
      };
    });

    var pessoasOrd = Array.from(pessoas, function (e) {
      return {
        rot: e[0], n: e[1].n, dias: e[1].dias.size, ini: e[1].ini, fim: e[1].fim,
        mun: maisFrequente(e[1].mun).rot, mes: e[1].mes,
        ritmo: e[1].dias.size ? e[1].n / e[1].dias.size : 0,
        pct: C.D.length ? e[1].n / C.D.length * 100 : 0
      };
    }).sort(function (a, b) { return b.n - a.n || a.rot.localeCompare(b.rot, 'pt-BR'); });

    /* Dias ÚTEIS sem inserção, como na planilha: sábado e domingo não contam
       como falta, e o mês do último lançamento é medido só até ele — senão o
       mês corrente apareceria devendo os dias que ainda não chegaram. */
    var mesesOrd = Array.from(meses.keys()).sort().map(function (ym, i, todos) {
      var m = meses.get(ym);
      var ano = +ym.slice(0, 4), mes = +ym.slice(5, 7);
      var limite = ym === ultimo.slice(0, 7) ? +ultimo.slice(8, 10) : diasNoMes(ano, mes);
      var sem = [];
      for (var d = 1; d <= limite; d++) {
        if (!m.dias.has(d) && !fimDeSemana(ym + '-' + iso2(d))) sem.push(d);
      }
      return {
        ym: ym, ano: ano, mes: mes, n: m.n,
        com: Array.from(m.dias).sort(function (a, b) { return a - b; }),
        sem: sem,
        vari: variacao(m.n, i ? meses.get(todos[i - 1]).n : null)
      };
    });

    /* Com mais de um exercício na seleção o ano entra no rótulo: no
       consolidado o eixo mostrava quatro "Janeiro" iguais e não dava para
       saber de que ano era cada coluna. */
    var multiAno = new Set(mesesOrd.map(function (m) { return m.ano; })).size > 1;
    var mesesChave = mesesOrd.map(function (m) { return m.ym; });
    C._ins = {
      dias: diasOrd, pessoas: pessoasOrd, meses: mesesOrd, mesesChave: mesesChave,
      multiAno: multiAno,
      rotulosMes: mesesOrd.map(function (m) {
        return multiAno ? MESES[m.mes - 1] + '/' + m.ym.slice(2, 4) : mesLongo(m.ym);
      }),
      rotuloDia: function (iso) {
        return iso.slice(8) + '/' + iso.slice(5, 7) + (multiAno ? '/' + iso.slice(2, 4) : '');
      },
      total: C.D.length, ultimo: ultimo,
      pico: diasOrd.reduce(function (a, d) { return !a || d.n > a.n ? d : a; }, null),
      picoMes: mesesOrd.reduce(function (a, m) { return !a || m.n > a.n ? m : a; }, null),
      semInsercao: mesesOrd.reduce(function (a, m) { return a + m.sem.length; }, 0)
    };
    return C._ins;
  }

  /* ------------------------------------------- ABA: INSERÇÕES POR PESSOA */
  function abaInsPessoa(C) {
    var I = insercoes(C);
    var top = I.pessoas[0];
    var tres = I.pessoas.slice(0, 3).reduce(function (a, p) { return a + p.n; }, 0);
    var maisDias = I.pessoas.slice().sort(function (a, b) { return b.dias - a.dias; })[0];
    var maisRitmo = I.pessoas.filter(function (p) { return p.dias >= 3; })
      .sort(function (a, b) { return b.ritmo - a.ritmo; })[0];

    tiles('kpisInsPessoa', [
      { _sec: 'Quem alimenta o formulário' },
      { rot: 'Lançamentos no período', val: G.num(I.total), ir: 'registros' },
      { rot: 'Inseridores', val: G.num(I.pessoas.length) },
      { rot: 'Lançamentos por inseridor', val: G.num(I.pessoas.length ? I.total / I.pessoas.length : 0, 1) },
      { rot: 'Dias com inserção', val: G.num(I.dias.length), ir: 'ins-dia' },
      { rot: 'Lançamentos por dia ativo', val: G.num(I.dias.length ? I.total / I.dias.length : 0, 1) },
      { rot: 'Meses com inserção', val: G.num(I.meses.length), ir: 'ins-mes' },

      { _sec: 'Destaques' },
      { rot: 'Mais lançamentos', val: top ? G.esc(top.rot) : '—', cls: 'texto',
        sub: top ? G.num(top.n) + ' lançamentos (' + G.num(top.pct, 0) + '% do período)' : '' },
      { rot: 'Mais dias ativos', val: maisDias ? G.esc(maisDias.rot) : '—', cls: 'texto',
        sub: maisDias ? G.num(maisDias.dias) + ' dias com inserção' : '' },
      { rot: 'Maior ritmo', val: maisRitmo ? G.esc(maisRitmo.rot) : '—', cls: 'texto',
        sub: maisRitmo ? G.num(maisRitmo.ritmo, 1) + ' lançamentos por dia ativo' : 'a partir de 3 dias ativos' },
      { rot: 'Concentração nos 3 maiores', val: G.num(I.total ? tres / I.total * 100 : 0, 0), un: '%',
        sub: G.num(tres) + ' dos ' + G.num(I.total) + ' lançamentos' }
    ]);

    pintarCat('gInsPessoa', I.pessoas.map(function (p) { return { rot: p.rot, val: p.n }; }).slice(0, 14));
    pintarCat('gInsPessoaRitmo', I.pessoas.slice(0, 14)
      .map(function (p) { return { rot: p.rot, val: Math.round(p.ritmo * 10) / 10 }; })
      .sort(function (a, b) { return b.val - a.val; }), { cor: 'var(--s3)' });

    // uma série por inseridor do topo: mais de cinco e a paleta se repetiria
    var ks = I.mesesChave;
    pintarSerie('gInsPessoaMes', I.rotulosMes, I.pessoas.slice(0, 5).map(function (p, i) {
      return { nome: p.rot, slot: i, valores: ks.map(function (k) { return p.mes.get(k) || null; }) };
    }));

    tabelaInsPessoa(I);
  }

  function tabelaInsPessoa(I) {
    if (!el('tInsPessoa')) return;
    if (!I.pessoas.length) return G.vazio(el('tInsPessoa'));
    el('tInsPessoa').innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>#</th><th>Inseridor</th><th>Lançamentos</th><th>Participação</th><th>Dias ativos</th>' +
      '<th>Por dia ativo</th><th>Primeiro</th><th>Último</th><th>Município que mais lançou</th>' +
      '</tr></thead><tbody>' +
      I.pessoas.map(function (p, i) {
        return '<tr><td class="num">' + (i + 1) + '</td><td class="forte">' + G.esc(p.rot) + '</td>' +
          '<td class="num">' + G.num(p.n) + '</td><td class="num">' + G.num(p.pct, 1) + '%</td>' +
          '<td class="num">' + G.num(p.dias) + '</td><td class="num">' + G.num(p.ritmo, 1) + '</td>' +
          '<td class="num">' + dataBR(p.ini) + '</td><td class="num">' + dataBR(p.fim) + '</td>' +
          '<td>' + G.esc(p.mun || '—') + '</td></tr>';
      }).join('') +
      '<tr><td></td><td class="forte">Total</td><td class="num forte">' + G.num(I.total) + '</td>' +
      '<td class="num forte">100,0%</td><td class="num forte">' + G.num(I.dias.length) + '</td>' +
      '<td class="num forte">' + G.num(I.dias.length ? I.total / I.dias.length : 0, 1) + '</td>' +
      '<td colspan="3"></td></tr></tbody></table></div>';
  }

  /* ---------------------------------------------- ABA: INSERÇÕES POR DIA */
  var buscaDia = '';

  function abaInsDia(C) {
    var I = insercoes(C);
    var ultimoDia = I.dias[I.dias.length - 1];
    var maiorSeq = sequenciaUteis(I.dias);

    tiles('kpisInsDia', [
      { _sec: 'Ritmo diário' },
      { rot: 'Lançamentos no período', val: G.num(I.total), ir: 'registros' },
      { rot: 'Dias com inserção', val: G.num(I.dias.length) },
      { rot: 'Lançamentos por dia ativo', val: G.num(I.dias.length ? I.total / I.dias.length : 0, 1) },
      { rot: 'Dias úteis sem inserção', val: G.num(I.semInsercao), ir: 'ins-mes',
        sub: 'sábados e domingos não contam' },
      { rot: 'Maior sequência de dias úteis', val: G.num(maiorSeq), sub: 'dias úteis seguidos com inserção' },
      { rot: 'Inseridores ativos', val: G.num(I.pessoas.length), ir: 'ins-pessoa' },

      { _sec: 'Destaques' },
      { rot: 'Dia de pico', val: I.pico ? dataBR(I.pico.iso) : '—', cls: 'texto',
        sub: I.pico ? G.num(I.pico.n) + ' lançamentos · ' + G.esc(I.pico.mun) : '' },
      { rot: 'Inseridor do dia de pico', val: I.pico ? G.esc(I.pico.alim) : '—', cls: 'texto',
        sub: I.pico ? G.num(I.pico.part, 0) + '% do que entrou no dia' : '' },
      { rot: 'Último lançamento', val: ultimoDia ? dataBR(ultimoDia.iso) : '—', cls: 'texto',
        sub: ultimoDia ? G.num(ultimoDia.n) + ' lançamentos no dia' : '' },
      { rot: 'Dia da semana mais forte', val: G.esc(diaSemanaTop(I).rot || '—'), cls: 'texto',
        sub: G.num(diaSemanaTop(I).val) + ' lançamentos' }
    ]);

    pintarSerie('gInsDiaSerie', I.dias.map(function (d) { return I.rotuloDia(d.iso); }),
      [{ nome: 'Lançamentos', slot: 0, valores: I.dias.map(function (d) { return d.n; }) }]);

    var semana = new Map();
    DIAS_SEMANA.forEach(function (s) { semana.set(s, 0); });
    I.dias.forEach(function (d) { semana.set(DIAS_SEMANA[d.semana], semana.get(DIAS_SEMANA[d.semana]) + d.n); });
    pintarCat('gInsDiaSemana', Array.from(semana, function (e) { return { rot: e[0], val: e[1] }; })
      .filter(function (d) { return d.val > 0; }));

    var CORTES = [
      { rot: '1 lançamento', max: 1 }, { rot: '2 a 5', max: 5 }, { rot: '6 a 10', max: 10 },
      { rot: '11 a 20', max: 20 }, { rot: 'mais de 20', max: Infinity }
    ];
    var faixa = new Map();
    CORTES.forEach(function (c) { faixa.set(c.rot, 0); });
    I.dias.forEach(function (d) {
      for (var i = 0; i < CORTES.length; i++) {
        if (d.n <= CORTES[i].max) { faixa.set(CORTES[i].rot, faixa.get(CORTES[i].rot) + 1); break; }
      }
    });
    pintarCat('gInsDiaFaixa', Array.from(faixa, function (e) { return { rot: e[0], val: e[1] }; })
      .filter(function (d) { return d.val > 0; }), { cor: 'var(--s3)' });

    tabelaInsDia(I);
  }

  /** Maior sequência de dias ÚTEIS seguidos com inserção. Um fim de semana no
      meio não quebra a sequência: ninguém lança no sábado. */
  function sequenciaUteis(dias) {
    var maior = 0, atual = 0, anterior = null;
    dias.forEach(function (d) {
      if (fimDeSemana(d.iso)) return;
      if (anterior && uteisEntre(anterior, d.iso) > 1) atual = 0;
      atual++;
      anterior = d.iso;
      if (atual > maior) maior = atual;
    });
    return maior;
  }

  /** Distância em dias úteis entre duas datas ISO (1 = são consecutivos). */
  function uteisEntre(a, b) {
    var ini = new Date(a + 'T12:00:00Z'), fim = new Date(b + 'T12:00:00Z'), n = 0;
    while (ini < fim && n < 400) {
      ini.setUTCDate(ini.getUTCDate() + 1);
      if (ini.getUTCDay() !== 0 && ini.getUTCDay() !== 6) n++;
    }
    return n;
  }

  function diaSemanaTop(I) {
    var m = new Map();
    I.dias.forEach(function (d) {
      var k = DIAS_SEMANA[d.semana];
      m.set(k, (m.get(k) || 0) + d.n);
    });
    return maisFrequente(m);
  }

  function tabelaInsDia(I) {
    if (!el('tInsDia')) return;
    var busca = buscaDia.toLowerCase();
    var linhas = I.dias.slice().reverse().filter(function (d) {
      if (!busca) return true;
      return (dataBR(d.iso) + ' ' + mesLongo(d.iso.slice(0, 7)) + ' ' + d.mun + ' ' + d.alim)
        .toLowerCase().indexOf(busca) >= 0;
    });
    if (!linhas.length) return G.vazio(el('tInsDia'), busca ? 'Nenhum dia encontrado para essa busca.' : null);
    el('tInsDia').innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>Mês</th><th>Data</th><th>Dia</th><th>Lançamentos</th><th>Variação</th>' +
      '<th>Local que mais lançou</th><th>Inseridor</th><th>Participação</th>' +
      '</tr></thead><tbody>' +
      linhas.map(function (d) {
        var pico = I.pico && d.iso === I.pico.iso;
        return '<tr' + (pico ? ' class="destaque-linha"' : '') + '>' +
          '<td>' + mesLongo(d.iso.slice(0, 7)) + '</td>' +
          '<td class="num forte">' + dataBR(d.iso) + '</td>' +
          '<td>' + DIAS_SEMANA[d.semana] + '</td>' +
          '<td class="num">' + G.num(d.n) + '</td>' +
          celVariacao(d.vari) +
          '<td>' + G.esc(d.mun || '—') + '</td>' +
          '<td>' + G.esc(d.alim || '—') + '</td>' +
          '<td class="num">' + G.num(d.part, 0) + '%</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="nota">' + G.num(linhas.length) + ' dias com inserção' +
      (busca ? ' na busca' : '') + ' · o dia de pico aparece destacado.</p>';
  }

  /* ---------------------------------------------- ABA: INSERÇÕES POR MÊS */
  function abaInsMes(C) {
    var I = insercoes(C);
    var ultimoMes = I.meses[I.meses.length - 1];
    var diasCom = I.meses.reduce(function (a, m) { return a + m.com.length; }, 0);

    tiles('kpisInsMes', [
      { _sec: 'Volume mensal' },
      { rot: 'Lançamentos no período', val: G.num(I.total), ir: 'registros' },
      { rot: 'Meses com inserção', val: G.num(I.meses.length) },
      { rot: 'Média por mês', val: G.num(I.meses.length ? I.total / I.meses.length : 0, 1) },
      { rot: 'Dias úteis com inserção', val: G.num(diasCom), ir: 'ins-dia' },
      { rot: 'Dias úteis sem inserção', val: G.num(I.semInsercao) },
      { rot: 'Inseridores ativos', val: G.num(I.pessoas.length), ir: 'ins-pessoa' },

      { _sec: 'Destaques' },
      { rot: 'Mês de pico', val: I.picoMes ? G.esc(mesLongo(I.picoMes.ym)) : '—', cls: 'texto',
        sub: I.picoMes ? G.num(I.picoMes.n) + ' lançamentos em ' + I.picoMes.ano : '' },
      { rot: 'Último mês', val: ultimoMes ? G.esc(mesLongo(ultimoMes.ym)) : '—', cls: 'texto',
        sub: ultimoMes ? G.num(ultimoMes.n) + ' lançamentos' : '' },
      { rot: 'Variação do último mês',
        val: ultimoMes && ultimoMes.vari && ultimoMes.vari.pct != null
          ? (ultimoMes.vari.pct > 0 ? '+' : '') + G.num(ultimoMes.vari.pct, 0) : '—',
        un: ultimoMes && ultimoMes.vari && ultimoMes.vari.pct != null ? '%' : '',
        cls: ultimoMes && ultimoMes.vari && ultimoMes.vari.dif < 0 ? 'acu' : 'mec',
        sub: 'sobre o mês anterior' },
      { rot: 'Média por dia com inserção', val: G.num(diasCom ? I.total / diasCom : 0, 1) }
    ]);

    pintarSerie('gInsMesSerie', I.rotulosMes,
      [{ nome: 'Lançamentos', slot: 0, valores: I.meses.map(function (m) { return m.n; }) }]);
    pintarSerie('gInsMesDias', I.rotulosMes, [
      { nome: 'Dias com inserção', slot: 0, valores: I.meses.map(function (m) { return m.com.length; }) },
      { nome: 'Dias úteis sem inserção', slot: 1, valores: I.meses.map(function (m) { return m.sem.length; }) }
    ]);

    tabelaInsMes(I);
  }

  function tabelaInsMes(I) {
    if (!el('tInsMes')) return;
    if (!I.meses.length) return G.vazio(el('tInsMes'));
    var lista = function (dias) {
      return dias.length ? dias.join(', ') : '<span class="nada">—</span>';
    };
    el('tInsMes').innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>Ano</th><th>Mês</th><th>Lançamentos</th><th>Variação</th><th>Dias com</th><th>Dias úteis sem</th>' +
      '<th>Dias com inserção</th><th>Dias úteis sem inserção</th>' +
      '</tr></thead><tbody>' +
      I.meses.map(function (m) {
        return '<tr><td class="num">' + m.ano + '</td><td class="forte">' + mesLongo(m.ym) + '</td>' +
          '<td class="num">' + G.num(m.n) + '</td>' + celVariacao(m.vari) +
          '<td class="num">' + G.num(m.com.length) + '</td>' +
          '<td class="num">' + G.num(m.sem.length) + '</td>' +
          '<td class="miudo">' + lista(m.com) + '</td>' +
          '<td class="miudo">' + lista(m.sem) + '</td></tr>';
      }).join('') +
      '<tr><td></td><td class="forte">Total</td><td class="num forte">' + G.num(I.total) + '</td><td></td>' +
      '<td class="num forte">' + G.num(I.meses.reduce(function (a, m) { return a + m.com.length; }, 0)) + '</td>' +
      '<td class="num forte">' + G.num(I.semInsercao) + '</td><td colspan="2"></td></tr>' +
      '</tbody></table></div>';
  }

  /* --------------------------------------------------- ABA: CULTURAS ---- */
  function abaInsCultura(C) {
    var lista = ranking(C.areaCult);
    var haMed = lista.length ? C.haCult / lista.length : 0;
    var semArea = C.nCult - C.D.reduce(function (a, r) {
      return a + r.cult.filter(function (c) { return c[1] > 0; }).length;
    }, 0);

    tiles('kpisInsCult', [
      { _sec: 'Culturas declaradas' },
      { rot: 'Culturas diferentes', val: G.num(lista.length), cls: 'mec' },
      { rot: 'Hectares declarados', val: G.num(C.haCult, 1), un: 'ha', cls: 'mec',
        sub: G.num(C.nCult) + ' declarações' },
      { rot: 'Hectares mecanizados', val: G.num(C.ha, 1), un: 'ha', cls: 'mec', ir: 'mecanizacao',
        sub: 'campo Total mecanizado' },
      { rot: 'Média por cultura', val: G.num(haMed, 1), un: 'ha' },
      { rot: 'Lançamentos com cultura', val: G.num(C.nComCult), ir: 'registros',
        sub: G.num(C.D.length ? C.nComCult / C.D.length * 100 : 0, 0) + '% dos lançamentos' },
      { rot: 'Declarações sem área', val: G.num(semArea) },

      { _sec: 'Destaques' },
      { rot: 'Maior área', val: C.topCult ? G.esc(C.topCult.rot) : '—', cls: 'mec texto', ir: 'cultura',
        sub: C.topCult ? G.num(C.topCult.val, 1) + ' ha (' +
          G.num(C.haCult ? C.topCult.val / C.haCult * 100 : 0, 0) + '% do total)' : '' },
      { rot: 'Mais declarada', val: C.topCultQtd ? G.esc(C.topCultQtd.rot) : '—', cls: 'mec texto', ir: 'cultura',
        sub: C.topCultQtd ? G.num(C.topCultQtd.val) + ' declarações' : '' },
      { rot: 'Sistema de cultivo mais comum', val: C.topSis ? G.esc(C.topSis.rot) : '—', cls: 'texto',
        sub: C.topSis ? G.num(C.topSis.val) + ' declarações' : '' },
      { rot: 'Concentração nas 3 maiores',
        val: G.num(C.haCult ? lista.slice(0, 3).reduce(function (a, d) { return a + d.val; }, 0) / C.haCult * 100 : 0, 0),
        un: '%' }
    ]);

    pintarCat('gInsCultHa', lista.slice(0, 16));
    pintarCat('gInsCultQtd', ranking(C.qtdCult, 16), { cor: 'var(--s3)' });
    tabelaInsCultura(lista, C);
  }

  function tabelaInsCultura(lista, C) {
    if (!el('tInsCult')) return;
    if (!lista.length) return G.vazio(el('tInsCult'));
    var acum = 0;
    el('tInsCult').innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>#</th><th>Cultura</th><th>Total de hectares</th><th>Participação</th><th>Acumulado</th>' +
      '<th>Declarações</th><th>Média por declaração</th>' +
      '</tr></thead><tbody>' +
      lista.map(function (d, i) {
        var pct = C.haCult ? d.val / C.haCult * 100 : 0;
        var qtd = C.qtdCult.get(d.rot) || 0;
        acum += pct;
        return '<tr><td class="num">' + (i + 1) + '</td><td class="forte">' + G.esc(d.rot) + '</td>' +
          '<td class="num">' + G.num(d.val, 2) + '</td><td class="num">' + G.num(pct, 1) + '%</td>' +
          '<td class="num">' + G.num(acum, 1) + '%</td><td class="num">' + G.num(qtd) + '</td>' +
          '<td class="num">' + G.num(qtd ? d.val / qtd : 0, 1) + '</td></tr>';
      }).join('') +
      '<tr><td></td><td class="forte">Total</td><td class="num forte">' + G.num(C.haCult, 2) + '</td>' +
      '<td class="num forte">100,0%</td><td></td><td class="num forte">' + G.num(C.nCult) + '</td>' +
      '<td class="num forte">' + G.num(C.nCult ? C.haCult / C.nCult : 0, 1) + '</td></tr>' +
      '</tbody></table></div>' +
      /* A planilha soma numa linha "Não informado" as declarações sem cultura
         escrita; aqui elas não viram categoria, então o total fica abaixo do
         da aba "culturas" exatamente nesse tanto. Dizer isso evita a conclusão
         de que um dos dois está errado. */
      '<p class="nota">As declarações sem cultura informada não entram nesta soma. ' +
      'Na planilha <em>culturas</em> elas aparecem como uma linha "Não informado", ' +
      'e é só nisso que os dois totais diferem.</p>';
  }

  /* ============================================ ABA: ATUALIZAR DADOS (admin) */
  function abaAdmin() {
    fonteDados();
  }

  /* --------------------------------------------------- despachante das abas */
  var ABAS = {
    geral: abaGeral, mecanizacao: abaMecanizacao, acudagem: abaAcudagem,
    cultura: abaCultura, municipio: abaMunicipio, mapa: abaMapa, escritorio: abaEscritorio,
    beneficiario: abaBeneficiario, registros: abaRegistros,
    relatorio: abaRelatorio, admin: abaAdmin,
    // só aparecem com a senha (ver aplicarAdmin)
    'ins-pessoa': abaInsPessoa, 'ins-dia': abaInsDia, 'ins-mes': abaInsMes,
    'ins-cultura': abaInsCultura
  };

  /** Desenha a aba visível. As demais só quando forem abertas. */
  function render() {
    if (!TODOS.length) return;
    rotularSeries();
    var C = contexto();
    linhaResumo(C);
    var f = ABAS[abaAtiva];
    if (!f) return;
    f(C);
    SUJAS[abaAtiva] = false;
  }

  /* ------------------------------------------------------------------ tabela */
  var pag = 1, POR_PAG = 25;

  /* Ordenação da listagem. O padrão é a inserção mais recente primeiro: é onde
     se confere um caso concreto, e o caso concreto quase sempre é recente —
     abrindo pelo mais antigo, o que interessa caía na última página. */
  var ORD = { col: 'd', dir: -1 };
  var CHAVE_ORD = {
    d:    function (r) { return r.d; },
    dv:   function (r) { return r.dv || ''; },
    pc:   function (r) { return r.pc || ''; },
    prod: function (r) { return r.prod || ''; },
    mun:  function (r) { return r.mun || ''; },
    ha:   function (r) { return r.ha; },
    hrs:  function (r) { return r.hrs; },
    ac:   function (r) { return r.ac; },
    dae:  function (r) { return r.dae; }
  };
  // datas são ISO: comparação direta já ordena e é mais rápida que localeCompare
  var ORD_TEXTO = { pc: 1, prod: 1, mun: 1 };

  function ordenar(L) {
    var f = CHAVE_ORD[ORD.col];
    if (!f) return L;
    var texto = !!ORD_TEXTO[ORD.col];
    return L.slice().sort(function (a, b) {
      var x = f(a), y = f(b);
      var c = texto ? String(x).localeCompare(String(y), 'pt-BR')
        : (x < y ? -1 : x > y ? 1 : 0);
      return c * ORD.dir;
    });
  }

  /** Marca no cabeçalho qual coluna manda, para o olho e para o leitor de tela. */
  function pintarCabecalhoOrdem() {
    document.querySelectorAll('table.dados.registros th[data-ord]').forEach(function (th) {
      var atual = th.getAttribute('data-ord') === ORD.col;
      th.classList.toggle('ord', atual);
      th.classList.toggle('ord-desc', atual && ORD.dir < 0);
      if (atual) th.setAttribute('aria-sort', ORD.dir < 0 ? 'descending' : 'ascending');
      else th.removeAttribute('aria-sort');
    });
  }

  function ligarOrdenacao() {
    var tabelaEl = document.querySelector('table.dados.registros thead');
    if (!tabelaEl) return;
    var trocar = function (th) {
      var col = th.getAttribute('data-ord');
      if (!col) return;
      // mesma coluna inverte; coluna nova começa decrescente nos números e nas
      // datas (o interessante é o maior/mais recente) e crescente nos textos
      if (ORD.col === col) ORD.dir = -ORD.dir;
      else { ORD.col = col; ORD.dir = ORD_TEXTO[col] ? 1 : -1; }
      pag = 1;
      pintarCabecalhoOrdem();
      tabela(contexto().D);
    };
    tabelaEl.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-ord]');
      if (th) trocar(th);
    });
    tabelaEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var th = e.target.closest('th[data-ord]');
      if (!th) return;
      e.preventDefault();
      trocar(th);
    });
  }

  function tabela(D) {
    // chaveBusca (e não toLowerCase): a busca do produtor já ignorava acentos e
    // esta não — "joao" achava 2 registros aqui e 17 na outra tela
    var q = chaveBusca(el('busca').value.trim());
    var L = !q ? D : D.filter(function (r) {
      return chaveBusca(r.prod + ' ' + r.mun + ' ' + r.esc + ' ' + r.propr + ' ' + r.rt + ' ' +
        r.loc + ' ' + r.obs + ' ' + r.cult.map(function (c) { return c[0]; }).join(' ')).indexOf(q) >= 0;
    });
    L = ordenar(L);
    if ((pag - 1) * POR_PAG >= L.length) pag = 1;
    var pagina = L.slice((pag - 1) * POR_PAG, (pag - 1) * POR_PAG + POR_PAG);
    var nada = '<span class="nada">—</span>';

    el('tCorpo').innerHTML = pagina.length ? pagina.map(function (r) {
      var cult = r.cult.length
        ? r.cult.map(function (c) { return G.esc(c[0]) + ' <small>(' + G.num(c[1], 1) + ' ha)</small>'; }).join('<br>')
        : nada;
      // marca a vistoria que o painel não pôde usar (data impossível): nesses
      // casos o registro entra pelo ano do lançamento
      var vistoriaSuspeita = !vistoriaValida(r);
      return '<tr>' +
        '<td class="num">' + dataBR(r.d) + '</td>' +
        '<td class="num' + (vistoriaSuspeita ? ' alerta' : '') + '" ' +
        (vistoriaSuspeita ? 'title="Data de vistoria fora do intervalo possível — este registro entrou pela data de lançamento"' : '') + '>' +
        dataBR(r.dv) + '</td>' +
        '<td><span class="tag ' + tagServico(r.pc) + '">' + G.esc(r.pc) + '</span></td>' +
        '<td class="forte">' + G.esc(r.prod || '—') + '<br><small class="fraco">' + G.esc(r.propr) + '</small></td>' +
        '<td>' + G.esc(r.mun) + '<br><small class="fraco">' + G.esc(r.esc) + '</small></td>' +
        '<td>' + cult + '</td>' +
        '<td class="num">' + (r.ha ? G.num(r.ha, 1) : nada) + '</td>' +
        '<td class="num">' + (r.hrs ? G.num(r.hrs, 1) : nada) + '</td>' +
        '<td class="num">' + (r.ac ? G.num(r.ac) : nada) + '</td>' +
        '<td>' + (r.maq.length ? G.esc(r.maq.join(', ')) : nada) + '<br><small class="fraco">' +
        (r.impl.length ? G.esc(r.impl.join(', ')) : '') + '</small></td>' +
        '<td class="num">' + (r.dae ? moeda(r.dae) : nada) + '</td>' +
        '<td>' + (r.form ? '<a href="' + G.esc(r.form) + '" target="_blank" rel="noopener">abrir</a>' : nada) + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="12" class="vazio">Nenhum registro encontrado.</td></tr>';

    var paginas = Math.max(1, Math.ceil(L.length / POR_PAG));
    el('pagInfo').textContent = L.length ? 'Página ' + pag + ' de ' + paginas + ' — ' + G.num(L.length) + ' registro(s)' : '';
    el('pagAnt').disabled = pag <= 1;
    el('pagProx').disabled = pag >= paginas;
  }

  /* ============================================================ ABA RELATÓRIO */
  function kpiRel(rot, val, sub) {
    return '<div class="relatorio-kpi"><div class="kpi-rot">' + G.esc(rot) +
      '</div><div class="kpi-val">' + val +
      '</div><div class="kpi-sub">' + G.esc(sub) + '</div></div>';
  }

  /* a lista é a visão padrão do relatório; a grade fica a um clique.
     Como nos tipos de gráfico, a troca vale só para a visita atual. */
  var visRelatorio = 'lista';

  function aplicarVisRelatorio() {
    var grid = el('relatorioGrid');
    if (grid) grid.classList.toggle('lista', visRelatorio === 'lista');
    var vis = el('relatorioVis');
    if (vis) vis.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('ativa', b.getAttribute('data-vis') === visRelatorio);
    });
  }

  /** Esconde os cartões que não casam com a busca de município. */
  function aplicarBuscaRelatorio() {
    var campo = el('relatorBusca'), grid = el('relatorioGrid');
    if (!campo || !grid) return;
    var q = chaveBusca(campo.value.trim());
    grid.querySelectorAll('.mun-card').forEach(function (card) {
      var casa = !q || chaveBusca(card.getAttribute('data-mun')).indexOf(q) >= 0;
      card.style.display = casa ? '' : 'none';
    });
  }

  function renderRelatorio(D) {
    var grid = el('relatorioGrid');
    if (!grid) return;
    aplicarVisRelatorio();
    // sem "Não informado": não existe relatório de um município que não existe,
    // e o contador "Municípios com registro" desta aba já o descarta
    var muns = Array.from(new Set(D.map(function (r) { return r.mun; })))
      .filter(function (m) { return m && m !== NI; })
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });

    if (!muns.length) {
      grid.innerHTML = '<p class="vazio">Nenhum município na seleção atual.</p>';
      return;
    }

    grid.innerHTML = muns.map(function (mun) {
      var sub = D.filter(function (r) { return r.mun === mun; });
      var mec = sub.filter(function (r) { return r.pc === MEC; });
      var acu = sub.filter(function (r) { return r.pc === ACU; });
      var ha = soma(mec, function (r) { return r.ha; });
      var hrs = soma(acu, function (r) { return r.hrs; });
      var nAc = soma(acu, function (r) { return r.ac; });
      return '<button class="mun-card" data-mun="' + G.esc(mun) + '" type="button">' +
        '<div class="mun-card-nome">' + G.esc(mun) + '</div>' +
        '<div class="mun-card-tags">' +
        (mec.length ? '<span class="tag tag-mec">Mecaniza&ccedil;&atilde;o</span>' : '') +
        (acu.length ? '<span class="tag tag-acu">A&ccedil;udagem</span>' : '') +
        '</div>' +
        '<div class="mun-card-stats">' +
        '<span>' + G.num(sub.length) + ' atend.</span>' +
        (ha ? '<span>' + G.num(ha, 1) + ' ha</span>' : '') +
        (hrs ? '<span>' + G.num(hrs, 1) + ' h m&aacute;q.</span>' : '') +
        (nAc ? '<span>' + G.num(nAc) + ' tanques</span>' : '') +
        '</div></button>';
    }).join('');

    grid.querySelectorAll('.mun-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        abrirRelatorioMunicipio(btn.getAttribute('data-mun'), filtrar());
      });
    });

    // mantém o texto já digitado na busca ao redesenhar (chaveBusca: "acrelandia"
    // precisa achar "Acrelândia", como nas outras buscas do painel)
    aplicarBuscaRelatorio();
  }

  function abrirRelatorioMunicipio(mun, D) {
    var sub = D.filter(function (r) { return r.mun === mun; });
    if (!sub.length) return;

    var mec = sub.filter(function (r) { return r.pc === MEC; });
    var acu = sub.filter(function (r) { return r.pc === ACU; });
    var ha = soma(mec, function (r) { return r.ha; });
    var hrs = soma(acu, function (r) { return r.hrs; });
    var nAc = soma(acu, function (r) { return r.ac; });
    var nProd = nProdutores(sub);
    var dae = soma(sub, function (r) { return r.dae; });

    var areaCult = new Map();
    mec.forEach(function (r) {
      r.cult.forEach(function (c) { areaCult.set(c[0], (areaCult.get(c[0]) || 0) + c[1]); });
    });
    var rkCult = ranking(areaCult, 30);

    var tecMap = new Map();
    sub.forEach(function (r) {
      if (!r.rt) return;
      if (!tecMap.has(r.rt)) tecMap.set(r.rt, { n: 0, esc: r.esc });
      tecMap.get(r.rt).n++;
    });
    var rkTec = Array.from(tecMap, function (e) { return { rot: e[0], val: e[1].n, esc: e[1].esc }; })
      .sort(function (a, b) { return b.val - a.val; });

    var rkMaq = ranking(contar(mec, function (r) { return r.maq; }), 10);
    var rkImpl = ranking(contar(mec, function (r) { return r.impl; }), 10);

    var hoje = new Date().toLocaleDateString('pt-BR');

    function tTbl(headers, rows) {
      return '<div class="tabela-scroll relatorio-tbl"><table class="dados"><thead><tr>' +
        headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    var htmlMec = '';
    if (mec.length) {
      var mesesMec = chavesTempo(mec);
      var haMap = somarPor(mec, chaveTempo, function (r) { return r.ha; });
      var cntMecMap = somarPor(mec, chaveTempo, function () { return 1; });
      htmlMec = '<div class="relatorio-sec">' +
        '<h2 class="relatorio-sec-tit mec">Mecaniza&ccedil;&atilde;o</h2>' +
        '<div class="ficha">' +
        '<div class="ficha-item"><div class="ficha-rot">Vistorias</div><div class="ficha-val">' + G.num(mec.length) + '</div></div>' +
        '<div class="ficha-item"><div class="ficha-rot">Hectares</div><div class="ficha-val">' + G.num(ha, 1) + ' ha</div></div>' +
        '<div class="ficha-item"><div class="ficha-rot">M&eacute;dia/atend.</div><div class="ficha-val">' + G.num(mec.length ? ha / mec.length : 0, 1) + ' ha</div></div>' +
        '</div>' +
        (rkCult.length ? '<h3>Culturas</h3>' + tTbl(['Cultura', 'Hectares', '%'],
          rkCult.map(function (d) {
            return '<tr><td>' + G.esc(d.rot) + '</td><td class="num">' + G.num(d.val, 1) +
              '</td><td class="num">' + (ha ? (d.val / ha * 100).toFixed(1).replace('.', ',') : '0') + '%</td></tr>';
          }).join('')) : '') +
        (rkMaq.length ? '<h3>M&aacute;quinas utilizadas</h3>' + tTbl(['Equipamento', 'Ocorr&ecirc;ncias'],
          rkMaq.map(function (d) { return '<tr><td>' + G.esc(d.rot) + '</td><td class="num">' + G.num(d.val) + '</td></tr>'; }).join('')) : '') +
        (rkImpl.length ? '<h3>Implementos e servi&ccedil;os</h3>' + tTbl(['Implemento / Servi&ccedil;o', 'Ocorr&ecirc;ncias'],
          rkImpl.map(function (d) { return '<tr><td>' + G.esc(d.rot) + '</td><td class="num">' + G.num(d.val) + '</td></tr>'; }).join('')) : '') +
        (mesesMec.length ? '<h3>Por ' + tituloTempo() + '</h3>' + tTbl([colunaTempo(), 'Atendimentos', 'Hectares'],
          mesesMec.map(function (k) {
            return '<tr><td class="forte">' + rotTempo(k) + '</td>' +
              '<td class="num">' + G.num(cntMecMap.get(k) || 0) + '</td>' +
              '<td class="num">' + G.num(haMap.get(k) || 0, 1) + '</td></tr>';
          }).join('')) : '') +
        '</div>';
    }

    var htmlAcu = '';
    if (acu.length) {
      var mesesAcu = chavesTempo(acu);
      var hrsMap = somarPor(acu, chaveTempo, function (r) { return r.hrs; });
      var acMap  = somarPor(acu, chaveTempo, function (r) { return r.ac; });
      var cntAcuMap = somarPor(acu, chaveTempo, function () { return 1; });
      // mesma regra do contador "Horas por tanque" do painel: só vistorias que
      // têm hora E tanque. Dividir hrs/nAc direto contava horas de vistorias
      // sem tanque no numerador e não no denominador, inflando a média
      var acuProdM = acu.filter(function (r) { return r.hrs > 0 && r.ac > 0; });
      var acProdM = soma(acuProdM, function (r) { return r.ac; });
      var hTanque = acProdM ? soma(acuProdM, function (r) { return r.hrs; }) / acProdM : 0;
      htmlAcu = '<div class="relatorio-sec">' +
        '<h2 class="relatorio-sec-tit acu">A&ccedil;udagem</h2>' +
        '<div class="ficha">' +
        '<div class="ficha-item"><div class="ficha-rot">Vistorias</div><div class="ficha-val">' + G.num(acu.length) + '</div></div>' +
        '<div class="ficha-item"><div class="ficha-rot">Horas m&aacute;quina</div><div class="ficha-val">' + G.num(hrs, 1) + ' h</div></div>' +
        '<div class="ficha-item"><div class="ficha-rot">Tanques / a&ccedil;udes</div><div class="ficha-val">' + G.num(nAc) + '</div></div>' +
        '<div class="ficha-item"><div class="ficha-rot">Horas/tanque</div><div class="ficha-val">' + (hTanque ? G.num(hTanque, 1) + ' h' : '—') + '</div></div>' +
        '</div>' +
        (mesesAcu.length ? '<h3>Por ' + tituloTempo() + '</h3>' + tTbl([colunaTempo(), 'Atendimentos', 'Horas', 'Tanques'],
          mesesAcu.map(function (k) {
            return '<tr><td class="forte">' + rotTempo(k) + '</td>' +
              '<td class="num">' + G.num(cntAcuMap.get(k) || 0) + '</td>' +
              '<td class="num">' + G.num(hrsMap.get(k) || 0, 1) + '</td>' +
              '<td class="num">' + G.num(acMap.get(k) || 0) + '</td></tr>';
          }).join('')) : '') +
        '</div>';
    }

    var html = '<div class="relatorio-doc">' +
      '<div class="relatorio-header">' +
      '<div class="relatorio-header-org">Secretaria de Estado de Agricultura &ndash; SEAGRI/AC</div>' +
      '<div class="relatorio-header-sub">Relat&oacute;rio de Mecaniza&ccedil;&atilde;o e A&ccedil;udagem &middot; ' + G.esc(rotuloAno()) + '</div>' +
      '</div>' +
      '<h1 class="relatorio-mun-titulo">' + G.esc(mun) + '</h1>' +
      '<div class="relatorio-kpis">' +
      kpiRel('Atendimentos', G.num(sub.length), 'vistorias registradas') +
      (mec.length ? kpiRel('Mecanização', G.num(mec.length), G.num(ha, 1) + ' ha mecanizados') : '') +
      (acu.length ? kpiRel('Açudagem', G.num(acu.length), G.num(hrs, 1) + ' h de máquina') : '') +
      (ha ? kpiRel('Hectares', G.num(ha, 1) + ' ha', 'total mecanizado') : '') +
      (hrs ? kpiRel('Horas', G.num(hrs, 1) + ' h', 'de escavadeira') : '') +
      (nAc ? kpiRel('Tanques', G.num(nAc), 'construídos ou reformados') : '') +
      kpiRel('Produtores', G.num(nProd), 'nomes distintos atendidos') +
      (dae ? kpiRel('DAE', moeda(dae), 'arrecadada') : '') +
      '</div>' +
      '<div class="relatorio-secoes">' + htmlMec + htmlAcu + '</div>' +
      (rkTec.length ? '<h2 class="relatorio-sec-tit">Responsáveis Técnicos</h2>' +
        tTbl(['Técnico', 'Escritório Local', 'Vistorias'],
          rkTec.map(function (d) {
            return '<tr><td class="forte">' + G.esc(d.rot) + '</td><td>' + G.esc(d.esc || '—') +
              '</td><td class="num">' + G.num(d.val) + '</td></tr>';
          }).join('')) : '') +
      '<h2 class="relatorio-sec-tit">Registros Detalhados</h2>' +
      '<div class="relatorio-registros"><table class="dados" style="min-width:720px"><thead><tr>' +
      '<th>Inser&ccedil;&atilde;o</th><th>Vistoria</th><th>Servi&ccedil;o</th>' +
      '<th>Produtor / Propriedade</th><th>Culturas</th>' +
      '<th>&Aacute;rea (ha)</th><th>Horas</th><th>Tanques</th><th>T&eacute;cnico</th>' +
      '</tr></thead><tbody>' +
      sub.map(function (r) {
        return '<tr>' +
          '<td class="num">' + dataBR(r.d) + '</td>' +
          '<td class="num">' + dataBR(r.dv) + '</td>' +
          '<td><span class="tag ' + tagServico(r.pc) + '">' + G.esc(r.pc) + '</span></td>' +
          '<td class="forte">' + G.esc(r.prod || '—') + '<br><small class="fraco">' + G.esc(r.propr || '') + '</small></td>' +
          '<td>' + (r.cult.length ? r.cult.map(function (c) { return G.esc(c[0]) + ' (' + G.num(c[1], 1) + ' ha)'; }).join(', ') : '—') + '</td>' +
          '<td class="num">' + (r.ha ? G.num(r.ha, 1) : '—') + '</td>' +
          '<td class="num">' + (r.hrs ? G.num(r.hrs, 1) : '—') + '</td>' +
          '<td class="num">' + (r.ac ? G.num(r.ac) : '—') + '</td>' +
          '<td>' + G.esc(r.rt || '—') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="relatorio-footer">Gerado em ' + hoje + ' &middot; SEAGRI &ndash; Secretaria de Estado de Agricultura do Acre</div>' +
      '</div>';

    el('relatorioConteudo').innerHTML = html;
    el('relatorioTitulo').textContent = mun;
    el('relatorioOverlay').classList.add('show');
  }

  /* Gera um documento próprio em vez de imprimir a página: sem overlay, sem
     scroll interno e com quebras de página controladas, para o conteúdo das
     tabelas longas nunca ser cortado no PDF. */
  var CSS_PDF =
    '@page{size:A4;margin:14mm 12mm}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;font:12px/1.45 "Segoe UI",system-ui,Arial,sans-serif;color:#1b2430;background:#fff}' +
    '.relatorio-doc{max-width:100%}' +
    '.relatorio-header{border-bottom:2px solid #2e7d4f;padding-bottom:8px;margin-bottom:14px}' +
    '.relatorio-header-org{font-size:14px;font-weight:700;color:#2e7d4f;letter-spacing:.3px}' +
    '.relatorio-header-sub{font-size:11px;color:#5a6672;margin-top:2px}' +
    '.relatorio-mun-titulo{font-size:24px;margin:0 0 14px;color:#1b2430}' +
    '.relatorio-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}' +
    '.relatorio-kpi{border:1px solid #d8dee5;border-radius:7px;padding:8px 10px;background:#f7f9fa}' +
    '.kpi-rot{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7885}' +
    '.kpi-val{font-size:16px;font-weight:700;margin:2px 0 1px}' +
    '.kpi-sub{font-size:9px;color:#6b7885}' +
    '.relatorio-secoes{display:block}' +
    '.relatorio-sec{margin-bottom:16px}' +
    '.relatorio-sec-tit{font-size:15px;margin:18px 0 8px;padding-bottom:4px;border-bottom:1.5px solid #d8dee5;' +
      'break-after:avoid;page-break-after:avoid}' +
    '.relatorio-sec-tit.mec{color:#2e7d4f;border-color:#2e7d4f}' +
    '.relatorio-sec-tit.acu{color:#1f6f9c;border-color:#1f6f9c}' +
    'h3{font-size:12px;margin:12px 0 5px;color:#3a4652;break-after:avoid;page-break-after:avoid}' +
    '.ficha{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px}' +
    '.ficha-item{border:1px solid #d8dee5;border-radius:6px;padding:6px 8px;background:#f7f9fa}' +
    '.ficha-rot{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7885}' +
    '.ficha-val{font-size:12px;font-weight:600;margin-top:2px}' +
    '.tabela-scroll,.relatorio-tbl,.relatorio-registros{overflow:visible!important;max-height:none!important}' +
    'table{width:100%!important;min-width:0!important;border-collapse:collapse;font-size:10px;margin-bottom:10px}' +
    'thead{display:table-header-group}' +
    'tr{break-inside:avoid;page-break-inside:avoid}' +
    'th{text-align:left;background:#eef2f4;border-bottom:1.5px solid #c9d2da;padding:5px 6px;' +
      'font-size:9px;text-transform:uppercase;letter-spacing:.3px;color:#4a5561}' +
    'td{border-bottom:1px solid #e5eaee;padding:4px 6px;vertical-align:top}' +
    'td.num{text-align:right;white-space:nowrap}' +
    'td.forte{font-weight:600}' +
    '.fraco,small.fraco{color:#7b8792;font-size:9px}' +
    '.tag{display:inline-block;padding:1px 6px;border-radius:20px;font-size:8.5px;font-weight:700;' +
      'border:1px solid #c9d2da;white-space:nowrap}' +
    '.tag-mec{color:#2e7d4f;border-color:#2e7d4f;background:#eaf5ee}' +
    '.tag-acu{color:#1f6f9c;border-color:#1f6f9c;background:#e9f2f8}' +
    '.tag-ni{color:#6b7885;border-color:#c9d2da;background:#f1f4f6}' +
    'a{color:inherit;text-decoration:none}' +
    '.relatorio-footer{margin-top:18px;padding-top:8px;border-top:1px solid #d8dee5;' +
      'font-size:9px;color:#6b7885;text-align:center}';

  function exportarRelatorioPdf(titulo, corpo) {
    var w = window.open('', '_blank');
    if (!w) {
      alert('O navegador bloqueou a janela de exportação. Libere os pop-ups para este site e tente de novo.');
      return;
    }
    w.document.open();
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<title>Relatório — ' + G.esc(titulo) + '</title><style>' + CSS_PDF + '</style></head><body>' +
      corpo + '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 350);
  }

  /* ------------------------------------------------------- nota de qualidade */
  function nota() {
    var q = META.qualidade || {}, qh = META_HIST.qualidade || {};
    var somar = function (campo) { return (q[campo] || 0) + (qh[campo] || 0); };
    var semVistoria = TODOS.filter(function (r) { return !vistoriaValida(r); }).length;
    var outroAno = TODOS.filter(function (r) {
      return vistoriaValida(r) && r.dv.slice(0, 4) !== r.d.slice(0, 4);
    }).length;
    var anosHist = (META_HIST.anos || []).join(', ');
    if (!el('nota')) return;
    el('nota').innerHTML =
      '<b>Sobre os dados.</b> Fonte: <code>' + G.esc(META.arquivo || 'planilha de mecanização') +
      '</code>, aba <code>' + G.esc(META.aba || 'dados') + '</code> — ' + G.num(N_CORRENTE) +
      ' registros do ano corrente, importados em ' + G.esc(META.gerado_em || '—') + '.' +
      (anosHist ? ' Os exercícios encerrados (' + G.esc(anosHist) + ') vêm da aba <code>' +
        G.esc(META_HIST.aba || 'geral') + '</code> da mesma planilha — ' + G.num(META_HIST.registros || 0) +
        ' registros que não mudam mais.' : '') +
      ' <b>O exercício é o da planilha em que a linha foi lançada</b> — é o que faz cada' +
      ' período do painel bater com o SOMA do Excel.' +
      '<ul>' +
      '<li>' + G.num(outroAno) + ' registros têm vistoria confiável de um ano e lançamento de outro: ' +
      'contam no exercício do <em>lançamento</em>, e o mês continua sendo o da vistoria;</li>' +
      '<li>' + G.num(semVistoria) + ' registros têm <em>Data da Vistoria</em> impossível ' +
      '(ano digitado errado ou data futura) e entraram pela data de lançamento — ' +
      'aparecem destacados na coluna Vistoria da listagem;</li>' +
      '<li>os produtores distintos são contados pelo <em>nome</em> normalizado: ' +
      'nenhum documento pessoal é lido da planilha nem publicado nos dados do painel;</li>' +
      '<li>' + G.num(somar('sem_geo')) + ' registros sem coordenada geográfica utilizável, por isso não há mapa;</li>' +
      '<li>' + G.num(somar('sem_formulario')) + ' registros sem link do formulário digitalizado.</li>' +
      '</ul>' +
      'Nos exercícios de 2024 e 2025 a planilha não registrou a área da primeira cultura; ' +
      'nesses casos ela recebe o <em>Total mecanizado</em> do atendimento, que é como 2023 e 2026 se comportam ' +
      'quando há uma única cultura declarada. ' +
      'Campos livres (nome do trator, tipo de implemento) foram padronizados por palavra-chave, ' +
      'e um mesmo atendimento pode contar em mais de uma categoria de máquina ou implemento.';
  }

  /* --------------------------------------------------------- estado na URL */
  /* A seleção inteira — aba e filtros — vai para o endereço. Assim uma visão
     do painel pode ser mandada por link e sobrevive ao F5; antes só a aba ia
     para o hash e recarregar voltava sempre ao ano corrente, sem filtro. */
  /* Todos são listas, separadas por vírgula no endereço. Lista vazia é "todos"
     e simplesmente não vai para a URL — só o período, que tem o consolidado
     como estado explícito. */
  var CAMPOS_URL = ['ano', 'mes', 'pc', 'reg', 'mun', 'esc', 'cult', 'tec'];

  function estadoParaHash() {
    var p = [];
    // o consolidado é lista vazia; sem marcá-lo o link cairia no ano corrente
    p.push('ano=' + encodeURIComponent(F.ano.length ? F.ano.join(',') : CONSOLIDADO));
    CAMPOS_URL.forEach(function (k) {
      if (k === 'ano') return;
      if (F[k].length) p.push(k + '=' + encodeURIComponent(F[k].join(',')));
    });
    return '#' + abaAtiva + '?' + p.join('&');
  }

  function gravarUrl(novaEntrada) {
    atualizarVoltar();
    var h = estadoParaHash();
    if (location.hash === h) return;
    try {
      if (novaEntrada) history.pushState(null, '', h);
      else history.replaceState(null, '', h);
    } catch (e) { location.hash = h; }   // file:// em navegador antigo
  }

  /** O "voltar" leva às seções DO EXERCÍCIO ABERTO, não a uma lista solta:
      quem trocou de ano dentro do painel espera voltar para o ano que está
      vendo. Vários anos marcados não cabem numa página só de seções, então aí
      o caminho é a escolha de exercício. */
  function atualizarVoltar() {
    var a = el('voltarSecoes');
    if (!a) return;
    if (F.ano.length > 1) {
      a.href = 'mecanizacao.html';
      return;
    }
    a.href = 'mecanizacao-secoes.html?ano=' +
      encodeURIComponent(F.ano.length ? F.ano[0] : CONSOLIDADO);
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

  function abaValida(nome) {
    return botoes.some(function (b) { return b.getAttribute('data-aba') === nome && !b.hidden; });
  }

  /* Anos pedidos na URL que ainda não existem na base. Os exercícios encerrados
     vêm de dados-mecanizacao-historico.js, carregado depois do primeiro
     desenho: quando a URL é lida, ANOS só tem o ano corrente, e um link para
     #geral?ano=2025 caía calado em 2026 — o painel abria no ano errado sem
     nenhum sinal. Guardamos o pedido e o aplicamos quando o histórico chegar. */
  var anoPendenteUrl = [];

  function listaDaUrl(v) {
    return String(v || '').split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s; });
  }

  /** Aplica um estado vindo da URL: carregamento inicial ou botão Voltar. */
  function aplicarEstado(est) {
    var pedido = est.filtros.ano;
    var anos;
    if (pedido === CONSOLIDADO) {
      anos = [];                       // consolidado explícito
      anoPendenteUrl = [];
    } else if (!pedido) {
      anos = anosIniciais();           // sem pedido: abre no ano corrente
      anoPendenteUrl = [];
    } else {
      var pedidos = listaDaUrl(pedido);
      var validos = pedidos.filter(function (a) { return ANOS.indexOf(a) >= 0; });
      // guarda o pedido INTEIRO, não só o que falta: reaplicá-lo de uma vez
      // quando o histórico chegar evita um passo com metade dos anos marcados
      anoPendenteUrl = validos.length < pedidos.length ? pedidos : [];
      anos = validos.length ? validos : anosIniciais();
    }
    F = { ano: anos, mes: [], pc: [], reg: [], mun: [], esc: [], cult: [], tec: [] };
    CAMPOS_URL.forEach(function (k) {
      if (k === 'ano' || !est.filtros[k]) return;
      F[k] = listaDaUrl(est.filtros[k]);
    });
    pag = 1;
    popularFiltros();
    sincronizarAno();
    invalidar();
    abrirAba(abaValida(est.aba) ? est.aba : 'geral', { semUrl: true });
  }

  /* -------------------------------------------------------------------- abas */
  var botoes = [];
  function abrirAba(nome, opc) {
    opc = opc || {};
    abaAtiva = nome;
    botoes.forEach(function (b) {
      var ativa = b.getAttribute('data-aba') === nome;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-selected', ativa ? 'true' : 'false');
      // roving tabindex: o Tab entra no conjunto de abas por uma só, e as
      // setas andam entre elas — é o que um leitor de tela espera de abas
      b.tabIndex = ativa ? 0 : -1;
      if (ativa && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
    document.querySelectorAll('.aba-conteudo').forEach(function (c) {
      c.classList.toggle('ativa', c.getAttribute('data-aba') === nome);
    });
    if (!opc.semUrl) gravarUrl(true);
    // desenha só se esta aba está desatualizada; voltar a uma já pronta é grátis
    if (TODOS.length && SUJAS[nome] !== false) render();
    window.scrollTo(0, 0);
  }

  /** Setas, Home e End percorrem as abas, como manda o padrão de tablist. */
  function ligarTeclasAbas() {
    el('abas').addEventListener('keydown', function (e) {
      var visiveis = botoes.filter(function (b) { return !b.hidden; });
      var i = visiveis.indexOf(document.activeElement);
      if (i < 0) return;
      var alvo = e.key === 'ArrowRight' ? visiveis[(i + 1) % visiveis.length]
        : e.key === 'ArrowLeft' ? visiveis[(i - 1 + visiveis.length) % visiveis.length]
          : e.key === 'Home' ? visiveis[0]
            : e.key === 'End' ? visiveis[visiveis.length - 1] : null;
      if (!alvo) return;
      e.preventDefault();
      abrirAba(alvo.getAttribute('data-aba'));
      alvo.focus();
    });
  }

  /* ============================== ADMIN: senha e carga de planilha ========= */
  function ehAdmin() {
    try {
      var v = sessionStorage.getItem('seagri_admin');
      return v === '1' || v === 'local';
    } catch (e) { return false; }
  }
  function aplicarAdmin() {
    var on = ehAdmin();
    try {
      ADMIN_LOCAL = sessionStorage.getItem('seagri_admin') === 'local';
      MOTIVO_LOCAL = sessionStorage.getItem('seagri_admin_motivo') || '';
    } catch (e) { /* privado */ }
    // "Atualizar dados" e as quatro abas de inserção: todas marcadas .aba-admin
    document.querySelectorAll('.aba-admin').forEach(function (b) { b.hidden = !on; });
    el('adminBtn').innerHTML = on ? '&#9989;<span>Admin (sair)</span>' : '&#128274;<span>Admin</span>';
    // sem servidor não há o que publicar: o botão sai de cena em vez de falhar
    var aplicar = el('upAplicar');
    if (aplicar) {
      aplicar.hidden = ADMIN_LOCAL;
      aplicar.title = ADMIN_LOCAL ? 'Indisponível sem o servidor PHP' : '';
    }
    /* Antes o modo local só se anunciava pelo title do botão escondido: quem
       abria a aba via um formulário de upload que parecia inteiro e descobria
       tarde demais que não havia como publicar. Agora o motivo fica na tela. */
    var box = el('upModoLocal');
    if (box) {
      box.innerHTML = (on && ADMIN_LOCAL)
        ? '<p class="aviso erro"><b>Modo local: publicar está desativado.</b> ' + MOTIVO_LOCAL +
          ' A senha não chegou a ser conferida e nada pode ser gravado em ' +
          '<code>data/mecanizacao.json</code> — o que for carregado aqui vale só neste navegador.' +
          '<br>Para publicar de verdade, abra o painel por um servidor que execute PHP: o Apache do ' +
          'XAMPP, ou <code>php -S localhost:8734 -t .</code> na raiz do projeto.</p>'
        : '';
    }
    // saiu do admin estando numa aba restrita: volta para a visão geral
    var ativa = document.querySelector('.aba.ativa');
    if (!on && ativa && ativa.classList.contains('aba-admin')) abrirAba('geral');
  }
  function abrirModal() {
    el('admSenha').value = '';
    el('admErro').textContent = '';
    el('admOverlay').classList.add('show');
    setTimeout(function () { el('admSenha').focus(); }, 60);
  }
  /** Quem confere a senha é o servidor: não há hash nenhum neste arquivo para
      alguém baixar e quebrar offline. A senha vai por POST e o PHP responde
      só ok/não — e demora de propósito a cada erro.

      Sem PHP (GitHub Pages, abrir o arquivo direto) a aba abre em modo local:
      lá só dá para carregar uma planilha no próprio navegador, que não altera
      nada para ninguém. Publicar continua exigindo a senha no servidor. */
  var ADMIN_LOCAL = false;   // liberado sem servidor: publicar fica desativado
  var MOTIVO_LOCAL = '';     // por que caiu no modo local, para explicar na aba

  /** Confere a senha no PHP e distingue "senha errada" de "não há PHP do outro
      lado". A diferença importa: um servidor de arquivos estático
      (python -m http.server, GitHub Pages) ou um diretório bloqueado no Apache
      respondem 501/403/404 com HTML — o painel tratava 403 como senha errada e
      qualquer outro código como sucesso em modo local, então o admin ou tentava
      a senha certa para sempre ou entrava sem entender por que não dava para
      publicar. Só quem responde {ok:booleano} é o nosso endpoint; qualquer
      outra coisa é o servidor falando no lugar dele. */
  function conferirSenha(senha) {
    return fetch('../salvar_mecanizacao.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'login', senha: senha })
    }).then(function (r) {
      return r.text().then(function (corpo) {
        var j = null;
        try { j = JSON.parse(corpo); } catch (e) { /* não é resposta do endpoint */ }
        if (!j || typeof j.ok !== 'boolean') {
          return { ok: false, semServidor: true, motivo: 'O servidor respondeu <b>HTTP ' +
            r.status + '</b> em <code>salvar_mecanizacao.php</code> em vez de executar o PHP.' };
        }
        return { ok: j.ok, semServidor: false, motivo: '' };
      });
    }).catch(function () {
      return { ok: false, semServidor: true, motivo: 'Não foi possível falar com ' +
        '<code>salvar_mecanizacao.php</code> (servidor fora do ar, ou a página foi ' +
        'aberta direto do disco, sem <code>http://</code>).' };
    });
  }

  function entrar() {
    var senha = el('admSenha').value;
    el('admErro').textContent = '';
    el('admOk').disabled = true;
    conferirSenha(senha).then(function (res) {
      el('admOk').disabled = false;
      if (!res.ok && !res.semServidor) {
        el('admErro').textContent = 'Senha incorreta. Tente novamente.';
        el('admSenha').value = '';
        el('admSenha').focus();
        return;
      }
      ADMIN_LOCAL = res.semServidor;
      MOTIVO_LOCAL = res.motivo || '';
      try {
        sessionStorage.setItem('seagri_admin', res.semServidor ? 'local' : '1');
        sessionStorage.setItem('seagri_admin_motivo', MOTIVO_LOCAL);
      } catch (e) { /* privado */ }
      el('admOverlay').classList.remove('show');
      aplicarAdmin();
      abrirAba('admin');
    });
  }

  function aviso(alvo, classe, html) {
    el(alvo).innerHTML = '<p class="aviso ' + classe + '">' + html + '</p>';
  }

  function fonteDados() {
    if (!el('upFonte')) return;
    var rotulos = {
      servidor: 'Publicado no servidor (<code>data/mecanizacao.json</code>)',
      navegador: 'Carga local, só neste navegador',
      embutido: 'Arquivo embutido (<code>js/dados-mecanizacao.js</code>)'
    };
    var per = META.periodo || ['', ''];
    var itens = [
      ['Origem (ano corrente)', rotulos[FONTE] || FONTE],
      ['Planilha', G.esc(META.arquivo || '—')],
      ['Importada em', G.esc(META.gerado_em || '—')],
      ['Publicada em', G.esc(META.publicado_em || '—')],
      ['Registros do ano corrente', G.num(N_CORRENTE)],
      ['Período de inserção', per[0] ? dataBR(per[0]) + ' a ' + dataBR(per[1]) : '—'],
      ['Histórico embutido', META_HIST.registros
        ? G.num(META_HIST.registros) + ' registros (' + G.esc((META_HIST.anos || []).join(', ')) + ')'
        : '—'],
      ['Total no painel', G.num(TODOS.length)]
    ];
    el('upFonte').innerHTML = '<div class="ficha">' + itens.map(function (i) {
      return '<div class="ficha-item"><div class="ficha-rot">' + i[0] + '</div>' +
        '<div class="ficha-val">' + i[1] + '</div></div>';
    }).join('') + '</div>' +
      (FONTE === 'navegador'
        ? '<p class="aviso">Estes dados estão apenas neste navegador. Use <b>Publicar para todos</b> na aba de atualização para valer para todo mundo, ou limpe com o botão abaixo.<br><button class="btn" id="upLimparLocal" type="button" style="margin-top:8px">Descartar carga local</button></p>'
        : '');
    var limpar = el('upLimparLocal');
    if (limpar) {
      limpar.addEventListener('click', function () {
        try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* nada */ }
        location.reload();
      });
    }
  }

  var pendente = null; // pacote lido da planilha, aguardando confirmação

  function lerArquivo(arquivo) {
    if (!arquivo) return;
    if (!/\.xlsx$/i.test(arquivo.name)) {
      return aviso('upStatus', 'erro', 'Envie um arquivo <b>.xlsx</b>. Se a planilha estiver em .xls ou no Google Sheets, exporte como .xlsx primeiro.');
    }
    pendente = null;
    el('upAcoes').hidden = true;
    el('upResumo').innerHTML = '';
    aviso('upStatus', 'carregando', 'Lendo <b>' + G.esc(arquivo.name) + '</b> (' +
      (arquivo.size / 1048576).toFixed(1).replace('.', ',') + ' MB)…');

    IMPORTAR.lerPlanilha(arquivo).then(function (pacote) {
      pendente = pacote;
      // a comparação é só com a planilha do ano corrente: o histórico não vem no upload
      var antes = N_CORRENTE, depois = pacote.registros.length;
      var novos = depois - antes;
      var q = pacote.meta.qualidade || {};
      aviso('upStatus', 'ok', 'Planilha lida com sucesso: <b>' + G.num(depois) +
        ' registros</b> na aba <code>' + IMPORTAR.aba + '</code>.');
      el('upResumo').innerHTML = '<div class="ficha">' + [
        ['Registros no painel agora', G.num(antes)],
        ['Registros na planilha enviada', G.num(depois)],
        ['Diferença', (novos > 0 ? '+' : '') + G.num(novos) + (novos < 0 ? ' (a planilha tem menos linhas!)' : '')],
        ['Produtores distintos', G.num(pacote.meta.produtores || 0)],
        ['Período de inserção', dataBR(pacote.meta.periodo[0]) + ' a ' + dataBR(pacote.meta.periodo[1])],
        ['Registros sem data válida', G.num(q.sem_data_valida || 0)]
      ].map(function (i) {
        return '<div class="ficha-item"><div class="ficha-rot">' + i[0] + '</div>' +
          '<div class="ficha-val">' + i[1] + '</div></div>';
      }).join('') + '</div>' +
        (novos < 0 ? '<p class="aviso erro">A planilha enviada tem <b>menos</b> linhas que os dados atuais. ' +
          'Confirme se é o arquivo certo antes de publicar.</p>' : '');
      el('upAcoes').hidden = false;
    }).catch(function (e) {
      aviso('upStatus', 'erro', '<b>Não foi possível ler a planilha.</b><br>' + G.esc(e && e.message ? e.message : String(e)));
    });
  }

  /** Registros dos exercícios encerrados. Um ano que também venha no pacote do
      ano corrente é descartado daqui: quem manda é a planilha recém-publicada.
      A sobreposição se mede por anoDe(), que já é o exercício da fonte — antes
      isso exigia uma função à parte, porque anoDe() seguia a data do serviço e
      o pacote de 2026 parecia "cobrir" 2025, apagando o histórico do ano. */
  function historico(pacote) {
    var h = window.DADOS_MECANIZACAO_HISTORICO;
    if (!h || !Array.isArray(h.registros)) return [];
    META_HIST = h.meta || {};
    var noPacote = new Set(pacote.registros.map(anoDe));
    return h.registros.filter(function (r) { return !noPacote.has(anoDe(r)); });
  }

  var PACOTE = null;   // pacote do ano corrente, guardado para remontar com o histórico

  function usarPacote(pacote, fonte, manterSelecao) {
    PACOTE = pacote;
    // ordenado pela data do serviço, que é a referência do painel
    TODOS = historico(pacote).concat(pacote.registros)
      .sort(function (a, b) {
        var x = dataRef(a), y = dataRef(b);
        return x < y ? -1 : x > y ? 1 : 0;
      });
    META = pacote.meta || {};
    N_CORRENTE = pacote.registros.length;
    FONTE = fonte;
    var m = new Map();
    TODOS.forEach(function (r) {
      r.cult.forEach(function (c) { if (c[2]) m.set(c[2], (m.get(c[2]) || 0) + 1); });
    });
    ORDEM.sistema = Array.from(m.keys()).sort(function (a, b) { return m.get(b) - m.get(a); });

    ANOS = unicos(TODOS.map(anoDe)).reverse();   // do mais recente para o mais antigo
    // ao remontar com o histórico que chegou depois, a escolha do usuário fica
    // de pé; ano vazio é o consolidado e também é preservado
    // exercícios que sumiram da base (troca de planilha) saem da seleção
    var aindaExistem = F.ano.filter(function (a) { return ANOS.indexOf(a) >= 0; });
    if (!manterSelecao || !aindaExistem.length) F.ano = anosIniciais();
    else F.ano = aindaExistem;
    // os exercícios pedidos na URL podem ter acabado de existir, com o histórico
    if (manterSelecao && anoPendenteUrl.length) {
      var chegaram = anoPendenteUrl.filter(function (a) { return ANOS.indexOf(a) >= 0; });
      if (chegaram.length === anoPendenteUrl.length) {
        F.ano = chegaram;
        anoPendenteUrl = [];
      }
    }
    montarSeletorAno();
    sincronizarAno();
    popularFiltros();
    invalidar();
    // dependem só de TODOS/META: saem do caminho quente e rodam ao trocar a base
    nota();
    fonteDados();
  }

  /* --------------------------------------------- histórico em segundo plano */
  /* São 1,3 MB de exercícios encerrados. O painel sempre abre no ano corrente,
     e esse arquivo só interessa a quem escolhe 2023–2025 ou "Geral" — carregá-lo
     junto atrasava o primeiro desenho para todo mundo. Agora entra depois, e o
     seletor de período ganha os anos antigos quando ele chega. */
  function carregarHistorico() {
    if (window.DADOS_MECANIZACAO_HISTORICO) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      /* ?v= só em http(s). Aberto por file://, o navegador entende
         "arquivo.js?v=123" como o NOME do arquivo e falha com
         ERR_FILE_NOT_FOUND — o painel ficaria sem os anos encerrados. */
      var comVersao = VERSAO && /^https?:$/.test(location.protocol);
      s.src = '../js/dados-mecanizacao-historico.js' + (comVersao ? '?v=' + VERSAO : '');
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };   // segue só com o ano corrente
      document.body.appendChild(s);
    });
  }

  function publicar() {
    if (!pendente) return;
    if (ADMIN_LOCAL) {
      return aviso('upStatus', 'erro', 'Sem servidor PHP não há como publicar. ' +
        'Use <b>Usar só neste navegador</b> para conferir os dados.');
    }
    /* Reconfirma a senha antes de sobrescrever a base de todo mundo: a sessão
       admin não é autorização para gravar, é só o que abre esta aba. Quem
       decide continua sendo o PHP, que confere a senha de novo. */
    var senha = prompt('Confirme a senha de administrador para publicar:');
    if (senha == null) return;
    aviso('upStatus', 'carregando', 'Publicando no servidor…');
    fetch('../salvar_mecanizacao.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: senha, dados: pendente })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, corpo: j }; });
    }).then(function (res) {
      if (!res.ok || !res.corpo.ok) throw new Error(res.corpo.erro || 'Erro no servidor.');
      aviso('upStatus', 'ok', 'Publicado: <b>' + G.num(res.corpo.registros) +
        ' registros</b> em ' + G.esc(res.corpo.publicado_em) + '. Todo mundo já vê os dados novos.');
      try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* nada */ }
      usarPacote(pendente, 'servidor');
      pendente = null;
      el('upAcoes').hidden = true;
      render();
    }).catch(function (e) {
      aviso('upStatus', 'erro', '<b>Falha ao publicar.</b> ' + G.esc(e.message) +
        '<br>Se o servidor não tem PHP (ex.: GitHub Pages), use <b>Usar só neste navegador</b> ' +
        'ou rode <code>python tools/gerar_dados_mecanizacao.py</code> e publique o arquivo gerado.');
    });
  }

  function usarSoLocal() {
    if (!pendente) return;
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(pendente));
    } catch (e) {
      return aviso('upStatus', 'erro', 'Não foi possível guardar no navegador (espaço insuficiente): ' + G.esc(e.message));
    }
    aviso('upStatus', 'ok', 'Dados carregados <b>só neste navegador</b>. O servidor não foi alterado.');
    usarPacote(pendente, 'navegador');
    pendente = null;
    el('upAcoes').hidden = true;
    render();
  }

  function ligarAdmin() {
    el('adminBtn').addEventListener('click', function () {
      if (ehAdmin()) {
        try {
          sessionStorage.removeItem('seagri_admin');
          sessionStorage.removeItem('seagri_admin_motivo');
        } catch (e) { /* nada */ }
        aplicarAdmin();
        return;
      }
      abrirModal();
    });
    el('admOk').addEventListener('click', entrar);
    el('admCancelar').addEventListener('click', function () { el('admOverlay').classList.remove('show'); });
    el('admSenha').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') entrar();
      if (e.key === 'Escape') el('admOverlay').classList.remove('show');
    });
    el('admOverlay').addEventListener('click', function (e) {
      if (e.target === el('admOverlay')) el('admOverlay').classList.remove('show');
    });

    var zona = el('upZona');
    zona.addEventListener('click', function () { el('upArquivo').click(); });
    el('upArquivo').addEventListener('change', function () { lerArquivo(this.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('sobre'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('sobre'); });
    });
    zona.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) lerArquivo(e.dataTransfer.files[0]);
    });
    el('upAplicar').addEventListener('click', publicar);
    el('upSoLocal').addEventListener('click', usarSoLocal);
    el('upCancelar').addEventListener('click', function () {
      pendente = null;
      el('upAcoes').hidden = true;
      el('upResumo').innerHTML = '';
      el('upArquivo').value = '';
      aviso('upStatus', '', 'Carga cancelada. Nada foi alterado.');
    });
  }

  /* -------------------------------------------------------- carregar dados */
  function carregarDados() {
    return fetch('../data/mecanizacao.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('sem arquivo publicado');
        return r.json();
      })
      .then(function (j) {
        if (!j || !Array.isArray(j.registros) || !j.registros.length) throw new Error('vazio');
        return { pacote: j, fonte: 'servidor' };
      })
      .catch(function () {
        try {
          var s = localStorage.getItem(CHAVE_LOCAL);
          if (s) {
            var j = JSON.parse(s);
            if (j && Array.isArray(j.registros) && j.registros.length) return { pacote: j, fonte: 'navegador' };
          }
        } catch (e) { /* modo privado ou JSON corrompido */ }
        return { pacote: window.DADOS_MECANIZACAO, fonte: 'embutido' };
      });
  }

  /* -------------------------------------------------------------------- init */
  botoes = Array.prototype.slice.call(document.querySelectorAll('.aba'));
  botoes.forEach(function (b) {
    b.addEventListener('click', function () { abrirAba(b.getAttribute('data-aba')); });
  });
  ajustarAlturaUtil();
  pintarBotaoTema();
  el('temaBtn').addEventListener('click', trocarTema);
  montarControles();
  ligarFiltros();
  ligarAdmin();
  aplicarAdmin();
  ligarOrdenacao();
  pintarCabecalhoOrdem();
  POR_PAG = +lerPref(CHAVE_POR_PAG, 25) || 25;
  if ([25, 50, 100, 250].indexOf(POR_PAG) < 0) POR_PAG = 25;
  el('pagTam').value = String(POR_PAG);
  /* contexto().D em vez de filtrar(): a seleção já está calculada e memoizada;
     refazê-la a cada tecla percorria os 3.479 registros de novo */
  el('busca').addEventListener('input', atrasar(function () { pag = 1; tabela(contexto().D); }, 160));
  el('pagAnt').addEventListener('click', function () { pag--; tabela(contexto().D); });
  el('pagProx').addEventListener('click', function () { pag++; tabela(contexto().D); });
  el('pagTam').addEventListener('change', function () {
    POR_PAG = +this.value || 25;
    pag = 1;
    tabela(contexto().D);
    try { localStorage.setItem(CHAVE_POR_PAG, String(POR_PAG)); } catch (e) { /* modo privado */ }
  });
  /* busca do produtor: filtra a cada tecla e abre a lista de sugestões */
  el('buscaProd').addEventListener('input', atrasar(function () {
    montarSugestoes(true);
    ficha(contexto().D);
  }, 160));
  el('buscaProd').addEventListener('focus', function () { montarSugestoes(true); });
  el('buscaProd').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (el('listaProd').hidden) montarSugestoes(true);
      else moverSugestao(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      if (iSugestao >= 0) { e.preventDefault(); escolherSugestao(iSugestao); }
      else fecharSugestoes();
    } else if (e.key === 'Escape') {
      fecharSugestoes();
    }
  });
  /* lista de beneficiários do município: a linha abre a ficha, o botão volta.
     Delegado, porque o conteúdo de #fichaProd é redesenhado a cada seleção. */
  el('fichaProd').addEventListener('click', function (e) {
    if (e.target.closest('.ben-voltar')) return voltarALista();
    var lin = e.target.closest('.ben-lin');
    if (lin) abrirFichaDe(lin.getAttribute('data-nome'));
  });
  el('fichaProd').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var lin = e.target.closest('.ben-lin');
    if (!lin) return;
    e.preventDefault();
    abrirFichaDe(lin.getAttribute('data-nome'));
  });
  // mousedown (e não click): o blur do campo fecharia a lista antes do clique
  el('listaProd').addEventListener('mousedown', function (e) {
    var li = e.target.closest('.prod-sugestao');
    if (!li) return;
    e.preventDefault();
    escolherSugestao(+li.getAttribute('data-i'));
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.prod-busca')) fecharSugestoes();
  });
  el('btnRelatorioFechar').addEventListener('click', function () {
    el('relatorioOverlay').classList.remove('show');
  });
  el('relatorioOverlay').addEventListener('click', function (e) {
    if (e.target === el('relatorioOverlay')) el('relatorioOverlay').classList.remove('show');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el('relatorioOverlay').classList.contains('show')) {
      el('relatorioOverlay').classList.remove('show');
    }
  });
  el('btnRelatorioPdf').addEventListener('click', function () {
    exportarRelatorioPdf(el('relatorioTitulo').textContent, el('relatorioConteudo').innerHTML);
  });
  el('relatorioVis').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-vis]');
    if (!btn) return;
    visRelatorio = btn.getAttribute('data-vis');
    aplicarVisRelatorio();
  });
  el('relatorBusca').addEventListener('input', aplicarBuscaRelatorio);
  /* Busca do dia a dia: só a tabela é refeita, não a aba inteira — os
     gráficos ao lado mostram o período todo, e piscar a cada tecla seria
     trabalho jogado fora. */
  el('buscaInsDia').addEventListener('input', atrasar(function (e) {
    buscaDia = e.target.value.trim();
    if (CTX) tabelaInsDia(insercoes(CTX));
  }, 180));
  window.addEventListener('resize', (function () {
    var t;
    return function () {
      ajustarAlturaUtil();
      clearTimeout(t);
      t = setTimeout(function () { invalidar(); render(); }, 220);
    };
  })());
  // Voltar/Avançar do navegador percorrem as seleções, não só as abas
  window.addEventListener('popstate', function () {
    if (TODOS.length) aplicarEstado(lerHash());
  });
  ligarTeclasAbas();

  carregarDados().then(function (res) {
    if (!res.pacote || !res.pacote.registros) {
      document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
        '<p class="aviso erro">Não foi possível carregar os dados de mecanização.</p>');
      return;
    }
    usarPacote(res.pacote, res.fonte);
    aplicarEstado(lerHash());
    gravarUrl(false);   // deixa a URL refletir a seleção já no primeiro desenho

    /* Só agora o histórico: o painel já está desenhado e utilizável. Ao chegar,
       a base é remontada mantendo a seleção e o seletor de período ganha os
       exercícios encerrados. */
    carregarHistorico().then(function (ok) {
      if (!ok || !PACOTE) return;
      usarPacote(PACOTE, FONTE, true);
      render();
      // se o ano do link só passou a existir agora, a URL foi reescrita com o
      // ano corrente no primeiro desenho — devolve o endereço à seleção real
      gravarUrl(false);
    });
  });
})();
