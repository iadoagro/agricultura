/* Ícones agro do sistema: culturas, máquinas e implementos.
   Conjunto próprio (desenhado para este projeto, sem biblioteca externa), todos em 24x24 no mesmo traço:
   contorno arredondado em "currentColor" e um preenchimento suave nas formas principais (classe "f").
   O estilo vem de css/icones-agro.css.

   Uso:
     ICONES_AGRO.svg('milho')                       -> '<svg class="ia" ...>…</svg>' (herda a cor do texto)
     ICONES_AGRO.svg('trator-esteira', { tamanho: 32, cor: true })   -> com a cor própria do ícone
     ICONES_AGRO.chave('Milho - safrinha')           -> 'milho'   (reconhece os nomes usados nas fichas)
     ICONES_AGRO.chave('Escavadeira hidráulica')     -> 'escavadeira'
     ICONES_AGRO.rotulado('Soja - safra')            -> ícone colorido + o nome, pronto para listas e tabelas
     ICONES_AGRO.lista()                             -> [{ chave, nome, grupo, cor }] (catálogo: pages/icones-agro.html) */
(function () {
  'use strict';

  /* chave: [nome, grupo, cor, miolo do SVG]. Classe "f" = preenchimento suave. */
  var D = {
    /* ----------------------------------------------------------- culturas */
    'pastagem': ['Pastagem', 'cultura', '#16a34a',
      '<path d="M3 20h18"/><path d="M6 20c0-4 .5-7 2.5-10M9.5 20c0-5 1-9 4-13M13.5 20c0-4 .5-6 3-9M17 20c0-2 .5-4 2-6"/><path class="f" d="M13.5 7c.5 1.5.2 3-1 4.5C11.5 10 11.8 8.3 13.5 7z"/>'],
    'pastagem-corte': ['Pastagem - Corte', 'cultura', '#b45309',
      '<path class="f" d="M7 10c0-3 2-5 5-5s5 2 5 5v3c0 2.5-2 4.5-5 4.5S7 15.5 7 13z"/><path d="M7 8C5.5 8 4 7 3.5 5M17 8c1.5 0 3-1 3.5-3"/><path d="M10 12.5h.01M14 12.5h.01"/><path d="M10 15.5c1.2.8 2.8.8 4 0"/><path d="M3 21h18"/>'],
    'pastagem-leite': ['Pastagem - Leite', 'cultura', '#0284c7',
      '<path class="f" d="M12 3c2.6 3.2 4.5 5.7 4.5 8.2a4.5 4.5 0 01-9 0C7.5 8.7 9.4 6.2 12 3z"/><path d="M3 21h18"/><path d="M5.5 21c0-2 .5-3.5 1.5-4.5M18.5 21c0-2-.5-3.5-1.5-4.5M12 21v-3"/>'],
    'milho': ['Milho', 'cultura', '#ca8a04',
      '<path class="f" d="M12 3c3 0 4.5 3.5 4.5 7.5S15 18 12 18s-4.5-3.5-4.5-7.5S9 3 12 3z"/><path d="M9.5 8h5M8.2 11h7.6M9.5 14h5M12 3v15"/><path d="M12 21c-4 0-6-3-6-7 2 1 4 2 6 4 2-2 4-3 6-4 0 4-2 7-6 7z"/>'],
    'soja': ['Soja', 'cultura', '#65a30d',
      '<path class="f" d="M4 19C3 11 8 5 20 5c1 8-4 14-16 14z"/><circle cx="8.8" cy="14.6" r="1.6"/><circle cx="12.2" cy="11.8" r="1.6"/><circle cx="15.6" cy="9" r="1.6"/><path d="M20 5l1.5-2M4 19l-1.5 2"/>'],
    'feijao': ['Feijão', 'cultura', '#92400e',
      '<path class="f" d="M7 5.5c3-2.5 8-1.5 10 2.5 2 4 1 9-3 11-4 1.2-6.5-.8-6.500-4 0-2.200 2.500-3.200 2-5.500-.4-1.800-3.200-2.500-2.500-4z"/><path d="M13.500 8c1.200 1.200 2 2.800 2 4.500"/>'],
    'mandioca': ['Mandioca', 'cultura', '#a16207',
      '<path class="f" d="M4.500 19.500c-1.200-1.200-1.200-2.500 0-3.700l8.500-8.500c1.500-1.500 4-1.500 5 0 .6 1-.5 2.600-1.600 3.700l-8.500 8.500c-1.100 1.100-2.400 1.100-3.400 0z"/><path d="M9.500 12.500l2 2M12.500 9.500l2 2"/><path d="M17.500 5.500l3-2.500M17 8l4.500-.5M15.500 4l1-2.500"/>'],
    'acai': ['Açaí', 'cultura', '#6d28d9',
      '<path d="M12 21V12"/><path class="f" d="M12 10C8 10 5 8 4 5c4 0 7 2 8 5zM12 10c4 0 7-2 8-5-4 0-7 2-8 5z"/><path d="M12 10c-1-3 0-5 0-7 .5 2 1 4 0 7z"/><circle cx="9.800" cy="14" r="1.400"/><circle cx="14.200" cy="14" r="1.400"/><circle cx="12" cy="16.800" r="1.400"/>'],
    'pupunha': ['Pupunha', 'cultura', '#ea580c',
      '<path d="M12 21V11"/><path d="M10.500 14h3M10.500 17h3M10.500 20h3"/><path class="f" d="M12 10C8 10 5 8 4 5c4 0 7 2 8 5zM12 10c4 0 7-2 8-5-4 0-7 2-8 5z"/><path d="M12 10c-1-3 0-5 0-7 .5 2 1 4 0 7z"/>'],
    'seringueira': ['Seringueira', 'cultura', '#15803d',
      '<path d="M12 22V12"/><path class="f" d="M6.500 11a5.500 5 0 1111 0c0 1.800-2.400 3-5.500 3s-5.500-1.200-5.500-3z"/><path d="M12 17l-2-1.500M12 19l2-1.500"/><path class="f" d="M16.500 15.500c1.200 1.400 1.800 2.300 1.800 3a1.800 1.800 0 01-3.600 0c0-.7.600-1.600 1.800-3z"/>'],
    'banana': ['Banana', 'cultura', '#ca8a04',
      '<path class="f" d="M5 6c-.5 8 4 13.500 12 14.500 1.500.2 2.500-.5 2.500-1C13 18.500 9.500 14 10.500 5.500z"/><path d="M10.500 5.500c.5-1.500 0-2.500-.5-3M5 6c-1-.5-1.500-1.500-1.500-2.500"/><path d="M8 7.500c.8 5 4 9 9.500 11"/>'],
    'cafe': ['Café', 'cultura', '#78350f',
      '<ellipse class="f" cx="12" cy="12" rx="5.200" ry="8.200" transform="rotate(35 12 12)"/><path d="M9 7.500c4 .8 2 4.500 3.200 5.500s.200 3.300 3.300 4"/>'],
    'laranja': ['Laranja', 'cultura', '#ea580c',
      '<circle class="f" cx="12" cy="13.500" r="7.500"/><path d="M12 6v2"/><path d="M12 6c0-2 1.500-3.200 3.500-3.200 0 2-1.500 3.500-3.500 3.200z"/><path d="M8.500 12c.800-1.600 2-2.400 3.500-2.600"/>'],
    'limao': ['Limão', 'cultura', '#65a30d',
      '<path class="f" d="M3 12.500c0-2 1-3 2.500-3.500C7.500 8 9.500 6.500 12 6.500s4.500 1.500 6.500 2.500c1.500.5 2.500 1.500 2.500 3.500s-1 3-2.500 3.500c-2 1-4 2.500-6.500 2.500s-4.500-1.500-6.500-2.500C4 15.500 3 14.500 3 12.500z" transform="rotate(-25 12 12)"/><path d="M16.500 5.500c.8-1.800 2.200-2.500 4-2.500 0 1.800-1.200 3.200-4 2.500z"/>'],
    'maracuja': ['Maracujá', 'cultura', '#9333ea',
      '<circle class="f" cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="5"/><path d="M12 9.800h.01M14.100 11h.01M14.100 13.400h.01M12 14.500h.01M9.900 13.400h.01M9.900 11h.01"/>'],
    'graviola': ['Graviola', 'cultura', '#16a34a',
      '<path class="f" d="M12 4c5 0 8 4 8 9 0 5-4 8.500-9 8.500S4 18 4 13c0-5 3-9 8-9z"/><path d="M8.500 9l1.500 1.200M12 7.500v2M15.500 9l-1.500 1.200M7 14l1.700.5M17 14l-1.700.5M12 13.500v2.500M9.500 17.500l1 .8M14.500 17.500l-1 .8"/><path d="M12 4V2"/>'],
    'abacaxi': ['Abacaxi', 'cultura', '#d97706',
      '<path class="f" d="M12 9.500c4 0 6 3 6 6.500s-2 6-6 6-6-2.500-6-6 2-6.500 6-6.500z"/><path d="M9 12.500l6 8M15 12.500l-6 8M7 16.500h10"/><path d="M12 9.500C10 8 9 5.500 10 3c1 1 1.500 2 2 3 .5-1 1-2 2-3 1 2.500 0 5-2 6.500z"/>'],
    'broto': ['Outras culturas', 'cultura', '#64748b',
      '<path d="M12 21v-9"/><path class="f" d="M12 12c0-4-3-6.500-7.500-6.500C4.500 9.500 7.500 12 12 12z"/><path class="f" d="M12 14.500c0-3 2.500-5.500 6.500-5.500 0 3.200-2.500 5.500-6.500 5.500z"/>'],

    /* ------------------------------------------------------------ máquinas */
    'trator': ['Trator agrícola', 'maquina', '#1d4ed8',
      '<path class="f" d="M3 11.500h8.500V16H3z"/><path d="M11.500 16v-9.500h5.200L19 11v5"/><path d="M14 7v4.200h4.500"/><circle class="f" cx="17.300" cy="17" r="3.800"/><circle class="f" cx="6.500" cy="18" r="2.600"/><path d="M5 11.500V7.500"/>'],
    'trator-pneu': ['Trator de pneu', 'maquina', '#1d4ed8',
      '<path class="f" d="M3 11.500h8.500V16H3z"/><path d="M11.500 16v-9.500h5.200L19 11v5"/><circle class="f" cx="17.300" cy="17" r="4"/><circle cx="17.300" cy="17" r="1.400"/><circle class="f" cx="6.500" cy="18" r="2.800"/><circle cx="6.500" cy="18" r=".8"/><path d="M5 11.500V7.500"/>'],
    'trator-esteira': ['Trator de esteira', 'maquina', '#1d4ed8',
      '<path class="f" d="M5 12h7V7.500h4.500L19 11v1"/><rect class="f" x="2.500" y="14" width="19" height="6.500" rx="3.250"/><circle cx="6.500" cy="17.250" r="1.200"/><circle cx="17.500" cy="17.250" r="1.200"/><path d="M10 17.250h4"/><path d="M5 12V8.500"/>'],
    'escavadeira': ['Escavadeira hidráulica', 'maquina', '#d97706',
      '<rect class="f" x="2.500" y="16.500" width="13" height="4.500" rx="2.250"/><path class="f" d="M5 16.500V11h6v5.500"/><path d="M11 12l5.500-7.500 3.500 1.500M16.500 4.500L19 11"/><path class="f" d="M19 11l2.500 2.500-3.500 1.500z"/>'],
    'pa-carregadeira': ['Pá carregadeira', 'maquina', '#d97706',
      '<path class="f" d="M9 16.500V11h6l2.500 3.500v2"/><path d="M12 11V7.500h3"/><path d="M9 13L4.500 14.500"/><path class="f" d="M2 12.500h4.500L5.500 18H2z"/><circle class="f" cx="11" cy="18.500" r="2.500"/><circle class="f" cx="18" cy="18.500" r="2.500"/>'],
    'retroescavadeira': ['Retroescavadeira', 'maquina', '#d97706',
      '<path class="f" d="M7 15.500V9.500h5l2 3v3"/><path d="M7 9.500V6.500h4"/><path d="M14 11.500l4.500-5.500 3 2M18.500 6l1 5"/><path class="f" d="M19.500 11l2 2-2.800 1z"/><path d="M7 14l-3 1"/><path class="f" d="M2 12.500h3.500L4.500 17H2z"/><circle class="f" cx="9.500" cy="18" r="2.800"/><circle class="f" cx="16" cy="18" r="2.200"/>'],

    /* --------------------------------------------------------- implementos */
    'grade-aradora': ['Grade aradora', 'implemento', '#475569',
      '<path d="M3 5.500h18M3 11.500h18"/><ellipse class="f" cx="5.500" cy="16" rx="1.800" ry="5"/><ellipse class="f" cx="10" cy="16" rx="1.800" ry="5"/><ellipse class="f" cx="14.500" cy="16" rx="1.800" ry="5"/><ellipse class="f" cx="19" cy="16" rx="1.800" ry="5"/>'],
    'grade-niveladora': ['Grade niveladora', 'implemento', '#475569',
      '<rect class="f" x="3" y="6" width="18" height="4.500" rx="1"/><path d="M5.500 10.500V17M9.500 10.500V17M14.500 10.500V17M18.500 10.500V17"/><path d="M3 20.500h18"/><path d="M12 6V3"/>'],
    'destoca': ['Destoca', 'mecanizacao', '#92400e',
      '<rect class="f" x="3" y="4" width="18" height="3.500" rx="1"/><path d="M6 7.500v8.500l-2 4.500M12 7.500v10.500M18 7.500v8.500l2 4.500"/><path d="M12 4V2"/>'],
    'plantadeira': ['Plantadeira', 'implemento', '#475569',
      '<path class="f" d="M5.500 3.500h13l-2.500 7.500H8z"/><path d="M12 11v6"/><circle class="f" cx="12" cy="19.500" r="2.500"/><path d="M5 17.500h.01M8 20.500h.01M16 20.500h.01M19 17.500h.01"/>'],
    'colheitadeira': ['Colheitadeira', 'implemento', '#475569',
      '<path class="f" d="M7.500 11h13.500v6H7.500z"/><path d="M12.500 11V6.500h5.500V11"/><path d="M18 8.500l4-3"/><path class="f" d="M2 11.500h5.500V18H2z"/><path d="M3.500 11.500v6.500M5 11.500v6.500"/><circle class="f" cx="11" cy="18" r="3"/><circle class="f" cx="18.500" cy="18.500" r="2.200"/>'],
    'pulverizador': ['Pulverizador', 'implemento', '#475569',
      '<rect class="f" x="4.500" y="8" width="9" height="12.500" rx="2.500"/><path d="M9 8V5.500h5l1.500 2"/><path d="M13.500 13h3l2.500-3"/><path d="M19.500 12.500h.01M21 15h.01M18.500 15.500h.01M20 10h.01M17 17.500h.01"/><path d="M7 12h4"/>'],
    'calcario': ['Jogadora de calcário', 'implemento', '#475569',
      '<path class="f" d="M5 3.500h12l-3 8H8z"/><path d="M8 14.500h6"/><path d="M11 11.500v3"/><circle class="f" cx="11" cy="19.500" r="1.800"/><path d="M3.500 17.500h.01M6.500 20h.01M16 20h.01M19 17.500h.01M20.500 14.500h.01M1.800 14.500h.01"/>'],
    'rocadeira': ['Roçadeira', 'maquina', '#475569',
      '<path d="M4 4l10 11"/><rect class="f" x="2.500" y="2.500" width="5" height="4" rx="1" transform="rotate(42 5 4.500)"/><circle class="f" cx="16.500" cy="17" r="3.800"/><path d="M13.500 14.800l6 4.400M19.500 14.800l-6 4.400"/><path d="M3.500 21h4M19 21.500h2M10 21.500h1.500"/>'],

    /* ------------------------------------------------------------- açudagem */
    'piscicultura': ['Piscicultura', 'acudagem', '#0284c7',
      '<path class="f" d="M3 12c3-4 8-5.500 13-2.500l4.500-3v11L16 14.500C11 17.500 6 16 3 12z"/><circle cx="8" cy="11.500" r=".7"/><path d="M11 9.500c.8 1.500.8 3.500 0 5"/>'],
    'tanque': ['Tanque / açude', 'acudagem', '#0284c7',
      '<ellipse class="f" cx="12" cy="14.500" rx="9.500" ry="5.500"/><path d="M6.500 14.500c1-1 2-1 3 0s2 1 3 0 2-1 3 0 2 1 2.500 0"/><path d="M5 8.500V4M7.500 9V5.500M19 8.500V4.500M16.500 9V6"/>']
  };

  /* Reconhecimento por texto (sem acento, minúsculas): primeira regra que bater vence. */
  var REGRAS = [
    ['pastagem-leite', /pastagem.*leite|leite/], ['pastagem-corte', /pastagem.*corte|corte/], ['pastagem', /pastagem|capim/],
    ['milho', /milho/], ['soja', /soja/], ['feijao', /feijao/], ['mandioca', /mandioca|macaxeira|aipim/],
    ['acai', /acai/], ['pupunha', /pupunha/], ['seringueira', /seringueira|borracha|latex/], ['banana', /banana/],
    ['cafe', /cafe/], ['laranja', /laranja/], ['limao', /limao/], ['maracuja', /maracuja/], ['graviola', /graviola/],
    ['abacaxi', /abacaxi/],
    ['trator-esteira', /esteira/], ['trator-pneu', /pneu/], ['escavadeira', /escavadeira/], ['pa-carregadeira', /pa carregadeira|pa mecanica|carregadeira/],
    ['retroescavadeira', /retroescavadeira/], ['trator', /trator|john deere|massey|new holland|solis/],
    ['grade-aradora', /grade aradora|aradora|arado/], ['grade-niveladora', /niveladora/], ['destoca', /destoca/], ['plantadeira', /plantadeira/],
    ['colheitadeira', /colheitadeira/], ['pulverizador', /pulverizador/], ['calcario', /calcario/], ['rocadeira', /rocadeira|rocad/],
    ['piscicultura', /piscicultura|psicultura|pisicultura/], ['tanque', /tanque|acude|acudagem/],
    ['broto', /outras?|cultura/]
  ];
  function semAcento(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /** Chave do ícone para um nome livre (cultura, máquina ou implemento). '' quando não reconhece. */
  function chave(texto) {
    if (D[texto]) return texto;
    var t = semAcento(texto);
    if (!t) return '';
    for (var i = 0; i < REGRAS.length; i++) if (REGRAS[i][1].test(t)) return REGRAS[i][0];
    return '';
  }

  /** <svg> do ícone. opcoes: { tamanho (px), cor (true = cor própria do ícone), titulo, classe }. Vazio se não existir. */
  function svg(nomeOuChave, opcoes) {
    opcoes = opcoes || {};
    var k = chave(nomeOuChave), d = D[k];
    if (!d) return '';
    var estilo = (opcoes.tamanho ? 'width:' + opcoes.tamanho + 'px;height:' + opcoes.tamanho + 'px;' : '') + (opcoes.cor ? 'color:' + d[2] + ';' : '');
    return '<svg class="ia' + (opcoes.classe ? ' ' + esc(opcoes.classe) : '') + '" viewBox="0 0 24 24" ' +
      (estilo ? 'style="' + estilo + '" ' : '') + (opcoes.titulo ? 'role="img" aria-label="' + esc(opcoes.titulo) + '"' : 'aria-hidden="true"') + '>' +
      (opcoes.titulo ? '<title>' + esc(opcoes.titulo) + '</title>' : '') + d[3] + '</svg>';
  }

  /** Ícone colorido + nome, para listas, chips e tabelas. Sem ícone reconhecido, devolve só o nome. */
  function rotulado(texto, opcoes) {
    var i = svg(texto, Object.assign({ cor: true }, opcoes || {}));
    return i ? '<span class="ia-rot">' + i + '<span>' + esc(texto) + '</span></span>' : esc(texto);
  }

  function lista() {
    return Object.keys(D).map(function (k) { return { chave: k, nome: D[k][0], grupo: D[k][1], cor: D[k][2] }; });
  }

  window.ICONES_AGRO = { svg: svg, chave: chave, rotulado: rotulado, lista: lista, cor: function (n) { var d = D[chave(n)]; return d ? d[2] : ''; } };
})();
