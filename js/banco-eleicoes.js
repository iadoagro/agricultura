/* Persistência dos cadastros de Fiscais. Reaproveita a sessão já criada pelo
   login do site (admin-auth.js) — quem chegou até essa página já está
   aprovado e com "eleicoes" liberado, então não pede login de novo. O modo
   online nunca recua silenciosamente para o local. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const online = Boolean(cfg.url || cfg.chavePublica);
  const localKey = 'seagri_eleicoes_v1';
  const localSnapKey = 'seagri_eleicoes_instantaneo_v1';
  let sessao = null, cache = [], carregado = false;
  const pendentes = new Map();
  const avisar = () => window.dispatchEvent(new Event('banco-atualizado'));
  const DOMINIO_USUARIO = '@sistema.local';
  function loginDoEmail(email) {
    if (!email) return 'Sistema';
    return email.toLowerCase() === 'root@root.com' || !email.toLowerCase().endsWith(DOMINIO_USUARIO)
      ? email : email.slice(0, -DOMINIO_USUARIO.length);
  }
  // uuid → login exibido ("Cadastrado por"); some fica pra sempre em cache,
  // não muda depois que o cadastro foi feito. Quem não resolve (conta
  // excluída) ou não tem criado_por vira "Sistema" na tela.
  //
  // Roda À PARTE do carregamento principal (nunca no meio do await de
  // atualizar()): é só um enfeite (mostrar quem cadastrou), e se travar ou
  // falhar — coluna nova sem cache do PostgREST atualizado ainda, RPC fora
  // do ar, RLS bloqueando por algum motivo — não pode derrubar a lista de
  // fiscais inteira com ela. Busca o criado_por à parte (não vem mais no
  // select principal) e preenche quando terminar, avisando de novo pra
  // tela atualizar só essa informação.
  const criadores = new Map();
  async function preencherCriadores(registros) {
    try {
      const ids = registros.map(r => r._id);
      const doresPorFiscal = new Map();
      for (let offset = 0; offset < ids.length; offset += 500) {
        const lote = await requisicao('/rest/v1/eleicoes_cadastros?select=id,criado_por&id=in.(' + ids.slice(offset, offset + 500).map(encodeURIComponent).join(',') + ')');
        lote.forEach(r => doresPorFiscal.set(r.id, r.criado_por));
      }
      const faltando = [...new Set([...doresPorFiscal.values()].filter(id => id && !criadores.has(id)))];
      if (faltando.length) {
        const nomes = await requisicao('/rest/v1/rpc/fiscais_criadores', { method: 'POST', body: JSON.stringify({ p_ids: faltando }) });
        (nomes || []).forEach(n => criadores.set(n.id, n.login));
      }
      registros.forEach(r => {
        const criadoPorId = doresPorFiscal.get(r._id);
        r._criadoPorId = criadoPorId;
        r._criadoPor = (criadoPorId && criadores.get(criadoPorId)) || 'Sistema';
      });
      avisar();
    } catch (e) { /* só o "Cadastrado por" fica sem preencher — o resto da tela já carregou normalmente */ }
  }
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
        resposta.status === 403 ? 'Esta conta não tem autorização para os cadastros de Fiscais. Se sua conta foi aprovada recentemente, volte à página inicial e entre de novo para atualizar a sessão; senão, peça ao responsável para aprovar/ativar sua conta em Usuários.' :
        'O banco não concluiu a operação (' + resposta.status + '). Tente novamente.'
      );
    }
    const texto = await resposta.text(); return texto ? JSON.parse(texto) : null;
  }
  async function atualizar() {
    if (!online) return;
    if (!sessao) throw new Error('Sua sessão expirou. Volte à página inicial e entre de novo.');
    const registros = [];
    for (let offset = 0; ; offset += 500) {
      const lote = await requisicao('/rest/v1/eleicoes_cadastros?select=id,dados,criado_em&order=criado_em.asc,id.asc&limit=500&offset=' + offset);
      registros.push(...lote.map(r => ({ ...r.dados, _id: r.id, _criadoEm: r.criado_em })));
      if (lote.length < 500) break;
    }
    cache = registros; carregado = true; avisar();
    preencherCriadores(registros); // "Cadastrado por": preenche depois, sem atrasar a lista
  }
  async function salvar(registro) {
    if (!online) { const dados = local(); registro._id = crypto.randomUUID(); registro._criadoEm = new Date().toISOString(); dados.push(registro); localStorage.setItem(localKey, JSON.stringify(dados)); return; }
    const assinatura = JSON.stringify(registro);
    const id = pendentes.get(assinatura) || crypto.randomUUID();
    pendentes.set(assinatura, id);
    await requisicao('/rest/v1/eleicoes_cadastros?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id, dados: registro }) });
    pendentes.delete(assinatura);
    cache.push({ ...registro, _id: id, _criadoPorId: sessao.user.id, _criadoPor: loginDoEmail(sessao.user.email) }); carregado = true; avisar();
    window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('criar', 'fiscais', 'Cadastrou o fiscal "' + (registro.nome || '') + '" (' + (registro.municipio || '') + ')');
  }
  async function editar(id, registro) {
    if (!online) {
      const dados = local();
      const idx = dados.findIndex(r => r._id === id);
      if (idx === -1) throw new Error('Não foi possível encontrar esse cadastro para editar.');
      registro._id = id;
      registro._criadoEm = dados[idx]._criadoEm;
      dados[idx] = registro;
      localStorage.setItem(localKey, JSON.stringify(dados));
      return;
    }
    await requisicao('/rest/v1/eleicoes_cadastros?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ dados: registro }) });
    const idx = cache.findIndex(r => r._id === id);
    if (idx !== -1) cache[idx] = { ...registro, _id: id, _criadoEm: cache[idx]._criadoEm, _criadoPorId: cache[idx]._criadoPorId, _criadoPor: cache[idx]._criadoPor };
    avisar();
    window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('editar', 'fiscais', 'Editou o fiscal "' + (registro.nome || '') + '" (' + (registro.municipio || '') + ')');
  }
  async function excluir(id) {
    if (!online) {
      const dados = local().filter(r => r._id !== id);
      localStorage.setItem(localKey, JSON.stringify(dados));
      avisar();
      return;
    }
    const alvo = cache.find(r => r._id === id);
    await requisicao('/rest/v1/eleicoes_cadastros?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    cache = cache.filter(r => r._id !== id);
    avisar();
    window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('excluir', 'fiscais', 'Excluiu o fiscal "' + (alvo && alvo.nome || '') + '" (' + (alvo && alvo.municipio || '') + ')');
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
  /* Instantâneo: a lista de (município, zona, seção) que têm ao menos um
     fiscal agora, guardada como referência para comparar depois quem
     ganhou ou perdeu — ver database/eleicoes-instantaneos.sql. */
  function secoesComFiscal() {
    const vistas = new Map();
    for (const r of banco.ler()) {
      if (!r.municipio || !r.zona || !r.secao) continue;
      vistas.set(r.municipio + '|' + r.zona + '|' + r.secao, { municipio: r.municipio, zona: r.zona, secao: r.secao });
    }
    return [...vistas.values()];
  }
  async function snapshotCriar() {
    const secoes = secoesComFiscal();
    if (!online) {
      localStorage.setItem(localSnapKey, JSON.stringify({ criado_em: new Date().toISOString(), secoes }));
      return secoes.length;
    }
    await requisicao('/rest/v1/eleicoes_instantaneos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ secoes }) });
    return secoes.length;
  }
  async function snapshotUltimo() {
    if (!online) {
      const bruto = localStorage.getItem(localSnapKey);
      return bruto ? JSON.parse(bruto) : null;
    }
    const lista = await requisicao('/rest/v1/eleicoes_instantaneos?select=criado_em,secoes&order=criado_em.desc&limit=1');
    return lista[0] || null;
  }
  /* Todos os instantâneos marcados (mais recente primeiro), para comparar
     dois quaisquer ou ver a evolução da cobertura no tempo — não só "agora
     vs. último". No modo local só existe um de cada vez (chave única no
     localStorage), então a lista tem no máximo 1 item ali. */
  async function snapshotListar(limite) {
    if (!online) {
      const bruto = localStorage.getItem(localSnapKey);
      return bruto ? [JSON.parse(bruto)] : [];
    }
    return await requisicao('/rest/v1/eleicoes_instantaneos?select=criado_em,secoes&order=criado_em.desc&limit=' + (limite || 20));
  }
  const banco = window.BANCO_ELEICOES = {
    online, atualizar, importar, salvar, editar, excluir, snapshotCriar, snapshotUltimo, snapshotListar,
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
