/* Auditoria de responsividade mobile.
 *
 * Uso (dentro de auditoria-mobile/):
 *   npm install
 *   node auditar.js --fase antes            # ou: depois
 *   node auditar.js --fase depois --nav webkit
 *   node auditar.js --fase antes --vp 360x800 --tela dashboard
 *
 * Ambiente:
 *   AUDIT_BASE   URL da pasta pages/ (padrão http://localhost/agricultura/pages/)
 *   AUDIT_CANAL  canal do Chromium: chrome | msedge | (vazio = Chromium do Playwright)
 *
 * Não usa o Supabase real: toda requisição a *.supabase.co é interceptada e
 * respondida com listas vazias, e as telas com login recebem uma sessão
 * simulada de responsável (só no sessionStorage do navegador do teste).
 * Nenhuma credencial é lida ou gravada.
 *
 * Saída: capturas/<fase>/<navegador>/<viewport>/<tela>.png e
 *        relatorio-<fase>-<navegador>.json / .md
 */
const fs = require('fs');
const path = require('path');
const { chromium, webkit } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const FASE = args.fase || 'antes';
const NAV = args.nav || 'chromium';
const BASE = process.env.AUDIT_BASE || 'http://localhost/agricultura/pages/';
const CANAL = process.env.AUDIT_CANAL === undefined ? 'chrome' : process.env.AUDIT_CANAL;
const SO_TELA = args.tela ? String(args.tela).split(',') : null;
const SEM_CAPTURA = Boolean(args['sem-captura']);

const VIEWPORTS = [
  { id: '320x568', w: 320, h: 568, mobile: true },
  { id: '360x800', w: 360, h: 800, mobile: true },
  { id: '375x667', w: 375, h: 667, mobile: true },
  { id: '390x844', w: 390, h: 844, mobile: true },
  { id: '412x915', w: 412, h: 915, mobile: true },
  { id: '430x932', w: 430, h: 932, mobile: true },
  { id: '844x390', w: 844, h: 390, mobile: true },
  { id: '768x1024', w: 768, h: 1024, mobile: false, touch: true },
  { id: '1366x768', w: 1366, h: 768, mobile: false },
  { id: '1920x1080', w: 1920, h: 1080, mobile: false },
];
let vps = VIEWPORTS;
if (NAV === 'webkit') vps = VIEWPORTS.filter(v => ['375x667', '390x844', '430x932'].includes(v.id));
if (args.vp) { const f = String(args.vp).split(','); vps = vps.filter(v => f.includes(v.id)); }

/* perfil: publico = sem sessão; admin = sessão simulada de responsável */
const TELAS = [
  { id: 'index', arq: 'index.html', perfil: 'admin' },
  { id: 'admin-login', arq: 'admin-login.html', perfil: 'publico' },
  { id: 'admin-trocar-senha', arq: 'admin-trocar-senha.html', perfil: 'admin' },
  { id: 'admin-usuarios', arq: 'admin-usuarios.html', perfil: 'admin' },
  { id: 'cadastros-fiscais', arq: 'cadastros-fiscais.html', perfil: 'admin', abas: true },
  { id: 'cadastros-chamados', arq: 'cadastros-chamados.html', perfil: 'admin', abas: true },
  { id: 'chamados', arq: 'chamados.html', perfil: 'admin' },
  { id: 'abrir-chamado', arq: 'abrir-chamado.html', perfil: 'publico' },
  { id: 'acompanhar-chamado', arq: 'acompanhar-chamado.html', perfil: 'publico' },
  { id: 'contatos', arq: 'contatos.html', perfil: 'admin', modais: 'contatos' },
  { id: 'dashboard', arq: 'dashboard.html', perfil: 'admin', abas: true },
  { id: 'dashboard-publico', arq: 'dashboard.html?publico=1', perfil: 'publico', abas: true },
  { id: 'deagro', arq: 'deagro.html', perfil: 'admin', abas: true },
  { id: 'deagro-secoes', arq: 'deagro-secoes.html', perfil: 'admin' },
  { id: 'eleicoes', arq: 'eleicoes.html', perfil: 'admin', abas: true },
  { id: 'lancamento-editar', arq: 'lancamento-editar.html', perfil: 'admin' },
  { id: 'logs', arq: 'logs.html', perfil: 'admin' },
  { id: 'organograma', arq: 'organograma.html', perfil: 'admin' },
  { id: 'portarias', arq: 'portarias.html', perfil: 'admin' },
  // Endereços que só redirecionam: medidos no destino
  { id: 'mecanizacao-publico', arq: 'mecanizacao-publico.html', perfil: 'publico', redireciona: true },
  { id: 'dashboards', arq: 'dashboards.html', perfil: 'admin', redireciona: true },
  { id: 'admin-permissoes', arq: 'admin-permissoes.html', perfil: 'admin', redireciona: true },
  { id: 'erro-404', arq: 'nao-existe-pagina.html', perfil: 'publico', erro: true },
];

const SESSAO_FALSA = () => {
  const cfg = window.BANCO_CONFIG || {};
  return {
    access_token: 'teste', refresh_token: 'teste',
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: '00000000-0000-0000-0000-000000000000', email: 'root@root.com' },
    papel: 'responsavel', paginas: null, ativo: true, deveTrocarSenha: false,
  };
};
const URL_SUPABASE = 'https://nivbogsrfirumtbqpqff.supabase.co';

/* ---------- medição dentro da página ---------- */
function medirNaPagina() {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    return s;
  };
  const visivel = (el, cs, r) => cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  const recorta = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== de; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return p;
    }
    return null;
  };
  const todos = Array.from(document.body.querySelectorAll('*')).filter(e => !e.closest('svg') || e.tagName.toLowerCase() === 'svg');
  const estouram = [];
  const setEst = new Set();
  for (const el of todos) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!visivel(el, cs, r)) continue;
    if (r.right > vw + 1 || r.left < -1) {
      if (recorta(el)) continue;
      if (cs.position === 'fixed' && r.left >= -1 && r.right <= vw + 1) continue;
      setEst.add(el);
      estouram.push({ el, seletor: sel(el), largura: Math.round(r.width), direita: Math.round(r.right), esquerda: Math.round(r.left) });
    }
  }
  const topo = estouram.filter(o => !setEst.has(o.el.parentElement)).sort((a, b) => b.direita - a.direita).slice(0, 12)
    .map(({ el, ...o }) => o);

  // alvos de toque
  const alvos = [];
  const interativos = document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=tab],[role=button],[tabindex="0"]');
  for (const el of interativos) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!visivel(el, cs, r)) continue;
    if (el.closest('[hidden],[aria-hidden="true"]') && !el.matches('input')) continue;
    if (el.tagName === 'A' && cs.display === 'inline' && el.closest('p,li,td,dd,label,span,small')) continue; // link no meio do texto (WCAG 2.5.8)
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w < 44 || h < 44) alvos.push({ seletor: sel(el), w, h, texto: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24) });
  }
  // fontes
  const campos = [], textos = [];
  for (const el of todos) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!visivel(el, cs, r)) continue;
    const fs = parseFloat(cs.fontSize);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|hidden|range|file|color)$/.test(el.type) && fs < 16) campos.push({ seletor: sel(el), px: fs });
    const temTexto = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (temTexto && fs < 12) textos.push({ seletor: sel(el), px: fs, texto: el.textContent.trim().slice(0, 24) });
  }
  const meta = document.querySelector('meta[name=viewport]');
  const nomeUnico = (arr) => { const m = new Map(); for (const a of arr) { const k = a.seletor + '|' + (a.px || a.w + 'x' + a.h); if (!m.has(k)) m.set(k, { ...a, n: 0 }); m.get(k).n++; } return [...m.values()]; };
  return {
    vw, docScroll: de.scrollWidth, bodyScroll: document.body.scrollWidth,
    overflowPagina: Math.max(de.scrollWidth, document.body.scrollWidth) > vw,
    estouram: topo,
    alvosPequenos: { total: alvos.length, amostra: nomeUnico(alvos).sort((a, b) => b.n - a.n).slice(0, 10) },
    camposPequenos: { total: campos.length, amostra: nomeUnico(campos).slice(0, 8) },
    textosPequenos: { total: textos.length, amostra: nomeUnico(textos).slice(0, 8) },
    meta: meta ? meta.content : null,
    altura: de.scrollHeight,
  };
}

async function novoContexto(browser, vp, perfil) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    isMobile: vp.mobile && NAV !== 'firefox', hasTouch: vp.mobile || Boolean(vp.touch),
    deviceScaleFactor: vp.mobile ? 2 : 1, locale: 'pt-BR',
  });
  await ctx.route(URL_SUPABASE + '/**', route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
  });
  if (perfil === 'admin') {
    await ctx.addInitScript(`(${(fn, url) => {
      try { sessionStorage.setItem('seagri_admin_sessao:' + url, JSON.stringify(fn())); } catch (e) {}
    }})(${SESSAO_FALSA.toString()}, ${JSON.stringify(URL_SUPABASE)})`);
  }
  return ctx;
}

async function dispensarAviso(page) {
  const b = page.getByRole('button', { name: 'Agora não' });
  if (await b.count().catch(() => 0)) { await b.first().click({ timeout: 2000, force: true }).catch(() => {}); await page.waitForTimeout(300); }
}
async function abasVisiveis(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('[role=tab],.aba-el,.ch-aba-aux,.aba-mais-item'))
    .map((el, i) => ({ i, texto: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30), aba: el.getAttribute('data-aba') || '' }))
    .filter(a => a.texto || a.aba));
}
async function clicarAba(page, i) {
  await page.evaluate((i) => {
    const el = Array.from(document.querySelectorAll('[role=tab],.aba-el,.ch-aba-aux,.aba-mais-item'))[i];
    if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); el.click(); }
  }, i);
  await page.waitForTimeout(450);
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

/* ---------- teste de navegação pelo menu (celular) ---------- */
async function testarMenu(page, tela, vp) {
  const r = { toggle: false, itens: [], falhas: [] };
  const toggle = page.locator('.snav-menu');
  r.toggle = (await toggle.count()) > 0 && await toggle.first().isVisible().catch(() => false);
  if (!r.toggle) { r.falhas.push('botão do menu (☰) ausente/invisível'); return r; }
  const abrir = async () => { await toggle.first().click().catch(e => r.falhas.push('clique no ☰: ' + e.message.split('\n')[0])); await page.waitForTimeout(350); };
  await abrir();
  const aberto = await page.evaluate(() => document.documentElement.classList.contains('sb-gaveta'));
  if (!aberto) { r.falhas.push('menu não abre ao tocar o ☰'); return r; }
  r.travaFundo = await page.evaluate(() => { const b = getComputedStyle(document.body).overflow, h = getComputedStyle(document.documentElement).overflow; return /hidden|clip/.test(b + h); });
  if (!r.travaFundo) r.falhas.push('rolagem do fundo não é travada com o menu aberto');
  r.itens = await page.evaluate(() => Array.from(document.querySelectorAll('#sbLateral a, .sb a')).map(a => ({ href: a.getAttribute('href'), texto: a.innerText.trim() })));
  r.ativo = await page.evaluate(() => { const a = document.querySelector('.sb a[aria-current], .sb a.ativo, .sb a.on'); return a ? a.innerText.trim() : null; });
  // ESC fecha
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  if (await page.evaluate(() => document.documentElement.classList.contains('sb-gaveta'))) {
    r.falhas.push('ESC não fecha o menu (com o foco no botão ☰, como após um toque)');
    await page.evaluate(() => document.querySelector('.sb-fechar').click()); await page.waitForTimeout(300);
  }
  // toque fora fecha
  await abrir();
  await page.mouse.click(Math.max(vp.w - 8, 10), Math.round(vp.h / 2)).catch(() => {});
  await page.waitForTimeout(300);
  if (await page.evaluate(() => document.documentElement.classList.contains('sb-gaveta'))) r.falhas.push('toque fora não fecha o menu');
  return r;
}
async function testarItensMenu(ctx, vp, itens) {
  const falhas = [];
  for (const it of itens) {
    if (!it.href || it.href.startsWith('#') || (it.href === 'index.html' && it.texto.includes('SISTEMA'))) continue;
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + 'index.html', { waitUntil: 'load' });
      await page.waitForSelector('.snav-menu', { timeout: 5000 });
      await dispensarAviso(page);
      await page.locator('.snav-menu').first().click();
      await page.waitForTimeout(300);
      const link = page.locator('.sb a[href="' + it.href + '"]').last();
      await link.click({ timeout: 4000 });
      await page.waitForLoadState('load'); await page.waitForTimeout(500);
      const url = page.url();
      const alvo = it.href.split('#')[0].split('?')[0];
      if (!url.includes(alvo)) falhas.push(`"${it.texto}" → foi para ${url.replace(BASE, '')}, esperado ${it.href}`);
      const aberto = await page.evaluate(() => document.documentElement.classList.contains('sb-gaveta'));
      if (aberto) falhas.push(`"${it.texto}": menu continua aberto após navegar`);
    } catch (e) { falhas.push(`"${it.texto}": ${e.message.split('\n')[0]}`); }
    await page.close();
  }
  return falhas;
}

async function main() {
  const tipo = NAV === 'webkit' ? webkit : chromium;
  const opc = NAV === 'chromium' && CANAL ? { channel: CANAL } : {};
  const browser = await tipo.launch({ headless: true, ...opc });
  const relatorio = { fase: FASE, navegador: NAV, base: BASE, data: new Date().toISOString(), resultados: [], navegacaoMenu: [] };
  const pasta = path.join(__dirname, 'capturas', FASE, NAV);

  for (const vp of vps) {
    fs.mkdirSync(path.join(pasta, vp.id), { recursive: true });
    const ctxs = {};
    for (const perfil of ['publico', 'admin']) ctxs[perfil] = await novoContexto(browser, vp, perfil);
    for (const tela of TELAS) {
      if (SO_TELA && !SO_TELA.includes(tela.id)) continue;
      const ctx = ctxs[tela.perfil];
      const page = await ctx.newPage();
      const erros = [];
      page.on('pageerror', e => erros.push('pageerror: ' + e.message.slice(0, 160)));
      page.on('console', m => { if (m.type() === 'error' && !/supabase|favicon|Failed to load resource/i.test(m.text())) erros.push('console: ' + m.text().slice(0, 160)); });
      let ok = true, motivo = '';
      try {
        const resp = await page.goto(BASE + tela.arq, { waitUntil: 'load', timeout: 30000 });
        if (resp && resp.status() >= 400 && !tela.erro) { ok = false; motivo = 'HTTP ' + resp.status(); }
        await page.waitForTimeout(1200);
        await dispensarAviso(page);
      } catch (e) { ok = false; motivo = e.message.split('\n')[0]; }
      if (!ok) { relatorio.resultados.push({ tela: tela.id, viewport: vp.id, falhou: motivo }); await page.close(); continue; }

      const estados = [{ nome: '', passo: async () => {} }];
      if (tela.abas) {
        const abas = await abasVisiveis(page);
        abas.forEach(a => estados.push({ nome: `aba-${a.i}-${slug(a.aba || a.texto)}`, passo: async () => clicarAba(page, a.i) }));
      }
      if (tela.modais === 'contatos') {
        estados.push({ nome: 'modal-qr', passo: async () => {
          const b = page.locator('[data-qr],.qr-btn,button:has-text("QR")').first();
          if (await b.count()) { await b.click({ force: true }).catch(() => {}); await page.waitForTimeout(500); }
        } });
      }
      for (const est of estados) {
        try { await est.passo(); } catch (e) { /* estado indisponível */ }
        const m = await page.evaluate(medirNaPagina);
        const id = tela.id + (est.nome ? '__' + est.nome : '');
        if (!SEM_CAPTURA) {
          await page.screenshot({ path: path.join(pasta, vp.id, id + '.png'), fullPage: true, timeout: 20000 }).catch(e => { m.capturaErro = e.message.split('\n')[0]; });
        }
        m.url = page.url().replace(BASE, '');
        relatorio.resultados.push({ tela: id, viewport: vp.id, arq: tela.arq, ...m, erros: est.nome ? [] : erros.slice(0, 5) });
      }
      // menu: só nas telas com navegação, uma vez por viewport
      if (vp.w <= 900 && tela.id === 'index') {
        const menu = await testarMenu(page, tela, vp);
        menu.viewport = vp.id;
        if (menu.itens.length) menu.falhas.push(...(await testarItensMenu(ctxs.admin, vp, menu.itens)));
        relatorio.navegacaoMenu.push(menu);
      }
      await page.close();
    }
    await Promise.all(Object.values(ctxs).map(c => c.close()));
    console.log('viewport concluído', vp.id);
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, `relatorio-${FASE}-${NAV}.json`), JSON.stringify(relatorio, null, 1));
  fs.writeFileSync(path.join(__dirname, `relatorio-${FASE}-${NAV}.md`), resumo(relatorio));
  console.log('relatório gravado');
}

function resumo(r) {
  const linhas = [`# Relatório de auditoria mobile — ${r.fase} (${r.navegador})`, '', `Gerado em ${r.data}. Base: ${r.base}`, ''];
  const mob = r.resultados.filter(x => !x.falhou);
  const falhas = r.resultados.filter(x => x.falhou);
  const porOverflow = mob.filter(x => x.overflowPagina && parseInt(x.viewport) <= 844);
  linhas.push(`- Estados medidos: ${mob.length}; falhas ao abrir: ${falhas.length}`);
  linhas.push(`- Estados com rolagem horizontal da página (viewports de celular): **${porOverflow.length}**`, '');
  if (falhas.length) { linhas.push('## Telas que não abriram', ...falhas.map(f => `- ${f.tela} @ ${f.viewport}: ${f.falhou}`), ''); }
  linhas.push('## Rolagem horizontal da página', '', 'Tela | Viewport | Largura do conteúdo | Elementos que estouram', '---|---|---|---');
  for (const x of porOverflow) linhas.push(`${x.tela} | ${x.viewport} | ${Math.max(x.docScroll, x.bodyScroll)} > ${x.vw} | ${x.estouram.slice(0, 3).map(e => `\`${e.seletor}\` (${e.largura}px)`).join(', ')}`);
  linhas.push('', '## Alvos de toque < 44px, campos < 16px e textos < 12px (por tela, em 360x800)', '', 'Tela | Alvos pequenos | Campos <16px | Textos <12px', '---|---|---|---');
  for (const x of mob.filter(x => x.viewport === '360x800')) linhas.push(`${x.tela} | ${x.alvosPequenos.total} | ${x.camposPequenos.total} | ${x.textosPequenos.total}`);
  linhas.push('', '## Navegação pelo menu (celular)', '');
  for (const m of r.navegacaoMenu) linhas.push(`- ${m.viewport}: ☰ ${m.toggle ? 'ok' : 'AUSENTE'}, ${m.itens.length} itens, falhas: ${m.falhas.length ? m.falhas.join('; ') : 'nenhuma'}`);
  const comErro = mob.filter(x => x.erros && x.erros.length);
  if (comErro.length) { linhas.push('', '## Erros de console', ...[...new Set(comErro.map(x => `- ${x.tela}: ${x.erros[0]}`))]); }
  return linhas.join('\n');
}

main().catch(e => { console.error(e); process.exit(1); });
