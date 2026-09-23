/* Login de Admin com aprovação. Usa o mesmo projeto Supabase configurado em
   banco-config.js. Só quem foi aprovado por RESPONSAVEL_EMAIL tem acesso;
   esse e-mail em si é sempre reconhecido como responsável, sem precisar de
   aprovação, "paginas" liberadas nem estar "ativo" — ele sempre vê tudo. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const RESPONSAVEL_EMAIL = 'root@root.com';
  const PAGINAS_PADRAO = ['eleicoes', 'dashboards'];
  // Liberadas para toda conta aprovada e ativa, marcadas ou não em Acessos.
  const SEMPRE_LIBERADAS = ['eleicoes'];
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

  /* Registro de auditoria (database/log-eventos.sql). Nunca deve travar a
     ação que está sendo registrada: falha em silêncio (só um aviso no
     console) se o banco não tiver a tabela ou a pessoa estiver offline. */
  async function registrarEvento(acao, modulo, descricao, detalhes) {
    if (!online) return;
    var usuario = sessao && sessao.user;
    if (!usuario) return;
    // A página de onde veio a ação — é o que a página de logs usa para
    // agrupar por página junto com a navegação de js/rastreio.js.
    detalhes = Object.assign({ pagina: location.pathname.split('/').pop() || 'index.html' }, detalhes || {});
    try {
      await requisicao('/rest/v1/log_eventos', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          usuario_id: usuario.id, usuario_email: usuario.email,
          acao: acao, modulo: modulo, descricao: descricao,
          detalhes: detalhes
        })
      }, true);
    } catch (e) { console.warn('Não foi possível registrar o evento de auditoria:', e.message); }
  }

  // Só o responsável enxerga (política "Responsavel le todos os eventos").
  async function listarEventos(filtros) {
    filtros = filtros || {};
    var params = ['select=*', 'order=criado_em.desc', 'limit=' + (filtros.limite || 200)];
    if (filtros.modulo) params.push('modulo=eq.' + encodeURIComponent(filtros.modulo));
    if (filtros.acao) params.push('acao=eq.' + encodeURIComponent(filtros.acao));
    if (filtros.usuarioEmail) params.push('usuario_email=ilike.*' + encodeURIComponent(filtros.usuarioEmail) + '*');
    if (filtros.usuario) params.push('usuario_email=eq.' + encodeURIComponent(filtros.usuario));
    if (filtros.semUsuario) params.push('usuario_email=neq.' + encodeURIComponent(filtros.semUsuario));
    if (filtros.pagina) params.push('detalhes->>pagina=eq.' + encodeURIComponent(filtros.pagina));
    if (filtros.desde) params.push('criado_em=gte.' + encodeURIComponent(filtros.desde));
    if (filtros.ate) params.push('criado_em=lte.' + encodeURIComponent(filtros.ate));
    return requisicao('/rest/v1/log_eventos?' + params.join('&'));
  }

  /* Resumo agrupado (função log_eventos_resumo, database/log-eventos-navegacao.sql).
     agrupar: 'pessoa' | 'acao' | 'modulo' | 'pagina' | 'pessoa_acao' | 'pessoa_pagina'. */
  async function resumirEventos(agrupar, filtros) {
    filtros = filtros || {};
    return requisicao('/rest/v1/rpc/log_eventos_resumo', {
      method: 'POST',
      body: JSON.stringify({
        p_agrupar: agrupar, p_desde: filtros.desde || null, p_ate: filtros.ate || null,
        p_modulo: filtros.modulo || null, p_acao: filtros.acao || null, p_usuario: filtros.usuario || null,
        p_pagina: filtros.pagina || null, p_sem_usuario: filtros.semUsuario || null
      })
    });
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
    registrarEvento('login', 'acesso', 'Entrou no sistema');
  }

  async function sair() {
    try {
      if (sessao) { registrarEvento('logout', 'acesso', 'Saiu do sistema'); await requisicao('/auth/v1/logout', { method: 'POST' }); }
    }
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

  // Ações que exigem a service_role rodam no servidor: primeiro na Edge
  // Function admin-usuarios do Supabase (funciona no GitHub Pages); se ela
  // ainda não foi publicada, cai pro admin_usuarios.php (só no XAMPP).
  async function chamarServidor(acao, dados, token) {
    const corpoEnvio = JSON.stringify({ acao, ...dados });
    let resposta = null;
    try {
      configurar();
      resposta = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/admin-usuarios', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: corpoEnvio
      });
      if (resposta.status === 404) resposta = null;
    } catch (e) { resposta = null; }
    if (!resposta) {
      try {
        resposta = await fetch('../admin_usuarios.php', {
          method: 'POST', signal: AbortSignal.timeout(20000),
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
          body: corpoEnvio
        });
      } catch (e) { throw new Error('Sem conexão com o servidor. Tente novamente.'); }
    }
    let corpo = null;
    try { corpo = await resposta.json(); } catch (e) {}
    if (!resposta.ok || !corpo || corpo.ok !== true) {
      if (!corpo && (resposta.status === 404 || resposta.status === 405)) throw new Error('A função admin-usuarios ainda não foi publicada no Supabase. Veja database/CONFIGURAR-ADMIN.md.');
      throw new Error((corpo && corpo.erro) || 'Não foi possível concluir a operação (' + resposta.status + ').');
    }
    return corpo;
  }

  function chamarPHPPublico(acao, dados) { return chamarServidor(acao, dados, null); }

  async function cadastrarConta(nome, sobrenome, senha) {
    const login = gerarLogin(nome, sobrenome);
    const email = login + '@' + DOMINIO_USUARIO;
    await chamarPHPPublico('autocadastro', { email, senha });
    await entrar(login, senha);
    registrarEvento('cadastro', 'usuarios', 'Solicitou acesso ao sistema (login ' + login + ')');
    return login;
  }

  async function cadastrarUsuario(nome, sobrenome, senha) {
    const login = gerarLogin(nome, sobrenome);
    const email = login + '@' + DOMINIO_USUARIO;
    const r = await chamarAdminPHP('criar_usuario', { email, senha: senha || SENHA_PADRAO });
    if (!r.id) throw new Error('O servidor não retornou o cadastro criado. Tente novamente.');
    // Se o servidor avisou que não conseguiu gravar em admin_solicitacoes, a
    // conta existe no Supabase mas ainda não tem o que aprovar aqui — não
    // adianta tentar aprovar/marcar senha de uma linha que não existe.
    if (r.aviso) return { login, aviso: r.aviso };
    await decidir(r.id, true);
    try { await definirDeveTrocarSenha(r.id, true); } catch (e) {}
    registrarEvento('criar', 'usuarios', 'Cadastrou o usuário ' + login);
    return { login };
  }

  async function redefinirSenha(email) {
    await requisicao('/auth/v1/recover', { method: 'POST', body: JSON.stringify({ email }) }, false);
  }

  async function alterarPropriaSenha(novaSenha) {
    await requisicao('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: novaSenha }) });
    try { await requisicao('/rest/v1/rpc/confirmar_troca_senha', { method: 'POST', body: '{}' }); } catch (e) {}
    if (sessao) { sessao.deveTrocarSenha = false; sessionStorage.setItem(sessionKey, JSON.stringify(sessao)); avisar(); }
    registrarEvento('trocar_senha', 'usuarios', 'Alterou a própria senha');
  }

  async function chamarAdminPHP(acao, dados) {
    if (!sessao) throw new Error('Entre novamente para continuar.');
    return chamarServidor(acao, dados, sessao.access_token);
  }
  async function excluirUsuario(id) { await chamarAdminPHP('excluir', { id }); }
  async function editarEmail(id, email) { await chamarAdminPHP('editar_email', { id, email }); }
  async function redefinirSenhaPadrao(id) { await chamarAdminPHP('redefinir_senha', { id }); }

  window.ADMIN_AUTH = {
    online, RESPONSAVEL_EMAIL, PAGINAS_PADRAO, SEMPRE_LIBERADAS, SENHA_PADRAO,
    cadastrarConta, entrar, sair, listarSolicitacoes, decidir, definirPaginas, definirAtivo, previewLogin,
    cadastrarUsuario, redefinirSenha, redefinirSenhaPadrao, excluirUsuario, editarEmail, alterarPropriaSenha,
    registrarEvento, listarEventos, resumirEventos,
    sessaoAtual: () => sessao,
    papel: () => sessao ? sessao.papel : null,
    liberado: () => Boolean(sessao) && (sessao.papel === 'responsavel' || (sessao.papel === 'aprovado' && sessao.ativo !== false)),
    deveTrocarSenha: () => Boolean(sessao) && Boolean(sessao.deveTrocarSenha),
    podeAcessar: (chave) => {
      if (!sessao) return false;
      if (sessao.papel === 'responsavel') return true;
      if (sessao.papel !== 'aprovado' || sessao.ativo === false) return false;
      if (SEMPRE_LIBERADAS.indexOf(chave) !== -1) return true;
      return Array.isArray(sessao.paginas) && sessao.paginas.indexOf(chave) !== -1;
    }
  };

  if (online) {
    try { sessao = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch (e) { sessao = null; }
    if (sessao) atualizarStatus().catch(() => limpar());
  }
})();
