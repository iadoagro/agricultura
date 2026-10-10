/* Assistente de perguntas — aba "Mecanização" do painel.
   Um orb (porte em JS puro do componente matrix-orb, do rare-ui) que, ao clicar,
   abre uma caixa para perguntar qualquer coisa sobre os dados do painel, por
   exemplo "quantos relatórios foram lançados nos últimos 15 dias, por município".

   Não usa serviço externo nem IA: a pergunta é interpretada aqui mesmo, por
   regras (período, métrica, agrupamento, filtros e ordem), e respondida sobre a
   base que o painel já carregou (window.PAINEL_DADOS, exposto por dashboard.js).
   O "Entendi:" de cada resposta mostra exatamente como a pergunta foi lida.

   A pergunta NÃO usa os filtros da lateral: ela vale sobre a base inteira, e o
   recorte vem do que foi escrito. */
(function () {
  'use strict';

  var NI = 'Não informado';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
    'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* ---------------------------------------------------------------- orb ----
     Mesma matemática do matrix-orb.tsx: grade de pontos, três estados
     (idle, listening, thinking) misturados por pesos e um "pulo" de escala
     por mola quando o estado muda. */
  var TAU = Math.PI * 2;
  var ESTADOS = ['idle', 'listening', 'thinking'];
  var ESCALA = { idle: 0.88, listening: 1, thinking: 0.92 };
  var ORBITAS = [
    { radius: 0.62, speed: 2.2, phase: 0, spread: 0.42 },
    { radius: 0.4, speed: -1.7, phase: 2.1, spread: 0.36 },
    { radius: 0.8, speed: 1.15, phase: 4, spread: 0.34 }
  ];

  function envelope(t) {
    var lenta = 0.5 + 0.5 * Math.sin(t * 0.62 + 0.4);
    var rapida = 0.5 + 0.5 * Math.sin(t * 1.9 + 1.1);
    return 0.22 + 0.78 * (0.45 + 0.55 * lenta) * rapida;
  }

  function intensidade(estado, d, nx, ny, t, amp) {
    if (estado === 'listening') {
      var onda = 0.5 + 0.5 * Math.sin(d * 4.2 - t * 3);
      return 0.32 + amp * (0.34 + 0.38 * onda);
    }
    if (estado === 'thinking') {
      var calor = 0;
      for (var i = 0; i < ORBITAS.length; i++) {
        var o = ORBITAS[i], a = t * o.speed + o.phase;
        var dx = nx - Math.cos(a) * o.radius, dy = ny - Math.sin(a) * o.radius;
        calor += Math.exp(-(dx * dx + dy * dy) / (o.spread * o.spread));
      }
      return 0.26 + 0.8 * Math.min(1, calor);
    }
    return 0.62 + 0.12 * Math.sin(t * 1.05 - d * 2.4);
  }

  /** Desenha o orb em `canvas`. Devolve { estado(nome), parar() }. */
  function criarOrb(canvas, tamanho, pontos, cheio) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var buf = Math.round(tamanho * dpr);
    canvas.width = canvas.height = buf;
    canvas.style.width = canvas.style.height = tamanho + 'px';
    ctx.scale(buf / tamanho, buf / tamanho);

    var grade = pontos || 11, meio = (grade - 1) / 2;
    var espaco = (tamanho * (cheio ? 0.9 : 0.74)) / (grade - 1), raioMax = espaco * (cheio ? 0.82 : 0.6), centro = tamanho / 2;
    var queda = cheio ? 0.9 : 1.7;   // "cheio": o miolo azul se espalha e preenche a bola
    var estado = 'idle', nivel = null;   // nivel null = envelope automático
    var pesos = { idle: 1, listening: 0, thinking: 0 };
    var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var raf = 0, t = 0, amp = 0, escala = ESCALA.idle, vel = 0, ultimo = performance.now();

    function cor() {
      var s = getComputedStyle(document.documentElement);
      return (s.getPropertyValue('--s1') || '#2a78d6').trim();
    }

    function pintar(tt, a, esc) {
      ctx.clearRect(0, 0, tamanho, tamanho);
      ctx.fillStyle = cor();
      for (var iy = 0; iy < grade; iy++) {
        for (var ix = 0; ix < grade; ix++) {
          var nx = (ix - meio) / meio, ny = (iy - meio) / meio, d = Math.hypot(nx, ny);
          if (d > 1.12) continue;
          var mistura = 0;
          for (var k = 0; k < ESTADOS.length; k++) {
            var s = ESTADOS[k];
            if (pesos[s] < 0.001) continue;
            mistura += pesos[s] * intensidade(s, d, nx, ny, tt, a);
          }
          var inten = Math.min(1, Math.max(0, mistura));
          var raio = raioMax * Math.exp(-d * d * queda) * inten * esc;
          if (raio * dpr < 0.5) continue;
          ctx.beginPath();
          ctx.arc(centro + (ix - meio) * espaco * esc, centro + (iy - meio) * espaco * esc, raio, 0, TAU);
          ctx.fill();
        }
      }
    }

    function quadro(agora) {
      var dt = Math.min((agora - ultimo) / 1000, 0.05);
      ultimo = agora;
      t += dt;
      var alvo = nivel == null ? envelope(t) : nivel;
      var taxa = alvo > amp ? 0.22 : 0.08;
      amp += (alvo - amp) * (1 - Math.pow(1 - taxa, dt * 60));
      var passo = 1 - Math.pow(1 - 0.16, dt * 60);
      ESTADOS.forEach(function (s) { pesos[s] += ((s === estado ? 1 : 0) - pesos[s]) * passo; });
      vel += (-180 * (escala - ESCALA[estado]) - 26 * vel) * dt;
      escala += vel * dt;
      pintar(t, amp, escala);
      raf = requestAnimationFrame(quadro);
    }

    if (reduz) pintar(0, envelope(0), ESCALA.idle);
    else raf = requestAnimationFrame(quadro);

    return {
      estado: function (nome) {
        estado = nome;
        if (reduz) {
          ESTADOS.forEach(function (s) { pesos[s] = s === nome ? 1 : 0; });
          pintar(0, envelope(0), ESCALA[nome]);
        }
      },
      parar: function () { cancelAnimationFrame(raf); }
    };
  }

  /* -------------------------------------------------------- utilidades ---- */
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(v, dec) {
    return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function br(isoStr) { return isoStr.slice(8, 10) + '/' + isoStr.slice(5, 7) + '/' + isoStr.slice(0, 4); }
  function somarDias(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; }
  function fimDoMes(ano, mes) { return new Date(ano, mes + 1, 0); }   // mes 0-11
  function primeiraPalavra(s) { return norm(s).split(/[\s.\-_]+/).filter(Boolean)[0] || ''; }
  function ptn(v) { return v === 1 ? '' : 's'; }

  /* ------------------------------------------------------------ período ---- */
  var NUM_EXT = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
    nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30 };

  function numero(tok) {
    if (/^\d+$/.test(tok)) return +tok;
    return NUM_EXT[tok] || null;
  }

  /** { de, ate, rot } (ISO) ou null. `hoje` é um Date. */
  function lerPeriodo(q, hoje) {
    var m, h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    m = q.match(/\bultim[oa]s?\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s+(dia|dias|semana|semanas|mes|meses|ano|anos)\b/);
    if (m) {
      var n = numero(m[1]), un = m[2].replace(/s$/, '').replace('mese', 'mes');
      var de;
      if (un === 'dia') de = somarDias(h, -(n - 1));
      else if (un === 'semana') de = somarDias(h, -(n * 7 - 1));
      else if (un === 'mes') de = somarDias(new Date(h.getFullYear(), h.getMonth() - n, h.getDate()), 1);
      else de = somarDias(new Date(h.getFullYear() - n, h.getMonth(), h.getDate()), 1);
      return { de: iso(de), ate: iso(h), rot: 'últimos ' + n + ' ' + m[2] };
    }
    m = q.match(/\bultim[oa]\s+(semana|mes|ano)\b/);
    if (m && !/\b(semana|mes|ano) passad[oa]\b/.test(q)) {
      var d1 = m[1] === 'semana' ? somarDias(h, -6)
        : m[1] === 'mes' ? somarDias(new Date(h.getFullYear(), h.getMonth() - 1, h.getDate()), 1)
          : somarDias(new Date(h.getFullYear() - 1, h.getMonth(), h.getDate()), 1);
      return { de: iso(d1), ate: iso(h), rot: 'último ' + m[1] };
    }
    if (/\banteontem\b/.test(q)) { var a = iso(somarDias(h, -2)); return { de: a, ate: a, rot: 'anteontem' }; }
    if (/\bontem\b/.test(q)) { var o = iso(somarDias(h, -1)); return { de: o, ate: o, rot: 'ontem' }; }
    if (/\bhoje\b/.test(q)) { return { de: iso(h), ate: iso(h), rot: 'hoje' }; }

    if (/\bsemana passada\b/.test(q)) {
      var dow = (h.getDay() + 6) % 7;                    // segunda = 0
      var ini = somarDias(h, -dow - 7);
      return { de: iso(ini), ate: iso(somarDias(ini, 6)), rot: 'semana passada' };
    }
    if (/\b(esta|essa|nesta|nessa) semana\b/.test(q)) {
      var dw = (h.getDay() + 6) % 7;
      return { de: iso(somarDias(h, -dw)), ate: iso(h), rot: 'esta semana' };
    }
    if (/\b(mes passado|ultimo mes fechado)\b/.test(q)) {
      var mp = new Date(h.getFullYear(), h.getMonth() - 1, 1);
      return { de: iso(mp), ate: iso(fimDoMes(mp.getFullYear(), mp.getMonth())), rot: 'mês passado' };
    }
    if (/\b(este|esse|neste|nesse) mes\b|\bmes atual\b|\bmes corrente\b/.test(q)) {
      return { de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(h), rot: 'este mês' };
    }
    if (/\b(ano passado)\b/.test(q)) {
      return { de: (h.getFullYear() - 1) + '-01-01', ate: (h.getFullYear() - 1) + '-12-31', rot: 'ano passado' };
    }
    if (/\b(este|esse|neste|nesse) ano\b|\bano atual\b|\bano corrente\b/.test(q)) {
      return { de: h.getFullYear() + '-01-01', ate: iso(h), rot: 'este ano' };
    }

    // dd/mm[/aaaa] a dd/mm[/aaaa]
    var dm = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g, achados = [], x;
    while ((x = dm.exec(q))) achados.push(x);
    function dataDe(p) {
      var ano = p[3] ? (+p[3] < 100 ? 2000 + +p[3] : +p[3]) : h.getFullYear();
      return ano + '-' + String(+p[2]).padStart(2, '0') + '-' + String(+p[1]).padStart(2, '0');
    }
    if (achados.length >= 2) {
      var di = dataDe(achados[0]), df = dataDe(achados[1]);
      if (di > df) { var tmp = di; di = df; df = tmp; }
      return { de: di, ate: df, rot: br(di) + ' a ' + br(df) };
    }
    if (achados.length === 1) {
      var u = dataDe(achados[0]);
      if (/\b(desde|a partir)\b/.test(q)) return { de: u, ate: iso(h), rot: 'desde ' + br(u) };
      return { de: u, ate: u, rot: br(u) };
    }

    // "março", "março de 2025", "em jan/2025"; a abreviação só vale com contexto
    for (var i = 0; i < 12; i++) {
      var longo = norm(MESES[i]), curto = MESES_CURTO[i];
      m = q.match(new RegExp('\\b' + longo + '\\b(?:\\s*(?:de|\\/)?\\s*(20\\d\\d))?')) ||
        q.match(new RegExp('(?:\\b(?:em|no mes de)\\s+' + curto + '\\b|\\b' + curto + '\\s*\\/)(?:\\s*(20\\d\\d))?'));
      if (m) {
        var ano = m[1] ? +m[1] : h.getFullYear();
        return { de: iso(new Date(ano, i, 1)), ate: iso(fimDoMes(ano, i)), rot: MESES[i] + ' de ' + ano };
      }
    }

    // "2025", ou um intervalo de anos: "de 2023 até 2026", "entre 2023 e 2026"
    var abrev = q.match(/\b(20\d\d)\s*(?:a|ate|ao|e)\s*(\d{2})\b(?![\d\/])/);   // "2023 a 25"
    var anos = abrev ? [+abrev[1], 2000 + +abrev[2]].sort()
      : (q.match(/\b20\d\d\b/g) || []).map(Number).sort();
    if (anos.length >= 2 && anos[0] !== anos[anos.length - 1]) {
      var a0 = anos[0], a1 = anos[anos.length - 1];
      return { de: a0 + '-01-01', ate: a1 + '-12-31', rot: a0 + ' a ' + a1 };
    }
    if (anos.length) return { de: anos[0] + '-01-01', ate: anos[0] + '-12-31', rot: String(anos[0]) };
    return null;
  }

  /* ------------------------------------------------------- interpretação ---- */
  var GRUPOS = [
    { id: 'alim', rot: 'quem lançou', re: /\bquem (mais )?(lancou|inseriu|digitou|cadastrou|alimentou)\b|\blancador(es)?\b|\binseridor(es)?\b|\bdigitador(es)?\b|\blancad[oa]s? por (pessoa|usuario)|\bpor (pessoa|usuario|lancador)\b|\bpessoas?\b|\busuarios?\b/, privado: true },
    { id: 'rt', rot: 'responsável técnico', re: /\btecnic[oa]s?\b|\bresponsave(l|is) tecnic|\bengenheir[oa]s?\b|\bagronom[oa]s?\b/ },
    { id: 'prod', rot: 'produtor', re: /\bquais produtores\b|\bpor produtor(es)?\b|\bmaiores produtores\b|\bprodutores que mais\b|\bbeneficiari[oa]s? (que|com) mais\b|\blista de produtores\b/ },
    { id: 'reg', rot: 'regional', re: /\bpor regiona(l|is)\b|\bcada regional\b|\bregionais\b|\bquais regionais\b/ },
    { id: 'esc', rot: 'escritório local', re: /\bescritorios?\b/ },
    { id: 'cult', rot: 'cultura', re: /\bculturas?\b/ },
    { id: 'maq', rot: 'máquina', re: /\bmaquinas?\b/ },
    { id: 'impl', rot: 'implemento/serviço', re: /\bimplementos?\b|\bservicos executados\b|\btipos? de servico\b/ },
    { id: 'tt', rot: 'tipo de trator', re: /\btrator(es)?\b/ },
    { id: 'assoc', rot: 'associação', re: /\bassociac(ao|oes)\b/ },
    { id: 'pc', rot: 'tipo de atendimento', re: /\bpor tipo\b|\bmecanizacao (e|x|versus|ou) acudagem\b|\bacudagem (e|x|versus|ou) mecanizacao\b/ },
    { id: 'dia', rot: 'dia', re: /\bpor dia\b|\bpor data\b|\bdiari[oa]s?\b|\bcada dia\b|\bdia a dia\b|\bquais dias\b|\bem que dias?\b/, tempo: true },
    { id: 'mes', rot: 'mês', re: /\bpor mes\b|\bmensal\b|\bmensais\b|\bcada mes\b|\bmes a mes\b|\bquais meses\b|\bem que mes(es)?\b/, tempo: true },
    { id: 'ano', rot: 'ano', re: /\bpor ano\b|\banual\b|\banuais\b|\bcada ano\b|\bano a ano\b/, tempo: true },
    { id: 'mun', rot: 'município', re: /\bmunicipios?\b|\bcidades?\b/ }
  ];

  function chaveGrupo(id, r, C) {
    switch (id) {
      case 'mun': return r.mun;
      case 'esc': return r.esc;
      case 'rt': return r.rt;
      case 'alim': return r.alim;
      case 'prod': return r.prod;
      case 'reg': return C.regionalDe(r.mun) || NI;
      case 'cult': return (r.cult || []).map(function (c) { return c[0]; });
      case 'maq': return r.maq;
      case 'impl': return r.impl;
      case 'tt': return r.tt;
      case 'assoc': return r.assoc;
      case 'pc': return r.pc;
      case 'dia': return C.data(r);
      case 'mes': return C.data(r).slice(0, 7);
      case 'ano': return C.data(r).slice(0, 4);
    }
    return null;
  }

  function rotuloChave(id, k) {
    if (id === 'dia') return br(k);
    if (id === 'mes') return MESES[+k.slice(5, 7) - 1] + '/' + k.slice(0, 4);
    return k;
  }

  /** Nomes distintos de um campo, já normalizados, do maior para o menor (para
      que "Rio Branco" seja testado antes de um nome que o contenha). */
  function indice(registros, campo) {
    var m = new Map();
    registros.forEach(function (r) {
      var vs = campo(r);
      (Array.isArray(vs) ? vs : [vs]).forEach(function (v) {
        if (!v || v === NI) return;
        var k = norm(v).replace(/\s+/g, ' ').trim();
        if (k && !m.has(k)) m.set(k, v);
      });
    });
    return Array.from(m.entries()).sort(function (a, b) { return b[0].length - a[0].length; });
  }

  function acharNomes(q, lista, minimo) {
    var restante = q, achados = [];
    lista.forEach(function (e) {
      if (e[0].length < (minimo || 3)) return;
      var re = new RegExp('(^|[^a-z0-9])' + e[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z0-9])');
      if (re.test(restante)) {
        achados.push(e[1]);
        restante = restante.replace(re, '$1 ');
      }
    });
    return { nomes: achados, resto: restante };
  }

  var PALAVRAS_LIVRES = /^(quant|qual|quais|quem|relat|lanc|insert|atend|vistor|total|media|mais|menos|maior|menor|ultim|desde|entre|todos|todas|cada|esse|essa|este|esta|aqui|agora|mecan|acud|hecta|horas|tanqu|ordem|decresc|cresc|munic|escrit|cultu|tecni|pesso|usuar|produ|bene)/;

  function interpretar(texto, C) {
    var q = ' ' + norm(texto).replace(/[?!,;:]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    q = q.trim();
    var avisos = [], I = { filtros: [], avisos: avisos };

    /* período */
    I.periodo = lerPeriodo(q, C.hoje);
    // "últimos 15 dias", "este mês"…: contados a partir de hoje, ao contrário de "agosto de 2025"
    if (I.periodo) {
      I.periodo.rel = /\bultim|\bhoje\b|\bontem\b|\banteontem\b|\bsemana\b|\b(este|esse|neste|nesse) (mes|ano)\b|\bmes (atual|corrente|passado)\b|\bano (atual|corrente|passado)\b/.test(q);
    }

    /* base da data: lançamento (padrão) ou data da vistoria */
    I.base = /\b(vistoria|vistoriad|atendid|realizad|executad|servico feito|servicos feitos)\b/.test(q) &&
      !/\blanc|\binsert|\binser|\bcadastr|\bdigit/.test(q) ? 'dv' : 'd';

    /* métrica */
    var qGraf = /\bgraficos?\b|\bcompar|\bevolucao\b|\btendencia\b|\bversus\b|\bplot/.test(q);
    var achadas = [];
    function achar(re, m) { var x = re.exec(q); if (x) achadas.push({ m: m, i: x.index }); }
    achar(/\bhectares?\b|\bha\b|\barea\b|\bareas\b/, 'ha');
    achar(/\bhoras?\b/, 'hrs');
    if (/\bquant|\btotal|\bsoma/.test(q) || qGraf || achadas.length) achar(/\btanques?\b|\bacudes?\b/, 'ac');
    achar(/\bquantos? (produtores|beneficiarios)\b|\bnumero de (produtores|beneficiarios)\b|\bprodutores (atendidos|distintos|diferentes)\b/, 'prod');
    if (achadas.length && /\brelatorios? e\b|\be (os )?(relatorios|atendimentos|vistorias)\b|\batendimentos e\b|\bvistorias e\b/.test(q)) {
      achar(/\brelatorios?\b|\batendimentos?\b|\bvistorias?\b/, 'n');
    }
    achadas.sort(function (a, b) { return a.i - b.i; });
    I.metricas = achadas.map(function (a) { return a.m; });
    if (!I.metricas.length) I.metricas = ['n'];
    var met = I.metricas[0];
    var multi = I.metricas.length > 1;
    I.metrica = met;

    /* gráfico: pedido ("gráfico", "comparativo", "evolução") ou implícito em mais de uma métrica */
    var tipoG = null;
    if (/\bpizza\b/.test(q)) tipoG = 'pizza';
    else if (/\brosca\b|\bdonut\b|\brosquinha\b/.test(q)) tipoG = 'rosca';
    else if (/\bgraficos? (de|em) area\b|\bem area\b/.test(q)) tipoG = 'area';
    else if (/\bcolunas?\b/.test(q)) tipoG = 'colunas';
    else if (/\bbarras?\b/.test(q)) tipoG = 'barras';
    else if (/\blinhas?\b|\bevolucao\b|\btendencia\b/.test(q)) tipoG = 'linha';
    I.querGrafico = !!(tipoG || qGraf);
    I.grafico = tipoG;   // o padrão (linha no tempo, barras por categoria) é decidido depois do agrupamento

    /* tipo de atendimento */
    var temMec = /\bmecaniz/.test(q), temAcu = /\bacudag|\bacudes?\b|\btanques?\b/.test(q);
    if (temMec && !temAcu) I.filtros.push({ campo: 'pc', valor: C.MEC, rot: 'tipo: mecanização' });
    else if (temAcu && !temMec) I.filtros.push({ campo: 'pc', valor: C.ACU, rot: 'tipo: açudagem' });
    else if (!multi && met === 'hrs') I.filtros.push({ campo: 'pc', valor: C.ACU, rot: 'tipo: açudagem' });
    else if (!multi && met === 'ac') I.filtros.push({ campo: 'pc', valor: C.ACU, rot: 'tipo: açudagem' });

    /* municípios, escritórios, culturas */
    var resto = q;
    (C.regionais || []).forEach(function (nome) {
      var achou = norm(nome).split('/').some(function (parte) {
        var re = new RegExp('(^|[^a-z0-9])' + parte + '(?=$|[^a-z0-9])');
        return re.test(resto);
      });
      if (achou) I.filtros.push({ campo: 'reg', valor: nome, rot: 'regional: ' + nome });
    });
    var iMun = acharNomes(resto, C.idxMun), iEsc;
    var falouEsc = /\bescritorio/.test(q);
    var munNomes = iMun.nomes;
    if (falouEsc) {
      iEsc = acharNomes(resto, C.idxEsc);
      if (iEsc.nomes.length) { munNomes = []; resto = iEsc.resto; }
    }
    if (munNomes.length) {
      I.filtros.push({ campo: 'mun', valor: munNomes, rot: 'município: ' + munNomes.join(', ') });
      // "Tarauacá" é município e parte do nome da regional: vale o município
      var nm = munNomes.map(norm);
      I.filtros = I.filtros.filter(function (f) {
        return !(f.campo === 'reg' && norm(f.valor).split('/').some(function (p) { return nm.indexOf(p) >= 0; }));
      });
      resto = iMun.resto;
    } else if (falouEsc && iEsc && iEsc.nomes.length) {
      I.filtros.push({ campo: 'esc', valor: iEsc.nomes, rot: 'escritório: ' + iEsc.nomes.join(', ') });
    } else if (!falouEsc) {
      // nome que só existe como escritório
      var soEsc = acharNomes(resto, C.idxEsc).nomes.filter(function (n) { return !C.setMun[norm(n)]; });
      if (soEsc.length) I.filtros.push({ campo: 'esc', valor: soEsc, rot: 'escritório: ' + soEsc.join(', ') });
    }
    var iCult = acharNomes(resto, C.idxCult, 4);
    if (iCult.nomes.length) {
      I.filtros.push({ campo: 'cult', valor: iCult.nomes, rot: 'cultura: ' + iCult.nomes.join(', ') });
      resto = iCult.resto;
    }

    /* pessoa (quem lançou / técnico): primeiro nome único na base */
    var pal = resto.split(/[^a-z0-9]+/).filter(function (p) { return p.length >= 4; });
    var porPessoa = C.primeirosNomes;
    for (var i = 0; i < pal.length; i++) {
      var p = pal[i];
      if (PALAVRAS_LIVRES.test(p) || !porPessoa[p]) continue;
      var info = porPessoa[p];
      if (C.publico) continue;
      var quem = /\blancad[oa]s? por\b|\binserid[oa]s? por\b|\bpel[oa]\s+\S+\s+lanc/.test(q) ? 'alim'
        : /\btecnic|\bresponsave/.test(q) ? 'rt' : (info.alim.size ? 'alim' : 'rt');
      var variantes = quem === 'alim' ? info.alim : info.rt;
      if (!variantes.size) variantes = info.rt.size ? info.rt : info.alim;
      if (variantes.size > 1 && !info.mesmo) {
        avisos.push('Mais de uma pessoa se chama “' + p + '”; filtre pelo nome completo.');
        continue;
      }
      I.filtros.push({ campo: 'pessoa', valor: p, rot: 'pessoa: ' + Array.from(variantes)[0], quem: quem });
      break;
    }

    /* agrupamento */
    var grupo = null;
    // "horas de máquina" é a métrica, não o agrupamento por máquina
    var qg = q.replace(/\bhoras? de maquinas?\b/g, ' horas ');
    for (var g = 0; g < GRUPOS.length; g++) {
      if (GRUPOS[g].re.test(qg)) {
        if (GRUPOS[g].privado && C.publico) {
          avisos.push('Na versão pública não é possível detalhar por quem lançou.');
          continue;
        }
        grupo = GRUPOS[g];
        break;
      }
    }
    // "quantos produtores ..." é contagem distinta, não lista por produtor
    if (grupo && grupo.id === 'mun') {
      var f = I.filtros.filter(function (x) { return x.campo === 'mun'; })[0];
      if (f && f.valor.length === 1 && !/\bquais\b|\bpor municipio\b|\bcada municipio\b/.test(q)) grupo = null;
    }
    // regional pedida sem agrupar: mostra os municípios dela
    if (!grupo && !I.querGrafico && !multi && I.filtros.some(function (f) { return f.campo === 'reg'; })) {
      grupo = GRUPOS.filter(function (g) { return g.id === 'mun'; })[0];
    }
    // gráfico sem agrupamento dito: série mensal (é o comparativo mais pedido)
    if ((I.querGrafico || multi) && !grupo) {
      grupo = GRUPOS.filter(function (g) { return g.id === 'mes'; })[0];
    }
    I.grupo = grupo;
    if (grupo && (I.querGrafico || multi)) {
      I.querGrafico = true;
      if (!I.grafico) I.grafico = grupo.tempo ? 'linha' : (multi ? 'colunas' : 'barras');
    } else {
      I.grafico = null;
    }

    /* ordem e limite */
    var asc = /\bcrescente\b/.test(q) && !/\bdecrescente\b/.test(q) ||
      /\b(menos|menor|menores|piores|ultimos colocados)\b/.test(q) && !/\bmais\b/.test(q);
    var desc = /\bdecrescente\b|\bmaior(es)?\b|\bmais\b|\bmelhor(es)?\b|\btop\b|\bdo maior\b/.test(q);
    I.ordem = asc ? 'asc' : desc ? 'desc' : null;
    var lim = q.match(/\btop\s*(\d+)\b/) ||
      q.match(/\b(\d+)\s+(?:primeiros|primeiras|maiores|menores|principais|melhores|piores)\b/) ||
      q.match(/\b(\d+)\s+(?:municipios|escritorios|tecnicos|culturas|produtores|maquinas|implementos|regionais|pessoas)\b/);
    I.limite = lim ? Math.min(+lim[1], 200) : null;

    return I;
  }

  /* ---------------------------------------------------------- execução ---- */
  function aplicar(I, C) {
    var de = I.periodo ? I.periodo.de : null, ate = I.periodo ? I.periodo.ate : null;
    var dataDe = I.base === 'dv' ? C.dataRef : function (r) { return r.d; };
    C.data = dataDe;

    var lista = C.registros.filter(function (r) {
      var d = dataDe(r);
      if (!d) return false;
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      return I.filtros.every(function (f) {
        if (f.campo === 'pc') return r.pc === f.valor;
        if (f.campo === 'reg') return C.regionalDe(r.mun) === f.valor;
        if (f.campo === 'mun') return f.valor.indexOf(r.mun) >= 0 || f.valor.some(function (v) { return norm(v) === norm(r.mun); });
        if (f.campo === 'esc') return f.valor.some(function (v) { return norm(v) === norm(r.esc); });
        if (f.campo === 'cult') return (r.cult || []).some(function (c) {
          return f.valor.some(function (v) { return norm(v) === norm(c[0]); });
        });
        if (f.campo === 'pessoa') {
          var campo = f.quem === 'alim' ? r.alim : r.rt;
          return primeiraPalavra(campo) === f.valor;
        }
        return true;
      });
    });

    function valor(r) {
      if (I.metrica === 'ha') return r.ha || 0;
      if (I.metrica === 'hrs') return r.hrs || 0;
      if (I.metrica === 'ac') return r.ac || 0;
      return 1;
    }

    var nProd = function (arr) {
      var s = new Set();
      arr.forEach(function (r) { if (r.prod) s.add(C.chaveProdutor(r)); });
      return s.size;
    };

    var tot = {
      n: lista.length,
      ha: lista.reduce(function (a, r) { return a + (r.ha || 0); }, 0),
      hrs: lista.reduce(function (a, r) { return a + (r.hrs || 0); }, 0),
      ac: lista.reduce(function (a, r) { return a + (r.ac || 0); }, 0),
      prod: nProd(lista),
      mun: new Set(lista.map(function (r) { return r.mun; }).filter(Boolean)).size
    };

    var linhas = null;
    if (I.grupo) {
      var mapa = new Map();
      lista.forEach(function (r) {
        var ks = chaveGrupo(I.grupo.id, r, C);
        (Array.isArray(ks) ? ks : [ks]).forEach(function (k) {
          if (k == null || k === '') k = NI;
          var e = mapa.get(k);
          if (!e) mapa.set(k, e = { k: k, n: 0, ha: 0, hrs: 0, ac: 0, regs: [] });
          e.n++; e.ha += r.ha || 0; e.hrs += r.hrs || 0; e.ac += r.ac || 0; e.regs.push(r);
        });
      });
      linhas = Array.from(mapa.values()).map(function (e) {
        e.prod = nProd(e.regs);
        e.val = I.metrica === 'prod' ? e.prod : I.metrica === 'ha' ? e.ha : I.metrica === 'hrs' ? e.hrs
          : I.metrica === 'ac' ? e.ac : e.n;
        return e;
      });
      // série mensal contínua: meses sem lançamento entram com zero, senão a linha "pula" o buraco
      if (I.grafico && I.grupo.id === 'mes' && linhas.length > 1) {
        var ks = linhas.map(function (l) { return l.k; }).sort();
        var y = +ks[0].slice(0, 4), mo = +ks[0].slice(5, 7), fim = ks[ks.length - 1], tem = {};
        linhas.forEach(function (l) { tem[l.k] = true; });
        for (var guard = 0; guard < 240; guard++) {
          var kk = y + '-' + String(mo).padStart(2, '0');
          if (kk > fim) break;
          if (!tem[kk]) linhas.push({ k: kk, n: 0, ha: 0, hrs: 0, ac: 0, prod: 0, val: 0, regs: [] });
          if (++mo > 12) { mo = 1; y++; }
        }
      }
      var tempo = I.grupo.tempo;
      var dir = I.ordem ? (I.ordem === 'asc' ? 1 : -1) : (tempo ? 1 : -1);
      linhas.sort(function (a, b) {
        if (tempo && !I.ordem) return a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
        if (tempo && I.ordem && a.val === b.val) return a.k < b.k ? -dir : dir;
        return (a.val - b.val) * dir || String(a.k).localeCompare(String(b.k), 'pt-BR');
      });
      // o limite vale para rankings (e para a ordem escolhida em séries temporais)
      if (I.limite) linhas = linhas.slice(0, I.limite);
    }

    var principal = I.metrica === 'prod' ? tot.prod : I.metrica === 'ha' ? tot.ha : I.metrica === 'hrs' ? tot.hrs
      : I.metrica === 'ac' ? tot.ac : tot.n;

    return { lista: lista, tot: tot, linhas: linhas, principal: principal, de: de, ate: ate, ordemDia: dataDe };
  }

  /* ------------------------------------------------------------- gráficos ----
     SVG próprio, sem biblioteca. Com mais de uma métrica (ex.: hectares e
     horas) cada série tem a sua escala: a primeira no eixo da esquerda, a
     segunda no da direita — senão horas (milhares) e hectares (dezenas)
     ficariam uma colada no chão. O valor exato está no título de cada ponto. */
  var COR_SERIE = ['var(--s1)', 'var(--s2)', 'var(--s4)'];
  var COR_FATIA = ['var(--s1)', 'var(--s2)', 'var(--s4)', 'var(--s5)', 'var(--s3)', '#2f9e8f', '#8a6fd1', '#9a9892'];
  var ROT_CURTO = { n: 'Relatórios', ha: 'Hectares', hrs: 'Horas de máquina', ac: 'Tanques/açudes', prod: 'Produtores' };

  function valorDe(e, m) {
    return m === 'prod' ? e.prod : m === 'ha' ? e.ha : m === 'hrs' ? e.hrs : m === 'ac' ? e.ac : e.n;
  }
  function decDe(m) { return m === 'ha' || m === 'hrs' ? 1 : 0; }

  /** Teto "redondo" para o eixo (1, 2, 2,5, 5 ou 10 vezes uma potência de 10). */
  function tetoBonito(max) {
    if (!(max > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function rotuloEixo(id, k) {
    if (id === 'mes') return MESES_CURTO[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4);
    if (id === 'dia') return k.slice(8, 10) + '/' + k.slice(5, 7);
    if (id === 'ano') return k;
    var t = String(k);
    return t.length > 14 ? t.slice(0, 13) + '…' : t;
  }

  function fatiaSvg(cx, cy, r, r0, a0, a1) {
    var g = Math.PI / 180, x = function (rr, a) { return (cx + rr * Math.cos(a)).toFixed(2); },
      y = function (rr, a) { return (cy + rr * Math.sin(a)).toFixed(2); };
    var grande = a1 - a0 > Math.PI ? 1 : 0;
    if (a1 - a0 >= Math.PI * 2 - 0.001) a1 = a0 + Math.PI * 2 - 0.001;
    var d = 'M' + x(r, a0) + ' ' + y(r, a0) + 'A' + r + ' ' + r + ' 0 ' + grande + ' 1 ' + x(r, a1) + ' ' + y(r, a1);
    d += r0 ? 'L' + x(r0, a1) + ' ' + y(r0, a1) + 'A' + r0 + ' ' + r0 + ' 0 ' + grande + ' 0 ' + x(r0, a0) + ' ' + y(r0, a0) + 'Z'
      : 'L' + cx + ' ' + cy + 'Z';
    void g;
    return d;
  }

  function graficoPizza(I, linhas, tipo) {
    var m = I.metricas[0];
    var rows = linhas.filter(function (l) { return valorDe(l, m) > 0; }).sort(function (a, b) {
      return valorDe(b, m) - valorDe(a, m);
    });
    if (rows.length > 8) {
      var resto = rows.slice(7).reduce(function (a, l) { return a + valorDe(l, m); }, 0);
      rows = rows.slice(0, 7).map(function (l) { return { k: rotuloChave(I.grupo.id, l.k), v: valorDe(l, m) }; });
      rows.push({ k: 'Outros', v: resto });
    } else {
      rows = rows.map(function (l) { return { k: rotuloChave(I.grupo.id, l.k), v: valorDe(l, m) }; });
    }
    var total = rows.reduce(function (a, r) { return a + r.v; }, 0) || 1;
    var ang = -Math.PI / 2, s = '<svg class="ia-svg ia-pizza" viewBox="0 0 220 220" role="img" aria-label="Gráfico de ' +
      esc(tipo) + '">';
    rows.forEach(function (r, i) {
      var a1 = ang + r.v / total * Math.PI * 2;
      s += '<path d="' + fatiaSvg(110, 110, 100, tipo === 'rosca' ? 58 : 0, ang, a1) + '" fill="' + COR_FATIA[i] +
        '" stroke="var(--superficie)" stroke-width="1.5"><title>' + esc(r.k) + ': ' + fmt(r.v, decDe(m)) + ' (' +
        fmt(r.v / total * 100, 1) + '%)</title></path>';
      ang = a1;
    });
    s += '</svg>';
    var leg = '<ul class="ia-leg">' + rows.map(function (r, i) {
      return '<li><i style="background:' + COR_FATIA[i] + '"></i><span>' + esc(r.k) + '</span><b>' + fmt(r.v, decDe(m)) +
        '</b><em>' + fmt(r.v / total * 100, 1) + '%</em></li>';
    }).join('') + '</ul>';
    return '<div class="ia-grafico ia-grafico-pizza">' + s + leg + '</div>';
  }

  function graficoBarrasH(I, linhas) {
    var series = I.metricas.slice(0, 3);
    var rows = linhas.slice(0, 12);
    var W = 640, ml = 150, mr = 70, passo = 14 * series.length + 14, H = rows.length * passo + 14;
    var maxes = series.map(function (m) {
      return rows.reduce(function (a, l) { return Math.max(a, valorDe(l, m)); }, 0) || 1;
    });
    var s = '<svg class="ia-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de barras">';
    rows.forEach(function (l, i) {
      var y0 = 8 + i * passo;
      s += '<text x="' + (ml - 8) + '" y="' + (y0 + 7 * series.length + 3) + '" text-anchor="end" class="ia-eixo">' +
        esc(rotuloEixo(I.grupo.id, rotuloChave(I.grupo.id, l.k)).replace(/…$/, '')) + '</text>';
      series.forEach(function (m, j) {
        var v = valorDe(l, m), w = v / maxes[j] * (W - ml - mr);
        s += '<rect x="' + ml + '" y="' + (y0 + j * 14) + '" width="' + Math.max(w, 1).toFixed(1) + '" height="11" rx="2" fill="' +
          COR_SERIE[j] + '"><title>' + esc(ROT_CURTO[m]) + ': ' + fmt(v, decDe(m)) + '</title></rect>' +
          '<text x="' + (ml + Math.max(w, 1) + 5) + '" y="' + (y0 + j * 14 + 9) + '" class="ia-eixo">' + fmt(v, decDe(m)) + '</text>';
      });
    });
    return '<div class="ia-grafico">' + s + '</svg>' + legendaSeries(series) + '</div>';
  }

  function legendaSeries(series) {
    if (series.length < 2) return '';
    return '<ul class="ia-leg ia-leg-h">' + series.map(function (m, j) {
      return '<li><i style="background:' + COR_SERIE[j] + '"></i><span>' + esc(ROT_CURTO[m]) + '</span></li>';
    }).join('') + '</ul>';
  }

  /** linha | area | colunas, no tempo ou por categoria. */
  function graficoEixos(I, linhas, tipo) {
    var series = I.metricas.slice(0, 3), dual = series.length > 1;
    var W = 640, H = 290, ml = 54, mr = dual ? 54 : 16, mt = 14, mb = 44;
    var iw = W - ml - mr, ih = H - mt - mb, n = linhas.length;
    var tetos = series.map(function (m) {
      return tetoBonito(linhas.reduce(function (a, l) { return Math.max(a, valorDe(l, m)); }, 0));
    });
    var passoX = n > 1 ? iw / (n - 1) : 0;
    var larg = iw / n;
    function px(i) { return tipo === 'colunas' ? ml + larg * (i + 0.5) : ml + (n > 1 ? passoX * i : iw / 2); }
    function py(v, j) { return mt + ih - v / tetos[j] * ih; }

    var s = '<svg class="ia-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de ' + (tipo === 'colunas' ? 'colunas' : tipo) + '">';
    // grade e eixo(s) Y: 4 divisões
    for (var t = 0; t <= 4; t++) {
      var yy = mt + ih - ih * t / 4;
      s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + yy + '" y2="' + yy + '" class="ia-grade"/>';
      s += '<text x="' + (ml - 6) + '" y="' + (yy + 3) + '" text-anchor="end" class="ia-eixo"' +
        (dual ? ' fill="' + COR_SERIE[0] + '"' : '') + '>' + fmt(tetos[0] * t / 4, tetos[0] < 10 ? 1 : 0) + '</text>';
      if (dual) {
        s += '<text x="' + (W - mr + 6) + '" y="' + (yy + 3) + '" class="ia-eixo" fill="' + COR_SERIE[1] + '">' +
          fmt(tetos[1] * t / 4, tetos[1] < 10 ? 1 : 0) + '</text>';
      }
    }
    // rótulos X, espaçados para não se sobrepor
    var cada = Math.ceil(n / Math.max(1, Math.floor(iw / 46)));
    linhas.forEach(function (l, i) {
      if (i % cada) return;
      s += '<text x="' + px(i).toFixed(1) + '" y="' + (H - mb + 16) + '" text-anchor="middle" class="ia-eixo">' +
        esc(rotuloEixo(I.grupo.id, l.k)) + '</text>';
    });

    series.forEach(function (m, j) {
      var cor = COR_SERIE[j];
      if (tipo === 'colunas') {
        var bw = Math.max(3, Math.min(34, larg * 0.78 / series.length));
        linhas.forEach(function (l, i) {
          var v = valorDe(l, m), y = py(v, j);
          var x = px(i) - bw * series.length / 2 + j * bw;
          s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 1).toFixed(1) + '" height="' +
            Math.max(0, mt + ih - y).toFixed(1) + '" rx="2" fill="' + cor + '"><title>' +
            esc(rotuloChave(I.grupo.id, l.k)) + ' · ' + esc(ROT_CURTO[m]) + ': ' + fmt(v, decDe(m)) + '</title></rect>';
        });
        return;
      }
      var pts = linhas.map(function (l, i) { return px(i).toFixed(1) + ',' + py(valorDe(l, m), j).toFixed(1); });
      if (tipo === 'area') {
        s += '<polygon points="' + px(0).toFixed(1) + ',' + (mt + ih) + ' ' + pts.join(' ') + ' ' + px(n - 1).toFixed(1) + ',' +
          (mt + ih) + '" fill="' + cor + '" opacity=".16"/>';
      }
      s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + cor + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
      linhas.forEach(function (l, i) {
        var v = valorDe(l, m);
        s += '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(v, j).toFixed(1) + '" r="' + (n > 40 ? 1.6 : 3.2) +
          '" fill="var(--superficie)" stroke="' + cor + '" stroke-width="2"><title>' + esc(rotuloChave(I.grupo.id, l.k)) +
          ' · ' + esc(ROT_CURTO[m]) + ': ' + fmt(v, decDe(m)) + '</title></circle>';
      });
    });
    return '<div class="ia-grafico">' + s + '</svg>' + legendaSeries(series) + '</div>';
  }

  function grafico(I, R) {
    if (!R.linhas || !R.linhas.length || !I.grafico) return '';
    var tempo = !!I.grupo.tempo;
    var linhas = R.linhas.slice();
    if (tempo) linhas.sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
    var tipo = I.grafico, multi = I.metricas.length > 1;
    if ((tipo === 'pizza' || tipo === 'rosca') && (multi || tempo)) tipo = tempo ? 'colunas' : 'barras';
    if (tipo === 'barras' && tempo) tipo = 'colunas';
    if (tipo === 'pizza' || tipo === 'rosca') return graficoPizza(I, linhas, tipo);
    if (tipo === 'barras') return graficoBarrasH(I, linhas);
    if (!tempo) linhas = linhas.slice(0, 20);
    return graficoEixos(I, linhas, tipo);
  }

  /* ------------------------------------------------------------ resposta ---- */
  var ROT_METRICA = {
    n: ['relatório', 'relatórios'], ha: ['hectare', 'hectares'], hrs: ['hora de máquina', 'horas de máquina'],
    ac: ['tanque/açude', 'tanques/açudes'], prod: ['produtor', 'produtores']
  };

  function entendi(I, R) {
    var itens = [];
    var rm = ROT_METRICA[I.metrica];
    if (I.metricas.length > 1) {
      itens.push('comparando <b>' + I.metricas.map(function (m) { return ROT_CURTO[m].toLowerCase(); }).join(' × ') + '</b>');
    } else {
      itens.push('<b>' + (I.metrica === 'n' ? 'relatórios (atendimentos)' : rm[1]) + '</b>');
    }
    if (I.grafico) {
      var nomeG = { linha: 'de linha', area: 'de área', colunas: 'de colunas', barras: 'de barras', pizza: 'de pizza', rosca: 'de rosca' };
      itens.push('gráfico <b>' + nomeG[I.grafico] + '</b>');
    }
    if (I.periodo) itens.push('período: <b>' + esc(I.periodo.rot) + '</b> (' + br(R.de) + ' a ' + br(R.ate) + ')');
    else itens.push('período: <b>todo o histórico</b>');
    itens.push('data: <b>' + (I.base === 'dv' ? 'da vistoria' : 'do lançamento') + '</b>');
    I.filtros.forEach(function (f) { itens.push('<b>' + esc(f.rot) + '</b>'); });
    if (I.grupo) itens.push('agrupado por <b>' + esc(I.grupo.rot) + '</b>');
    if (I.ordem || I.grupo) {
      var o = I.ordem === 'asc' ? 'crescente' : (I.grupo && I.grupo.tempo && !I.ordem) ? 'cronológica' : 'decrescente';
      itens.push('ordem <b>' + o + '</b>');
    }
    return '<div class="ia-entendi"><span>Entendi:</span> ' + itens.map(function (t) {
      return '<em>' + t + '</em>';
    }).join('') + '</div>';
  }

  function celulaValor(I, v) {
    if (I.metrica === 'ha' || I.metrica === 'hrs') return fmt(v, 1);
    return fmt(v);
  }

  function renderResposta(texto, I, R, C) {
    var rm = ROT_METRICA[I.metrica];
    var unidade = R.principal === 1 ? rm[0] : rm[1];
    var dec = (I.metrica === 'ha' || I.metrica === 'hrs') ? 1 : 0;
    var h = '<article class="ia-resp">';
    h += '<div class="ia-pergunta"><span aria-hidden="true">&ldquo;</span>' + esc(texto) + '<span aria-hidden="true">&rdquo;</span></div>';
    h += entendi(I, R);

    if (!R.tot.n) {
      h += '<p class="ia-vazio">Nenhum relatório encontrado nesse recorte.';
      if (I.periodo && C.ultimoD && R.de > C.ultimoD) {
        h += ' O último lançamento da base publicada é de <b>' + br(C.ultimoD) + '</b>.';
        if (I.periodo.rel && !I.ancora) {
          h += '</p><p class="ia-vazio"><button type="button" class="ia-sug ia-ancora" data-ancora="' + C.ultimoD +
            '" data-q="' + esc(texto) + '">Refazer contando a partir do último lançamento (' + br(C.ultimoD) + ')</button>';
        }
      }
      h += '</p></article>';
      return h;
    }

    h += '<div class="ia-kpis">';
    var multiM = I.metricas.length > 1;
    if (multiM) {
      I.metricas.forEach(function (m, j) {
        var v = m === 'prod' ? R.tot.prod : R.tot[m];
        h += '<div class="ia-kpi destaque"><b>' + fmt(v, decDe(m)) + '</b><span>' + esc(ROT_CURTO[m].toLowerCase()) + '</span></div>';
      });
    } else {
      h += '<div class="ia-kpi destaque"><b>' + fmt(R.principal, dec) + '</b><span>' + esc(unidade) + '</span></div>';
    }
    if (!multiM && I.metrica !== 'n') h += '<div class="ia-kpi"><b>' + fmt(R.tot.n) + '</b><span>relatório' + ptn(R.tot.n) + '</span></div>';
    if (!multiM && I.metrica !== 'ha' && R.tot.ha > 0) h += '<div class="ia-kpi"><b>' + fmt(R.tot.ha, 1) + '</b><span>hectares</span></div>';
    if (!multiM && I.metrica !== 'prod') h += '<div class="ia-kpi"><b>' + fmt(R.tot.prod) + '</b><span>produtor' + (R.tot.prod === 1 ? '' : 'es') + '</span></div>';
    if (!I.grupo || I.grupo.id !== 'mun') h += '<div class="ia-kpi"><b>' + fmt(R.tot.mun) + '</b><span>município' + ptn(R.tot.mun) + '</span></div>';
    h += '</div>';

    if (R.linhas && I.grafico) h += grafico(I, R);

    if (R.linhas && multiM) {
      var cols = I.metricas.map(function (m) { return { rot: ROT_CURTO[m], m: m }; });
      h += '<div class="ia-tab-wrap"><table class="ia-tab"><thead><tr><th>' +
        esc(I.grupo.rot.charAt(0).toUpperCase() + I.grupo.rot.slice(1)) + '</th>' +
        cols.map(function (c) { return '<th class="num">' + esc(c.rot) + '</th>'; }).join('') + '</tr></thead><tbody>';
      R.linhas.forEach(function (l) {
        h += '<tr><td>' + esc(rotuloChave(I.grupo.id, l.k)) + '</td>' +
          cols.map(function (c) { return '<td class="num">' + fmt(valorDe(l, c.m), decDe(c.m)) + '</td>'; }).join('') + '</tr>';
      });
      h += '</tbody></table></div><p class="ia-nota">' + R.linhas.length + ' linha' + ptn(R.linhas.length) +
        ' · cada série tem a sua escala no gráfico (esquerda: ' + esc(ROT_CURTO[I.metricas[0]].toLowerCase()) +
        (I.metricas[1] ? '; direita: ' + esc(ROT_CURTO[I.metricas[1]].toLowerCase()) : '') + ')</p>';
    } else if (R.linhas) {
      var max = R.linhas.reduce(function (a, l) { return Math.max(a, l.val); }, 0) || 1;
      var somaVal = R.linhas.reduce(function (a, l) { return a + l.val; }, 0);
      // atendimentos com mais de uma cultura/máquina somam mais que o total: o % usa a soma da lista
      var colExtra = [];
      if (I.metrica !== 'n') colExtra.push({ rot: 'Relatórios', f: function (l) { return fmt(l.n); } });
      if (I.metrica !== 'ha' && R.tot.ha > 0) colExtra.push({ rot: 'Hectares', f: function (l) { return fmt(l.ha, 1); } });
      if (I.metrica !== 'prod' && I.grupo.id !== 'prod') colExtra.push({ rot: 'Produtores', f: function (l) { return fmt(l.prod); } });

      h += '<div class="ia-tab-wrap"><table class="ia-tab"><thead><tr><th class="num">#</th><th>' +
        esc(I.grupo.rot.charAt(0).toUpperCase() + I.grupo.rot.slice(1)) + '</th><th>' +
        esc(I.metrica === 'n' ? 'Relatórios' : rm[1].charAt(0).toUpperCase() + rm[1].slice(1)) + '</th><th class="num">%</th>' +
        colExtra.map(function (c) { return '<th class="num">' + c.rot + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      R.linhas.forEach(function (l, i) {
        var pct = somaVal ? l.val / somaVal * 100 : 0;
        h += '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(rotuloChave(I.grupo.id, l.k)) + '</td>' +
          '<td class="ia-barra"><i style="width:' + Math.max(2, l.val / max * 100).toFixed(1) + '%"></i><b>' +
          celulaValor(I, l.val) + '</b></td><td class="num">' + fmt(pct, 1) + '%</td>' +
          colExtra.map(function (c) { return '<td class="num">' + c.f(l) + '</td>'; }).join('') + '</tr>';
      });
      h += '</tbody></table></div>';
      h += '<p class="ia-nota">' + R.linhas.length + ' linha' + ptn(R.linhas.length) +
        (I.grupo.id === 'cult' || I.grupo.id === 'maq' || I.grupo.id === 'impl'
          ? ' · um atendimento pode ter mais de um item, por isso a soma pode passar do total' : '') + '</p>';
    } else {
      // sem agrupamento: os lançamentos mais recentes do recorte
      var ult = R.lista.slice().sort(function (a, b) {
        var x = R.ordemDia(a), y = R.ordemDia(b);
        return x < y ? 1 : x > y ? -1 : 0;
      }).slice(0, 10);
      h += '<div class="ia-tab-wrap"><table class="ia-tab"><thead><tr><th>Data</th><th>Município</th>' +
        (C.publico ? '' : '<th>Produtor</th>') + '<th>Tipo</th><th class="num">Hectares</th></tr></thead><tbody>';
      ult.forEach(function (r) {
        h += '<tr><td>' + br(R.ordemDia(r)) + '</td><td>' + esc(r.mun || NI) + '</td>' +
          (C.publico ? '' : '<td>' + esc(r.prod || NI) + '</td>') +
          '<td>' + esc(r.pc || '') + '</td><td class="num">' + fmt(r.ha || 0, 1) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      h += '<p class="ia-nota">Os ' + ult.length + ' mais recentes do recorte. Peça “por município”, “por cultura”, “por mês”… para ver o ranking.</p>';
    }
    h += '</article>';
    return h;
  }

  function renderAjuda(texto) {
    return '<article class="ia-resp"><div class="ia-pergunta"><span aria-hidden="true">&ldquo;</span>' + esc(texto) +
      '<span aria-hidden="true">&rdquo;</span></div><p class="ia-vazio">Não consegui montar uma consulta com essa frase. ' +
      'Diga o que contar (relatórios, hectares, horas, produtores), o período (últimos 15 dias, este mês, 2025…) ' +
      'e, se quiser, como agrupar (por município, escritório, cultura, mês…).</p></article>';
  }

  /* ----------------------------------------------------- perguntas prováveis ----
     O algoritmo olha a base inteira e prevê o que a pessoa mais provavelmente
     quer saber: o último mês com lançamento, o município, a cultura e a regional
     que mais pesam no ano mais recente, os comparativos que a base permite, e o
     que a própria pessoa já perguntou neste navegador (vem primeiro). Ao digitar,
     a lista é filtrada pelas palavras escritas. */
  var CHAVE_HIST = 'seagri_assistente_hist';

  function lerHistorico() {
    try { return JSON.parse(localStorage.getItem(CHAVE_HIST) || '[]').filter(function (x) { return typeof x === 'string'; }); }
    catch (e) { return []; }
  }
  function gravarHistorico(texto) {
    try {
      var h = lerHistorico().filter(function (x) { return norm(x) !== norm(texto); });
      h.unshift(texto);
      localStorage.setItem(CHAVE_HIST, JSON.stringify(h.slice(0, 12)));
    } catch (e) { /* modo privado: segue sem histórico */ }
  }

  function maiorChave(arr, chaves, valor) {
    var m = new Map();
    arr.forEach(function (r) {
      var ks = chaves(r);
      (Array.isArray(ks) ? ks : [ks]).forEach(function (k) {
        if (!k || k === NI) return;
        m.set(k, (m.get(k) || 0) + valor(r, k));
      });
    });
    var melhor = null;
    m.forEach(function (v, k) { if (!melhor || v > melhor.v) melhor = { k: k, v: v }; });
    return melhor && melhor.v > 0 ? melhor.k : null;
  }

  var PREV_CACHE = null;
  function candidatas(C) {
    if (PREV_CACHE && PREV_CACHE.n === C.registros.length && PREV_CACHE.p === C.publico) return PREV_CACHE.lista;
    var reg = C.registros, out = [], ult = C.ultimoD;
    if (!ult) return out;
    var ano = ult.slice(0, 4), mesIdx = +ult.slice(5, 7) - 1, mesRot = MESES[mesIdx] + ' de ' + ano;
    var doAno = reg.filter(function (r) { return r.d && r.d.slice(0, 4) === ano; });
    var anos = {};
    reg.forEach(function (r) { if (r.d) anos[r.d.slice(0, 4)] = true; });
    var nAnos = Object.keys(anos).length;

    var topMun = maiorChave(doAno, function (r) { return r.mun; }, function (r) { return r.ha || 0; });
    var topCult = maiorChave(doAno, function (r) { return (r.cult || []).map(function (c) { return c[0]; }); },
      function (r, k) { return (r.cult || []).reduce(function (a, c) { return a + (c[0] === k ? c[1] || 0 : 0); }, 0); });
    var topReg = maiorChave(doAno, function (r) { return C.regionalDe(r.mun); }, function (r) { return r.ha || 0; });
    var temAcu = doAno.some(function (r) { return r.pc === C.ACU && r.hrs > 0; });

    out.push('Relatórios por município em ' + mesRot);
    out.push('Gráfico de linha comparando hectares e horas por mês de ' + ano);
    if (!C.publico) out.push('Quem mais lançou relatórios em ' + mesRot + '?');
    if (topMun) out.push('Hectares por cultura em ' + topMun + ' em ' + ano);
    if (topCult) out.push('Hectares de ' + topCult + ' por município em ' + ano);
    if (topReg) out.push('Hectares da regional ' + topReg + ' por município em ' + ano);
    out.push('Os 5 municípios com mais hectares em ' + ano);
    out.push('Gráfico de pizza de hectares por cultura em ' + ano);
    out.push('Quantos produtores foram atendidos por município em ' + ano);
    out.push('Relatórios por dia em ' + mesRot);
    out.push('Atendimentos por máquina em ' + ano);
    if (temAcu) out.push('Horas de máquina por escritório em ' + ano);
    if (nAnos > 1) out.push('Gráfico de colunas de hectares por ano');
    out.push('Quantos relatórios foram lançados nos últimos 15 dias? Quais os municípios?');
    PREV_CACHE = { n: C.registros.length, p: C.publico, lista: out };
    return out;
  }

  /** Lista final: o que a pessoa digitou filtra; sem texto, o histórico vem antes. */
  function prever(C, digitado, max) {
    var hist = lerHistorico().map(function (t) { return { t: t, recente: true }; });
    var dados = candidatas(C).map(function (t) { return { t: t, recente: false }; });
    var vistos = {}, uniq = [];
    hist.concat(dados).forEach(function (x) {
      var k = norm(x.t);
      if (vistos[k]) return;
      vistos[k] = true;
      uniq.push(x);
    });
    var tokens = norm(digitado).split(/[^a-z0-9]+/).filter(function (p) { return p.length >= 2; });
    if (!tokens.length) {
      return uniq.filter(function (x) { return x.recente; }).slice(0, 2)
        .concat(uniq.filter(function (x) { return !x.recente; })).slice(0, max);
    }
    return uniq.map(function (x) {
      var n = norm(x.t), pts = 0;
      tokens.forEach(function (tk) { if (n.indexOf(tk) >= 0) pts += tk.length; });
      return { x: x, pts: pts + (x.recente ? 0.5 : 0) };
    }).filter(function (o) { return o.pts > 0; })
      .sort(function (a, b) { return b.pts - a.pts; })
      .slice(0, max).map(function (o) { return o.x; });
  }

  /* ---------------------------------------------------------- contexto ---- */
  var CACHE = null;
  function montarContexto() {
    var P = window.PAINEL_DADOS;
    if (!P) return null;
    var reg = P.registros();
    var C = {
      registros: reg, MEC: P.MEC, ACU: P.ACU, dataRef: P.dataRef, regionalDe: P.regionalDe,
      chaveProdutor: P.chaveProdutor, regionais: P.regionais ? P.regionais() : [], publico: !!window.MODO_PUBLICO, hoje: new Date(), data: null
    };
    if (CACHE && CACHE.n === reg.length) {
      Object.keys(CACHE.c).forEach(function (k) { C[k] = CACHE.c[k]; });
      return C;
    }
    C.idxMun = indice(reg, function (r) { return r.mun; });
    C.idxEsc = indice(reg, function (r) { return r.esc; });
    C.idxCult = indice(reg, function (r) { return (r.cult || []).map(function (c) { return c[0]; }); });
    C.setMun = {};
    C.idxMun.forEach(function (e) { C.setMun[e[0]] = true; });

    var nomes = {};   // primeiro nome -> { alim:Set, rt:Set, mesmo }
    function add(valor, tipo) {
      if (!valor || valor === NI) return;
      var p = primeiraPalavra(valor);
      if (p.length < 4) return;
      var e = nomes[p] || (nomes[p] = { alim: new Set(), rt: new Set(), mesmo: false });
      e[tipo].add(norm(valor).replace(/[.\s]+/g, ' ').trim());
    }
    reg.forEach(function (r) { add(r.alim, 'alim'); add(r.rt, 'rt'); });
    // uma pessoa só costuma aparecer como "Fulano.Sobrenome" (login) e "Fulano Sobrenome da Silva" (técnico)
    Object.keys(nomes).forEach(function (p) {
      var e = nomes[p];
      e.mesmo = Math.max(e.alim.size, e.rt.size) <= 1;
    });
    C.primeirosNomes = nomes;
    C.ultimoD = reg.reduce(function (a, r) { return r.d && r.d > a ? r.d : a; }, '');
    CACHE = { n: reg.length, c: {
      idxMun: C.idxMun, idxEsc: C.idxEsc, idxCult: C.idxCult, setMun: C.setMun,
      primeirosNomes: C.primeirosNomes, ultimoD: C.ultimoD } };
    return C;
  }

  /* ------------------------------------------------------------- interface ---- */
  function iniciar() {
    var raiz = document.getElementById('assistenteDados');
    if (!raiz) return;
    // melhor lugar: dentro da barra azul do topo, à direita; sem ela, fica flutuante
    var barra = document.querySelector('header.cab-padrao, header.cab-painel');
    if (barra) { barra.appendChild(raiz); raiz.classList.add('na-barra'); }
    var orbCanvas = raiz.querySelector('.ia-orb');
    var abrir = raiz.querySelector('.ia-abrir');
    var caixa = raiz.querySelector('.ia-caixa');
    var form = raiz.querySelector('.ia-form');
    var campo = raiz.querySelector('.ia-campo');
    var saida = raiz.querySelector('.ia-saida');
    var limpar = raiz.querySelector('.ia-limpar');
    var prevBox = raiz.querySelector('.ia-prev');
    var sugestoes = raiz.querySelector('.ia-sugestoes');
    var estadoRot = raiz.querySelector('.ia-estado');

    var orb = criarOrb(orbCanvas, 40, 9, true);
    var ocupado = false;

    function pintarEstado(nome, rot) {
      // fechado ou aberto, o orb fica sempre em movimento (ondas); só muda para "pensando" ao consultar
      orb.estado(nome === 'thinking' ? 'thinking' : 'listening');
      if (estadoRot) estadoRot.textContent = rot;
    }

    /** A caixa é fixed (o header corta o que passa dele): encosta abaixo da barra. */
    function posicionar() {
      if (!barra) return;
      var b = barra.getBoundingClientRect().bottom;
      raiz.style.setProperty('--ia-top', Math.max(8, Math.round(b) + 6) + 'px');
    }
    window.addEventListener('scroll', function () { if (!caixa.hidden) posicionar(); }, { passive: true });
    window.addEventListener('resize', function () { if (!caixa.hidden) posicionar(); });

    function alternar(abrirCaixa, semFoco) {
      var aberta = abrirCaixa == null ? caixa.hidden : abrirCaixa;
      if (aberta) posicionar();
      caixa.hidden = !aberta;
      abrir.setAttribute('aria-expanded', aberta ? 'true' : 'false');
      raiz.classList.toggle('aberto', aberta);
      if (chamariz) { chamariz.textContent = FRASES[0]; fi = 0; }
      if (aberta) { if (!semFoco) campo.focus(); pintarEstado('listening', 'Pode perguntar'); }
      else pintarEstado('idle', 'Pode perguntar');
    }

    /* Chamariz: enquanto a caixa está fechada o texto acima do orb troca de frase. */
    var FRASES = ['Pergunte ao “Agricultura”', 'Quantos relatórios hoje?', 'Compare hectares e horas',
      'Gere um gráfico', 'Hectares por município?', 'Pergunte aos dados'];
    var chamariz = raiz.querySelector('.ia-abrir-txt'), fi = 0;
    setInterval(function () {
      if (!chamariz || !caixa.hidden) return;
      chamariz.classList.add('troca');
      setTimeout(function () {
        fi = (fi + 1) % FRASES.length;
        chamariz.textContent = FRASES[fi];
        chamariz.classList.remove('troca');
      }, 260);
    }, 3200);

    /* Passar o mouse abre a caixa; clicar a "fixa" aberta (e é o jeito no toque).
       Sair com o mouse só fecha se ela não foi fixada, não está em uso e não
       tem pergunta em andamento. */
    var fixado = false, fecharEm = 0;
    function podeFechar() {
      return !fixado && !ocupado && document.activeElement !== campo && !campo.value;
    }
    raiz.addEventListener('mouseenter', function () {
      clearTimeout(fecharEm);
      if (caixa.hidden) alternar(true, true);
    });
    raiz.addEventListener('mouseleave', function () {
      clearTimeout(fecharEm);
      fecharEm = setTimeout(function () { if (!caixa.hidden && podeFechar()) alternar(false); }, 450);
    });
    abrir.addEventListener('click', function () {
      fixado = caixa.hidden ? true : !fixado;
      if (caixa.hidden) alternar(true);
      else if (!fixado) alternar(false);
      else campo.focus();
    });

    function mostrarPrevisoes() {
      var C = montarContexto();
      if (!C || !C.registros.length) { prevBox.hidden = true; return; }
      var lista = prever(C, campo.value, 5);
      prevBox.hidden = !lista.length;
      sugestoes.innerHTML = lista.map(function (x) {
        return '<button type="button" class="ia-sug' + (x.recente ? ' recente' : '') + '">' + esc(x.t) + '</button>';
      }).join('');
    }
    campo.addEventListener('input', mostrarPrevisoes);
    sugestoes.addEventListener('click', function (e) {
      var b = e.target.closest('.ia-sug');
      if (!b) return;
      campo.value = b.textContent;
      perguntar(campo.value);
    });
    // os dados chegam depois da página: tenta de novo quando a caixa abre
    abrir.addEventListener('click', mostrarPrevisoes);
    raiz.addEventListener('mouseenter', mostrarPrevisoes);

    campo.addEventListener('focus', function () { if (!ocupado) pintarEstado('listening', 'Pode perguntar'); });
    campo.addEventListener('blur', function () { if (!ocupado) pintarEstado('idle', 'Pode perguntar'); });
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { fixado = false; alternar(false); abrir.focus(); }
    });

    saida.addEventListener('click', function (e) {
      var b = e.target.closest('.ia-ancora');
      if (b) perguntar(b.getAttribute('data-q'), b.getAttribute('data-ancora'));
    });

    limpar.addEventListener('click', function () {
      saida.innerHTML = '';
      limpar.hidden = true;
      campo.focus();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = campo.value.trim();
      if (t) perguntar(t);
    });

    /** Perguntas que olham anos anteriores precisam do histórico, que o painel
        carrega em segundo plano; espera um pouco por ele antes de responder. */
    function esperarBase(precisaHistorico) {
      return new Promise(function (resolve) {
        var P = window.PAINEL_DADOS;
        if (!precisaHistorico || !P || P.historicoCarregado()) return resolve(true);
        var tent = 0, t = setInterval(function () {
          tent++;
          if (P.historicoCarregado() || tent > 30) { clearInterval(t); resolve(P.historicoCarregado()); }
        }, 200);
      });
    }

    function perguntar(texto, ancora) {
      if (ocupado) return;
      var C = montarContexto();
      if (!C || !C.registros.length) {
        saida.insertAdjacentHTML('afterbegin', '<p class="ia-vazio">Os dados ainda estão carregando. Tente de novo em instantes.</p>');
        return;
      }
      ocupado = true;
      gravarHistorico(texto);
      campo.value = '';
      pintarEstado('thinking', 'Consultando os dados…');
      var hoje = C.hoje;
      if (ancora) hoje = C.hoje = new Date(+ancora.slice(0, 4), +ancora.slice(5, 7) - 1, +ancora.slice(8, 10));
      var I = interpretar(texto, C);
      if (ancora && I.periodo) {
        I.ancora = ancora;
        I.periodo.rot += ', até o último lançamento';
      }
      var anoCorr = String(C.hoje.getFullYear());
      var precisaHist = !I.periodo || I.periodo.de.slice(0, 4) < anoCorr;

      Promise.all([esperarBase(precisaHist), new Promise(function (r) { setTimeout(r, 450); })]).then(function (res) {
        var html;
        var entendeu = I.periodo || I.filtros.length || I.grupo || I.metrica !== 'n' || I.grafico ||
          /\bquant|\brelatorio|\batendiment|\bvistoria|\blanc|\btotal|\bquais\b|\bquem\b/.test(norm(texto));
        if (!entendeu) html = renderAjuda(texto);
        else {
          C = montarContexto() || C;
          C.hoje = hoje;
          var R = aplicar(I, C);
          html = renderResposta(texto, I, R, C);
          if (precisaHist && !res[0]) {
            html = html.replace('</article>', '<p class="ia-nota">Os anos anteriores ainda não terminaram de carregar; ' +
              'o resultado pode estar incompleto. Pergunte de novo em instantes.</p></article>');
          }
          if (I.avisos.length) {
            html = html.replace('</article>', '<p class="ia-nota">' + esc(I.avisos.join(' ')) + '</p></article>');
          }
        }
        saida.insertAdjacentHTML('afterbegin', html);
        mostrarPrevisoes();
        // mantém só as últimas respostas na tela
        var todas = saida.querySelectorAll('.ia-resp');
        for (var i = 6; i < todas.length; i++) todas[i].remove();
        limpar.hidden = false;
        ocupado = false;
        pintarEstado('listening', 'Pode perguntar');
        campo.focus();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
