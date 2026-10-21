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
  constructor(
    public status: number,
    public corpo: Record<string, unknown>,
    public texto?: string,                       // corpo já serializado (painel em cache): não refaz o JSON
    public cabecalhos: Record<string, string> = {},
  ) {}
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

/** Painel já montado, por perfil (p = público, i = logado), guardado na memória da instância da função.
    Só vale enquanto a versão da base (mecanizacao_versao) for a mesma. */
const CACHE_PAINEL = new Map<string, { versao: string; registrosTexto: string; meta: Record<string, unknown> }>();

const BUCKET_PDF = 'mecanizacao-formularios';
const PDF_MAX_BYTES = 3 * 1024 * 1024;

/** PDF opcional da ficha (campo "pdf"): no máximo 1 arquivo, só PDF, até 3 MB.
    Confere o começo do arquivo ("%PDF-"), não só o que o navegador declarou. */
async function lerPdf(fd: FormData): Promise<Uint8Array | null> {
  const f = fd.get('pdf');
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > PDF_MAX_BYTES) responder(400, { ok: false, erro: 'O PDF deve ter no máximo 3 MB.' });
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') responder(400, { ok: false, erro: 'Anexe somente arquivo PDF.' });
  return bytes;
}

async function enviarPdf(bytes: Uint8Array): Promise<string> {
  const caminho = `${new Date().getFullYear()}/${crypto.randomUUID().replace(/-/g, '')}.pdf`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_PDF}/${caminho}`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE, 'Content-Type': 'application/pdf' },
    body: bytes,
  });
  if (!r.ok) {
    const c = await r.json().catch(() => null);
    responder(502, { ok: false, erro: 'Não foi possível guardar o PDF: ' + mensagem(c, 'erro no armazenamento') + '.' });
  }
  return caminho;
}

/** Já existe lançamento do mesmo CPF, do mesmo serviço e na mesma data de
    vistoria? Um produtor pode ter vários de Mecanização ou Açudagem; só é
    repetido quando os três coincidem. idIgnorar é o próprio lançamento (edição). */
async function lancamentoIgual(cpf: string, tipo: string, data: string, idIgnorar = ''): Promise<Record<string, unknown> | null> {
  const digitos = cpf.replace(/\D/g, '');
  const formatado = digitos.length === 11
    ? `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
    : cpf;
  let caminho = `${TABELA}?select=id,tipo_servico,data_vistoria,nome_beneficiario` +
    `&cpf=in.(${encodeURIComponent(`"${formatado}","${digitos}"`)})` +
    `&tipo_servico=eq.${encodeURIComponent(tipo)}&data_vistoria=eq.${encodeURIComponent(data)}&limit=1`;
  if (idIgnorar) caminho += `&id=neq.${encodeURIComponent(idIgnorar)}`;
  const [st, corpo] = await chamarSupabase('GET', caminho);
  return st >= 200 && st < 300 && Array.isArray(corpo) && corpo.length ? corpo[0] as Record<string, unknown> : null;
}

async function recusarSeRepetido(registro: Record<string, unknown>, idIgnorar = ''): Promise<void> {
  const cpf = String(registro.cpf ?? '');
  const tipo = String(registro.tipo_servico ?? '');
  const data = String(registro.data_vistoria ?? '');
  if (cpf === '' || tipo === '' || data === '') return;
  if (await lancamentoIgual(cpf, tipo, data, idIgnorar)) {
    const [a, m, d] = data.split('-');
    responder(409, { ok: false, erro: `Já existe um lançamento de ${tipo} deste CPF com a mesma data de vistoria (${d}/${m}/${a}). Confira para não duplicar.` });
  }
}

/** Confirma no próprio Supabase quem é o dono do token de sessão do site e
    devolve o e-mail de verdade — nunca o que o navegador afirma sozinho. */
async function emailAutenticado(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + token } });
    // banco instável / limite de requisições: não é sessão vencida — 503 faz o navegador tentar de novo
    if (r.status === 429 || r.status >= 500) throw new Error('indisponivel');
    const usuario = r.ok ? await r.json().catch(() => null) : null;
    return usuario && usuario.email ? String(usuario.email).toLowerCase() : null;
  } catch {
    responder(503, { ok: false, erro: 'Não foi possível confirmar sua sessão agora (o banco não respondeu). Tente novamente em instantes.' });
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
  // data da vistoria e de nascimento não podem ser futuras (UTC: nunca recusa o "hoje" de quem digita no Acre)
  const hojeUtc = new Date().toISOString().slice(0, 10);
  for (const [campoData, rotuloData] of [['data_vistoria', 'A data da vistoria'], ['data_nascimento', 'A data de nascimento']]) {
    const valorData = data(campoData);
    if (valorData !== null && valorData > hojeUtc) responder(400, { ok: false, erro: `${rotuloData} não pode ser futura.` });
  }

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
    // Piscicultura é um serviço da Açudagem (não um implemento): o formulário pergunta "Sim"/"Não"
    piscicultura: txt('tipo_servico') === 'Açudagem' && txt('piscicultura') === 'Sim',
    // Destoca é um serviço da Mecanização (não um implemento): o formulário pergunta "Sim"/"Não"
    destoca: txt('tipo_servico') === 'Mecanização' && txt('destoca') === 'Sim',
    pontos_geo: arr('pontos_geo'),
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
  if (registro.tipo_servico === 'Mecanização' && !['Sim', 'Não'].includes(txt('destoca') ?? '')) {
    responder(400, { ok: false, erro: 'Informe se a Mecanização é para destoca (Sim ou Não).' });
  }
  if (registro.tipo_servico === 'Açudagem' && !['Sim', 'Não'].includes(txt('piscicultura') ?? '')) {
    responder(400, { ok: false, erro: 'Informe se a Açudagem é de piscicultura (Sim ou Não).' });
  }
  if (registro.tipo_servico === 'Açudagem' && !(Number(registro.horas_maquina ?? 0) > 0)) {
    responder(400, { ok: false, erro: 'Informe as horas de máquina para um lançamento de Açudagem.' });
  }
  if ((registro.tipo_servico === 'Mecanização' || registro.tipo_servico === 'Açudagem') && (registro.maquinas as unknown[]).length < 1) {
    responder(400, { ok: false, erro: 'Marque pelo menos uma máquina utilizada.' });
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
    `${TABELA_SOLICITACOES}?select=id,tipo,motivo,solicitado_por_email,criado_em,dados&status=eq.pendente&lancamento_id=eq.${encodeURIComponent(lancamentoId)}`);
  return status >= 200 && status < 300 && Array.isArray(corpo) && corpo.length ? corpo[0] as Record<string, unknown> : null;
}

/** Quantos pedidos de EDIÇÃO desta pessoa estão pendentes desde um dia anterior ao de hoje (fuso do Acre, UTC-5).
    Enquanto o responsável não aprovar/recusar, ela não lança nada novo. Pedido feito hoje não bloqueia; o
    responsável nunca é bloqueado — mesma regra de pendenciasDeDiaAnterior() em lancar_mecanizacao.php. */
async function pendenciasDeDiaAnterior(email: string): Promise<number> {
  if (email === RESPONSAVEL_EMAIL) return 0;
  const hojeNoAcre = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);   // AAAA-MM-DD no Acre
  const inicioHoje = `${hojeNoAcre}T05:00:00Z`;                                            // 00:00 do Acre em UTC
  const [status, corpo] = await chamarSupabase('GET',
    `${TABELA_SOLICITACOES}?select=id&status=eq.pendente&tipo=eq.editar&solicitado_por_email=eq.${encodeURIComponent(email)}&criado_em=lt.${encodeURIComponent(inicioHoje)}`);
  return status >= 200 && status < 300 && Array.isArray(corpo) ? corpo.length : 0;
}

const MSG_BLOQUEIO_PENDENCIA = 'Você tem solicitação de alteração pendente de um dia anterior. Para fazer novos lançamentos, digite o código de liberação que o administrador vai te passar.';

/* ------------------------------------------- código de liberação (pendência) --
   Com pedido de edição pendente de um dia anterior, a pessoa só lança depois de
   digitar um código gerado pelo sistema (database/mecanizacao-codigos-liberacao.sql).
   O código é aleatório e único para sempre (coluna "codigo" única, linhas nunca
   apagadas); quem digita fica registrado com data e hora (usado_em) e a conta
   responsável vê isso na aba de solicitações. Código usado vale pelo resto do dia
   (Acre); no dia seguinte, se a pendência continuar, pede outro. */
const TABELA_CODIGOS = '/rest/v1/mecanizacao_codigos_liberacao';
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O/1/I: não confunde ao ler ou digitar

const inicioDeHojeAcre = () => `${new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)}T05:00:00Z`;
const normalizarCodigo = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function gerarCodigo(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => ALFABETO_CODIGO[x % ALFABETO_CODIGO.length]).join('');
}

/** Já digitou um código hoje? Então a pendência não bloqueia até a virada do dia. */
async function liberadoHoje(email: string): Promise<boolean> {
  const [st, c] = await chamarSupabase('GET',
    `${TABELA_CODIGOS}?select=id&usuario_email=eq.${encodeURIComponent(email)}&usado_em=gte.${encodeURIComponent(inicioDeHojeAcre())}&limit=1`);
  return st >= 200 && st < 300 && Array.isArray(c) && c.length > 0;
}

/** Garante que a pessoa bloqueada tenha um código aguardando ser digitado e o devolve (aparece na janela dela
    e na aba de solicitações do responsável). */
async function garantirCodigoAberto(email: string): Promise<string> {
  const [st, c] = await chamarSupabase('GET',
    `${TABELA_CODIGOS}?select=codigo&usuario_email=eq.${encodeURIComponent(email)}&usado_em=is.null&limit=1`);
  if (st >= 200 && st < 300 && Array.isArray(c) && c.length) return String((c[0] as Record<string, unknown>).codigo);
  for (let i = 0; i < 5; i++) {   // 409 = código já existiu (nunca repete): sorteia outro
    const codigo = gerarCodigo();
    const [s2] = await chamarSupabase('POST', TABELA_CODIGOS, { codigo, usuario_email: email }, { Prefer: 'return=minimal' });
    if (s2 >= 200 && s2 < 300) return codigo;
    if (s2 !== 409) return '';
  }
  return '';
}

/** Cada pendência de dia anterior dá direito a no máximo 3 códigos (3 dias). Passou disso, só o responsável
    destrava: aprovando ou recusando os pedidos pendentes da pessoa. */
const MAX_CODIGOS = 3;
const MSG_TRAVADO = 'Você já usou os 3 códigos de liberação e ainda tem solicitação de alteração pendente. Você só volta a fazer lançamentos quando o administrador aprovar ou recusar as alterações pendentes.';

/** Códigos que a pessoa já digitou desde o pedido pendente mais antigo (desde = criado_em dele). */
async function codigosUsadosDesde(email: string, desde: string): Promise<{ codigo: string; usado_em: string }[]> {
  const [st, c] = await chamarSupabase('GET',
    `${TABELA_CODIGOS}?select=codigo,usado_em&usuario_email=eq.${encodeURIComponent(email)}&usado_em=gte.${encodeURIComponent(desde)}&order=usado_em.asc`);
  return st >= 200 && st < 300 && Array.isArray(c) ? c as { codigo: string; usado_em: string }[] : [];
}

/** Situação de quem tem pedido de edição pendente de dia anterior:
    livre (nada a fazer), codigo (precisa digitar o código mostrado) ou travado (já gastou os 3 códigos). */
async function situacaoBloqueio(email: string): Promise<{ estado: 'livre' | 'codigo' | 'travado'; codigo?: string; restantes?: number }> {
  if (email === RESPONSAVEL_EMAIL) return { estado: 'livre' };
  const [st, c] = await chamarSupabase('GET',
    `${TABELA_SOLICITACOES}?select=criado_em&status=eq.pendente&tipo=eq.editar&solicitado_por_email=eq.${encodeURIComponent(email)}` +
    `&criado_em=lt.${encodeURIComponent(inicioDeHojeAcre())}&order=criado_em.asc&limit=1`);
  if (!(st >= 200 && st < 300 && Array.isArray(c) && c.length)) return { estado: 'livre' };
  if (await liberadoHoje(email)) return { estado: 'livre' };
  const usados = await codigosUsadosDesde(email, String((c[0] as Record<string, unknown>).criado_em));
  if (usados.length >= MAX_CODIGOS) return { estado: 'travado' };
  return { estado: 'codigo', codigo: await garantirCodigoAberto(email), restantes: MAX_CODIGOS - usados.length };
}

/** Responde "bloqueio" e fala o mesmo nos erros do "salvar". */
function corpoBloqueio(s: { estado: string; codigo?: string; restantes?: number }): Record<string, unknown> {
  return {
    bloqueado: s.estado !== 'livre', exige_codigo: s.estado === 'codigo', travado: s.estado === 'travado',
    codigo: s.codigo ?? '', restantes: s.restantes ?? 0,
    erro: s.estado === 'travado' ? MSG_TRAVADO : s.estado === 'codigo' ? MSG_BLOQUEIO_PENDENCIA : '',
  };
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

/** Intervalos [início, fim) de criado_em (dia do Acre, UTC-5) que batem com ano/mês/dia (0 = qualquer).
    Sem ano, vale cada ano desde 2023 — o PostgREST não filtra "dia/mês" de uma data sozinho.
    Mesma regra de intervalosDeData() em lancar_mecanizacao.php. */
function intervalosDeData(ano: number, mes: number, dia: number): [string, string][] {
  const iso = (t: number) => new Date(t).toISOString().slice(0, 19) + 'Z';
  const anoAtual = new Date(Date.now() - 5 * 3600 * 1000).getUTCFullYear();
  const anos = ano > 0 ? [ano] : Array.from({ length: Math.max(1, anoAtual - 2022) }, (_, i) => 2023 + i);
  const meses = mes > 0 ? [mes] : Array.from({ length: 12 }, (_, i) => i + 1);
  const lista: [string, string][] = [];
  for (const a of anos) {
    for (const m of meses) {
      if (dia > 0) {
        const ini = Date.UTC(a, m - 1, dia, 5);
        if (new Date(ini).getUTCDate() !== dia) continue;   // ex.: 31/02
        lista.push([iso(ini), iso(ini + 86400000)]);
      } else {
        lista.push([iso(Date.UTC(a, m - 1, 1, 5)), iso(Date.UTC(a, m, 1, 5))]);
      }
    }
  }
  return lista;
}

/** Filtro "só com alteração pendente": lançamentos com pedido de EDIÇÃO aguardando aprovação. */
async function filtroSoPendentes(): Promise<string> {
  const [status, corpo] = await chamarSupabase('GET',
    `${TABELA_SOLICITACOES}?select=lancamento_id&status=eq.pendente&tipo=eq.editar&lancamento_id=not.is.null&limit=1000`);
  const ids = status >= 200 && status < 300 && Array.isArray(corpo)
    ? (corpo as Record<string, unknown>[]).map((p) => String(p.lancamento_id ?? '')).filter(Boolean) : [];
  return ids.length ? `&id=in.(${ids.map(encodeURIComponent).join(',')})` : '&id=eq.00000000-0000-0000-0000-000000000000';
}

/** Filtros da lista (campos "f_*") no formato do PostgREST — mesma regra de
    filtrosDaLista() em lancar_mecanizacao.php. */
function filtrosDaLista(fd: FormData, emailsDoLogin: string[], veTodos = false): string {
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
  // Dia e/ou mês da inserção (junto com o ano, se escolhido)
  const mes = parseInt(f('f_mes'), 10) || 0, dia = parseInt(f('f_dia'), 10) || 0;
  const mesOk = mes >= 1 && mes <= 12 ? mes : 0, diaOk = dia >= 1 && dia <= 31 ? dia : 0;
  if (mesOk || diaOk) {
    const ints = intervalosDeData(/^\d{4}$/.test(f('f_ano')) ? parseInt(f('f_ano'), 10) : 0, mesOk, diaOk);
    q += ints.length
      ? `&and=(or(${ints.map(([a, b]) => `and(criado_em.gte.${encodeURIComponent(a)},criado_em.lt.${encodeURIComponent(b)})`).join(',')}))`
      : '&id=eq.00000000-0000-0000-0000-000000000000';   // data inexistente: nada bate
  }
  // "Lançado por": só o responsável (root) escolhe "todos" ou outra pessoa; os demais veem só os próprios.
  const pessoa = veTodos ? f('f_pessoa') : '';
  if (pessoa === '') q += filtroEmails(emailsDoLogin);
  else if (pessoa !== 'todos') q += filtroEmails(pessoa.split(',').map((e) => e.trim().toLowerCase()));
  return q;
}

function exigirId(fd: FormData, msg: string): string {
  const id = String(fd.get('id') ?? '');
  if (id === '') responder(400, { ok: false, erro: msg });
  return id;
}


/* ------------------------------------------------------- painel (público) --
   O painel da mecanização lê os lançamentos direto daqui. Devolve o MESMO
   formato de data/mecanizacao.json (um registro por ficha), só com o que os
   gráficos usam: nada de CPF, telefone ou data de nascimento. Não exige login —
   é o que a versão pública do painel também lê. */
const NAO_INFORMADO = 'Não informado';
const CAMPOS_PAINEL = 'criado_em,criado_por_email,tipo_servico,data_vistoria,escritorio_local,responsavel_tecnico,' +
  'nome_beneficiario,sexo,estado_civil,possui_dap,associacao_cooperativa,endereco,nome_propriedade,municipio,' +
  'culturas,area_total_ha,horas_maquina,quantidade_acudes,pontos_geo,tipo_uso,maquinas,implementos,daes,piscicultura,destoca,' +
  'observacao,formulario_url';

function nomeSugeridoDoEmail(email: string): string {
  const u = email.split('@')[0].replace(/\d+/g, ' ').replace(/[._-]+/g, ' ').trim();
  return u.replace(/\S+/g, (p) => p.charAt(0).toUpperCase() + p.slice(1)) || email;
}

/** pontos_geo [{ponto, x, y, zona}] -> { geo: [[x, y, zona], ...] } (ou nada, se não houver ponto válido). */
function geoPontos(v: unknown): Record<string, unknown> {
  if (!Array.isArray(v)) return {};
  const pts: number[][] = [];
  for (const p of v as Record<string, unknown>[]) {
    const x = Number(p?.x), y = Number(p?.y), z = Math.trunc(Number(p?.zona));
    if (isFinite(x) && isFinite(y) && x > 0 && y > 0) pts.push([x, y, isFinite(z) ? z : 0]);
  }
  return pts.length ? { geo: pts } : {};
}

function paraRegistroPainel(l: Record<string, unknown>, nomes: Map<string, string>, logado: boolean): Record<string, unknown> {
  const ou = (v: unknown, padrao = NAO_INFORMADO) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : padrao);
  const numero = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x !== '') : []);
  // data do lançamento no horário de Rio Branco (UTC-5, sem horário de verão)
  const criado = new Date(String(l.criado_em));
  const d = new Date(criado.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const email = String(l.criado_por_email ?? '').trim().toLowerCase();
  const sexo = String(l.sexo ?? '');
  const culturas = (Array.isArray(l.culturas) ? l.culturas : []) as Record<string, unknown>[];
  const daes = (Array.isArray(l.daes) ? l.daes : []) as Record<string, unknown>[];
  return {
    d,
    // hora do lançamento em Rio Branco (HH:MM): usada para marcar inserções fora do expediente
    h: new Date(criado.getTime() - 5 * 3600 * 1000).toISOString().slice(11, 16),
    ex: d.slice(0, 4),
    dv: typeof l.data_vistoria === 'string' ? l.data_vistoria : '',
    pc: ou(l.tipo_servico),
    mun: ou(l.municipio),
    esc: ou(l.escritorio_local),
    rt: ou(l.responsavel_tecnico),
    alim: (email && (nomes.get(email) || nomeSugeridoDoEmail(email))) || NAO_INFORMADO,
    prod: ou(l.nome_beneficiario),
    sexo: /^f/i.test(sexo) ? 'Feminino' : /^m/i.test(sexo) ? 'Masculino' : NAO_INFORMADO,
    ec: ou(l.estado_civil),
    dap: ou(l.possui_dap),
    assoc: ou(l.associacao_cooperativa),
    // endereço e link do formulário digitalizado: só para quem está logado (a versão pública não recebe)
    loc: logado ? ou(l.endereco, '') : '',
    propr: ou(l.nome_propriedade, ''),
    cult: culturas
      .map((c) => [String(c.cultura ?? '').trim(), numero(c.area_ha), String(c.sistema_cultivo ?? '').trim()])
      .filter((c) => c[0] !== ''),
    ha: numero(l.area_total_ha),
    hrs: numero(l.horas_maquina),
    ac: Math.trunc(numero(l.quantidade_acudes)),
    pisc: l.piscicultura === true,
    dest: l.destoca === true,
    tt: ou(l.tipo_uso),
    maq: lista(l.maquinas),
    impl: lista(l.implementos),
    dae: daes.reduce((a, x) => a + numero(x.valor), 0),
    form: logado && typeof l.formulario_url === 'string' ? l.formulario_url : '',
    // id do lançamento: só para quem está logado (liga a linha ao PDF da ficha)
    ...(logado && l.id ? { id: String(l.id) } : {}),
    obs: ou(l.observacao, ''),
    _geo: Array.isArray(l.pontos_geo) && l.pontos_geo.length > 0,
    // coordenadas UTM [x, y, zona]: só para quem está logado (localização da propriedade)
    ...(logado ? geoPontos(l.pontos_geo) : {}),
  };
}

/** Todos os registros do painel numa consulta só (função mecanizacao_painel_bruto): antes eram 4 páginas de 1.000
    linhas lidas em sequência, cada uma com sua ida e volta ao banco. Se o SQL ainda não foi aplicado (404), volta
    ao jeito antigo, paginado. */
async function lerRegistrosBrutos(): Promise<Record<string, unknown>[]> {
  const [st0, corpo0] = await chamarSupabase('POST', '/rest/v1/rpc/mecanizacao_painel_bruto', {});
  if (st0 >= 200 && st0 < 300 && Array.isArray(corpo0)) return corpo0 as Record<string, unknown>[];
  if (st0 !== 404) responder(502, { ok: false, erro: mensagem(corpo0, 'Não foi possível ler os lançamentos.') });
  const out: Record<string, unknown>[] = [];
  const TAM = 1000;
  for (let pagina = 0; pagina < 100; pagina++) {
    const [st, corpo] = await chamarSupabase('GET',
      `${TABELA}?select=${CAMPOS_PAINEL}&order=criado_em.asc,id.asc&limit=${TAM}&offset=${pagina * TAM}`);
    if (st < 200 || st >= 300 || !Array.isArray(corpo)) {
      responder(502, { ok: false, erro: mensagem(corpo, 'Não foi possível ler os lançamentos.') });
    }
    out.push(...(corpo as Record<string, unknown>[]));
    if ((corpo as unknown[]).length < TAM) break;
  }
  return out;
}

async function lerNomesDeExibicao(): Promise<Map<string, string>> {
  // nomes de exibição definidos pelo responsável (tela "Pessoas")
  const nomes = new Map<string, string>();
  const [stN, ln] = await chamarSupabase('GET', '/rest/v1/mecanizacao_lancadores?select=email,nome');
  if (stN >= 200 && stN < 300 && Array.isArray(ln)) {
    for (const x of ln as Record<string, unknown>[]) {
      const e = String(x.email ?? '').trim().toLowerCase();
      const n = typeof x.nome === 'string' ? x.nome.trim() : '';
      if (e && n) nomes.set(e, n);
    }
  }
  return nomes;
}

/** Contador de versão da base (mecanizacao_versao): sobe a cada gravação. Uma leitura de uma linha — é o que
    permite responder "nada mudou" e servir o painel do cache sem reler nem recalcular nada. Vazio = sem contador. */
async function versaoDaBase(): Promise<string> {
  const [st, c] = await chamarSupabase('GET', '/rest/v1/mecanizacao_versao?select=n&id=eq.1');
  if (st >= 200 && st < 300 && Array.isArray(c) && c[0] && c[0].n != null) return String((c[0] as Record<string, unknown>).n);
  return '';
}

async function montarPacotePainel(logado: boolean): Promise<Record<string, unknown>> {
  const [nomes, brutos] = await Promise.all([lerNomesDeExibicao(), lerRegistrosBrutos()]);
  const registros: Record<string, unknown>[] = [];
  for (const l of brutos) registros.push(paraRegistroPainel(l, nomes, logado));
  let semGeo = 0, semForm = 0, outroAno = 0;
  const produtores = new Set<string>();
  for (const r of registros) {
    if (!r._geo) semGeo++;
    if (!r.form && logado) semForm++;
    if (r.dv && String(r.dv).slice(0, 4) !== String(r.d).slice(0, 4)) outroAno++;
    produtores.add(String(r.prod).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim());
    delete r._geo;
  }
  const agora = new Date(Date.now() - 5 * 3600 * 1000);
  const dia = agora.toISOString().slice(0, 10).split('-').reverse().join('/');
  return {
    ok: true,
    meta: {
      fonte: 'lancamentos',
      arquivo: 'lançamentos do sistema',
      aba: 'mecanizacao_lancamentos',
      gerado_em: dia + ' ' + agora.toISOString().slice(11, 16),
      registros: registros.length,
      produtores: produtores.size,
      periodo: registros.length ? [String(registros[0].d), String(registros[registros.length - 1].d)] : ['', ''],
      qualidade: { sem_data_valida: 0, vistoria_outro_ano: outroAno, sem_geo: semGeo, sem_formulario: logado ? semForm : 0, acudes_texto: 0 },
    },
    registros,
  };
}

async function tratar(fd: FormData): Promise<never> {
  const acao = String(fd.get('acao') ?? '');

  // público: o painel lê os lançamentos sem login (só campos agregáveis, sem dado pessoal)
  if (acao === 'painel') {
    const t0 = Date.now();
    const token = String(fd.get('token') ?? '');
    // sessão (só quando há token) e versão da base andam juntas: uma ida e volta, não duas
    const [email, ver] = await Promise.all([token ? emailAutenticado(token) : Promise.resolve(null), versaoDaBase()]);
    const logado = email !== null;
    const chave = logado ? 'i' : 'p';
    let versao = ver ? ver + '-' + chave : '';
    const t1 = Date.now();
    // o navegador já tem esta versão: não reenvia a base
    if (versao && String(fd.get('versao') ?? '') === versao) {
      responder(200, { ok: true, igual: true, versao });
    }
    let c = versao ? CACHE_PAINEL.get(chave) : undefined;
    let estado = 'hit';
    if (!c || c.versao !== versao) {
      estado = 'miss';
      const pacote = await montarPacotePainel(logado);
      const registrosTexto = JSON.stringify(pacote.registros);
      if (!versao) {
        // sem contador no banco: resumo (FNV-1a) do conteúdo, como antes
        let h = 0x811c9dc5;
        for (let i = 0; i < registrosTexto.length; i++) { h ^= registrosTexto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        versao = h.toString(16) + '-' + registrosTexto.length + '-' + chave;
        if (String(fd.get('versao') ?? '') === versao) responder(200, { ok: true, igual: true, versao });
      }
      c = { versao, registrosTexto, meta: pacote.meta as Record<string, unknown> };
      if (ver) CACHE_PAINEL.set(chave, c);
    }
    // a hora de leitura é a de agora; os registros vêm prontos (texto) do cache
    const agora = new Date(Date.now() - 5 * 3600 * 1000);
    const meta = { ...c.meta, gerado_em: agora.toISOString().slice(0, 10).split('-').reverse().join('/') + ' ' + agora.toISOString().slice(11, 16) };
    const texto = '{"ok":true,"meta":' + JSON.stringify(meta) + ',"registros":' + c.registrosTexto + ',"versao":' + JSON.stringify(c.versao) + '}';
    throw new Resposta(200, {}, texto, {
      'Server-Timing': `sessao_versao;dur=${t1 - t0}, total;dur=${Date.now() - t0}`,
      'X-Painel-Cache': estado,
    });
  }

  // A tela consulta antes de abrir o formulário, para avisar já no botão "Novo relatório".
  if (acao === 'bloqueio') {
    const email = await exigirSessao(fd);
    responder(200, { ok: true, ...corpoBloqueio(await situacaoBloqueio(email)) });
  }

  // A pessoa digita o código de liberação: vale uma vez só e fica registrado com a hora.
  if (acao === 'liberar') {
    const email = await exigirSessao(fd);
    const codigo = normalizarCodigo(fd.get('codigo'));
    if (codigo === '') responder(400, { ok: false, erro: 'Digite o código de liberação.' });
    if ((await situacaoBloqueio(email)).estado === 'travado') responder(403, { ok: false, travado: true, erro: MSG_TRAVADO });
    const [st, c] = await chamarSupabase('PATCH',
      `${TABELA_CODIGOS}?codigo=eq.${encodeURIComponent(codigo)}&usuario_email=eq.${encodeURIComponent(email)}&usado_em=is.null`,
      { usado_em: new Date().toISOString() }, { Prefer: 'return=representation' });
    if (st >= 200 && st < 300 && Array.isArray(c) && c.length) responder(200, { ok: true });
    responder(403, { ok: false, erro: 'Código inválido ou já utilizado.' });
  }

  // Só a conta responsável: códigos gerados e quem já digitou (e quando).
  if (acao === 'codigos') {
    const email = await exigirSessao(fd);
    if (email !== RESPONSAVEL_EMAIL) responder(403, { ok: false, erro: 'Só a conta responsável vê os códigos de liberação.' });
    const [st, c] = await chamarSupabase('GET', `${TABELA_CODIGOS}?select=codigo,usuario_email,criado_em,usado_em&order=criado_em.desc&limit=200`);
    if (st >= 200 && st < 300 && Array.isArray(c)) {
      // quem já gastou os 3 códigos e continua com pedido pendente: o responsável precisa aprovar/recusar
      const [sp, pend] = await chamarSupabase('GET',
        `${TABELA_SOLICITACOES}?select=solicitado_por_email,criado_em&status=eq.pendente&tipo=eq.editar&criado_em=lt.${encodeURIComponent(inicioDeHojeAcre())}&order=criado_em.asc`);
      const desde = new Map<string, string>();
      if (sp >= 200 && sp < 300 && Array.isArray(pend)) {
        for (const p of pend as Record<string, unknown>[]) {
          const e = String(p.solicitado_por_email ?? '').toLowerCase();
          if (e && !desde.has(e)) desde.set(e, String(p.criado_em));
        }
      }
      const travados: Record<string, unknown>[] = [];
      for (const [e, d] of desde) {
        const usados = (c as Record<string, unknown>[]).filter((x) => String(x.usuario_email).toLowerCase() === e && x.usado_em && String(x.usado_em) >= d);
        if (usados.length >= MAX_CODIGOS) travados.push({ usuario_email: e, desde: d, usos: usados.length });
      }
      responder(200, { ok: true, codigos: c, travados });
    }
    responder(502, { ok: false, erro: 'Não foi possível carregar os códigos. Confira se database/mecanizacao-codigos-liberacao.sql já foi executado.' });
  }

  if (acao === 'salvar') {
    const email = await exigirSessao(fd);
    const situacao = await situacaoBloqueio(email);
    if (situacao.estado !== 'livre') responder(403, { ok: false, ...corpoBloqueio(situacao) });
    const registro = lerRegistro(fd, email);
    await recusarSeRepetido(registro);
    // PDF opcional da ficha: validado antes de gravar o lançamento.
    const pdf = await lerPdf(fd);
    if (pdf) registro.pdf_arquivo = await enviarPdf(pdf);
    const [status, corpo] = await chamarSupabase('POST', TABELA, registro, { Prefer: 'return=representation' });
    if (status >= 200 && status < 300) responder(200, { ok: true, registro: Array.isArray(corpo) ? corpo[0] ?? registro : registro });
    // o lançamento não entrou: não deixa o PDF órfão no Storage
    if (registro.pdf_arquivo) await chamarSupabase('DELETE', `/storage/v1/object/${BUCKET_PDF}/${registro.pdf_arquivo}`);
    responder(502, { ok: false, erro: mensagem(corpo, 'O banco não aceitou o lançamento.') });
  }

  if (acao === 'listar') {
    const email = await exigirSessao(fd);
    const limite = Math.max(1, Math.min(100, parseInt(String(fd.get('limite') ?? '20'), 10) || 20));
    const pagina = Math.max(1, parseInt(String(fd.get('pagina') ?? '1'), 10) || 1);
    // Cada pessoa vê só os próprios lançamentos; só o responsável (root) vê os dos outros.
    const meusEmails = await emailsDoUsuario(email);
    let filtro = filtrosDaLista(fd, meusEmails, email === RESPONSAVEL_EMAIL);
    if (String(fd.get('f_pendente') ?? '').trim() === '1') filtro += await filtroSoPendentes();
    // Padrão: mais recente primeiro. A tela pode ordenar por outra coluna (só as da lista abaixo).
    const colunasOrdenaveis = ['criado_em', 'tipo_servico', 'nome_beneficiario', 'municipio', 'escritorio_local', 'data_vistoria',
      'area_total_ha', 'horas_maquina', 'quantidade_acudes', 'criado_por_email'];
    const pedidaOrdem = String(fd.get('ordem') ?? '');
    const colunaOrdem = colunasOrdenaveis.includes(pedidaOrdem) ? pedidaOrdem : 'criado_em';
    const sentidoOrdem = String(fd.get('dir') ?? '') === 'asc' ? 'asc' : 'desc';
    let [status, corpo, headersResp] = await chamarSupabase('GET',
      `${TABELA}?select=id,criado_em,criado_por_email,tipo_servico,nome_beneficiario,` +
      'municipio,escritorio_local,data_vistoria,area_total_ha,horas_maquina,quantidade_acudes' +
      `${filtro}&order=${colunaOrdem}.${sentidoOrdem}.nullslast,id.desc&limit=${limite}&offset=${(pagina - 1) * limite}`,
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

  if (acao === 'duplicado') {
    await exigirSessao(fd);
    const cpf = String(fd.get('cpf') ?? '').trim();
    const tipo = String(fd.get('tipo_servico') ?? '').trim();
    const data = String(fd.get('data_vistoria') ?? '').trim();
    if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpf) || tipo === '' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      responder(400, { ok: false, erro: 'Informe CPF, serviço e data da vistoria.' });
    }
    const igual = await lancamentoIgual(cpf, tipo, data, String(fd.get('id') ?? ''));
    responder(200, { ok: true, itens: igual ? [igual] : [] });
  }

  if (acao === 'tecnicos') {
    await exigirSessao(fd);
    // técnico x município x escritório, contados nos lançamentos do banco
    const contagem = new Map<string, { m: string; e: string; t: string; n: number }>();
    const maquinas: Record<string, number> = {};
    const implementos: Record<string, number> = {};
    // cultura → sistema de cultivo → quantos lançamentos usaram essa combinação
    // (sugere o sistema de cultivo sozinho quando a pessoa escolhe a cultura)
    const culturas: Record<string, Record<string, number>> = {};
    // máquina → uso (Agrícola/Não agrícola) → quantos lançamentos com essa
    // máquina marcaram esse uso (sugere o uso sozinho ao marcar a máquina)
    const usoMaquinas: Record<string, Record<string, number>> = {};
    const tam = 1000;
    for (let pagina = 0; pagina < 100; pagina++) {
      const [st, corpo] = await chamarSupabase('GET',
        `${TABELA}?select=municipio,escritorio_local,responsavel_tecnico,maquinas,implementos,culturas,tipo_uso&order=id.asc&limit=${tam}&offset=${pagina * tam}`);
      if (st < 200 || st >= 300 || !Array.isArray(corpo)) responder(502, { ok: false, erro: 'Não foi possível ler os técnicos.' });
      for (const l of corpo as Record<string, unknown>[]) {
        for (const [campo, destino] of [['maquinas', maquinas], ['implementos', implementos]] as const) {
          const valores = l[campo];
          if (!Array.isArray(valores)) continue;
          for (const v of valores) {
            const nome = String(v ?? '').trim();
            if (nome !== '') destino[nome] = (destino[nome] ?? 0) + 1;
          }
        }
        if (Array.isArray(l.culturas)) {
          for (const c of l.culturas as Record<string, unknown>[]) {
            const nome = String((c && c.cultura) ?? '').trim();
            const sistema = String((c && c.sistema_cultivo) ?? '').trim();
            if (nome === '' || sistema === '') continue;
            const destino = culturas[nome] ?? (culturas[nome] = {});
            destino[sistema] = (destino[sistema] ?? 0) + 1;
          }
        }
        const uso = String(l.tipo_uso ?? '').trim();
        if (uso !== '' && Array.isArray(l.maquinas)) {
          for (const v of l.maquinas as unknown[]) {
            const nomeMaq = String(v ?? '').trim();
            if (nomeMaq === '') continue;
            const destino = usoMaquinas[nomeMaq] ?? (usoMaquinas[nomeMaq] = {});
            destino[uso] = (destino[uso] ?? 0) + 1;
          }
        }
        const m = String(l.municipio ?? '').trim();
        const e = String(l.escritorio_local ?? '').trim();
        const t = String(l.responsavel_tecnico ?? '').replace(/\s+/g, ' ').trim();
        if (m === '' || t === '') continue;
        const k = `${m}\x1f${e}\x1f${t}`;
        const atual = contagem.get(k);
        if (atual) atual.n++; else contagem.set(k, { m, e, t, n: 1 });
      }
      if (corpo.length < tam) break;
    }
    responder(200, { ok: true, itens: [...contagem.values()], maquinas, implementos, culturas, uso_maquinas: usoMaquinas });
  }

  if (acao === 'pdf') {
    await exigirSessao(fd);
    const id = exigirId(fd, 'Informe o lançamento.');
    const linha = await buscarLancamento(id, 'id,pdf_arquivo');
    const arquivo = String(linha.pdf_arquivo ?? '');
    if (arquivo === '') responder(404, { ok: false, erro: 'Este lançamento não tem PDF anexado.' });
    // link temporário (5 min): o bucket é privado
    const [st, corpo] = await chamarSupabase('POST', `/storage/v1/object/sign/${BUCKET_PDF}/${arquivo}`, { expiresIn: 300 });
    const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
    const assinado = String(c.signedURL ?? c.signedUrl ?? '');
    if (st < 200 || st >= 300 || assinado === '') responder(502, { ok: false, erro: 'Não foi possível abrir o PDF.' });
    responder(200, { ok: true, url: `${SUPABASE_URL}/storage/v1${assinado}` });
  }

  if (acao === 'carregar') {
    const email = await exigirSessao(fd);
    const id = exigirId(fd, 'Informe o lançamento a abrir.');
    // Ver e editar: só o dono ou o responsável.
    const linha = await buscarLancamento(id);
    if (!(await podeAcessar(email, linha.criado_por_email))) responder(403, { ok: false, erro: 'Você só pode ver os lançamentos que você mesmo fez.' });
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
    await recusarSeRepetido(registro, id);
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
      '/rest/v1/mecanizacao_lancadores_resumo?select=email,total,ultimo,nome,usuario_email,tecnico,municipio,municipios,municipio_definido&order=email.asc');
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
    const registro: Record<string, unknown> = {
      email: alvo,
      nome: nome ? nome.slice(0, 120) : null,
      usuario_email: usuario || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: email,
    };
    // município só muda quando vem no pedido (vazio = volta ao automático)
    if (fd.has('municipio')) {
      const municipio = String(fd.get('municipio') ?? '').trim();
      registro.municipio = municipio ? municipio.slice(0, 80) : null;
    }
    const [status, corpo] = await chamarSupabase('POST', '/rest/v1/mecanizacao_lancadores?on_conflict=email', registro,
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    if (status < 200 || status >= 300) responder(502, { ok: false, erro: mensagem(corpo, 'Não foi possível salvar.') });
    // Município definido vale também para TODAS as fichas desse e-mail
    // (vazio desfaz) — mecanizacao_definir_municipio no banco.
    let fichas: number | null = null;
    if ('municipio' in registro) {
      const [stM, corpoM] = await chamarSupabase('POST', '/rest/v1/rpc/mecanizacao_definir_municipio',
        { p_email: alvo, p_municipio: registro.municipio });
      if (stM < 200 || stM >= 300) responder(502, { ok: false, erro: 'O nome foi salvo, mas não foi possível mudar o município das fichas.' });
      fichas = typeof corpoM === 'number' ? corpoM : null;
    }
    responder(200, { ok: true, fichas_alteradas: fichas });
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
  const json = (r: Resposta) => new Response(r.texto ?? JSON.stringify(r.corpo), {
    status: r.status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...r.cabecalhos },
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
