/* Contatos — as caixas vêm do organograma
   A página Contatos lista as MESMAS caixas do organograma (pages/organograma.html). Ela lê as tabelas
   organograma_setores (o desenho original) e organograma_ajustes (o que o modo Admin do organograma mudou:
   responsável, nome/sigla/cor/tipo do setor, hierarquia, caixas novas e removidas) e aplica as mesmas regras
   de js/organograma.js (orgEstruturaRaw e carregarAjustes), só que sem o desenho. Trocar um nome, incluir ou
   remover uma caixa no organograma muda em Contatos sozinho, na próxima vez que a página abre ou volta a ser vista.
   A última leitura fica guardada no navegador, para a página abrir já preenchida.

   window.OrgContatos.carregar() -> Promise<{ dados, mudou }>   (lê o banco; dados = { nos, grupos })
   window.OrgContatos.doCache()  -> { nos, grupos } | null      (a última leitura guardada)
   window.OrgContatos.corDaCaixa(no) -> { bg, fg, corpo }       (as cores da caixa, como no organograma) */
(function () {
  'use strict';

  var cfg = window.BANCO_CONFIG || {};
  var base = String(cfg.url || '').replace(/\/$/, '');
  var CHAVE = 'seagri_contatos_org_v1';

  // as cinco cores do desenho original (as mesmas de css/organograma.css); o banco também guarda #rrggbb[aa]
  var COR_NOMEADA = { purple: '#6a1b9a', yellow: '#ffc000', blue: '#4472c4', green: '#4771ad', orange: '#c95c14' };
  var HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

  function pegar(tabela, consulta) {
    return fetch(base + '/rest/v1/' + tabela + '?' + consulta, { headers: { apikey: cfg.chavePublica }, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(tabela + ': HTTP ' + r.status);
        return r.json();
      });
  }

  function buscar() {
    return Promise.all([
      pegar('organograma_setores', 'select=id,parent_id,tipo,cor,titulo,holder,matricula,ordem&order=ordem.asc'),
      pegar('organograma_ajustes', 'select=id,holder,matricula,telefone,parent_id,titulo,sigla,cor,tipo,removido,novo,cor_titulo,cor_texto')
    ]).then(function (r) {
      if (!r[0].length) throw new Error('organograma_setores vazio');
      return { setores: r[0], ajustes: r[1] };
    });
  }

  function caixa(id, pai, tipo, cor, titulo, holder, ordem) {
    return {
      id: id, parent: pai || null, kind: tipo, color: cor, title: titulo, holder: holder || '',
      sigla: String(id).toUpperCase(), corTitulo: '', corTexto: '', telefone: '', ordem: ordem || 0
    };
  }

  /** Setores + ajustes -> caixas como o organograma as mostra hoje, com o grupo de cada uma. */
  function montar(cru) {
    var ajustes = cru.ajustes || [];
    var ov = {};
    ajustes.forEach(function (l) { ov[l.id] = l; });

    var nos = (cru.setores || []).map(function (s) {
      return caixa(s.id, s.parent_id, s.tipo, s.cor, s.titulo, s.holder, s.ordem);
    });
    // caixas novas: entram depois das originais, ligadas ao pai escolhido (sem pai, à secretaria)
    ajustes.forEach(function (l) {
      if (l.novo && !l.removido) {
        nos.push(caixa(l.id, l.parent_id || 'sec', l.tipo || 'divisao', l.cor || 'blue', l.titulo || 'Novo setor', l.holder, 1e6));
      }
    });
    nos.forEach(function (n) {
      var l = ov[n.id];
      if (!l) return;
      if (!l.novo) {
        if (l.titulo) n.title = l.titulo;
        if (l.tipo) n.kind = l.tipo;
        if (l.cor) n.color = l.cor;
        if (l.parent_id && l.parent_id !== n.parent) n.parent = l.parent_id;
      }
      if (l.holder != null) n.holder = l.holder;   // null = sem ajuste; '' = sem responsável de propósito
      if (l.sigla) n.sigla = l.sigla;
      if (l.cor_titulo) n.corTitulo = l.cor_titulo;
      if (l.cor_texto) n.corTexto = l.cor_texto;
      if (l.telefone) n.telefone = l.telefone;
    });

    // caixas removidas: quem estava ligado a elas passa para o pai delas
    var removidos = {};
    ajustes.forEach(function (l) { if (l.removido) removidos[l.id] = true; });
    var paiDe = {};
    nos.forEach(function (n) { paiDe[n.id] = n.parent; });
    nos.forEach(function (n) {
      var guarda = 0;
      while (n.parent && removidos[n.parent] && guarda++ < 50) n.parent = paiDe[n.parent] || null;
    });
    var vivos = nos.filter(function (n) { return !removidos[n.id]; });
    var mapa = {};
    vivos.forEach(function (n) { mapa[n.id] = n; });
    vivos.forEach(function (n) { if (n.parent && !mapa[n.parent]) n.parent = mapa.sec ? 'sec' : null; });   // órfã: volta para a raiz

    // grupo = o que a página mostra como seção: Secretaria, uma por diretoria e os Escritórios Locais
    vivos.forEach(function (n) {
      if (n.kind === 'escritorio') { n.grupo = 'Escritórios Locais'; return; }
      var topo = n, guarda = 0;
      while (topo.parent && mapa[topo.parent] && mapa[topo.parent].parent && guarda++ < 60) topo = mapa[topo.parent];   // sobe até o filho direto da raiz
      n.grupo = (topo.kind === 'diretoria' && topo.parent) ? topo.sigla : 'Secretaria';
    });
    vivos.sort(function (a, b) { return a.ordem - b.ordem; });

    var grupos = [], visto = {};
    function abrirGrupo(nome, cabeca) {
      if (visto[nome]) return;
      visto[nome] = true;
      grupos.push({ nome: nome, cabeca: cabeca });
    }
    var raiz = vivos.filter(function (n) { return !n.parent; })[0];
    abrirGrupo('Secretaria', raiz);
    vivos.forEach(function (n) { if (n.kind === 'diretoria' && n.parent) abrirGrupo(n.sigla, n); });
    var primeiroEscritorio = vivos.filter(function (n) { return n.kind === 'escritorio'; })[0];
    if (primeiroEscritorio) abrirGrupo('Escritórios Locais', mapa.del || primeiroEscritorio);
    // grupo sem nenhuma caixa (ex.: a diretoria só tinha escritórios) não aparece
    grupos = grupos.filter(function (g) {
      return vivos.some(function (n) { return n.grupo === g.nome; });
    });
    return { nos: vivos, grupos: grupos };
  }

  function lerCache() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      return v && v.setores && v.setores.length ? v : null;
    } catch (e) { return null; }
  }

  function doCache() {
    var cru = lerCache();
    return cru ? montar(cru) : null;
  }

  function carregar() {
    return buscar().then(function (cru) {
      var texto = JSON.stringify(cru), antes = null;
      try { antes = localStorage.getItem(CHAVE); } catch (e) { /* modo privado */ }
      try { localStorage.setItem(CHAVE, texto); } catch (e) { /* modo privado */ }
      return { dados: montar(cru), mudou: texto !== antes };
    });
  }

  /** Branco ou escuro sobre a cor de fundo, pelo maior contraste (relação WCAG) — a mesma conta do organograma. */
  function textoSobre(hex) {
    var m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex || '');
    if (!m) return '#fff';
    var v = parseInt(m[1], 16), a = m[2] ? parseInt(m[2], 16) / 255 : 1;   // com transparência o fundo é o branco da página
    var mix = function (c) { return c * a + 255 * (1 - a); };
    var lin = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(mix(v >> 16 & 255)) + 0.7152 * lin(mix(v >> 8 & 255)) + 0.0722 * lin(mix(v & 255));
    var comBranco = 1.05 / (L + 0.05), comPreto = (L + 0.05) / 0.05;
    return (comBranco >= 3.5 || comBranco >= comPreto) ? '#fff' : '#111827';
  }

  function corDaCaixa(n) {
    var propria = HEX.test(n.color || '');
    var bg = propria ? n.color : (COR_NOMEADA[n.color] || COR_NOMEADA.blue);
    var fg = n.corTitulo || (propria ? textoSobre(n.color) : (n.color === 'yellow' ? '#1a1300' : '#fff'));
    return { bg: bg, fg: fg, corpo: n.corTexto || '' };
  }

  window.OrgContatos = { carregar: carregar, doCache: doCache, corDaCaixa: corDaCaixa };
})();
