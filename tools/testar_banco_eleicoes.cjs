/* Teste de integração com API simulada. Não acessa contas nem dados reais. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'playwright');
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const context = await browser.newContext();
    const registros = new Map(); let autorizado = true, falhar = false;
    await context.addInitScript(() => {
      Object.defineProperty(window,'BANCO_CONFIG',{get:()=>({url:'https://teste.supabase.co',chavePublica:'sb_publishable_teste'}),set:()=>{}});
    });
    await context.route('https://teste.supabase.co/**', async route => {
      const url = new URL(route.request().url());
      let resultado = [], status = 200;
      if (falhar) return route.abort();
      if (url.pathname.includes('/auth/v1/token')) resultado = {access_token:'sessao-teste',expires_in:3600,user:{id:'usuario-teste'}};
      else if (url.pathname.includes('eleicoes_admins')) resultado = autorizado ? [{user_id:'usuario-teste'}] : [];
      else if (url.pathname.includes('eleicoes_cadastros')) {
        if (!autorizado || !route.request().headers().authorization) status = 403;
        else if (route.request().method() === 'POST') {
          let dados = route.request().postDataJSON();
          if (!Array.isArray(dados)) dados = [dados];
          dados.forEach(r=> { if (!registros.has(r.id)) registros.set(r.id,r); });
          status = 201;
        } else resultado = [...registros.values()].slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+500);
      }
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(resultado)});
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname,'../pages/eleicoes.html')).href);
    const r = {municipio:'1200013',nome:'Teste',telefone:'68999999999',regional:'Baixo Acre',zona:'8',secao:'001',bairro:'Centro'};
    assert.equal(await page.evaluate(async r => {
      try { await BANCO_ELEICOES.salvar(r); return false; } catch { return true; }
    },r),true,'Não deve salvar sem login');
    await page.evaluate(()=>BANCO_ELEICOES.entrar('teste@example.invalid','senha-de-teste'));
    await page.evaluate(r=>BANCO_ELEICOES.salvar(r),r);
    assert.equal(registros.size,1);
    await page.evaluate(r=>localStorage.setItem('seagri_eleicoes_v1',JSON.stringify([r,r])),r);
    await page.evaluate(()=>BANCO_ELEICOES.importar());
    await page.evaluate(()=>BANCO_ELEICOES.importar());
    assert.equal(registros.size,3,'Importação repetida não duplica, mas preserva duplicatas da fonte');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('seagri_eleicoes_v1')).length),2);
    await page.reload();
    await page.waitForFunction(()=>BANCO_ELEICOES.conectado());
    assert.equal(await page.evaluate(()=>BANCO_ELEICOES.ler().length),3);
    falhar = true;
    assert.equal(await page.evaluate(async r=> {try {await BANCO_ELEICOES.salvar(r);return false;}catch{return true;}},r),true);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('seagri_eleicoes_v1')).length),2,'Falha online não salva no local');
    falhar = false;
    await page.evaluate(()=>BANCO_ELEICOES.sair());
    assert.equal(await page.evaluate(()=>BANCO_ELEICOES.conectado()),false);
    autorizado = false;
    assert.equal(await page.evaluate(async()=>{try{await BANCO_ELEICOES.entrar('teste@example.invalid','senha-de-teste');return false;}catch{return true;}}),true);
    const localContext = await browser.newContext();
    const localPage = await localContext.newPage();
    await localPage.goto(pathToFileURL(path.resolve(__dirname,'../pages/eleicoes.html')).href);
    await localPage.evaluate(r=>BANCO_ELEICOES.salvar(r),r);
    assert.equal(await localPage.evaluate(()=>BANCO_ELEICOES.ler().length),1,'Modo local preservado');
    console.log('OK: login, autorização, persistência, importação idempotente, cópia local, falha de rede, logout e modo local. API simulada; banco real ainda não configurado.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
