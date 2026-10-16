/* Testes de interface do painel de Mecanização (versão pública, ?publico=1), num navegador real.
   Lê os dados de verdade (função lancar-mecanizacao), então precisa de internet e do site servido
   (XAMPP em http://localhost/agricultura ou o endereço publicado).

   Uso:  node tools/testar_interface.cjs [endereço-base] [caminho-do-playwright-core]
   Ex.:  node tools/testar_interface.cjs http://localhost/agricultura
   Sai com código 1 se algum teste falhar. */
const assert = require('node:assert/strict');
const base = (process.argv[2] || 'http://localhost/agricultura').replace(/\/$/, '');
const caminhoPw = process.argv[3] || 'playwright-core';
const { chromium } = require(caminhoPw);

const ABAS_PUBLICAS = ['geral', 'mecanizacao', 'acudagem', 'cultura', 'municipio', 'mapa', 'escritorio', 'relatorio'];
// visões que vivem dentro de "Mostrar mais" (aba insercoes) na versão pública
const VISOES_MOSTRAR_MAIS = ['comparativo', 'metas', 'tendencias', 'cruzamentos'];
let ok = 0, falhas = 0;
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ok  ' + nome); }
  catch (e) { falhas++; console.log('FALHA ' + nome + '\n      ' + String(e.message).split('\n')[0]); }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'msedge', headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('seagri_mec_pub_ok', '1'); } catch (e) { /* privado */ } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) erros.push(m.text()); });

  const url = base + '/pages/dashboard.html?publico=1';
  // os testes não dependem do que o responsável configurou em "Configurações": usam o padrão (tudo liberável)
  await page.route('**/rest/v1/rpc/mecanizacao_publico_config_publica', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens_publico: null, itens_logado: null, abas: null, exige_senha: false }) }));
  await page.goto(url + '#geral?ano=2026', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });

  console.log('Carga e abas');
  await t('carrega a base e mostra indicadores na visão geral', async () => {
    const n = await page.evaluate(() => window.PAINEL_API.registros().length);
    assert.ok(n > 100, 'registros: ' + n);
    const kpis = await page.locator('#kpis .kpi').count();
    assert.ok(kpis >= 4, 'kpis: ' + kpis);
  });
  for (const aba of ABAS_PUBLICAS) {
    await t('abre a aba ' + aba + ' sem erro', async () => {
      await page.evaluate((a) => window.PAINEL_API.abrirAba(a), aba);
      await page.waitForTimeout(350);
      const ativa = await page.evaluate(() => document.querySelector('.aba-conteudo.ativa')?.getAttribute('data-aba'));
      assert.equal(ativa, aba);
      const vazio = await page.evaluate(() => (document.querySelector('.aba-conteudo.ativa')?.innerText || '').trim().length);
      assert.ok(vazio > 20, 'aba sem conteúdo');
    });
  }
  for (const v of VISOES_MOSTRAR_MAIS) {
    await t('visão "' + v + '" abre dentro de Mostrar mais', async () => {
      await page.evaluate((a) => window.PAINEL_API.abrirAba(a), v);
      await page.waitForTimeout(450);
      const r = await page.evaluate((a) => ({
        aba: document.querySelector('.aba-conteudo.ativa')?.getAttribute('data-aba'),
        visivel: !document.querySelector('.ins-bloco[data-sec="' + a + '"]')?.hidden,
        texto: (document.querySelector('.ins-bloco[data-sec="' + a + '"]')?.innerText || '').trim().length
      }), v);
      assert.equal(r.aba, 'insercoes');
      assert.ok(r.visivel && r.texto > 20, 'visão sem conteúdo');
    });
  }
  await t('versão pública não expõe registros nem nomes de inseridores no DOM', async () => {
    await page.goto(url + '#registros?ano=2026', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => ({
      linhas: document.querySelectorAll('#tCorpo tr').length,
      pessoas: document.querySelectorAll('#insPessoaTabela tr, #tInsPessoa tr').length,
      secao: [...document.querySelectorAll('.ins-bloco')].filter((b) => !b.hidden && b.offsetParent !== null).map((b) => b.getAttribute('data-sec'))
    }));
    assert.equal(r.linhas, 0, 'registros no DOM');
    assert.ok(r.secao.every((x) => VISOES_MOSTRAR_MAIS.indexOf(x) >= 0), 'visão interna aberta: ' + r.secao);
  });
  await t('abas internas (alertas, relatórios) não abrem na versão pública', async () => {
    await page.goto(url + '#alertas?ano=2026', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    await page.waitForTimeout(600);
    const aberta = await page.evaluate(() => [...document.querySelectorAll('.ins-bloco')].filter((b) => !b.hidden && b.offsetParent !== null).map((b) => b.getAttribute('data-sec')));
    assert.ok(!aberta.includes('alertas') && !aberta.includes('relatorios'), String(aberta));
  });

  console.log('Filtros e URL');
  await t('filtro de município na URL recorta a base e aparece no resumo', async () => {
    await page.goto(url + '#geral?ano=2026&mun=Xapuri', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    await page.waitForTimeout(600);
    const r = await page.locator('#resumo').innerText();
    assert.match(r, /1 filtro ativo/);
    const m = /^(\d[\d.]*) de (\d[\d.]*) registros/.exec(r.trim());
    assert.ok(m && Number(m[1].replace('.', '')) < Number(m[2].replace('.', '')), r);
  });
  await t('"Limpar filtros" volta a mostrar todos os registros do período', async () => {
    await page.locator('#btnLimpar').click();
    await page.waitForTimeout(500);
    const r = await page.locator('#resumo').innerText();
    assert.doesNotMatch(r, /filtro ativo/);
  });
  await t('o estado dos filtros vai para o endereço', async () => {
    await page.goto(url + '#municipio?ano=2025', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    await page.waitForTimeout(600);
    assert.match(page.url(), /#municipio\?ano=2025/);
  });

  console.log('Exportação e assistente');
  await t('CSV da tabela baixa um arquivo com cabeçalho', async () => {
    await page.evaluate(() => window.PAINEL_API.abrirAba('municipio'));
    await page.waitForSelector('#tMun .tf-exp[data-f="csv"]', { timeout: 10000 });
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('#tMun .tf-exp[data-f="csv"]').click()]);
    assert.match(d.suggestedFilename(), /\.csv$/);
    const fs = require('node:fs');
    const txt = fs.readFileSync(await d.path(), 'utf8');
    assert.ok(txt.charCodeAt(0) === 0xFEFF && /Munic/i.test(txt.split('\n')[0]), txt.slice(0, 80));
  });
  await t('assistente responde uma pergunta', async () => {
    await page.locator('.ia-abrir').click();
    await page.locator('.ia-campo').fill('quantos relatórios em 2026?');
    await page.locator('.ia-enviar').click();
    await page.waitForSelector('.ia-resp .ia-kpi.destaque b', { timeout: 15000 });
    const v = await page.locator('.ia-resp .ia-kpi.destaque b').first().innerText();
    assert.match(v, /\d/);
  });

  console.log('Celular');
  await t('sem rolagem horizontal em 375 px e tabelas viram cartões', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url + '#municipio?ano=2026', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({
      sobra: document.documentElement.scrollWidth - window.innerWidth,
      cartoes: document.querySelectorAll('table.dados.tf-cartao').length
    }));
    assert.ok(r.sobra <= 1, 'sobra horizontal de ' + r.sobra + 'px');
    assert.ok(r.cartoes > 0, 'nenhuma tabela em cartão');
  });

  console.log('Visibilidade (configuração simulada)');
  // Abre o painel público com uma configuração de visibilidade simulada (sem tocar no banco).
  async function abrirComConfig(cfg, hash, opcoes) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push('visibilidade: ' + e.message));
    await p.route('**/rest/v1/rpc/mecanizacao_publico_config_publica', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cfg) }));
    await p.goto(url + '&v=' + Date.now() + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    await p.waitForTimeout(700);
    return p;
  }
  const visiveis = (p, seletor, attr) => p.evaluate(([s, a]) =>
    [...document.querySelectorAll(s)].filter((b) => !b.hidden && getComputedStyle(b).display !== 'none').map((b) => b.getAttribute(a)),
  [seletor, attr]);

  await t('público: abas desligadas somem e a Visão geral desligada cai na primeira liberada', async () => {
    const p = await abrirComConfig({ itens_publico: ['cultura', 'insercoes', 'comparativo'], itens_logado: null, exige_senha: false }, '#geral?ano=2026');
    const abas = await visiveis(p, '.aba[data-aba]', 'data-aba');
    const ativa = await p.evaluate(() => document.querySelector('.aba-conteudo.ativa')?.getAttribute('data-aba'));
    const secoes = await visiveis(p, '#insNav button[data-sec]', 'data-sec');
    await p.close();
    assert.deepEqual(abas.sort(), ['cultura', 'insercoes']);
    assert.equal(ativa, 'cultura');
    assert.deepEqual(secoes, ['comparativo']);
  });
  await t('público: endereço de aba desligada não abre (vai para a primeira liberada)', async () => {
    const p = await abrirComConfig({ itens_publico: ['cultura', 'municipio'], itens_logado: null, exige_senha: false }, '#mapa?ano=2026');
    const ativa = await p.evaluate(() => document.querySelector('.aba-conteudo.ativa')?.getAttribute('data-aba'));
    await p.close();
    assert.equal(ativa, 'cultura');
  });
  await t('público: "Mostrar mais" some quando nenhuma visão dela é liberada', async () => {
    const p = await abrirComConfig({ itens_publico: ['geral', 'insercoes'], itens_logado: null, exige_senha: false }, '#geral?ano=2026');
    const abas = await visiveis(p, '.aba[data-aba]', 'data-aba');
    await p.close();
    assert.ok(!abas.includes('insercoes'), String(abas));
  });
  await t('usuário logado (não root): vê só o que está na lista dele; root vê tudo', async () => {
    const p = await abrirComConfig({ itens_publico: null, itens_logado: ['geral', 'mapa', 'insercoes', 'metas'], exige_senha: false }, '#geral?ano=2026');
    const r = await p.evaluate(async () => {
      window.MODO_PUBLICO = false;
      document.documentElement.classList.remove('modo-publico');
      window.ADMIN_AUTH = { papel: () => 'aprovado', sessaoAtual: () => ({}), registrarEvento: () => {} };
      await window.PainelPublico.recarregar();
      window.PainelPublico.aplicarVisibilidade({ publico: false, root: false });
      const vis = (s, a) => [...document.querySelectorAll(s)].filter((b) => !b.hidden && getComputedStyle(b).display !== 'none').map((b) => b.getAttribute(a));
      const naoRoot = { abas: vis('.aba[data-aba]', 'data-aba'), secoes: vis('#insNav button[data-sec]', 'data-sec') };
      window.PainelPublico.aplicarVisibilidade({ publico: false, root: true });
      const cultura = document.getElementById('aba-cultura').hidden;
      return { naoRoot, culturaParaRoot: cultura };
    });
    await p.close();
    assert.ok(r.naoRoot.abas.includes('geral') && r.naoRoot.abas.includes('mapa') && r.naoRoot.abas.includes('insercoes'), JSON.stringify(r.naoRoot));
    assert.ok(!r.naoRoot.abas.includes('cultura'), 'cultura deveria estar escondida');
    assert.deepEqual(r.naoRoot.secoes, ['metas']);
    assert.equal(r.culturaParaRoot, false);
  });

  console.log('Acesso com senha');
  await t('link com senha: login sobre o fundo desfocado (10%), recusa a errada e abre com a certa', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 900 } });   // sem a senha já "lembrada"
    const p = await ctx2.newPage();
    const errosP = [];
    p.on('pageerror', (e) => errosP.push(e.message));
    await p.route('**/rest/v1/rpc/mecanizacao_publico_config_publica', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens_publico: null, itens_logado: null, abas: null, exige_senha: true }) }));
    await p.route('**/rest/v1/rpc/mecanizacao_publico_verificar', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: String(r.request().postDataJSON().p_senha === 'certa') }));
    await p.goto(url + '&s=' + Date.now() + '#geral?ano=2026', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.pub-login-ov', { timeout: 15000 });
    await p.waitForTimeout(700);
    const tela = await p.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.pub-login-ov'));
      return {
        fundo: cs.backgroundColor, desfoque: cs.backdropFilter || cs.webkitBackdropFilter,
        dados: window.PAINEL_API ? window.PAINEL_API.registros().length : 0,
        fundoInerte: document.querySelector('.wrap').inert === true,
        foco: document.activeElement && document.activeElement.id
      };
    });
    assert.match(tela.fundo, /rgba\(5, 14, 32, 0\.9\)/, tela.fundo);        // 90% de cobertura = 10% de visibilidade
    assert.match(tela.desfoque, /blur\(20px\)/, String(tela.desfoque));
    assert.equal(tela.dados, 0, 'os dados não podem carregar antes da senha');
    assert.equal(tela.fundoInerte, true, 'o fundo deveria estar inerte');
    assert.equal(tela.foco, 'pubSenha');
    // senha errada
    await p.fill('#pubSenha', 'errada');
    await p.click('.pub-entrar');
    await p.waitForFunction(() => /incorreta/i.test(document.getElementById('pubSenhaErro').textContent), null, { timeout: 8000 });
    await p.waitForTimeout(900);
    // mostrar a senha
    await p.fill('#pubSenha', 'certa');
    await p.click('.pub-olho');
    assert.equal(await p.getAttribute('#pubSenha', 'type'), 'text');
    // senha certa
    await p.click('.pub-entrar');
    await p.waitForFunction(() => !document.querySelector('.pub-login-ov'), null, { timeout: 10000 });
    await p.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    const depois = await p.evaluate(() => ({ inerte: document.querySelector('.wrap').inert === true, travado: document.documentElement.classList.contains('pub-travado') }));
    await ctx2.close();
    assert.equal(depois.inerte, false);
    assert.equal(depois.travado, false);
    assert.equal(errosP.length, 0, errosP.join(' | '));
  });

  console.log('Filtros e Configurações');
  await t('Mostrar mais: nenhuma visão tem a lateral de filtros; a faixa "Seleção" só aparece nas que leem a seleção', async () => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(url + '&f=' + Date.now() + '#metas?ano=2026&mun=Xapuri', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
    await page.waitForTimeout(600);
    const estado = () => page.evaluate(() => {
      const f = document.getElementById('filtros'), s = document.getElementById('insSel');
      const larg = document.querySelector('.conteudo-abas').getBoundingClientRect().width;
      return {
        lateral: !(f.hidden || getComputedStyle(f).display === 'none'),
        faixa: !s.hidden && getComputedStyle(s).display !== 'none',
        texto: s.innerText.replace(/\s+/g, ' ').trim(),
        larg: Math.round(larg), janela: window.innerWidth
      };
    });
    let e = await estado();
    assert.equal(e.lateral, false, 'Metas: lateral aparecendo');
    assert.equal(e.faixa, false, 'Metas não lê a seleção: sem faixa');
    for (const v of ['comparativo', 'tendencias', 'cruzamentos']) {
      await page.evaluate((a) => window.PAINEL_API.abrirAba(a), v);
      await page.waitForTimeout(400);
      e = await estado();
      assert.equal(e.lateral, false, v + ': lateral aparecendo');
      assert.equal(e.faixa, true, v + ': faltou a faixa de seleção');
      assert.match(e.texto, /Período 2026/, e.texto);
      assert.match(e.texto, /Município Xapuri/, e.texto);
      assert.ok(e.larg > e.janela - 120, v + ': o conteúdo não ocupa a largura (' + e.larg + ' de ' + e.janela + ')');
    }
    // "Limpar filtros" da faixa limpa a seleção e a própria faixa se atualiza
    await page.locator('#insSelLimpar').click();
    await page.waitForTimeout(500);
    e = await estado();
    assert.doesNotMatch(e.texto, /Município/, e.texto);
    assert.equal(await page.locator('#insSelLimpar').isHidden(), true, 'o botão Limpar deveria sumir sem filtros');
  });
  for (const [w, h] of [[1920, 950], [1366, 650]]) {
    await t('Configurações (root): sem filtros e cabe em ' + w + '×' + h + ' sem rolar a página', async () => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => erros.push('config: ' + e.message));
      await p.setViewportSize({ width: w, height: h });
      await p.route('**/rest/v1/rpc/mecanizacao_publico_config_publica', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens_publico: null, itens_logado: null, abas: null, exige_senha: false }) }));
      await p.goto(url + '&c=' + Date.now() + '#geral?ano=2026', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
      await p.evaluate(() => {
        window.MODO_PUBLICO = false;
        document.documentElement.classList.remove('modo-publico');
        window.ADMIN_AUTH = { papel: () => 'responsavel', sessaoAtual: () => ({ access_token: 'x', user: { email: 'root@root.com' } }), registrarEvento: () => {} };
        const s = document.createElement('script');
        s.src = '../js/painel-config.js?x=' + Date.now();
        document.body.appendChild(s);
        document.querySelector('#aba-insercoes').hidden = false;
      });
      await p.waitForTimeout(500);
      await p.evaluate(() => { window.dispatchEvent(new Event('admin-auth-atualizado')); window.PAINEL_API.abrirAba('configuracoes'); });
      await p.waitForSelector('.cfg-lista .cfg-lin', { timeout: 8000 });
      await p.waitForTimeout(600);
      const r = await p.evaluate(() => {
        const f = document.getElementById('filtros');
        return {
          rolagem: document.documentElement.scrollHeight - window.innerHeight,
          filtrosOcultos: f.hidden || getComputedStyle(f).display === 'none',
          linhas: document.querySelectorAll('.cfg-lin').length,
          listaRola: [...document.querySelectorAll('.cfg-lista')].some((l) => l.scrollHeight > l.clientHeight + 1)
        };
      });
      await p.close();
      assert.equal(r.filtrosOcultos, true, 'filtros deveriam estar ocultos');
      assert.ok(r.linhas >= 20, 'linhas: ' + r.linhas);
      assert.ok(r.rolagem <= 1, 'a página rola ' + r.rolagem + ' px');
      assert.equal(r.listaRola, false, 'uma lista rola por dentro');
    });
  }

  console.log('Cache local e carga incremental');
  {
    const ctx3 = await browser.newContext({ viewport: { width: 1600, height: 900 } });   // IndexedDB limpo
    await ctx3.addInitScript(() => { try { sessionStorage.setItem('seagri_mec_pub_ok', '1'); } catch (e) { /* privado */ } });
    const abrirCache = async (extra) => {
      const p = await ctx3.newPage();
      const chamadas = [];
      p.on('requestfinished', async (rq) => {
        if (/\/rest\/v1\/rpc\/mecanizacao_painel$/.test(rq.url())) {
          const r = await rq.response(); const corpo = r ? await r.body().catch(() => Buffer.alloc(0)) : Buffer.alloc(0);
          chamadas.push({ envio: rq.postData(), bytes: corpo.length, texto: corpo.length < 300 ? corpo.toString() : '' });
        }
      });
      await p.route('**/rest/v1/rpc/mecanizacao_publico_config_publica', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ itens_publico: null, itens_logado: null, abas: null, exige_senha: false }) }));
      if (extra) await extra(p);
      await p.goto(url + '&cache=' + Date.now() + '#geral?ano=Geral', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.PAINEL_API && window.PAINEL_API.registros().length > 0, null, { timeout: 40000 });
      await p.waitForTimeout(2500);   // revalidação em segundo plano + gravação do cache
      const estado = await p.evaluate(() => { const R = window.PAINEL_API.registros(); return { n: R.length, ha: Math.round(R.reduce((a, r) => a + r.ha, 0) * 100) / 100 }; });
      return { p, chamadas, estado };
    };
    const versaoGuardada = (p) => p.evaluate(() => new Promise((ok) => {
      const q = indexedDB.open('seagri_mecanizacao', 1);
      q.onsuccess = () => { const g = q.result.transaction('painel').objectStore('painel').get('p'); g.onsuccess = () => { q.result.close(); ok(g.result ? g.result.versao : null); }; };
      q.onerror = () => ok(null);
    }));
    let primeira;
    await t('1ª abertura baixa a base inteira e guarda no navegador', async () => {
      const a = await abrirCache();
      primeira = a.estado;
      const v = await versaoGuardada(a.p);
      await a.p.close();
      assert.ok(a.chamadas.length >= 1 && a.chamadas[0].bytes > 100000, 'download: ' + JSON.stringify(a.chamadas.map((c) => c.bytes)));
      assert.ok(primeira.n > 1000, 'registros: ' + primeira.n);
      assert.match(String(v), /-p$/, 'versão guardada: ' + v);
    });
    await t('2ª abertura desenha com o cache e só confere a versão (resposta curta), sem perder registros', async () => {
      const a = await abrirCache();
      await a.p.close();
      assert.deepEqual(a.estado, primeira, 'a base do cache é diferente da base baixada');
      assert.equal(a.chamadas.length, 1, 'chamadas: ' + a.chamadas.length);
      assert.match(a.chamadas[0].envio, /"p_versao":"\d+-p"/);
      assert.ok(a.chamadas[0].bytes < 300 && /"igual"\s*:\s*true/.test(a.chamadas[0].texto), 'resposta: ' + a.chamadas[0].bytes + ' bytes');
    });
    await t('cache com versão velha é atualizado pelo servidor (base nova substitui a velha)', async () => {
      const p0 = await ctx3.newPage();
      await p0.goto(base + '/pages/dashboard.html?publico=1&x=' + Date.now(), { waitUntil: 'domcontentloaded' });
      await p0.evaluate(() => new Promise((ok) => {
        const q = indexedDB.open('seagri_mecanizacao', 1);
        q.onsuccess = () => {
          const loja = q.result.transaction('painel', 'readwrite').objectStore('painel');
          const g = loja.get('p');
          g.onsuccess = () => { const c = g.result; c.versao = '0-p'; loja.put(c, 'p').onsuccess = () => { q.result.close(); ok(); }; };
        };
      }));
      await p0.close();
      const a = await abrirCache();
      const v = await versaoGuardada(a.p);
      await a.p.close();
      assert.equal(a.chamadas[0] && a.chamadas[0].envio, '{"p_versao":"0-p"}');
      assert.ok(a.chamadas[0].bytes > 100000, 'não baixou a base nova: ' + a.chamadas[0].bytes);
      assert.deepEqual(a.estado, primeira);
      assert.notEqual(v, '0-p', 'o cache não foi regravado');
    });
    await t('sem rede, a base do cache continua na tela (não cai no arquivo antigo)', async () => {
      const a = await abrirCache(async (p) => {
        await p.route('**/rest/v1/rpc/mecanizacao_painel', (r) => r.abort());
        await p.route('**/functions/v1/lancar-mecanizacao', (r) => r.abort());
      });
      await a.p.close();
      assert.deepEqual(a.estado, primeira, 'a base mudou sem rede: ' + JSON.stringify(a.estado));
    });
    await ctx3.close();
  }

  console.log('Erros de JavaScript');
  await t('nenhum erro no console durante os testes', async () => {
    assert.equal(erros.length, 0, erros.slice(0, 3).join(' | '));
  });

  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('Erro ao executar os testes:', e.message); process.exit(2); });
