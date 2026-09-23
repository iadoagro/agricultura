/* Cadastro auxiliar de Bairros dos Fiscais (tabela fiscais_bairros — ver
   database/fiscais-bairros.sql). Usado pelo formulário de Fiscais
   (js/eleicoes.js), que lista os bairros ativos do município, e pela tela
   de manutenção pages/cadastros-fiscais.html (js/fiscais-bairros.js).

   Bairro digitado num cadastro de fiscal passa por garantir(): se já existe
   (sem diferenciar maiúsculas/acentos/espaços) vale o nome do banco; se
   não existe, é cadastrado.
   Reaproveita a sessão do login do site (admin-auth.js). Sem banco online
   configurado, guarda a lista neste navegador. */
(function () {
  'use strict';
  const cfg = window.BANCO_CONFIG || {};
  const online = Boolean(cfg.url || cfg.chavePublica);
  const localKey = 'seagri_fiscais_bairros_v1';
  let cache = [], carregado = false, indisponivel = false;
  const avisar = () => window.dispatchEvent(new Event('bairros-atualizado'));
  // Mesma regra de public.normalizar_bairro() no banco: ignora maiúsculas,
  // acentos e espaços repetidos ("sao  francisco" = "São Francisco").
  const chaveNome = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const limparNome = s => String(s || '').trim().replace(/\s+/g, ' ');
  const ordenar = l => l.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  function lerLocal() {
    try { const l = JSON.parse(localStorage.getItem(localKey) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function gravarLocal(l) { localStorage.setItem(localKey, JSON.stringify(l)); }

  async function requisicao(caminho, options = {}) {
    const auth = window.ADMIN_AUTH, sessao = auth && auth.sessaoAtual();
    if (!sessao || sessao.expires_at * 1000 <= Date.now()) throw new Error('Sua sessão expirou. Volte à página inicial e entre de novo.');
    let resposta;
    try {
      resposta = await fetch(cfg.url.replace(/\/$/, '') + caminho, {
        ...options, signal: AbortSignal.timeout(20000),
        headers: { apikey: cfg.chavePublica, 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token, ...options.headers }
      });
    } catch (e) { throw new Error('Sem conexão com o banco. Tente novamente.'); }
    if (!resposta.ok) {
      let corpo = null;
      try { corpo = await resposta.json(); } catch (e) {}
      if (resposta.status === 409 || (corpo && corpo.code === '23505')) throw new Error('Esse bairro já está cadastrado neste município.');
      if (resposta.status === 404 || (corpo && corpo.code === '42P01')) { indisponivel = true; throw new Error('A tabela de bairros não existe nesse banco. Rode database/fiscais-bairros.sql no SQL Editor do Supabase.'); }
      throw new Error(
        resposta.status === 401 ? 'Sua sessão expirou. Volte à página inicial e entre de novo.' :
        resposta.status === 403 ? 'Esta conta não tem autorização para os cadastros de Fiscais.' :
        'O banco não concluiu a operação (' + resposta.status + '). Tente novamente.'
      );
    }
    const texto = await resposta.text(); return texto ? JSON.parse(texto) : null;
  }

  async function carregar() {
    if (!online) { cache = lerLocal(); carregado = true; avisar(); return cache; }
    const lista = [];
    for (let offset = 0; ; offset += 1000) {
      const lote = await requisicao('/rest/v1/fiscais_bairros?select=id,municipio,nome,ativo,criado_em&order=nome.asc&limit=1000&offset=' + offset);
      lista.push(...lote);
      if (lote.length < 1000) break;
    }
    cache = lista; carregado = true; indisponivel = false; avisar(); return cache;
  }

  function validar(item) {
    const nome = limparNome(item.nome);
    if (!/^\d{7}$/.test(String(item.municipio || ''))) throw new Error('Selecione o município.');
    if (!nome) throw new Error('Informe o nome do bairro.');
    if (nome.length > 120) throw new Error('O nome do bairro pode ter no máximo 120 caracteres.');
    if (!/\p{L}/u.test(nome)) throw new Error('O nome do bairro precisa ter letras.');
    const repetido = cache.find(b => b.id !== item.id && b.municipio === item.municipio && chaveNome(b.nome) === chaveNome(nome));
    if (repetido) throw new Error('Esse bairro já está cadastrado neste município como "' + repetido.nome + '"' + (repetido.ativo ? '.' : ' (está desativado — reative-o na lista).'));
    return nome;
  }

  /* Cria (sem id) ou altera (com id) um bairro. */
  async function salvar(item) {
    const nome = validar(item);
    const dados = { municipio: item.municipio, nome, ativo: item.ativo !== false };
    if (!online) {
      const l = lerLocal();
      if (item.id) { const i = l.findIndex(b => b.id === item.id); if (i !== -1) l[i] = { ...l[i], ...dados }; }
      else l.push({ id: crypto.randomUUID(), ...dados, criado_em: new Date().toISOString() });
      gravarLocal(l); return carregar();
    }
    if (item.id) await requisicao('/rest/v1/fiscais_bairros?id=eq.' + encodeURIComponent(item.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(dados) });
    else await requisicao('/rest/v1/fiscais_bairros', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(dados) });
    window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento(item.id ? 'editar' : 'criar', 'bairros', (item.id ? 'Editou' : 'Cadastrou') + ' o bairro "' + nome + '"');
    return carregar();
  }

  async function excluir(id) {
    if (!online) { gravarLocal(lerLocal().filter(b => b.id !== id)); return carregar(); }
    const alvo = cache.find(b => b.id === id);
    await requisicao('/rest/v1/fiscais_bairros?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('excluir', 'bairros', 'Excluiu o bairro "' + (alvo && alvo.nome || '') + '"');
    return carregar();
  }

  /* Bairro já cadastrado no município (ativo ou não) que bate com o nome
     digitado, ignorando maiúsculas/acentos/espaços — ou undefined. */
  function encontrar(municipio, nome) {
    const k = chaveNome(nome);
    return k ? cache.find(b => b.municipio === municipio && chaveNome(b.nome) === k) : undefined;
  }

  /* Bairro digitado no cadastro de fiscal: se já existe no banco, descarta
     o digitado e devolve o nome do banco; se não existe, cadastra e devolve
     o digitado (com espaços limpos). Texto sem letras não é cadastrado —
     devolve como veio. No banco online quem decide é garantir_bairro()
     (database/fiscais-bairros-normalizar.sql), que evita duplicar mesmo com
     duas pessoas cadastrando ao mesmo tempo. */
  async function garantir(municipio, nome) {
    const limpo = limparNome(nome);
    if (!limpo || !/\p{L}/u.test(limpo) || limpo.length > 120) return limpo;
    if (!online) {
      const achado = encontrar(municipio, limpo);
      if (achado) return achado.nome;
      const l = lerLocal(); l.push({ id: crypto.randomUUID(), municipio, nome: limpo, ativo: true, criado_em: new Date().toISOString() }); gravarLocal(l);
      await carregar(); return limpo;
    }
    const doBanco = await requisicao('/rest/v1/rpc/garantir_bairro', { method: 'POST', body: JSON.stringify({ p_municipio: municipio, p_nome: limpo }) });
    if (!encontrar(municipio, doBanco || limpo)) await carregar();
    return doBanco || limpo;
  }

  window.BAIRROS_FISCAIS = {
    online, carregar, salvar, excluir, garantir, encontrar,
    carregado: () => carregado,
    indisponivel: () => indisponivel,
    todos: () => ordenar(cache),
    /* Nomes dos bairros ativos do município, em ordem alfabética. */
    ativosDoMunicipio: municipio => ordenar(cache.filter(b => b.municipio === municipio && b.ativo)).map(b => b.nome)
  };
})();
