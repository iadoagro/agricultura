/* Malha e localidades: API pública do IBGE. Cadastros locais por município. */
(function () {
  'use strict';
  const chave = 'seagri_eleicoes_v1';
  const mapa = document.getElementById('mapa');
  const mapaEstadoArea = document.getElementById('mapaEstadoArea');
  const seletor = document.getElementById('municipio');
  const formMunicipio = document.getElementById('formMunicipio');
  const painel = document.getElementById('painel');
  const form = document.getElementById('cadastro');
  const mensagem = document.getElementById('mensagem');
  const nomes = new Map();
  let selecionado = '';
  let pagina = 0;
  let editandoId = null;
  let bairroSvgDesenhado = null;
  let porBairroAtual = new Map();
  let centroidesBairro = new Map();
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
  // Mapa de ruas de verdade, só pra município com bairro conhecido (por ora
  // só Rio Branco — ver tools/geocodificar_locais_votacao.py e
  // tools/gerar_bairros_rio_branco.py). Polígono oficial de bairro
  // (SEFIN/rbgeo.riobranco.ac.gov.br), cor pela cobertura de fiscal dos
  // locais de votação que caem em cada bairro.
  function escBairro(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // Preenchimento sempre apagado (não colore mais por cobertura) — quem tem
  // fiscal aparece com um pin verde (ver atualizarPinsBairros), o polígono
  // em si só delimita o bairro.
  function corBairro() {
    return '#e4e7ec';
  }
  function mostrarDicaBairro(nome) {
    const dica = document.getElementById('mapaBairrosDica');
    if (!dica) return;
    const acc = porBairroAtual.get(nome) || { oficiais: 0, comFiscal: 0 };
    const pct = acc.oficiais ? (acc.comFiscal / acc.oficiais * 100) : 0;
    dica.innerHTML = '<strong>' + escBairro(nome) + '</strong>' +
      '<div class="linha"><span>Cobertura</span><span>' + pct.toFixed(1).replace('.', ',') + '%</span></div>' +
      '<div class="linha com"><span>Seções com fiscal</span><span>' + acc.comFiscal + '</span></div>' +
      '<div class="linha sem"><span>Seções sem fiscal</span><span>' + Math.max(0, acc.oficiais - acc.comFiscal) + '</span></div>';
    dica.hidden = false;
  }
  function esconderDicaBairro() {
    const dica = document.getElementById('mapaBairrosDica');
    if (dica) dica.hidden = true;
  }
  function desenharSvgBairros(svg) {
    svg.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const features = window.MAPA_BAIRROS_RIO_BRANCO.features;
    // Orientação geográfica padrão (norte pra cima, leste à direita) — igual
    // ao mapa do estado (js/mapa-municipios.js). Rio Branco é naturalmente
    // mais alto que largo; o quadro (viewBox) segue essa proporção real em
    // vez de forçar uma rotação, pra não inverter a posição dos bairros.
    const projetar = p => [p[0] * Math.cos(9.97 * Math.PI / 180), -p[1]];
    const polysDe = f => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    const pontos = features.flatMap(f => polysDe(f).flat(2)).map(projetar);
    const xs = pontos.map(p => p[0]), ys = pontos.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const escala = Math.min(350 / (maxX - minX), 440 / (maxY - minY));
    const transformar = p => { const q = projetar(p); return [(q[0] - minX) * escala + (390 - (maxX - minX) * escala) / 2, (q[1] - minY) * escala + (480 - (maxY - minY) * escala) / 2]; };
    // Centro de área do maior anel do bairro (fórmula do shoelace, mesma
    // usada em js/mapa-municipios.js), em coordenadas já transformadas —
    // é onde o pin verde de "tem fiscal" é desenhado.
    function centroDoAnel(anel) {
      const pontos = anel.map(transformar);
      let area = 0, cx = 0, cy = 0;
      pontos.forEach((p, i) => {
        const q = pontos[(i + 1) % pontos.length], a = p[0] * q[1] - q[0] * p[1];
        area += a; cx += (p[0] + q[0]) * a; cy += (p[1] + q[1]) * a;
      });
      return area ? [cx / (3 * area), cy / (3 * area)] : pontos[0];
    }
    centroidesBairro = new Map();
    features.forEach(f => {
      const nome = f.properties.bairro;
      const d = polysDe(f).map(poly => poly.map(anel => anel.map((p, i) => (i ? 'L' : 'M') + transformar(p).map(n => n.toFixed(2)).join(',')).join('') + 'Z').join('')).join('');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.dataset.bairro = nome;
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'img');
      path.setAttribute('aria-label', nome);
      const title = document.createElementNS(ns, 'title'); title.textContent = nome; path.append(title);
      path.addEventListener('mouseenter', () => mostrarDicaBairro(nome));
      path.addEventListener('focus', () => mostrarDicaBairro(nome));
      path.addEventListener('mouseleave', esconderDicaBairro);
      path.addEventListener('blur', esconderDicaBairro);
      svg.append(path);
      const maiorAnel = polysDe(f).map(poly => poly[0]).sort((a, b) => b.length - a.length)[0];
      centroidesBairro.set(nome, centroDoAnel(maiorAnel));
    });
    const gPins = document.createElementNS(ns, 'g');
    gPins.setAttribute('id', 'mapaBairrosPins');
    svg.append(gPins);
    svg.addEventListener('mousemove', e => {
      const dica = document.getElementById('mapaBairrosDica');
      if (!dica || dica.hidden) return;
      const margem = 16;
      let x = e.clientX + margem, y = e.clientY + margem;
      if (x + 250 > window.innerWidth) x = e.clientX - 250 - margem;
      if (y + 110 > window.innerHeight) y = e.clientY - 110 - margem;
      dica.style.left = x + 'px'; dica.style.top = y + 'px';
    });
  }
  // Zoom e tela cheia do mapa de bairros: reaproveita a mesma svg#mapaBairros
  // desenhada por desenharSvgBairros; zoom é só transform CSS (não redesenha
  // path nenhum), com o viewport (#mapaBairrosViewport) provendo a rolagem
  // quando o mapa fica maior que a área visível.
  const mapaBairrosViewport = document.getElementById('mapaBairrosViewport');
  const btnBairrosZoomMais = document.getElementById('mapaBairrosZoomMais');
  const btnBairrosZoomMenos = document.getElementById('mapaBairrosZoomMenos');
  const btnBairrosZoomReset = document.getElementById('mapaBairrosZoomReset');
  const btnBairrosTelaCheia = document.getElementById('mapaBairrosTelaCheia');
  const elBairrosZoomValor = document.getElementById('mapaBairrosZoomValor');
  const secaoBairrosEl = document.getElementById('mapaBairrosSecao');
  const ZOOM_BAIRROS_MIN = 1, ZOOM_BAIRROS_MAX = 4, ZOOM_BAIRROS_PASSO = 0.25;
  let zoomBairros = 1;
  function aplicarZoomBairros() {
    const svg = document.getElementById('mapaBairros');
    if (!svg) return;
    svg.style.transform = 'scale(' + zoomBairros + ')';
    if (elBairrosZoomValor) elBairrosZoomValor.textContent = Math.round(zoomBairros * 100) + '%';
    if (btnBairrosZoomMenos) btnBairrosZoomMenos.disabled = zoomBairros <= ZOOM_BAIRROS_MIN;
    if (btnBairrosZoomMais) btnBairrosZoomMais.disabled = zoomBairros >= ZOOM_BAIRROS_MAX;
  }
  function ajustarZoomBairros(delta) {
    zoomBairros = Math.min(ZOOM_BAIRROS_MAX, Math.max(ZOOM_BAIRROS_MIN, +(zoomBairros + delta).toFixed(2)));
    aplicarZoomBairros();
  }
  function resetZoomBairros() {
    zoomBairros = 1;
    aplicarZoomBairros();
    if (mapaBairrosViewport) { mapaBairrosViewport.scrollLeft = 0; mapaBairrosViewport.scrollTop = 0; }
  }
  if (btnBairrosZoomMais) btnBairrosZoomMais.onclick = () => ajustarZoomBairros(ZOOM_BAIRROS_PASSO);
  if (btnBairrosZoomMenos) btnBairrosZoomMenos.onclick = () => ajustarZoomBairros(-ZOOM_BAIRROS_PASSO);
  if (btnBairrosZoomReset) btnBairrosZoomReset.onclick = resetZoomBairros;
  if (mapaBairrosViewport) {
    mapaBairrosViewport.addEventListener('wheel', e => {
      e.preventDefault();
      ajustarZoomBairros(e.deltaY < 0 ? ZOOM_BAIRROS_PASSO : -ZOOM_BAIRROS_PASSO);
    }, { passive: false });
  }
  function emTelaCheiaBairros() {
    return document.fullscreenElement === secaoBairrosEl || document.webkitFullscreenElement === secaoBairrosEl;
  }
  function atualizarBotaoTelaCheia() {
    if (!btnBairrosTelaCheia || !secaoBairrosEl) return;
    const cheio = emTelaCheiaBairros();
    btnBairrosTelaCheia.textContent = cheio ? 'Sair da tela cheia' : 'Tela cheia';
    btnBairrosTelaCheia.setAttribute('aria-pressed', String(cheio));
  }
  if (btnBairrosTelaCheia && secaoBairrosEl) {
    btnBairrosTelaCheia.onclick = () => {
      if (emTelaCheiaBairros()) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      } else {
        const pedir = secaoBairrosEl.requestFullscreen || secaoBairrosEl.webkitRequestFullscreen;
        if (pedir) pedir.call(secaoBairrosEl);
      }
    };
    document.addEventListener('fullscreenchange', atualizarBotaoTelaCheia);
    document.addEventListener('webkitfullscreenchange', atualizarBotaoTelaCheia);
  }
  function renderizarMapaBairros() {
    const secaoEl = document.getElementById('mapaBairrosSecao');
    const svg = document.getElementById('mapaBairros');
    if (!secaoEl || !svg) return;
    const disponivel = selecionado === '1200401' && window.MAPA_BAIRROS_RIO_BRANCO && window.LOCAIS_COORDENADAS;
    secaoEl.hidden = !disponivel;
    if (mapaEstadoArea) mapaEstadoArea.hidden = disponivel;
    // Com o mapa de bairros em foco, some com o resto do card (rodapé) e com
    // as duas seções abaixo (zonas/locais e cadastros/busca global) — só o
    // mapa aparece. Quando não é o caso, cada uma continua sob controle do
    // código que já cuida delas (abrir(), listarAbaixoDoMapa()).
    const rodapeEl = document.querySelector('.mapa-rodape');
    if (rodapeEl) rodapeEl.hidden = disponivel;
    const secoesAbaixoEl = document.querySelector('.secoes-abaixo-mapa');
    if (secoesAbaixoEl && disponivel) secoesAbaixoEl.hidden = true;
    if (!disponivel) {
      if (secoesAbaixoEl) secoesAbaixoEl.hidden = false;
      return;
    }

    let comFiscal = new Set();
    try {
      ler().filter(r => r.municipio === selecionado && r.zona && r.secao)
        .forEach(r => comFiscal.add(canonico(r.zona) + '|' + canonico(r.secao)));
    } catch (e) { /* banco online ainda carregando; recalcula no próximo banco-atualizado */ }

    porBairroAtual = new Map();
    doMunicipio().forEach(l => {
      const coord = window.LOCAIS_COORDENADAS[l.id];
      if (!coord || !coord.bairro) return;
      const acc = porBairroAtual.get(coord.bairro) || { oficiais: 0, comFiscal: 0 };
      secoesDe([l]).forEach(s => {
        acc.oficiais++;
        if (comFiscal.has(canonico(l.zona) + '|' + canonico(s.numero))) acc.comFiscal++;
      });
      porBairroAtual.set(coord.bairro, acc);
    });

    if (bairroSvgDesenhado !== selecionado) {
      desenharSvgBairros(svg);
      bairroSvgDesenhado = selecionado;
    }
    svg.querySelectorAll('path[data-bairro]').forEach(path => {
      path.style.fill = corBairro(path.dataset.bairro);
    });
    atualizarPinsBairros(svg);
  }
  // Um pin verde por bairro que tenha ao menos um fiscal cadastrado — em vez
  // de colorir o polígono por intensidade de cobertura. Reaproveita o mesmo
  // <g> a cada atualização (só troca quais bairros têm pin), sem redesenhar
  // os polígonos.
  function criarPinVerde(nome, x, y) {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'bairro-pin');
    g.dataset.bairroPin = nome;
    const r = 7;
    const tail = document.createElementNS(ns, 'path');
    tail.setAttribute('d', 'M' + (x - r * 0.55).toFixed(1) + ',' + (y - r * 0.6).toFixed(1) +
      'L' + (x + r * 0.55).toFixed(1) + ',' + (y - r * 0.6).toFixed(1) + 'L' + x.toFixed(1) + ',' + y.toFixed(1) + 'Z');
    const cabeca = document.createElementNS(ns, 'circle');
    cabeca.setAttribute('cx', x); cabeca.setAttribute('cy', y - r * 1.4); cabeca.setAttribute('r', r);
    const furo = document.createElementNS(ns, 'circle');
    furo.setAttribute('class', 'bairro-pin-furo');
    furo.setAttribute('cx', x); furo.setAttribute('cy', y - r * 1.4); furo.setAttribute('r', r * 0.4);
    const title = document.createElementNS(ns, 'title'); title.textContent = nome + ' — tem fiscal cadastrado';
    g.append(tail, cabeca, furo, title);
    return g;
  }
  function atualizarPinsBairros(svg) {
    const grupo = svg.querySelector('#mapaBairrosPins');
    if (!grupo) return;
    grupo.replaceChildren();
    centroidesBairro.forEach((centro, nome) => {
      const acc = porBairroAtual.get(nome);
      if (acc && acc.comFiscal > 0) grupo.append(criarPinVerde(nome, centro[0], centro[1]));
    });
  }
  document.getElementById('anterior').onclick = () => { pagina--; listar(); };
  document.getElementById('proximo').onclick = () => { pagina++; listar(); };
  function ler() {
    return window.BANCO_ELEICOES.ler();
  }
  function registrosFiltrados() {
    return ler().filter(r => {
      if (r.municipio !== selecionado) return false;
      if (cz.value && canonico(r.zona)!==canonico(cz.value)) return false;
      const idLocal = cs.value ? cs.value.split(':')[0] : cl.value;
      if (idLocal) {
        const l = locais.find(l=>l.id===idLocal);
        if (canonico(r.zona)!==canonico(l.zona) || !secoesDe([l]).some(s=>canonico(s.numero)===canonico(r.secao))) return false;
      }
      return !cs.value || canonico(r.secao)===canonico(cs.value.split(':')[1]);
    });
  }
  function construirCartaoCadastro(r) {
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
    if (r._criadoEm) {
      const auditoria = document.createElement('span');
      auditoria.className = 'cadastro-auditoria';
      auditoria.textContent = 'Cadastrado em ' + new Date(r._criadoEm).toLocaleDateString('pt-BR');
      li.append(auditoria);
    }
    const acoes = document.createElement('div');
    acoes.className = 'acoes-cadastro';
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button'; btnEditar.className = 'editar-cadastro'; btnEditar.textContent = 'Editar cadastro';
    btnEditar.onclick = () => iniciarEdicao(r);
    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button'; btnExcluir.className = 'excluir-cadastro'; btnExcluir.textContent = 'Excluir cadastro';
    btnExcluir.onclick = () => excluirRegistro(r);
    acoes.append(btnEditar, btnExcluir);
    li.append(acoes);
    return li;
  }
  function listar() {
    const lista = document.getElementById('cadastros');
    lista.replaceChildren();
    try {
      const registros = registrosFiltrados();
      pagina = Math.max(0, Math.min(pagina, registros.length-1));
      document.getElementById('paginacao').hidden = registros.length < 2;
      document.getElementById('pagina-atual').textContent = (pagina+1) + ' de ' + registros.length;
      document.getElementById('anterior').disabled = pagina === 0;
      document.getElementById('proximo').disabled = pagina >= registros.length-1;
      document.getElementById('lista-titulo').textContent = 'Cadastros do município (' + registros.length + ')';
      if (!registros.length) lista.textContent = 'Nenhum cadastro neste município.';
      registros.slice(pagina,pagina+1).forEach(r => lista.append(construirCartaoCadastro(r)));
    } catch (e) { lista.textContent = e.message; document.getElementById('paginacao').hidden = true; }
    listarAbaixoDoMapa();
    renderizarMapaBairros();
  }
  // Lista completa (sem paginar) dos cadastros do município selecionado,
  // abaixo do mapa — complementa o único registro por vez da barra lateral,
  // pra ver todo mundo de uma vez sem clicar em "próximo" várias vezes.
  function listarAbaixoDoMapa() {
    const secaoEl = document.getElementById('cadastrosMapaSecao');
    const listaEl = document.getElementById('cadastrosMapaLista');
    const buscaGlobalConteudo = document.getElementById('buscaGlobalConteudo');
    if (!secaoEl || !listaEl) return;
    // Mesmo espaço da busca global: com um município selecionado, mostra os
    // cadastros dele ali (em vez da caixa vazia que ficava embaixo do mapa);
    // sem município, volta a mostrar a busca em todos os municípios.
    if (!selecionado) {
      secaoEl.hidden = true;
      if (buscaGlobalConteudo) buscaGlobalConteudo.hidden = false;
      return;
    }
    secaoEl.hidden = false;
    if (buscaGlobalConteudo) buscaGlobalConteudo.hidden = true;
    listaEl.replaceChildren();
    try {
      const registros = registrosFiltrados();
      document.getElementById('cadastrosMapaTitulo').textContent = 'Cadastros do município (' + registros.length + ')';
      if (!registros.length) {
        const li = document.createElement('li');
        li.className = 'vazio-linha';
        li.textContent = 'Nenhum cadastro neste município.';
        listaEl.append(li);
        return;
      }
      registros.forEach(r => listaEl.append(construirCartaoCadastro(r)));
    } catch (e) { listaEl.textContent = e.message; }
  }
  function iniciarEdicao(r) {
    if (!window.BANCO_ELEICOES.online && !r._id) {
      mensagem.className = 'erro'; mensagem.textContent = 'Este cadastro salvo localmente é antigo demais e não pode ser editado. Exclua e cadastre de novo.';
      return;
    }
    editandoId = r._id;
    form.elements.nome.value = r.nome || '';
    form.elements.telefone.value = r.telefone || '';
    // Regional não é mais digitada/escolhida à parte — abrir() já a define
    // (e trava) a partir do município, então nem entra aqui.
    form.elements.bairro.value = r.bairro || '';
    form.elements.zona.value = r.zona || '';
    prepararSecoes();
    form.elements.secao.value = r.secao || '';
    document.getElementById('cadastro-titulo').textContent = 'Editar cadastro';
    form.querySelector('.salvar').textContent = 'Salvar edição';
    document.getElementById('cancelarEdicao').hidden = false;
    mensagem.textContent = ''; mensagem.className = '';
    form.hidden = false;
    if (window.innerWidth < 1000) form.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function excluirRegistro(r) {
    if (!window.BANCO_ELEICOES.online && !r._id) {
      mensagem.className = 'erro'; mensagem.textContent = 'Este cadastro salvo localmente é antigo demais e não pode ser excluído por aqui.';
      return;
    }
    if (!window.confirm('Excluir o cadastro de ' + r.nome + '? Essa ação não poderá ser revertida.')) return;
    mensagem.textContent = 'Excluindo…'; mensagem.className = '';
    window.BANCO_ELEICOES.excluir(r._id).then(() => {
      if (editandoId === r._id) encerrarEdicao();
      mensagem.className = ''; mensagem.textContent = 'Cadastro excluído.';
    }).catch(e => { mensagem.className = 'erro'; mensagem.textContent = e.message; });
  }
  function encerrarEdicao() {
    editandoId = null;
    form.reset();
    formMunicipio.value = selecionado;
    document.getElementById('cadastro-titulo').textContent = 'Adicionar cadastro';
    form.querySelector('.salvar').textContent = 'Salvar cadastro';
    document.getElementById('cancelarEdicao').hidden = true;
    mensagem.textContent = ''; mensagem.className = '';
  }
  document.getElementById('cancelarEdicao').onclick = encerrarEdicao;
  // Bairros válidos do município selecionado: cruza quem tem seção de
  // votação (window.LOCAIS_COORDENADAS, por local de votação) com os
  // bairros oficiais do mapa (window.MAPA_BAIRROS_RIO_BRANCO) — só existe
  // pra Rio Branco, único município com essa geometria. Devolve null nos
  // demais, pra manter "Bairro" como texto livre.
  function bairrosDoMunicipio() {
    if (selecionado !== '1200401' || !window.MAPA_BAIRROS_RIO_BRANCO || !window.LOCAIS_COORDENADAS) return null;
    const oficiais = new Set(window.MAPA_BAIRROS_RIO_BRANCO.features.map(f => f.properties.bairro));
    const dasSecoes = new Set();
    doMunicipio().forEach(l => {
      const coord = window.LOCAIS_COORDENADAS[l.id];
      if (coord && coord.bairro && oficiais.has(coord.bairro)) dasSecoes.add(coord.bairro);
    });
    return [...dasSecoes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  // Troca o campo "Bairro" do formulário entre texto livre (padrão) e uma
  // lista fechada (Rio Branco), conforme bairrosDoMunicipio(). Mantém o
  // mesmo id/name pra form.elements.bairro continuar funcionando igual.
  function atualizarCampoBairro() {
    const atual = document.getElementById('bairro');
    const bairros = bairrosDoMunicipio();
    const valorAtual = atual.value;
    if (bairros && bairros.length) {
      let campo = atual;
      if (atual.tagName !== 'SELECT') {
        campo = document.createElement('select');
        campo.id = 'bairro'; campo.name = 'bairro';
        atual.replaceWith(campo);
      }
      opcoes(campo, bairros.map(b => [b, b]), 'Selecione o bairro');
      if (bairros.includes(valorAtual)) campo.value = valorAtual;
    } else if (atual.tagName !== 'INPUT') {
      const input = document.createElement('input');
      input.id = 'bairro'; input.name = 'bairro'; input.maxLength = 120;
      atual.replaceWith(input);
    }
  }
  function abrir(id) {
    if (!nomes.has(id)) return;
    encerrarEdicao();
    selecionado = id;
    pagina = 0;
    resetZoomBairros();
    atualizarCampoBairro();
    seletor.value = id;
    document.getElementById('painel-titulo').textContent = nomes.get(id);
    mapa.querySelectorAll('path').forEach(p => p.classList.toggle('selecionado', p.dataset.id === id));
    document.querySelectorAll('#municipios-lista button').forEach(b => {
      b.classList.toggle('selecionado', b.dataset.id === id);
      b.setAttribute('aria-pressed', String(b.dataset.id === id));
    });
    formMunicipio.value = id;
    // Regional é fixa por município (window.REGIONAIS_MUNICIPIOS) — não faz
    // sentido deixar escolher outra, então preenche e trava o campo.
    const regionalDoMunicipio = window.REGIONAIS_MUNICIPIOS && window.REGIONAIS_MUNICIPIOS[id];
    if (regionalDoMunicipio) {
      form.elements.regional.value = regionalDoMunicipio;
      form.elements.regional.disabled = true;
    } else {
      form.elements.regional.disabled = false;
    }
    const zonas = [...new Set(doMunicipio().map(l=>l.zona))].sort((a,b)=>Number(a)-Number(b)).map(z=>[z,'Zona '+z]);
    opcoes(cz, zonas, 'Todas as zonas'); opcoes(zona, zonas, 'Selecione a zona');
    document.getElementById('consulta-eleitoral').hidden = false;
    atualizarConsulta('zona');
    form.hidden = false;
    if (window.innerWidth < 1000) painel.scrollIntoView({behavior:'smooth', block:'start'});
  }
  seletor.onchange = () => abrir(seletor.value);
  formMunicipio.onchange = () => abrir(formMunicipio.value);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!selecionado) { formMunicipio.focus(); mensagem.textContent = 'Selecione um município.'; mensagem.className = 'erro'; return; }
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
      if (editandoId) {
        await window.BANCO_ELEICOES.editar(editandoId, registro);
        encerrarEdicao(); atualizarConsulta('secao');
        mensagem.className = ''; mensagem.textContent = 'Cadastro atualizado.';
      } else {
        await window.BANCO_ELEICOES.salvar(registro);
        form.reset(); formMunicipio.value = selecionado; atualizarConsulta('secao'); mensagem.className = ''; mensagem.textContent = window.BANCO_ELEICOES.online ? 'Cadastro salvo no banco online.' : 'Cadastro salvo neste navegador.';
        document.getElementById('nome').focus();
      }
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
      const optForm = document.createElement('option'); optForm.value = m.id; optForm.textContent = m.nome; formMunicipio.append(optForm);
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
