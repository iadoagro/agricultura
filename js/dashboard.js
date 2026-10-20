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
  /* Frota de máquinas alocada por município em 2026 — informação fixa (não vem da
     planilha de vistorias), passada à parte pela SEAGRI. Entra só no relatório
     geral resumido (ver baixarPdfGeral), por isso fica separada dos dados de D. */
  var MAQUINAS_MUNICIPIO_2026 = {
    'Marechal Thaumaturgo': '2 escavadeiras hidráulicas',
    'Mâncio Lima': '1 escavadeira hidráulica · 1 trator agrícola',
    'Cruzeiro do Sul': '1 pá mecânica · 2 tratores agrícolas',
    'Tarauacá': '1 escavadeira hidráulica · 2 tratores agrícolas',
    'Feijó': '1 trator de esteira · 1 trator agrícola',
    'Manoel Urbano': '1 trator agrícola',
    'Porto Acre': '1 escavadeira · 1 pá mecânica · 1 trator agrícola',
    'Acrelândia': '1 escavadeira hidráulica · 2 tratores agrícolas',
    'Plácido de Castro': '2 tratores agrícolas',
    'Capixaba': '1 trator de esteira · 1 escavadeira hidráulica · 1 pá mecânica · 1 trator agrícola',
    'Xapuri': '2 tratores agrícolas',
    'Epitaciolândia': '1 pá mecânica · 1 trator agrícola',
    'Brasiléia': '2 escavadeiras hidráulicas · 2 tratores agrícolas',
    'Assis Brasil': '2 tratores agrícolas · 1 pá mecânica',
    'Bujari': '2 tratores de pneu',
    'Rio Branco': '3 escavadeiras · 5 tratores de pneu · 2 pás carregadeiras'
  };
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

  /* Regras de cálculo puras (datas de referência, exercício, somas, ranking, identidade do produtor):
     js/painel-calculos.js, testadas por tools/testar_painel.cjs. */
  var PC = window.PainelCalculos;
  var difMeses = PC.difMeses,
      vistoriaValida = PC.vistoriaValida,
      dataRef = PC.dataRef,
      anoDe = PC.anoDe,
      mesChave = PC.mesChave,
      soma = PC.soma,
      contar = PC.contar,
      somarPor = PC.somarPor,
      distintosPor = PC.distintosPor,
      ranking = PC.ranking,
      faixas = PC.faixas,
      chaveBusca = PC.chaveBusca,
      chaveProdutor = PC.chaveProdutor,
      nProdutores = PC.nProdutores;





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
      PER = { de: '', ate: '' };
      if (el('perDe')) { el('perDe').value = ''; el('perAte').value = ''; }
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
  var PER = { de: '', ate: '' };   // período livre: datas ISO (aaaa-mm-dd) ou vazio
  function filtrar(exceto, anoAlvo) {
    var fora = Array.isArray(exceto) ? exceto : [exceto];
    function sem(k) { return fora.indexOf(k) >= 0; }
    // anoAlvo é sempre um exercício só (a comparação com o ano anterior)
    var anos = (anoAlvo === undefined) ? F.ano : (anoAlvo ? [anoAlvo] : []);
    return TODOS.filter(function (r) {
      if (anos.length && anos.indexOf(anoDe(r)) < 0) return false;
      // período livre (datas de vistoria); não vale na comparação com o ano anterior
      if (anoAlvo === undefined && (PER.de || PER.ate)) {
        var dr = dataRef(r);
        if ((PER.de && dr < PER.de) || (PER.ate && dr > PER.ate)) return false;
      }
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

  /* Celular (até 768 px, o mesmo ponto de corte do CSS): o painel se identifica sozinho e cada gráfico abre no tipo
     que melhor se lê numa tela estreita — o que o painel prevê como principal (barras para ranking, rosca para poucas
     partes, colunas ou linha para o tempo) e não a tabela, que no celular vira uma pilha de cartões. O que o usuário
     escolhe no celular fica guardado à parte do que escolheu no computador, e só as escolhas dele (nunca os padrões),
     assim um padrão melhor passa a valer também para quem já tinha mexido em algum gráfico. */
  var CHAVE_TIPOS_CEL = CHAVE_TIPOS + '_celular';
  var MQ_CELULAR = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
  function emCelular() { return !!(MQ_CELULAR && MQ_CELULAR.matches); }

  function lerSalvos(chave) {
    try { return JSON.parse(lerPref(chave, '{}')) || {}; } catch (e) { return {}; }
  }
  /** Tipo escolhido por painel na última visita (computador e celular guardados separados). */
  var TIPOS_SALVOS = lerSalvos(CHAVE_TIPOS);
  var TIPOS_SALVOS_CEL = lerSalvos(CHAVE_TIPOS_CEL);

  function salvarTipos() {
    try { localStorage.setItem(CHAVE_TIPOS, JSON.stringify(TIPOS)); } catch (e) { /* modo privado */ }
  }
  function salvarTipoCelular(id, t) {
    TIPOS_SALVOS_CEL[id] = t;
    try { localStorage.setItem(CHAVE_TIPOS_CEL, JSON.stringify(TIPOS_SALVOS_CEL)); } catch (e) { /* modo privado */ }
  }

  /** Tipos do painel na ordem dos botões: a tabela encabeça (é a visão padrão no computador). */
  function tiposDoPainel(div) {
    var tipos = div.getAttribute('data-tipos').split(',');
    var iTab = tipos.indexOf('tabela');
    if (iTab > 0) {
      tipos.splice(iTab, 1);
      tipos.unshift('tabela');
    }
    return tipos;
  }

  /** Padrão no celular: o tipo que o painel prevê como principal (o 1º de data-tipos). Rosca, pizza e colunas só dão
      conta de poucas categorias numa tela estreita (as colunas se atropelam, as fatias repetem cor): com mais de 6
      vão para barras, que ficam legíveis com qualquer quantidade. n = categorias do gráfico (null = ainda sem dados). */
  function padraoCelular(div, tipos, n) {
    var principal = div.getAttribute('data-tipos').split(',')[0];
    if (n > 6 && tipos.indexOf('barras') >= 0 &&
        (principal === 'rosca' || principal === 'pizza' || principal === 'colunas')) return 'barras';
    return principal;
  }

  /** O tipo em uso num painel: a escolha guardada do aparelho (celular ou computador) ou o padrão dele. */
  function tipoInicial(div, tipos, n) {
    var id = div.id;
    // a escolha guardada vale, desde que ainda seja um tipo válido para este painel (a lista de tipos pode ter mudado no HTML)
    if (emCelular()) return tipos.indexOf(TIPOS_SALVOS_CEL[id]) >= 0 ? TIPOS_SALVOS_CEL[id] : padraoCelular(div, tipos, n);
    return tipos.indexOf(TIPOS_SALVOS[id]) >= 0 ? TIPOS_SALVOS[id] : tipos[0];
  }

  function marcarTipo(div) {
    var grupo = div._grupoTipos;
    if (!grupo) return;
    grupo.querySelectorAll('.tipo-btn').forEach(function (b) {
      var on = b.getAttribute('data-tipo') === TIPOS[div.id];
      b.classList.toggle('ativo', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  /** Já com os dados na mão: no celular, sem escolha do usuário, confere se o tipo padrão dá conta desta quantidade de categorias. */
  function ajustarTipoCelular(div, n) {
    if (!emCelular() || TIPOS_SALVOS_CEL[div.id] != null) return;
    var t = padraoCelular(div, tiposDoPainel(div), n);
    if (t !== TIPOS[div.id]) {
      TIPOS[div.id] = t;
      marcarTipo(div);
    }
  }

  function montarControles() {
    document.querySelectorAll('[data-tipos]').forEach(function (div) {
      var id = div.id;
      var tipos = tiposDoPainel(div);
      TIPOS[id] = tipoInicial(div, tipos, null);

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
      div._grupoTipos = grupo;
      grupo.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.tipo-btn');
        if (!btn) return;
        var t = btn.getAttribute('data-tipo');
        if (t === TIPOS[id]) return;
        TIPOS[id] = t;
        marcarTipo(div);
        redesenhar(id);
        if (emCelular()) salvarTipoCelular(id, t); else salvarTipos();
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

  /** Cruzou o ponto de corte (girou o aparelho, redimensionou a janela): cada painel passa ao tipo do novo modo. */
  function trocarModoTipos() {
    document.querySelectorAll('[data-tipos]').forEach(function (div) {
      var p = PAYLOAD[div.id];
      TIPOS[div.id] = tipoInicial(div, tiposDoPainel(div), p && p.tipo === 'cat' ? p.dados.length : null);
      marcarTipo(div);
      redesenhar(div.id);
    });
  }
  if (MQ_CELULAR) {
    if (MQ_CELULAR.addEventListener) MQ_CELULAR.addEventListener('change', trocarModoTipos);
    else if (MQ_CELULAR.addListener) MQ_CELULAR.addListener(trocarModoTipos);   // Safari antigo
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

  /** Descrição em texto do gráfico para leitores de tela: título, maiores itens e quantidade. */
  function descreverGrafico(div, titulo, itens, n) {
    try {
      var txt = (titulo || 'Gráfico') + '. ' + (itens.length ? itens.join('; ') + (n > itens.length ? '; e mais ' + (n - itens.length) : '') + '.' : 'Sem dados.');
      div.setAttribute('role', 'group');
      div.setAttribute('aria-label', txt);
    } catch (e) { /* acessibilidade nunca derruba o desenho */ }
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
    ajustarTipoCelular(div, dados.length);
    G.categorico(TIPOS[id], div, dados, opts);
    descreverGrafico(div, opts.titulo, dados.slice(0, 6).map(function (d) {
      return d.rot + ' ' + G.num(d.val, opts.dec || 0) + (opts.unidade ? ' ' + opts.unidade : '');
    }), dados.length);
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
    descreverGrafico(div, opts.titulo, series.map(function (s) {
      var tot = (s.valores || []).reduce(function (a, v) { return a + (v || 0); }, 0);
      return s.nome + ': total ' + G.num(tot, opts.dec || 0);
    }), rotulos.length);
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
    'Endereço / local', 'Sexo', 'Estado civil', 'Associação / coop.', 'CAF', 'Técnico(s)'];
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
      HIST_COLUNAS.filter(function (c) { return !(window.MODO_PUBLICO && c === 'Form.'); })   // versão pública: sem o link do formulário
        .map(function (c) { return '<th>' + G.esc(c) + '</th>'; }).join('') +
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
          (window.MODO_PUBLICO ? '' : '<td>' + (r.form ? '<a href="' + G.esc(r.form) + '" target="_blank" rel="noopener">abrir</a>' : '—') + '</td>') +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';

    /* Linha do tempo: os atendimentos em ordem, com o intervalo entre um e outro */
    var ord = R.slice().sort(function (a, b) {
      var x = dataRef(a), y = dataRef(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    var diasEntre = function (a, b) {
      return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
    };
    var secLinha = ord.length < 1 ? '' : '<h3 class="ben-sec">Linha do tempo</h3><ol class="linha-tempo">' +
      ord.map(function (r, i) {
        var gap = i ? diasEntre(dataRef(ord[i - 1]), dataRef(r)) : null;
        var det = r.pc === MEC
          ? (r.cult.length ? r.cult.map(function (c) { return G.esc(c[0]); }).join(', ') + ' · ' : '') + G.num(r.ha, 1) + ' ha'
          : G.num(r.hrs, 1) + ' h de máquina' + (r.ac ? ' · ' + G.num(r.ac) + ' tanque(s)' : '');
        return '<li class="lt-' + (r.pc === MEC ? 'mec' : 'acu') + '"><span class="lt-data">' + dataBR(dataRef(r)) + '</span>' +
          '<div><b>' + G.esc(r.pc || '—') + '</b> · ' + G.esc(r.mun || '—') + ' <small>' + det + '</small>' +
          (gap != null ? '<em>' + (gap === 0 ? 'no mesmo dia do anterior' : gap + ' dia(s) depois do anterior') + '</em>' : '<em>primeiro atendimento</em>') +
          '</div></li>';
      }).join('') + '</ol>';

    el('fichaProd').innerHTML = secResumo + secFicha + secCult + secMaq + secLinha + secTabela;
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
    }).length + ((PER.de || PER.ate) ? 1 : 0);
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
    pintarSelecaoIns(C);
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
      { rot: 'Produtores com CAF', val: G.num(nProdutores(D.filter(function (r) { return r.dap === 'Sim'; }))),
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
    // verde = mecanização, azul = açudagem, ciano (mistura dos dois) = os dois
    if (cat === 'mec') return 'var(--mapa-mec)';
    if (cat === 'acu') return 'var(--mapa-acu)';
    if (cat === 'both') return 'var(--mapa-ambos)';
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

  /* Colorir por volume: escala de 5 classes, do maior para o menor, numa cor só
     (verde = hectares, azul = horas, azul-marinho = atendimentos). Município sem
     registro no filtro fica cinza. */
  var MAPA_COR = 'tipo';   // tipo | n | ha | hrs
  /* Cada métrica diz como ler o valor do município (t = MAPA_TIP[id]), como
     escrever e a cor-base da escala. "mul" e "pmul" contam atendimentos a
     mulheres; "media" é hectares por vistoria de mecanização. */
  var MAPA_METRICAS = {
    n:     { rot: 'Atendimentos',          base: 'var(--acento-fundo)', dec: 0, un: '',    v: function (t) { return t.n; } },
    ha:    { rot: 'Hectares',              base: 'var(--mapa-mec)',     dec: 1, un: ' ha', v: function (t) { return t.ha; } },
    hrs:   { rot: 'Horas de máquina',      base: 'var(--mapa-acu)',     dec: 1, un: ' h',  v: function (t) { return t.hrs; } },
    mul:   { rot: 'Mulheres atendidas',    base: '#c0348c',             dec: 0, un: '',    v: function (t) { return t.mul; } },
    pmul:  { rot: '% de mulheres',         base: '#a8286f',             dec: 1, un: '%',   v: function (t) { return t.pmul; } },
    prod:  { rot: 'Produtores atendidos',  base: '#6d4fc2',             dec: 0, un: '',    v: function (t) { return t.prod; } },
    ac:    { rot: 'Tanques/açudes',        base: '#0f8a8a',             dec: 0, un: '',    v: function (t) { return t.ac; } },
    dap:   { rot: 'Com CAF',               base: '#d98a1f',             dec: 0, un: '',    v: function (t) { return t.dap; } },
    media: { rot: 'Média de ha por vistoria', base: '#4a8f2a',          dec: 1, un: ' ha', v: function (t) { return t.media; } },
    dae:   { rot: 'DAE arrecadada',        base: '#8a5a2b',             dec: 0, un: '',    moeda: true, v: function (t) { return t.dae; } }
  };
  var MAPA_COR_ROT = { tipo: 'Serviço' };
  Object.keys(MAPA_METRICAS).forEach(function (k) { MAPA_COR_ROT[k] = MAPA_METRICAS[k].rot; });

  function mapaMecFmt(m, v) {
    var d = MAPA_METRICAS[m];
    return d.moeda ? moeda(v) : G.num(v, d.dec) + d.un;
  }
  var MAPA_COR_PCT = [20, 38, 56, 76, 100];   // da menor classe para a maior

  function mapaMecCorClasse(metrica, k) {
    return 'color-mix(in srgb, ' + MAPA_METRICAS[metrica].base + ' ' + MAPA_COR_PCT[k] + '%, var(--superficie))';
  }

  /* Colorir por serviço: o matiz diz o serviço (verde, azul, ciano) e a
     intensidade diz o volume de atendimentos do município — mais ação, mais
     escuro; menos ação, mais claro. */
  var MAPA_COR_CAT = { mec: 'var(--mapa-mec)', acu: 'var(--mapa-acu)', both: 'var(--mapa-ambos)' };

  /** Classes por quantis (cada faixa leva ~o mesmo número de municípios): com um
      município muito maior que os outros, faixas de largura igual deixariam o
      mapa quase todo na cor mais clara. Devolve { limites, classe(v), max }. */
  function mapaMecClasses(valores) {
    var N = MAPA_COR_PCT.length;
    var v = valores.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    var lim = [];
    for (var k = 1; k <= N; k++) {
      lim.push(v.length ? v[Math.min(v.length - 1, Math.ceil(k * v.length / N) - 1)] : 0);
    }
    return {
      limites: lim,
      max: v.length ? v[v.length - 1] : 0,
      classe: function (x) {
        for (var k = 0; k < N; k++) if (x <= lim[k]) return k;
        return N - 1;
      }
    };
  }

  function mapaMecMisturar(base, k) {
    return 'color-mix(in srgb, ' + base + ' ' + MAPA_COR_PCT[k] + '%, var(--superficie))';
  }

  function mapaMecPintarServico(catPorId) {
    var N = MAPA_COR_PCT.length;
    var cls = mapaMecClasses(Object.keys(MAPA_TIP).map(function (id) { return MAPA_TIP[id].n || 0; }));
    var max = cls.max;
    MAPA_MEC.pintar(function (id) {
      var cat = catPorId[id], t = MAPA_TIP[id];
      if (!cat || cat === 'none' || !t || !t.n || !(max > 0)) return 'var(--grade)';
      return mapaMecMisturar(MAPA_COR_CAT[cat], cls.classe(t.n));
    });

    var leg = el('mapaMecLegenda'), host = el('mapaMecEscala');
    if (host) host.hidden = true;
    if (!leg) return;
    leg.hidden = false;
    function grad(base) {
      var h = '<span class="leg-grad">';
      for (var k = 0; k < N; k++) h += '<i style="background:' + mapaMecMisturar(base, k) + '"></i>';
      return h + '</span>';
    }
    var claro = cls.limites[0], escuro = cls.limites[N - 2];
    leg.innerHTML =
      '<li>' + grad(MAPA_COR_CAT.mec) + ' Mecaniza&ccedil;&atilde;o</li>' +
      '<li>' + grad(MAPA_COR_CAT.acu) + ' A&ccedil;udagem</li>' +
      '<li>' + grad(MAPA_COR_CAT.both) + ' Os dois</li>' +
      '<li><span class="ponto nenhum"></span> Sem registro no filtro</li>' +
      '<li class="leg-nota">Quanto mais escuro, mais atendimentos no munic&iacute;pio: ' +
      (max > 0 ? 'mais claro = at&eacute; ' + G.num(claro, 0) + (claro === 1 ? ' atendimento' : ' atendimentos') + '; mais escuro = acima de ' +
        G.num(escuro, 0) + ' (m&aacute;ximo ' + G.num(max, 0) + ').' : 'sem registros no filtro.') + '</li>';
  }

  function mapaMecPintarEscala() {
    var m = MAPA_COR, N = MAPA_COR_PCT.length, def = MAPA_METRICAS[m];
    var cls = mapaMecClasses(Object.keys(MAPA_TIP).map(function (id) { return def.v(MAPA_TIP[id]) || 0; }));
    var max = cls.max;
    MAPA_MEC.pintar(function (id) {
      var t = MAPA_TIP[id], v = t ? (def.v(t) || 0) : 0;
      if (!(v > 0) || !(max > 0)) return 'var(--grade)';
      return mapaMecCorClasse(m, cls.classe(v));
    });

    var host = el('mapaMecEscala');
    if (el('mapaMecLegenda')) el('mapaMecLegenda').hidden = true;
    if (!host) return;
    host.hidden = false;
    if (!(max > 0)) {
      host.innerHTML = '<h4>' + G.esc(def.rot) + ' por município</h4><p class="sub">Sem valores no filtro atual.</p>';
      return;
    }
    var itens = '';
    for (var k = N - 1; k >= 0; k--) {   // do maior para o menor
      var de = k ? cls.limites[k - 1] : 0, ate = cls.limites[k];
      if (k && ate <= de) continue;   // quantis repetidos: classe sem municípios
      itens += '<li><i style="background:' + mapaMecCorClasse(m, k) + '"></i>' +
        (k === 0 ? '<span>at&eacute; <b>' + G.esc(mapaMecFmt(m, ate)) + '</b></span></li>'
          : '<span><b>' + G.esc(mapaMecFmt(m, de)) + '</b> a <b>' + G.esc(mapaMecFmt(m, ate)) + '</b></span></li>');
    }
    itens += '<li><i style="background:var(--grade)"></i><span>Sem registro no filtro</span></li>';
    host.innerHTML = '<h4>' + G.esc(def.rot) + ' por município &mdash; do maior para o menor</h4>' +
      '<div class="mapa-mec-escala-barra" style="background:linear-gradient(to right,' +
      mapaMecCorClasse(m, N - 1) + ',' + mapaMecCorClasse(m, 0) + ')"></div>' +
      '<div class="mapa-mec-escala-pontas"><span>Maior: ' + G.esc(mapaMecFmt(m, max)) + '</span><span>Menor: &gt; 0</span></div>' +
      '<ul>' + itens + '</ul>';
  }

  function mapaMecDesenharModo() {
    var host = el('mapaMecModo');
    if (!host) return;
    host.innerHTML = '<span class="sub" style="margin:0 4px 0 0;align-self:center">Colorir por:</span>' +
      ['tipo', 'n', 'ha', 'hrs', 'mul', 'pmul', 'prod', 'ac', 'dap', 'media', 'dae'].map(function (v) {
        return '<button type="button" data-v="' + v + '" class="' + (MAPA_COR === v ? 'ativo' : '') + '">' +
          G.esc(MAPA_COR_ROT[v]) + '</button>';
      }).join('');
    if (host.getAttribute('data-ligado') !== '1') {
      host.setAttribute('data-ligado', '1');
      host.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-v]');
        if (!b) return;
        MAPA_COR = b.getAttribute('data-v');
        render();
      });
    }
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

  /* Valor mostrado nas listas laterais do mapa: hectares com "Mecanização", horas com "Açudagem". Com "Os dois"
     (hectares e horas não se somam) segue o "Colorir por": Hectares → ha, Horas de máquina → h; nas demais
     métricas, o número de atendimentos. */
  function mapaMecUnidade() {
    if (F.pc.length === 1) return F.pc[0] === MEC ? 'ha' : F.pc[0] === ACU ? 'h' : '';
    return MAPA_COR === 'ha' ? 'ha' : MAPA_COR === 'hrs' ? 'h' : '';
  }
  function mapaMecFmtLateral(v, un) {
    return un ? G.num(v, 1) + ' ' + un : G.num(v);
  }

  function mapaMecDesenharRegionais(C) {
    var host = el('mapaMecRegionais');
    if (!host) return;
    var un = mapaMecUnidade();
    var contPorReg = {};
    C.D.forEach(function (r) {
      var g = regionalDe(r.mun);
      if (!g) return;
      var v = un === 'ha' ? (r.pc === MEC ? (r.ha || 0) : 0) : un === 'h' ? (r.pc === ACU ? (r.hrs || 0) : 0) : 1;
      contPorReg[g] = (contPorReg[g] || 0) + v;
    });
    host.innerHTML = REGIONAIS.map(function (r) {
      var ativo = F.reg.length === 1 && F.reg[0] === r.nome;
      return '<li><button type="button" class="' + (ativo ? 'ativo' : '') + '" data-v="' + G.esc(r.nome) + '">' +
        '<span>' + G.esc(r.nome) + '</span><span class="qtd">' + mapaMecFmtLateral(contPorReg[r.nome] || 0, un) + '</span></button></li>';
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
    var un = mapaMecUnidade();
    var lista = ranking(un === 'ha' ? C.haPorMun : un === 'h' ? C.hrsPorMun : C.atendPorMun, 999);
    host.innerHTML = lista.map(function (item) {
      var ativo = F.mun.length === 1 && F.mun[0] === item.rot;
      return '<li><button type="button" class="' + (ativo ? 'ativo' : '') + '" data-v="' + G.esc(item.rot) + '">' +
        '<span>' + G.esc(item.rot) + '</span><span class="qtd">' + mapaMecFmtLateral(item.val, un) + '</span></button></li>';
    }).join('');
    if (host.getAttribute('data-ligado') !== '1') {
      host.setAttribute('data-ligado', '1');
      host.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-v]');
        if (btn) mapaMecCliqueMunicipio(btn.getAttribute('data-v'));
      });
    }
  }

  /* Tooltip do mapa: nome + hectares (mecanização) + horas (açudagem) do
     município dentro do filtro atual. MAPA_TIP é refeito a cada abaMapa(). */
  var MAPA_TIP = {};

  function mapaMecTooltipHtml(id) {
    var t = MAPA_TIP[id] || { ha: 0, hrs: 0, n: 0 };
    var nome = mapaMecNomePorId(id) || id;
    if (!t.n) {
      return '<div class="mo-tip-tit">' + G.esc(nome) + '</div><div class="mo-tip-sub" style="border:0;margin:0;padding:0">Sem registro no filtro</div>';
    }
    return '<div class="mo-tip-tit">' + G.esc(nome) + '</div>' +
      '<div class="mo-tip-l"><span class="ponto mec"></span>Hectares <b>' + (t.ha ? G.num(t.ha, 1) + ' ha' : '—') + '</b></div>' +
      '<div class="mo-tip-l"><span class="ponto acu"></span>Horas de máquina <b>' + (t.hrs ? G.num(t.hrs, 1) + ' h' : '—') + '</b></div>' +
      (MAPA_METRICAS[MAPA_COR] && ['n', 'ha', 'hrs'].indexOf(MAPA_COR) < 0
        ? '<div class="mo-tip-l"><span class="ponto" style="background:' + MAPA_METRICAS[MAPA_COR].base + '"></span>' +
          G.esc(MAPA_METRICAS[MAPA_COR].rot) + ' <b>' + G.esc(mapaMecFmt(MAPA_COR, MAPA_METRICAS[MAPA_COR].v(t) || 0)) + '</b></div>'
        : '') +
      '<div class="mo-tip-sub">' + G.num(t.n) + (t.n === 1 ? ' atendimento' : ' atendimentos') + '</div>';
  }

  function mapaMecLigarTooltip(svg) {
    // o <title> nativo mostraria só o nome, por cima do nosso balão
    Array.prototype.forEach.call(svg.querySelectorAll('title'), function (t) { t.remove(); });
    function idDe(alvo) {
      var p = alvo && alvo.closest ? alvo.closest('path[data-id]') : null;
      return p ? p.getAttribute('data-id') : '';
    }
    svg.addEventListener('mousemove', function (e) {
      if (!window.MoTooltip) return;
      var id = idDe(e.target);
      if (id) window.MoTooltip.mostrar(mapaMecTooltipHtml(id), e.clientX, e.clientY, true);
      else window.MoTooltip.esconder();
    });
    svg.addEventListener('mouseleave', function () { if (window.MoTooltip) window.MoTooltip.esconder(); });
    svg.addEventListener('focusin', function (e) {
      var id = idDe(e.target);
      if (!id || !window.MoTooltip) return;
      var r = e.target.getBoundingClientRect();
      window.MoTooltip.mostrar(mapaMecTooltipHtml(id), r.left + r.width / 2, r.top + r.height / 2, true);
    });
    svg.addEventListener('focusout', function () { if (window.MoTooltip) window.MoTooltip.esconder(); });
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
      if (MAPA_MEC) mapaMecLigarTooltip(svg);
      if (status) status.hidden = true;
    }
    if (!MAPA_MEC) return;

    var catPorId = {};
    MAPA_TIP = {};
    C.D.forEach(function (r) {
      var id = mapaMecIdPorNome(r.mun);
      if (!id) return;
      var tp = MAPA_TIP[id] || (MAPA_TIP[id] = { ha: 0, hrs: 0, n: 0, mul: 0, ac: 0, dap: 0, dae: 0, nmec: 0, pset: {} });
      tp.n++;
      if (r.sexo === 'Feminino') tp.mul++;
      if (r.dap === 'Sim') tp.dap++;
      tp.ac += r.ac || 0;
      tp.dae += r.dae || 0;
      if (r.pc === MEC) tp.nmec++;
      if (r.prod) tp.pset[chaveProdutor(r)] = true;
      if (r.pc === MEC) tp.ha += r.ha || 0;
      else if (r.pc === ACU) tp.hrs += r.hrs || 0;
      var atual = catPorId[id] || 'none';
      var este = r.pc === MEC ? 'mec' : r.pc === ACU ? 'acu' : 'none';
      catPorId[id] = atual === 'none' ? este : atual === este ? atual : 'both';
    });
    Object.keys(MAPA_TIP).forEach(function (id) {
      var t = MAPA_TIP[id];
      t.prod = Object.keys(t.pset).length;
      t.pmul = t.n ? t.mul / t.n * 100 : 0;
      t.media = t.nmec ? t.ha / t.nmec : 0;
    });
    mapaMecDesenharModo();
    if (MAPA_COR === 'tipo') {
      mapaMecPintarServico(catPorId);
    } else {
      mapaMecPintarEscala();
    }
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
    if (window.PAINEL_PRODUTORES_DESENHAR) window.PAINEL_PRODUTORES_DESENHAR(C);   // recorrência e retorno
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
      { rot: 'CAF informada', val: C.pct(comDap, D.length), cls: 'texto',
        sub: G.num(D.length - comDap) + ' sem resposta sobre CAF' },
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
  function somarDias(iso, n) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  /** Segunda-feira da semana de uma data ISO (a semana vai de segunda a domingo). */
  function segundaDaSemana(iso) { return somarDias(iso, -((diaSemana(iso) + 6) % 7)); }
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
    var semanas = new Map();   // segunda 'YYYY-MM-DD' -> { n, dias, alim }
    var ultimo = '';

    C.D.forEach(function (r) {
      if (!r.d) return;
      var quem = r.alim || NI, onde = r.mun || NI, ym = r.d.slice(0, 7);

      var seg = segundaDaSemana(r.d);
      var sem = semanas.get(seg);
      if (!sem) semanas.set(seg, sem = { n: 0, dias: new Set(), alim: new Map() });
      sem.n++;
      sem.dias.add(r.d);
      sem.alim.set(quem, (sem.alim.get(quem) || 0) + 1);

      var dia = dias.get(r.d);
      if (!dia) dias.set(r.d, dia = { n: 0, alim: new Map(), mun: new Map(), registros: [] });
      dia.n++;
      dia.alim.set(quem, (dia.alim.get(quem) || 0) + 1);
      dia.mun.set(onde, (dia.mun.get(onde) || 0) + 1);
      dia.registros.push(r);

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
        vari: variacao(d.n, i ? dias.get(todos[i - 1]).n : null),
        registros: d.registros
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

    // semanas de segunda a domingo; a semana que cruza dois meses fica inteira
    // na segunda-feira que a abre
    var semanasOrd = Array.from(semanas.keys()).sort().map(function (seg, i, todas) {
      var s = semanas.get(seg), top = maisFrequente(s.alim);
      return {
        ini: seg, fim: somarDias(seg, 6), n: s.n, dias: s.dias.size,
        inseridores: s.alim.size, alim: top.rot,
        part: s.n ? top.val / s.n * 100 : 0,
        vari: variacao(s.n, i ? semanas.get(todas[i - 1]).n : null)
      };
    });

    C._ins = {
      dias: diasOrd, pessoas: pessoasOrd, meses: mesesOrd, mesesChave: mesesChave,
      semanas: semanasOrd,
      rotulosSemana: semanasOrd.map(function (s) {
        return s.ini.slice(8) + '/' + s.ini.slice(5, 7) + (multiAno ? '/' + s.ini.slice(2, 4) : '');
      }),
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
      { rot: 'Inseridores', val: G.num(I.pessoas.length) },
      { rot: 'Lançamentos por inseridor', val: G.num(I.pessoas.length ? I.total / I.pessoas.length : 0, 1) },

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
        return '<tr class="cal-link" data-cal-t="pessoa" data-cal-k="' + G.esc(p.rot) + '"><td class="num">' + (i + 1) + '</td><td class="forte">' + G.esc(p.rot) + '</td>' +
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
  // 'YYYY-MM' do mês aberto no gráfico "Lançamentos por dia", ou null para
  // a visão agrupada por mês (e por ano, no rótulo, quando há mais de um
  // exercício). Clicar numa coluna do agrupado abre o mês; o link "voltar"
  // (ou clicar de novo) fecha e volta para o agrupado.
  var insDiaFocoMes = null;
  // ISO ('YYYY-MM-DD') do dia aberto na tabela "Dia a dia", mostrando os
  // lançamentos daquele dia em vez da lista de dias. Só faz sentido com um
  // mês já aberto (insDiaFocoMes).
  var insDiaFocoDia = null;

  function tituloPainelDe(id, h2, sub) {
    var div = el(id);
    var cab = div && div.closest('.painel').querySelector('.painel-cab-tit');
    if (!cab) return;
    if (h2 != null) cab.querySelector('h2').textContent = h2;
    var p = cab.querySelector('.sub');
    if (p && sub != null) p.innerHTML = sub;
  }

  function abaInsDia(C) {
    var I = insercoes(C);
    var ultimoDia = I.dias[I.dias.length - 1];
    var maiorSeq = sequenciaUteis(I.dias);

    tiles('kpisInsDia', [
      { _sec: 'Ritmo diário' },
      { rot: 'Dias com inserção', val: G.num(I.dias.length) },
      { rot: 'Lançamentos por dia ativo', val: G.num(I.dias.length ? I.total / I.dias.length : 0, 1) },
      { rot: 'Maior sequência de dias úteis', val: G.num(maiorSeq), sub: 'dias úteis seguidos com inserção' },

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

    pintarGraficoInsDia(I);

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

  /** Gráfico "Lançamentos por dia": agrupado por mês (e por ano, no rótulo,
      quando há mais de um exercício na seleção) — um dia a dia direto teria
      colunas demais pra ler. Clicar num mês abre o dia a dia daquele mês;
      clicar de novo (ou no link "voltar") fecha e volta pro agrupado. */
  function pintarGraficoInsDia(I) {
    // o mês aberto pode ter saído da seleção atual (filtro mudou): aí volta pro agrupado
    if (insDiaFocoMes && I.mesesChave.indexOf(insDiaFocoMes) < 0) insDiaFocoMes = null;

    if (!insDiaFocoMes) {
      insDiaFocoDia = null;
      tituloPainelDe('gInsDiaSerie', 'Lançamentos por mês',
        'Só os dias que tiveram inserção aparecem no gráfico. Clique num mês para ver os dias dele.');
      var rotParaYm = {};
      I.meses.forEach(function (m, i) { rotParaYm[I.rotulosMes[i]] = m.ym; });
      pintarSerie('gInsDiaSerie', I.rotulosMes,
        [{ nome: 'Lançamentos', slot: 0, valores: I.meses.map(function (m) { return m.n; }) }],
        { aoClicar: function (rot) {
          if (!rotParaYm[rot]) return;
          insDiaFocoMes = rotParaYm[rot];
          if (CTX) abaInsDia(CTX);
        } });
      return;
    }

    var diasDoMes = I.dias.filter(function (d) { return d.iso.slice(0, 7) === insDiaFocoMes; });
    var rotuloMes = mesLongo(insDiaFocoMes) + (I.multiAno ? ' de ' + insDiaFocoMes.slice(0, 4) : '');
    tituloPainelDe('gInsDiaSerie', 'Lançamentos em ' + rotuloMes,
      '<button type="button" class="painel-link" id="insDiaVoltar">&larr; voltar para os meses</button>' +
      ' · clique num dia abaixo (ou na tabela) para ver os lançamentos dele.');
    var rotParaIso = {};
    diasDoMes.forEach(function (d) { rotParaIso[I.rotuloDia(d.iso)] = d.iso; });
    pintarSerie('gInsDiaSerie', diasDoMes.map(function (d) { return I.rotuloDia(d.iso); }),
      [{ nome: 'Lançamentos', slot: 0, valores: diasDoMes.map(function (d) { return d.n; }) }],
      { aoClicar: function (rot) {
        var iso = rotParaIso[rot];
        if (!iso) return;
        insDiaFocoDia = insDiaFocoDia === iso ? null : iso;
        tabelaInsDia(I);
        // o resultado aparece no painel "Dia a dia", mais abaixo — sem isso
        // quem clica numa linha do topo não percebe que algo mudou
        mostrarResultadoInsDia();
      } });
    var voltar = el('insDiaVoltar');
    if (voltar) voltar.addEventListener('click', function () { insDiaFocoMes = null; if (CTX) abaInsDia(CTX); });
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
    if (insDiaFocoDia) return tabelaInsDiaRegistros(I);
    var busca = buscaDia.toLowerCase();
    var linhas = I.dias.slice().reverse().filter(function (d) {
      if (insDiaFocoMes && d.iso.slice(0, 7) !== insDiaFocoMes) return false;
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
        return '<tr class="ins-dia-lin' + (pico ? ' destaque-linha' : '') + '" data-iso="' + d.iso + '" tabindex="0">' +
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
      (busca ? ' na busca' : '') + ' · o dia de pico aparece destacado. Clique num dia pra ver os lançamentos.</p>';
    ligarCliqueDiasInsDia(I);
  }

  /** Rola até o painel "Dia a dia" e pisca a borda — quem clica num dia lá em
      cima (no gráfico ou na sua tabela) precisa perceber que o resultado
      apareceu aqui embaixo, fora da vista no primeiro clique. */
  function mostrarResultadoInsDia() {
    var painel = el('tInsDia') && el('tInsDia').closest('.painel');
    if (!painel) return;
    painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    painel.classList.remove('painel-piscar');
    void painel.offsetWidth;   // reinicia a animação se já tinha piscado antes
    painel.classList.add('painel-piscar');
    setTimeout(function () { painel.classList.remove('painel-piscar'); }, 1200);
  }

  /** Clicar numa linha do "Dia a dia" abre os lançamentos daquele dia — mesmo
      destino de clicar na coluna do dia no gráfico, só que direto da tabela. */
  function ligarCliqueDiasInsDia(I) {
    var host = el('tInsDia');
    if (!host) return;
    var abrir = function (iso) {
      insDiaFocoDia = insDiaFocoDia === iso ? null : iso;
      tabelaInsDia(I);
    };
    host.querySelectorAll('tr[data-iso]').forEach(function (tr) {
      tr.addEventListener('click', function () { abrir(tr.getAttribute('data-iso')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        abrir(tr.getAttribute('data-iso'));
      });
    });
  }

  /** Lançamentos individuais do dia aberto (insDiaFocoDia), no lugar da lista
      de dias — "voltar" fecha e devolve a lista. */
  function tabelaInsDiaRegistros(I) {
    var dia = I.dias.filter(function (d) { return d.iso === insDiaFocoDia; })[0];
    if (!dia || !dia.registros || !dia.registros.length) {
      insDiaFocoDia = null;
      return tabelaInsDia(I);
    }
    var linhas = dia.registros;
    el('tInsDia').innerHTML =
      '<p class="nota"><button type="button" class="painel-link" id="insDiaRegVoltar">&larr; voltar para os dias</button></p>' +
      '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>Serviço</th><th>Produtor</th><th>Município</th><th>Escritório</th><th>Técnico</th><th>Detalhe</th>' +
      '</tr></thead><tbody>' +
      linhas.map(function (r) {
        var det = r.pc === MEC ? (r.ha ? G.num(r.ha, 1) + ' ha' : '—')
          : r.pc === ACU ? (r.hrs ? G.num(r.hrs, 1) + ' h' : '—') : '—';
        return '<tr><td><span class="tag ' + tagServico(r.pc) + '">' + G.esc(r.pc || '—') + '</span></td>' +
          '<td class="forte">' + G.esc(r.prod || '—') + '</td>' +
          '<td>' + G.esc(r.mun || '—') + '</td>' +
          '<td>' + G.esc(r.esc || '—') + '</td>' +
          '<td>' + G.esc(r.rt || '—') + '</td>' +
          '<td class="num">' + det + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="nota">' + G.num(linhas.length) + ' lançamento(s) em ' + dataBR(insDiaFocoDia) + '.</p>';
    var voltar = el('insDiaRegVoltar');
    if (voltar) voltar.addEventListener('click', function () { insDiaFocoDia = null; tabelaInsDia(I); });
  }

  /* ---------------------------------------------- ABA: INSERÇÕES POR MÊS */
  function abaInsMes(C) {
    var I = insercoes(C);
    var ultimoMes = I.meses[I.meses.length - 1];
    var diasCom = I.meses.reduce(function (a, m) { return a + m.com.length; }, 0);

    tiles('kpisInsMes', [
      { _sec: 'Volume mensal' },
      { rot: 'Meses com inserção', val: G.num(I.meses.length) },
      { rot: 'Média por mês', val: G.num(I.meses.length ? I.total / I.meses.length : 0, 1) },
      { rot: 'Dias úteis com inserção', val: G.num(diasCom) },
      { rot: 'Dias úteis sem inserção', val: G.num(I.semInsercao), sub: 'sábados e domingos não contam' },

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
        sub: 'sobre o mês anterior' }
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
        return '<tr class="cal-link" data-cal-t="mes" data-cal-k="' + m.ym + '"><td class="num">' + m.ano + '</td><td class="forte">' + mesLongo(m.ym) + '</td>' +
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

  /* --------------------------------------------- INSERÇÕES POR SEMANA */
  function abaInsSemana(C) {
    var I = insercoes(C);
    var S = I.semanas;
    var ultima = S[S.length - 1];
    var pico = S.reduce(function (a, s) { return !a || s.n > a.n ? s : a; }, null);
    var faixa = function (s) { return dataBR(s.ini) + ' a ' + dataBR(s.fim); };

    tiles('kpisInsSemana', [
      { _sec: 'Volume semanal (segunda a domingo)' },
      { rot: 'Semanas com inserção', val: G.num(S.length) },
      { rot: 'Média por semana', val: G.num(S.length ? I.total / S.length : 0, 1) },
      { rot: 'Semana de pico', val: pico ? dataBR(pico.ini) : '—', cls: 'texto',
        sub: pico ? G.num(pico.n) + ' lançamentos' : '' },
      { rot: 'Última semana', val: ultima ? dataBR(ultima.ini) : '—', cls: 'texto',
        sub: ultima ? G.num(ultima.n) + ' lançamentos · ' + faixa(ultima) : '' }
    ]);

    pintarSerie('gInsSemanaSerie', I.rotulosSemana,
      [{ nome: 'Lançamentos', slot: 0, valores: S.map(function (s) { return s.n; }) }]);

    // uma série por inseridor do topo, como no gráfico por mês
    var porPessoa = I.pessoas.slice(0, 5).map(function (p, i) {
      var k = {};
      I.dias.forEach(function (d) {
        d.registros.forEach(function (r) {
          if ((r.alim || NI) !== p.rot) return;
          var seg = segundaDaSemana(d.iso);
          k[seg] = (k[seg] || 0) + 1;
        });
      });
      return { nome: p.rot, slot: i, valores: S.map(function (s) { return k[s.ini] || null; }) };
    });
    pintarSerie('gInsSemanaPessoa', I.rotulosSemana, porPessoa);

    if (!el('tInsSemana')) return;
    if (!S.length) return G.vazio(el('tInsSemana'));
    el('tInsSemana').innerHTML = '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th>Semana</th><th>Lançamentos</th><th>Variação</th><th>Dias com inserção</th>' +
      '<th>Inseridores</th><th>Inseridor que mais lançou</th><th>Participação</th>' +
      '</tr></thead><tbody>' +
      S.slice().reverse().map(function (s) {
        return '<tr class="cal-link' + (pico && s.ini === pico.ini ? ' destaque-linha' : '') + '" data-cal-t="semana" data-cal-k="' + s.ini + '">' +
          '<td class="forte">' + faixa(s) + '</td><td class="num">' + G.num(s.n) + '</td>' +
          celVariacao(s.vari) +
          '<td class="num">' + G.num(s.dias) + '</td><td class="num">' + G.num(s.inseridores) + '</td>' +
          '<td>' + G.esc(s.alim || '—') + '</td><td class="num">' + G.num(s.part, 0) + '%</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ----------------------------------------------- CALENDÁRIOS DE INSERÇÃO
     Um mesmo desenho de mês, em quatro leituras: por dia (quem inseriu em
     cada dia), por semana (coluna com o total e os nomes da semana), por
     mês (cartões-resumo) e por pessoa (só os dias de uma pessoa).
     Verde = teve inserção (mais escuro = mais lançamentos); vermelho = dia
     útil sem inserção; cinza = sábado/domingo; vazio = depois do último
     lançamento. */
  var calPessoa = '';

  /** Quem inseriu em cada dia: iso -> Map(nome -> n). Guardado no agregado. */
  /** Inserção fora do expediente: antes das 7h ou a partir das 18h (hora de Rio Branco). */
  function foraDoHorario(r) { return !!r.h && (r.h < '07:00' || r.h >= '18:00'); }

  /** dia -> pessoa -> quantas inserções fora do expediente */
  function foraPorDia(I) {
    if (I._fora) return I._fora;
    var m = new Map();
    I.dias.forEach(function (d) {
      var q = new Map();
      d.registros.forEach(function (r) {
        if (!foraDoHorario(r)) return;
        var k = r.alim || NI;
        q.set(k, (q.get(k) || 0) + 1);
      });
      if (q.size) m.set(d.iso, q);
    });
    I._fora = m;
    return m;
  }

  function quemPorDia(I) {
    if (I._quem) return I._quem;
    var m = new Map();
    I.dias.forEach(function (d) {
      var q = new Map();
      d.registros.forEach(function (r) {
        var k = r.alim || NI;
        q.set(k, (q.get(k) || 0) + 1);
      });
      m.set(d.iso, q);
    });
    I._quem = m;
    return m;
  }

  /* Sigla de cada inseridor: iniciais do primeiro e do último nome ("Rosilene
     Cavalcante" -> RC). Repetida entre duas pessoas, ganha a inicial do meio
     ou um número, para a sigla nunca apontar para duas pessoas. */
  var SIG = {};
  function montarSiglas(I) {
    var usadas = {};
    SIG = {};
    I.pessoas.forEach(function (p) {
      var ps = String(p.rot).split(/[\s@._-]+/).filter(function (w) {
        return w && !/^(de|da|do|das|dos|e)$/i.test(w);
      });
      var sg;
      if (ps.length >= 2) sg = ps[0][0] + ps[ps.length - 1][0];
      else sg = (ps[0] || '?').slice(0, 2);
      sg = sg.toUpperCase();
      if (usadas[sg] && ps.length > 2) sg = (ps[0][0] + ps[1][0] + ps[ps.length - 1][0]).toUpperCase();
      var base = sg, i = 2;
      while (usadas[sg]) sg = base + (i++);
      usadas[sg] = true;
      SIG[p.rot] = sg;
    });
  }
  function sigla(n) { return SIG[n] || String(n).slice(0, 2).toUpperCase(); }

  /** Lista "Ana 3, Bia 1" ordenada por quantidade (curta: só 2 primeiros nomes). */
  function listaQuem(q, curto) {
    var arr = Array.from(q, function (e) { return { n: e[0], v: e[1] }; })
      .sort(function (a, b) { return b.v - a.v || a.n.localeCompare(b.n, 'pt-BR'); });
    if (!curto) return arr.map(function (e) { return e.n + ' (' + e.v + ')'; }).join(', ');
    var t = arr.slice(0, 3).map(function (e) { return sigla(e.n); }).join(' ');
    return t + (arr.length > 3 ? ' +' + (arr.length - 3) : '');
  }

  /** Meses contínuos do primeiro ao último lançamento (inclusive os vazios). */
  function mesesDoCalendario(I) {
    if (!I.dias.length) return [];
    var fim = I.ultimo.slice(0, 7), out = [], ym = I.dias[0].iso.slice(0, 7);
    while (ym <= fim && out.length < 60) {
      out.push(ym);
      var a = +ym.slice(0, 4), m = +ym.slice(5, 7) + 1;
      if (m > 12) { m = 1; a++; }
      ym = a + '-' + iso2(m);
    }
    return out;
  }

  /** Grade de um mês. opc.pessoa: só os dias dessa pessoa; opc.semana: coluna
      com o resumo de cada semana. */
  function htmlMesCalendario(ym, I, opc) {
    var quem = quemPorDia(I), fora = foraPorDia(I), ano = +ym.slice(0, 4), mes = +ym.slice(5, 7);
    var nDias = diasNoMes(ano, mes), pessoa = opc.pessoa || '';
    var max = I._calMax || 1;
    var offset = (diaSemana(ym + '-01') + 6) % 7;   // a semana começa na segunda
    var cab = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    var h = '<div class="cal-mes"><h4 class="cal-link" data-cal-t="mes" data-cal-k="' + ym + '"' +
      (pessoa ? ' data-cal-p="' + G.esc(pessoa) + '"' : '') + '>' + mesLongo(ym) + ' de ' + ano + '</h4>' +
      '<div class="cal-grade' + (opc.semana ? ' cal-com-semana' : '') + '">' +
      cab.map(function (c) { return '<span class="cal-cab">' + c + '</span>'; }).join('') +
      (opc.semana ? '<span class="cal-cab">Semana</span>' : '');
    var col = 0, semN = 0, semQ = new Map(), semDias = 0;
    var fechaSemana = function (isoFim) {
      if (!opc.semana) return '';
      var t = semN
        ? '<b>' + G.num(semN) + '</b><small>' + G.esc(listaQuem(semQ, true)) + '</small>'
        : (semDias ? '<small class="cal-nada">sem inserção</small>' : '');
      var r = '<span class="cal-sem-res' + (semN ? ' cal-ok cal-link' : '') + '" data-cal-t="semana" data-cal-k="' +
        segundaDaSemana(isoFim) + '"' + (pessoa ? ' data-cal-p="' + G.esc(pessoa) + '"' : '') + '>' + t + '</span>';
      semN = 0; semQ = new Map(); semDias = 0;
      return r;
    };
    for (var v = 0; v < offset; v++) { h += '<span class="cal-dia cal-fora"></span>'; col++; }
    for (var d = 1; d <= nDias; d++) {
      var iso = ym + '-' + iso2(d), q = quem.get(iso), fds = fimDeSemana(iso), futuro = iso > I.ultimo;
      var n = 0, mostra = null;
      if (q) {
        if (pessoa) { n = q.get(pessoa) || 0; mostra = n ? new Map([[pessoa, n]]) : null; }
        else { q.forEach(function (x) { n += x; }); mostra = q; }
      }
      var cls = 'cal-dia', attr = '', conteudo = '<i>' + d + '</i>';
      var pAttr = pessoa ? ' data-cal-p="' + G.esc(pessoa) + '"' : '';
      if (n) {
        var nivel = Math.max(1, Math.min(4, Math.ceil(n / max * 4)));
        cls += ' cal-ok cal-n' + nivel;
        conteudo += '<b>' + G.num(n) + '</b>' + (pessoa ? '<small>' + G.esc(sigla(pessoa)) + '</small>'
          : '<small>' + G.esc(listaQuem(mostra, true)) + '</small>');
        attr = ' data-cal-t="dia" data-cal-k="' + iso + '"' + pAttr; cls += ' cal-link';
        // marcas: lançado no fim de semana e/ou fora do expediente (antes das 7h ou depois das 18h)
        var nf = 0, fq = fora.get(iso);
        if (fq) { if (pessoa) nf = fq.get(pessoa) || 0; else fq.forEach(function (x) { nf += x; }); }
        var marcas = '';
        if (fds) { marcas += '<em class="cal-mk cal-mk-fds" title="Lançado no fim de semana">FS</em>'; cls += ' cal-fds-ins'; }
        if (nf) marcas += '<em class="cal-mk cal-mk-noite" title="' + nf + ' inserção(ões) antes das 7h ou depois das 18h">&#9790;' + nf + '</em>';
        if (marcas) conteudo += '<span class="cal-marcas">' + marcas + '</span>';
        semN += n;
        mostra.forEach(function (x, k) { semQ.set(k, (semQ.get(k) || 0) + x); });
      } else if (futuro) {
        cls += ' cal-fora';
      } else if (fds) {
        cls += ' cal-fds'; attr = ' data-cal-t="vazio" data-cal-k="' + iso + '" data-cal-m="fds"' + pAttr;
      } else {
        cls += ' cal-sem'; attr = ' data-cal-t="vazio" data-cal-k="' + iso + '"' + pAttr;
        conteudo += '<small>—</small>';
      }
      if (!fds && !futuro) semDias++;
      h += '<span class="' + cls + '"' + attr + '>' + conteudo + '</span>';
      col++;
      if (col % 7 === 0) h += fechaSemana(iso);
    }
    if (col % 7) {
      while (col % 7) { h += '<span class="cal-dia cal-fora"></span>'; col++; }
      h += fechaSemana(ym + '-' + iso2(nDias));
    }
    return h + '</div></div>';
  }

  function legendaCalendario() {
    return '<p class="cal-leg"><span><span class="cal-chip cal-ok cal-n3"></span>teve inserção</span>' +
      '<span><span class="cal-chip cal-sem"></span>dia útil sem inserção</span>' +
      '<span><span class="cal-chip cal-fds"></span>fim de semana</span>' +
      '<span><em class="cal-mk cal-mk-fds">FS</em>lançado no fim de semana</span>' +
      '<span><em class="cal-mk cal-mk-noite">&#9790;</em>fora do expediente (antes das 7h ou depois das 18h)</span></p>';
  }

  function pintarCalendarios(I) {
    var meses = mesesDoCalendario(I);
    if (!meses.length) {
      ['gCalDia', 'gCalSemana', 'gCalMes', 'gCalPessoa'].forEach(function (id) {
        if (el(id)) G.vazio(el(id));
      });
      return;
    }
    var quem = quemPorDia(I);
    // intensidade relativa ao maior dia (ou ao maior dia da pessoa escolhida)
    var maxDia = I.dias.reduce(function (a, d) { return Math.max(a, d.n); }, 1);
    /* Mais de um exercício na seleção: os meses se separam por ano, cada ano
       com o seu título — senão janeiro de 2025 e de 2026 ficam lado a lado. */
    var porAno = function (classe, fn, opc) {
      var anos = [];
      meses.forEach(function (ym) {
        var a = ym.slice(0, 4);
        if (!anos.length || anos[anos.length - 1].ano !== a) anos.push({ ano: a, ms: [] });
        anos[anos.length - 1].ms.push(ym);
      });
      return anos.map(function (g) {
        var corpo = '<div class="' + classe + '">' + g.ms.map(fn).join('') + '</div>';
        if (anos.length < 2) return corpo;
        var n = 0;
        g.ms.forEach(function (ym) { n += (I.meses.filter(function (m) { return m.ym === ym; })[0] || { n: 0 }).n; });
        return '<h3 class="cal-ano cal-link" data-cal-t="ano" data-cal-k="' + g.ano + '"' +
          (opc && opc.pessoa ? ' data-cal-p="' + G.esc(opc.pessoa) + '"' : '') + '>' + g.ano +
          ' <small>' + G.num(n) + ' lançamentos · ver detalhes</small></h3>' + corpo;
      }).join('');
    };
    var grade = function (opc) {
      return legendaCalendario() + porAno('cal-meses', function (ym) { return htmlMesCalendario(ym, I, opc); }, opc);
    };

    montarSiglas(I);
    I._calMax = maxDia;
    if (el('gCalDia')) el('gCalDia').innerHTML = grade({});
    if (el('gCalSemana')) el('gCalSemana').innerHTML = grade({ semana: true });

    if (el('gCalMes')) {
      I._calMax = maxDia;
      var maxMes = I.meses.reduce(function (a, m) { return Math.max(a, m.n); }, 1);
      var porMes = new Map(I.meses.map(function (m) { return [m.ym, m]; }));
      el('gCalMes').innerHTML = legendaCalendario() + porAno('cal-resumo', function (ym) {
        var m = porMes.get(ym), q = new Map(), nome = mesLongo(ym) + ' ' + ym.slice(0, 4);
        if (!m) return '<div class="cal-card cal-sem"><h4>' + nome + '</h4><p class="cal-nada">Nenhuma inserção</p></div>';
        I.dias.forEach(function (d) {
          if (d.iso.slice(0, 7) !== ym) return;
          quem.get(d.iso).forEach(function (v, k) { q.set(k, (q.get(k) || 0) + v); });
        });
        var nivel = Math.max(1, Math.min(4, Math.ceil(m.n / maxMes * 4)));
        var top = Array.from(q, function (e) { return { n: e[0], v: e[1] }; })
          .sort(function (a, b) { return b.v - a.v; });
        return '<div class="cal-card cal-ok cal-n' + nivel + '"><h4 class="cal-link" data-cal-t="mes" data-cal-k="' + ym + '">' + nome + ' &rsaquo;</h4>' +
          '<p><b>' + G.num(m.n) + '</b> lançamentos</p>' +
          '<p class="cal-sub">' + G.num(m.com.length) + ' dias com inserção · ' +
          G.num(m.sem.length) + ' dias úteis sem</p><ul>' +
          top.slice(0, 4).map(function (t) {
            return '<li><span class="cal-sig">' + G.esc(sigla(t.n)) + '</span> ' + G.esc(t.n) + ' <b>' + G.num(t.v) + '</b></li>';
          }).join('') +
          (top.length > 4 ? '<li class="cal-sub">+ ' + (top.length - 4) + ' lançador(es)</li>' : '') +
          '</ul>' + htmlMesCalendario(ym, I, {}) + '</div>';
      });
    }

    if (el('gCalPessoa')) {
      var nomes = I.pessoas.map(function (p) { return p.rot; });
      if (nomes.indexOf(calPessoa) < 0) calPessoa = '';   // por padrão, todos os lançadores juntos
      var meu = I.pessoas.filter(function (p) { return p.rot === calPessoa; })[0];
      var maxP = 1;
      I.dias.forEach(function (d) { maxP = Math.max(maxP, calPessoa ? (quem.get(d.iso).get(calPessoa) || 0) : d.n); });
      I._calMax = maxP;
      el('gCalPessoa').innerHTML =
        '<div class="tf-bar"><label class="tf-campo">Lançador <select id="calPessoaSel">' +
        '<option value=""' + (calPessoa ? '' : ' selected') + '>Todos os lançadores</option>' +
        nomes.map(function (n) {
          return '<option value="' + G.esc(n) + '"' + (n === calPessoa ? ' selected' : '') + '>' + G.esc(sigla(n)) + ' — ' + G.esc(n) + '</option>';
        }).join('') + '</select></label>' +
        '<span class="tf-cont">' + (meu ? G.num(meu.n) + ' lançamentos em ' + G.num(meu.dias) + ' dias' : G.num(I.total) + ' lançamentos de ' + G.num(nomes.length) + ' lançadores') +
        '</span>' + (meu ? '<button type="button" class="tf-dir cal-link" data-cal-t="pessoa" data-cal-k="' +
          G.esc(calPessoa) + '">Ver tudo de ' + G.esc(sigla(calPessoa)) + ' &rsaquo;</button>' : '') +
        '</div>' + grade(calPessoa ? { pessoa: calPessoa } : {});
      I._calMax = maxDia;
      var sel = el('calPessoaSel');
      if (sel) sel.addEventListener('change', function () { calPessoa = sel.value; pintarCalendarios(I); });
    }
  }

  /* ------------------------------------- POPUP E DETALHE DOS CALENDÁRIOS
     Passar o mouse numa data, semana, mês, ano ou pessoa abre um resumo;
     clicar abre uma janela com os lançamentos, que podem ser agrupados por
     dia, semana, mês, pessoa, município, serviço ou escritório (dois níveis). */
  /** g = 'mun|Rio Branco' (data-cal-g): restringe os lançamentos a um município, escritório, serviço ou técnico */
  function grupoDe(g) {
    var i = (g || '').indexOf('|');
    return i < 0 ? null : { dim: g.slice(0, i), v: g.slice(i + 1) };
  }
  function predGrupo(g) {
    var o = grupoDe(g);
    if (!o || !CAL_AGRUPAR[o.dim]) return null;
    return function (r) { return CAL_AGRUPAR[o.dim].chave(r) === o.v; };
  }

  function registrosDe(I, t, k, p, g) {
    var out = [], pg = predGrupo(g);
    I.dias.forEach(function (d) {
      var ok = t === 'dia' ? d.iso === k
        : t === 'semana' ? segundaDaSemana(d.iso) === k
        : t === 'mes' ? d.iso.slice(0, 7) === k
        : t === 'ano' ? d.iso.slice(0, 4) === k
        : t === 'pessoa';
      if (!ok) return;
      d.registros.forEach(function (r) {
        var quem = r.alim || NI;
        if (pg && !pg(r)) return;
        if (t === 'pessoa' ? quem === k : (!p || quem === p)) out.push(r);
      });
    });
    return out;
  }

  function tituloDe(t, k, p, g) {
    var sufixo = p && t !== 'pessoa' ? ' — ' + p : '';
    if (grupoDe(g) && t !== 'pessoa') sufixo += ' — ' + grupoDe(g).v;
    if (t === 'dia') return DIAS_SEMANA[diaSemana(k)] + ', ' + dataBR(k) + sufixo;
    if (t === 'semana') return 'Semana de ' + dataBR(k) + ' a ' + dataBR(somarDias(k, 6)) + sufixo;
    if (t === 'mes') return mesLongo(k) + ' de ' + k.slice(0, 4) + sufixo;
    if (t === 'ano') return 'Ano ' + k + sufixo;
    if (t === 'pessoa') return k;
    if (t === 'vazio') return dataBR(k) + sufixo;
    return '';
  }

  function contarPor(regs, f) {
    var m = new Map();
    regs.forEach(function (r) { var c = f(r); m.set(c, (m.get(c) || 0) + 1); });
    return Array.from(m, function (e) { return { n: e[0], v: e[1] }; })
      .sort(function (a, b) { return b.v - a.v || a.n.localeCompare(b.n, 'pt-BR'); });
  }

  var CAL_POP = null;
  function popCalendario(alvo, e) {
    if (!CTX) return;
    var I = insercoes(CTX);
    var t = alvo.getAttribute('data-cal-t'), k = alvo.getAttribute('data-cal-k'),
        p = alvo.getAttribute('data-cal-p') || '', g = alvo.getAttribute('data-cal-g') || '';
    if (!CAL_POP) {
      CAL_POP = document.createElement('div');
      CAL_POP.className = 'cal-pop';
      CAL_POP.setAttribute('role', 'tooltip');
      document.body.appendChild(CAL_POP);
    }
    var h;
    if (t === 'vazio') {
      var fds = alvo.getAttribute('data-cal-m') === 'fds';
      h = '<h5>' + G.esc(tituloDe('vazio', k, p, g)) + '</h5><p>' +
        (fds ? 'Fim de semana' : 'Dia útil <b>sem inserção</b>') + (p ? ' de ' + G.esc(p) : '') + '.</p>';
    } else {
      var regs = registrosDe(I, t, k, p, g);
      var dias = new Set(regs.map(function (r) { return r.d; }));
      var pess = contarPor(regs, function (r) { return r.alim || NI; });
      var serv = contarPor(regs, function (r) { return r.pc || 'Sem serviço'; });
      var mun = contarPor(regs, function (r) { return r.mun || NI; });
      h = '<h5>' + G.esc(tituloDe(t, k, p, g)) + '</h5>' +
        '<p><b>' + G.num(regs.length) + '</b> lançamentos em <b>' + G.num(dias.size) + '</b> dia(s)</p>' +
        (t === 'pessoa' ? '' : '<p class="cal-pop-t">Quem inseriu</p><ul>' + pess.slice(0, 6).map(function (x) {
          return '<li><span class="cal-sig">' + G.esc(sigla(x.n)) + '</span> ' + G.esc(x.n) + ' <b>' + G.num(x.v) + '</b></li>';
        }).join('') + (pess.length > 6 ? '<li>+ ' + (pess.length - 6) + ' lançador(es)</li>' : '') + '</ul>') +
        '<p class="cal-pop-t">Serviço</p><p>' + serv.map(function (x) {
          return G.esc(x.n) + ' <b>' + G.num(x.v) + '</b>';
        }).join(' · ') + '</p>' +
        '<p class="cal-pop-t">Municípios</p><p>' + mun.slice(0, 3).map(function (x) {
          return G.esc(x.n) + ' <b>' + G.num(x.v) + '</b>';
        }).join(' · ') + (mun.length > 3 ? ' · +' + (mun.length - 3) : '') + '</p>' +
        '<p class="cal-pop-dica">Clique para ver os lançamentos</p>';
    }
    CAL_POP.innerHTML = h;
    CAL_POP.style.display = 'block';
    var w = CAL_POP.offsetWidth, hh = CAL_POP.offsetHeight;
    var x = Math.min(e.clientX + 14, window.innerWidth - w - 8);
    var y = e.clientY + 16 + hh > window.innerHeight ? e.clientY - hh - 12 : e.clientY + 16;
    CAL_POP.style.left = Math.max(8, x) + 'px';
    CAL_POP.style.top = Math.max(8, y) + 'px';
  }
  function fecharPopCalendario() { if (CAL_POP) CAL_POP.style.display = 'none'; }

  var CAL_AGRUPAR = {
    dia: { rot: 'Dia', chave: function (r) { return r.d; },
      nome: function (k) { return DIAS_SEMANA[diaSemana(k)] + ', ' + dataBR(k); }, ordem: 'asc' },
    semana: { rot: 'Semana', chave: function (r) { return segundaDaSemana(r.d); },
      nome: function (k) { return 'Semana de ' + dataBR(k) + ' a ' + dataBR(somarDias(k, 6)); }, ordem: 'asc' },
    mes: { rot: 'Mês', chave: function (r) { return r.d.slice(0, 7); },
      nome: function (k) { return mesLongo(k) + ' de ' + k.slice(0, 4); }, ordem: 'asc' },
    pessoa: { rot: 'Pessoa', chave: function (r) { return r.alim || NI; },
      nome: function (k) { return k + ' (' + sigla(k) + ')'; }, ordem: 'qtd' },
    mun: { rot: 'Município', chave: function (r) { return r.mun || NI; },
      nome: function (k) { return k; }, ordem: 'qtd' },
    pc: { rot: 'Serviço', chave: function (r) { return r.pc || 'Sem serviço'; },
      nome: function (k) { return k; }, ordem: 'qtd' },
    esc: { rot: 'Escritório', chave: function (r) { return r.esc || NI; },
      nome: function (k) { return k; }, ordem: 'qtd' },
    tec: { rot: 'Técnico', chave: function (r) { return r.rt || NI; },
      nome: function (k) { return k; }, ordem: 'qtd' }
  };
  var CAL_PADRAO = { dia: ['pessoa', 'nada'], semana: ['dia', 'pessoa'], mes: ['dia', 'pessoa'],
    ano: ['mes', 'pessoa'], pessoa: ['mes', 'dia'] };

  function grupos(regs, tipo) {
    var def = CAL_AGRUPAR[tipo], m = new Map();
    regs.forEach(function (r) {
      var k = def.chave(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    var lista = Array.from(m, function (e) { return { k: e[0], regs: e[1] }; });
    lista.sort(def.ordem === 'asc'
      ? function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; }
      : function (a, b) { return b.regs.length - a.regs.length || a.k.localeCompare(b.k, 'pt-BR'); });
    return lista;
  }

  function tabelaRegistrosDetalhe(regs) {
    return '<div class="tabela-scroll"><table class="dados"><thead><tr>' +
      '<th class="num">Nº</th><th>Inserção</th><th>Hora</th><th>Serviço</th><th>Produtor</th><th>Município</th><th>Escritório</th>' +
      '<th>Técnico</th><th>Inseridor</th><th>Detalhe</th></tr></thead><tbody>' +
      regs.map(function (r, i) {
        var det = r.pc === MEC ? (r.ha ? G.num(r.ha, 1) + ' ha' : '—')
          : r.pc === ACU ? (r.hrs ? G.num(r.hrs, 1) + ' h' : '—') : '—';
        var marca = (fimDeSemana(r.d) ? ' <em class="cal-mk cal-mk-fds" title="Fim de semana">FS</em>' : '') +
          (foraDoHorario(r) ? ' <em class="cal-mk cal-mk-noite" title="Fora do expediente">&#9790;</em>' : '');
        return '<tr><td class="num">' + (i + 1) + '</td><td class="num">' + dataBR(r.d) + '</td><td class="num">' + G.esc(r.h || '—') + marca + '</td>' +
          '<td><span class="tag ' + tagServico(r.pc) + '">' + G.esc(r.pc || '—') + '</span></td>' +
          '<td class="forte">' + G.esc(r.prod || '—') + '</td><td>' + G.esc(r.mun || '—') + '</td>' +
          '<td>' + G.esc(r.esc || '—') + '</td><td>' + G.esc(r.rt || '—') + '</td>' +
          '<td><span class="cal-sig">' + G.esc(sigla(r.alim || NI)) + '</span> ' + G.esc(r.alim || NI) + '</td>' +
          '<td class="num">' + det + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /** PDF A4 dos lançamentos abertos na janela de detalhes, no mesmo padrão do
      relatório geral: faixa azul com a seleção, cartões de indicadores,
      tabelas com grade e rodapé paginado. */
  function baixarPdfDetalhe(est) {
    var regs = est.regs;
    if (!regs.length) return Promise.resolve();
    return carregarPdf().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, M = 14, CW = PW - 2 * M;
      var AZUL = [46, 79, 125], CINZA = [107, 120, 133], TINTA = [27, 36, 48];
      var y;
      var ha = soma(regs.filter(function (r) { return r.pc === MEC; }), function (r) { return r.ha; });
      var hrs = soma(regs.filter(function (r) { return r.pc === ACU; }), function (r) { return r.hrs; });
      var dias = new Set(regs.map(function (r) { return r.d; })).size;
      var pess = new Set(regs.map(function (r) { return r.alim || NI; })).size;
      var muns = new Set(regs.map(function (r) { return r.mun || NI; })).size;

      var datas = regs.map(function (r) { return r.d; }).filter(Boolean).sort();
      var linhasCab = [];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      var cab = cabecalhoRelatorio(regs);
      cab.itens.forEach(function (it) {
        linhasCab = linhasCab.concat(doc.splitTextToSize(it[0] + ': ' + it[1], CW));
      });
      linhasCab.push('Inserções de ' + (datas.length ? dataBR(datas[0]) + ' a ' + dataBR(datas[datas.length - 1]) : '—'));
      var agr = CAL_AGRUPAR[est.g1].rot +
        (est.g2 && est.g2 !== 'nada' && est.g2 !== est.g1 ? ' > ' + CAL_AGRUPAR[est.g2].rot : '');
      linhasCab.push('Agrupado por: ' + agr + (est.termo ? '  |  Filtro: "' + est.termo + '"' : ''));
      var altCab = 18 + linhasCab.length * 4.6 + 3;
      doc.setFillColor.apply(doc, AZUL);
      doc.rect(0, 0, PW, altCab, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      doc.text(doc.splitTextToSize('Lançamentos - ' + est.titulo, CW)[0], M, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      linhasCab.forEach(function (l, i) { doc.text(l, M, 19 + i * 4.6); });
      y = altCab + 8;

      var kpis = [['Lançamentos', G.num(regs.length)], ['Dias com inserção', G.num(dias)],
        ['Lançadores', G.num(pess)], ['Municípios', G.num(muns)],
        ['Hectares', G.num(ha, 1) + ' ha'], ['Horas de máquina', G.num(hrs, 1) + ' h']];
      var kw = (CW - 9) / 4, kh = 15;
      kpis.forEach(function (k, i) {
        var x = M + (i % 4) * (kw + 3), yy = y + Math.floor(i / 4) * (kh + 3);
        doc.setFillColor(247, 249, 250); doc.setDrawColor(216, 222, 229); doc.setLineWidth(0.2);
        doc.roundedRect(x, yy, kw, kh, 1.5, 1.5, 'FD');
        doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        doc.text(k[0].toUpperCase(), x + 2.5, yy + 5);
        doc.setTextColor.apply(doc, TINTA); doc.setFontSize(10.5);
        doc.text(String(k[1]), x + 2.5, yy + 11.5, { maxWidth: kw - 4 });
      });
      y += Math.ceil(kpis.length / 4) * (kh + 3) + 6;

      function secao(txt, sub) {
        if (y > 262) { doc.addPage(); y = 18; }
        doc.setTextColor.apply(doc, sub ? TINTA : AZUL);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(sub ? 9.5 : 12);
        doc.text(doc.splitTextToSize(txt, CW)[0], M, y);
        if (!sub) {
          doc.setDrawColor.apply(doc, AZUL); doc.setLineWidth(0.4);
          doc.line(M, y + 1.8, M + CW, y + 1.8);
        }
        y += sub ? 4.5 : 6;
      }
      function tabela(lista) {
        doc.autoTable({
          startY: y, margin: { left: M, right: M, top: 16, bottom: 16 },
          head: [['Nº', 'Inserção', 'Serviço', 'Produtor', 'Município', 'Técnico', 'Inseridor', 'Detalhe']],
          body: lista.map(function (r, i) {
            var det = r.pc === MEC ? (r.ha ? G.num(r.ha, 1) + ' ha' : '-')
              : r.pc === ACU ? (r.hrs ? G.num(r.hrs, 1) + ' h' : '-') : '-';
            return [i + 1, dataBR(r.d), r.pc || '-', r.prod || '-', r.mun || '-', r.rt || '-',
              sigla(r.alim || NI) + ' ' + (r.alim || NI), det];
          }),
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.5, textColor: TINTA,
                    lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak' },
          headStyles: { fillColor: [238, 242, 244], textColor: [74, 85, 97], fontStyle: 'bold', fontSize: 7 },
          alternateRowStyles: { fillColor: [250, 251, 252] },
          columnStyles: { 0: { halign: 'right', cellWidth: 8 }, 7: { halign: 'right' } }
        });
        y = doc.lastAutoTable.finalY + 6;
      }

      grupos(regs, est.g1).forEach(function (g) {
        secao(CAL_AGRUPAR[est.g1].nome(g.k) + '  (' + g.regs.length + ' lançamentos)');
        if (!est.g2 || est.g2 === 'nada' || est.g2 === est.g1) tabela(g.regs);
        else {
          grupos(g.regs, est.g2).forEach(function (g2) {
            secao(CAL_AGRUPAR[est.g2].nome(g2.k) + '  (' + g2.regs.length + ')', true);
            tabela(g2.regs);
          });
        }
      });

      var n = doc.internal.getNumberOfPages();
      var hoje = new Date().toLocaleDateString('pt-BR');
      for (var p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text('Gerado em ' + hoje + ' | Sistema de gestão', M, 289);
        doc.text('Página ' + p + ' de ' + n, PW - M, 289, { align: 'right' });
      }
      doc.save('lancamentos-' + String(est.titulo).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\w-]+/g, '_').toLowerCase() + '.pdf');
    });
  }

  function abrirDetalheCalendario(t, k, p, g) {
    if (!CTX) return;
    var I = insercoes(CTX);
    var regs = registrosDe(I, t, k, p, g);
    if (!regs.length) return;
    var dlg = el('calDetalhe');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'calDetalhe';
      dlg.className = 'cal-det';
      dlg.innerHTML = '<div class="cal-det-cab"><h3></h3>' +
        '<span class="cal-det-acoes"><button type="button" class="tf-dir" data-pdf>Exportar PDF</button>' +
        '<button type="button" class="tf-dir" data-fechar>Fechar &times;</button></span></div>' +
        '<div class="cal-det-kpis"></div>' +
        '<div class="tf-bar cal-det-ctrl">' +
        '<label class="tf-campo">Agrupar por <select data-g="1"></select></label>' +
        '<label class="tf-campo">depois por <select data-g="2"></select></label>' +
        '<input type="search" class="tf-busca" placeholder="Filtrar lançamentos&hellip;" data-q></div>' +
        '<div class="cal-det-corpo"></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg || e.target.closest('[data-fechar]')) { dlg.close(); return; }
        var b = e.target.closest('[data-pdf]');
        if (!b || !dlg._estado) return;
        b.disabled = true;
        var rot = b.textContent;
        b.textContent = 'Gerando PDF…';
        baixarPdfDetalhe(dlg._estado).catch(function (er) {
          alert(er && er.message ? er.message : 'Não foi possível gerar o PDF.');
        }).then(function () { b.disabled = false; b.textContent = rot; });
      });
    }
    var s1 = dlg.querySelector('[data-g="1"]'), s2 = dlg.querySelector('[data-g="2"]'),
        q = dlg.querySelector('[data-q]');
    var chaves = Object.keys(CAL_AGRUPAR);
    var ops = chaves.map(function (o) { return '<option value="' + o + '">' + CAL_AGRUPAR[o].rot + '</option>'; }).join('');
    s1.innerHTML = ops;
    s2.innerHTML = '<option value="nada">Sem subgrupo</option>' + ops;
    var pad = CAL_PADRAO[t] || ['dia', 'pessoa'];
    s1.value = pad[0];
    s2.value = pad[1];
    q.value = '';
    dlg.querySelector('h3').textContent = tituloDe(t, k, p, g);

    var pessoas = new Set(regs.map(function (r) { return r.alim || NI; }));
    var dias = new Set(regs.map(function (r) { return r.d; }));
    var muns = new Set(regs.map(function (r) { return r.mun || NI; }));
    var ha = regs.reduce(function (a, r) { return a + (r.pc === MEC ? (r.ha || 0) : 0); }, 0);
    var hrs = regs.reduce(function (a, r) { return a + (r.pc === ACU ? (r.hrs || 0) : 0); }, 0);
    dlg.querySelector('.cal-det-kpis').innerHTML = [
      ['Lançamentos', G.num(regs.length)], ['Dias com inserção', G.num(dias.size)],
      ['Lançadores', G.num(pessoas.size)], ['Municípios', G.num(muns.size)],
      ['Hectares', G.num(ha, 1) + ' ha'], ['Horas de máquina', G.num(hrs, 1) + ' h']
    ].map(function (c) { return '<div><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; }).join('');

    function pintar() {
      var termo = q.value.trim().toLowerCase();
      var base = !termo ? regs : regs.filter(function (r) {
        return [r.prod, r.mun, r.esc, r.rt, r.alim, r.pc, r.d].join(' ').toLowerCase().indexOf(termo) >= 0;
      });
      var corpo = dlg.querySelector('.cal-det-corpo');
      dlg._estado = { titulo: tituloDe(t, k, p, g), regs: base, g1: s1.value, g2: s2.value, termo: q.value.trim() };
      if (!base.length) { corpo.innerHTML = '<p class="nota">Nenhum lançamento nessa busca.</p>'; return; }
      var abertos = base.length <= 150;
      corpo.innerHTML = grupos(base, s1.value).map(function (g) {
        var inner;
        if (s2.value === 'nada' || s2.value === s1.value) inner = tabelaRegistrosDetalhe(g.regs);
        else {
          inner = grupos(g.regs, s2.value).map(function (g2) {
            return '<details class="cal-sub-grupo" open><summary>' +
              G.esc(CAL_AGRUPAR[s2.value].nome(g2.k)) + ' <span class="tf-n">(' + g2.regs.length + ')</span></summary>' +
              tabelaRegistrosDetalhe(g2.regs) + '</details>';
          }).join('');
        }
        return '<details class="cal-grupo"' + (abertos ? ' open' : '') + '><summary>' +
          G.esc(CAL_AGRUPAR[s1.value].nome(g.k)) + ' <span class="tf-n">(' + g.regs.length + ' lançamentos)</span></summary>' +
          inner + '</details>';
      }).join('');
    }
    s1.onchange = pintar;
    s2.onchange = pintar;
    var tm;
    q.oninput = function () { clearTimeout(tm); tm = setTimeout(pintar, 160); };
    pintar();
    if (!dlg.open) dlg.showModal();
  }

  function ligarCalendarios() {
    document.addEventListener('mouseover', function (e) {
      var a = e.target.closest && e.target.closest('[data-cal-t]');
      if (a) popCalendario(a, e); else fecharPopCalendario();
    });
    document.addEventListener('mousemove', function (e) {
      if (!CAL_POP || CAL_POP.style.display !== 'block') return;
      var a = e.target.closest && e.target.closest('[data-cal-t]');
      if (a) popCalendario(a, e);
    });
    document.addEventListener('scroll', fecharPopCalendario, true);
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-cal-t]');
      if (!a) return;
      var t = a.getAttribute('data-cal-t');
      if (t === 'vazio') return;
      fecharPopCalendario();
      abrirDetalheCalendario(t, a.getAttribute('data-cal-k'), a.getAttribute('data-cal-p') || '', a.getAttribute('data-cal-g') || '');
    });
  }


  /** Visão aberta dentro da aba "Inserções": registros, pessoa, dia, semana
      ou mes. Só ela fica visível; a barra de opções fica fixa no topo. */
  var insSecao = 'pessoa';
  function escolherInsSecao(sec) {
    if (['registros', 'pessoa', 'dia', 'semana', 'mes', 'pontos'].concat(SECOES_MODULO).indexOf(sec) < 0) sec = 'pessoa';
    // versão pública: só as visões sem nome de pessoa (comparativo, metas, tendências, cruzamentos)
    if (window.MODO_PUBLICO && SECOES_INTERNAS.indexOf(sec) >= 0) {
      var livre = Array.prototype.filter.call(document.querySelectorAll('#insNav button[data-sec]'), function (b) {
        return SECOES_INTERNAS.indexOf(b.getAttribute('data-sec')) < 0 && !b.hidden && b.id !== 'lancPessoasBtn';
      })[0];
      sec = livre ? livre.getAttribute('data-sec') : 'comparativo';
    }
    // visão desligada nas Configurações para este perfil: abre a primeira liberada
    var btnSec = document.querySelector('#insNav button[data-sec="' + sec + '"]');
    if (btnSec && btnSec.getAttribute('data-oculta-lista')) {
      var livre2 = Array.prototype.filter.call(document.querySelectorAll('#insNav button[data-sec]'), function (b) {
        return !b.hidden && b.id !== 'lancPessoasBtn';
      })[0];
      if (livre2) sec = livre2.getAttribute('data-sec');
    }
    insSecao = sec;
    document.querySelectorAll('#insNav button[data-sec]').forEach(function (b) {
      var ativa = b.getAttribute('data-sec') === sec;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-pressed', ativa ? 'true' : 'false');
    });
    document.querySelectorAll('.ins-bloco').forEach(function (b) {
      b.hidden = b.getAttribute('data-sec') !== sec;
    });
    // a barra fica colada logo abaixo das abas: mede a altura delas
    var abas = document.querySelector('.abas'), nav = el('insNav');
    if (abas && nav) nav.style.top = abas.offsetHeight + 'px';
    // a lateral some antes do mapa ser desenhado: ele mede a largura do contêiner ao nascer
    atualizarFiltros();
    // o mapa de pontos (js/painel-pontos.js) só é desenhado quando a visão é aberta
    if (sec === 'pontos' && window.PAINEL_PONTOS_DESENHAR && TODOS.length) window.PAINEL_PONTOS_DESENHAR(contexto());
    if (TODOS.length) desenharSecaoModulo(contexto());
  }

  /** Em "Mostrar mais" a lateral de filtros aparece em todas as visões que leem a seleção. Metas, Alertas, Relatórios
      e Configurações (abaixo) não leem filtro algum e ocupam a largura toda. */
  var SECOES_SEM_SELECAO = ['configuracoes', 'alertas', 'relatorios', 'metas'];
  function atualizarFiltros() {
    // "Mostrar mais": a lateral de filtros volta em todas as visões que leem a seleção (as de SECOES_SEM_SELECAO não leem filtro algum)
    var oculto = abaAtiva === 'lancamento' || (abaAtiva === 'insercoes' && SECOES_SEM_SELECAO.indexOf(insSecao) >= 0);
    var f = el('filtros'), tg = document.querySelector('.filtros-toggle');   // o botão "Filtros" do celular também
    if (f) f.hidden = oculto;
    if (tg) tg.hidden = oculto;
    // Configurações ocupa a janela inteira, sem rolar: margens e rodapé da página ficam menores
    document.body.classList.toggle('vista-cfg', abaAtiva === 'insercoes' && insSecao === 'configuracoes');
    document.body.classList.toggle('vista-ins', abaAtiva === 'insercoes');
    pintarSelecaoIns(CTX);
  }

  var ROT_FILTRO = [['mes', 'Mês'], ['pc', 'Serviço'], ['reg', 'Regional'], ['mun', 'Município'], ['esc', 'Escritório'],
    ['cult', 'Cultura'], ['tec', 'Técnico']];
  /** A seleção atual em uma linha (faixa de "Mostrar mais"): período, filtros marcados e quantos registros sobram. */
  function pintarSelecaoIns(C) {
    var caixa = el('insSel');
    if (!caixa) return;
    var usa = false;   // com a lateral de filtros visível, a faixa de seleção é redundante
    caixa.hidden = !usa;
    if (!usa) return;
    var lista = function (v, fmt) {
      var n = v.map(fmt || String);
      return G.esc(n.slice(0, 2).join(', ')) + (n.length > 2 ? ' +' + (n.length - 2) : '');
    };
    var partes = ['<span>Período <b>' + (F.ano.length ? G.esc(F.ano.slice().sort().join(', ')) : 'Geral') + '</b></span>'];
    var ativos = 0;
    if (PER.de || PER.ate) {
      ativos++;
      partes.push('<span>Datas <b>' + (PER.de ? dataBR(PER.de) : '…') + ' a ' + (PER.ate ? dataBR(PER.ate) : '…') + '</b></span>');
    }
    ROT_FILTRO.forEach(function (p) {
      var v = F[p[0]];
      if (!v || !v.length) return;
      ativos++;
      partes.push('<span>' + p[1] + ' <b>' + lista(v, p[0] === 'mes' ? function (m) { return MESES[+m - 1] || m; } : String) + '</b></span>');
    });
    if (C && C.D) partes.push('<span><b>' + G.num(C.D.length) + '</b> de ' + G.num(C.noAno) + ' registros</span>');
    el('insSelTxt').innerHTML = partes.join('<i aria-hidden="true">·</i>');
    el('insSelLimpar').hidden = !ativos;
  }

  /* Visões que vivem em arquivos próprios (js/painel-*.js) mas aparecem dentro de "Mostrar mais". */
  function desenharSecaoModulo(C) {
    if (SECOES_MODULO.indexOf(insSecao) >= 0 && ABAS[insSecao]) {
      try { ABAS[insSecao](C); } catch (e) { /* uma visão extra nunca derruba as demais */ }
    }
  }

  /** Aba única "Inserções": registros, por pessoa, por dia, por semana e por mês no
      mesmo lugar, lendo o mesmo agregado (insercoes). */
  function abaInsercoes(C) {
    // versão pública: nada de registros nem de nomes de pessoas no DOM, só as visões agregadas
    if (window.MODO_PUBLICO) { desenharSecaoModulo(C); return; }
    abaRegistros(C);
    abaInsPessoa(C);
    abaInsDia(C);
    abaInsSemana(C);
    abaInsMes(C);
    pintarCalendarios(insercoes(C));
    if (insSecao === 'pontos' && window.PAINEL_PONTOS_DESENHAR) window.PAINEL_PONTOS_DESENHAR(C);
    desenharSecaoModulo(C);
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

  /* ================================================== ABA: LANÇAMENTO (admin) */
  /* Vive inteira em js/lancamento-mecanizacao.js — não depende de D/TODOS,
     só precisa da lista de municípios (para o <select>) e ser avisada de
     quando a aba abre, pra montar os selects uma vez só. */
  function abaLancamento() {
    if (!window.LANCAMENTO_MECANIZACAO) return;
    var municipios = [];
    REGIONAIS.forEach(function (r) { municipios = municipios.concat(r.muns); });
    municipios.sort();
    window.LANCAMENTO_MECANIZACAO.abrir(municipios);
  }

  /* --------------------------------------------------- despachante das abas */
  var ABAS = {
    geral: abaGeral, mecanizacao: abaMecanizacao, acudagem: abaAcudagem,
    cultura: abaCultura, municipio: abaMunicipio, mapa: abaMapa, escritorio: abaEscritorio,
    beneficiario: abaBeneficiario, registros: abaRegistros,
    relatorio: abaRelatorio,
    // lançamento abre sem senha (só salvar/ler PDF pede); as quatro abaixo e
    // "admin" só aparecem com a senha (ver aplicarAdmin)
    lancamento: abaLancamento,
    insercoes: abaInsercoes,
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
  var LISTA_REG = [];   // registros da listagem (já filtrados e ordenados): é o que a exportação leva

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
    LISTA_REG = L;
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

    // o relatório geral só faz sentido com mais de um município para somar
    var geral = el('relatorioGeral');
    if (geral) geral.hidden = muns.length < 2;

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
    abrirRelatorio(mun, D.filter(function (r) { return r.mun === mun; }), 'mun');
  }

  /** Municípios com nome válido presentes na seleção (mesma regra dos cartões). */
  function munsDaSelecao(D) {
    return Array.from(new Set(D.map(function (r) { return r.mun; })))
      .filter(function (m) { return m && m !== NI; })
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }

  /** Cabeçalho do relatório conforme os filtros marcados, na ordem
      Serviço, Ano, Mês, Regional, Município, Escritório, Cultura, Técnico.
      Filtro sem marcação não entra (é "todos"); serviço e ano sempre entram.
      `periodo` é o intervalo das datas de vistoria dos registros do relatório. */
  function cabecalhoRelatorio(sub) {
    var meses = F.mes.slice().sort().map(function (m) {
      var n = MESES[+m - 1];
      return n.charAt(0).toUpperCase() + n.slice(1);
    });
    var itens = [
      ['Serviço', F.pc.length ? F.pc.join(', ') : 'Mecanização e Açudagem'],
      ['Ano', rotuloAno()]
    ];
    [['Mês', meses], ['Regional', F.reg], ['Município', F.mun], ['Escritório local', F.esc],
     ['Cultura', F.cult], ['Técnico', F.tec]].forEach(function (p) {
      if (p[1].length) itens.push([p[0], p[1].join(', ')]);
    });
    var datas = sub.map(dataRef).filter(Boolean).sort();
    var periodo = datas.length ? dataBR(datas[0]) + ' a ' + dataBR(datas[datas.length - 1]) : '—';
    return { itens: itens, periodo: periodo };
  }

  /** Relatório que soma todos os municípios da seleção.
      'geral'  = completo (detalhamento + registros de todos os municípios);
      'resumo' = só indicadores e a tabela de um município por linha. */
  function abrirRelatorioGeral(D, modo) {
    var muns = munsDaSelecao(D);
    var sub = D.filter(function (r) { return r.mun && r.mun !== NI; });
    if (!sub.length) return;
    abrirRelatorio(modo === 'resumo' ? 'Geral — resumido' : 'Geral — completo', sub, modo, muns);
  }

  /* ------------------------------------------- PDF A4 do relatório geral */
  /* jsPDF + autoTable só são baixados no clique (mesmo padrão das exportações
     de eleições): o painel não paga por eles ao abrir. */
  var LIBS_PDF = {
    jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
    autotable: ['https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js']
  };

  function carregarLib(urls, pronto) {
    return new Promise(function (ok, falha) {
      if (pronto()) return ok();
      var i = 0;
      (function tenta() {
        if (i >= urls.length) return falha(new Error('Não foi possível carregar a biblioteca de PDF (verifique a internet).'));
        var s = document.createElement('script');
        s.src = urls[i++];
        s.onload = function () { if (pronto()) ok(); else tenta(); };
        s.onerror = tenta;
        document.head.appendChild(s);
      })();
    });
  }

  function carregarPdf() {
    return carregarLib(LIBS_PDF.jspdf, function () { return window.jspdf && window.jspdf.jsPDF; })
      .then(function () {
        return carregarLib(LIBS_PDF.autotable, function () {
          return window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable;
        });
      });
  }

  /** Gera e baixa o PDF A4 do relatório geral ('geral' completo ou 'resumo'). */
  function baixarPdfGeral(D, modo) {
    var muns = munsDaSelecao(D);
    var sub = D.filter(function (r) { return r.mun && r.mun !== NI; });
    if (!sub.length) return;
    var resumo = modo === 'resumo';
    var btns = el('relatorioGeral').querySelectorAll('button');
    btns.forEach(function (b) { b.disabled = true; });

    carregarPdf().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      var PW = 210, M = 14, CW = PW - 2 * M;
      var AZUL = [46, 79, 125], CINZA = [107, 120, 133], TINTA = [27, 36, 48];
      var mec = sub.filter(function (r) { return r.pc === MEC; });
      var acu = sub.filter(function (r) { return r.pc === ACU; });
      var ha = soma(mec, function (r) { return r.ha; });
      var hrs = soma(acu, function (r) { return r.hrs; });
      var nAc = soma(acu, function (r) { return r.ac; });
      var nProd = nProdutores(sub);
      var titulo = 'Relatório geral ' + (resumo ? 'resumido' : 'completo');
      var y;

      // cabeçalho personalizado pela seleção (filtros marcados + período)
      var cab = cabecalhoRelatorio(sub);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      var linhasCab = [];
      cab.itens.forEach(function (it) {
        linhasCab = linhasCab.concat(doc.splitTextToSize(it[0] + ': ' + it[1], CW));
      });
      linhasCab.push('Período das vistorias: ' + cab.periodo + '  |  ' + muns.length + ' municípios');
      var altCab = 18 + linhasCab.length * 4.6 + 3;
      doc.setFillColor.apply(doc, AZUL);
      doc.rect(0, 0, PW, altCab, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(titulo, M, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      linhasCab.forEach(function (l, i) { doc.text(l, M, 19 + i * 4.6); });
      y = altCab + 8;

      function secao(txt) {
        if (y > 262) { doc.addPage(); y = 18; }
        doc.setTextColor.apply(doc, AZUL);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text(txt, M, y);
        doc.setDrawColor.apply(doc, AZUL); doc.setLineWidth(0.4);
        doc.line(M, y + 1.8, M + CW, y + 1.8);
        y += 6;
      }
      function tabela(cab, linhas, opt) {
        opt = opt || {};
        doc.autoTable({
          startY: y, margin: { left: M, right: M, top: 16, bottom: 16 },
          head: [cab], body: linhas, theme: 'grid',
          styles: { font: 'helvetica', fontSize: opt.fs || 8.5, cellPadding: 1.6, textColor: TINTA,
                    lineColor: [216, 222, 229], lineWidth: 0.15, overflow: 'linebreak' },
          headStyles: { fillColor: [238, 242, 244], textColor: [74, 85, 97], fontStyle: 'bold', fontSize: (opt.fs || 8.5) - 0.5 },
          alternateRowStyles: { fillColor: [250, 251, 252] },
          columnStyles: opt.cols || {},
          didParseCell: function (d) {
            // última linha de totais em negrito
            if (opt.totais && d.section === 'body' && d.row.index === linhas.length - 1) {
              d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [238, 242, 244];
            }
          }
        });
        y = doc.lastAutoTable.finalY + 7;
      }
      var dir = { halign: 'right' };

      // indicadores
      // serviço sem registro na seleção não aparece em lugar nenhum do relatório
      var temMec = mec.length > 0, temAcu = acu.length > 0;
      var kpis = [['Atendimentos', G.num(sub.length)]];
      if (temMec) kpis.push(['Mecanização', G.num(mec.length) + ' (' + G.num(ha, 1) + ' ha)']);
      if (temAcu) kpis.push(['Açudagem', G.num(acu.length) + ' (' + G.num(hrs, 1) + ' h)'],
        ['Tanques / açudes', G.num(nAc)]);
      kpis.push(['Produtores', G.num(nProd)],
        ['Atend. por município', G.num(sub.length / muns.length, 1)],
        ['Municípios', G.num(muns.length)],
        ['Meses com vistoria', G.num(chavesTempo(sub).length)]);
      var kw = (CW - 9) / 4, kh = 15;
      kpis.forEach(function (k, i) {
        var x = M + (i % 4) * (kw + 3), yy = y + Math.floor(i / 4) * (kh + 3);
        doc.setFillColor(247, 249, 250); doc.setDrawColor(216, 222, 229); doc.setLineWidth(0.2);
        doc.roundedRect(x, yy, kw, kh, 1.5, 1.5, 'FD');
        doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        doc.text(k[0].toUpperCase(), x + 2.5, yy + 5);
        doc.setTextColor.apply(doc, TINTA); doc.setFontSize(10.5);
        doc.text(String(k[1]), x + 2.5, yy + 11.5, { maxWidth: kw - 4 });
      });
      y += Math.ceil(kpis.length / 4) * (kh + 3) + 6;

      // um município por linha
      secao('Por município');
      function colsMun(nm, s, sm, sa) {
        var l = [nm, G.num(s.length)];
        if (temMec) l.push(G.num(sm.length), G.num(soma(sm, function (r) { return r.ha; }), 1));
        if (temAcu) l.push(G.num(sa.length), G.num(soma(sa, function (r) { return r.hrs; }), 1),
          G.num(soma(sa, function (r) { return r.ac; })));
        l.push(G.num(nProdutores(s)));
        return l;
      }
      var linhasMun = muns.map(function (m) {
        var s = sub.filter(function (r) { return r.mun === m; });
        return colsMun(m, s, s.filter(function (r) { return r.pc === MEC; }),
          s.filter(function (r) { return r.pc === ACU; }));
      });
      linhasMun.push(colsMun('Total', sub, mec, acu));
      var cabMun = ['Município', 'Atend.'];
      if (temMec) cabMun.push('Mecaniz.', 'Hectares');
      if (temAcu) cabMun.push('Açud.', 'Horas', 'Tanques');
      cabMun.push('Produt.');
      var cols9 = {};
      for (var c = 1; c < cabMun.length; c++) cols9[c] = dir;
      tabela(cabMun, linhasMun, { cols: cols9, totais: true });

      // frota alocada por município (2026): só no resumido e só dos municípios
      // que estão na seleção atual, na mesma ordem do "Por município" acima
      if (resumo) {
        var linhasMaq = muns.filter(function (m) { return MAQUINAS_MUNICIPIO_2026[m]; })
          .map(function (m) { return [m, MAQUINAS_MUNICIPIO_2026[m]]; });
        if (linhasMaq.length) {
          secao('Máquinas alocadas por município (2026)');
          tabela(['Município', 'Máquinas'], linhasMaq, { fs: 8.5 });
        }
      }

      if (!resumo) {
        var rkCult = ranking((function () {
          var m = new Map();
          mec.forEach(function (r) { r.cult.forEach(function (c) { m.set(c[0], (m.get(c[0]) || 0) + c[1]); }); });
          return m;
        })(), 30);
        if (rkCult.length) {
          secao('Mecanização - culturas');
          tabela(['Cultura', 'Hectares', '%'], rkCult.map(function (d) {
            return [d.rot, G.num(d.val, 1), (ha ? G.num(d.val / ha * 100, 1) : '0') + '%'];
          }), { cols: { 1: dir, 2: dir } });
        }
        var rkMaq = ranking(contar(mec, function (r) { return r.maq; }), 10);
        if (rkMaq.length) {
          secao('Máquinas utilizadas');
          tabela(['Equipamento', 'Ocorrências'], rkMaq.map(function (d) { return [d.rot, G.num(d.val)]; }), { cols: { 1: dir } });
        }
        var rkImpl = ranking(contar(mec, function (r) { return r.impl; }), 10);
        if (rkImpl.length) {
          secao('Implementos e serviços');
          tabela(['Implemento / Serviço', 'Ocorrências'], rkImpl.map(function (d) { return [d.rot, G.num(d.val)]; }), { cols: { 1: dir } });
        }
        var tempo = chavesTempo(sub);
        if (tempo.length) {
          var cnt = somarPor(sub, chaveTempo, function () { return 1; });
          var hMap = somarPor(mec, chaveTempo, function (r) { return r.ha; });
          var hrMap = somarPor(acu, chaveTempo, function (r) { return r.hrs; });
          var acMap = somarPor(acu, chaveTempo, function (r) { return r.ac; });
          secao('Evolução por ' + (porAno() ? 'ano' : 'mês'));
          var cabEv = [porAno() ? 'Ano' : 'Mês', 'Atendimentos'];
          if (temMec) cabEv.push('Hectares');
          if (temAcu) cabEv.push('Horas', 'Tanques');
          var colsEv = {};
          for (var q = 1; q < cabEv.length; q++) colsEv[q] = dir;
          tabela(cabEv, tempo.map(function (k) {
            var l = [rotTempo(k), G.num(cnt.get(k) || 0)];
            if (temMec) l.push(G.num(hMap.get(k) || 0, 1));
            if (temAcu) l.push(G.num(hrMap.get(k) || 0, 1), G.num(acMap.get(k) || 0));
            return l;
          }), { cols: colsEv });
        }
        var tecMap = new Map();
        sub.forEach(function (r) {
          if (!r.rt) return;
          if (!tecMap.has(r.rt)) tecMap.set(r.rt, { n: 0, esc: r.esc });
          tecMap.get(r.rt).n++;
        });
        if (tecMap.size) {
          secao('Responsáveis técnicos');
          tabela(['Técnico', 'Escritório local', 'Vistorias'],
            Array.from(tecMap, function (e) { return [e[0], e[1].esc || '-', e[1].n]; })
              .sort(function (a, b) { return b[2] - a[2]; })
              .map(function (l) { return [l[0], l[1], G.num(l[2])]; }), { cols: { 2: dir } });
        }
        doc.addPage(); y = 18;
        secao('Registros detalhados');
        var cabReg = ['Município', 'Vistoria', 'Serviço', 'Produtor / Propriedade', 'Culturas'];
        if (temMec) cabReg.push('Área (ha)');
        if (temAcu) cabReg.push('Horas', 'Tanq.');
        cabReg.push('Técnico');
        var colsReg = {};
        for (var k = 5; k < cabReg.length - 1; k++) colsReg[k] = dir;
        tabela(cabReg,
          sub.slice().sort(function (a, b) { return a.mun.localeCompare(b.mun, 'pt-BR'); }).map(function (r) {
            var l = [r.mun, dataBR(r.dv), r.pc, (r.prod || '-') + (r.propr ? '\n' + r.propr : ''),
              r.cult.length ? r.cult.map(function (c) { return c[0] + ' (' + G.num(c[1], 1) + ' ha)'; }).join(', ') : '-'];
            if (temMec) l.push(r.ha ? G.num(r.ha, 1) : '-');
            if (temAcu) l.push(r.hrs ? G.num(r.hrs, 1) : '-', r.ac ? G.num(r.ac) : '-');
            l.push(r.rt || '-');
            return l;
          }), { fs: 7, cols: colsReg });
      }

      // rodapé com paginação em todas as páginas
      var n = doc.internal.getNumberOfPages();
      var hoje = new Date().toLocaleDateString('pt-BR');
      for (var p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text('Gerado em ' + hoje + ' | Sistema de gestão', M, 289);
        doc.text('Página ' + p + ' de ' + n, PW - M, 289, { align: 'right' });
      }
      doc.save('relatorio-geral-' + (resumo ? 'resumido' : 'completo') + '-' +
        String(rotuloAno()).replace(/[^\w-]+/g, '_') + '.pdf');
    }).catch(function (e) {
      alert(e && e.message ? e.message : 'Não foi possível gerar o PDF.');
    }).then(function () {
      btns.forEach(function (b) { b.disabled = false; });
    });
  }

  /* ------------------------------------- Apresentação (slides) do relatório geral,
     sempre no "modo resumido": números gerais + um painel por município, a partir
     da mesma seleção de filtros do relatório em PDF (ver baixarPdfGeral acima). */
  function montarSlidesGeral(D) {
    var muns = munsDaSelecao(D);
    var sub = D.filter(function (r) { return r.mun && r.mun !== NI; });
    var mec = sub.filter(function (r) { return r.pc === MEC; });
    var acu = sub.filter(function (r) { return r.pc === ACU; });
    var ha = soma(mec, function (r) { return r.ha; });
    var hrs = soma(acu, function (r) { return r.hrs; });
    var nAc = soma(acu, function (r) { return r.ac; });
    var nProd = nProdutores(sub);
    var temMec = mec.length > 0, temAcu = acu.length > 0;
    var cab = cabecalhoRelatorio(sub);
    var slides = [];

    slides.push({ capa: true, html:
      '<div class="apr-capa-faixa"></div><div class="apr-capa-corpo">' +
      '<div class="apr-capa-eyebrow">' + G.esc(cab.itens[0][1]) + '</div>' +
      '<h1>Relat&oacute;rio geral &mdash; resumido</h1>' +
      '<p class="apr-capa-periodo">Per&iacute;odo das vistorias: ' + G.esc(cab.periodo) + '</p>' +
      '<p class="apr-capa-filtros">' + cab.itens.map(function (it) {
        return '<span>' + G.esc(it[0]) + ': ' + G.esc(it[1]) + '</span>';
      }).join('') + '</p>' +
      '<p class="apr-capa-rodape">' + muns.length + ' munic&iacute;pio' + (muns.length === 1 ? '' : 's') + ' na sele&ccedil;&atilde;o</p>' +
      '</div>' });

    var kpis = [['Atendimentos', G.num(sub.length)]];
    if (temMec) kpis.push(['Mecanização', G.num(mec.length) + ' (' + G.num(ha, 1) + ' ha)']);
    if (temAcu) kpis.push(['Açudagem', G.num(acu.length) + ' (' + G.num(hrs, 1) + ' h)'], ['Tanques / açudes', G.num(nAc)]);
    kpis.push(['Produtores', G.num(nProd)],
      ['Atend. por município', G.num(sub.length / (muns.length || 1), 1)],
      ['Municípios', G.num(muns.length)],
      ['Meses com vistoria', G.num(chavesTempo(sub).length)]);
    slides.push({ html:
      '<div class="apr-slide-cab"><h2>N&uacute;meros gerais</h2><div class="apr-linha"></div></div>' +
      '<div class="apr-kpis">' + kpis.map(function (k) {
        return '<div class="apr-kpi"><div class="apr-kpi-rot">' + G.esc(k[0]) + '</div><div class="apr-kpi-val">' + k[1] + '</div></div>';
      }).join('') + '</div>' });

    var linhasMun = muns.map(function (m) {
      var s = sub.filter(function (r) { return r.mun === m; });
      return { nome: m, n: s.length };
    }).sort(function (a, b) { return b.n - a.n; });
    var mx = Math.max.apply(null, linhasMun.map(function (l) { return l.n; }).concat([1]));
    var POR_SLIDE = 9;
    for (var i = 0; i < linhasMun.length; i += POR_SLIDE) {
      var pagina = linhasMun.slice(i, i + POR_SLIDE);
      slides.push({ html:
        '<div class="apr-slide-cab"><h2>Por munic&iacute;pio</h2><div class="apr-linha"></div></div>' +
        '<div class="apr-barras">' + pagina.map(function (l) {
          var pct = Math.max(4, Math.round(l.n / mx * 100));
          return '<div class="apr-barra-item">' +
            '<div class="apr-barra-rot">' + G.esc(l.nome) + '</div>' +
            '<div class="apr-barra-trilho"><div class="apr-barra-preench" style="width:' + pct + '%"></div></div>' +
            '<div class="apr-barra-val">' + G.num(l.n) + '</div></div>';
        }).join('') + '</div>' });
    }

    slides.push({ capa: true, html:
      '<div class="apr-capa-faixa"></div><div class="apr-capa-corpo">' +
      '<h1>Fim</h1><p class="apr-capa-periodo">Gerado em ' + new Date().toLocaleDateString('pt-BR') + '</p></div>' });

    return slides;
  }

  var deckApresentacao = null;
  function abrirApresentacaoGeral(D) {
    if (deckApresentacao) deckApresentacao.fechar();
    var sub = D.filter(function (r) { return r.mun && r.mun !== NI; });
    if (!sub.length) return;
    var slides = montarSlidesGeral(D), i = 0;

    var raiz = document.createElement('div');
    raiz.className = 'apr-deck';
    raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true');
    raiz.setAttribute('aria-label', 'Apresentação do relatório geral');
    raiz.innerHTML =
      '<div class="apr-barra"><strong class="apr-tit">Relat&oacute;rio geral &mdash; apresenta&ccedil;&atilde;o</strong><span class="apr-esp"></span>' +
      '<button type="button" class="apr-b" data-a="tela" title="Tela cheia (F)">⛶ Tela cheia</button>' +
      '<button type="button" class="apr-b apr-x" data-a="fechar" title="Fechar (Esc)" aria-label="Fechar">✕</button></div>' +
      '<div class="apr-palco"><div class="apr-caixa"><div class="apr-pano"></div></div></div>' +
      '<div class="apr-nav"><button type="button" class="apr-b" data-a="ant" aria-label="Slide anterior">‹</button>' +
      '<span class="apr-cont" aria-live="polite"></span>' +
      '<button type="button" class="apr-b" data-a="prox" aria-label="Próximo slide">›</button></div>';

    var palco = raiz.querySelector('.apr-palco'), caixa = raiz.querySelector('.apr-caixa'),
      pano = raiz.querySelector('.apr-pano'), cont = raiz.querySelector('.apr-cont');
    slides.forEach(function (s) {
      var div = document.createElement('div');
      div.className = 'apr-slide' + (s.capa ? ' apr-capa' : '');
      div.innerHTML = s.html;
      div.hidden = true;
      pano.appendChild(div);
    });
    var cenas = pano.children;

    function ajusta() {
      var esc = Math.min(palco.clientWidth / 1280, palco.clientHeight / 720);
      caixa.style.width = Math.round(1280 * esc) + 'px';
      caixa.style.height = Math.round(720 * esc) + 'px';
      pano.style.transform = 'scale(' + esc + ')';
    }
    function ir(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      for (var j = 0; j < cenas.length; j++) cenas[j].hidden = j !== i;
      cont.textContent = (i + 1) + ' / ' + slides.length;
      raiz.querySelector('[data-a=ant]').disabled = i === 0;
      raiz.querySelector('[data-a=prox]').disabled = i === slides.length - 1;
    }
    function tecla(ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ir(i + 1); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp' || ev.key === 'Backspace') { ev.preventDefault(); ir(i - 1); }
      else if (ev.key === 'Home') { ev.preventDefault(); ir(0); }
      else if (ev.key === 'End') { ev.preventDefault(); ir(slides.length - 1); }
      else if (ev.key === 'f' || ev.key === 'F') { alternaTela(); }
      else if (ev.key === 'Escape' && !document.fullscreenElement) { fechar(); }
    }
    function alternaTela() {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      var f = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
      if (f) { try { f.call(raiz); } catch (e) { /* sem tela cheia neste navegador */ } }
    }
    function fechar() {
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', ajusta);
      document.removeEventListener('fullscreenchange', ajusta);
      if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* já saiu */ } }
      document.documentElement.classList.remove('apr-aberto');
      raiz.remove();
      deckApresentacao = null;
    }
    raiz.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-a]');
      if (b) {
        var a = b.getAttribute('data-a');
        if (a === 'prox') ir(i + 1);
        else if (a === 'ant') ir(i - 1);
        else if (a === 'fechar') fechar();
        else if (a === 'tela') alternaTela();
        return;
      }
      if (ev.target.closest('.apr-caixa')) ir(i + 1);
    });
    var x0 = null;
    raiz.addEventListener('touchstart', function (ev) { x0 = ev.touches[0].clientX; }, { passive: true });
    raiz.addEventListener('touchend', function (ev) {
      if (x0 == null) return;
      var dx = ev.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) ir(i + (dx < 0 ? 1 : -1));
    }, { passive: true });

    document.addEventListener('keydown', tecla);
    window.addEventListener('resize', ajusta);
    document.addEventListener('fullscreenchange', ajusta);
    document.body.appendChild(raiz);
    document.documentElement.classList.add('apr-aberto');
    ajusta(); ir(0);
    raiz.querySelector('[data-a=prox]').focus();
    deckApresentacao = { fechar: fechar };
  }

  /** modo: 'mun' (um município), 'geral' (completo) ou 'resumo'. */
  function abrirRelatorio(mun, sub, modo, muns) {
    if (!sub.length) return;
    var multi = modo !== 'mun';
    var resumo = modo === 'resumo';

    var mec = sub.filter(function (r) { return r.pc === MEC; });
    var acu = sub.filter(function (r) { return r.pc === ACU; });
    var ha = soma(mec, function (r) { return r.ha; });
    var hrs = soma(acu, function (r) { return r.hrs; });
    var nAc = soma(acu, function (r) { return r.ac; });
    var nProd = nProdutores(sub);

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

    // um município por linha, com os totais no rodapé — o miolo do relatório geral
    var htmlMuns = '';
    if (multi) {
      function celMun(nome, s, sMec, sAcu, cls) {
        var c = function (v) { return '<td class="num' + cls + '">' + v + '</td>'; };
        return '<tr><td class="forte">' + nome + '</td>' + c(G.num(s.length)) +
          (mec.length ? c(G.num(sMec.length)) + c(G.num(soma(sMec, function (r) { return r.ha; }), 1)) : '') +
          (acu.length ? c(G.num(sAcu.length)) + c(G.num(soma(sAcu, function (r) { return r.hrs; }), 1)) +
            c(G.num(soma(sAcu, function (r) { return r.ac; }))) : '') +
          c(G.num(nProdutores(s))) + '</tr>';
      }
      var linhasMun = muns.map(function (m) {
        var s = sub.filter(function (r) { return r.mun === m; });
        return celMun(G.esc(m), s, s.filter(function (r) { return r.pc === MEC; }),
          s.filter(function (r) { return r.pc === ACU; }), '');
      }).join('');
      linhasMun += celMun('Total', sub, mec, acu, ' forte');
      htmlMuns = '<h2 class="relatorio-sec-tit">Por munic&iacute;pio</h2>' +
        tTbl(['Munic&iacute;pio', 'Atend.'].concat(mec.length ? ['Mecaniza&ccedil;&atilde;o', 'Hectares'] : [],
          acu.length ? ['A&ccedil;udagem', 'Horas', 'Tanques'] : [], ['Produtores']),
          linhasMun);
    }

    var titulo = multi ? 'Relat&oacute;rio geral ' + (resumo ? 'resumido' : 'completo') : G.esc(mun);

    var html = '<div class="relatorio-doc">' +
      '<div class="relatorio-header">' +
      '<div class="relatorio-header-org">Sistema de gestão</div>' +
      '<div class="relatorio-header-sub">Relat&oacute;rio de Mecaniza&ccedil;&atilde;o e A&ccedil;udagem &middot; ' + G.esc(rotuloAno()) + '</div>' +
      (function () {
        var cab = cabecalhoRelatorio(sub);
        return '<div class="relatorio-header-sub">' + cab.itens.map(function (it) {
          return '<b>' + G.esc(it[0]) + ':</b> ' + G.esc(it[1]);
        }).join(' &middot; ') + '</div>' +
          '<div class="relatorio-header-sub"><b>Per&iacute;odo das vistorias:</b> ' + G.esc(cab.periodo) + '</div>';
      })() +
      '</div>' +
      '<h1 class="relatorio-mun-titulo">' + titulo + '</h1>' +
      (multi ? '<p class="fraco">' + G.num(muns.length) + ' munic&iacute;pios: ' + G.esc(muns.join(', ')) + '</p>' : '') +
      '<div class="relatorio-kpis">' +
      kpiRel('Atendimentos', G.num(sub.length), 'vistorias registradas') +
      (mec.length ? kpiRel('Mecanização', G.num(mec.length), G.num(ha, 1) + ' ha mecanizados') : '') +
      (acu.length ? kpiRel('Açudagem', G.num(acu.length), G.num(hrs, 1) + ' h de máquina') : '') +
      (ha ? kpiRel('Hectares', G.num(ha, 1) + ' ha', 'total mecanizado') : '') +
      (hrs ? kpiRel('Horas', G.num(hrs, 1) + ' h', 'de escavadeira') : '') +
      (nAc ? kpiRel('Tanques', G.num(nAc), 'construídos ou reformados') : '') +
      kpiRel('Produtores', G.num(nProd), 'nomes distintos atendidos') +
      '</div>' +
      htmlMuns +
      (resumo ? '' : '<div class="relatorio-secoes">' + htmlMec + htmlAcu + '</div>') +
      (rkTec.length && !resumo ? '<h2 class="relatorio-sec-tit">Responsáveis Técnicos</h2>' +
        tTbl(['Técnico', 'Escritório Local', 'Vistorias'],
          rkTec.map(function (d) {
            return '<tr><td class="forte">' + G.esc(d.rot) + '</td><td>' + G.esc(d.esc || '—') +
              '</td><td class="num">' + G.num(d.val) + '</td></tr>';
          }).join('')) : '') +
      (resumo ? '' : '<h2 class="relatorio-sec-tit">Registros Detalhados</h2>' +
      '<div class="relatorio-registros"><table class="dados" style="min-width:720px"><thead><tr>' +
      (multi ? '<th>Munic&iacute;pio</th>' : '') +
      '<th>Inser&ccedil;&atilde;o</th><th>Vistoria</th><th>Servi&ccedil;o</th>' +
      '<th>Produtor / Propriedade</th><th>Culturas</th>' +
      (mec.length ? '<th>&Aacute;rea (ha)</th>' : '') +
      (acu.length ? '<th>Horas</th><th>Tanques</th>' : '') + '<th>T&eacute;cnico</th>' +
      '</tr></thead><tbody>' +
      sub.slice().sort(function (a, b) { return multi ? a.mun.localeCompare(b.mun, 'pt-BR') : 0; }).map(function (r) {
        return '<tr>' +
          (multi ? '<td class="forte">' + G.esc(r.mun) + '</td>' : '') +
          '<td class="num">' + dataBR(r.d) + '</td>' +
          '<td class="num">' + dataBR(r.dv) + '</td>' +
          '<td><span class="tag ' + tagServico(r.pc) + '">' + G.esc(r.pc) + '</span></td>' +
          '<td class="forte">' + G.esc(r.prod || '—') + '<br><small class="fraco">' + G.esc(r.propr || '') + '</small></td>' +
          '<td>' + (r.cult.length ? r.cult.map(function (c) { return G.esc(c[0]) + ' (' + G.num(c[1], 1) + ' ha)'; }).join(', ') : '—') + '</td>' +
(mec.length ? '<td class="num">' + (r.ha ? G.num(r.ha, 1) : '—') + '</td>' : '') +
          (acu.length ? '<td class="num">' + (r.hrs ? G.num(r.hrs, 1) : '—') + '</td>' +
            '<td class="num">' + (r.ac ? G.num(r.ac) : '—') + '</td>' : '') +
          '<td>' + G.esc(r.rt || '—') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>') +
      '<div class="relatorio-footer">Gerado em ' + hoje + ' &middot; Sistema de gestão</div>' +
      '</div>';

    el('relatorioConteudo').innerHTML = html;
    el('relatorioTitulo').textContent = multi ? 'Relatório geral ' + (resumo ? 'resumido' : 'completo') : mun;
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
    '.relatorio-header{border-bottom:2px solid #2e4f7d;padding-bottom:8px;margin-bottom:14px}' +
    '.relatorio-header-org{font-size:14px;font-weight:700;color:#2e4f7d;letter-spacing:.3px}' +
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
    '.relatorio-sec-tit.mec{color:#2e4f7d;border-color:#2e4f7d}' +
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
    '.tag-mec{color:#2e4f7d;border-color:#2e4f7d;background:#eaeff5}' +
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
    if (META.fonte === 'lancamentos') {
      el('nota').innerHTML =
        '<b>Sobre os dados.</b> O painel lê direto dos <b>lançamentos do sistema</b> — ' + G.num(N_CORRENTE) +
        ' fichas, lidas em ' + G.esc(META.gerado_em || '—') + ' (cada abertura do painel traz o que foi lançado até agora). ' +
        '<b>O exercício é o ano do lançamento</b> (data de inserção da ficha).' +
        '<ul>' +
        '<li>' + G.num(outroAno) + ' registros têm vistoria confiável de um ano e lançamento de outro: ' +
        'contam no exercício do <em>lançamento</em>, e o mês continua sendo o da vistoria;</li>' +
        '<li>' + G.num(semVistoria) + ' registros têm <em>Data da Vistoria</em> impossível ' +
        '(ano digitado errado ou data futura) e entraram pela data de lançamento — ' +
        'aparecem destacados na coluna Vistoria da listagem;</li>' +
        '<li>os produtores distintos são contados pelo <em>nome</em> normalizado: ' +
        'CPF e data de nascimento nunca saem do banco para o painel;</li>' +
        '<li>' + G.num(somar('sem_geo')) + ' registros sem coordenada geográfica, por isso não há mapa de pontos;</li>' +
        '<li>' + G.num(somar('sem_formulario')) + ' registros sem link do formulário digitalizado.</li>' +
        '</ul>';
      return;
    }
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
    if (PER.de) p.push('de=' + PER.de);
    if (PER.ate) p.push('ate=' + PER.ate);
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

  /** O painel abre direto do Início (a página "Todos os painéis" foi
      removida), então o "voltar" leva sempre para lá. */
  function atualizarVoltar() {
    var a = el('voltarSecoes');
    if (!a) return;
    a.href = 'index.html';
  }

  function lerHash() {
    var bruto = location.hash.slice(1);
    var i = bruto.indexOf('?');
    var filtros = {};
    (i < 0 ? '' : bruto.slice(i + 1)).split('&').forEach(function (par) {
      var j = par.indexOf('=');
      if (j < 0) return;
      var k = par.slice(0, j);
      if (CAMPOS_URL.indexOf(k) >= 0 || k === 'de' || k === 'ate') filtros[k] = decodeURIComponent(par.slice(j + 1));
    });
    return { aba: (i < 0 ? bruto : bruto.slice(0, i)) || '', filtros: filtros };
  }

  /* Versão pública: estas abas não existem (registros linha a linha,
     lançamento e administração). */
  var ABAS_FORA_DO_PUBLICO = ['registros', 'lancamento', 'ins-cultura', 'beneficiario', 'configuracoes'];
  // visões dentro de "Mostrar mais"; as internas não aparecem na versão pública
  var SECOES_MODULO = ['comparativo', 'metas', 'tendencias', 'cruzamentos', 'alertas', 'relatorios', 'configuracoes',
    'imun', 'iesc', 'iserv', 'itec', 'ihora'];
  var SECOES_INTERNAS = ['registros', 'pessoa', 'dia', 'semana', 'mes', 'pontos', 'alertas', 'relatorios', 'configuracoes',
    'imun', 'iesc', 'iserv', 'itec', 'ihora'];
  /** Primeira aba que este perfil pode ver (a Visão geral pode estar desligada nas Configurações). */
  function primeiraAbaVisivel() {
    for (var i = 0; i < botoes.length; i++) {
      var n = botoes[i].getAttribute('data-aba');
      if (n && abaValida(n)) return n;
    }
    return 'geral';
  }

  function abaValida(nome) {
    if (nome === 'registros' || nome === 'pontos' || SECOES_MODULO.indexOf(nome) >= 0) nome = 'insercoes';
    if (window.MODO_PUBLICO && ABAS_FORA_DO_PUBLICO.indexOf(nome) >= 0) return false;
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
    var iso = /^\d{4}-\d{2}-\d{2}$/;
    PER = { de: iso.test(est.filtros.de || '') ? est.filtros.de : '', ate: iso.test(est.filtros.ate || '') ? est.filtros.ate : '' };
    if (el('perDe')) { el('perDe').value = PER.de; el('perAte').value = PER.ate; }
    pag = 1;
    popularFiltros();
    sincronizarAno();
    invalidar();
    abrirAba(abaValida(est.aba) ? est.aba : primeiraAbaVisivel(), { semUrl: true });
  }

  /* -------------------------------------------------------------------- abas */
  var botoes = [];
  function abrirAba(nome, opc) {
    opc = opc || {};
    // "Registros" virou uma visão dentro de "Inserções"
    if (nome === 'registros') { insSecao = 'registros'; nome = 'insercoes'; }
    if (nome === 'pontos') { insSecao = 'pontos'; nome = 'insercoes'; }
    if (SECOES_MODULO.indexOf(nome) >= 0) { insSecao = nome; nome = 'insercoes'; }
    // um cartão de "Ver detalhes" pode apontar para uma aba que o público não tem
    if (window.MODO_PUBLICO && ABAS_FORA_DO_PUBLICO.indexOf(nome) >= 0) nome = 'geral';
    // aba desligada nas Configurações para este perfil: cai na primeira que ele pode ver
    var alvoBtn = botoes.filter(function (b) { return b.getAttribute('data-aba') === nome; })[0];
    if (alvoBtn && alvoBtn.getAttribute('data-oculta-lista')) nome = primeiraAbaVisivel();
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
    // aba escolhida dentro de "Mostrar mais": o botão do menu fica aceso
    var maisBtn = el('abaMaisBtn');
    if (maisBtn) maisBtn.classList.toggle('ativa', !!document.querySelector('#abaMaisMenu .aba.ativa'));
    fecharMais();
    // "Lançamento" é um formulário de cadastro, não um relatório: os filtros
    // da lateral (que recortam os gráficos) não fazem sentido nela e só
    // tomavam espaço da tela.
    if (nome === 'insercoes') escolherInsSecao(insSecao);
    atualizarFiltros();
    if (!opc.semUrl) gravarUrl(true);
    // desenha só se esta aba está desatualizada; voltar a uma já pronta é grátis
    if (TODOS.length && SUJAS[nome] !== false) render();
    window.scrollTo(0, 0);
  }

  /* "Mostrar mais": menu em posição fixa (a barra rola na horizontal e cortaria
     um menu absoluto). Fecha ao escolher uma aba, ao clicar fora e com Esc. */
  function fecharMais() {
    var menu = el('abaMaisMenu'), btn = el('abaMaisBtn');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function ligarMais() {
    var menu = el('abaMaisMenu'), btn = el('abaMaisBtn');
    if (!menu || !btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!menu.hidden) { fecharMais(); return; }
      var r = btn.getBoundingClientRect();
      menu.hidden = false;
      menu.style.top = Math.round(r.bottom + 4) + 'px';
      // alinhado à direita do botão quando não couber para o lado direito
      var esq = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8);
      menu.style.left = Math.max(8, Math.round(esq)) + 'px';
      btn.setAttribute('aria-expanded', 'true');
    });
    // "Pessoas" abre uma janela que mora na aba de lançamentos: a aba precisa estar
    // aberta antes (captura: roda antes do clique do próprio botão)
    menu.addEventListener('click', function (e) {
      if (!e.target.closest('#lancPessoasBtn')) return;
      if (abaAtiva !== 'lancamento') abrirAba('lancamento');
      fecharMais();
    }, true);
    document.addEventListener('click', function (e) { if (!e.target.closest('#abaMais')) fecharMais(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { fecharMais(); btn.focus(); } });
    window.addEventListener('resize', fecharMais);
  }

  /** Setas, Home e End percorrem as abas, como manda o padrão de tablist. */
  function ligarTeclasAbas() {
    el('abas').addEventListener('keydown', function (e) {
      var visiveis = botoes.filter(function (b) { return !b.hidden && b.offsetParent; });   // fora as do menu fechado
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
  /* A conta responsável (root@root.com) entra como admin sozinha: as abas de
     Admin aparecem no menu lateral sem clicar em nada. Publicar continua pedindo
     a senha (ver publicar). Outras contas só chegam aqui pelo botão Admin do
     cabeçalho (celular), que pede a senha. */
  function ehResponsavelLogado() {
    try { return !!(window.ADMIN_AUTH && ADMIN_AUTH.papel && ADMIN_AUTH.papel() === 'responsavel'); } catch (e) { return false; }
  }
  function ehAdmin() {
    if (window.MODO_PUBLICO) return false;
    if (ehResponsavelLogado()) return true;
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
    // visibilidade configurada (Configurações): público e usuário logado que não é root; root vê tudo
    if (window.PainelPublico) {
      window.PainelPublico.aplicarVisibilidade({ publico: !!window.MODO_PUBLICO, root: ehResponsavelLogado() });
    }
    el('adminBtn').innerHTML = on ? '&#9989;<span>Admin (sair)</span>' : '&#128274;<span>Admin</span>';
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
      abrirAba('insercoes');
    });
  }

  function aviso(alvo, classe, html) {
    el(alvo).innerHTML = '<p class="aviso ' + classe + '">' + html + '</p>';
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
    // nomes dos produtores sempre na mesma regra (João Silva de Souza), seja qual for a grafia da planilha
    if (window.LANC_NOMES) TODOS.forEach(function (r) {
      if (r.prod) r.prod = window.LANC_NOMES.formatar(r.prod, 'nome');
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
  }

  /* ------------------------------------------------------------- auditoria */
  /** Registra no log do sistema (js/admin-auth.js) quem exportou ou alterou algo. Só com login. */
  function auditar(acao, descricao) {
    try {
      if (window.MODO_PUBLICO || !window.ADMIN_AUTH || !ADMIN_AUTH.registrarEvento) return;
      ADMIN_AUTH.registrarEvento(acao, 'painel-mecanizacao', descricao);
    } catch (e) { /* auditoria é opcional */ }
  }
  if (window.PainelExport) {
    window.PainelExport.aoBaixar = function (base, n, formato) {
      auditar('exportar', 'Exportou "' + base + '" (' + n + ' linha(s), ' + (formato === 'xls' ? 'Excel' : 'CSV') + ')');
    };
  }

  /* link público (abas liberadas, senha, configuração): js/painel-publico.js */

  /* ------------------------------------- período livre, visões, exportar, atualizar */
  var CHAVE_FAV = 'seagri_visoes_painel';
  var ULTIMA_CARGA = null, TIMER_AUTO = null, CARREGANDO = false;
  var INTERVALO_AUTO = 5 * 60 * 1000;

  function hhmm(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function pintarAtualizado() {
    var a = el('atualizadoEm');
    if (!a) return;
    if (!ULTIMA_CARGA) { a.textContent = 'Dados: carregando…'; return; }
    var min = Math.floor((Date.now() - ULTIMA_CARGA.getTime()) / 60000);
    a.textContent = 'Dados de ' + hhmm(ULTIMA_CARGA) + (min >= 1 ? ' (há ' + min + ' min)' : ' (agora)');
  }
  function recarregarDados() {
    if (CARREGANDO) return;
    CARREGANDO = true;
    var b = el('btnAtualizar');
    if (b) { b.disabled = true; b.textContent = 'Atualizando…'; }
    // só pede a base inteira se ela mudou desde a última leitura (carga incremental)
    // se a base na tela já veio dos lançamentos (ao vivo ou do cache local), uma falha de rede NÃO a troca pelo arquivo
    // publicado, que é bem menor e mais antigo: mantém o que está na tela e avisa
    lerLancamentos(true).catch(function (e) {
      if (FONTE === 'lancamentos') throw e;
      return carregarArquivo();
    }).then(limparParaPublico).then(function (res) {
      if (res.igual) { ULTIMA_CARGA = new Date(); pintarAtualizado(); return; }
      if (!res.pacote || !res.pacote.registros) throw new Error('sem dados');
      usarPacote(res.pacote, res.fonte, true);
      render();
      gravarUrl(false);
      ULTIMA_CARGA = new Date();
      pintarAtualizado();
    }).catch(function () {
      var a = el('atualizadoEm');
      if (a) a.textContent = 'Não foi possível atualizar agora';
    }).then(function () {
      CARREGANDO = false;
      if (b) { b.disabled = false; b.textContent = 'Atualizar agora'; }
    });
  }

  function lerFavoritos() {
    try { var v = JSON.parse(localStorage.getItem(CHAVE_FAV) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function gravarFavoritos(l) {
    try { localStorage.setItem(CHAVE_FAV, JSON.stringify(l)); } catch (e) { /* modo privado */ }
  }
  function pintarFavoritos(escolhido) {
    var s = el('favSel');
    if (!s) return;
    s.innerHTML = '<option value="">Escolher…</option>' + lerFavoritos().map(function (f, i) {
      return '<option value="' + i + '">' + G.esc(f.nome) + '</option>';
    }).join('');
    if (escolhido != null) s.value = String(escolhido);
  }

  function linhasRegistros(L) {
    return L.map(function (r) {
      return [dataBR(r.d), r.dv ? dataBR(r.dv) : '', r.pc, r.prod || '', r.propr || '', r.mun || '', r.esc || '', r.rt || '',
        r.cult.map(function (c) { return c[0] + (c[1] ? ' (' + String(c[1]).replace('.', ',') + ' ha)' : ''); }).join('; '),
        r.ha ? String(r.ha).replace('.', ',') : '', r.hrs ? String(r.hrs).replace('.', ',') : '', r.ac || '',
        r.maq.join('; '), r.impl.join('; '), r.dae ? String(r.dae).replace('.', ',') : '', r.form || ''];
    });
  }
  var CAB_REGISTROS = ['Inserção', 'Vistoria', 'Serviço', 'Produtor', 'Propriedade', 'Município', 'Escritório', 'Responsável técnico',
    'Culturas', 'Área (ha)', 'Horas', 'Tanques', 'Máquinas', 'Implementos', 'DAE (R$)', 'Formulário'];

  function ligarFase1() {
    var de = el('perDe'), ate = el('perAte');
    if (de && ate) {
      var aoMudarPeriodo = function () {
        PER = { de: de.value || '', ate: ate.value || '' };
        if (PER.de && PER.ate && PER.de > PER.ate) { PER = { de: PER.ate, ate: PER.de }; de.value = PER.de; ate.value = PER.ate; }
        pag = 1;
        popularFiltros();
        atualizar();
      };
      de.addEventListener('change', aoMudarPeriodo);
      ate.addEventListener('change', aoMudarPeriodo);
    }
    var b = el('btnAtualizar');
    if (b) b.addEventListener('click', recarregarDados);
    // recarrega sozinho, só com a aba visível
    TIMER_AUTO = setInterval(function () {
      if (document.visibilityState === 'visible' && TODOS.length) recarregarDados();
      else pintarAtualizado();
    }, INTERVALO_AUTO);
    setInterval(pintarAtualizado, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && ULTIMA_CARGA && Date.now() - ULTIMA_CARGA.getTime() > INTERVALO_AUTO) recarregarDados();
    });

    var imp = el('btnImprimir');
    if (imp) imp.addEventListener('click', function () { auditar('exportar', 'Imprimiu / salvou em PDF a aba "' + abaAtiva + '"'); window.print(); });


    // visões salvas
    pintarFavoritos();
    var sel = el('favSel');
    if (sel) sel.addEventListener('change', function () {
      var f = lerFavoritos()[+sel.value];
      if (!f) return;
      try { history.pushState(null, '', f.hash); } catch (e) { location.hash = f.hash; return; }
      aplicarEstado(lerHash());
      gravarUrl(false);
    });
    var sv = el('favSalvar');
    if (sv) sv.addEventListener('click', function () {
      var nome = window.prompt('Nome desta visão (filtros e aba atuais):', '');
      if (!nome || !nome.trim()) return;
      nome = nome.trim().slice(0, 60);
      var l = lerFavoritos().filter(function (f) { return f.nome.toLowerCase() !== nome.toLowerCase(); });
      l.push({ nome: nome, hash: estadoParaHash() });
      gravarFavoritos(l);
      pintarFavoritos(l.length - 1);
    });
    var ex = el('favExcluir');
    if (ex) ex.addEventListener('click', function () {
      var l = lerFavoritos(), i = sel ? +sel.value : -1;
      if (!sel || sel.value === '' || !l[i]) return;
      if (!window.confirm('Excluir a visão "' + l[i].nome + '"?')) return;
      l.splice(i, 1);
      gravarFavoritos(l);
      pintarFavoritos();
    });

    // exportação dos registros filtrados (todos, não só a página)
    ['regCsv', 'regXls'].forEach(function (id) {
      var bt = el(id);
      if (!bt || !window.PainelExport) return;
      bt.addEventListener('click', function () {
        window.PainelExport.baixar('registros', CAB_REGISTROS, linhasRegistros(LISTA_REG), id === 'regCsv' ? 'csv' : 'xls');
      });
    });
  }

  /* -------------------------------------------------------- carregar dados */
  /* Fonte principal: os LANÇAMENTOS do sistema (ação "painel" do servidor), no
     mesmo formato de data/mecanizacao.json. Assim o que foi lançado aparece no
     painel na hora, sem republicar planilha. Se o servidor não responder, cai no
     arquivo publicado (data/mecanizacao.json) e depois nos demais. */
  var VERSAO_BASE = '';   // versão da base que já está na tela: o servidor responde "igual" se não mudou

  /** Resposta do servidor (banco ou função de borda) -> o que o painel usa. Guarda a versão e o cache local. */
  function aceitarResposta(c, comVersao) {
    if (c && c.ok && c.igual && comVersao) return { igual: true, fonte: 'lancamentos' };
    if (!c || !c.ok || !Array.isArray(c.registros) || !c.registros.length) throw new Error('sem lançamentos');
    if (c.versao) VERSAO_BASE = c.versao;
    var pacote = { meta: c.meta || {}, registros: c.registros };
    cacheGravar(c.versao || '', pacote);
    return { pacote: pacote, fonte: 'lancamentos' };
  }

  /* Leitura DIRETO no banco: mecanizacao_painel() (database/mecanizacao-painel-rpc.sql) devolve o painel já montado e em
     cache numa chamada só. Antes era: função de borda (arranque a frio + checagem de sessão + 5 consultas em sequência
     + montagem em JavaScript), ~3,5 s. Se o SQL ainda não foi aplicado (404) ou falhar, cai na função de borda. */
  function lerPeloBanco(comVersao) {
    var cfg = window.BANCO_CONFIG || {};
    if (!cfg.url || !cfg.chavePublica) return Promise.reject(new Error('sem banco'));
    var auth = window.ADMIN_AUTH;
    // a versão pública nunca manda o token: só a chave pública (recebe a versão pública, sem endereço nem link do formulário)
    var sessao = (!window.MODO_PUBLICO && auth && auth.garantirSessao)
      ? auth.garantirSessao().catch(function () { return null; }) : Promise.resolve(null);
    return sessao.then(function (s) {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
      return fetch(String(cfg.url).replace(/\/$/, '') + '/rest/v1/rpc/mecanizacao_painel', {
        method: 'POST', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
        headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json', Authorization: 'Bearer ' + ((s && s.access_token) || cfg.chavePublica) },
        body: JSON.stringify(comVersao && VERSAO_BASE ? { p_versao: VERSAO_BASE } : {})
      }).then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error('banco ' + r.status);
        return r.json();
      }, function (e) { clearTimeout(t); throw e; });
    }).then(function (c) { return aceitarResposta(c, comVersao); });
  }

  function lerPelaFuncao(comVersao) {
    var enviar = window.LANCAMENTO_CAMPOS && window.LANCAMENTO_CAMPOS.enviar;
    if (!enviar) return Promise.reject(new Error('sem cliente'));
    var fd = new FormData();
    fd.append('acao', 'painel');
    if (comVersao && VERSAO_BASE) fd.append('versao', VERSAO_BASE);
    // a versão pública nunca manda o token: não recebe endereço nem link do formulário
    if (!window.MODO_PUBLICO) {
      var sessao = window.ADMIN_AUTH && window.ADMIN_AUTH.sessaoAtual && window.ADMIN_AUTH.sessaoAtual();
      if (sessao && sessao.access_token) fd.append('token', sessao.access_token);
    }
    var limite = new Promise(function (_, falha) { setTimeout(function () { falha(new Error('tempo esgotado')); }, 25000); });
    return Promise.race([enviar(fd), limite]).then(function (res) { return aceitarResposta(res && res.corpo, comVersao); });
  }

  function lerLancamentos(comVersao) {
    return lerPeloBanco(comVersao).catch(function () { return lerPelaFuncao(comVersao); });
  }

  /* ----------------------------------------------------- cache local (IndexedDB)
     Guarda o último pacote recebido, com a versão. Na próxima abertura o painel desenha NA HORA com ele e só depois
     pergunta ao servidor se a versão mudou (resposta de poucos bytes quando não mudou): abre sem esperar a rede.
     É um cache por perfil (p = público, i = logado). O do logado vale 12 h e é apagado ao sair da conta. */
  var IDB_NOME = 'seagri_mecanizacao', IDB_LOJA = 'painel', CACHE_FORMATO = 2;
  function chaveCache() { return window.MODO_PUBLICO ? 'p' : 'i'; }
  function idbAbrir() {
    return new Promise(function (ok, falha) {
      try {
        var q = indexedDB.open(IDB_NOME, 1);
        q.onupgradeneeded = function () { q.result.createObjectStore(IDB_LOJA); };
        q.onsuccess = function () { ok(q.result); };
        q.onerror = function () { falha(q.error); };
        q.onblocked = function () { falha(new Error('bloqueado')); };
      } catch (e) { falha(e); }
    });
  }
  function cacheLer() {
    var chave = chaveCache();
    return idbAbrir().then(function (db) {
      return new Promise(function (ok) {
        var g = db.transaction(IDB_LOJA, 'readonly').objectStore(IDB_LOJA).get(chave);
        g.onsuccess = function () {
          var c = g.result;
          db.close();
          var validade = chave === 'i' ? 12 * 3600 * 1000 : 14 * 24 * 3600 * 1000;
          if (!c || c.formato !== CACHE_FORMATO || !c.texto || !c.versao || Date.now() - c.em > validade) return ok(null);
          // o logado só reaproveita o cache se ainda há sessão
          if (chave === 'i' && !(window.ADMIN_AUTH && ADMIN_AUTH.sessaoAtual && ADMIN_AUTH.sessaoAtual())) return ok(null);
          try { ok({ versao: c.versao, pacote: JSON.parse(c.texto) }); } catch (e) { ok(null); }
        };
        g.onerror = function () { db.close(); ok(null); };
      });
    }).catch(function () { return null; });
  }
  function cacheGravar(versao, pacote) {
    if (!versao) return;
    var chave = chaveCache();
    var agendar = window.requestIdleCallback || function (f) { return setTimeout(f, 400); };
    agendar(function () {
      try {
        var texto = JSON.stringify(pacote);
        idbAbrir().then(function (db) {
          var t = db.transaction(IDB_LOJA, 'readwrite');
          t.objectStore(IDB_LOJA).put({ formato: CACHE_FORMATO, versao: versao, em: Date.now(), texto: texto }, chave);
          t.oncomplete = t.onerror = t.onabort = function () { db.close(); };
        }).catch(function () { /* sem cache: segue normal */ });
      } catch (e) { /* sem cache */ }
    });
  }
  function cacheLimpar(chave) {
    idbAbrir().then(function (db) {
      var t = db.transaction(IDB_LOJA, 'readwrite');
      t.objectStore(IDB_LOJA).delete(chave);
      t.oncomplete = t.onerror = t.onabort = function () { db.close(); };
    }).catch(function () { /* nada */ });
  }
  // saiu da conta: o cache do logado (nomes, endereços, coordenadas) não fica no aparelho
  window.addEventListener('admin-auth-atualizado', function () {
    if (!window.MODO_PUBLICO && !(window.ADMIN_AUTH && ADMIN_AUTH.sessaoAtual && ADMIN_AUTH.sessaoAtual())) cacheLimpar('i');
  });

  /** Na versão pública, endereço e link do formulário não aparecem nem se vierem do arquivo de apoio. */
  function limparParaPublico(res) {
    if (window.MODO_PUBLICO && res && res.pacote && Array.isArray(res.pacote.registros)) {
      res.pacote.registros.forEach(function (r) { r.loc = ''; r.form = ''; });
    }
    return res;
  }

  function carregarDados() {
    return lerLancamentos().catch(function () { return carregarArquivo(); }).then(limparParaPublico);
  }

  function carregarArquivo() {
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
  (function ligarLinkPublico() {
    /* Dois links para o mesmo painel público. O WEB é sempre o do site publicado
       (GitHub Pages): é o que se manda para quem está fora. O LOCAL é o deste
       computador — o endereço de onde o painel está aberto quando ele já é local
       (localhost, 127.0.0.1 ou arquivo); aberto pela web, cai no XAMPP padrão. */
    var SITE_PUBLICADO = 'https://iadoagro.github.io/agricultura/pages/';
    var ARQ = 'mecanizacao-publico.html';
    var web = SITE_PUBLICADO + ARQ;
    var local = 'http://localhost/agricultura/pages/' + ARQ;
    try {
      if (/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) || location.protocol === 'file:') {
        local = new URL(ARQ, location.href).href;
      }
    } catch (e) { /* fica o padrão do XAMPP */ }

    function ligar(idCampo, idBotao, url) {
      var campo = el(idCampo), botao = el(idBotao);
      if (!campo || !botao) return;
      campo.value = url;
      campo.addEventListener('focus', function () { campo.select(); });
      botao.addEventListener('click', function () {
        function feito() { botao.textContent = 'Copiado!'; setTimeout(function () { botao.textContent = 'Copiar'; }, 1800); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(feito, function () { campo.select(); });
        } else {
          campo.select();
          try { if (document.execCommand('copy')) feito(); } catch (e) { /* o texto fica selecionado */ }
        }
      });
    }
    ligar('linkPublicoWeb', 'linkPublicoWebCopiar', web);
    ligar('linkPublicoLocal', 'linkPublicoLocalCopiar', local);

    /* Ativar/desativar o link público: o estado fica no Supabase (lido por
       mecanizacao_publico_config_publica, gravado por mecanizacao_link_ativo_definir).
       Para trocar, pede a senha do root: ela entra no Supabase como
       root@root.com e o token resultante autoriza a gravação. */
    var bolinha = el('linkPublicoBolinha'), estadoTxt = el('linkPublicoEstadoTxt'),
      btnRevogar = el('linkPublicoRevogarBtn'), senhaBox = el('linkPublicoSenhaBox'),
      campoSenha = el('linkPublicoSenha'), btnOk = el('linkPublicoSenhaOk'),
      btnCancelar = el('linkPublicoSenhaCancelar'), erro = el('linkPublicoErro');
    if (!bolinha || !btnRevogar) return;
    var ativo = true, pendente = false;

    function pintarEstado() {
      bolinha.classList.toggle('ativo', ativo);
      bolinha.classList.toggle('revogado', !ativo);
      estadoTxt.textContent = ativo
        ? 'Ativo — quem tiver o endereço consegue abrir.'
        : 'Desativado — quem tiver o endereço vê um aviso, sem ver os dados.';
      btnRevogar.textContent = ativo ? 'Desativar link' : 'Reativar link';
    }
    function fecharSenha() { senhaBox.hidden = true; erro.textContent = ''; campoSenha.value = ''; }

    var BANCO = window.BANCO_CONFIG || {}, BASE = String(BANCO.url || '').replace(/\/$/, '');
    fetch(BASE + '/rest/v1/rpc/mecanizacao_publico_config_publica', {
      method: 'POST', cache: 'no-store', body: '{}',
      headers: { apikey: BANCO.chavePublica, 'Content-Type': 'application/json' }
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { ativo = !j || j.ativo !== false; pintarEstado(); })
      .catch(function () { pintarEstado(); });   // sem resposta: fica "ativo" (padrão)

    btnRevogar.addEventListener('click', function () {
      erro.textContent = ''; campoSenha.value = ''; senhaBox.hidden = false;
      setTimeout(function () { campoSenha.focus(); }, 30);
    });
    btnCancelar.addEventListener('click', fecharSenha);
    campoSenha.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); btnOk.click(); }
      else if (e.key === 'Escape') fecharSenha();
    });
    btnOk.addEventListener('click', function () {
      if (pendente) return;
      var novoEstado = !ativo;
      pendente = true; btnOk.disabled = true; erro.textContent = '';
      var cab = { apikey: BANCO.chavePublica, 'Content-Type': 'application/json' };
      fetch(BASE + '/auth/v1/token?grant_type=password', {
        method: 'POST', headers: cab, body: JSON.stringify({ email: 'root@root.com', password: campoSenha.value })
      }).then(function (r) {
        if (r.status === 400 || r.status === 401 || r.status === 422) return { senhaErrada: true };
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().then(function (t) {
          cab.Authorization = 'Bearer ' + t.access_token;
          return fetch(BASE + '/rest/v1/rpc/mecanizacao_link_ativo_definir', {
            method: 'POST', headers: cab, body: JSON.stringify({ p_ativo: novoEstado })
          }).then(function (r2) {
            if (!r2.ok) throw new Error('HTTP ' + r2.status);
            return { ativo: novoEstado };
          });
        });
      }).then(function (j) {
        pendente = false; btnOk.disabled = false;
        if (j.senhaErrada) {
          erro.textContent = 'Senha de administrador incorreta.';
          campoSenha.value = ''; campoSenha.focus();
          return;
        }
        ativo = j.ativo;
        pintarEstado();
        fecharSenha();
      }).catch(function () {
        pendente = false; btnOk.disabled = false;
        erro.textContent = 'Falha de conexão com o servidor.';
      });
    });
  })();
  // o perfil da conta chega depois da página: reaplica quando ele muda
  window.addEventListener('admin-auth-atualizado', aplicarAdmin);
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
  el('relatorioGeral').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-geral]');
    if (!btn) return;
    var modo = btn.getAttribute('data-geral');
    if (modo === 'slides') abrirApresentacaoGeral(filtrar());
    else baixarPdfGeral(filtrar(), modo);
  });
  /* Busca do dia a dia: só a tabela é refeita, não a aba inteira — os
     gráficos ao lado mostram o período todo, e piscar a cada tecla seria
     trabalho jogado fora. */
  ligarCalendarios();
  el('insNav').addEventListener('click', function (e) {
    // "Pessoas" abre uma janela que mora na aba de lançamentos: a aba precisa
    // estar aberta antes (captura: roda antes do clique do próprio botão)
    if (e.target.closest('#lancPessoasBtn')) {
      if (abaAtiva !== 'lancamento') abrirAba('lancamento');
      return;
    }
    var b = e.target.closest('button[data-sec]');
    if (!b) return;
    escolherInsSecao(b.getAttribute('data-sec'));
    window.scrollTo(0, 0);
  }, true);
  // "Limpar filtros" da faixa de "Mostrar mais": é o mesmo botão da lateral (que fica escondida nestas visões)
  el('insSelLimpar').addEventListener('click', function () { el('btnLimpar').click(); });
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
  ligarMais();
  ligarFase1();

  /* Base e regras do painel para o assistente de perguntas (js/assistente-dados.js).
     Só leitura: ele consulta a mesma base já carregada, sem os filtros da lateral. */
  window.PAINEL_DADOS = {
    registros: function () { return TODOS; },
    // base já recortada pelos filtros da lateral (usada pelo assistente, se a pessoa pedir)
    registrosFiltrados: function () { return filtrar(); },
    chaveSelecao: function () { return JSON.stringify([F, PER]); },
    dataRef: dataRef, anoDe: anoDe, regionalDe: regionalDe, chaveProdutor: chaveProdutor,
    regionais: function () { return REGIONAIS.map(function (r) { return r.nome; }); },
    MEC: MEC, ACU: ACU,
    historicoCarregado: function () { return !!window.DADOS_MECANIZACAO_HISTORICO; }
  };

  /* API para abas que moram em arquivos próprios (js/painel-*.js). Cada uma se
     registra com registrarAba(nome, fn); fn(C) roda quando a aba é aberta ou a
     seleção muda, como as abas internas. */
  window.PAINEL_API = {
    G: G,
    registros: function () { return TODOS; },
    anos: function () { return ANOS.slice(); },
    filtros: function () { return F; },
    periodoLivre: function () { return PER; },
    filtrar: filtrar,
    anoDe: anoDe, dataRef: dataRef, regionalDe: regionalDe,
    MEC: MEC, ACU: ACU, NI: NI,
    soma: soma, somarPor: somarPor, contar: contar, nProdutores: nProdutores, chaveProdutor: chaveProdutor,
    tiles: tiles, pintarSerie: pintarSerie, pintarCat: pintarCat, ranking: ranking,
    abrirAba: abrirAba, aba: function () { return abaAtiva; },
    invalidar: invalidar,
    ehResponsavel: ehResponsavelLogado, ehAdmin: ehAdmin,
    modoPublico: function () { return !!window.MODO_PUBLICO; },
    registrarAba: function (nome, fn) { ABAS[nome] = fn; SUJAS[nome] = true; },
    auditar: auditar,
    recarregar: function () { recarregarDados(); },
    carregarPdf: carregarPdf,
    aoCarregar: function (fn) { if (TODOS.length) fn(); else AO_CARREGAR.push(fn); },
    redesenhar: function () { invalidar(); render(); }
  };
  var AO_CARREGAR = [];

  /* Partida: a conferência da configuração (e da senha, no link público) e a leitura dos dados andam JUNTAS — antes
     uma esperava a outra. Os dados só aparecem na tela depois que a configuração liberar. */
  function carregarInicial() {
    return cacheLer().then(function (c) {
      if (c && c.pacote && Array.isArray(c.pacote.registros) && c.pacote.registros.length) {
        VERSAO_BASE = c.versao;
        return limparParaPublico({ pacote: c.pacote, fonte: 'lancamentos', deCache: true });
      }
      return carregarDados();
    });
  }
  var porta = window.PainelPublico ? window.PainelPublico.preparar() : Promise.resolve();
  var inicial = carregarInicial();
  inicial.catch(function () { /* tratado abaixo */ });
  porta.then(function () { return inicial; }).then(function (res) {
    if (!res.pacote || !res.pacote.registros) {
      document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
        '<p class="aviso erro">Não foi possível carregar os dados de mecanização.</p>');
      return;
    }
    usarPacote(res.pacote, res.fonte);
    aplicarEstado(lerHash());
    gravarUrl(false);   // deixa a URL refletir a seleção já no primeiro desenho
    ULTIMA_CARGA = new Date();
    pintarAtualizado();
    AO_CARREGAR.splice(0).forEach(function (fn) { try { fn(); } catch (e) { /* aba extra não derruba o painel */ } });
    // desenhou com o cache local: confere com o servidor em segundo plano (só baixa de novo se a versão mudou)
    if (res.deCache) recarregarDados();

    /* Só agora o histórico: o painel já está desenhado e utilizável. Ao chegar,
       a base é remontada mantendo a seleção e o seletor de período ganha os
       exercícios encerrados. */
    // vindo dos lançamentos, o pacote já traz todos os anos: o arquivo do histórico é dispensável
    if (res.fonte === 'lancamentos') return;
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
