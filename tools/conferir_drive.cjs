/* Confere se todo arquivo do banco que aponta para o Drive ("drive:<id>") abre na ponte e não está vazio.
   Uso:  node tools/conferir_drive.cjs <URL /exec> --segredo=<SEGREDO>
   Sai com código 0 só se todos estiverem ok; antes de apagar o Storage do Supabase, rode isto. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DRIVE = process.argv[2];
const SEGREDO = ((process.argv.find((a) => a.startsWith('--segredo=')) || '').slice(10)) || process.env.DRIVE_SEGREDO || '';
if (!DRIVE || !SEGREDO) { console.error('Uso: node tools/conferir_drive.cjs <URL /exec> --segredo=<SEGREDO>'); process.exit(1); }

const raiz = path.join(__dirname, '..');
const SUPA = (fs.readFileSync(path.join(raiz, 'js', 'banco-config.js'), 'utf8').match(/url:\s*'([^']+)'/) || [])[1];
const REF = new URL(SUPA).hostname.split('.')[0];
const chaves = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${REF} -o json`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const KEY = chaves.find((k) => k.name === 'service_role').api_key;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const ALVOS = [
  ['vpn_solicitacoes', 'documento_path'], ['vpn_solicitacoes', 'chamado_path'], ['vpn_solicitacoes', 'termo_path'],
  ['vpn_anexos', 'arquivo_path'], ['mecanizacao_lancamentos', 'pdf_arquivo'],
];

async function ler(id) {
  const r = await fetch(DRIVE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'ler', id, segredo: SEGREDO }) });
  return r.json();
}

(async () => {
  const itens = [], antigos = [];
  for (const [tabela, col] of ALVOS) {
    const r = await fetch(`${SUPA}/rest/v1/${tabela}?select=${col}&${col}=not.is.null&limit=10000`, { headers: H });
    for (const l of await r.json()) {
      const v = l[col];
      if (v.startsWith('drive:')) itens.push([tabela + '.' + col, v.slice(6)]); else antigos.push([tabela + '.' + col, v]);
    }
  }
  console.log(`${itens.length} arquivo(s) no Drive para conferir; ${antigos.length} caminho(s) antigo(s) ainda no banco.`);
  let ok = 0, ruim = 0, i = 0;
  async function trabalhador() {
    while (i < itens.length) {
      const [onde, id] = itens[i++];
      try {
        const c = await ler(id);
        const bytes = c.ok ? Buffer.from(c.base64, 'base64') : Buffer.alloc(0);
        const tipoOk = bytes.length > 4 && (bytes.slice(0, 4).toString() === '%PDF' || (bytes[0] === 0xFF && bytes[1] === 0xD8) || bytes[0] === 0x89);
        if (c.ok && tipoOk) ok++; else { ruim++; console.log(`  ! ${onde} ${id}: ${c.erro || 'conteúdo inesperado (' + bytes.length + ' bytes)'}`); }
      } catch (e) { ruim++; console.log(`  ! ${onde} ${id}: ${e.message}`); }
      if ((ok + ruim) % 10 === 0) console.log(`  ${ok + ruim}/${itens.length}`);
    }
  }
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  console.log(`Resultado: ${ok} ok, ${ruim} com problema, ${antigos.length} antigo(s) no banco.`);
  process.exit(ruim === 0 && antigos.length === 0 ? 0 : 2);
})().catch((e) => { console.error(e); process.exit(1); });
