/* Link público da apuração do 2º turno (botão "🔗 Link público" do cabeçalho da aba Eleições > 2º Turno).
   Só o responsável (root@root.com) vê o botão e gerencia o link. Existe UM link ativo por vez, com um código curto e fácil
   de falar, guardado em public.apuracao_links (database/apuracao-links.sql). Quem abre o link (…/agricultura/eleicoes) vai para
   eleicoes/index.html, que NÃO faz login, NÃO carrega o menu nem as telas internas e só consulta dados públicos do TSE; o
   código não dá nenhuma permissão no banco (o público só consegue perguntar "este código vale?" via apuracao_link_valido).
   O link pode ser revogado a qualquer momento (botão Revogar) ou trocado por um novo (Gerar novo código). */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG, auth = window.ADMIN_AUTH;
  var BASE_PUBLICA = 'https://iadoagro.github.io/agricultura/';   // endereço do sistema publicado
  var overlay = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function dh(iso) { if (!iso) return '—'; var d = new Date(iso); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
  function responsavel() { return !!(auth && auth.papel && auth.papel() === 'responsavel'); }

  async function rest(caminho, opcoes) {
    if (!cfg || !cfg.url) throw new Error('Banco não configurado.');
    if (auth.garantirSessao) await auth.garantirSessao().catch(function () {});
    var s = auth.sessaoAtual && auth.sessaoAtual();
    if (!s) throw new Error('Entre novamente para continuar.');
    var r = await fetch(cfg.url.replace(/\/$/, '') + caminho, Object.assign({}, opcoes, {
      headers: Object.assign({ apikey: cfg.chavePublica, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, (opcoes && opcoes.headers) || {})
    }));
    if (!r.ok) {
      if (r.status === 404) throw new Error('O banco ainda não tem o link público: rode database/apuracao-links.sql no Supabase.');
      if (r.status === 401 || r.status === 403) throw new Error('Só o responsável pode gerenciar o link público.');
      throw new Error('O banco não concluiu a operação (' + r.status + ').');
    }
    var t = await r.text(); return t ? JSON.parse(t) : null;
  }

  /* código falado: 4 sílabas (consoante + vogal) e 2 números — ex.: kamiruse47 */
  function novoCodigo() {
    var C = 'bdfgklmnprstv', V = 'aeiou', b = new Uint8Array(10); crypto.getRandomValues(b);
    var c = '';
    for (var i = 0; i < 4; i++) c += C[b[i * 2] % C.length] + V[b[i * 2 + 1] % V.length];
    return c + String(b[8] % 10) + String(b[9] % 10);
  }
  function urlDoLink() { return BASE_PUBLICA + 'eleicoes'; }   // endereço fixo e fácil de falar; ligar/desligar é no botão
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) {
      var t = document.createElement('textarea'); t.value = texto; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* sem permissão */ }
      t.remove(); return ok;
    }
  }

  function fechar() { if (overlay) { overlay.remove(); overlay = null; } document.removeEventListener('keydown', teclas); }
  function teclas(e) { if (e.key === 'Escape') fechar(); }
  function aviso(txt, cls) { var m = overlay && overlay.querySelector('[data-al-msg]'); if (m) { m.className = cls || 'al-dica'; m.textContent = txt || ''; } }

  async function mostrar() {
    var box = overlay.querySelector('[data-al-corpo]');
    box.innerHTML = '<p class="al-dica">Carregando…</p>';
    try {
      var ls = await rest('/rest/v1/apuracao_links?select=criado_em,expira_em,acessos,ultimo_acesso&revogado_em=is.null&order=criado_em.desc&limit=1', { method: 'GET' });
      var l = ls && ls[0];
      if (l && l.expira_em && new Date(l.expira_em) <= new Date()) l = null;
      var url = urlDoLink();
      box.dataset.url = url;
      if (!l) {
        box.innerHTML = '<div class="al-vazio"><span class="al-tag al-rev">Desativado</span><p>O link <b>' + esc(url) + '</b> está desativado: quem abrir verá "Acesso não autorizado".</p><button type="button" data-al="gerar" class="al-prim">Ativar link público</button></div>';
        return;
      }
      box.innerHTML =
        '<div class="al-atual"><span class="al-tag al-ok">Ativo</span>' +
        '<label>Link público</label><input type="text" readonly value="' + esc(url) + '" data-al-url>' +
        '<div class="al-meta">Ativado em ' + dh(l.criado_em) + ' · ' + (l.acessos || 0) + ' acesso' + (l.acessos === 1 ? '' : 's') + (l.ultimo_acesso ? ' · último em ' + dh(l.ultimo_acesso) : '') + '</div>' +
        '<div class="al-botoes"><button type="button" data-al="copiar" class="al-prim">Copiar link</button><button type="button" data-al="abrir">Abrir</button>' +
        '<button type="button" data-al="revogar" class="al-perigo">Revogar</button></div></div>';
    } catch (e) { box.innerHTML = '<p class="al-erro">' + esc(e.message) + '</p>'; }
  }

  async function gerar(btn) {
    if (btn) btn.disabled = true; aviso('Gerando…');
    try {
      await rest('/rest/v1/rpc/apuracao_link_gerar', { method: 'POST', body: JSON.stringify({ p_token: novoCodigo() }) });
      try { if (auth.registrarEvento) auth.registrarEvento('criar', 'apuracao-publica', 'Gerou o link público da apuração do 2º turno'); } catch (e) { /* auditoria é opcional */ }
      await mostrar();
      var u = overlay.querySelector('[data-al-corpo]').dataset.url; aviso(u && await copiar(u) ? 'Link ativado e copiado.' : 'Link ativado.', 'al-ok');
    } catch (e) { aviso(e.message, 'al-erro'); if (btn) btn.disabled = false; }
  }

  async function aoClicar(e) {
    if (e.target === overlay || e.target.closest('[data-al="fechar"]')) { fechar(); return; }
    var b = e.target.closest('[data-al]'); if (!b) return;
    var acao = b.getAttribute('data-al'), url = overlay.querySelector('[data-al-corpo]').dataset.url;
    if (acao === 'gerar') gerar(b);
    else if (acao === 'copiar' && url) { var ok = await copiar(url); aviso(ok ? 'Link copiado.' : 'Não foi possível copiar: selecione o link e copie manualmente.', ok ? 'al-ok' : 'al-erro'); }
    else if (acao === 'abrir' && url) window.open(url, '_blank', 'noopener');
    else if (acao === 'revogar') {
      if (!confirm('Revogar o link público? Quem estiver com ele deixa de conseguir abrir a página.')) return;
      try {
        await rest('/rest/v1/rpc/apuracao_link_revogar', { method: 'POST', body: '{}' });
        try { if (auth.registrarEvento) auth.registrarEvento('revogar', 'apuracao-publica', 'Revogou o link público da apuração do 2º turno'); } catch (x) { /* opcional */ }
        await mostrar(); aviso('Link revogado.', 'al-ok');
      } catch (er) { aviso(er.message, 'al-erro'); }
    }
  }

  function abrir() {
    if (!responsavel()) { alert('Somente o responsável pode gerenciar o link público.'); return; }
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'al-overlay';
    overlay.innerHTML =
      '<div class="al-modal" role="dialog" aria-modal="true" aria-labelledby="alTit">' +
      '<div class="al-cab"><h3 id="alTit">Link público da apuração</h3><button type="button" data-al="fechar" aria-label="Fechar">×</button></div>' +
      '<p class="al-intro">Um único link, sempre o mesmo, para <b>qualquer pessoa</b> acompanhar a apuração do 2º turno <b>sem login</b>. Ele abre somente a página de apuração (dados públicos do TSE): não dá acesso ao restante do sistema. Use <b>Revogar</b> para desligá-lo e <b>Ativar</b> para ligar de novo.</p>' +
      '<div data-al-corpo></div><div data-al-msg class="al-dica"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', aoClicar);
    document.addEventListener('keydown', teclas);
    mostrar();
  }

  window.ApuracaoLinks = { abrir: abrir, fechar: fechar, responsavel: responsavel };
})();
