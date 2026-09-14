/* Login de Admin com aprovação. Usa o mesmo projeto Supabase configurado em
   banco-config.js. Só quem foi aprovado por RESPONSAVEL_EMAIL tem acesso;
   esse e-mail em si é sempre reconhecido como responsável, sem precisar de
   aprovação, "paginas" liberadas nem estar "ativo" — ele sempre vê tudo. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const RESPONSAVEL_EMAIL = 'luansobraldourado5@gmail.com';
  const PAGINAS_PADRAO = ['eleicoes', 'dashboards'];
  const SENHA_PADRAO = '123456';
  const DOMINIO_USUARIO = 'sistema.local';
  const online = Boolean(cfg.url || cfg.chavePublica);
  const sessionKey = 'seagri_admin_sessao:' + cfg.url;
  let sessao = null;
  const avisar = () => window.dispatchEvent(new Event('admin-auth-atualizado'));

  // Contas cadastradas pelo responsável usam nome.sobrenome como login, sem
  // e-mail de verdade por trás — normaliza pra um endereço válido (mesmo
  // domínio sempre) só pra satisfazer o formato que o Supabase Auth exige.
  function normalizarParte(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
  function gerarLogin(nome, sobrenome) {
    const n = normalizarParte(nome), s = normalizarParte(sobrenome);
    if (!n || !s) throw new Error('Informe nome e sobrenome.');
    return n + '.' + s;
  }
  // Pra pré-visualizar o login enquanto a pessoa digita, sem travar em campo
  // incompleto (ao contrário de gerarLogin, que exige nome e sobrenome).
  function previewLogin(nome, sobrenome) {
    const n = normalizarParte(nome), s = normalizarParte(sobrenome);
    return n && s ? n + '.' + s : (n || s || '');
  }
  function normalizarEmailLogin(valor) {
    valor = (valor || '').trim();
    return valor.indexOf('@') !== -1 ? valor : valor.toLowerCase() + '@' + DOMINIO_USUARIO;
  }

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
        resposta.status === 429 ? 'O Supabase limitou o envio de e-mails por agora (muitos cadastros/redefinições em pouco tempo). Espere um pouco e tente de novo, ou configure um SMTP próprio em Authentication > Settings.' :
        'O banco não concluiu a operação (' + resposta.status + (motivo ? ': ' + motivo : '') + '). Tente novamente.'
      );
    }
    const texto = await resposta.text(); return texto ? JSON.parse(texto) : null;
  }

  function ehResponsavel(email) {
    return (email || '').toLowerCase() === RESPONSAVEL_EMAIL;
  }

  async function buscarPerfil() {
    if (ehResponsavel(sessao.user.email)) return { papel: 'responsavel', paginas: null, ativo: true, deveTrocarSenha: false };
    // As colunas "ativo" e "deve_trocar_senha" podem não existir ainda (as
    // migrações admin-usuarios.sql/admin-troca-senha.sql não rodaram) — cai
    // pra uma seleção mais simples em vez de travar o login.
    const tentativas = ['status,paginas,ativo,deve_trocar_senha', 'status,paginas,ativo', 'status,paginas'];
    let linha, erro;
    for (let i = 0; i < tentativas.length; i++) {
      try {
        linha = (await requisicao('/rest/v1/admin_solicitacoes?select=' + tentativas[i] + '&id=eq.' + encodeURIComponent(sessao.user.id)))[0];
        erro = null; break;
      } catch (e) { erro = e; }
    }
    if (erro) throw erro;
    return {
      papel: (linha && linha.status) || 'pendente',
      paginas: (linha && linha.paginas) || PAGINAS_PADRAO,
      ativo: !(linha && linha.ativo === false),
      deveTrocarSenha: Boolean(linha && linha.deve_trocar_senha)
    };
  }

  async function atualizarStatus() {
    if (!sessao) return;
    const perfil = await buscarPerfil();
    sessao.papel = perfil.papel;
    sessao.paginas = perfil.paginas;
    sessao.ativo = perfil.ativo;
    sessao.deveTrocarSenha = perfil.deveTrocarSenha;
    sessionStorage.setItem(sessionKey, JSON.stringify(sessao));
    avisar();
  }

  async function entrar(login, senha) {
    configurar();
    const email = normalizarEmailLogin(login);
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

  async function definirDeveTrocarSenha(id, valor) {
    await requisicao('/rest/v1/admin_solicitacoes?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ deve_trocar_senha: valor })
    });
  }

  async function chamarPHPPublico(acao, dados) {
    let resposta;
    try {
      resposta = await fetch('../admin_usuarios.php', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, ...dados })
      });
    } catch (e) { throw new Error('Sem conexão com o servidor. Tente novamente.'); }
    let corpo = null;
    try { corpo = await resposta.json(); } catch (e) {}
    if (!resposta.ok || !corpo || corpo.ok !== true) throw new Error((corpo && corpo.erro) || 'Não foi possível concluir a operação (' + resposta.status + ').');
    return corpo;
  }

  async function cadastrarConta(nome, sobrenome, senha) {
    const login = gerarLogin(nome, sobrenome);
    const email = login + '@' + DOMINIO_USUARIO;
    await chamarPHPPublico('autocadastro', { email, senha });
    await entrar(login, senha);
    return login;
  }

  async function cadastrarUsuario(nome, sobrenome, senha) {
    const login = gerarLogin(nome, sobrenome);
    const email = login + '@' + DOMINIO_USUARIO;
    const r = await chamarAdminPHP('criar_usuario', { email, senha: senha || SENHA_PADRAO });
    if (!r.id) throw new Error('O servidor não retornou o cadastro criado. Tente novamente.');
    await decidir(r.id, true);
    try { await definirDeveTrocarSenha(r.id, true); } catch (e) {}
    return login;
  }

  async function redefinirSenha(email) {
    await requisicao('/auth/v1/recover', { method: 'POST', body: JSON.stringify({ email }) }, false);
  }

  async function alterarPropriaSenha(novaSenha) {
    await requisicao('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: novaSenha }) });
    try { await requisicao('/rest/v1/rpc/confirmar_troca_senha', { method: 'POST', body: '{}' }); } catch (e) {}
    if (sessao) { sessao.deveTrocarSenha = false; sessionStorage.setItem(sessionKey, JSON.stringify(sessao)); avisar(); }
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
    online, RESPONSAVEL_EMAIL, PAGINAS_PADRAO, SENHA_PADRAO,
    cadastrarConta, entrar, sair, listarSolicitacoes, decidir, definirPaginas, definirAtivo, previewLogin,
    cadastrarUsuario, redefinirSenha, excluirUsuario, editarEmail, alterarPropriaSenha,
    sessaoAtual: () => sessao,
    papel: () => sessao ? sessao.papel : null,
    liberado: () => Boolean(sessao) && (sessao.papel === 'responsavel' || (sessao.papel === 'aprovado' && sessao.ativo !== false)),
    deveTrocarSenha: () => Boolean(sessao) && Boolean(sessao.deveTrocarSenha),
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
