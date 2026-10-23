/* Lista (e, com --apagar, remove) os arquivos dos buckets do Supabase que já foram migrados para o Drive.
   Só mexe em vpn-documentos, vpn-chamados, vpn-termos e mecanizacao-formularios. Rode antes tools/conferir_drive.cjs.
   Uso:  node tools/limpar_storage.cjs            (só lista)
         node tools/limpar_storage.cjs --apagar   (apaga de verdade; não tem volta) */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APAGAR = process.argv.includes('--apagar');
const BUCKETS = ['vpn-documentos', 'vpn-chamados', 'vpn-termos', 'mecanizacao-formularios'];

const raiz = path.join(__dirname, '..');
const SUPA = (fs.readFileSync(path.join(raiz, 'js', 'banco-config.js'), 'utf8').match(/url:\s*'([^']+)'/) || [])[1];
const REF = new URL(SUPA).hostname.split('.')[0];
const chaves = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${REF} -o json`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const KEY = chaves.find((k) => k.name === 'service_role').api_key;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

// lista tudo, descendo nas "pastas" (itens sem id)
async function listar(bucket, prefixo) {
  const arquivos = [];
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${SUPA}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: prefixo, limit: 100, offset }) });
    const itens = await r.json();
    if (!Array.isArray(itens)) throw new Error(JSON.stringify(itens));
    for (const it of itens) {
      const caminho = prefixo ? prefixo + '/' + it.name : it.name;
      if (it.id) arquivos.push({ caminho, bytes: Number((it.metadata || {}).size) || 0 });
      else arquivos.push(...await listar(bucket, caminho));
    }
    if (itens.length < 100) break;
  }
  return arquivos;
}

(async () => {
  let totalArq = 0, totalBytes = 0;
  for (const b of BUCKETS) {
    const arq = await listar(b, '');
    const bytes = arq.reduce((s, a) => s + a.bytes, 0);
    totalArq += arq.length; totalBytes += bytes;
    console.log(`${b}: ${arq.length} arquivo(s), ${(bytes / 1048576).toFixed(1)} MB`);
    if (!APAGAR) continue;
    let apagados = 0;
    for (let i = 0; i < arq.length; i += 50) {
      const lote = arq.slice(i, i + 50).map((a) => a.caminho);
      const r = await fetch(`${SUPA}/storage/v1/object/${b}`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: lote }) });
      if (r.ok) apagados += (await r.json()).length; else console.log('  ! ' + r.status + ' ' + (await r.text()));
    }
    console.log(`  apagados: ${apagados}`);
  }
  console.log(`Total: ${totalArq} arquivo(s), ${(totalBytes / 1048576).toFixed(1)} MB` + (APAGAR ? ' (apagar executado)' : ' (só listagem)'));
})().catch((e) => { console.error(e); process.exit(1); });
