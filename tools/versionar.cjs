/* Carimba a versão de cache (?v=...) dos scripts e estilos de uma ou mais páginas com o HASH do
   conteúdo de cada arquivo. Assim a versão só muda quando o arquivo muda, e ninguém precisa
   lembrar de subir o número à mão.

   Uso:   node tools/versionar.cjs pages/dashboard.html [outra.html ...]
          node tools/versionar.cjs --verificar pages/dashboard.html    (só confere; sai 1 se houver diferença)

   Só toca em src/href locais (relativos) que já tenham "?v=". Endereços externos ficam como estão. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const so = args.includes('--verificar');
const paginas = args.filter((a) => !a.startsWith('--'));
if (!paginas.length) {
  console.error('Informe ao menos uma página HTML. Ex.: node tools/versionar.cjs pages/dashboard.html');
  process.exit(2);
}

let mudou = 0, total = 0, faltando = 0;
for (const pagina of paginas) {
  const base = path.dirname(pagina);
  const html = fs.readFileSync(pagina, 'utf8');
  const novo = html.replace(/((?:src|href)=["'])([^"':?#]+)\?v=([^"'&]*)(["'])/g, (m, ini, arq, v, fim) => {
    if (/^(https?:)?\/\//.test(arq)) return m;
    const caminho = path.resolve(base, arq);
    if (!fs.existsSync(caminho)) { faltando++; console.warn('  arquivo não encontrado: ' + arq); return m; }
    const h = crypto.createHash('sha1').update(fs.readFileSync(caminho)).digest('hex').slice(0, 8);
    total++;
    if (h !== v) mudou++;
    return ini + arq + '?v=' + h + fim;
  });
  if (!so && novo !== html) fs.writeFileSync(pagina, novo, 'utf8');
}
console.log((so ? 'Conferidos' : 'Carimbados') + ' ' + total + ' arquivo(s); ' + mudou + ' com versão ' + (so ? 'desatualizada' : 'atualizada') +
  (faltando ? '; ' + faltando + ' não encontrado(s)' : '') + '.');
process.exit(so && mudou ? 1 : 0);
