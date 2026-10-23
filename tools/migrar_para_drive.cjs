/* Move os arquivos que já estão no Storage do Supabase (e os PDFs soltos do repositório) para a pasta do Drive.
   Uso:  node tools/migrar_para_drive.cjs <URL /exec do upload-drive.gs> --segredo=<SEGREDO da ponte> [--simular] [--apagar-originais] [--sem-repo]
   - sem flags: copia cada arquivo do Storage para o Drive e troca o caminho no banco por "drive:<id>"
   - --simular: só conta o que seria enviado
   - --apagar-originais: depois de migrar, apaga do Storage os arquivos já copiados (libera espaço)
   - --sem-repo: não envia portarias/ e termos-vpn/
   Pode rodar de novo: o que já virou "drive:" é pulado. A chave service_role vem do Supabase CLI (projeto ligado). */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DRIVE = process.argv[2];
const SIMULAR = process.argv.includes('--simular');
const APAGAR = process.argv.includes('--apagar-originais');
const SEM_REPO = process.argv.includes('--sem-repo');
const SEGREDO = ((process.argv.find((a) => a.startsWith('--segredo=')) || '').slice(10)) || process.env.DRIVE_SEGREDO || '';
if (!DRIVE || !/^https:\/\/script\.google\.com\//.test(DRIVE)) { console.error('Informe a URL /exec do web app como primeiro argumento.'); process.exit(1); }
if (!SEGREDO && !SIMULAR) { console.error('Informe o segredo da ponte: --segredo=... (ou a variável DRIVE_SEGREDO).'); process.exit(1); }

const raiz = path.join(__dirname, '..');
const cfgJs = fs.readFileSync(path.join(raiz, 'js', 'banco-config.js'), 'utf8');
const SUPA = (cfgJs.match(/url:\s*'([^']+)'/) || [])[1];
const REF = new URL(SUPA).hostname.split('.')[0];
const chaves = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${REF} -o json`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const SERVICE = (chaves.find((k) => k.name === 'service_role') || {}).api_key;
if (!SERVICE) { console.error('Não achei a chave service_role (supabase login / link).'); process.exit(1); }
const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE };

const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const limpa = (t) => String(t || '').replace(/[\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const ext = (c) => ((String(c).match(/\.([A-Za-z0-9]{2,5})$/) || [])[1] || 'pdf').toLowerCase();
const enc = (c) => c.split('/').map(encodeURIComponent).join('/');

async function paraDrive(bytes, nome, pasta) {
  const r = await fetch(DRIVE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'enviar', segredo: SEGREDO, nome, pasta, base64: Buffer.from(bytes).toString('base64') }) });
  const c = await r.json().catch(() => null);
  if (!c || !c.ok) throw new Error((c && c.erro) || 'Drive HTTP ' + r.status);
  return c.id;
}

// tabela, coluna do caminho, bucket, colunas extras e como nomear o arquivo no Drive
const ALVOS = [
  { tabela: 'vpn_solicitacoes', col: 'documento_path', bucket: 'vpn-documentos', pasta: 'VPN/Documentos', extra: 'nome', nome: (l, c) => `Documento - ${limpa(l.nome)}.${ext(c)}` },
  { tabela: 'vpn_solicitacoes', col: 'chamado_path', bucket: 'vpn-chamados', pasta: 'VPN/Chamados', extra: 'nome', nome: (l, c) => `Chamado - ${limpa(l.nome)}.${ext(c)}` },
  { tabela: 'vpn_solicitacoes', col: 'termo_path', bucket: 'vpn-termos', pasta: 'VPN/Termos preenchidos', extra: 'nome', nome: (l, c) => `Termo - ${limpa(l.nome)}.${ext(c)}` },
  { tabela: 'vpn_anexos', col: 'arquivo_path', bucket: 'vpn-documentos', pasta: 'VPN/Termos assinados', extra: 'arquivo_nome', nome: (l, c) => `Termo assinado - ${limpa(l.arquivo_nome) || c.split('/').pop()}`.replace(/(\.[A-Za-z0-9]{2,5})?$/, (m) => m || '.' + ext(c)) },
  { tabela: 'mecanizacao_lancamentos', col: 'pdf_arquivo', bucket: 'mecanizacao-formularios', pasta: 'Mecanização/Fichas em PDF', extra: 'nome_beneficiario', nome: (l, c) => `Ficha - ${limpa(l.nome_beneficiario)} - ${c.split('/').pop()}` },
];

async function migrarBanco() {
  const apagar = [];
  for (const a of ALVOS) {
    const r = await fetch(`${SUPA}/rest/v1/${a.tabela}?select=${a.col},${a.extra}&${a.col}=not.is.null&${a.col}=not.like.drive:*&limit=10000`, { headers: H });
    if (!r.ok) { console.log(`! ${a.tabela}.${a.col}: ${r.status} ${await r.text()}`); continue; }
    const linhas = (await r.json()).filter((l) => l[a.col]);
    const porCaminho = new Map();
    linhas.forEach((l) => { if (!porCaminho.has(l[a.col])) porCaminho.set(l[a.col], l); });
    console.log(`${a.tabela}.${a.col}: ${porCaminho.size} arquivo(s) no Storage`);
    if (SIMULAR) continue;
    let ok = 0, falha = 0;
    for (const [caminho, l] of porCaminho) {
      try {
        const d = await fetch(`${SUPA}/storage/v1/object/${a.bucket}/${enc(caminho)}`, { headers: H });
        if (!d.ok) throw new Error('Storage ' + d.status);
        const bytes = new Uint8Array(await d.arrayBuffer());
        const id = await paraDrive(bytes, a.nome(l, caminho), a.pasta);
        const u = await fetch(`${SUPA}/rest/v1/${a.tabela}?${a.col}=eq.${encodeURIComponent(caminho)}`, {
          method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ [a.col]: 'drive:' + id }) });
        if (!u.ok) throw new Error('Banco ' + u.status + ' ' + (await u.text()));
        apagar.push([a.bucket, caminho]);
        ok++;
      } catch (e) { falha++; console.log(`  ! ${caminho}: ${e.message}`); }
    }
    console.log(`  migrados ${ok}, com erro ${falha}`);
  }
  if (APAGAR && apagar.length) {
    let n = 0;
    for (const [b, c] of apagar) { const d = await fetch(`${SUPA}/storage/v1/object/${b}/${enc(c)}`, { method: 'DELETE', headers: H }); if (d.ok) n++; }
    console.log(`Apagados do Storage: ${n} de ${apagar.length}`);
  }
}

function pdfsDoRepo() {
  const itens = [];
  for (const dir of ['portarias', 'termos-vpn']) {
    const base = path.join(raiz, dir);
    if (!fs.existsSync(base)) continue;
    (function varrer(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.(pdf|jpe?g|png)$/i.test(e.name)) itens.push(p);
      }
    }(base));
  }
  return itens;
}

async function migrarRepo() {
  const arq = path.join(raiz, 'data', 'drive-repositorio.json');
  const mapa = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : {};
  const itens = pdfsDoRepo();
  console.log(`Repositório: ${itens.length} arquivo(s) em portarias/ e termos-vpn/ (${itens.filter((p) => mapa[path.relative(raiz, p).split(path.sep).join('/')]).length} já enviados)`);
  if (SIMULAR) return;
  let ok = 0, falha = 0;
  for (const p of itens) {
    const rel = path.relative(raiz, p).split(path.sep).join('/');
    if (mapa[rel]) continue;
    const ano = (rel.match(/portarias (\d{4})/i) || [])[1];
    const pasta = rel.startsWith('portarias/') ? 'Portarias' + (ano ? '/' + ano : '') : 'VPN/Termos preenchidos';
    try {
      mapa[rel] = await paraDrive(fs.readFileSync(p), path.basename(p), pasta);
      ok++;
      fs.writeFileSync(arq, JSON.stringify(mapa, null, 1));
    } catch (e) { falha++; console.log(`  ! ${rel}: ${e.message}`); }
  }
  console.log(`  enviados ${ok}, com erro ${falha}; mapa em data/drive-repositorio.json`);
}

(async () => {
  await migrarBanco();
  if (!SEM_REPO) await migrarRepo();
})().catch((e) => { console.error(e); process.exit(1); });
