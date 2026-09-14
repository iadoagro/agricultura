/* Persistência dos cadastros de Fiscais. Reaproveita a sessão já criada pelo
   login do site (admin-auth.js) — quem chegou até essa página já está
   aprovado e com "eleicoes" liberado, então não pede login de novo. O modo
   online nunca recua silenciosamente para o local. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const online = Boolean(cfg.url || cfg.chavePublica);
  const localKey = 'seagri_eleicoes_v1';
  let sessao = null, cache = [], carregado = false;
  const pendentes = new Map();
  const avisar = () => window.dispatchEvent(new Event('banco-atualizado'));
  function local() {
    const registros = JSON.parse(localStorage.getItem(localKey) || '[]');
    if (!Array.isArray(registros) || registros.some(r => !r || ['municipio','nome','telefone','regional'].some(k => typeof r[k] !== 'string'))) throw new Error('Não foi possível ler os cadastros locais.');
    return registros;
  }
  function configurar() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url || '') || !/^sb_publishable_/.test(cfg.chavePublica || '')) throw new Error('A configuração do banco online está incompleta.');
  }
  async function requisicao(caminho, options = {}) {
    configurar();
    if (!sessao || sessao.expires_at * 1000 <= Date.now()) throw new Error('Sua sessão expirou. Volte à página inicial e entre de novo.');
    let resposta;
    try {
      resposta = await fetch(cfg.url.replace(/\/$/, '') + caminho, {
        ...options, signal: AbortSignal.timeout(20000),
        headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token, ...options.headers }
      });
    } catch (e) { throw new Error('Sem conexão com o banco. Tente novamente; os campos foram mantidos.'); }
    if (!resposta.ok) {
      throw new Error(
        resposta.status === 401 ? 'Sua sessão expirou. Volte à página inicial e entre de novo.' :
        resposta.status === 403 ? 'Esta conta não tem autorização para os cadastros de Fiscais.' :
        'O banco não concluiu a operação. Tente novamente.'
      );
    }
    const texto = await resposta.text(); return texto ? JSON.parse(texto) : null;
  }
  async function atualizar() {
    if (!online) return;
    if (!sessao) throw new Error('Sua sessão expirou. Volte à página inicial e entre de novo.');
    const registros = [];
    for (let offset = 0; ; offset += 500) {
      const lote = await requisicao('/rest/v1/eleicoes_cadastros?select=id,dados&order=criado_em.asc,id.asc&limit=500&offset=' + offset);
      registros.push(...lote.map(r => ({ ...r.dados, _id: r.id })));
      if (lote.length < 500) break;
    }
    cache = registros; carregado = true; avisar();
  }
  async function salvar(registro) {
    if (!online) { const dados = local(); registro._id = crypto.randomUUID(); dados.push(registro); localStorage.setItem(localKey, JSON.stringify(dados)); return; }
    const assinatura = JSON.stringify(registro);
    const id = pendentes.get(assinatura) || crypto.randomUUID();
    pendentes.set(assinatura, id);
    await requisicao('/rest/v1/eleicoes_cadastros?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id, dados: registro }) });
    pendentes.delete(assinatura);
    cache.push({ ...registro, _id: id }); carregado = true; avisar();
  }
  async function editar(id, registro) {
    if (!online) {
      const dados = local();
      const idx = dados.findIndex(r => r._id === id);
      if (idx === -1) throw new Error('Não foi possível encontrar esse cadastro para editar.');
      registro._id = id;
      dados[idx] = registro;
      localStorage.setItem(localKey, JSON.stringify(dados));
      return;
    }
    await requisicao('/rest/v1/eleicoes_cadastros?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ dados: registro }) });
    const idx = cache.findIndex(r => r._id === id);
    if (idx !== -1) cache[idx] = { ...registro, _id: id };
    avisar();
  }
  async function excluir(id) {
    if (!online) {
      const dados = local().filter(r => r._id !== id);
      localStorage.setItem(localKey, JSON.stringify(dados));
      avisar();
      return;
    }
    await requisicao('/rest/v1/eleicoes_cadastros?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    cache = cache.filter(r => r._id !== id);
    avisar();
  }
  async function importar() {
    const registros = local(), repetidos = new Map(), lote = [];
    for (const r of registros) {
      const dados = Object.fromEntries(Object.keys(r).filter(k => k !== '_id').sort().map(k => [k, r[k]]));
      const texto = JSON.stringify(dados), ordem = repetidos.get(texto) || 0;
      repetidos.set(texto, ordem + 1);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto + '#' + ordem));
      const id = 'local_' + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
      lote.push({ id, dados });
    }
    for (let i = 0; i < lote.length; i += 100) await requisicao('/rest/v1/eleicoes_cadastros?on_conflict=id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(lote.slice(i, i + 100))
    });
    await atualizar(); return registros.length;
  }
  const banco = window.BANCO_ELEICOES = {
    online, atualizar, importar, salvar, editar, excluir,
    ler() { if (!online) return local(); if (!carregado) throw new Error('Carregando os cadastros do banco online…'); return cache; },
    conectado: () => Boolean(sessao && carregado)
  };
  const dialogo = document.getElementById('banco-dialogo');
  const status = document.getElementById('banco-mensagem');
  const acoes = document.getElementById('banco-acoes');
  function exibir() {
    acoes.hidden = !banco.conectado();
    document.getElementById('aviso-dados').textContent = online
      ? 'Banco online: os cadastros são compartilhados entre as contas autorizadas. Use Atualizar para buscar mudanças de outros computadores.'
      : 'Os cadastros são salvos somente neste navegador. O banco online ainda não foi configurado.';
  }
  document.getElementById('banco-abrir').hidden = !online;
  document.getElementById('banco-abrir').onclick = () => { status.textContent = ''; exibir(); dialogo.showModal(); };
  document.getElementById('banco-fechar').onclick = () => dialogo.close();
  async function acao(botao, tarefa) {
    botao.disabled = true; status.textContent = 'Aguarde…';
    try { status.textContent = await tarefa(); } catch (e) { status.textContent = e.message; }
    finally { botao.disabled = false; exibir(); }
  }
  document.getElementById('banco-importar').onclick = e => acao(e.currentTarget, async () => 'Importação concluída: ' + await importar() + ' cadastros locais conferidos. A cópia local foi preservada.');
  document.getElementById('banco-atualizar').onclick = e => acao(e.currentTarget, async () => { await atualizar(); return 'Cadastros atualizados.'; });
  window.addEventListener('banco-atualizado', exibir);
  exibir();
  if (online) {
    const auth = window.ADMIN_AUTH;
    const adminSessao = auth && auth.sessaoAtual();
    if (adminSessao) {
      sessao = { access_token: adminSessao.access_token, expires_at: adminSessao.expires_at, user: { id: adminSessao.user.id } };
      atualizar().catch(e => { status.textContent = e.message; });
    }
  }
})();
