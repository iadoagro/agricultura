// Edge Function do Supabase — mesma lógica de admin_usuarios.php, mas roda
// no próprio Supabase, então funciona com o site publicado no GitHub Pages
// (que não executa PHP). A chave service_role vem do ambiente da função
// (SUPABASE_SERVICE_ROLE_KEY, preenchida automaticamente pelo Supabase) e
// nunca chega ao navegador. Como publicar: database/CONFIGURAR-ADMIN.md.
//
// Deve ser publicada com "Verify JWT" DESLIGADO: o autocadastro não tem
// sessão, e as ações de responsável conferem o token aqui dentro.

const RESPONSAVEL_EMAIL = 'root@root.com';
const SENHA_PADRAO = '123456';
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Chama a API do Supabase com a service_role (acesso total — nunca expor). */
async function chamarSupabase(
  metodo: string, caminho: string, corpo?: unknown, extras: Record<string, string> = {},
): Promise<[number, Record<string, unknown>]> {
  try {
    const r = await fetch(SUPABASE_URL + caminho, {
      method: metodo,
      headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE, 'Content-Type': 'application/json', ...extras },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
    return [r.status, json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : {}];
  } catch (e) {
    return [0, { msg: String(e) }];
  }
}

/* Acha o id de um usuário do Supabase Auth pelo e-mail, varrendo a listagem
   administrativa. Usado só quando criar uma conta falha por "já existe". */
async function buscarIdPorEmail(email: string): Promise<string | null> {
  const alvo = email.toLowerCase();
  for (let pagina = 1; pagina <= 20; pagina++) {
    const [status, corpo] = await chamarSupabase('GET', `/auth/v1/admin/users?page=${pagina}&per_page=200`);
    const usuarios = corpo.users as Array<Record<string, unknown>> | undefined;
    if (status !== 200 || !Array.isArray(usuarios)) return null;
    const achado = usuarios.find((u) => String(u.email ?? '').toLowerCase() === alvo);
    if (achado) return String(achado.id ?? '') || null;
    if (usuarios.length < 200) return null;
  }
  return null;
}

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mensagem = (corpo: Record<string, unknown>, padrao: string) =>
  typeof corpo.msg === 'string' ? corpo.msg : typeof corpo.message === 'string' ? corpo.message : padrao;
const jaExiste = (corpo: Record<string, unknown>) => /already/i.test(mensagem(corpo, ''));

/* Regras de senha — as MESMAS de js/senha-regras.js (mudou lá, muda aqui).
   Aceita senha de 8+ caracteres com maiúscula, minúscula, número e caractere
   especial, ou PIN de exatamente 6 números sem os fáceis de adivinhar.
   Devolve null se a senha serve, ou o motivo. */
const PINS_COMUNS = ['102030', '112233', '121314', '131313', '147258', '159753', '951753', '258369', '369258',
  '147369', '963852', '741852', '852963', '123321', '321123', '654456', '100200', '010203', '101010', '202020',
  '200000', '696969', '171717', '242424', '123654', '789456', '456789', '159357', '753951', '142536', '124578'];
function sequencia(s: string, n: number): boolean {
  for (let i = 0; i + n <= s.length; i++) {
    let sobe = true, desce = true;
    for (let j = i + 1; j < i + n; j++) {
      if (+s[j] !== +s[j - 1] + 1) sobe = false;
      if (+s[j] !== +s[j - 1] - 1) desce = false;
    }
    if (sobe || desce) return true;
  }
  return false;
}
/* acesso_pin (database/acesso-pin.sql): a senha da conta é um PIN? O login
   usa isso pra não oferecer "cadastrar PIN" a quem já tem. */
async function marcarUsaPin(id: string, senha: string): Promise<void> {
  if (!id) return;
  await chamarSupabase('POST', '/rest/v1/acesso_pin?on_conflict=usuario_id',
    { usuario_id: id, usa_pin: /^\d{6}$/.test(senha), atualizado_em: new Date().toISOString() },
    { Prefer: 'resolution=merge-duplicates,return=minimal' });
}

function motivoSenhaFraca(senha: string): string | null {
  if (/^\d+$/.test(senha)) {
    if (senha.length !== 6) return 'O PIN precisa ter exatamente 6 números.';
    if (new Set(senha.split('')).size < 4) return 'O PIN precisa ter pelo menos 4 números diferentes.';
    if (/(\d)\1{2}/.test(senha)) return 'O PIN não pode ter o mesmo número 3 vezes seguidas.';
    if (sequencia(senha, 4)) return 'O PIN não pode ter sequência de 4 números (ex.: 1234, 9876).';
    if (senha.slice(0, 2).repeat(3) === senha || senha.slice(0, 3).repeat(2) === senha) return 'O PIN não pode ser um padrão repetido.';
    if (PINS_COMUNS.includes(senha)) return 'Esse PIN é comum demais; escolha outro.';
    return null;
  }
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres (ou ser um PIN de 6 números).';
  if (!/[A-ZÀ-Ý]/.test(senha)) return 'A senha precisa ter uma letra maiúscula.';
  if (!/[a-zß-ÿ]/.test(senha)) return 'A senha precisa ter uma letra minúscula.';
  if (!/\d/.test(senha)) return 'A senha precisa ter um número.';
  if (!/[^A-Za-zÀ-ÿ0-9\s]/.test(senha)) return 'A senha precisa ter um caractere especial.';
  if (/\s/.test(senha)) return 'A senha não pode ter espaços.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { ok: false, erro: 'Método não permitido.' });
  if (!SUPABASE_URL || !SERVICE_ROLE) return responder(500, { ok: false, erro: 'A função está sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.' });

  let entrada: Record<string, unknown> = {};
  try { const j = await req.json(); if (j && typeof j === 'object') entrada = j; } catch { /* corpo vazio */ }
  const acao = String(entrada.acao ?? '');

  // Autocadastro (tela de login): sem sessão. Só aceita logins
  // nome.sobrenome@sistema.local; a conta nasce pendente (gatilho do banco).
  if (acao === 'autocadastro') {
    const email = String(entrada.email ?? '');
    const senha = String(entrada.senha ?? '');
    if (!/^[a-z0-9-]+\.[a-z0-9-]+@sistema\.local$/.test(email)) return responder(400, { ok: false, erro: 'Login inválido.' });
    const fraca = motivoSenhaFraca(senha);
    if (fraca) return responder(400, { ok: false, erro: fraca });
    const [status, corpo] = await chamarSupabase('POST', '/auth/v1/admin/users', { email, password: senha, email_confirm: true });
    if (status >= 200 && status < 300) {
      await marcarUsaPin(String(corpo.id ?? ''), senha);
      return responder(200, { ok: true, id: corpo.id ?? null });
    }
    return responder(502, { ok: false, erro: jaExiste(corpo) ? 'Já existe uma conta com esse login.' : mensagem(corpo, 'O Supabase não concluiu o cadastro.') });
  }

  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!m) return responder(401, { ok: false, erro: 'Sem sessão.' });

  // Confirma, direto no Supabase, quem é o dono desse token.
  const ru = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + m[1] } });
  const usuario = ru.ok ? await ru.json().catch(() => null) : null;

  // Troca da própria senha (qualquer conta logada): passa por aqui pra
  // regra de senha valer no servidor, e não só na tela.
  if (acao === 'trocar_propria_senha') {
    const idProprio = String(usuario?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(idProprio)) return responder(401, { ok: false, erro: 'Entre novamente para continuar.' });
    const senha = String(entrada.senha ?? '');
    const fraca = motivoSenhaFraca(senha);
    if (fraca) return responder(400, { ok: false, erro: fraca });
    const [status, corpo] = await chamarSupabase('PUT', '/auth/v1/admin/users/' + idProprio, { password: senha });
    if (status < 200 || status >= 300) return responder(502, { ok: false, erro: mensagem(corpo, 'O Supabase não concluiu a troca da senha.') });
    await chamarSupabase('PATCH', '/rest/v1/admin_solicitacoes?id=eq.' + idProprio, { deve_trocar_senha: false }, { Prefer: 'return=minimal' });
    await marcarUsaPin(idProprio, senha);
    return responder(200, { ok: true });
  }

  if (!usuario || String(usuario.email ?? '').toLowerCase() !== RESPONSAVEL_EMAIL) {
    return responder(403, { ok: false, erro: 'Esta conta não tem autorização.' });
  }

  if (acao === 'criar_usuario') {
    const email = String(entrada.email ?? '');
    const senha = String(entrada.senha ?? '');
    if (!emailValido(email)) return responder(400, { ok: false, erro: 'Login inválido.' });
    if (senha.length < 6) return responder(400, { ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' });
    const [status, corpo] = await chamarSupabase('POST', '/auth/v1/admin/users', { email, password: senha, email_confirm: true });
    if (status >= 200 && status < 300) {
      const idCriado = (corpo.id as string | undefined) ?? null;
      // Garante a linha em admin_solicitacoes mesmo se o gatilho não rodou.
      let aviso: string | null = null;
      if (idCriado) {
        const [sl, cl] = await chamarSupabase('POST', '/rest/v1/admin_solicitacoes?on_conflict=id', { id: idCriado, email }, { Prefer: 'resolution=ignore-duplicates,return=minimal' });
        if (sl < 200 || sl >= 300) {
          aviso = 'A conta foi criada no Supabase, mas não foi possível gravar em admin_solicitacoes (' + mensagem(cl, 'HTTP ' + sl) + '). Rode database/admin.sql no SQL Editor do Supabase e tente cadastrar de novo — ou rode database/admin-corrigir-orfaos.sql pra recuperar esta conta sem recriá-la.';
        }
      }
      return responder(200, { ok: true, id: idCriado, aviso });
    }
    if (jaExiste(corpo)) {
      // Conta já existe no Auth mas sem linha em admin_solicitacoes: reaproveita.
      const idExistente = await buscarIdPorEmail(email);
      if (idExistente) {
        await chamarSupabase('PUT', '/auth/v1/admin/users/' + idExistente, { password: senha, email_confirm: true });
        await chamarSupabase('POST', '/rest/v1/admin_solicitacoes?on_conflict=id', { id: idExistente, email }, { Prefer: 'resolution=ignore-duplicates,return=minimal' });
        return responder(200, { ok: true, id: idExistente });
      }
    }
    return responder(502, { ok: false, erro: jaExiste(corpo) ? 'Já existe uma conta com esse login.' : mensagem(corpo, 'O Supabase não concluiu o cadastro.') });
  }

  const id = String(entrada.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return responder(400, { ok: false, erro: 'Identificador inválido.' });

  if (acao === 'excluir') {
    const [status, corpo] = await chamarSupabase('DELETE', '/auth/v1/admin/users/' + id);
    if (status >= 200 && status < 300) return responder(200, { ok: true });
    return responder(502, { ok: false, erro: mensagem(corpo, 'O Supabase não concluiu a exclusão.') });
  }

  if (acao === 'redefinir_senha') {
    // Volta a senha pra padrão e obriga a trocar no próximo acesso.
    const [status, corpo] = await chamarSupabase('PUT', '/auth/v1/admin/users/' + id, { password: SENHA_PADRAO });
    if (status >= 200 && status < 300) {
      await chamarSupabase('PATCH', '/rest/v1/admin_solicitacoes?id=eq.' + id, { deve_trocar_senha: true }, { Prefer: 'return=minimal' });
      await marcarUsaPin(id, '');   // a senha padrão é temporária, não é o PIN da pessoa
      return responder(200, { ok: true });
    }
    return responder(502, { ok: false, erro: mensagem(corpo, 'O Supabase não concluiu a redefinição da senha.') });
  }

  if (acao === 'editar_email') {
    const novoEmail = String(entrada.email ?? '');
    if (!emailValido(novoEmail)) return responder(400, { ok: false, erro: 'E-mail inválido.' });
    const [status, corpo] = await chamarSupabase('PUT', '/auth/v1/admin/users/' + id, { email: novoEmail, email_confirm: true });
    if (status >= 200 && status < 300) {
      await chamarSupabase('PATCH', '/rest/v1/admin_solicitacoes?id=eq.' + id, { email: novoEmail });
      return responder(200, { ok: true });
    }
    return responder(502, { ok: false, erro: mensagem(corpo, 'O Supabase não concluiu a alteração.') });
  }

  return responder(400, { ok: false, erro: 'Ação desconhecida.' });
});
