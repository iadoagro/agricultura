/* Exportação dos resultados (aba "Exportar" de js/eleicao-painel.js): slide para exibir na tela ou baixar (.pptx)
   e relatórios em PDF (visualizar / baixar). Recebe os números já reunidos pelo painel (coletar) e não depende da
   aba aberta. As bibliotecas (jsPDF e PptxGenJS) só são baixadas quando alguém clica — o resto da página não paga por elas.
   O slide é desenhado uma vez só, em "cenas" (retângulos e textos em pixels de uma tela 1280×720); a mesma cena vira HTML
   para exibir e vira shapes do PowerPoint para baixar, então os dois ficam iguais.
   Todo percentual é sobre o total de votos do próprio candidato (nunca contra outros candidatos). */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utilidades */
  var LIBS = {
    jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
    pptx: ['https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js', 'https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js']
  };
  function carregar(nome, global) {
    if (window[global]) return Promise.resolve(window[global]);
    var urls = LIBS[nome], i = 0;
    return new Promise(function (ok, falha) {
      (function tenta() {
        if (i >= urls.length) { falha(new Error('não foi possível carregar a biblioteca de ' + (nome === 'pptx' ? 'slides' : 'PDF') + ' (verifique a internet)')); return; }
        var s = document.createElement('script'); s.src = urls[i++];
        s.onload = function () { if (window[global]) ok(window[global]); else tenta(); };
        s.onerror = function () { s.remove(); tenta(); };
        document.head.appendChild(s);
      })();
    });
  }
  function fmt(n) { return Number(n).toLocaleString('pt-BR'); }
  function pc(v, t) { if (!t) return '–'; var x = v / t * 100; return x.toFixed(x > 0 && x < 0.1 ? 2 : 1).replace('.', ',') + '%'; }
  function sgn(n) { return (n > 0 ? '+' : '') + fmt(n); }
  function vv(a, b) { return b ? ((a - b) / b * 100).toFixed(1).replace('.', ',').replace(/^(\d)/, '+$1') + '%' : (a ? 'novo' : '–'); }
  function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function baixarBlob(blob, nome) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function nomeArq(d, tipoDoc, ext) {
    var ano = d.tipo === 'cmp' ? '2022-2026' : (d.tipo === '2022' ? '2022' : String(d.ano));
    return slug(d.cand.nome) + '-' + tipoDoc + '-' + ano + '.' + ext;
  }
  function dataHoje() { return new Date().toLocaleDateString('pt-BR'); }
  // Quem está logado (mesmo texto do menu lateral): o login sem o domínio interno.
  function pessoaLogada() {
    try {
      var a = window.ADMIN_AUTH, s = a && a.sessaoAtual && a.sessaoAtual(), e = s && s.user && s.user.email, dom = '@sistema.local';
      if (e) return e.toLowerCase().slice(-dom.length) === dom ? e.slice(0, -dom.length) : e;
    } catch (x) { /* sem sessão: cai no texto padrão */ }
    return 'usuário não identificado';
  }
  // Carimbo de todo slide e PDF (discreto, em letra pequena): sistema, quem exportou e quando (dia, hora e minuto do clique).
  function carimbo() {
    var n = new Date(), h = n.getHours(), m = n.getMinutes();
    return 'Gerado no sistema iadoagro · exportado por ' + pessoaLogada() + ' em ' + n.toLocaleDateString('pt-BR') + ', às ' + h + (h === 1 ? ' hora' : ' horas') + ' e ' + m + (m === 1 ? ' minuto' : ' minutos') + '.';
  }

  /* dados de apoio */
  function niv(d, l) { return d.L[l]; }
  function chaveV(d) { return d.tipo === '2022' ? 'v22' : 'v26'; }
  function totalV(d) { return d.tipo === '2022' ? d.T22 : d.T26; }
  function topo(d, l, n, k) { k = k || chaveV(d); return niv(d, l).filter(function (u) { return u[k] > 0; }).sort(function (a, b) { return b[k] - a[k]; }).slice(0, n); }
  function cobAno(d) { return d.tipo === '2022' ? d.cob22 : d.cob26; }
  function vg(n) { return n === 1 ? '1 vaga' : n + ' vagas'; }
  function ehVereador(d) { return !!d.cand.municipio; }
  function tituloAno(d) { return d.tipo === 'cmp' ? '2022 × 2026' : (d.tipo === '2022' ? '2022' : String(d.ano)); }
  function nomeExib(d) { return d.tipo === '2022' && d.cand.nome2022 ? d.cand.nome2022 + ' (' + d.cand.nome + ')' : d.cand.nome; }
  function ganhos(d, l, n) { return niv(d, l).filter(function (u) { return u.dif > 0; }).sort(function (a, b) { return b.dif - a.dif; }).slice(0, n); }
  function perdas(d, l, n) { return niv(d, l).filter(function (u) { return u.dif < 0; }).sort(function (a, b) { return a.dif - b.dif; }).slice(0, n); }
  // rótulo com o contexto que desambigua: bairro com o município, seção com a zona
  function rotCtx(u, l) {
    if (l === 'bairro' && u.ctx) return u.rot + ' · ' + u.ctx;
    if (l === 'sec') { var z = /zona \d+/i.exec(u.ctx || ''); return z ? u.rot + ' · ' + z[0] : u.rot; }
    return u.rot;
  }
  var NIVEL_ROT = { reg: 'regionais', mun: 'municípios', zona: 'zonas', bairro: 'bairros', local: 'locais de votação', sec: 'seções' };
  function nivelPrincipal(d) { return ehVereador(d) ? 'zona' : 'reg'; }
  function nomeNivel(l, plural) {
    var s = { reg: ['regional', 'regionais'], mun: ['município', 'municípios'], zona: ['zona', 'zonas'], bairro: ['bairro', 'bairros'], local: ['local de votação', 'locais de votação'], sec: ['seção', 'seções'] }[l];
    return s[plural ? 1 : 0];
  }

  /* ---------------------------------------------------------------- narrativa */
  function narrativa(d) {
    var c = d.cand, P = [], ano = d.tipo === '2022' ? 2022 : d.ano, k = chaveV(d), T = totalV(d), cob = cobAno(d), vere = ehVereador(d);
    var regTop = topo(d, 'reg', 1, k)[0], munTop = topo(d, 'mun', 1, k)[0], bairroTop = topo(d, 'bairro', 1, k)[0], zonaTop = topo(d, 'zona', 1, k)[0];
    var localTop = topo(d, 'local', 1, k)[0], secTop = topo(d, 'sec', 1, k)[0];
    if (d.tipo === 'cmp') {
      var dif = d.T26 - d.T22, regs = niv(d, 'reg'), muns = niv(d, 'mun');
      var cres = muns.filter(function (u) { return u.dif > 0; }).length, caiu = muns.filter(function (u) { return u.dif < 0; }).length;
      var rc = regs.filter(function (u) { return u.dif > 0; }).length;
      P.push(nomeExib(d) + ' passou de ' + fmt(d.T22) + ' votos em 2022 para ' + fmt(d.T26) + ' em 2026: ' + (dif >= 0 ? 'crescimento' : 'queda') + ' de ' + fmt(Math.abs(dif)) + ' votos (' + vv(d.T26, d.T22) + ').' +
        (d.pos ? ' Em 2026 ficou na ' + d.pos + 'ª posição entre ' + fmt(d.nCand) + ' candidatos a ' + c.cargo + ' (' + vg(d.cand.vagas) + ').' : ''));
      var gMun = ganhos(d, 'mun', 1)[0], pMun = perdas(d, 'mun', 1)[0], gReg = regs.slice().sort(function (a, b) { return b.dif - a.dif; })[0];
      P.push('Dos ' + muns.length + ' municípios, ' + cres + ' cresceram e ' + caiu + ' perderam votos; ' + (rc === regs.length ? 'todas as ' + regs.length + ' regionais cresceram' : rc + ' de ' + regs.length + ' regionais cresceram') +
        (gReg ? ', com o maior ganho em volume na ' + gReg.rot + ' (' + sgn(gReg.dif) + ', ' + vv(gReg.v26, gReg.v22) + ')' : '') + '.');
      if (gMun) P.push('O maior ganho absoluto foi em ' + gMun.rot + ' (' + sgn(gMun.dif) + ' votos, ' + vv(gMun.v26, gMun.v22) + '; participação no total dele de ' + pc(gMun.v22, d.T22) + ' para ' + pc(gMun.v26, d.T26) + ')' +
        (pMun ? ' e a maior queda em ' + pMun.rot + ' (' + sgn(pMun.dif) + ' votos).' : '; nenhum município perdeu votos.'));
      var s22 = d.cob22.sec.n, s26 = d.cob26.sec.n;
      P.push('Em 2026 teve votos em ' + fmt(s26) + ' seções (' + pc(s26, d.cob26.sec.t) + ') contra ' + fmt(s22) + ' em 2022 (' + pc(s22, d.cob22.sec.t) + '): ' + fmt(d.secGanhas) + ' seções passaram a ter voto e ' + fmt(d.secPerdidas) + ' deixaram de ter.');
      var bc = niv(d, 'bairro'), lc = niv(d, 'local');
      P.push('Entre os bairros, ' + bc.filter(function (u) { return u.dif > 0; }).length + ' cresceram e ' + bc.filter(function (u) { return u.dif < 0; }).length + ' caíram; entre os locais de votação, ' +
        lc.filter(function (u) { return u.dif > 0; }).length + ' cresceram e ' + lc.filter(function (u) { return u.dif < 0; }).length + ' caíram.');
      return P;
    }
    var quem = nomeExib(d);
    if (vere) {
      P.push(quem + ' (' + c.partido + ' ' + c.numero + ') ' + (c.eleito ? 'foi eleito' : 'concorreu a') + ' ' + (c.eleito ? c.cargo.toLowerCase() + ' de ' + c.municipio : c.cargo.toLowerCase() + ' de ' + c.municipio) + ' em ' + ano + ' com ' + fmt(T) + ' votos' +
        (d.pos ? ', ' + (d.pos + 'º') + ' mais votado entre ' + fmt(d.nCand) + ' candidatos para ' + vg(c.vagas) + '.' : '.'));
    } else if (d.tipo === '2022') {
      P.push('Em 2022, ' + quem + ' obteve ' + fmt(T) + ' votos para ' + c.cargo + ', distribuídos por ' + cob.mun.n + ' dos ' + cob.mun.t + ' municípios do Acre.');
    } else {
      P.push(quem + ' (' + c.partido + ' ' + c.numero + ') obteve ' + fmt(T) + ' votos para ' + c.cargo + ' na eleição de ' + ano + ' (1º turno), ficando em ' + d.pos + 'º lugar entre ' + fmt(d.nCand) + ' candidatos para ' + vg(c.vagas) + '.');
    }
    P.push('Teve votos em ' + (vere ? cob.zona.n + ' de ' + cob.zona.t + ' zonas, ' : cob.mun.n + ' de ' + cob.mun.t + ' municípios (' + pc(cob.mun.n, cob.mun.t) + '), ') + fmt(cob.bairro.n) + ' de ' + fmt(cob.bairro.t) + ' bairros, ' +
      fmt(cob.local.n) + ' de ' + fmt(cob.local.t) + ' locais de votação e ' + fmt(cob.sec.n) + ' de ' + fmt(cob.sec.t) + ' seções (' + pc(cob.sec.n, cob.sec.t) + ').');
    if (vere) {
      P.push('A zona ' + (zonaTop ? zonaTop.rot.replace(/^Zona /, '') : '') + ' concentrou ' + (zonaTop ? pc(zonaTop[k], T) : '') + ' dos votos. O bairro mais votado foi ' + (bairroTop ? bairroTop.rot + ' (' + fmt(bairroTop[k]) + ' votos, ' + pc(bairroTop[k], T) + ')' : '–') +
        ' e o melhor local de votação, ' + (localTop ? localTop.rot + ' (' + fmt(localTop[k]) + ' votos)' : '–') + '.');
    } else {
      var top3 = topo(d, 'mun', 3, k).reduce(function (s, u) { return s + u[k]; }, 0);
      P.push('A regional ' + (regTop ? regTop.rot.replace(/^Regional /, '') : '') + ' reuniu ' + (regTop ? pc(regTop[k], T) : '') + ' dos votos dele (' + (regTop ? fmt(regTop[k]) : '') + '); ' + (munTop ? munTop.rot + ' sozinho respondeu por ' + pc(munTop[k], T) + ' (' + fmt(munTop[k]) + ')' : '') +
        ' e os três maiores municípios somam ' + pc(top3, T) + '.');
    }
    if (secTop) P.push('A melhor seção foi a ' + secTop.rot.replace(/^Seção /, '') + ' (' + secTop.ctx.split(' · ').slice(0, 2).join(' - ') + ') com ' + fmt(secTop[k]) + ' votos' +
      (d.tipo !== '2022' && d.liderSecoes ? '; ele foi o candidato mais votado em ' + fmt(d.liderSecoes) + ' seções (' + pc(d.liderSecoes, cob.sec.t) + ').' : '.'));
    return P;
  }

  /* ----------------------------------------------------------- cenas dos slides */
  var W = 1280, H = 720;
  var AZ = '#153E75', AZ2 = '#2563EB', LAR = '#ED7D31', CZ = '#667085', VERDE = '#1A7F3C', VERM = '#B42318', CLARO = '#F4F7FB', BORDA = '#CFD8E3', TXT = '#212121';
  function R(x, y, w, h, fill, o) { o = o || {}; return { k: 'r', x: x, y: y, w: w, h: h, fill: fill, raio: o.raio || 0, borda: o.borda || null }; }
  function T(x, y, w, h, txt, o) { o = o || {}; return { k: 't', x: x, y: y, w: w, h: h, txt: txt, paras: o.paras || null, size: o.size || 22, bold: !!o.bold, cor: o.cor || TXT, al: o.al || 'left', va: o.va || 'middle', bullet: !!o.bullet }; }
  function cortaRot(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function sKpis(titulo, sub, itens) {
    var p = [];
    itens.slice(0, 6).forEach(function (it, i) {
      var x = 60 + (i % 3) * 392, y = 160 + Math.floor(i / 3) * 250, comp = it.val.length;
      p.push(R(x, y, 376, 230, CLARO, { raio: 14, borda: BORDA }));
      p.push(T(x + 22, y + 16, 332, 36, it.rot, { size: 20, cor: CZ }));
      p.push(T(x + 22, y + 58, 332, 90, it.val, { size: comp > 20 ? 30 : (comp > 12 ? 40 : 58), bold: true, cor: AZ }));
      p.push(T(x + 22, y + 152, 332, 66, it.sub || '', { size: 18, cor: CZ, va: 'top' }));
    });
    return { titulo: titulo, sub: sub, prim: p };
  }
  function sTexto(titulo, sub, paras) {
    return { titulo: titulo, sub: sub, prim: [T(60, 150, 1160, 500, '', { paras: paras, size: 26, va: 'top', bullet: true })] };
  }
  function sBarras(titulo, sub, itens, cor) {
    var p = [], n = Math.min(itens.length, 10), h = Math.min(52, 510 / Math.max(n, 1)), mx = Math.max.apply(null, itens.map(function (i) { return i.v; }).concat([1]));
    itens.slice(0, n).forEach(function (it, i) {
      var y = 150 + i * h, bw = Math.max(4, Math.round(it.v / mx * 470)), rot = cortaRot(it.rot, 46);
      p.push(T(60, y, 440, h - 6, rot, { size: rot.length > 30 ? 17 : 21, bold: true, cor: AZ }));
      p.push(R(510, y + (h - 6 - 26) / 2, bw, 26, cor || AZ2, { raio: 6 }));
      p.push(T(510 + bw + 12, y, W - 40 - (510 + bw + 12), h - 6, it.txt, { size: 20 }));
    });
    return { titulo: titulo, sub: sub, prim: p };
  }
  function sPares(titulo, sub, itens, l1, l2) {
    var p = [], n = Math.min(itens.length, 12), h = Math.min(50, 520 / Math.max(n, 1)), mx = Math.max.apply(null, itens.map(function (i) { return Math.max(i.v22, i.v26); }).concat([1]));
    p.push(R(850, 104, 16, 16, LAR, { raio: 3 })); p.push(T(872, 98, 120, 28, l1 || '2022', { size: 16, cor: CZ }));
    p.push(R(990, 104, 16, 16, AZ, { raio: 3 })); p.push(T(1012, 98, 120, 28, l2 || '2026', { size: 16, cor: CZ }));
    itens.slice(0, n).forEach(function (it, i) {
      var y = 140 + i * h, bh = Math.max(8, (h - 8) / 2), b1 = Math.max(3, Math.round(it.v22 / mx * 460)), b2 = Math.max(3, Math.round(it.v26 / mx * 460)), rot = cortaRot(it.rot, 40);
      p.push(T(60, y, 410, h - 4, rot, { size: rot.length > 28 ? 16 : 19, bold: true, cor: AZ }));
      p.push(R(480, y + 2, b1, bh, LAR, { raio: 4 })); p.push(T(480 + b1 + 8, y - 3, 300, bh + 6, it.t22, { size: 14, cor: CZ }));
      p.push(R(480, y + 2 + bh + 2, b2, bh, AZ, { raio: 4 })); p.push(T(480 + b2 + 8, y + bh - 1, 300, bh + 6, it.t26, { size: 14, cor: '#212121' }));
    });
    return { titulo: titulo, sub: sub, prim: p };
  }
  function sDuas(titulo, sub, esq, dir) {
    var p = [];
    [esq, dir].forEach(function (col, ci) {
      var x0 = 60 + ci * 600, itens = col.itens.slice(0, 8), h = 56, mx = Math.max.apply(null, itens.map(function (i) { return Math.abs(i.v); }).concat([1]));
      p.push(T(x0, 140, 540, 36, col.titulo, { size: 24, bold: true, cor: col.cor }));
      if (!itens.length) p.push(T(x0, 190, 540, 40, 'Nenhum caso.', { size: 20, cor: CZ }));
      itens.forEach(function (it, i) {
        var y = 190 + i * h, bw = Math.max(4, Math.round(Math.abs(it.v) / mx * 100)), rot = cortaRot(it.rot, 36);
        p.push(T(x0, y, 300, h - 6, rot, { size: rot.length > 24 ? 15 : 19, bold: true, cor: AZ }));
        p.push(R(x0 + 310, y + (h - 6 - 22) / 2, bw, 22, col.cor, { raio: 5 }));
        p.push(T(x0 + 310 + bw + 8, y, 560 - (310 + bw + 8), h - 6, it.txt, { size: 16 }));
      });
    });
    return { titulo: titulo, sub: sub, prim: p };
  }
  function sCapa(d, linha3) {
    var c = d.cand, p = [];
    p.push(R(0, 0, W, H, AZ)); p.push(R(0, 0, 18, H, AZ2));
    p.push(T(90, 150, 1100, 40, c.cargo + ' · Eleição ' + (d.tipo === 'cmp' ? '2022 × 2026' : (d.tipo === '2022' ? '2022' : d.ano)) + (c.municipio ? ' · ' + c.municipio : ''), { size: 28, cor: '#BFD4F2' }));
    var nome = d.tipo === 'cmp' ? d.cand.nome : nomeExib(d);
    p.push(T(90, 205, 1100, 120, nome.toUpperCase(), { size: nome.length > 22 ? 62 : 90, bold: true, cor: '#FFFFFF' }));
    p.push(T(90, 335, 1100, 50, 'nº ' + c.numero + ' · ' + c.partido, { size: 34, cor: '#FFFFFF' }));
    if (c.eleito && d.tipo !== '2022') { p.push(R(90, 410, 190, 52, VERDE, { raio: 26 })); p.push(T(90, 410, 190, 52, 'ELEITO', { size: 26, bold: true, cor: '#FFFFFF', al: 'center' })); }
    p.push(T(90, 500, 1100, 50, linha3, { size: 32, cor: '#FFFFFF' }));
    p.push(T(90, 630, 1100, 28, 'Fonte: ' + d.fonte, { size: 15, cor: '#BFD4F2' }));
    p.push(T(90, 666, 1100, 24, d.carimbo, { size: 12, cor: '#8FA9D0' }));
    return { capa: true, bg: AZ, prim: p };
  }
  function sFim(d) {
    var p = [R(0, 0, W, H, AZ), R(0, 0, 18, H, AZ2)];
    p.push(T(90, 250, 1100, 100, 'Obrigado', { size: 84, bold: true, cor: '#FFFFFF' }));
    p.push(T(90, 370, 1100, 40, nomeExib(d) + ' · nº ' + d.cand.numero + ' · ' + d.cand.partido, { size: 30, cor: '#BFD4F2' }));
    p.push(T(90, 540, 1100, 80, 'Fonte: ' + d.fonte + '. Percentuais calculados sobre o total de votos do próprio candidato.', { size: 18, cor: '#BFD4F2', va: 'top' }));
    p.push(T(90, 652, 1100, 30, d.carimbo, { size: 12, cor: '#8FA9D0', va: 'top' }));
    return { capa: true, bg: AZ, prim: p };
  }

  function slidesResultado(d) {
    var k = chaveV(d), T0 = totalV(d), cob = cobAno(d), vere = ehVereador(d), ano = tituloAno(d), c = d.cand, S = [];
    var onde = d.onde, nv = nivelPrincipal(d);
    S.push(sCapa(d, 'Resultado da votação'));
    var kp = [{ rot: 'Votos ' + onde, val: fmt(T0), sub: '100,0% dos votos dele' + (c.eleito && d.tipo !== '2022' ? ' · eleito' : '') }];
    if (d.tipo !== '2022' && d.pos) kp.push({ rot: 'Posição ' + onde, val: d.pos + 'º', sub: 'de ' + fmt(d.nCand) + ' candidatos · ' + vg(c.vagas) + '' });
    else { var secs = niv(d, 'sec').filter(function (u) { return u[k] > 0; }); kp.push({ rot: 'Média por seção com voto', val: fmt(secs.length ? Math.round(T0 / secs.length) : 0), sub: pc(secs.length ? Math.round(T0 / secs.length) : 0, T0) + ' do total dele' }); }
    kp.push(vere ? { rot: 'Zonas com voto', val: cob.zona.n + ' de ' + cob.zona.t, sub: pc(cob.zona.n, cob.zona.t) + ' das zonas' } : { rot: 'Municípios com voto', val: cob.mun.n + ' de ' + cob.mun.t, sub: pc(cob.mun.n, cob.mun.t) + ' dos municípios' });
    kp.push({ rot: 'Bairros com voto', val: fmt(cob.bairro.n), sub: 'de ' + fmt(cob.bairro.t) + ' · ' + pc(cob.bairro.n, cob.bairro.t) });
    kp.push({ rot: 'Locais de votação com voto', val: fmt(cob.local.n), sub: 'de ' + fmt(cob.local.t) + ' · ' + pc(cob.local.n, cob.local.t) });
    kp.push({ rot: 'Seções com voto', val: fmt(cob.sec.n), sub: 'de ' + fmt(cob.sec.t) + ' · ' + pc(cob.sec.n, cob.sec.t) });
    S.push(sKpis('Números-chave', 'Eleição ' + ano, kp));
    S.push(sTexto('O resultado em resumo', 'Eleição ' + ano, narrativa(d)));
    var itensDe = function (l, n) { return topo(d, l, n, k).map(function (u) { return { rot: rotCtx(u, l), v: u[k], txt: fmt(u[k]) + ' · ' + pc(u[k], T0) }; }); };
    S.push(sBarras('Votos por ' + nomeNivel(nv), 'Percentual sobre o total de votos dele', itensDe(nv, 10)));
    if (!vere) S.push(sBarras('Os 10 maiores municípios', 'Percentual sobre o total de votos dele', itensDe('mun', 10)));
    S.push(sBarras('Os 10 maiores bairros', 'Percentual sobre o total de votos dele', itensDe('bairro', 10)));
    S.push(sBarras('Os 10 maiores locais de votação', 'Percentual sobre o total de votos dele', itensDe('local', 10)));
    S.push(sBarras('As 10 maiores seções', 'Percentual sobre o total de votos dele', itensDe('sec', 10)));
    var cobIt = [(vere ? ['Zonas', cob.zona] : ['Municípios', cob.mun]), ['Bairros', cob.bairro], ['Locais de votação', cob.local], ['Seções', cob.sec]].map(function (a) { return { rot: a[0], v: a[1].n / Math.max(a[1].t, 1) * 100, txt: fmt(a[1].n) + ' de ' + fmt(a[1].t) + ' · ' + pc(a[1].n, a[1].t) }; });
    S.push(sBarras('Presença no território', 'Unidades em que teve ao menos um voto', cobIt, VERDE));
    S.push(sFim(d));
    return S;
  }
  function slidesComparativo(d) {
    var S = [], dif = d.T26 - d.T22, c = d.cand;
    S.push(sCapa(d, 'Comparativo da votação 2022 × 2026'));
    var s22 = d.cob22.sec, s26 = d.cob26.sec;
    S.push(sKpis('Números-chave', '2022 × 2026', [
      { rot: 'Votos 2022', val: fmt(d.T22), sub: '100,0% dos votos dele em 2022' },
      { rot: 'Votos 2026', val: fmt(d.T26), sub: '100,0% dos votos dele em 2026' },
      { rot: 'Diferença', val: sgn(dif), sub: vv(d.T26, d.T22) + ' sobre 2022' },
      { rot: 'Seções com voto', val: fmt(s22.n) + ' → ' + fmt(s26.n), sub: pc(s22.n, s22.t) + ' → ' + pc(s26.n, s26.t) + ' das seções' },
      { rot: 'Seções ganhas / perdidas', val: fmt(d.secGanhas) + ' / ' + fmt(d.secPerdidas), sub: 'passou a ter voto / deixou de ter' },
      { rot: 'Posição em 2026', val: d.pos + 'º', sub: 'de ' + fmt(d.nCand) + ' candidatos · ' + vg(c.vagas) + '' }]));
    S.push(sTexto('A comparação em resumo', '2022 × 2026', narrativa(d)));
    var par = function (u) { return { rot: u.rot, v22: u.v22, v26: u.v26, t22: fmt(u.v22) + ' · ' + pc(u.v22, d.T22), t26: fmt(u.v26) + ' · ' + pc(u.v26, d.T26) + ' · ' + vv(u.v26, u.v22) }; };
    S.push(sPares('2022 × 2026 por regional', 'Cada barra: votos e % do total dele no ano; ao lado, a variação sobre 2022',
      niv(d, 'reg').slice().sort(function (a, b) { return b.v26 - a.v26; }).map(par)));
    S.push(sPares('2022 × 2026 · os 12 maiores municípios', 'Cada barra: votos e % do total dele no ano',
      niv(d, 'mun').slice().sort(function (a, b) { return Math.max(b.v22, b.v26) - Math.max(a.v22, a.v26); }).slice(0, 12).map(par)));
    var it = function (l) { return function (u) { return { rot: rotCtx(u, l), v: u.dif, txt: sgn(u.dif) + ' · ' + vv(u.v26, u.v22) }; }; };
    [['mun', 'Municípios'], ['bairro', 'Bairros'], ['local', 'Locais de votação']].forEach(function (a) {
      S.push(sDuas(a[1] + ': onde mais ganhou e onde mais perdeu', 'Diferença de votos 2026 menos 2022, e variação sobre 2022',
        { titulo: 'Mais ganharam', cor: VERDE, itens: ganhos(d, a[0], 8).map(it(a[0])) }, { titulo: 'Mais perderam', cor: VERM, itens: perdas(d, a[0], 8).map(it(a[0])) }));
    });
    var par2 = function (rot, a, b) { return { rot: rot, v22: a.n, v26: b.n, t22: fmt(a.n) + ' de ' + fmt(a.t) + ' · ' + pc(a.n, a.t), t26: fmt(b.n) + ' de ' + fmt(b.t) + ' · ' + pc(b.n, b.t) + ' · ' + vv(b.n, a.n) }; };
    S.push(sPares('Presença no território', 'Unidades em que teve ao menos um voto',
      [par2('Municípios', d.cob22.mun, d.cob26.mun), par2('Bairros', d.cob22.bairro, d.cob26.bairro), par2('Locais de votação', d.cob22.local, d.cob26.local), par2('Seções', d.cob22.sec, d.cob26.sec)]));
    S.push(sFim(d));
    return S;
  }
  function slidesDe(d) { return d.tipo === 'cmp' ? slidesComparativo(d) : slidesResultado(d); }
  // moldura (título, linha de apoio, rodapé e numeração) aplicada depois de saber quantos slides são
  function comMoldura(d, S) {
    return S.map(function (s, i) {
      if (s.capa) return s;
      var p = [R(0, 0, W, H, '#FFFFFF'), R(0, 0, W, 10, AZ), T(60, 30, 1160, 62, s.titulo, { size: 38, bold: true, cor: AZ })];
      if (s.sub) p.push(T(60, 90, 760, 28, s.sub, { size: 18, cor: CZ }));
      p.push(R(60, 124, 120, 5, AZ2));
      s.prim.forEach(function (x) { p.push(x); });
      p.push(T(60, 668, 1010, 22, nomeExib(d) + ' · ' + d.fonte, { size: 13, cor: CZ }));
      p.push(T(60, 692, 1010, 20, d.carimbo, { size: 11, cor: '#98A2B3' }));
      p.push(T(1100, 690, 120, 22, (i + 1) + ' / ' + S.length, { size: 14, cor: CZ, al: 'right' }));
      return { bg: '#FFFFFF', prim: p };
    });
  }

  /* -------------------------------------------------- exibir o slide (HTML) */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function escH(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cenaHtml(slide) {
    var div = el('div', 'ex-slide'); div.style.background = slide.bg || '#fff';
    slide.prim.forEach(function (p) {
      var e = el('div', 'ex-p'); e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; e.style.width = p.w + 'px'; e.style.height = p.h + 'px';
      if (p.k === 'r') {
        e.style.background = p.fill; if (p.raio) e.style.borderRadius = p.raio + 'px'; if (p.borda) e.style.border = '1.5px solid ' + p.borda; e.style.boxSizing = 'border-box';
      } else {
        e.className = 'ex-p ex-t'; e.style.fontSize = p.size + 'px'; e.style.color = p.cor; e.style.fontWeight = p.bold ? '700' : '400';
        e.style.justifyContent = p.al === 'center' ? 'center' : (p.al === 'right' ? 'flex-end' : 'flex-start'); e.style.textAlign = p.al;
        e.style.alignItems = p.va === 'top' ? 'flex-start' : (p.va === 'bottom' ? 'flex-end' : 'center');
        if (p.paras) e.innerHTML = '<div>' + p.paras.map(function (t) { return '<p class="ex-par">' + escH(t) + '</p>'; }).join('') + '</div>';
        else e.innerHTML = '<span>' + escH(p.txt) + '</span>';
      }
      div.appendChild(e);
    });
    return div;
  }
  var deckAberto = null;
  function exibirSlides(d, msg) {
    if (deckAberto) deckAberto.fechar();
    d.carimbo = carimbo();
    var S = comMoldura(d, slidesDe(d)), i = 0;
    var raiz = el('div', 'ex-deck'); raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true'); raiz.setAttribute('aria-label', 'Apresentação: ' + nomeExib(d));
    raiz.innerHTML = '<div class="ex-deck-barra"><strong class="ex-deck-tit"></strong><span class="ex-deck-esp"></span>' +
      '<button type="button" class="ex-deck-b" data-a="tela" title="Tela cheia (F)">⛶ Tela cheia</button>' +
      '<button type="button" class="ex-deck-b" data-a="baixar" title="Baixar como PowerPoint">⬇ Baixar (.pptx)</button>' +
      '<button type="button" class="ex-deck-b ex-deck-x" data-a="fechar" title="Fechar (Esc)" aria-label="Fechar">✕</button></div>' +
      '<p class="ex-deck-dica">Dica: gire o celular na horizontal para ver o slide maior.</p><div class="ex-deck-palco"><div class="ex-deck-caixa"><div class="ex-deck-pano"></div></div></div>' +
      '<div class="ex-deck-nav"><button type="button" class="ex-deck-b" data-a="ant" aria-label="Slide anterior">‹</button><span class="ex-deck-cont" aria-live="polite"></span><button type="button" class="ex-deck-b" data-a="prox" aria-label="Próximo slide">›</button></div>';
    raiz.querySelector('.ex-deck-tit').textContent = nomeExib(d) + ' · ' + tituloAno(d);
    var palco = raiz.querySelector('.ex-deck-palco'), caixa = raiz.querySelector('.ex-deck-caixa'), pano = raiz.querySelector('.ex-deck-pano'), cont = raiz.querySelector('.ex-deck-cont');
    S.forEach(function (s) { var c = cenaHtml(s); c.hidden = true; pano.appendChild(c); });
    var cenas = pano.children;
    function ajusta() {
      var esc = Math.min(palco.clientWidth / W, palco.clientHeight / H);
      caixa.style.width = Math.round(W * esc) + 'px'; caixa.style.height = Math.round(H * esc) + 'px';
      pano.style.transform = 'scale(' + esc + ')';
    }
    function ir(n) {
      i = Math.max(0, Math.min(S.length - 1, n));
      for (var j = 0; j < cenas.length; j++) cenas[j].hidden = j !== i;
      cont.textContent = (i + 1) + ' / ' + S.length;
      raiz.querySelector('[data-a=ant]').disabled = i === 0; raiz.querySelector('[data-a=prox]').disabled = i === S.length - 1;
    }
    function tecla(ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ir(i + 1); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp' || ev.key === 'Backspace') { ev.preventDefault(); ir(i - 1); }
      else if (ev.key === 'Home') { ev.preventDefault(); ir(0); }
      else if (ev.key === 'End') { ev.preventDefault(); ir(S.length - 1); }
      else if (ev.key === 'f' || ev.key === 'F') { alternaTela(); }
      else if (ev.key === 'Escape' && !document.fullscreenElement) { fechar(); }
    }
    function alternaTela() {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      var f = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
      if (f) { try { f.call(raiz); } catch (e) { /* sem tela cheia neste navegador */ } }
    }
    function fechar() {
      document.removeEventListener('keydown', tecla); window.removeEventListener('resize', ajusta); document.removeEventListener('fullscreenchange', ajusta);
      if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* já saiu */ } }
      document.documentElement.classList.remove('ex-deck-aberto'); raiz.remove(); deckAberto = null;
    }
    raiz.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-a]');
      if (b) {
        var a = b.dataset.a;
        if (a === 'prox') ir(i + 1); else if (a === 'ant') ir(i - 1); else if (a === 'fechar') fechar(); else if (a === 'tela') alternaTela();
        else if (a === 'baixar') { b.disabled = true; baixarSlides(d, function () { }).then(function () { b.disabled = false; }, function (e) { b.disabled = false; alert('Não foi possível gerar o arquivo: ' + e.message); }); }
        return;
      }
      if (ev.target.closest('.ex-deck-caixa')) ir(i + 1);   // toque/clique no slide avança
    });
    var x0 = null;
    raiz.addEventListener('touchstart', function (ev) { x0 = ev.touches[0].clientX; }, { passive: true });
    raiz.addEventListener('touchend', function (ev) { if (x0 == null) return; var dx = ev.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) ir(i + (dx < 0 ? 1 : -1)); }, { passive: true });
    document.addEventListener('keydown', tecla); window.addEventListener('resize', ajusta); document.addEventListener('fullscreenchange', ajusta);
    document.body.appendChild(raiz); document.documentElement.classList.add('ex-deck-aberto');
    ajusta(); ir(0); raiz.querySelector('[data-a=prox]').focus();
    deckAberto = { fechar: fechar };
    if (msg) msg('');
    return Promise.resolve();
  }

  /* ---------------------------------------------------- baixar o slide (.pptx) */
  function baixarSlides(d, msg) {
    if (msg) msg('Carregando a biblioteca de slides…');
    return carregar('pptx', 'PptxGenJS').then(function (Pptx) {
      if (msg) msg('Montando o arquivo…');
      d.carimbo = carimbo();
      var S = comMoldura(d, slidesDe(d)), pptx = new Pptx(), px = function (n) { return n / 96; }, cor = function (h) { return String(h).replace('#', ''); };
      pptx.layout = 'LAYOUT_WIDE'; pptx.title = nomeExib(d) + ' - ' + tituloAno(d); pptx.author = 'Sistema'; pptx.subject = 'Resultado da votação';
      S.forEach(function (s) {
        var sl = pptx.addSlide(); sl.background = { color: cor(s.bg || '#FFFFFF') };
        s.prim.forEach(function (p) {
          if (p.k === 'r') {
            if (p.x === 0 && p.y === 0 && p.w === W && p.h === H) return;   // o fundo já é a cor do slide
            sl.addShape(p.raio ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { x: px(p.x), y: px(p.y), w: px(p.w), h: px(p.h), fill: { color: cor(p.fill) }, line: p.borda ? { color: cor(p.borda), width: 1 } : { type: 'none' }, rectRadius: p.raio ? Math.min(px(p.raio), px(Math.min(p.w, p.h)) / 2) : 0 });
          } else if (p.paras) {
            sl.addText(p.paras.map(function (t) { return { text: t, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 14 } }; }),
              { x: px(p.x), y: px(p.y), w: px(p.w), h: px(p.h), fontSize: Math.round(p.size * 0.75), color: cor(p.cor), fontFace: 'Calibri', valign: 'top', margin: 0 });
          } else {
            sl.addText(String(p.txt), { x: px(p.x), y: px(p.y), w: px(p.w), h: px(p.h), fontSize: Math.round(p.size * 0.75 * 10) / 10, bold: p.bold, color: cor(p.cor), fontFace: 'Calibri', align: p.al, valign: p.va === 'top' ? 'top' : 'middle', margin: 0, fit: 'shrink' });
          }
        });
      });
      return pptx.write({ outputType: 'blob' });
    }).then(function (blob) {
      baixarBlob(blob, nomeArq(d, 'slides', 'pptx'));
    });
  }

  /* ------------------------------------------------------------------- PDF */
  var C_AZ = [21, 62, 117], C_AZ2 = [37, 99, 235], C_LAR = [237, 125, 49], C_CZ = [102, 112, 133], C_VERDE = [26, 127, 60], C_VERM = [180, 35, 24], C_CLARO = [244, 247, 251], C_LINHA = [207, 216, 227];
  function pdfTxt(s) {   // as fontes padrão do PDF não têm setas nem alguns traços
    return String(s == null ? '' : s).replace(/→/g, ' > ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[▲]/g, '+').replace(/[▼]/g, '-');
  }
  function montaPdf(d, JsPDF) {
    var doc = new JsPDF({ unit: 'mm', format: 'a4' }), PW = 210, PH = 297, M = 15, CW = PW - 2 * M, y = 0;
    var titulo = d.tipo === 'cmp' ? 'Comparativo da votação 2022 × 2026' : 'Relatório da votação ' + tituloAno(d), c = d.cand;
    doc.setProperties({ title: pdfTxt(nomeExib(d) + ' - ' + titulo), subject: 'Resultado da votação', author: 'Sistema' });
    function cor(arr, tipo) { (tipo === 'fill' ? doc.setFillColor : (tipo === 'draw' ? doc.setDrawColor : doc.setTextColor)).apply(doc, arr); }
    function texto(s, x, yy, o) { doc.text(pdfTxt(s), x, yy, o || {}); }
    function fonte(tam, neg, c2) { doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(tam); cor(c2 || [33, 33, 33], 'text'); }
    function novaPagina() {
      doc.addPage(); y = 20;
      cor(C_AZ, 'fill'); doc.rect(0, 0, PW, 9, 'F');
      fonte(8, false, C_CZ); texto(nomeExib(d) + ' - ' + titulo, M, 14);
      cor(C_LINHA, 'draw'); doc.setLineWidth(0.2); doc.line(M, 16, PW - M, 16); y = 24;
    }
    function espaco(h) { if (y + h > PH - 20) novaPagina(); }
    function h2(t) { espaco(34);   // o título nunca fica sozinho no fim da página
      y += 3; fonte(13, true, C_AZ); texto(t, M, y + 4); cor(C_AZ2, 'fill'); doc.rect(M, y + 6.5, 22, 0.9, 'F'); y += 12; }
    function par(t, tam) {
      fonte(tam || 10, false); var ls = doc.splitTextToSize(pdfTxt(t), CW);
      ls.forEach(function (l) { espaco(5.2); doc.text(l, M, y + 3.6); y += 5.2; }); y += 2;
    }
    function lista(itens) {
      itens.forEach(function (t) { fonte(10, false); var ls = doc.splitTextToSize(pdfTxt(t), CW - 6); ls.forEach(function (l, i) { espaco(5.2); if (i === 0) { cor(C_AZ2, 'fill'); doc.circle(M + 1.3, y + 2.4, 0.8, 'F'); fonte(10, false); } doc.text(l, M + 5, y + 3.6); y += 5.2; }); y += 1.2; });
      y += 1;
    }
    function kpis(itens) {
      var w = (CW - 8) / 3, h = 23;
      for (var i = 0; i < itens.length; i += 3) {
        espaco(h + 3);
        itens.slice(i, i + 3).forEach(function (it, j) {
          var x = M + j * (w + 4);
          cor(C_CLARO, 'fill'); cor(C_LINHA, 'draw'); doc.setLineWidth(0.25); doc.roundedRect(x, y, w, h, 2, 2, 'FD');
          fonte(7.5, false, C_CZ); texto(it.rot, x + 3, y + 5.2);
          var tam = it.val.length > 20 ? 10.5 : (it.val.length > 12 ? 13 : 17); fonte(tam, true, C_AZ); texto(it.val, x + 3, y + 13.2);
          fonte(7, false, C_CZ); var sb = doc.splitTextToSize(pdfTxt(it.sub || ''), w - 6); texto(sb.slice(0, 2).join(' '), x + 3, y + 18.5); if (sb[1]) texto(sb[1], x + 3, y + 21.4);
        });
        y += h + 3;
      }
      y += 1;
    }
    function barras(itens, o) {
      o = o || {}; var mx = Math.max.apply(null, itens.map(function (i) { return i.v; }).concat([1])), bx = M + 64, bwmax = CW - 64 - 40;
      itens.forEach(function (it) {
        espaco(6.4); fonte(8.5, true, C_AZ); texto(cortar(it.rot, 62, 8.5, true), M, y + 4.2);
        cor(o.cor || C_AZ2, 'fill'); var bw = Math.max(0.8, it.v / mx * bwmax); doc.roundedRect(bx, y + 0.8, bw, 4.2, 1, 1, 'F');
        fonte(8.5, false); texto(it.txt, bx + bw + 2, y + 4.2); y += 6.4;
      });
      y += 2;
    }
    function pares(itens) {
      var mx = Math.max.apply(null, itens.map(function (i) { return Math.max(i.v22, i.v26); }).concat([1])), bx = M + 50, bwmax = CW - 50 - 56;
      espaco(10); fonte(8, false, C_CZ); cor(C_LAR, 'fill'); doc.rect(M + 50, y, 3, 3, 'F'); texto('2022', M + 54.5, y + 2.6); cor(C_AZ, 'fill'); doc.rect(M + 68, y, 3, 3, 'F'); texto('2026', M + 72.5, y + 2.6); y += 6;
      itens.forEach(function (it) {
        espaco(10.5); fonte(8.5, true, C_AZ); texto(cortar(it.rot, 48, 8.5, true), M, y + 5);
        var b1 = Math.max(0.8, it.v22 / mx * bwmax), b2 = Math.max(0.8, it.v26 / mx * bwmax);
        cor(C_LAR, 'fill'); doc.roundedRect(bx, y + 0.6, b1, 3.6, 0.8, 0.8, 'F'); fonte(7.5, false, C_CZ); texto(it.t22, bx + b1 + 2, y + 3.5);
        cor(C_AZ, 'fill'); doc.roundedRect(bx, y + 4.6, b2, 3.6, 0.8, 0.8, 'F'); fonte(7.5, false); texto(it.t26, bx + b2 + 2, y + 7.5);
        y += 9.6;
      });
      y += 2;
    }
    function cortar(s, larg, tam, neg) {
      doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.setFontSize(tam || 9); s = pdfTxt(s);
      if (doc.getTextWidth(s) <= larg) return s;
      while (s.length > 1 && doc.getTextWidth(s + '...') > larg) s = s.slice(0, -1);
      return s + '...';
    }
    function tabela(cols, linhas, o) {
      o = o || {}; var rh = o.rh || 6.2, tam = o.tam || 8.5, W0 = cols.reduce(function (s, c1) { return s + c1.w; }, 0), esc = CW / W0;
      var xs = []; cols.reduce(function (acc, c1) { xs.push(acc); return acc + c1.w * esc; }, M);
      function cab() {
        cor(C_AZ, 'fill'); doc.rect(M, y, CW, 6.8, 'F'); fonte(8, true, [255, 255, 255]);
        cols.forEach(function (c1, j) { if (c1.al === 'r') texto(c1.t, xs[j] + c1.w * esc - 1.6, y + 4.6, { align: 'right' }); else texto(c1.t, xs[j] + 1.6, y + 4.6); });
        y += 6.8;
      }
      espaco(6.8 + rh * 2); cab();
      linhas.forEach(function (ln, i) {
        if (y + rh > PH - 20) { novaPagina(); cab(); }
        if (i % 2) { cor(C_CLARO, 'fill'); doc.rect(M, y, CW, rh, 'F'); }
        cols.forEach(function (c1, j) {
          var neg = !!c1.neg, s = cortar(ln[j], c1.w * esc - 3.2, tam, neg); fonte(tam, neg, ln.cor && ln.cor[j] ? ln.cor[j] : (c1.cor || [33, 33, 33]));
          if (c1.al === 'r') texto(s, xs[j] + c1.w * esc - 1.6, y + rh - 1.8, { align: 'right' }); else texto(s, xs[j] + 1.6, y + rh - 1.8);
        });
        y += rh;
      });
      cor(C_LINHA, 'draw'); doc.setLineWidth(0.2); doc.line(M, y, PW - M, y); y += 3;
    }
    function corDif(v) { return v > 0 ? C_VERDE : (v < 0 ? C_VERM : [33, 33, 33]); }

    /* capa / cabeçalho */
    cor(C_AZ, 'fill'); doc.rect(0, 0, PW, 46, 'F'); cor(C_AZ2, 'fill'); doc.rect(0, 0, 4, 46, 'F');
    fonte(10, false, [191, 212, 242]); texto(c.cargo + ' - ' + (d.tipo === 'cmp' ? 'Comparativo 2022 × 2026' : 'Eleição ' + tituloAno(d)) + (c.municipio ? ' - ' + c.municipio : ''), M, 14);
    fonte(24, true, [255, 255, 255]); texto(nomeExib(d).toUpperCase(), M, 26, { maxWidth: CW });
    fonte(11, false, [255, 255, 255]); texto('nº ' + c.numero + ' - ' + c.partido + (c.eleito && d.tipo !== '2022' ? '  |  ELEITO' : '') + (c.nomeCompleto && d.tipo !== '2022' ? '  |  ' + c.nomeCompleto : ''), M, 34);
    fonte(8.5, false, [191, 212, 242]); texto(titulo, M, 41);
    y = 54;
    var k = chaveV(d), T0 = totalV(d), cob = cobAno(d), vere = ehVereador(d), nv = nivelPrincipal(d);

    if (d.tipo === 'cmp') {
      var dif = d.T26 - d.T22, s22 = d.cob22.sec, s26 = d.cob26.sec;
      h2('Resumo'); narrativa(d).forEach(function (t) { par(t); });
      h2('Números-chave');
      kpis([{ rot: 'Votos 2022', val: fmt(d.T22), sub: '100,0% do total dele em 2022' }, { rot: 'Votos 2026', val: fmt(d.T26), sub: '100,0% do total dele em 2026' }, { rot: 'Diferença', val: sgn(dif), sub: vv(d.T26, d.T22) + ' sobre 2022' },
        { rot: 'Seções com voto', val: fmt(s22.n) + ' > ' + fmt(s26.n), sub: pc(s22.n, s22.t) + ' > ' + pc(s26.n, s26.t) + ' das seções' }, { rot: 'Seções ganhas / perdidas', val: fmt(d.secGanhas) + ' / ' + fmt(d.secPerdidas), sub: 'passou a ter voto / deixou de ter' },
        { rot: 'Posição em 2026', val: d.pos + 'o', sub: 'de ' + fmt(d.nCand) + ' candidatos - ' + vg(c.vagas) + '' }]);
      var linhaCmp = function (nivel) { return function (u) { var l = [rotCtx(u, nivel), fmt(u.v22), pc(u.v22, d.T22), fmt(u.v26), pc(u.v26, d.T26), sgn(u.dif), vv(u.v26, u.v22)]; l.cor = [null, null, null, null, null, corDif(u.dif), corDif(u.dif)]; return l; }; };
      var colsCmp = function (rot, w0) { return [{ t: rot, w: w0, neg: true }, { t: '2022', w: 15, al: 'r' }, { t: '% 2022', w: 14, al: 'r' }, { t: '2026', w: 15, al: 'r' }, { t: '% 2026', w: 14, al: 'r' }, { t: 'Dif.', w: 15, al: 'r' }, { t: 'Var.', w: 15, al: 'r' }]; };
      h2('Por regional (2022 × 2026)'); pares(niv(d, 'reg').slice().sort(function (a, b) { return b.v26 - a.v26; }).map(function (u) { return { rot: u.rot, v22: u.v22, v26: u.v26, t22: fmt(u.v22) + ' (' + pc(u.v22, d.T22) + ')', t26: fmt(u.v26) + ' (' + pc(u.v26, d.T26) + ') ' + vv(u.v26, u.v22) }; }));
      tabela(colsCmp('Regional', 48), niv(d, 'reg').slice().sort(function (a, b) { return b.v26 - a.v26; }).map(linhaCmp('reg')));
      h2('Todos os municípios'); tabela(colsCmp('Município', 48), niv(d, 'mun').slice().sort(function (a, b) { return b.v26 - a.v26; }).map(linhaCmp('mun')));
      [['mun', 'Municípios'], ['bairro', 'Bairros'], ['local', 'Locais de votação']].forEach(function (a) {
        h2(a[1] + ': onde mais ganhou'); tabela(colsCmp(a[1].replace(/s$/, ''), 54), ganhos(d, a[0], 10).map(linhaCmp(a[0])), { tam: 8 });
        h2(a[1] + ': onde mais perdeu'); var pp = perdas(d, a[0], 10); if (pp.length) tabela(colsCmp(a[1].replace(/s$/, ''), 54), pp.map(linhaCmp(a[0])), { tam: 8 }); else par('Nenhum caso de queda.');
      });
      h2('Presença no território');
      tabela([{ t: 'Nível', w: 40, neg: true }, { t: 'Com voto 2022', w: 28, al: 'r' }, { t: '% do total', w: 20, al: 'r' }, { t: 'Com voto 2026', w: 28, al: 'r' }, { t: '% do total', w: 20, al: 'r' }, { t: 'Variação', w: 22, al: 'r' }],
        ['mun', 'bairro', 'local', 'sec'].map(function (l) { return [nomeNivel(l, true).replace(/^./, function (m) { return m.toUpperCase(); }), fmt(d.cob22[l].n) + ' de ' + fmt(d.cob22[l].t), pc(d.cob22[l].n, d.cob22[l].t), fmt(d.cob26[l].n) + ' de ' + fmt(d.cob26[l].t), pc(d.cob26[l].n, d.cob26[l].t), vv(d.cob26[l].n, d.cob22[l].n)]; }));
    } else {
      h2('Resumo'); narrativa(d).forEach(function (t) { par(t); });
      h2('Números-chave');
      var kp = [{ rot: 'Votos ' + d.onde, val: fmt(T0), sub: '100,0% dos votos dele' + (c.eleito && d.tipo !== '2022' ? ' - eleito' : '') }];
      if (d.tipo !== '2022' && d.pos) kp.push({ rot: 'Posição ' + d.onde, val: d.pos + 'o', sub: 'de ' + fmt(d.nCand) + ' candidatos - ' + vg(c.vagas) + '' });
      else { var secs = niv(d, 'sec').filter(function (u) { return u[k] > 0; }); kp.push({ rot: 'Média por seção com voto', val: fmt(secs.length ? Math.round(T0 / secs.length) : 0), sub: pc(secs.length ? Math.round(T0 / secs.length) : 0, T0) + ' do total dele' }); }
      kp.push(vere ? { rot: 'Zonas com voto', val: cob.zona.n + ' de ' + cob.zona.t, sub: pc(cob.zona.n, cob.zona.t) + ' das zonas' } : { rot: 'Municípios com voto', val: cob.mun.n + ' de ' + cob.mun.t, sub: pc(cob.mun.n, cob.mun.t) + ' dos municípios' });
      kp.push({ rot: 'Bairros com voto', val: fmt(cob.bairro.n), sub: 'de ' + fmt(cob.bairro.t) + ' - ' + pc(cob.bairro.n, cob.bairro.t) });
      kp.push({ rot: 'Locais de votação com voto', val: fmt(cob.local.n), sub: 'de ' + fmt(cob.local.t) + ' - ' + pc(cob.local.n, cob.local.t) });
      kp.push({ rot: 'Seções com voto', val: fmt(cob.sec.n), sub: 'de ' + fmt(cob.sec.t) + ' - ' + pc(cob.sec.n, cob.sec.t) });
      kpis(kp);
      h2('Presença no território');
      tabela([{ t: 'Nível', w: 50, neg: true }, { t: 'Com voto', w: 30, al: 'r' }, { t: 'Total', w: 30, al: 'r' }, { t: '% do total', w: 30, al: 'r' }],
        [vere ? ['zona', 'Zonas'] : ['mun', 'Municípios'], ['bairro', 'Bairros'], ['local', 'Locais de votação'], ['sec', 'Seções']].map(function (a) { return [a[1], fmt(cob[a[0]].n), fmt(cob[a[0]].t), pc(cob[a[0]].n, cob[a[0]].t)]; }));
      var it = function (u) { return { rot: u.rot, v: u[k], txt: fmt(u[k]) + ' (' + pc(u[k], T0) + ')' }; };
      h2('Votos por ' + nomeNivel(nv)); barras(topo(d, nv, 12, k).map(it));
      var rank = function (l, n, rotCol, ctxCol) {
        return tabela([{ t: '#', w: 8 }, { t: rotCol, w: 60, neg: true }, { t: ctxCol, w: 62 }, { t: 'Votos', w: 18, al: 'r' }, { t: '% dos votos dele', w: 24, al: 'r' }],
          topo(d, l, n, k).map(function (u, i) { return [String(i + 1), u.rot, u.ctx || '', fmt(u[k]), pc(u[k], T0)]; }), { tam: 8 });
      };
      if (!vere) { h2('Os 10 maiores municípios'); rank('mun', 10, 'Município', 'Regional'); }
      h2('Os 15 maiores bairros'); rank('bairro', 15, 'Bairro', 'Município');
      h2('Os 15 maiores locais de votação'); rank('local', 15, 'Local de votação', 'Localização');
      h2('As 15 maiores seções'); rank('sec', 15, 'Seção', 'Local');
    }
    h2('Observações');
    lista(['Todos os percentuais são calculados sobre o total de votos do próprio candidato' + (vere ? ' em ' + c.municipio : ' no estado') + ' (nenhum percentual compara com outros candidatos).',
      'Fonte dos dados: ' + d.fonte + '.', d.tipo === 'cmp' ? 'As seções de 2022 foram associadas às de 2026 pelo município, zona e número da seção; ' + fmt(d.semSecao22) + ' voto(s) de 2022 ficaram sem seção correspondente.' : 'Unidades "com voto" são aquelas em que o candidato recebeu ao menos um voto.']);
    // rodapé com numeração
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p); cor(C_LINHA, 'draw'); doc.setLineWidth(0.2); doc.line(M, PH - 16, PW - M, PH - 16);
      fonte(6.5, false, [152, 162, 179]); texto(d.carimbo, M, PH - 12);
      fonte(7.5, false, C_CZ); texto('Fonte: ' + d.fonte, M, PH - 7.5); texto('Página ' + p + ' de ' + n, PW - M, PH - 7.5, { align: 'right' });
    }
    return doc;
  }
  function gerarPdf(d, msg) {
    if (msg) msg('Carregando a biblioteca de PDF…');
    return carregar('jspdf', 'jspdf').then(function (lib) { if (msg) msg('Montando o PDF…'); d.carimbo = carimbo(); return montaPdf(d, lib.jsPDF); });
  }
  function pdfBaixar(d, msg) { return gerarPdf(d, msg).then(function (doc) { baixarBlob(doc.output('blob'), nomeArq(d, d.tipo === 'cmp' ? 'comparativo' : 'votacao', 'pdf')); }); }
  function pdfVer(d, msg) {
    var aba = null; try { aba = window.open('', '_blank'); } catch (e) { aba = null; }   // aberta já no clique (senão o navegador bloqueia)
    if (aba) { try { aba.document.write('<title>Gerando PDF…</title><p style="font:16px sans-serif;padding:24px">Gerando o PDF…</p>'); } catch (e) { /* ok */ } }
    return gerarPdf(d, msg).then(function (doc) {
      var blob = doc.output('blob'), url = URL.createObjectURL(blob);
      if (aba && !aba.closed) { aba.location.href = url; } else { baixarBlob(blob, nomeArq(d, d.tipo === 'cmp' ? 'comparativo' : 'votacao', 'pdf')); if (msg) msg('O navegador bloqueou a nova aba: o PDF foi baixado.'); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    }, function (e) { if (aba && !aba.closed) aba.close(); throw e; });
  }

  window.EleicaoExportar = { 'slide-ver': exibirSlides, 'slide-baixar': baixarSlides, 'pdf-ver': pdfVer, 'pdf-baixar': pdfBaixar, _slides: function (d) { return comMoldura(d, slidesDe(d)); }, _narrativa: narrativa };
})();
