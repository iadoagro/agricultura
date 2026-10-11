/* Apuração por seção em tempo real do 2º turno (Governador) para o painel detalhado da aba "Eleições" de eleicoes.html.
   Lê, direto do TSE (CORS liberado), os BOLETINS DE URNA de cada seção assim que a urna é totalizada:
     lista de seções + hora de recebimento:  <base>/<ciclo>/arquivo-urna/<pleito>/config/ac/ac-p00<pleito>-cs.json
     arquivos da seção (hash):               .../arquivo-urna/<pleito>/dados/ac/<mun>/<zona>/<secao>/p00<pleito>-ac-m<mun>-z<zona>-s<secao>-aux.json
     boletim (ASN.1/BER):                    .../<secao>/<hash>/o...-bu.dat
   O BU é decodificado aqui mesmo (decodificador BER mínimo): cargo 3 = Governador; tipo de voto 1 nominal, 2 branco, 3 nulo.
   Cada seção é baixada uma vez (e guardada no navegador); depois o arquivo de seções é consultado a cada 30 s e só as novas
   (ou retotalizadas) são buscadas. Com os votos, monta o mesmo conjunto de dados de js/dados-governo-2turno-2026.js
   e manda o painel (js/eleicao-painel.js → PainelGoverno2T.atualizar) se redesenhar. Foco do painel: Mailza Assis (11).
   Teste com o 1º turno: abra eleicoes.html?detalhe=1#eleicoes (usa o pleito 3220, onde todas as seções já foram apuradas). */
(function () {
  'use strict';
  var D = window.GOVERNO_2T_2026, painel = function () { return window.PainelGoverno2T; };
  if (!D) return;

  var TESTE = /[?&]detalhe=1\b/.test(location.search);
  var CFG = {
    base: 'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna', uf: 'ac', cargo: 3, foco: 11, rival: 10, concorrentes: 6,
    pleito: TESTE ? '3220' : '3221', turno: TESTE ? 1 : 2, intervalo: 30000, paralelo: 10, lote: 150
  };
  CFG.intervalo = 30000;   // fixo, no mesmo ritmo de js/eleicoes-2turno.js
  var SEM_BAIRRO = '(sem bairro informado)';
  var LS = 'et2t-bu-' + CFG.pleito + '-v1';
  var concluidas = null, NIVEL_ROT = { reg: 'Regional', mun: 'Município', zona: 'Zona', bairro: 'Bairro', local: 'Local de votação' };
  function capN(t) { return String(t).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (D[aeo]s?|E) /g, function (x) { return x.toLowerCase(); }); }
  var cache = {}, estadoBusca = { ultima: '', total: 0, recebidas: 0, carregadas: 0, falhas: 0, rodando: false, erro: '' };
  var base = D.secoes.map(function (r) { return r.slice(); });
  var idx = {};   // "mun|zona|secao" -> posição em base
  base.forEach(function (r, i) { idx[r[0] + '|' + r[1] + '|' + r[2]] = i; });
  var nomes = {};
  ((window.GOVERNO_2026 && window.GOVERNO_2026.candidatos) || D.candidatos || []).forEach(function (c) { nomes[c.num] = c.nome; });
  (D.candidatos || []).forEach(function (c) { nomes[c.num] = nomes[c.num] || c.nome; });
  var D0 = { cand: JSON.parse(JSON.stringify(D.cand)), estado: JSON.parse(JSON.stringify(D.estado)), candidatos: JSON.parse(JSON.stringify(D.candidatos || [])) };

  try { cache = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { cache = {}; }
  function salva() { try { localStorage.setItem(LS, JSON.stringify(cache)); } catch (e) { /* cheio/privado: segue sem cache */ } }

  /* ---------- BER mínimo ---------- */
  function ber(b, i, fim) {
    var r = [];
    while (i < fim) {
      var t = b[i++], cons = (t >> 5) & 1, cls = t >> 6, tag = t & 31;
      if (tag === 31) { tag = 0; var x; do { x = b[i++]; tag = (tag << 7) | (x & 127); } while (x & 128); }
      var l = b[i++];
      if (l & 128) { var n = l & 127; l = 0; while (n--) l = l * 256 + b[i++]; }
      var no = { c: cls, t: tag, i: i, l: l };
      if (cons) no.k = ber(b, i, i + l);
      r.push(no); i += l;
    }
    return r;
  }
  function inteiro(b, no) { var v = 0; for (var j = 0; j < no.l; j++) v = v * 256 + b[no.i + j]; return v; }

  /* extrai { apt, comp, v: {num: votos}, b, n } do cargo escolhido; null se não achar */
  function leBU(buf) {
    var b = new Uint8Array(buf), raiz = ber(b, 0, b.length)[0];
    var ult = raiz.k[raiz.k.length - 1];                       // OCTET STRING com o corpo do boletim, também em BER
    var corpo = ber(b, ult.i, ult.i + ult.l)[0].k, res = null;
    for (var j = corpo.length - 1; j >= 0; j--) {
      var x = corpo[j];
      if (x.c === 0 && x.t === 16 && x.k && x.k.length && x.k[0].t === 16 && x.k.length >= 2) { res = x; break; }
    }
    if (!res) return null;
    var out = null;
    res.k.forEach(function (rv) {                              // uma entrada por eleição (código 6259/6260…)
      if (!rv.k || rv.k.length < 5 || !rv.k[4].k) return;
      var apt = inteiro(b, rv.k[1]);
      rv.k[4].k.forEach(function (tot) {                       // totais por tipo de apuração
        var comp = inteiro(b, tot.k[1]);
        (tot.k[2].k || []).forEach(function (cg) {
          if (!cg.k || inteiro(b, cg.k[0]) !== CFG.cargo || out) return;
          var o = { apt: apt, comp: comp, v: {}, b: 0, n: 0 };
          (cg.k[cg.k.length - 1].k || []).forEach(function (it) {
            var tp = inteiro(b, it.k[0]), q = inteiro(b, it.k[1]);
            if (tp === 1) { var id = it.k[2] && it.k[2].k; var num = id && id.length ? inteiro(b, id[id.length - 1]) : 0; o.v[num] = (o.v[num] || 0) + q; }
            else if (tp === 2) o.b += q; else if (tp === 3) o.n += q;
          });
          out = o;
        });
      });
    });
    return out;
  }

  /* ---------- rede ---------- */
  function get(url, bin) {
    return (window.tseFetch || fetch)(url, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error('TSE respondeu ' + r.status);
      return bin ? r.arrayBuffer() : r.json();
    });
  }
  function p4(n) { return String(n).padStart(4, '0'); }
  function buscaSecao(s) {
    var d = CFG.base + '/' + CFG.pleito + '/dados/' + CFG.uf + '/' + s.mun + '/' + p4(s.zona) + '/' + p4(s.sec) + '/';
    return get(d + 'p00' + CFG.pleito + '-' + CFG.uf + '-m' + s.mun + '-z' + p4(s.zona) + '-s' + p4(s.sec) + '-aux.json').then(function (aux) {
      if (!aux || !aux.hashes || !aux.hashes.length) return null;
      var h = aux.hashes.filter(function (x) { return x.st === 'Totalizado'; })[0] || aux.hashes[aux.hashes.length - 1];
      var bu = (h.arq || []).filter(function (a) { return a.tp === 'bu'; })[0];
      if (!bu) return null;
      return get(d + h.hash + '/' + bu.nm, true);
    }).then(function (buf) { return buf ? leBU(buf) : null; });
  }
  function listaRecebidas() {
    return get(CFG.base + '/' + CFG.pleito + '/config/' + CFG.uf + '/' + CFG.uf + '-p00' + CFG.pleito + '-cs.json').then(function (d) {
      var o = [];
      if (!d || !d.abr || !d.abr[0]) return o;
      (d.abr[0].mu || []).forEach(function (m) {
        (m.zon || []).forEach(function (z) {
          (z.sec || []).forEach(function (s) {
            var k = m.cd + '|' + parseInt(z.cd, 10) + '|' + parseInt(s.ns, 10);
            if (s.da && idx[k] != null) o.push({ k: k, mun: m.cd, zona: parseInt(z.cd, 10), sec: parseInt(s.ns, 10), carimbo: s.da + ' ' + s.ha });
          });
        });
      });
      return o;
    });
  }


  /* ---------- histórico passo a passo: ordem em que as urnas foram sendo apuradas ---------- */
  var LIMS = [500, 1000, 2000, 5000, 10000, 20000, 30000, 50000, 75000, 100000, 150000];
  function mil(n) { return Math.abs(n).toLocaleString('pt-BR'); }
  function constroiHistorico(meta, cont) {
    var itens = [], nA = capN(D0.cand.nome), nB = capN(nomes[CFG.rival] || 'Adversário');
    Object.keys(cache).forEach(function (k) {
      var c = cache[k], m = meta[k]; if (!c || !c.v || !m) return;
      var p = /(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/.exec(c.c || '');
      itens.push({ k: k, c: c, m: m, t: p ? Date.UTC(+p[3], +p[2] - 1, +p[1], +p[4], +p[5], +p[6]) : 0, hora: p ? p[4] + ':' + p[5] + ':' + p[6] : '' });
    });
    itens.sort(function (a, b) { return a.t - b.t || (a.k < b.k ? -1 : 1); });
    var ev = [], q1 = 0, q2 = 0, n = 0, total = base.length, lider = 0, mudancas = 0, marcoI = 0, MARCOS = [10, 25, 50, 75, 90], limI = 0, ok = { reg: {}, mun: {}, zona: {} }, maior = { v: 0, quem: 0, hora: '' };
    var plac = function () { return nA + ' ' + mil(q1) + ' × ' + mil(q2) + ' ' + nB; };
    var tempo = { 1: 0, 2: 0 }, vezes = { 1: 0, 2: 0 }, liderT = 0, desde = 0, primeiroT = itens.length ? itens[0].t : 0, ultimoT = itens.length ? itens[itens.length - 1].t : 0, prevT = 0, prevL = 0;
    itens.forEach(function (it) {
      var v1 = it.c.v[CFG.foco] || 0, v2 = it.c.v[CFG.rival] || 0, m = it.m;
      if (prevL && it.t > prevT) tempo[prevL] += it.t - prevT;   // o líder do acumulado anterior ficou na frente até esta urna
      q1 += v1; q2 += v2; n++;
      var sal = q1 - q2, l = sal > 0 ? 1 : sal < 0 ? 2 : 0, pct = n / total * 100;
      if (l && l !== prevL) { vezes[l]++; desde = it.t; }
      prevT = it.t; prevL = l;
      var onde = 'seção ' + p4(m.sec) + ' (zona ' + p4(m.zona) + ', ' + m.mn + ')';
      var q = l === 1 ? nA : nB, quem = l;
      var push = function (tipo, cor, titulo, detalhe) { ev.push({ hora: it.hora, tipo: tipo, cor: cor, titulo: titulo, detalhe: detalhe, pct: pct, n: n }); };
      if (n === 1) {
        push('inicio', l, 'Começa a apuração', 'Primeira urna: ' + onde + ' — ' + nA + ' ' + v1 + ' × ' + v2 + ' ' + nB + (l ? '. ' + q + ' abre na frente.' : '. Empate na primeira urna.'));
        lider = l;
      } else if (l && l !== lider) {
        if (lider) mudancas++;
        push('lider', l, q + (lider ? ' passa à frente' : ' assume a liderança'), 'Na ' + onde + ' o placar acumulado ficou ' + plac() + ' — diferença de ' + mil(sal) + ' votos, com ' + pct.toFixed(1).replace('.', ',') + '% das seções apuradas.');
        lider = l; limI = 0;
      }
      var abs = Math.abs(sal);
      while (l && limI < LIMS.length && abs >= LIMS[limI]) {
        if (n > 1 && lider === l) push('margem', l, q + ' amplia a vantagem para ' + mil(LIMS[limI]) + ' votos', 'A ' + onde + ' levou a diferença a ' + mil(sal) + ' votos (' + plac() + ').');
        limI++;
      }
      var net = v1 - v2; if (Math.abs(net) > maior.v) maior = { v: Math.abs(net), quem: net > 0 ? 1 : 2, hora: it.hora, onde: 'seção ' + p4(m.sec) + ', zona ' + p4(m.zona) + ', ' + m.mn };
      while (marcoI < MARCOS.length && pct >= MARCOS[marcoI]) { push('marco', 0, MARCOS[marcoI] + '% das seções apuradas', 'Placar acumulado: ' + plac() + (l ? ' — ' + q + ' à frente por ' + mil(sal) + ' votos.' : ' — empate.')); marcoI++; }
      [['reg', 'Regional'], ['mun', 'Município'], ['zona', 'Zona']].forEach(function (nv) {
        var key = m.ks[nv[0]], u = cont[nv[0]][key]; if (!u) return;
        ok[nv[0]][key] = (ok[nv[0]][key] || 0) + 1;
        if (ok[nv[0]][key] === u.n && u.n > 0) {
          var a = 0, b = 0;
          itens.forEach(function (o) { if (o.m.ks[nv[0]] === key && o.t <= it.t) { a += o.c.v[CFG.foco] || 0; b += o.c.v[CFG.rival] || 0; } });
          push('concluida', a === b ? 0 : a > b ? 1 : 2, nv[1] + ' ' + (nv[0] === 'reg' ? '' : '') + m.nm[nv[0]] + ' 100% apurado', 'Resultado na unidade: ' + nA + ' ' + mil(a) + ' × ' + mil(b) + ' ' + nB + (a === b ? ' (empate).' : ' — ' + (a > b ? nA : nB) + ' venceu.'));
        }
      });
      if (n === total) push('fim', l, 'Apuração concluída', 'Todas as ' + mil(total) + ' seções apuradas. Resultado final: ' + plac() + (l ? ' — ' + q + ' vence por ' + mil(sal) + ' votos.' : ' — empate.'));
    });
    return { eventos: ev, mudancas: mudancas, maior: maior, n: n, total: total, q1: q1, q2: q2,
      lideranca: { quem: prevL, desde: desde, ultimoT: ultimoT, primeiroT: primeiroT, tempo1: tempo[1], tempo2: tempo[2], vezes1: vezes[1], vezes2: vezes[2], mudancas: mudancas } };
  }

  /* ---------- montagem dos dados do painel ---------- */
  function monta() {
    var T = window.TCHE_2026, regional = D.regional || (T && T.regional) || {}, locais = D.locais || (T && T.locais) || {};
    var cands = Object.keys(nomes).map(Number).filter(function (n) { return n !== 95 && n !== 96; });
    cands = [CFG.foco, CFG.rival];   // 2º turno real: só os dois; simulação (dados do 1º turno): idem, descartando os votos dos demais, sem transferência
    var estado = { v: {}, b: 0, n: 0 }, un = { reg: {}, mun: {}, zona: {}, bairro: {}, local: {}, sec: {} }, nCarr = 0;
    var meta = {}, PF = window.PERFIL_2026 || {}, cont = { reg: {}, mun: {}, zona: {}, bairro: {}, local: {} }, nomeU = { reg: {}, mun: {}, zona: {}, bairro: {}, local: {} };
    var rows = base.map(function (r) {
      var c = cache[r[0] + '|' + r[1] + '|' + r[2]], pfa = PF[r[0] + '|' + r[1] + '|' + r[2]] || [0, 0], pf = [pfa[0], pfa[1]], pfx = pfa.length > 2 ? pfa.slice(2) : null, c1 = (window.GOVERNO_1T_SECOES || {})[r[0] + '|' + r[1] + '|' + r[2]] || null;
      var info = locais[r[0] + '|' + r[1] + '|' + r[3]], bairro = info && info[1] && info[1].trim() ? info[1].trim() : SEM_BAIRRO;
      var ks = { reg: regional[r[0]] || 'Outras', mun: r[0], zona: r[0] + '|' + r[1], bairro: r[0] + '|' + bairro, local: r[0] + '|' + r[1] + '|' + r[3], sec: r[0] + '|' + r[1] + '|' + r[2] };
      var mn = capN(T && T.municipios && T.municipios[r[0]] || r[0]);
      var nm = { reg: 'Regional ' + ks.reg, mun: mn, zona: 'Zona ' + p4(r[1]) + ' · ' + mn, bairro: capN(bairro) + ' · ' + mn, local: capN(info && info[0] || 'Local ' + r[3]) + ' · ' + mn };
      Object.keys(cont).forEach(function (nv) { var u = cont[nv][ks[nv]] || (cont[nv][ks[nv]] = { n: 0, ok: 0 }); u.n++; if (c) u.ok++; nomeU[nv][ks[nv]] = nm[nv]; });
      meta[r[0] + '|' + r[1] + '|' + r[2]] = { ks: ks, nm: nm, mn: mn, zona: r[1], sec: r[2] };
      if (!c) return [r[0], r[1], r[2], r[3], r[4], 0, 0, 0, 0, 0, 0, 0, 0, 0, pf[0], pf[1], pfx, c1];
      nCarr++;
      var v = c.v, nom = 0, mx = 0;
      cands.forEach(function (n) { var q = v[n] || 0; nom += q; if (q > mx) mx = q; estado.v[n] = (estado.v[n] || 0) + q; });
      estado.b += c.b; estado.n += c.n;
      var meu = v[CFG.foco] || 0, riv = v[CFG.rival] || 0, tot = nom + c.b + c.n;
      Object.keys(ks).forEach(function (nv) { var u = un[nv][ks[nv]] || (un[nv][ks[nv]] = {}); cands.forEach(function (n) { u[n] = (u[n] || 0) + (v[n] || 0); }); });
      return [r[0], r[1], r[2], r[3], c.apt || r[4], c.comp || tot, meu, tot, c.b, c.n, 0, meu > 0 && meu === mx ? 1 : 0, 1, riv, pf[0], pf[1], pfx, c1];   // comparecimento real do boletim; total apurado = só os dois candidatos + brancos + nulos
    });
    // unidades que acabaram de concluir a apuração (regional, município, zona, bairro, local de votação): alimentam o aviso do painel
    var feed = (D.vivo && D.vivo.concluidas) || [], agora = new Date().toLocaleTimeString('pt-BR'), feitos = {};
    Object.keys(cont).forEach(function (nv) {
      Object.keys(cont[nv]).forEach(function (k) {
        var u = cont[nv][k]; if (!(u.n > 0 && u.ok === u.n)) return;
        var id = nv + '|' + k; feitos[id] = 1;
        if (concluidas && !concluidas[id]) feed.unshift({ nivel: NIVEL_ROT[nv], nome: nomeU[nv][k], hora: agora });
      });
    });
    concluidas = feitos;
    // placar: quem lidera em quantos municípios e seções, e o andamento geral
    var placar = { munM: 0, munA: 0, secM: 0, secA: 0, nMun: Object.keys(cont.mun).length, munCom: 0, ok: nCarr, total: base.length };
    Object.keys(cont.mun).forEach(function (k) {
      var c = cont.mun[k], u = un.mun[k]; if (c.ok > 0) placar.munCom++;
      if (!u) return; var m = u[CFG.foco] || 0, a = u[CFG.rival] || 0;
      if (m > a) placar.munM++; else if (a > m) placar.munA++;
    });
    placar.restAptos = 0;
    rows.forEach(function (r) {
      if (r[12]) { if (r[6] > r[13]) placar.secM++; else if (r[13] > r[6]) placar.secA++; }
      else if (r[16] && r[16][0]) placar.restAptos += r[16][0];   // eleitores aptos das seções ainda não apuradas
    });
    var rk = {};
    Object.keys(un).forEach(function (nv) {
      rk[nv] = {};
      Object.keys(un[nv]).forEach(function (k) {
        var u = un[nv][k], meu = u[CFG.foco] || 0, com = cands.filter(function (n) { return u[n] > 0; });
        rk[nv][k] = [meu ? 1 + com.filter(function (n) { return u[n] > meu; }).length : 0, com.length];
      });
    });
    var validos = cands.reduce(function (s, n) { return s + (estado.v[n] || 0); }, 0), q = estado.v[CFG.foco] || 0;
    var ranking = cands.map(function (n) { return { num: n, nome: nomes[n] || String(n), votos: estado.v[n] || 0 }; }).sort(function (a, b) { return b.votos - a.votos; });
    var pos = 1 + ranking.filter(function (x) { return x.votos > q; }).length;
    var completo = nCarr >= base.length, ganhou = completo && validos > 0 && q / validos > 0.5;
    D.secoes = rows;
    D.estado = { q: q, apurado: validos + estado.b + estado.n, brancos: estado.b, nulos: estado.n, validos: validos, pos: nCarr ? pos : 0, nCand: cands.length, partidoNominais: 0, partidoLegenda: 0 };
    D.rk = rk; D.candidatos = ranking; D.aoVivo = true; D.rival = CFG.rival; D.vivo = { concluidas: feed.slice(0, 40), atualizado: agora, placar: placar, historico: constroiHistorico(meta, cont) };
    D.cand = Object.assign({}, D0.cand, { eleito: ganhou, tag: !nCarr ? 'Aguardando' : (completo ? (ganhou ? 'Eleita' : (pos === 1 ? 'À frente' : 'Apurado')) : 'Apurando') });
    if (CFG.turno === 1) D.cand.tag = 'Simulação';
    estadoBusca.carregadas = nCarr;
  }
  function restaura() {
    D.secoes = base; D.estado = D0.estado; D.cand = D0.cand; D.candidatos = D0.candidatos; D.rk = {};
  }

  /* ---------- status na tela ---------- */
  function status() {
    var el = document.getElementById('etDetStatus'); if (!el) return;
    var s = estadoBusca, pct = base.length ? s.carregadas / base.length * 100 : 0;
    var sim = CFG.turno === 1 ? '<span class="et-selo et-sim">SIMULAÇÃO</span> dados do 1º turno · ' : '';
    el.innerHTML = sim + (s.carregadas
      ? '<span class="et-selo ' + (s.carregadas >= base.length ? 'et-fim' : 'et-vivo') + '">' + (s.carregadas >= base.length ? 'Completo' : 'Ao vivo') + '</span> ' +
        'Boletins de urna lidos: <b>' + s.carregadas.toLocaleString('pt-BR') + '</b> de ' + base.length.toLocaleString('pt-BR') + ' seções (' + pct.toFixed(1).replace('.', ',') + '%)' +
        (s.rodando && s.recebidas > s.carregadas ? ' · baixando mais…' : '') + (s.ultima ? ' · consultado às ' + s.ultima : '') + (s.falhas ? ' · ' + s.falhas + ' seção(ões) com falha, tentando de novo' : '')
      : (s.erro ? '<span class="et-erro-txt">' + s.erro + '</span>' : 'Aguardando os primeiros boletins de urna do TSE' + (s.ultima ? ' · consultado às ' + s.ultima : '') + '. Esta parte se preenche sozinha.'));
  }

  /* ---------- ciclo ---------- */
  var rodando = false, ultimaMontagem = 0, pendente = false;
  // abas pesadas (Bairro, Local, Seção: milhares de pontos) são redesenhadas no máximo a cada 10 s; as demais a cada 2,5 s
  function minimoEntre() {
    var b = document.querySelector('#resultadosGoverno2T [data-t26][aria-selected="true"]');
    return b && ['bairro', 'local', 'sec'].indexOf(b.getAttribute('data-t26')) >= 0 ? 10000 : 2500;
  }
  function redesenha(forca) {
    var agora = Date.now();
    if (versaoMontada === versaoCache && !pendente && forca !== 'sempre') { status(); return; }
    if (!forca && agora - ultimaMontagem < minimoEntre()) { pendente = true; return; }
    ultimaMontagem = agora; pendente = false; versaoMontada = versaoCache; monta();
    if (painel()) painel().atualizar();
    status();
  }
  var versaoCache = 0, versaoMontada = -1;   // só remonta e redesenha o painel quando chegou boletim novo
  var geracao = 0;   // muda ao alternar o modo simulação: descarta o que ainda estiver chegando do outro pleito
  function ciclo() {
    if (rodando) return Promise.resolve();
    var gen = geracao;
    rodando = true; estadoBusca.rodando = true; estadoBusca.falhas = 0;
    return listaRecebidas().then(function (lista) {
      estadoBusca.ultima = new Date().toLocaleTimeString('pt-BR'); estadoBusca.erro = ''; estadoBusca.recebidas = lista.length;
      var fila = lista.filter(function (s) { return !cache[s.k] || cache[s.k].c !== s.carimbo; });
      var feitos = 0, i = 0, ws = [], k;
      function trabalha() {   // pool: cada "worker" pega a próxima seção da fila
        if (i >= fila.length || gen !== geracao) return Promise.resolve();
        var s = fila[i++];
        return buscaSecao(s).then(function (r) {
          if (gen !== geracao) return;
          if (r) { cache[s.k] = { c: s.carimbo, apt: r.apt, comp: r.comp, v: r.v, b: r.b, n: r.n }; versaoCache++; } else estadoBusca.falhas++;
        }).catch(function () { estadoBusca.falhas++; }).then(function () {
          feitos++;
          if (feitos % CFG.lote === 0) { salva(); redesenha(false); }
          return trabalha();
        });
      }
      for (k = 0; k < CFG.paralelo; k++) ws.push(trabalha());
      return Promise.all(ws);
    }).catch(function (e) { estadoBusca.erro = 'Não foi possível consultar os boletins do TSE agora (' + e.message + '). Tentando de novo.'; })
      .then(function () { if (gen !== geracao) return; salva(); rodando = false; estadoBusca.rodando = false; redesenha(false); window.dispatchEvent(new CustomEvent('et-atualizado', { detail: Date.now() })); });
  }

  var timer = null, iniciou = false, autoOn = true;
  function agendaCiclo() {
    clearInterval(timer); timer = null;
    if (autoOn) timer = setInterval(function () { if (!document.hidden) ciclo(); }, CFG.intervalo);
  }
  // o resumo (js/eleicoes-2turno.js) detecta totalização nova no TSE e avisa por este evento: busca as urnas novas na hora
  window.addEventListener('et-novidade', function () { if (autoOn && iniciou) ciclo(); });
  window.addEventListener('et-intervalo', function (e) {
    var d = e.detail || {}; if (d.ms) CFG.intervalo = d.ms; autoOn = d.auto !== false; agendaCiclo();
  });
  function inicia() {
    if (iniciou) return; iniciou = true;
    if (Object.keys(cache).length) redesenha(true); else { restaura(); status(); }
    ciclo();
    agendaCiclo();
    setInterval(function () { if (pendente && Date.now() - ultimaMontagem >= minimoEntre()) redesenha(true); }, 1500);
  }
  /* Modo simulação: mostra, nesta parte do 2º turno, os boletins do 1º turno (pleito 3220) só para ver como a tela fica. */
  function simulacao(on) {
    on = !!on;
    if ((CFG.turno === 1) === on) return;
    geracao++; rodando = false; versaoCache++;
    CFG.pleito = on ? '3220' : '3221'; CFG.turno = on ? 1 : 2; LS = 'et2t-bu-' + CFG.pleito + '-v1';
    try { cache = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { cache = {}; }
    concluidas = null; estadoBusca.carregadas = 0; estadoBusca.recebidas = 0; estadoBusca.falhas = 0; estadoBusca.erro = '';
    restaura();
    if (Object.keys(cache).length) redesenha(true); else { if (painel()) painel().atualizar(); status(); }
    if (iniciou) ciclo();
  }
  window.addEventListener('et-simulacao', function (e) { simulacao(e.detail); });
  window.addEventListener('aba-eleicoes', function (e) { if (e.detail === 'eleicoes') { inicia(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && iniciou) ciclo(); });
  if (document.querySelector('.aba-conteudo.ativa[data-aba="eleicoes"]')) inicia();
  window.EleicoesDetalheAoVivo = { simulacao: simulacao, ciclo: ciclo, status: estadoBusca, cache: function () { return cache; } };
})();
