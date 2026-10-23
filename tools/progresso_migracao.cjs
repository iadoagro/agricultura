/* Barra de progresso da migração para o Drive (tools/migrar_para_drive.cjs), atualizada a cada 3 s.
   Conta, no banco, quantos caminhos já viraram "drive:" e quantos PDFs do repositório já foram enviados.
   Uso:  node tools/progresso_migracao.cjs        (Ctrl+C para sair) */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const SUPA = (fs.readFileSync(path.join(raiz, 'js', 'banco-config.js'), 'utf8').match(/url:\s*'([^']+)'/) || [])[1];
const REF = new URL(SUPA).hostname.split('.')[0];
const chaves = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${REF} -o json`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const H = { apikey: chaves.find((k) => k.name === 'service_role').api_key };
H.Authorization = 'Bearer ' + H.apikey;

const ALVOS = [
  ['Documentos VPN', 'vpn_solicitacoes', 'documento_path'],
  ['Chamados VPN', 'vpn_solicitacoes', 'chamado_path'],
  ['Termos VPN', 'vpn_solicitacoes', 'termo_path'],
  ['Termos assinados', 'vpn_anexos', 'arquivo_path'],
  ['Fichas mecanização', 'mecanizacao_lancamentos', 'pdf_arquivo'],
];

async function contar(tabela, col, filtro) {
  const r = await fetch(`${SUPA}/rest/v1/${tabela}?select=${col}&${col}=not.is.null${filtro}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}

function totalRepo() {
  let n = 0;
  for (const dir of ['portarias', 'termos-vpn']) {
    const base = path.join(raiz, dir);
    if (!fs.existsSync(base)) continue;
    (function varrer(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) varrer(path.join(d, e.name));
        else if (/\.(pdf|jpe?g|png)$/i.test(e.name)) n++;
      }
    }(base));
  }
  return n;
}

function barra(feito, total) {
  const larg = 30, f = total ? Math.round((feito / total) * larg) : larg;
  const pct = total ? Math.round((feito / total) * 100) : 100;
  return '[' + '#'.repeat(f) + '.'.repeat(larg - f) + '] ' + String(pct).padStart(3) + '%  ' + feito + '/' + total;
}

async function quadro() {
  const linhas = [];
  let somaFeito = 0, somaTotal = 0;
  for (const [nome, tabela, col] of ALVOS) {
    const total = await contar(tabela, col, '');
    const feito = await contar(tabela, col, `&${col}=like.drive:*`);
    somaFeito += feito; somaTotal += total;
    linhas.push(nome.padEnd(20) + barra(feito, total));
  }
  linhas.push('-'.repeat(60));
  linhas.push('Banco (Supabase)'.padEnd(20) + barra(somaFeito, somaTotal));
  const arq = path.join(raiz, 'data', 'drive-repositorio.json');
  const enviados = fs.existsSync(arq) ? Object.keys(JSON.parse(fs.readFileSync(arq, 'utf8'))).length : 0;
  linhas.push('Portarias e termos'.padEnd(20) + barra(enviados, totalRepo()));
  return linhas.join('\n');
}

(async () => {
  for (;;) {
    let texto;
    try { texto = await quadro(); } catch (e) { texto = 'Aguardando... (' + e.message + ')'; }
    process.stdout.write('\x1b[2J\x1b[H' + 'Migração para o Drive  ' + new Date().toLocaleTimeString('pt-BR') + '\n\n' + texto + '\n\nCtrl+C para sair\n');
    await new Promise((r) => setTimeout(r, 3000));
  }
})();
