/* Malha e localidades: API pública do IBGE. Cadastros locais por município. */
(function () {
  'use strict';
  const chave = 'seagri_eleicoes_v1';
  const mapa = document.getElementById('mapa');
  const seletor = document.getElementById('municipio');
  const painel = document.getElementById('painel');
  const form = document.getElementById('cadastro');
  const mensagem = document.getElementById('mensagem');
  const nomes = new Map();
  let selecionado = '';
  let pagina = 0;
  const locais = window.LOCAIS_VOTACAO.locais;
  const cz = document.getElementById('consulta-zona'), cl = document.getElementById('consulta-local'), cs = document.getElementById('consulta-secao');
  const zona = form.elements.zona, secao = form.elements.secao;
  const canonico = n => String(n || '').replace(/^0+/, '') || '';
  const doMunicipio = () => locais.filter(l => l.municipio === selecionado);
  function opcoes(select, itens, vazio) {
    select.replaceChildren(new Option(vazio, ''));
    itens.forEach(([valor, texto]) => select.add(new Option(texto, valor)));
  }
  function secoesDe(lista) {
    return lista.flatMap(l => l.secoes.flatMap(s => [{numero:s.numero, local:l, texto:s.numero}, ...s.agregadas.map(n => ({numero:n, local:l, texto:n+' (agregada à '+s.numero+')'}))])).sort((a,b)=>Number(a.numero)-Number(b.numero));
  }
  function prepararSecoes() {
    const itens = secoesDe(doMunicipio().filter(l => l.zona === zona.value));
    opcoes(secao, itens.map(s=>[s.numero,s.texto+' — '+s.local.nome]), 'Selecione a seção');
    secao.disabled = !zona.value;
  }
  zona.addEventListener('change', prepararSecoes);
  function atualizarConsulta(nivel) {
    const base = doMunicipio().filter(l=>!cz.value || l.zona===cz.value);
    if (nivel === 'zona') opcoes(cl, base.map(l=>[l.id,l.nome+' — Zona '+l.zona]), 'Todos os locais');
    const lista = base.filter(l=>!cl.value || l.id===cl.value);
    if (nivel !== 'secao') opcoes(cs, secoesDe(lista).map(s=>[s.local.id+':'+s.numero,s.texto+' — Zona '+s.local.zona]), 'Todas as seções');
    const local = cl.value ? lista[0] : cs.value ? locais.find(l=>l.id===cs.value.split(':')[0]) : null;
    document.getElementById('local-detalhes').textContent = local ? local.nome+' · '+local.endereco+' · '+local.area+(local.provisorio?' · Alocação provisória':'') : lista.length+' locais de votação · '+secoesDe(lista).length+' seções, incluindo agregadas. Selecione um local para ver o endereço.';
    zona.value = local ? local.zona : cz.value;
    prepararSecoes();
    if (cs.value) secao.value = cs.value.split(':')[1];
    pagina = 0; listar();
  }
  cz.onchange = () => atualizarConsulta('zona');
  cl.onchange = () => atualizarConsulta('local');
  cs.onchange = () => atualizarConsulta('secao');
  document.getElementById('anterior').onclick = () => { pagina--; listar(); };
  document.getElementById('proximo').onclick = () => { pagina++; listar(); };
  function ler() {
    return window.BANCO_ELEICOES.ler();
  }
  function listar() {
    const lista = document.getElementById('cadastros');
    lista.replaceChildren();
    try {
      const registros = ler().filter(r => {
        if (r.municipio !== selecionado) return false;
        if (cz.value && canonico(r.zona)!==canonico(cz.value)) return false;
        const idLocal = cs.value ? cs.value.split(':')[0] : cl.value;
        if (idLocal) {
          const l = locais.find(l=>l.id===idLocal);
          if (canonico(r.zona)!==canonico(l.zona) || !secoesDe([l]).some(s=>canonico(s.numero)===canonico(r.secao))) return false;
        }
        return !cs.value || canonico(r.secao)===canonico(cs.value.split(':')[1]);
      });
      pagina = Math.max(0, Math.min(pagina, registros.length-1));
      document.getElementById('paginacao').hidden = registros.length < 2;
      document.getElementById('pagina-atual').textContent = (pagina+1) + ' de ' + registros.length;
      document.getElementById('anterior').disabled = pagina === 0;
      document.getElementById('proximo').disabled = pagina >= registros.length-1;
      document.getElementById('lista-titulo').textContent = 'Cadastros do município (' + registros.length + ')';
      if (!registros.length) lista.textContent = 'Nenhum cadastro neste município.';
      registros.slice(pagina,pagina+1).forEach(r => {
        const li = document.createElement('li');
        const titulos = {regional:'Regional', bairro:'Bairro', secao:'Seção eleitoral', zona:'Zona eleitoral'};
        ['nome', 'regional', 'bairro', 'secao', 'zona', 'telefone'].forEach(k => {
          const item = document.createElement(k === 'nome' ? 'strong' : 'span');
          item.textContent = (titulos[k] ? titulos[k] + ': ' : '') + (r[k] || 'Não informado');
          if (k === 'telefone') {
            item.className = 'cadastro-telefone';
            const digitos = r.telefone.replace(/\D/g, '');
            const internacional = digitos.length === 10 || digitos.length === 11 ? '55' + digitos : digitos;
            if (/^\d{10,15}$/.test(internacional)) {
              const link = document.createElement('a');
              link.href = 'https://wa.me/' + internacional;
              link.target = '_blank'; link.rel = 'noopener noreferrer';
              link.textContent = r.telefone + ' — WhatsApp';
              link.setAttribute('aria-label', 'Conversar com ' + r.nome + ' no WhatsApp');
              item.replaceChildren(link);
            }
          }
          li.append(item);
        });
        lista.append(li);
      });
    } catch (e) { lista.textContent = e.message; document.getElementById('paginacao').hidden = true; }
  }
  function abrir(id) {
    if (!nomes.has(id)) return;
    selecionado = id;
    pagina = 0;
    seletor.value = id;
    document.getElementById('painel-titulo').textContent = nomes.get(id);
    mapa.querySelectorAll('path').forEach(p => p.classList.toggle('selecionado', p.dataset.id === id));
    document.querySelectorAll('#municipios-lista button').forEach(b => {
      b.classList.toggle('selecionado', b.dataset.id === id);
      b.setAttribute('aria-pressed', String(b.dataset.id === id));
    });
    form.reset(); mensagem.textContent = '';
    const zonas = [...new Set(doMunicipio().map(l=>l.zona))].sort((a,b)=>Number(a)-Number(b)).map(z=>[z,'Zona '+z]);
    opcoes(cz, zonas, 'Todas as zonas'); opcoes(zona, zonas, 'Selecione a zona');
    document.getElementById('consulta-eleitoral').hidden = false;
    atualizarConsulta('zona');
    form.hidden = false;
    if (window.innerWidth < 1000) painel.scrollIntoView({behavior:'smooth', block:'start'});
  }
  seletor.onchange = () => abrir(seletor.value);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const registro = {municipio: selecionado};
    for (const k of ['nome','telefone','regional']) {
      registro[k] = form.elements[k].value.trim();
      if (!registro[k]) { form.elements[k].focus(); mensagem.textContent = 'Preencha todos os campos.'; mensagem.className = 'erro'; return; }
    }
    if (!/^[+()\d\s.-]+$/.test(registro.telefone) || !/^\d{10,13}$/.test(registro.telefone.replace(/\D/g, ''))) {
      mensagem.textContent = 'Informe um telefone válido com DDD.'; mensagem.className = 'erro'; return;
    }
    for (const k of ['bairro', 'secao', 'zona']) registro[k] = form.elements[k].value.trim();
    const local = doMunicipio().find(l=>l.zona===registro.zona && secoesDe([l]).some(s=>s.numero===registro.secao));
    if (!local) { mensagem.className = 'erro'; mensagem.textContent = 'Selecione uma zona e seção válidas deste município.'; return; }
    registro.localVotacao = local.nome;
    registro.localId = local.id;
    const botaoSalvar = form.querySelector('.salvar');
    if (botaoSalvar.disabled) return;
    botaoSalvar.disabled = true;
    try {
      await window.BANCO_ELEICOES.salvar(registro);
      form.reset(); atualizarConsulta('secao'); mensagem.className = ''; mensagem.textContent = window.BANCO_ELEICOES.online ? 'Cadastro salvo no banco online.' : 'Cadastro salvo neste navegador.';
      document.getElementById('nome').focus();
    } catch (e) { mensagem.className = 'erro'; mensagem.textContent = e.message; }
    finally { botaoSalvar.disabled = false; }
  });
  window.addEventListener('banco-atualizado', () => { if (selecionado) listar(); });
  window.addEventListener('storage', e => { if (e.key === chave && selecionado) listar(); });
  const ns = 'http://www.w3.org/2000/svg';
  // O mapa acompanha a página e funciona também quando aberta como arquivo local.
  Promise.resolve().then(() => {
    if (!window.MAPA_ACRE) throw new Error('Mapa indisponível');
    const {geo, localidades} = window.MAPA_ACRE;
    localidades.sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach(m => {
      nomes.set(String(m.id), m.nome);
      const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.nome; seletor.append(opt);
      const botao = document.createElement('button');
      botao.type = 'button'; botao.dataset.id = String(m.id); botao.textContent = m.nome;
      botao.setAttribute('aria-pressed', 'false'); botao.onclick = () => abrir(String(m.id));
      document.getElementById('municipios-lista').append(botao);
    });
    const polygons = f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const projetar = p => [p[0] * Math.cos(9 * Math.PI / 180), -p[1]];
    const pontos = geo.features.flatMap(f => polygons(f).flat(2)).map(projetar);
    const xs = pontos.map(p => p[0]), ys = pontos.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const escala = Math.min(940 / (maxX-minX), 540 / (maxY-minY));
    const transformar = p => { const q = projetar(p); return [(q[0]-minX)*escala+(1000-(maxX-minX)*escala)/2, (q[1]-minY)*escala+(600-(maxY-minY)*escala)/2]; };
    const rotulos = [];
    geo.features.forEach(f => {
      const id = String(f.properties.codarea);
      const path = document.createElementNS(ns,'path');
      path.setAttribute('d', polygons(f).map(poly => poly.map(ring => ring.map((p,i) => (i?'L':'M')+transformar(p).map(n=>n.toFixed(2)).join(',')).join('')+'Z').join('')).join(''));
      path.dataset.id = id; path.setAttribute('tabindex','0'); path.setAttribute('role','button'); path.setAttribute('aria-label',nomes.get(id));
      const title = document.createElementNS(ns,'title'); title.textContent = nomes.get(id); path.append(title);
      path.onclick = () => abrir(id); path.onkeydown = e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(id); } };
      path.onmouseenter = path.onfocus = () => { document.getElementById('municipio-hover').textContent = nomes.get(id); };
      mapa.append(path);
      // Centro de área do polígono principal, em coordenadas do próprio mapa.
      const ring = polygons(f).sort((a,b) => b[0].length-a[0].length)[0][0].map(transformar);
      let area = 0, cx = 0, cy = 0;
      ring.forEach((p,i) => { const q = ring[(i+1)%ring.length], a = p[0]*q[1]-q[0]*p[1]; area += a; cx += (p[0]+q[0])*a; cy += (p[1]+q[1])*a; });
      const x = cx/(3*area), y = cy/(3*area);
      rotulos.push({id,x,y,origX:x,origY:y});
    });
    // Afasta nomes próximos e mantém uma linha de referência para o município.
    for (let passo=0; passo<80; passo++) rotulos.forEach((a,i) => rotulos.slice(i+1).forEach(b => {
      if (Math.abs(a.x-b.x)<106 && Math.abs(a.y-b.y)<42) {
        const direcao = a.y <= b.y ? -1 : 1; a.y += direcao; b.y -= direcao;
      }
    }));
    rotulos.forEach(r => {
      if (Math.abs(r.y-r.origY)>8) {
        const linha = document.createElementNS(ns,'line');
        linha.setAttribute('x1',r.origX); linha.setAttribute('y1',r.origY); linha.setAttribute('x2',r.x); linha.setAttribute('y2',r.y);
        linha.setAttribute('class','rotulo-linha'); mapa.append(linha);
      }
      const texto = document.createElementNS(ns,'text'); texto.dataset.id = r.id;
      texto.setAttribute('x',r.x); texto.setAttribute('y',r.y); texto.onclick = () => abrir(r.id);
      const palavras = nomes.get(r.id).split(' '), linhas = [''];
      palavras.forEach(p => { if ((linhas[linhas.length-1]+' '+p).trim().length>15) linhas.push(p); else linhas[linhas.length-1] = (linhas[linhas.length-1]+' '+p).trim(); });
      linhas.forEach((l,i) => { const t = document.createElementNS(ns,'tspan'); t.setAttribute('x',r.x); t.setAttribute('dy',i ? 14 : -(linhas.length-1)*7); t.textContent = l; texto.append(t); });
      mapa.append(texto);
    });
    document.getElementById('mapa-status').hidden = true;
  }).catch(() => { document.getElementById('mapa-status').textContent = 'Não foi possível carregar o mapa. Recarregue a página para tentar novamente.'; });
})();
