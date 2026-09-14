/* Login de Admin com aprovação. Usa o mesmo projeto Supabase configurado em
   banco-config.js. Só quem foi aprovado por RESPONSAVEL_EMAIL tem acesso;
   esse e-mail em si é sempre reconhecido como responsável, sem precisar de
   aprovação, "paginas" liberadas nem estar "ativo" — ele sempre vê tudo. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const RESPONSAVEL_EMAIL = 'luansobraldourado5@gmail.com';
  const PAGINAS_PADRAO = ['eleicoes', 'dashboards'];
  const online = Boolean(cfg.url || cfg.chavePublica);
  const sessionKey = 'seagri_admin_sessao:' + cfg.url;
  let sessao = null;
  const avisar = () => window.dispatchEvent(new Event('admin-auth-atualizado'));

  function configurar() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url || '') || !/^sb_publishable_/.test(cfg.chavePublica || '')) throw new Error('A configuração do banco online está incompleta.');
  }
  function limpar() {
    sessao = null;
    sessionStorage.removeItem(sessionKey); avisar();
  }
  async function requisicao(caminho, options = {}, autenticada = true) {
    configurar();
    if (autenticada && (!sessao || sessao.expires_at * 1000 <= Date.now())) {
      limpar(); throw new Error('Entre novamente para continuar.');
    }
    let resposta;
    try {
      resposta = await fetch(cfg.url.replace(/\/$/, '') + caminho, {
        ...options, signal: AbortSignal.timeout(20000),
        headers: {
          apikey: cfg.chavePublica, 'Content-Type': 'application/json',
          ...(autenticada ? { Authorization: 'Bearer ' + sessao.access_token } : {}), ...options.headers
        }
      });
    } catch (e) { throw new Error('Sem conexão com o banco. Tente novamente.'); }
    if (!resposta.ok) {
      if (resposta.status === 401 && autenticada) limpar();
      let corpo = null;
      try { corpo = await resposta.json(); } catch (e) {}
      const motivo = (corpo && (corpo.msg || corpo.message)) || '';
      throw new Error(
        resposta.status === 401 || resposta.status === 400 ? (motivo && /already registered|already exists/i.test(motivo) ? 'Já existe uma conta com esse e-mail.' : 'Confira o e-mail e a senha.') :
        resposta.status === 403 ? 'Esta conta não tem autorização.' :
        resposta.status === 404 ? 'A tabela admin_solicitacoes não existe nesse banco. Rode database/admin.sql no SQL Editor do Supabase.' :
        resposta.status === 422 ? (motivo || 'Não foi possível concluir o cadastro.') :
        'O banco não concluiu a operação (' + resposta.status + (motivo ? ': ' + motivo : '') + '). Tente novamente.'
      );
    }
    const texto = await resposta.text(); return texto ? JSON.parse(texto) : null;
  }

  function ehResponsavel(email) {
    return (email || '').toLowerCase() === RESPONSAVEL_EMAIL;
  }

  async function buscarPerfil() {
    if (ehResponsavel(sessao.user.email)) return { papel: 'responsavel', paginas: null, ativo: true };
    let linha;
    try {
      linha = (await requisicao('/rest/v1/admin_solicitacoes?select=status,paginas,ativo&id=eq.' + encodeURIComponent(sessao.user.id)))[0];
    } catch (e) {
      // "ativo" pode não existir ainda (database/admin-usuarios.sql não rodou) — segue sem travar o login.
      linha = (await requisicao('/rest/v1/admin_solicitacoes?select=status,paginas&id=eq.' + encodeURIComponent(sessao.user.id)))[0];
    }
    return {
      papel: (linha && linha.status) || 'pendente',
      paginas: (linha && linha.paginas) || PAGINAS_PADRAO,
      ativo: !(linha && linha.ativo === false)
    };
  }

  async function atualizarStatus() {
    if (!sessao) return;
    const perfil = await buscarPerfil();
    sessao.papel = perfil.papel;
    sessao.paginas = perfil.paginas;
    sessao.ativo = perfil.ativo;
    sessionStorage.setItem(sessionKey, JSON.stringify(sessao));
    avisar();
  }

  async function cadastrar(email, senha) {
    configurar();
    const r = await requisicao('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password: senha }) }, false);
    if (r && r.access_token) {
      sessao = { access_token: r.access_token, expires_at: r.expires_at || Math.floor(Date.now() / 1000) + r.expires_in, user: { id: r.user.id, email: r.user.email } };
      await atualizarStatus();
      return 'Cadastro criado. Aguarde a aprovação do responsável.';
    }
    return 'Cadastro recebido. Confirme seu e-mail e depois entre — o acesso fica pendente até a aprovação do responsável.';
  }

  async function entrar(email, senha) {
    configurar();
    const r = await requisicao('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: senha }) }, false);
    sessao = { access_token: r.access_token, expires_at: r.expires_at || Math.floor(Date.now() / 1000) + r.expires_in, user: { id: r.user.id, email: r.user.email } };
    try { await atualizarStatus(); }
    catch (e) { limpar(); throw e; }
  }

  async function sair() {
    try { if (sessao) await requisicao('/auth/v1/logout', { method: 'POST' }); }
    finally { limpar(); }
  }

  async function listarSolicitacoes() {
    try { return await requisicao('/rest/v1/admin_solicitacoes?select=id,email,status,paginas,ativo,criado_em&order=criado_em.asc'); }
    catch (e) { return requisicao('/rest/v1/admin_solicitacoes?select=id,email,status,paginas,criado_em&order=criado_em.asc'); }
  }

  async function decidir(id, aprovar) {
    await requisicao('/rest/v1/admin_solicitacoes?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: aprovar ? 'aprovado' : 'recusado', decidido_em: new Date().toISOString(), decidido_por: sessao.user.id })
    });
  }

  async function definirPaginas(id, paginas) {
    await requisicao('/rest/v1/admin_solicitacoes?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ paginas })
    });
  }

  async function definirAtivo(id, ativo) {
    await requisicao('/rest/v1/admin_solicitacoes?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ativo })
    });
  }

  async function cadastrarUsuario(email, senha) {
    const r = await requisicao('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password: senha }) }, false);
    const id = (r && r.user && r.user.id) || (r && r.id);
    if (!id) throw new Error('O banco não retornou o cadastro criado. Tente novamente.');
    await decidir(id, true);
    return id;
  }

  async function redefinirSenha(email) {
    await requisicao('/auth/v1/recover', { method: 'POST', body: JSON.stringify({ email }) }, false);
  }

  async function chamarAdminPHP(acao, dados) {
    if (!sessao) throw new Error('Entre novamente para continuar.');
    let resposta;
    try {
      resposta = await fetch('../admin_usuarios.php', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token },
        body: JSON.stringify({ acao, ...dados })
      });
    } catch (e) { throw new Error('Sem conexão com o servidor. Tente novamente.'); }
    let corpo = null;
    try { corpo = await resposta.json(); } catch (e) {}
    if (!resposta.ok || !corpo || corpo.ok !== true) throw new Error((corpo && corpo.erro) || 'Não foi possível concluir a operação (' + resposta.status + ').');
    return corpo;
  }
  async function excluirUsuario(id) { await chamarAdminPHP('excluir', { id }); }
  async function editarEmail(id, email) { await chamarAdminPHP('editar_email', { id, email }); }

  window.ADMIN_AUTH = {
    online, RESPONSAVEL_EMAIL, PAGINAS_PADRAO,
    cadastrar, entrar, sair, listarSolicitacoes, decidir, definirPaginas, definirAtivo,
    cadastrarUsuario, redefinirSenha, excluirUsuario, editarEmail,
    sessaoAtual: () => sessao,
    papel: () => sessao ? sessao.papel : null,
    liberado: () => Boolean(sessao) && (sessao.papel === 'responsavel' || (sessao.papel === 'aprovado' && sessao.ativo !== false)),
    podeAcessar: (chave) => {
      if (!sessao) return false;
      if (sessao.papel === 'responsavel') return true;
      if (sessao.papel !== 'aprovado' || sessao.ativo === false) return false;
      return Array.isArray(sessao.paginas) && sessao.paginas.indexOf(chave) !== -1;
    }
  };

  if (online) {
    try { sessao = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch (e) { sessao = null; }
    if (sessao) atualizarStatus().catch(() => limpar());
  }
})();
