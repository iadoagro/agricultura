/* Persistência dos cadastros. O modo online nunca recua silenciosamente para o local. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const online = Boolean(cfg.url || cfg.chavePublica);
  const localKey = 'seagri_eleicoes_v1';
  const sessionKey = 'seagri_banco_sessao:' + cfg.url;
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
  function limpar() {
    sessao = null; cache = []; carregado = false;
    sessionStorage.removeItem(sessionKey); avisar();
  }
  async function requisicao(caminho, options = {}, autenticada = true) {
    configurar();
    if (autenticada && (!sessao || sessao.expires_at * 1000 <= Date.now())) {
      limpar(); throw new Error('Entre no banco online para continuar.');
    }
    let resposta;
    try {
      resposta = await fetch(cfg.url.replace(/\/$/,'') + caminho, {
        ...options, signal: AbortSignal.timeout(20000),
        headers: {apikey:cfg.chavePublica, 'Content-Type':'application/json',
          ...(autenticada ? {Authorization:'Bearer '+sessao.access_token} : {}), ...options.headers}
      });
    } catch (e) { throw new Error('Sem conexão com o banco. Tente novamente; os campos foram mantidos.'); }
    if (!resposta.ok) {
      if (resposta.status === 401 && autenticada) limpar();
      throw new Error(resposta.status === 401 || resposta.status === 400 && !autenticada ? 'Confira o e-mail e a senha e entre novamente.' : resposta.status === 403 ? 'Esta conta não tem autorização para os cadastros.' : 'O banco não concluiu a operação. Tente novamente.');
    }
    const texto = await resposta.text(); return texto ? JSON.parse(texto) : null;
  }
  async function atualizar() {
    if (!online) return;
    // Confere a autorização antes de tratar um resultado vazio como uma base vazia.
    const admins = await requisicao('/rest/v1/eleicoes_admins?select=user_id&user_id=eq.'+encodeURIComponent(sessao ? sessao.user.id : ''));
    if (!admins.length) { limpar(); throw new Error('Sua conta ainda não foi autorizada pelo responsável pelo banco.'); }
    const registros = [];
    for (let offset = 0; ; offset += 500) {
      const lote = await requisicao('/rest/v1/eleicoes_cadastros?select=id,dados&order=criado_em.asc,id.asc&limit=500&offset='+offset);
      registros.push(...lote.map(r => ({...r.dados, _id:r.id})));
      if (lote.length < 500) break;
    }
    cache = registros; carregado = true; avisar();
  }
  async function entrar(email, password) {
    const s = await requisicao('/auth/v1/token?grant_type=password', {method:'POST', body:JSON.stringify({email,password})}, false);
    sessao = {...s, expires_at: s.expires_at || Math.floor(Date.now()/1000)+s.expires_in};
    // Guarda somente o token da sessão na aba; não armazena senha ou refresh token.
    sessao = {access_token:sessao.access_token, expires_at:sessao.expires_at, user:{id:s.user.id}};
    try { await atualizar(); sessionStorage.setItem(sessionKey, JSON.stringify(sessao)); }
    catch (e) { limpar(); throw e; }
  }
  async function salvar(registro) {
    if (!online) { const dados = local(); dados.push(registro); localStorage.setItem(localKey, JSON.stringify(dados)); return; }
    const assinatura = JSON.stringify(registro);
    const id = pendentes.get(assinatura) || crypto.randomUUID();
    pendentes.set(assinatura,id);
    await requisicao('/rest/v1/eleicoes_cadastros?on_conflict=id', {method:'POST', headers:{Prefer:'resolution=ignore-duplicates'}, body:JSON.stringify({id,dados:registro})});
    pendentes.delete(assinatura);
    cache.push({...registro,_id:id}); carregado = true; avisar();
  }
  async function importar() {
    const registros = local(), repetidos = new Map(), lote = [];
    for (const r of registros) {
      const dados = Object.fromEntries(Object.keys(r).filter(k=>k!=='_id').sort().map(k=>[k,r[k]]));
      const texto = JSON.stringify(dados), ordem = repetidos.get(texto) || 0;
      repetidos.set(texto,ordem+1);
      const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(texto+'#'+ordem));
      const id = 'local_'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
      lote.push({id,dados});
    }
    for (let i=0; i<lote.length; i+=100) await requisicao('/rest/v1/eleicoes_cadastros?on_conflict=id', {
      method:'POST', headers:{Prefer:'resolution=ignore-duplicates'}, body:JSON.stringify(lote.slice(i,i+100))
    });
    await atualizar(); return registros.length;
  }
  const banco = window.BANCO_ELEICOES = {
    online, entrar, atualizar, importar, salvar,
    ler() { if (!online) return local(); if (!carregado || !sessao) throw new Error('Entre no banco online para consultar os cadastros.'); return cache; },
    async sair() { try { if (sessao) await requisicao('/auth/v1/logout',{method:'POST'}); } finally { limpar(); } },
    conectado: () => Boolean(sessao && carregado)
  };
  const dialogo = document.getElementById('banco-dialogo');
  const status = document.getElementById('banco-mensagem');
  const acesso = document.getElementById('banco-acesso');
  const acoes = document.getElementById('banco-acoes');
  function exibir() {
    acesso.hidden = banco.conectado(); acoes.hidden = !banco.conectado();
    document.getElementById('banco-abrir').textContent = banco.conectado() ? 'Banco online • conectado' : 'Entrar no banco online';
    document.getElementById('aviso-dados').textContent = online ? 'Banco online: os cadastros são compartilhados entre as contas autorizadas. Use Atualizar para buscar mudanças de outros computadores.' : 'Os cadastros são salvos somente neste navegador. O banco online ainda não foi configurado.';
  }
  document.getElementById('banco-abrir').hidden = !online;
  document.getElementById('banco-abrir').onclick = () => { status.textContent = ''; exibir(); dialogo.showModal(); };
  document.getElementById('banco-fechar').onclick = () => dialogo.close();
  acesso.onsubmit = async e => {
    e.preventDefault(); const botao = acesso.querySelector('button'); botao.disabled = true;
    try { await entrar(acesso.elements.email.value.trim(),acesso.elements.senha.value); acesso.reset(); status.textContent = 'Conectado ao banco online.'; exibir(); }
    catch (err) { status.textContent = err.message; } finally { botao.disabled = false; }
  };
  async function acao(botao, tarefa) {
    botao.disabled = true; status.textContent = 'Aguarde…';
    try { status.textContent = await tarefa(); } catch (e) { status.textContent = e.message; }
    finally { botao.disabled = false; exibir(); }
  }
  document.getElementById('banco-importar').onclick = e => acao(e.currentTarget,async()=> 'Importação concluída: '+await importar()+' cadastros locais conferidos. A cópia local foi preservada.');
  document.getElementById('banco-atualizar').onclick = e => acao(e.currentTarget,async()=> {await atualizar();return 'Cadastros atualizados.';});
  document.getElementById('banco-sair').onclick = e => acao(e.currentTarget,async()=> {await banco.sair();return 'Sessão encerrada.';});
  window.addEventListener('banco-atualizado',exibir);
  exibir();
  if (online) {
    try { sessao = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch (e) { sessao = null; }
    if (sessao) atualizar().catch(e => { limpar(); status.textContent = e.message; });
  }
})();
