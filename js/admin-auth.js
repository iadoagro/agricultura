/* Login de Admin com aprovação. Usa o mesmo projeto Supabase configurado em
   banco-config.js. Só quem foi aprovado por RESPONSAVEL_EMAIL tem acesso;
   esse e-mail em si é sempre reconhecido como responsável, sem precisar de
   aprovação, "paginas" liberadas nem estar "ativo" — ele sempre vê tudo. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const RESPONSAVEL_EMAIL = 'root@root.com';
  const PAGINAS_PADRAO = [];   // conta nova: nenhum acesso; o responsável libera em Usuários
  // Nenhuma página é liberada automaticamente: só as marcadas em Acessos.
  const SEMPRE_LIBERADAS = [];
  const SENHA_PADRAO = '123456';
  const DOMINIO_USUARIO = 'sistema.local';
  const online = Boolean(cfg.url || cfg.chavePublica);
  // AbortSignal.timeout não existe em navegadores mais antigos (iOS Safari <16,
  // Android/Samsung Internet mais velhos): nesses aparelhos a chamada quebrava
  // na hora de montar o fetch e caía no catch como "Sem conexão", mesmo com
  // internet normal. AbortController sozinho tem suporte bem mais antigo.
  function sinalTimeout(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      try { return AbortSignal.timeout(ms); } catch (e) {}
    }
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  }

  // Busca com retentativa. Uma falha de rede pontual (Wi-Fi oscilando, DNS lento, proxy/firewall da rede
  // institucional) não derruba mais a operação: repete (só o que é seguro repetir, op.repetir) quando a
  // requisição nem chegou a ter resposta ou o gateway devolveu 502/503/504. Quando desiste, diz POR QUE
  // (sem internet / demorou demais / rede bloqueando) em vez de um "Sem conexão" genérico.
  function mensagemRede(causa) {
    let host = '';
    try { host = new URL(cfg.url).host; } catch (e) {}
    return causa === 'offline' ? 'Sem conexão com a internet. Confira o Wi-Fi ou o cabo de rede e tente novamente.' :
      causa === 'tempo' ? 'Sem conexão com o banco: a resposta demorou demais (internet lenta ou instável). Tente novamente.' :
      'Sem conexão com o banco. Verifique a internet ou se a rede bloqueia ' + (host || 'o endereço do banco') + '. Tente novamente.';
  }
  async function buscarRede(url, init, op) {
    op = op || {};
    let max = op.repetir ? (op.tentativas || 3) : 1, causa = 'rede';
    for (let t = 1; t <= max; t++) {
      try {
        const r = await fetch(url, { ...init, signal: sinalTimeout(op.timeout || 20000) });
        if (op.repetir && t < max && (r.status === 502 || r.status === 503 || r.status === 504)) {
          await new Promise(function (ok) { setTimeout(ok, 700 * t); });
          continue;
        }
        return r;
      } catch (e) {
        causa = e && (e.name === 'AbortError' || e.name === 'TimeoutError') ? 'tempo' : 'rede';
        console.warn('Falha de rede (' + causa + ', tentativa ' + t + '/' + max + '):', e && e.name, e && e.message);
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { causa = 'offline'; break; }
        if (causa === 'tempo') max = Math.min(max, 2);   // internet lenta: não prende a pessoa por minutos
        if (t < max) await new Promise(function (ok) { setTimeout(ok, 700 * t); });
      }
    }
    const erro = new Error(mensagemRede(causa)); erro.rede = true; throw erro;
  }
  const sessionKey = 'seagri_admin_sessao:' + cfg.url;
  let sessao = null;
  const avisar = () => window.dispatchEvent(new Event('admin-auth-atualizado'));

  // Contas cadastradas pelo responsável usam nome.sobrenome como login, sem
  // e-mail de verdade por trás — normaliza pra um endereço válido (mesmo
  // domínio sempre) só pra satisfazer o formato que o Supabase Auth exige.
  // Só letras (sem acento, sem hífen, sem número). Nome e sobrenome com várias
  // palavras ("Silva Souza") viram uma lista de palavras: o login usa a primeira
  // combinação livre (ver candidatosLogin).
  function palavras(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .split(/[^a-z]+/).filter(Boolean);
  }
  // nome.sobrenome na ordem: 1º nome com cada sobrenome, depois os outros nomes
  function candidatosLogin(nome, sobrenome) {
    const PARTICULAS = ['da', 'de', 'do', 'das', 'dos', 'e'];   // "da Silva" → silva
    const sem = l => { const f = l.filter(w => PARTICULAS.indexOf(w) < 0); return f.length ? f : l; };
    const ns = sem(palavras(nome)), ss = sem(palavras(sobrenome)), r = [];
    ns.forEach(n => ss.forEach(s => r.push(n + '.' + s)));
    return r;
  }
  function gerarLogin(nome, sobrenome) {
    const c = candidatosLogin(nome, sobrenome);
    if (!c.length) throw new Error('Informe nome e sobrenome (só letras).');
    return c[0];
  }
  // Pra pré-visualizar o login enquanto a pessoa digita, sem travar em campo
  // incompleto (ao contrário de gerarLogin, que exige nome e sobrenome).
  function previewLogin(nome, sobrenome) {
    const c = candidatosLogin(nome, sobrenome);
    return c.length ? c[0] : (palavras(nome)[0] || palavras(sobrenome)[0] || '');
  }
  function normalizarEmailLogin(valor) {
    valor = (valor || '').trim();
    if (valor.toLowerCase() === 'root') return RESPONSAVEL_EMAIL;   // o login só aceita letras: "root" entra como o responsável
    return valor.indexOf('@') !== -1 ? valor : valor.toLowerCase() + '@' + DOMINIO_USUARIO;
  }

  function configurar() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url || '') || !/^sb_publishable_/.test(cfg.chavePublica || '')) throw new Error('A configuração do banco online está incompleta.');
  }
  const chaveEmail = 'seagri_ultimo_email:' + cfg.url;
  function limpar() {
    clearTimeout(timerRenovar);
    if (sessao && sessao.user && sessao.user.email) { try { sessionStorage.setItem(chaveEmail, sessao.user.email); } catch (e) {} }
    sessao = null;
    sessionStorage.removeItem(sessionKey); avisar();
  }
  // Pedidos que podem ser repetidos sem efeito colateral (leituras e login/logout/consultas de status).
  const REPETIVEIS = /^\/(auth\/v1\/(token|logout)|rest\/v1\/rpc\/(pin_situacao|login_status|login_sucesso))(\?|$)/;
  async function requisicao(caminho, options = {}, autenticada = true, jaRenovou = false, rede = null) {
    configurar();
    if (autenticada && sessao && venceEmBreve()) await renovar().catch(() => {});
    if (autenticada && (!sessao || sessao.expires_at * 1000 <= Date.now())) {
      limpar(); throw new Error('Entre novamente para continuar.');
    }
    let resposta;
    const metodo = String(options.method || 'GET').toUpperCase();
    try {
      resposta = await buscarRede(cfg.url.replace(/\/$/, '') + caminho, {
        ...options,
        headers: {
          apikey: cfg.chavePublica, 'Content-Type': 'application/json',
          ...(autenticada ? { Authorization: 'Bearer ' + sessao.access_token } : {}), ...options.headers
        }
      }, Object.assign({ repetir: metodo === 'GET' || metodo === 'HEAD' || REPETIVEIS.test(caminho) }, rede));
    } catch (e) {
      if (e && e.rede) throw e;
      console.warn('Erro ao montar a requisição ao banco:', e);   // não é rede: não finge que é
      throw new Error('Não foi possível enviar o pedido ao banco (' + ((e && e.message) || 'erro inesperado') + ').');
    }
    if (!resposta.ok) {
      if (resposta.status === 401 && autenticada) {
        // token recusado (vencido, relógio atrasado): renova e repete uma vez antes de derrubar a sessão
        if (!jaRenovou && sessao && sessao.refresh_token) {
          try {
            sessao.expires_at = 0;   // força a troca mesmo que o relógio ache o token válido
            await renovar();
            return requisicao(caminho, options, autenticada, true, rede);
          } catch (e) { /* cai no limpar() abaixo */ }
        }
        limpar();
      }
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

  /* ------------------------------------------------ renovação da sessão
     O token do Supabase vale 1 h. Sem renovar, quem passava mais que isso
     numa página (preenchendo fichas de mecanização, cadastrando fiscais…)
     recebia "sessão expirou" ao salvar e, ao recarregar, perdia o que tinha
     digitado. Agora o refresh_token troca o token antes de vencer: por
     timer, ao voltar pra aba (o timer não roda com o computador dormindo)
     e antes de qualquer requisição. O objeto "sessao" é atualizado no
     lugar, então quem guardou a referência (sessaoAtual()) já enxerga o
     token novo.
     Várias abas do mesmo login: cada aba tem a sua cópia em sessionStorage,
     e o Supabase invalida um refresh_token já usado. Por isso o par mais
     novo também fica em localStorage (chave por usuário): antes de renovar,
     a aba adota o par de outra aba se ele for mais novo que o dela. */
  const MARGEM_RENOVAR = 120;   // segundos antes de vencer
  const chaveCompartilhada = () => 'seagri_admin_renovacao:' + cfg.url + ':' + ((sessao && sessao.user && sessao.user.id) || '');
  let renovando = null, timerRenovar = null;

  function venceEmBreve() {
    return Boolean(sessao) && sessao.expires_at - Date.now() / 1000 < MARGEM_RENOVAR;
  }
  function gravarSessao() {
    try { sessionStorage.setItem(sessionKey, JSON.stringify(sessao)); } catch (e) {}
    try {
      if (sessao && sessao.refresh_token) {
        localStorage.setItem(chaveCompartilhada(), JSON.stringify({ access_token: sessao.access_token, refresh_token: sessao.refresh_token, expires_at: sessao.expires_at }));
      }
    } catch (e) { /* modo privado */ }
  }
  function adotarDeOutraAba() {
    try {
      const outro = JSON.parse(localStorage.getItem(chaveCompartilhada()) || 'null');
      if (outro && outro.expires_at > sessao.expires_at && outro.expires_at - Date.now() / 1000 > MARGEM_RENOVAR) {
        Object.assign(sessao, outro);
        try { sessionStorage.setItem(sessionKey, JSON.stringify(sessao)); } catch (e) {}
        return true;
      }
    } catch (e) {}
    return false;
  }
  async function renovar() {
    if (!sessao) throw new Error('Entre novamente para continuar.');
    if (adotarDeOutraAba()) { agendarRenovacao(); return sessao; }
    if (!sessao.refresh_token) throw new Error('Entre novamente para continuar.');   // login feito antes desta versão
    if (!renovando) {
      renovando = (async () => {
        let resposta = null;
        // rede que acabou de voltar (computador acordando, Wi-Fi caindo): tenta até 3 vezes
        for (let t = 0; t < 3 && !resposta; t++) {
          try {
            resposta = await fetch(cfg.url.replace(/\/$/, '') + '/auth/v1/token?grant_type=refresh_token', {
              method: 'POST', signal: sinalTimeout(20000),
              headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: sessao.refresh_token })
            });
          } catch (e) {
            if (t < 2) await new Promise(function (ok) { setTimeout(ok, 1500 * (t + 1)); });
          }
        }
        if (!resposta) throw new Error(mensagemRede(navigator.onLine === false ? 'offline' : 'rede'));
        const r = await resposta.json().catch(() => null);
        if (!resposta.ok || !r || !r.access_token) {
          // outra aba pode ter acabado de usar este refresh_token
          if (adotarDeOutraAba()) return sessao;
          throw new Error('Sua sessão expirou. Entre novamente.');
        }
        sessao.access_token = r.access_token;
        sessao.refresh_token = r.refresh_token || sessao.refresh_token;
        sessao.expires_at = r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600);
        gravarSessao();
        return sessao;
      })().finally(() => { renovando = null; agendarRenovacao(); });
    }
    return renovando;
  }
  function agendarRenovacao() {
    clearTimeout(timerRenovar);
    if (!sessao || !sessao.refresh_token) return;
    const espera = Math.max(5, sessao.expires_at - Date.now() / 1000 - MARGEM_RENOVAR);
    timerRenovar = setTimeout(() => { renovar().catch(() => {}); }, espera * 1000);
  }
  /** Para quem manda o token por conta própria (lancamento-*.js etc.):
      devolve a sessão com um token que ainda vale, renovando se preciso. */
  async function garantirSessao() {
    if (!sessao) return null;
    if (venceEmBreve()) { try { await renovar(); } catch (e) { /* devolve a que tem */ } }
    return sessao;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && venceEmBreve()) renovar().catch(() => {});
  });
  window.addEventListener('online', () => { if (venceEmBreve()) renovar().catch(() => {}); });

  /** Último recurso quando a renovação não é possível (refresh_token revogado
      ou vencido): entra de novo com a senha, SEM recarregar a página, para a
      ficha preenchida não se perder. Devolve a sessão nova. */
  async function reautenticar(senha) {
    configurar();
    let email = sessao && sessao.user && sessao.user.email;
    if (!email) { try { email = sessionStorage.getItem(chaveEmail); } catch (e) {} }
    if (!email) throw new Error('Entre novamente para continuar.');
    let r;
    try { r = await requisicao('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: senha }) }, false); }
    catch (e) { throw new Error(e.message === 'Confira o e-mail e a senha.' ? 'Senha incorreta.' : e.message); }
    const anterior = sessao || {};
    sessao = Object.assign({}, anterior, {
      access_token: r.access_token, refresh_token: r.refresh_token,
      expires_at: r.expires_at || Math.floor(Date.now() / 1000) + r.expires_in,
      user: { id: r.user.id, email: r.user.email }
    });
    gravarSessao();
    agendarRenovacao();
    if (!anterior.papel) { try { await atualizarStatus(); } catch (e) {} }
    avisar();
    return sessao;
  }
  function emailLembrado() {
    if (sessao && sessao.user && sessao.user.email) return sessao.user.email;
    try { return sessionStorage.getItem(chaveEmail) || ''; } catch (e) { return ''; }
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
    // Navegador, sistema, aparelho, tela... (js/ambiente-cliente.js); o IP o banco põe.
    var amb = {};
    if (window.AMBIENTE_CLIENTE) {
      await window.AMBIENTE_CLIENTE.pronto;
      amb = window.AMBIENTE_CLIENTE.coletar();
      // posição do aparelho, só se a pessoa já permitiu (nunca pergunta daqui)
      var geo = await window.AMBIENTE_CLIENTE.posicao().catch(function () { return null; });
      if (geo) amb.geo = geo;
    }
    detalhes = Object.assign({ pagina: location.pathname.split('/').pop() || 'index.html' }, amb, detalhes || {});
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
    if (filtros.comGeo) params.push('detalhes->geo=not.is.null');   // só eventos com a posição do aparelho
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

  /* Cidade, estado e provedor de cada IP (função ip_localizar,
     database/log-eventos-localizacao.sql) — só o responsável. */
  async function localizarIPs(ips) {
    return requisicao('/rest/v1/rpc/ip_localizar', { method: 'POST', body: JSON.stringify({ p_ips: ips }) });
  }

  /* Locais conhecidos: nome dado a um IP fixo (ip_nomes, database/ip-nomes.sql). */
  async function listarNomesIP() {
    return requisicao('/rest/v1/ip_nomes?select=ip,nome&order=nome');
  }
  async function salvarNomeIP(ip, nome) {
    return requisicao('/rest/v1/ip_nomes?on_conflict=ip', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ip: ip, nome: nome, atualizado_em: new Date().toISOString() })
    });
  }
  async function removerNomeIP(ip) {
    return requisicao('/rest/v1/ip_nomes?ip=eq.' + encodeURIComponent(ip), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }

  /* Alertas de segurança (log_alertas, database/log-alertas.sql) — gerados
     pelo banco; aqui só se lê e marca como visto. Só o responsável. */
  async function listarAlertas(filtros) {
    filtros = filtros || {};
    var params = ['select=*', 'order=criado_em.desc', 'limit=' + (filtros.limite || 50)];
    if (!filtros.incluirVistos) params.push('visto=is.false');
    if (filtros.usuario) params.push('usuario_email=eq.' + encodeURIComponent(filtros.usuario));
    if (filtros.semUsuario) params.push('usuario_email=neq.' + encodeURIComponent(filtros.semUsuario));
    return requisicao('/rest/v1/log_alertas?' + params.join('&'));
  }
  async function contarAlertasNaoVistos(filtros) {
    filtros = filtros || {};
    var params = ['select=id', 'visto=is.false', 'limit=1000'];
    if (filtros.usuario) params.push('usuario_email=eq.' + encodeURIComponent(filtros.usuario));
    if (filtros.semUsuario) params.push('usuario_email=neq.' + encodeURIComponent(filtros.semUsuario));
    var r = await requisicao('/rest/v1/log_alertas?' + params.join('&'));
    return (r || []).length;
  }
  // ids: lista de ids, ou null para todos os não vistos (dentro de filtros)
  async function marcarAlertasVistos(ids, filtros) {
    filtros = filtros || {};
    var params = ids ? ['id=in.(' + ids.map(Number).join(',') + ')'] : ['visto=is.false'];
    if (!ids && filtros.usuario) params.push('usuario_email=eq.' + encodeURIComponent(filtros.usuario));
    if (!ids && filtros.semUsuario) params.push('usuario_email=neq.' + encodeURIComponent(filtros.semUsuario));
    return requisicao('/rest/v1/log_alertas?' + params.join('&'), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ visto: true })
    });
  }

  /* Convite pra cadastrar PIN (database/acesso-pin.sql): { usaPin, naoPerguntar,
     entradas, recusas } da conta logada; null se a tabela não existe. O convite
     só vem a partir da 2ª entrada e some na 5ª recusa (MAX_RECUSAS_PIN). */
  const MAX_RECUSAS_PIN = 5;
  async function statusPin() {
    if (!sessao) return null;
    try {
      const r = await requisicao('/rest/v1/acesso_pin?select=usa_pin,nao_perguntar,entradas,recusas&usuario_id=eq.' + encodeURIComponent(sessao.user.id));
      const l = (r || [])[0] || {};
      return { usaPin: Boolean(l.usa_pin), naoPerguntar: Boolean(l.nao_perguntar), entradas: l.entradas || 0, recusas: l.recusas || 0 };
    } catch (e) { return null; }
  }
  // Tela de login (sem sessão): { tem_pin, motivo } da conta digitada (database/acesso-pin.sql, pin_situacao)
  async function pinSituacao(login) {
    return requisicao('/rest/v1/rpc/pin_situacao', { method: 'POST', body: JSON.stringify({ p_email: normalizarEmailLogin(login) }) }, false, false, { tentativas: 2, timeout: 8000 });
  }
  async function pinRegistrarEntrada() { await requisicao('/rest/v1/rpc/pin_registrar_entrada', { method: 'POST', body: '{}' }); }
  async function pinRecusar() { return requisicao('/rest/v1/rpc/pin_recusar', { method: 'POST', body: '{}' }); }
  // Root: contas que recusaram o convite 5 vezes → { [usuario_id]: recusas }
  async function listarPinBloqueados() {
    try {
      const r = await requisicao('/rest/v1/acesso_pin?select=usuario_id,recusas&nao_perguntar=is.true');
      const m = {};
      (r || []).forEach(function (l) { m[l.usuario_id] = l.recusas; });
      return m;
    } catch (e) { return {}; }
  }
  /* ---- bloqueio após 3 senhas erradas (database/login-bloqueio.sql) ----
     Tela de login (sem sessão): a conta digitada já está bloqueada? { bloqueado }
     e registro de uma senha errada → { existe, bloqueado, restantes }. Root: pedidos de reset e liberação. */
  async function loginStatus(login) {
    return requisicao('/rest/v1/rpc/login_status', { method: 'POST', body: JSON.stringify({ p_email: normalizarEmailLogin(login) }) }, false, false, { tentativas: 2, timeout: 8000 });
  }
  async function loginFalhou(login) {
    return requisicao('/rest/v1/rpc/login_falhou', { method: 'POST', body: JSON.stringify({ p_email: normalizarEmailLogin(login) }) }, false);
  }
  // Root: contas bloqueadas esperando aprovação do reset → [{ usuario_id, email, bloqueado_em }]
  async function listarPedidosReset() {
    try { return (await requisicao('/rest/v1/senha_bloqueios?select=usuario_id,email,bloqueado_em&reset_pendente=is.true&order=bloqueado_em.asc')) || []; }
    catch (e) { return []; }
  }
  async function liberarConta(id) { await requisicao('/rest/v1/rpc/login_liberar', { method: 'POST', body: JSON.stringify({ p_usuario: id }) }); }
  async function pinReexibir(id) {
    await requisicao('/rest/v1/rpc/pin_reexibir', { method: 'POST', body: JSON.stringify({ p_usuario: id }) });
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
    sessao = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at || Math.floor(Date.now() / 1000) + r.expires_in, user: { id: r.user.id, email: r.user.email } };
    gravarSessao();
    agendarRenovacao();
    try { await atualizarStatus(); }
    catch (e) { limpar(); throw e; }
    try { await requisicao('/rest/v1/rpc/login_sucesso', { method: 'POST', body: '{}' }); } catch (e) { /* zera a contagem de erros; sem isso o login segue */ }
    registrarEvento('login', 'acesso', 'Entrou no sistema');
  }

  async function sair() {
    try {
      if (sessao) { registrarEvento('logout', 'acesso', 'Saiu do sistema'); await requisicao('/auth/v1/logout', { method: 'POST' }); }
    }
    finally {
      try { localStorage.removeItem(chaveCompartilhada()); } catch (e) {}
      limpar();
    }
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

  // Ações que exigem a service_role rodam na Edge Function admin-usuarios do Supabase.
  async function chamarServidor(acao, dados, token) {
    const corpoEnvio = JSON.stringify({ acao, ...dados });
    let resposta;
    try {
      configurar();
      resposta = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/admin-usuarios', {
        method: 'POST', signal: sinalTimeout(20000),
        headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: corpoEnvio
      });
    } catch (e) { throw new Error('Sem conexão com o servidor. Tente novamente.'); }
    let corpo = null;
    try { corpo = await resposta.json(); } catch (e) {}
    if (!resposta.ok || !corpo || corpo.ok !== true) {
      if (!corpo && (resposta.status === 404 || resposta.status === 405)) throw new Error('A função admin-usuarios ainda não foi publicada no Supabase. Veja database/CONFIGURAR-ADMIN.md.');
      throw new Error((corpo && corpo.erro) || 'Não foi possível concluir a operação (' + resposta.status + ').');
    }
    return corpo;
  }

  function chamarPHPPublico(acao, dados) { return chamarServidor(acao, dados, null); }

  // Regras de senha (js/senha-regras.js); o servidor confere de novo.
  function exigirSenhaForte(senha) {
    const r = window.SENHA_REGRAS && window.SENHA_REGRAS.avaliar(senha);
    if (r && !r.ok) throw new Error(r.erro);
  }

  async function cadastrarConta(nome, sobrenome, senha) {
    exigirSenhaForte(senha);
    const candidatos = candidatosLogin(nome, sobrenome);
    if (!candidatos.length) throw new Error('Informe nome e sobrenome (só letras).');
    // Se o login já existe, tenta o próximo (outro sobrenome, depois outro nome).
    let login = null;
    for (let i = 0; i < candidatos.length && !login; i++) {
      try { await chamarPHPPublico('autocadastro', { email: candidatos[i] + '@' + DOMINIO_USUARIO, senha }); login = candidatos[i]; }
      catch (e) { if (!/já existe/i.test(e.message) || i === candidatos.length - 1) throw e; }
    }
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

  // Pela função admin-usuarios (ação trocar_propria_senha), que confere a
  // regra de senha no servidor antes de gravar — não direto no Supabase Auth.
  async function alterarPropriaSenha(novaSenha) {
    exigirSenhaForte(novaSenha);
    await chamarAdminPHP('trocar_propria_senha', { senha: novaSenha });
    // trocar a senha encerra as sessões antigas no Supabase (token e refresh_token deixam de valer):
    // entra de novo com a senha nova, senão o próximo salvamento volta "sessão expirou"
    try { await reautenticar(novaSenha); } catch (e) { /* o fluxo de senha pede de novo se precisar */ }
    try { await requisicao('/rest/v1/rpc/confirmar_troca_senha', { method: 'POST', body: '{}' }); } catch (e) {}
    if (sessao) { sessao.deveTrocarSenha = false; sessionStorage.setItem(sessionKey, JSON.stringify(sessao)); avisar(); }
    registrarEvento('trocar_senha', 'usuarios', 'Alterou a própria senha');
  }

  async function chamarAdminPHP(acao, dados) {
    if (!sessao) throw new Error('Entre novamente para continuar.');
    await garantirSessao();
    if (!sessao) throw new Error('Entre novamente para continuar.');
    return chamarServidor(acao, dados, sessao.access_token);
  }
  async function excluirUsuario(id) { await chamarAdminPHP('excluir', { id }); }
  async function editarEmail(id, email) { await chamarAdminPHP('editar_email', { id, email }); }
  // Cadeado da lista de usuários: confere o PIN no servidor e diz se a conta ainda está na senha padrão.
  async function verSenha(id, pin) { return chamarAdminPHP('ver_senha', { id, pin }); }
  // Redefine para a senha padrão e, se a conta estava bloqueada por tentativas, libera o bloqueio e fecha o pedido.
  async function redefinirSenhaPadrao(id) {
    await chamarAdminPHP('redefinir_senha', { id });
    try { await liberarConta(id); }
    catch (e) { throw new Error('A senha foi redefinida, mas não foi possível liberar o bloqueio da conta (' + e.message + '). Tente aprovar de novo.'); }
  }

  window.ADMIN_AUTH = {
    online, RESPONSAVEL_EMAIL, PAGINAS_PADRAO, SEMPRE_LIBERADAS, SENHA_PADRAO,
    cadastrarConta, entrar, sair, listarSolicitacoes, decidir, definirPaginas, definirAtivo, previewLogin,
    cadastrarUsuario, redefinirSenha, redefinirSenhaPadrao, excluirUsuario, editarEmail, verSenha, alterarPropriaSenha,
    registrarEvento, listarEventos, resumirEventos, localizarIPs,
    listarAlertas, contarAlertasNaoVistos, marcarAlertasVistos,
    listarNomesIP, salvarNomeIP, removerNomeIP, statusPin, pinSituacao, loginStatus, loginFalhou, listarPedidosReset, liberarConta, pinRegistrarEntrada, pinRecusar, listarPinBloqueados, pinReexibir, MAX_RECUSAS_PIN,
    sessaoAtual: () => sessao,
    garantirSessao, renovarSessao: renovar, reautenticar, emailLembrado,
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
    if (sessao) {
      (venceEmBreve() && sessao.refresh_token ? renovar().catch(() => {}) : Promise.resolve())
        .then(() => atualizarStatus())
        .then(() => agendarRenovacao())
        .catch(() => limpar());
    }
  }
})();
