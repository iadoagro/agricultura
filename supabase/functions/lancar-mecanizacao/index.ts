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
): Promise<[number, unknown]> {
  try {
    const r = await fetch(SUPABASE_URL + caminho, {
      method: metodo,
      headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE, 'Content-Type': 'application/json', ...extras },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
    return [r.status, json];
  } catch (e) {
    return [0, { msg: String(e) }];
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

const podeAcessar = (email: string, dono: unknown) =>
  email === RESPONSAVEL_EMAIL || String(dono ?? '').toLowerCase() === email;

async function buscarLancamento(id: string, select = '*'): Promise<Record<string, unknown>> {
  const [status, corpo] = await chamarSupabase('GET', `${TABELA}?id=eq.${encodeURIComponent(id)}&select=${select}`);
  if (status < 200 || status >= 300 || !Array.isArray(corpo) || !corpo.length) {
    responder(404, { ok: false, erro: 'Lançamento não encontrado.' });
  }
  return corpo[0] as Record<string, unknown>;
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
    const filtro = email === RESPONSAVEL_EMAIL ? '' : '&criado_por_email=eq.' + encodeURIComponent(email);
    const [status, corpo] = await chamarSupabase('GET',
      `${TABELA}?select=id,criado_em,criado_por_email,tipo_servico,nome_beneficiario,` +
      'municipio,escritorio_local,data_vistoria,area_total_ha,horas_maquina,quantidade_acudes' +
      `${filtro}&order=criado_em.desc&limit=${limite}`);
    if (status >= 200 && status < 300) responder(200, { ok: true, lancamentos: corpo, vendo_de_todos: email === RESPONSAVEL_EMAIL });
    responder(502, { ok: false, erro: 'Não foi possível carregar os lançamentos recentes.' });
  }

  if (acao === 'carregar') {
    const email = await exigirSessao(fd);
    const id = exigirId(fd, 'Informe o lançamento a abrir.');
    const linha = await buscarLancamento(id);
    if (!podeAcessar(email, linha.criado_por_email)) responder(403, { ok: false, erro: 'Você só pode abrir os lançamentos que você mesmo fez.' });
    responder(200, { ok: true, lancamento: linha });
  }

  if (acao === 'editar') {
    const email = await exigirSessao(fd);
    const id = exigirId(fd, 'Informe o lançamento a editar.');
    const atual = await buscarLancamento(id, 'criado_por_email');
    if (!podeAcessar(email, atual.criado_por_email)) responder(403, { ok: false, erro: 'Você só pode editar os lançamentos que você mesmo fez.' });
    // Edição não troca quem lançou originalmente.
    const registro = lerRegistro(fd, String(atual.criado_por_email ?? ''));
    const [status, corpo] = await chamarSupabase('PATCH', `${TABELA}?id=eq.${encodeURIComponent(id)}`, registro, { Prefer: 'return=representation' });
    if (status >= 200 && status < 300) responder(200, { ok: true, registro: Array.isArray(corpo) ? corpo[0] ?? registro : registro });
    responder(502, { ok: false, erro: mensagem(corpo, 'O banco não aceitou a edição.') });
  }

  if (acao === 'excluir') {
    const email = await exigirSessao(fd);
    if (email !== RESPONSAVEL_EMAIL) responder(403, { ok: false, erro: 'Só a conta responsável pode excluir lançamentos.' });
    const id = exigirId(fd, 'Informe o lançamento a excluir.');
    const [status] = await chamarSupabase('DELETE', `${TABELA}?id=eq.${encodeURIComponent(id)}`);
    if (status >= 200 && status < 300) responder(200, { ok: true });
    responder(502, { ok: false, erro: 'Não foi possível excluir.' });
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
