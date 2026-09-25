// Edge Function do Supabase — mesma lógica de lancar_mecanizacao.php, mas roda
// no próprio Supabase, então funciona com o site publicado no GitHub Pages
// (que não executa PHP: lá o POST pro .php volta 405 e o lançamento nunca
// chegava ao banco). A chave service_role vem do ambiente da função
// (SUPABASE_SERVICE_ROLE_KEY, preenchida automaticamente pelo Supabase) e
// nunca chega ao navegador. Como publicar: database/CONFIGURAR-ADMIN.md.
//
// Recebe o mesmo multipart/form-data do PHP (campo "acao" + campos do
// formulário + "token" da sessão do site), então o navegador manda o mesmo
// FormData pros dois. Deve ser publicada com "Verify JWT" DESLIGADO: quem
// confere a sessão é emailAutenticado(), aqui dentro.

const RESPONSAVEL_EMAIL = 'root@root.com';
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TABELA = '/rest/v1/mecanizacao_lancamentos';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Encerra a requisição com a resposta — lançado e capturado no Deno.serve,
    pra ter o mesmo "responder() e sai" do PHP dentro das funções auxiliares. */
class Resposta {
  constructor(public status: number, public corpo: Record<string, unknown>) {}
}
function responder(status: number, corpo: Record<string, unknown>): never {
  throw new Resposta(status, corpo);
}

/** Chama a API REST do Supabase com a service_role (acesso total — nunca expor). */
async function chamarSupabase(
  metodo: string, caminho: string, corpo?: unknown, extras: Record<string, string> = {},
): Promise<[number, unknown, Headers | null]> {
  try {
    const r = await fetch(SUPABASE_URL + caminho, {
      method: metodo,
      headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE, 'Content-Type': 'application/json', ...extras },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
    return [r.status, json, r.headers];
  } catch (e) {
    return [0, { msg: String(e) }, null];
  }
}

const mensagem = (corpo: unknown, padrao: string) => {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  return typeof c.message === 'string' ? c.message : typeof c.msg === 'string' ? c.msg : padrao;
};

/** Confirma no próprio Supabase quem é o dono do token de sessão do site e
    devolve o e-mail de verdade — nunca o que o navegador afirma sozinho. */
async function emailAutenticado(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + token } });
    const usuario = r.ok ? await r.json().catch(() => null) : null;
    return usuario && usuario.email ? String(usuario.email).toLowerCase() : null;
  } catch {
    return null;
  }
}

async function exigirSessao(fd: FormData): Promise<string> {
  const email = await emailAutenticado(String(fd.get('token') ?? ''));
  if (email === null) responder(401, { ok: false, erro: 'Sua sessão do site expirou. Recarregue a página e entre de novo.' });
  return email;
}

/** Lê e valida os campos do formulário, iguais em "salvar" e "editar" —
    mesma regra de lerRegistroDoPost() em lancar_mecanizacao.php. */
function lerRegistro(fd: FormData, emailDono: string): Record<string, unknown> {
  const bruto = (c: string) => { const v = fd.get(c); return typeof v === 'string' ? v : ''; };
  const txt = (c: string) => { const v = bruto(c).trim(); return v === '' ? null : v; };
  const num = (c: string) => {
    const v = bruto(c).trim().replace(',', '.');
    return v === '' || !isFinite(Number(v)) ? null : Number(v);
  };
  const inteiro = (c: string) => {
    const v = bruto(c).trim();
    return v === '' || !isFinite(Number(v)) ? null : Math.trunc(Number(v));
  };
  const data = (c: string) => { const v = bruto(c).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const json = (c: string, padrao: unknown) => {
    const v = bruto(c);
    if (v === '') return padrao;
    try { return JSON.parse(v); } catch { return padrao; }
  };
  const lista = (c: string) => { const v = json(c, []); return Array.isArray(v) ? v.map(String) : []; };
  const arr = (c: string) => { const v = json(c, []); return Array.isArray(v) ? v : []; };

  const nomeBeneficiario = txt('nome_beneficiario');
  if (nomeBeneficiario === null) responder(400, { ok: false, erro: 'Informe o nome do beneficiário.' });

  const registro = {
    criado_por_email: emailDono,
    tipo_servico: txt('tipo_servico'),
    data_vistoria: data('data_vistoria'),
    escritorio_local: txt('escritorio_local'),
    responsavel_tecnico: txt('responsavel_tecnico'),
    ponto_controle: txt('ponto_controle'),
    nome_beneficiario: nomeBeneficiario,
    cpf: txt('cpf'),
    data_nascimento: data('data_nascimento'),
    estado_civil: txt('estado_civil'),
    sexo: txt('sexo'),
    indigena: txt('indigena') === 'Sim',
    etnia: txt('etnia'),
    possui_dap: txt('possui_dap'),
    associacao_cooperativa: txt('associacao_cooperativa'),
    telefone: txt('telefone'),
    endereco: txt('endereco'),
    nome_propriedade: txt('nome_propriedade'),
    municipio: txt('municipio'),
    culturas: arr('culturas'),
    area_total_ha: num('area_total_ha'),
    horas_maquina: num('horas_maquina'),
    quantidade_acudes: inteiro('quantidade_acudes'),
    pontos_geo: arr('pontos_geo'),
    tipo_trator: txt('tipo_trator'),
    maquinas: lista('maquinas'),
    implementos: lista('implementos'),
    tipo_uso: txt('tipo_uso'),
    num_identificacao_patrimonio: txt('num_identificacao_patrimonio'),
    daes: arr('daes').slice(0, 10),
    observacao: txt('observacao'),
  };

  if (registro.tipo_servico === 'Mecanização' && registro.culturas.length < 1) {
    responder(400, { ok: false, erro: 'Adicione pelo menos uma cultura para um lançamento de Mecanização.' });
  }
  if (registro.tipo_servico === 'Açudagem' && (registro.quantidade_acudes ?? 0) < 1) {
    responder(400, { ok: false, erro: 'Informe pelo menos 1 tanque/açude para um lançamento de Açudagem.' });
  }
  return registro;
}

/** E-mails que contam como "da pessoa logada": o login mais os e-mails da
    planilha ligados a ele (mecanizacao_lancadores.usuario_email). */
const cacheEmails = new Map<string, string[]>();
async function emailsDoUsuario(login: string): Promise<string[]> {
  if (!cacheEmails.has(login)) {
    const emails = [login];
    const [status, corpo] = await chamarSupabase('GET', `/rest/v1/mecanizacao_lancadores?select=email&usuario_email=eq.${encodeURIComponent(login)}`);
    if (status >= 200 && status < 300 && Array.isArray(corpo)) {
      for (const l of corpo as Record<string, unknown>[]) if (l.email) emails.push(String(l.email).toLowerCase());
    }
    cacheEmails.set(login, [...new Set(emails)]);
  }
  return cacheEmails.get(login)!;
}

const podeAcessar = async (email: string, dono: unknown) =>
  email === RESPONSAVEL_EMAIL || (await emailsDoUsuario(email)).includes(String(dono ?? '').toLowerCase());

/** Filtro PostgREST "criado_por_email=in.(...)" com e-mails validados. */
function filtroEmails(emails: string[]): string {
  const validos = emails.filter((e) => /^[^\s,()"@]+@[^\s,()"@]+$/.test(e));
  if (!validos.length) return '&criado_por_email=eq.__nenhum__';
  return '&criado_por_email=in.(' + validos.map((e) => encodeURIComponent('"' + e + '"')).join(',') + ')';
}

async function buscarLancamento(id: string, select = '*'): Promise<Record<string, unknown>> {
  const [status, corpo] = await chamarSupabase('GET', `${TABELA}?id=eq.${encodeURIComponent(id)}&select=${select}`);
  if (status < 200 || status >= 300 || !Array.isArray(corpo) || !corpo.length) {
    responder(404, { ok: false, erro: 'Lançamento não encontrado.' });
  }
  return corpo[0] as Record<string, unknown>;
}

const TABELA_SOLICITACOES = '/rest/v1/mecanizacao_solicitacoes';

/** Motivo obrigatório dos pedidos de exclusão/edição. */
function lerMotivo(fd: FormData): string {
  const motivo = String(fd.get('motivo') ?? '').trim();
  if (motivo === '') responder(400, { ok: false, erro: 'Informe o motivo da solicitação.' });
  return motivo.slice(0, 1000);
}

async function solicitacaoPendente(lancamentoId: string): Promise<Record<string, unknown> | null> {
  const [status, corpo] = await chamarSupabase('GET',
    `${TABELA_SOLICITACOES}?select=id,tipo,motivo,solicitado_por_email,criado_em&status=eq.pendente&lancamento_id=eq.${encodeURIComponent(lancamentoId)}`);
  return status >= 200 && status < 300 && Array.isArray(corpo) && corpo.length ? corpo[0] as Record<string, unknown> : null;
}

/** Grava um pedido de exclusão/edição pendente e encerra a requisição —
    mesma regra de criarSolicitacao() em lancar_mecanizacao.php. */
async function criarSolicitacao(
  lancamento: Record<string, unknown>, tipo: string, motivo: string, email: string, dados: unknown,
): Promise<never> {
  if (await solicitacaoPendente(String(lancamento.id))) {
    responder(409, { ok: false, erro: 'Este lançamento já tem uma solicitação aguardando aprovação.' });
  }
  const [status, corpo] = await chamarSupabase('POST', TABELA_SOLICITACOES, {
    lancamento_id: lancamento.id,
    nome_beneficiario: lancamento.nome_beneficiario ?? null,
    tipo, motivo, dados,
    solicitado_por_email: email,
  }, { Prefer: 'return=minimal' });
  if (status >= 200 && status < 300) responder(200, { ok: true, pendente: true });
  responder(502, { ok: false, erro: mensagem(corpo, 'Não foi possível registrar a solicitação.') });
}

/** Filtros da lista (campos "f_*") no formato do PostgREST — mesma regra de
    filtrosDaLista() em lancar_mecanizacao.php. */
function filtrosDaLista(fd: FormData, emailsDoLogin: string[]): string {
  const f = (c: string) => String(fd.get(c) ?? '').trim();
  const livre = (v: string) => v.replace(/[,()*:"\\]/g, ' ').trim();
  let q = '';
  const busca = livre(f('f_busca'));
  if (busca) {
    const termo = encodeURIComponent('*' + busca + '*');
    q += `&or=(nome_beneficiario.ilike.${termo},cpf.ilike.${termo})`;
  }
  const colunas: Record<string, string> = { f_tipo_servico: 'tipo_servico', f_municipio: 'municipio', f_escritorio: 'escritorio_local' };
  for (const [campo, coluna] of Object.entries(colunas)) {
    const v = f(campo);
    if (v) q += `&${coluna}=eq.${encodeURIComponent(v)}`;
  }
  if (/^\d{4}$/.test(f('f_ano'))) {
    const ano = parseInt(f('f_ano'), 10);
    q += `&criado_em=gte.${encodeURIComponent(ano + '-01-01T00:00:00-05:00')}&criado_em=lt.${encodeURIComponent((ano + 1) + '-01-01T00:00:00-05:00')}`;
  }
  // "Lançado por": vazio = só os meus (padrão); "todos"; ou os e-mails de uma pessoa.
  const pessoa = f('f_pessoa');
  if (pessoa === '') q += filtroEmails(emailsDoLogin);
  else if (pessoa !== 'todos') q += filtroEmails(pessoa.split(',').map((e) => e.trim().toLowerCase()));
  return q;
}

function exigirId(fd: FormData, msg: string): string {
  const id = String(fd.get('id') ?? '');
  if (id === '') responder(400, { ok: false, erro: msg });
  return id;
}

async function tratar(fd: FormData): Promise<never> {
  const acao = String(fd.get('acao') ?? '');

  if (acao === 'salvar') {
    const email = await exigirSessao(fd);
    const registro = lerRegistro(fd, email);
    const [status, corpo] = await chamarSupabase('POST', TABELA, registro, { Prefer: 'return=representation' });
    if (status >= 200 && status < 300) responder(200, { ok: true, registro: Array.isArray(corpo) ? corpo[0] ?? registro : registro });
    responder(502, { ok: false, erro: mensagem(corpo, 'O banco não aceitou o lançamento.') });
  }

  if (acao === 'listar') {
    const email = await exigirSessao(fd);
    const limite = Math.max(1, Math.min(100, parseInt(String(fd.get('limite') ?? '20'), 10) || 20));
    const pagina = Math.max(1, parseInt(String(fd.get('pagina') ?? '1'), 10) || 1);
    // Qualquer pessoa logada pode ver os dos outros pelo filtro "Lançado
    // por"; editar/excluir continua só do dono (ou root).
    const meusEmails = await emailsDoUsuario(email);
    const filtro = filtrosDaLista(fd, meusEmails);
    // Mais recente primeiro (2026 no topo); o primeiro lançado fica por último.
    let [status, corpo, headersResp] = await chamarSupabase('GET',
      `${TABELA}?select=id,criado_em,criado_por_email,tipo_servico,nome_beneficiario,` +
      'municipio,escritorio_local,data_vistoria,area_total_ha,horas_maquina,quantidade_acudes' +
      `${filtro}&order=criado_em.desc,id.desc&limit=${limite}&offset=${(pagina - 1) * limite}`,
      undefined, { Prefer: 'count=exact' });
    // 416 = página além do fim: lista vazia com o total (a tela volta pra última página).
    if (status === 416) { status = 200; corpo = []; }
    if (status >= 200 && status < 300) {
      // "Content-Range: 0-19/3616" → total de linhas que batem com o filtro
      const faixa = /\/(\d+)$/.exec(headersResp?.get('content-range') ?? '');
      const total = faixa ? parseInt(faixa[1], 10) : (Array.isArray(corpo) ? corpo.length : 0);
      // Pedidos pendentes das linhas listadas (lancamento_id → tipo); sem a
      // tabela de pedidos, a lista sai sem isso.
      const pendencias: Record<string, unknown> = {};
      const ids = (Array.isArray(corpo) ? corpo : []).map((l) => String((l as Record<string, unknown>).id ?? '')).filter(Boolean);
      if (ids.length) {
        const [stPend, pend] = await chamarSupabase('GET',
          `${TABELA_SOLICITACOES}?select=lancamento_id,tipo&status=eq.pendente&lancamento_id=in.(${ids.map(encodeURIComponent).join(',')})`);
        if (stPend >= 200 && stPend < 300 && Array.isArray(pend)) {
          for (const p of pend as Record<string, unknown>[]) if (p.lancamento_id) pendencias[String(p.lancamento_id)] = p.tipo;
        }
      }
      responder(200, { ok: true, lancamentos: corpo, pendencias, total, pagina, limite, meus_emails: meusEmails, vendo_de_todos: email === RESPONSAVEL_EMAIL });
    }
    responder(502, { ok: false, erro: 'Não foi possível carregar os lançamentos recentes.' });
  }

  if (acao === 'carregar') {
    const email = await exigirSessao(fd);
    const id = exigirId(fd, 'Informe o lançamento a abrir.');
    // Ver: qualquer pessoa logada. Editar: só o dono ou o responsável.
    const linha = await buscarLancamento(id);
    responder(200, {
      ok: true, lancamento: linha,
      eh_responsavel: email === RESPONSAVEL_EMAIL,
      pode_editar: await podeAcessar(email, linha.criado_por_email),
      pendente: await solicitacaoPendente(id),
    });
  }

  if (acao === 'editar') {
    const email = await exigirSessao(fd);
    const id = exigirId(fd, 'Informe o lançamento a editar.');
    const atual = await buscarLancamento(id, 'id,criado_por_email,nome_beneficiario');
    if (!(await podeAcessar(email, atual.criado_por_email))) responder(403, { ok: false, erro: 'Você só pode editar os lançamentos que você mesmo fez.' });
    // Edição não troca quem lançou originalmente.
    const registro = lerRegistro(fd, String(atual.criado_por_email ?? ''));
    // Quem não é o responsável não grava direto: vira pedido pendente.
    if (email !== RESPONSAVEL_EMAIL) await criarSolicitacao(atual, 'editar', lerMotivo(fd), email, registro);
    const [status, corpo] = await chamarSupabase('PATCH', `${TABELA}?id=eq.${encodeURIComponent(id)}`, registro, { Prefer: 'return=representation' });
    if (status >= 200 && status < 300) responder(200, { ok: true, registro: Array.isArray(corpo) ? corpo[0] ?? registro : registro });
    responder(502, { ok: false, erro: mensagem(corpo, 'O banco não aceitou a edição.') });
  }

  if (acao === 'excluir') {
    const email = await exigirSessao(fd);
    const id = exigirId(fd, 'Informe o lançamento a excluir.');
    // Só a conta responsável exclui direto — os demais abrem um pedido.
    if (email !== RESPONSAVEL_EMAIL) {
      const atual = await buscarLancamento(id, 'id,criado_por_email,nome_beneficiario');
      if (!(await podeAcessar(email, atual.criado_por_email))) responder(403, { ok: false, erro: 'Você só pode solicitar a exclusão dos lançamentos que você mesmo fez.' });
      await criarSolicitacao(atual, 'excluir', lerMotivo(fd), email, null);
    }
    const [status] = await chamarSupabase('DELETE', `${TABELA}?id=eq.${encodeURIComponent(id)}`);
    if (status >= 200 && status < 300) responder(200, { ok: true });
    responder(502, { ok: false, erro: 'Não foi possível excluir.' });
  }

  if (acao === 'solicitacoes') {
    const email = await exigirSessao(fd);
    if (email !== RESPONSAVEL_EMAIL) responder(403, { ok: false, erro: 'Só a conta responsável vê as solicitações.' });
    // lancamento:... embute o registro atual, pra comparar com o proposto.
    const [status, corpo] = await chamarSupabase('GET',
      `${TABELA_SOLICITACOES}?select=*,lancamento:mecanizacao_lancamentos(*)&status=eq.pendente&order=criado_em.asc`);
    if (status >= 200 && status < 300) responder(200, { ok: true, solicitacoes: corpo });
    responder(502, { ok: false, erro: 'Não foi possível carregar as solicitações. Confira se database/mecanizacao-solicitacoes.sql já foi executado.' });
  }

  // Pessoas (e-mails) que já lançaram, com nome de exibição — mesma regra do PHP.
  if (acao === 'lancadores') {
    const email = await exigirSessao(fd);
    const [status, corpo] = await chamarSupabase('GET',
      '/rest/v1/mecanizacao_lancadores_resumo?select=email,total,ultimo,nome,usuario_email,tecnico&order=email.asc');
    if (status < 200 || status >= 300) {
      responder(502, { ok: false, erro: 'Não foi possível carregar as pessoas. Confira se database/mecanizacao-lancadores.sql já foi executado.' });
    }
    const resposta: Record<string, unknown> = { ok: true, lancadores: corpo, meus_emails: await emailsDoUsuario(email) };
    if (email === RESPONSAVEL_EMAIL) {
      const [stU, us] = await chamarSupabase('GET', '/auth/v1/admin/users?per_page=1000');
      const lista = (us && typeof us === 'object' ? (us as Record<string, unknown>).users : null);
      resposta.usuarios = stU >= 200 && stU < 300 && Array.isArray(lista)
        ? lista.map((u) => String((u as Record<string, unknown>).email ?? '').toLowerCase())
        : [];
    }
    responder(200, resposta);
  }

  if (acao === 'salvar_lancador') {
    const email = await exigirSessao(fd);
    if (email !== RESPONSAVEL_EMAIL) responder(403, { ok: false, erro: 'Só a conta responsável define os nomes.' });
    const alvo = String(fd.get('email') ?? '').trim().toLowerCase();
    if (!alvo) responder(400, { ok: false, erro: 'Informe o e-mail.' });
    const nome = String(fd.get('nome') ?? '').trim();
    const usuario = String(fd.get('usuario_email') ?? '').trim().toLowerCase();
    const [status, corpo] = await chamarSupabase('POST', '/rest/v1/mecanizacao_lancadores?on_conflict=email', {
      email: alvo,
      nome: nome ? nome.slice(0, 120) : null,
      usuario_email: usuario || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: email,
    }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    if (status >= 200 && status < 300) responder(200, { ok: true });
    responder(502, { ok: false, erro: mensagem(corpo, 'Não foi possível salvar.') });
  }

  if (acao === 'resolver') {
    const email = await exigirSessao(fd);
    if (email !== RESPONSAVEL_EMAIL) responder(403, { ok: false, erro: 'Só a conta responsável aprova solicitações.' });
    const id = String(fd.get('id') ?? '');
    const decisao = String(fd.get('decisao') ?? '');
    if (id === '' || !['aprovar', 'recusar'].includes(decisao)) responder(400, { ok: false, erro: 'Solicitação ou decisão inválida.' });
    const [status, corpo] = await chamarSupabase('GET',
      `${TABELA_SOLICITACOES}?select=*&status=eq.pendente&id=eq.${encodeURIComponent(id)}`);
    if (status < 200 || status >= 300 || !Array.isArray(corpo) || !corpo.length) {
      responder(404, { ok: false, erro: 'Solicitação não encontrada ou já resolvida.' });
    }
    const sol = corpo[0] as Record<string, unknown>;
    // Aprovar aplica o pedido no lançamento; recusar só marca o pedido.
    if (decisao === 'aprovar' && sol.lancamento_id) {
      const alvo = `${TABELA}?id=eq.${encodeURIComponent(String(sol.lancamento_id))}`;
      const [st] = sol.tipo === 'excluir'
        ? await chamarSupabase('DELETE', alvo)
        : await chamarSupabase('PATCH', alvo, sol.dados, { Prefer: 'return=minimal' });
      if (st < 200 || st >= 300) responder(502, { ok: false, erro: 'Não foi possível aplicar a solicitação no lançamento.' });
    }
    const [st] = await chamarSupabase('PATCH', `${TABELA_SOLICITACOES}?id=eq.${encodeURIComponent(id)}`, {
      status: decisao === 'aprovar' ? 'aprovada' : 'recusada',
      resolvido_por_email: email,
      resolvido_em: new Date().toISOString(),
    }, { Prefer: 'return=minimal' });
    if (st >= 200 && st < 300) responder(200, { ok: true });
    responder(502, { ok: false, erro: 'Não foi possível registrar a decisão.' });
  }

  responder(400, { ok: false, erro: 'Ação desconhecida.' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (r: Resposta) => new Response(JSON.stringify(r.corpo), {
    status: r.status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (req.method !== 'POST') return json(new Resposta(405, { ok: false, erro: 'Método não permitido.' }));
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(new Resposta(500, { ok: false, erro: 'A função está sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.' }));

  let fd: FormData;
  try { fd = await req.formData(); } catch { return json(new Resposta(400, { ok: false, erro: 'Corpo da requisição inválido.' })); }
  try {
    return await tratar(fd);
  } catch (e) {
    if (e instanceof Resposta) return json(e);
    return json(new Resposta(500, { ok: false, erro: 'Erro inesperado: ' + String(e) }));
  }
});
