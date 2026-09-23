/* Camada de dados do módulo Chamados (suporte de TI).
   Uma API só para as três telas (abrir, acompanhar, fila da equipe):
   - online  (banco-config.js preenchido): funções e tabelas do Supabase
     criadas por database/chamados.sql; o público usa só as funções RPC, a
     equipe usa a sessão do login do site (admin-auth.js);
   - local   (sem banco configurado): tudo no localStorage deste navegador,
     só para demonstração/teste — a tela avisa quando está nesse modo.
   O modo online nunca recua em silêncio para o local. */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var online = Boolean(cfg.url || cfg.chavePublica);
  var LOCAL = 'seagri_chamados_v1';
  var MEUS = 'seagri_chamados_meus';
  var AUXKEY = 'seagri_chamados_aux_v1';

  /* ------------------------------------------------------------- metadados */
  var STATUS = {
    aberto:             { rot: 'Aberto',              cor: 'azul',   ordem: 1, ativo: true,  desc: 'Recebemos o chamado e ele está na fila.' },
    em_atendimento:     { rot: 'Em atendimento',      cor: 'ambar',  ordem: 2, ativo: true,  desc: 'Um técnico já está cuidando disso.' },
    aguardando_usuario: { rot: 'Aguardando resposta', cor: 'roxo',   ordem: 3, ativo: true,  desc: 'A equipe precisa de uma resposta do solicitante para continuar.' },
    resolvido:          { rot: 'Resolvido',           cor: 'verde',  ordem: 4, ativo: false, desc: 'O problema foi resolvido.' },
    fechado:            { rot: 'Fechado',             cor: 'cinza',  ordem: 5, ativo: false, desc: 'Chamado encerrado.' },
    cancelado:          { rot: 'Cancelado',           cor: 'cinza',  ordem: 6, ativo: false, desc: 'Chamado cancelado.' }
  };
  var PRIORIDADES = {
    baixa:   { rot: 'Baixa',   cor: 'cinza',   ordem: 1, horas: 72 },
    media:   { rot: 'Média',   cor: 'azul',    ordem: 2, horas: 24 },
    alta:    { rot: 'Alta',    cor: 'laranja', ordem: 3, horas: 8 },
    critica: { rot: 'Crítica', cor: 'vermelho', ordem: 4, horas: 4 }
  };
  var CATEGORIAS = {
    hardware:   { rot: 'Computador / Notebook',  dica: 'Não liga, lento, tela, teclado, mouse' },
    software:   { rot: 'Sistemas e programas',   dica: 'Instalação, erro em sistema, Office' },
    rede:       { rot: 'Internet / Rede / Wi-Fi', dica: 'Sem internet, lentidão, VPN' },
    acesso:     { rot: 'Senha / Acesso / Conta', dica: 'Esqueci a senha, conta bloqueada' },
    impressora: { rot: 'Impressora / Scanner',   dica: 'Não imprime, atolou, digitalizar' },
    email:      { rot: 'E-mail',                 dica: 'Não envia, não recebe, caixa cheia' },
    telefonia:  { rot: 'Telefone / Ramal',       dica: 'Ramal mudo, sem sinal, transferência' },
    outro:      { rot: 'Outro assunto',          dica: 'Qualquer outra necessidade de TI' }
  };
  var TIPOS_AUX = {
    problema:     { rot: 'Problema',     plural: 'Problemas',     pai: null },
    diretoria:    { rot: 'Diretoria',    plural: 'Diretorias',    pai: null },
    departamento: { rot: 'Departamento', plural: 'Departamentos', pai: 'diretoria' },
    setor:        { rot: 'Setor',        plural: 'Setores',       pai: 'departamento' }
  };
  var META = { status: STATUS, prioridades: PRIORIDADES, categorias: CATEGORIAS, tiposAux: TIPOS_AUX };

  /* Lista inicial de problemas (a mesma que database/chamados.sql cadastra). */
  var SUGESTOES = [
    ['Computador não liga', 'hardware'], ['Computador lento ou travando', 'hardware'], ['Tela, teclado ou mouse com defeito', 'hardware'], ['Notebook sem bateria ou carregador', 'hardware'],
    ['Erro em sistema interno', 'software'], ['Instalação ou atualização de programa', 'software'], ['Arquivos do Office não abrem', 'software'], ['Alerta de vírus ou segurança', 'software'],
    ['Sem acesso à internet', 'rede'], ['Wi-Fi instável ou sem sinal', 'rede'], ['VPN ou acesso remoto', 'rede'], ['Pasta de rede inacessível', 'rede'],
    ['Esqueci a senha', 'acesso'], ['Conta bloqueada', 'acesso'], ['Solicitar acesso a um sistema', 'acesso'], ['Criar usuário para novo colaborador', 'acesso'],
    ['Impressora não imprime', 'impressora'], ['Papel atolado ou qualidade ruim', 'impressora'], ['Scanner / digitalização', 'impressora'],
    ['Não envio ou não recebo e-mails', 'email'], ['Caixa de e-mail cheia', 'email'], ['Configurar e-mail no celular', 'email'],
    ['Ramal sem funcionamento', 'telefonia'], ['Configurar transferência de ramal', 'telefonia']
  ];

  /* ---------------------------------------------------------------- erros */
  function ErroChamado(msg) { var e = new Error(msg); e.amigavel = true; return e; }
  function limparMensagem(m) {
    return String(m || '').replace(/^.*?(?:ERROR|P0001):\s*/i, '').trim();
  }

  /* ---------------------------------------------------------------- online */
  function configurar() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url || '') || !/^sb_publishable_/.test(cfg.chavePublica || '')) {
      throw ErroChamado('A configuração do banco online está incompleta.');
    }
  }
  function sessaoEquipe() {
    var a = window.ADMIN_AUTH;
    var s = a && a.sessaoAtual && a.sessaoAtual();
    if (!s || s.expires_at * 1000 <= Date.now()) throw ErroChamado('Sua sessão expirou. Volte à página inicial e entre de novo.');
    return s;
  }
  async function pedir(caminho, opcoes, autenticada) {
    configurar();
    var headers = { apikey: cfg.chavePublica, 'Content-Type': 'application/json' };
    if (autenticada) headers.Authorization = 'Bearer ' + sessaoEquipe().access_token;
    var resposta;
    try {
      resposta = await fetch(cfg.url.replace(/\/$/, '') + caminho, Object.assign({}, opcoes, {
        signal: AbortSignal.timeout(20000),
        headers: Object.assign(headers, (opcoes && opcoes.headers) || {})
      }));
    } catch (e) { throw ErroChamado('Sem conexão com o servidor. Tente novamente; o que você digitou foi mantido.'); }
    if (!resposta.ok) {
      var corpo = null;
      try { corpo = await resposta.json(); } catch (e) {}
      var motivo = limparMensagem(corpo && (corpo.message || corpo.msg));
      if (resposta.status === 404 || (corpo && corpo.code === 'PGRST202')) {
        throw ErroChamado('O módulo de chamados ainda não foi instalado no banco. Rode database/chamados.sql no SQL Editor do Supabase.');
      }
      if (corpo && corpo.code === '23505') throw ErroChamado('Já existe um cadastro com esse nome.');
      if (corpo && corpo.code === '23503') throw ErroChamado('Este cadastro está em uso: remova ou mude os itens ligados a ele antes de excluir.');
      if (resposta.status === 401) throw ErroChamado('Sua sessão expirou. Volte à página inicial e entre de novo.');
      if (resposta.status === 403) throw ErroChamado('Esta conta não tem autorização para atender chamados.');
      throw ErroChamado(motivo && resposta.status === 400 ? motivo : 'O banco não concluiu a operação (' + resposta.status + '). Tente novamente.');
    }
    var texto = await resposta.text();
    return texto ? JSON.parse(texto) : null;
  }
  function rpc(nome, args, autenticada) {
    return pedir('/rest/v1/rpc/' + nome, { method: 'POST', body: JSON.stringify(args || {}) }, autenticada);
  }

  /* ----------------------------------------------------------------- local */
  function lerLocal() {
    var base;
    try { base = JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch (e) { base = null; }
    if (!base || !Array.isArray(base.chamados) || !Array.isArray(base.eventos)) base = { seq: 0, chamados: [], eventos: [] };
    return base;
  }
  function gravarLocal(b) { localStorage.setItem(LOCAL, JSON.stringify(b)); }
  function agora() { return new Date().toISOString(); }
  function nomeCurto(n) {
    n = String(n || '').trim();
    var m = /^(\S+)\s.*?(\S)\S*$/.exec(n);
    return m ? m[1] + ' ' + m[2].toUpperCase() + '.' : n;
  }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) || 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function codigoLocal(b) {
    var hex, novo;
    do {
      var v = new Uint8Array(5); crypto.getRandomValues(v);
      hex = Array.prototype.map.call(v, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').toUpperCase();
      novo = 'CH-' + hex.slice(0, 5) + '-' + hex.slice(5, 10);
    } while (b.chamados.some(function (c) { return c.codigo === novo; }));
    return novo;
  }
  function prazo(criadoEm, prioridade) {
    return new Date(new Date(criadoEm).getTime() + PRIORIDADES[prioridade].horas * 3600000).toISOString();
  }
  function autorEquipe() {
    var a = window.ADMIN_AUTH, s = a && a.sessaoAtual && a.sessaoAtual();
    var mail = (s && s.user && s.user.email) || '';
    if (!mail) return 'Equipe de TI';
    return mail.split('@')[0].split('.').map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
  }
  function evento(b, chamadoId, tipo, publico, autor, extra) {
    b.eventos.push(Object.assign({ id: uuid(), chamado_id: chamadoId, tipo: tipo, publico: publico, autor: autor, texto: null, de_valor: null, para_valor: null, criado_em: agora() }, extra || {}));
  }

  /* Cadastros auxiliares (local): já nasce com os problemas sugeridos e uma
     estrutura de exemplo, para o formulário mostrar as listas na demonstração. */
  function lerAux() {
    var b;
    try { b = JSON.parse(localStorage.getItem(AUXKEY) || 'null'); } catch (e) { b = null; }
    if (b && Array.isArray(b.itens)) return b;
    b = { itens: [] };
    var novo = function (tipo, nome, pai, cat) {
      var i = { id: uuid(), tipo: tipo, nome: nome, pai_id: pai ? pai.id : null, categoria: cat || null, ativo: true, criado_em: agora() };
      b.itens.push(i); return i;
    };
    SUGESTOES.forEach(function (p) { novo('problema', p[0], null, p[1]); });
    var adm = novo('diretoria', 'Diretoria Administrativa e Financeira'), ops = novo('diretoria', 'Diretoria de Operações');
    var dp = novo('departamento', 'Departamento de Pessoal', adm), fin = novo('departamento', 'Departamento Financeiro', adm), log = novo('departamento', 'Departamento de Logística', ops);
    novo('setor', 'Folha de Pagamento', dp); novo('setor', 'Recrutamento', dp);
    novo('setor', 'Contas a Pagar', fin); novo('setor', 'Contabilidade', fin);
    novo('setor', 'Almoxarifado', log); novo('setor', 'Frota', log);
    gravarAux(b);
    return b;
  }
  function gravarAux(b) { localStorage.setItem(AUXKEY, JSON.stringify(b)); }
  function validarAux(item, itens) {
    var nome = String(item.nome || '').trim();
    if (nome.length < 2) throw ErroChamado('Informe o nome (mínimo 2 letras).');
    if (item.tipo === 'problema' && !META.categorias[item.categoria]) throw ErroChamado('Escolha a categoria do problema.');
    var tp = TIPOS_AUX[item.tipo];
    if (tp.pai && !item.pai_id) throw ErroChamado('Escolha a que ' + TIPOS_AUX[tp.pai].rot.toLowerCase() + ' pertence.');
    var dup = itens.some(function (i) {
      return i.id !== item.id && i.tipo === item.tipo && (i.pai_id || null) === (item.pai_id || null) && i.nome.toLowerCase() === nome.toLowerCase();
    });
    if (dup) throw ErroChamado('Já existe um cadastro com esse nome.');
    return nome;
  }

  var LOCALDRV = {
    async cadastros(todos) {
      return lerAux().itens.filter(function (i) { return todos || i.ativo; }).map(function (i) { return Object.assign({}, i); });
    },
    async salvarCadastro(item) {
      var b = lerAux();
      var nome = validarAux(item, b.itens);
      if (item.id) {
        var x = b.itens.filter(function (i) { return i.id === item.id; })[0];
        if (!x) throw ErroChamado('Cadastro não encontrado.');
        x.nome = nome; x.pai_id = item.pai_id || null; x.categoria = item.tipo === 'problema' ? item.categoria : null; x.ativo = item.ativo !== false;
      } else {
        b.itens.push({ id: uuid(), tipo: item.tipo, nome: nome, pai_id: item.pai_id || null, categoria: item.tipo === 'problema' ? item.categoria : null, ativo: item.ativo !== false, criado_em: agora() });
      }
      gravarAux(b);
    },
    async excluirCadastro(id) {
      var b = lerAux();
      if (b.itens.some(function (i) { return i.pai_id === id; })) throw ErroChamado('Este cadastro está em uso: remova ou mude os itens ligados a ele antes de excluir.');
      b.itens = b.itens.filter(function (i) { return i.id !== id; });
      gravarAux(b);
    },
    async carregarSugestoes() {
      var b = lerAux(), tem = {};
      b.itens.filter(function (i) { return i.tipo === 'problema'; }).forEach(function (i) { tem[i.nome.toLowerCase()] = 1; });
      var n = 0;
      SUGESTOES.forEach(function (p) {
        if (tem[p[0].toLowerCase()]) return;
        b.itens.push({ id: uuid(), tipo: 'problema', nome: p[0], pai_id: null, categoria: p[1], ativo: true, criado_em: agora() }); n++;
      });
      gravarAux(b); return n;
    },
    async abrir(d) {
      var b = lerLocal(), aux = lerAux().itens;
      var achar = function (id, tipo) {
        if (!id) return null;
        var x = aux.filter(function (i) { return i.id === id && i.tipo === tipo && i.ativo; })[0];
        if (!x) throw ErroChamado('O item escolhido (' + TIPOS_AUX[tipo].rot.toLowerCase() + ') não existe mais. Atualize a página.');
        return x;
      };
      var dir = achar(d.diretoria_id, 'diretoria'), dep = achar(d.departamento_id, 'departamento'),
          set = achar(d.setor_id, 'setor'), prob = achar(d.problema_id, 'problema');
      var nDir = dir ? dir.nome : (d.diretoria || null), nDep = dep ? dep.nome : (d.departamento || null);
      var nSet = (set ? set.nome : d.setor) || nDep || nDir;
      if (!nSet || String(nSet).length < 2) throw ErroChamado('Informe seu setor.');
      var cat = prob ? prob.categoria : (META.categorias[d.categoria] ? d.categoria : 'outro');
      var prio = ['baixa', 'media', 'alta'].indexOf(d.prioridade) >= 0 ? d.prioridade : 'media';
      var criado = agora();
      var c = {
        id: uuid(), numero: ++b.seq, codigo: codigoLocal(b),
        solicitante_nome: d.nome, solicitante_email: d.email || null, solicitante_telefone: d.telefone || null,
        diretoria: nDir, departamento: nDep, setor: nSet, local: d.local || null,
        problema: prob ? prob.nome : (d.problema || null), problema_id: prob ? prob.id : null,
        categoria: cat, prioridade: prio,
        assunto: d.assunto, descricao: d.descricao, status: 'aberto',
        responsavel_id: null, responsavel_nome: null, criado_em: criado, atualizado_em: criado,
        prazo_em: prazo(criado, prio), resolvido_em: null, avaliacao_nota: null, avaliacao_comentario: null
      };
      b.chamados.push(c);
      evento(b, c.id, 'abertura', true, d.nome, { texto: 'Chamado aberto.' });
      gravarLocal(b);
      return { codigo: c.codigo, numero: c.numero };
    },
    async consultar(codigo) {
      var b = lerLocal();
      var cod = String(codigo || '').trim().toUpperCase();
      var c = b.chamados.filter(function (x) { return x.codigo === cod; })[0];
      if (!c) return null;
      var pub = {};
      ['codigo', 'numero', 'assunto', 'descricao', 'categoria', 'problema', 'diretoria', 'departamento', 'setor', 'local', 'prioridade', 'status', 'solicitante_nome',
        'responsavel_nome', 'criado_em', 'atualizado_em', 'prazo_em', 'resolvido_em', 'avaliacao_nota'].forEach(function (k) { pub[k] = c[k]; });
      return {
        chamado: pub,
        eventos: b.eventos.filter(function (e) { return e.chamado_id === c.id && e.publico; })
          .sort(function (x, y) { return x.criado_em < y.criado_em ? -1 : 1; })
      };
    },
    async responder(codigo, texto) {
      var b = lerLocal();
      var c = b.chamados.filter(function (x) { return x.codigo === String(codigo).toUpperCase(); })[0];
      if (!c) throw ErroChamado('Chamado não encontrado.');
      if (String(texto || '').trim().length < 2) throw ErroChamado('Escreva a mensagem.');
      if (c.status === 'fechado' || c.status === 'cancelado') throw ErroChamado('Este chamado já foi encerrado. Abra um novo se precisar.');
      evento(b, c.id, 'solicitante', true, c.solicitante_nome, { texto: String(texto).trim() });
      if (c.status === 'aguardando_usuario' || c.status === 'resolvido') {
        evento(b, c.id, 'status', true, c.solicitante_nome, { de_valor: c.status, para_valor: 'em_atendimento' });
        c.status = 'em_atendimento'; c.resolvido_em = null;
      }
      c.atualizado_em = agora();
      gravarLocal(b);
    },
    async avaliar(codigo, nota, comentario) {
      var b = lerLocal();
      var c = b.chamados.filter(function (x) { return x.codigo === String(codigo).toUpperCase(); })[0];
      if (!c) throw ErroChamado('Chamado não encontrado.');
      if (c.status !== 'resolvido' && c.status !== 'fechado') throw ErroChamado('Você poderá avaliar quando o chamado for resolvido.');
      if (c.avaliacao_nota) throw ErroChamado('Este chamado já foi avaliado. Obrigado!');
      c.avaliacao_nota = nota; c.avaliacao_comentario = comentario || null; c.atualizado_em = agora();
      evento(b, c.id, 'avaliacao', true, c.solicitante_nome, { texto: comentario || null, para_valor: String(nota) });
      gravarLocal(b);
    },
    async listarPublico() {
      return lerLocal().chamados.slice().sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; }).map(function (c) {
        return { numero: c.numero, solicitante: nomeCurto(c.solicitante_nome), diretoria: c.diretoria, departamento: c.departamento, setor: c.setor,
          problema: c.problema, categoria: c.categoria, status: c.status, prioridade: c.prioridade, responsavel_nome: c.responsavel_nome,
          criado_em: c.criado_em, atualizado_em: c.atualizado_em, prazo_em: c.prazo_em, resolvido_em: c.resolvido_em };
      });
    },
    async detalhePublico(numero) {
      var b = lerLocal(), c = b.chamados.filter(function (x) { return x.numero === Number(numero); })[0];
      if (!c) return null;
      var pub = {};
      ['numero', 'assunto', 'descricao', 'categoria', 'problema', 'diretoria', 'departamento', 'setor', 'local', 'prioridade', 'status',
        'responsavel_nome', 'criado_em', 'atualizado_em', 'prazo_em', 'resolvido_em', 'avaliacao_nota'].forEach(function (k) { pub[k] = c[k]; });
      pub.solicitante_nome = nomeCurto(c.solicitante_nome);
      return {
        chamado: pub,
        eventos: b.eventos.filter(function (e) { return e.chamado_id === c.id && e.publico; })
          .sort(function (x, y) { return x.criado_em < y.criado_em ? -1 : 1; })
          .map(function (e) { return Object.assign({}, e, { autor: ['abertura', 'solicitante', 'avaliacao'].indexOf(e.tipo) >= 0 ? nomeCurto(e.autor) : e.autor }); })
      };
    },
    async listar() { return lerLocal().chamados.slice(); },
    async eventos(id) {
      return lerLocal().eventos.filter(function (e) { return e.chamado_id === id; })
        .sort(function (x, y) { return x.criado_em < y.criado_em ? -1 : 1; });
    },
    async atualizar(id, m) {
      var b = lerLocal();
      var c = b.chamados.filter(function (x) { return x.id === id; })[0];
      if (!c) throw ErroChamado('Chamado não encontrado.');
      var autor = autorEquipe();
      if (m.status && m.status !== c.status) {
        evento(b, c.id, 'status', true, autor, { de_valor: c.status, para_valor: m.status });
        c.status = m.status;
        c.resolvido_em = (m.status === 'resolvido' || m.status === 'fechado') ? (c.resolvido_em || agora()) : null;
      }
      if (m.prioridade && m.prioridade !== c.prioridade) {
        evento(b, c.id, 'prioridade', true, autor, { de_valor: c.prioridade, para_valor: m.prioridade });
        c.prioridade = m.prioridade; c.prazo_em = prazo(c.criado_em, m.prioridade);
      }
      if (m.assumir) {
        evento(b, c.id, 'atribuicao', true, autor, { de_valor: c.responsavel_nome, para_valor: autor });
        c.responsavel_nome = autor;
        if (c.status === 'aberto') { evento(b, c.id, 'status', true, autor, { de_valor: 'aberto', para_valor: 'em_atendimento' }); c.status = 'em_atendimento'; }
      } else if (typeof m.responsavel === 'string' && m.responsavel !== (c.responsavel_nome || '')) {
        evento(b, c.id, 'atribuicao', true, autor, { de_valor: c.responsavel_nome, para_valor: m.responsavel || null });
        c.responsavel_nome = m.responsavel || null;
      }
      if (m.texto && m.texto.trim()) {
        evento(b, c.id, m.publico === false ? 'nota' : 'resposta', m.publico !== false, autor, { texto: m.texto.trim() });
      }
      c.atualizado_em = agora();
      gravarLocal(b);
    }
  };

  /* ---------------------------------------------------------------- online */
  var ONLINEDRV = {
    async cadastros(todos) {
      if (todos) return pedir('/rest/v1/chamados_aux?select=*&order=nome.asc&limit=2000', {}, true);
      return pedir('/rest/v1/chamados_aux?select=id,tipo,nome,pai_id,categoria,ativo&ativo=eq.true&order=nome.asc&limit=2000', {}, false);
    },
    async salvarCadastro(item) {
      var corpo = { tipo: item.tipo, nome: String(item.nome || '').trim(), pai_id: item.pai_id || null, categoria: item.tipo === 'problema' ? item.categoria || null : null, ativo: item.ativo !== false };
      if (corpo.nome.length < 2) throw ErroChamado('Informe o nome (mínimo 2 letras).');
      if (item.tipo === 'problema' && !corpo.categoria) throw ErroChamado('Escolha a categoria do problema.');
      if (TIPOS_AUX[item.tipo].pai && !corpo.pai_id) throw ErroChamado('Escolha a que ' + TIPOS_AUX[TIPOS_AUX[item.tipo].pai].rot.toLowerCase() + ' pertence.');
      if (item.id) await pedir('/rest/v1/chamados_aux?id=eq.' + encodeURIComponent(item.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(corpo) }, true);
      else await pedir('/rest/v1/chamados_aux', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(corpo) }, true);
      window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento(item.id ? 'editar' : 'criar', 'chamados', (item.id ? 'Editou' : 'Cadastrou') + ' ' + TIPOS_AUX[item.tipo].rot.toLowerCase() + ' "' + corpo.nome + '"');
    },
    async excluirCadastro(id, nome, tipo) {
      await pedir('/rest/v1/chamados_aux?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, true);
      window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('excluir', 'chamados', 'Excluiu ' + (TIPOS_AUX[tipo] ? TIPOS_AUX[tipo].rot.toLowerCase() : 'cadastro') + ' "' + (nome || '') + '"');
    },
    async carregarSugestoes() {
      var atuais = await pedir('/rest/v1/chamados_aux?select=nome&tipo=eq.problema&limit=2000', {}, true), tem = {};
      atuais.forEach(function (i) { tem[i.nome.toLowerCase()] = 1; });
      var novos = SUGESTOES.filter(function (p) { return !tem[p[0].toLowerCase()]; })
        .map(function (p) { return { tipo: 'problema', nome: p[0], categoria: p[1], ativo: true }; });
      if (novos.length) await pedir('/rest/v1/chamados_aux', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(novos) }, true);
      return novos.length;
    },
    async abrir(d) {
      return rpc('abrir_chamado', { p: {
        nome: d.nome, email: d.email || null, telefone: d.telefone || null, local: d.local || null,
        diretoria_id: d.diretoria_id || null, diretoria: d.diretoria || null,
        departamento_id: d.departamento_id || null, departamento: d.departamento || null,
        setor_id: d.setor_id || null, setor: d.setor || null,
        problema_id: d.problema_id || null, problema: d.problema || null, categoria: d.categoria || null,
        prioridade: d.prioridade, assunto: d.assunto, descricao: d.descricao
      } }, false);
    },
    async consultar(codigo) { return rpc('consultar_chamado', { p_codigo: codigo }, false); },
    async responder(codigo, texto) { await rpc('responder_chamado', { p_codigo: codigo, p_texto: texto }, false); },
    async avaliar(codigo, nota, comentario) { await rpc('avaliar_chamado', { p_codigo: codigo, p_nota: nota, p_comentario: comentario || null }, false); },
    async listarPublico() { return (await rpc('listar_chamados_publico', {}, false)) || []; },
    async detalhePublico(numero) { return rpc('detalhe_chamado_publico', { p_numero: Number(numero) }, false); },
    async listar() {
      var todos = [];
      for (var off = 0; ; off += 500) {
        var lote = await pedir('/rest/v1/chamados?select=*&order=criado_em.desc&limit=500&offset=' + off, {}, true);
        todos = todos.concat(lote);
        if (lote.length < 500) break;
      }
      return todos;
    },
    async eventos(id) {
      return pedir('/rest/v1/chamados_eventos?select=*&chamado_id=eq.' + encodeURIComponent(id) + '&order=criado_em.asc', {}, true);
    },
    async atualizar(id, m) {
      await rpc('chamado_atualizar', {
        p_id: id, p_status: m.status || null, p_prioridade: m.prioridade || null, p_assumir: Boolean(m.assumir),
        p_responsavel: typeof m.responsavel === 'string' ? m.responsavel : null,
        p_texto: m.texto || null, p_publico: m.publico !== false
      }, true);
      var partes = [];
      if (m.status) partes.push('status para "' + (STATUS[m.status] ? STATUS[m.status].rot : m.status) + '"');
      if (m.prioridade) partes.push('prioridade para "' + (PRIORIDADES[m.prioridade] ? PRIORIDADES[m.prioridade].rot : m.prioridade) + '"');
      if (m.assumir) partes.push('assumiu o atendimento');
      else if (typeof m.responsavel === 'string') partes.push('responsável para "' + (m.responsavel || '(ninguém)') + '"');
      if (m.texto && m.texto.trim()) partes.push(m.publico === false ? 'adicionou uma nota interna' : 'respondeu ao solicitante');
      window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('editar', 'chamados', 'Atualizou o chamado' + (partes.length ? ': ' + partes.join(', ') : ''), { chamado_id: id });
    }
  };

  var drv = online ? ONLINEDRV : LOCALDRV;

  /* --------------------------------- códigos guardados neste navegador (público) */
  function meus() {
    try { var l = JSON.parse(localStorage.getItem(MEUS) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function lembrar(codigo, assunto, numero) {
    var antigo = meus().filter(function (x) { return x.codigo === codigo; })[0];
    var l = meus().filter(function (x) { return x.codigo !== codigo; });
    l.unshift({ codigo: codigo, assunto: assunto, numero: numero || (antigo && antigo.numero) || null, em: (antigo && antigo.em) || agora() });
    try { localStorage.setItem(MEUS, JSON.stringify(l.slice(0, 12))); } catch (e) {}
  }
  function esquecer(codigo) {
    try { localStorage.setItem(MEUS, JSON.stringify(meus().filter(function (x) { return x.codigo !== codigo; }))); } catch (e) {}
  }

  function normalizarCodigo(v) {
    v = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.indexOf('CH') === 0) v = v.slice(2);
    v = v.slice(0, 10);
    return v.length > 5 ? 'CH-' + v.slice(0, 5) + '-' + v.slice(5) : (v ? 'CH-' + v : '');
  }

  window.CHAMADOS = {
    modo: online ? 'online' : 'local',
    meta: META,
    abrir: function (d) { return drv.abrir(d); },
    consultar: function (c) { return drv.consultar(normalizarCodigo(c)); },
    responder: function (c, t) { return drv.responder(normalizarCodigo(c), t); },
    avaliar: function (c, n, t) { return drv.avaliar(normalizarCodigo(c), n, t); },
    cadastros: function (todos) { return drv.cadastros(Boolean(todos)); },
    salvarCadastro: function (i) { return drv.salvarCadastro(i); },
    excluirCadastro: function (id, nome, tipo) { return drv.excluirCadastro(id, nome, tipo); },
    carregarSugestoes: function () { return drv.carregarSugestoes(); },
    listarPublico: function () { return drv.listarPublico(); },
    detalhePublico: function (n) { return drv.detalhePublico(n); },
    listar: function () { return drv.listar(); },
    eventos: function (id) { return drv.eventos(id); },
    atualizar: function (id, m) { return drv.atualizar(id, m); },
    meus: meus, lembrar: lembrar, esquecer: esquecer, normalizarCodigo: normalizarCodigo,
    /* Só para o modo local: povoa exemplos para conhecer a fila. */
    async _povoarDemo() {
      if (online) return 0;
      var exemplos = [
        ['Marina Costa', 'Financeiro', 'hardware', 'alta', 'Notebook não liga', 'Depois da queda de energia de ontem o notebook não dá sinal de vida, nem a luz do carregador acende.'],
        ['Paulo Ribeiro', 'Recursos Humanos', 'acesso', 'media', 'Senha do sistema de ponto bloqueada', 'Errei a senha três vezes e o sistema bloqueou o meu usuário. Preciso registrar o ponto.'],
        ['Ana Lima', 'Protocolo', 'impressora', 'baixa', 'Impressora do corredor com papel atolado', 'A impressora do 2º andar acusa atolamento mas não encontrei papel preso.'],
        ['Carlos Nunes', 'Jurídico', 'rede', 'alta', 'Sem internet na sala 204', 'Toda a sala 204 está sem internet desde as 8h. Os cabos estão conectados.']
      ];
      for (var i = 0; i < exemplos.length; i++) {
        var e = exemplos[i];
        await LOCALDRV.abrir({ nome: e[0], setor: e[1], categoria: e[2], prioridade: e[3], assunto: e[4], descricao: e[5] });
      }
      return exemplos.length;
    }
  };
})();
