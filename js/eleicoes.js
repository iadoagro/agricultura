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
  // Mapa de ruas de verdade, só pra município com bairro conhecido — Rio
  // Branco (fonte própria, SEFIN, ver tools/gerar_bairros_rio_branco.py) e
  // mais 8 municípios com bairro oficializado pelo IBGE no Censo 2022 (ver
  // tools/gerar_bairros_municipios.py); os demais municípios do Acre não
  // têm bairro oficial digitalizado em lugar nenhum encontrado. Cor pela
  // cobertura de fiscal dos locais de votação que caem em cada bairro.
  function dadosBairrosDoMunicipio(id) {
    if (id === '1200401') return window.MAPA_BAIRROS_RIO_BRANCO || null;
    return (window.MAPA_BAIRROS_MUNICIPIOS && window.MAPA_BAIRROS_MUNICIPIOS[id]) || null;
  }
  function escBairro(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function htmlDicaBairro(nome) {
    const acc = porBairroAtual.get(nome) || { oficiais: 0, comFiscal: 0 };
    const pct = acc.oficiais ? (acc.comFiscal / acc.oficiais * 100) : 0;
    return '<strong>' + escBairro(nome) + '</strong>' +
      '<div class="linha"><span>Cobertura</span><span>' + pct.toFixed(1).replace('.', ',') + '%</span></div>' +
      '<div class="linha com"><span>Seções com fiscal</span><span>' + acc.comFiscal + '</span></div>' +
      '<div class="linha sem"><span>Seções sem fiscal</span><span>' + Math.max(0, acc.oficiais - acc.comFiscal) + '</span></div>';
  }
  // Mapa de satélite de verdade (Leaflet + imagens públicas do Esri World
  // Imagery, sem precisar de chave de API) por baixo do contorno dos
  // bairros — pra dar pra reconhecer ruas/quadras/construções de verdade em
  // vez de só a forma do polígono. Um Leaflet só, criado na primeira vez que
  // precisa (evita carregar ladrilho de satélite à toa se o usuário nunca
  // abre um município com bairro).
  let mapaBairrosLeaflet = null;
  let camadaBairrosLeaflet = null;
  let camadaPinsLeaflet = null;
  let bairroMapaDesenhado = null;
  function obterMapaBairrosLeaflet() {
    if (mapaBairrosLeaflet || !window.L) return mapaBairrosLeaflet;
    const container = document.getElementById('mapaBairros');
    if (!container) return null;
    // zoomAnimation:false — a animação de zoom do Leaflet trava em alguns
    // navegadores/contextos (fica preso no zoom antigo até setZoom com
    // animate:false); zoom instantâneo é menos bonito mas sempre funciona.
    mapaBairrosLeaflet = L.map(container, { zoomControl: false, zoomAnimation: false, minZoom: 11, maxZoom: 19 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imagens: Esri, Maxar, Earthstar Geographics'
    }).addTo(mapaBairrosLeaflet);
    camadaPinsLeaflet = L.layerGroup().addTo(mapaBairrosLeaflet);
    mapaBairrosLeaflet.on('zoomend', atualizarBotoesZoomBairros);
    return mapaBairrosLeaflet;
  }
  function desenharMapaBairros(features) {
    const mapaL = obterMapaBairrosLeaflet();
    if (!mapaL) return;
    if (camadaBairrosLeaflet) { mapaL.removeLayer(camadaBairrosLeaflet); }
    centroidesBairro = new Map();
    camadaBairrosLeaflet = L.geoJSON({ type: 'FeatureCollection', features: features }, {
      // Preenchimento quase transparente — o ponto é deixar a imagem de
      // satélite aparecer por baixo; só o contorno delimita o bairro. Quem
      // tem fiscal aparece com um pin verde (ver atualizarPinsBairros), não
      // por intensidade de cor do polígono.
      style: { color: '#ffe066', weight: 2, fillColor: '#ffe066', fillOpacity: 0.06 },
      onEachFeature: (feature, layer) => {
        const nomeBairro = feature.properties.bairro;
        layer.bindTooltip(() => htmlDicaBairro(nomeBairro), { sticky: true, direction: 'top', className: 'mapa-bairros-dica-cobertura' });
        layer.on('mouseover', () => layer.setStyle({ weight: 3, fillOpacity: 0.22 }));
        layer.on('mouseout', () => layer.setStyle({ weight: 2, fillOpacity: 0.06 }));
        centroidesBairro.set(nomeBairro, layer.getBounds().getCenter());
      }
    }).addTo(mapaL);
    mapaL.fitBounds(camadaBairrosLeaflet.getBounds(), { padding: [12, 12] });
  }
  // Zoom e tela cheia do mapa de bairros — zoom de verdade do Leaflet agora
  // (mais nítido que o zoom por CSS de antes), tela cheia continua sendo a
  // API nativa do navegador na seção inteira.
  const btnBairrosZoomMais = document.getElementById('mapaBairrosZoomMais');
  const btnBairrosZoomMenos = document.getElementById('mapaBairrosZoomMenos');
  const btnBairrosZoomReset = document.getElementById('mapaBairrosZoomReset');
  const btnBairrosTelaCheia = document.getElementById('mapaBairrosTelaCheia');
  const elBairrosZoomValor = document.getElementById('mapaBairrosZoomValor');
  const secaoBairrosEl = document.getElementById('mapaBairrosSecao');
  function atualizarBotoesZoomBairros() {
    if (!mapaBairrosLeaflet) return;
    const z = mapaBairrosLeaflet.getZoom();
    if (elBairrosZoomValor) elBairrosZoomValor.textContent = 'Zoom ' + z;
    if (btnBairrosZoomMenos) btnBairrosZoomMenos.disabled = z <= mapaBairrosLeaflet.getMinZoom();
    if (btnBairrosZoomMais) btnBairrosZoomMais.disabled = z >= mapaBairrosLeaflet.getMaxZoom();
  }
  if (btnBairrosZoomMais) btnBairrosZoomMais.onclick = () => { if (mapaBairrosLeaflet) mapaBairrosLeaflet.zoomIn(); };
  if (btnBairrosZoomMenos) btnBairrosZoomMenos.onclick = () => { if (mapaBairrosLeaflet) mapaBairrosLeaflet.zoomOut(); };
  if (btnBairrosZoomReset) btnBairrosZoomReset.onclick = () => {
    if (mapaBairrosLeaflet && camadaBairrosLeaflet) mapaBairrosLeaflet.fitBounds(camadaBairrosLeaflet.getBounds(), { padding: [12, 12] });
  };
  function emTelaCheiaBairros() {
    return document.fullscreenElement === secaoBairrosEl || document.webkitFullscreenElement === secaoBairrosEl;
  }
  function atualizarBotaoTelaCheia() {
    if (!btnBairrosTelaCheia || !secaoBairrosEl) return;
    const cheio = emTelaCheiaBairros();
    btnBairrosTelaCheia.textContent = cheio ? 'Sair da tela cheia' : 'Tela cheia';
    btnBairrosTelaCheia.setAttribute('aria-pressed', String(cheio));
    // O contêiner muda de tamanho ao entrar/sair da tela cheia — sem isso o
    // Leaflet fica com ladrilhos faltando nas bordas até a próxima interação.
    if (mapaBairrosLeaflet) setTimeout(() => mapaBairrosLeaflet.invalidateSize(), 60);
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
    if (!secaoEl) return;
    const dadosBairros = dadosBairrosDoMunicipio(selecionado);
    const disponivel = Boolean(dadosBairros) && window.LOCAIS_COORDENADAS;
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

    if (bairroMapaDesenhado !== selecionado) {
      desenharMapaBairros(dadosBairros.features);
      bairroMapaDesenhado = selecionado;
    }
    if (mapaBairrosLeaflet) setTimeout(() => mapaBairrosLeaflet.invalidateSize(), 0);
    atualizarPinsBairros();
    atualizarTextoMapaBairros();
  }
  // Título e créditos da fonte mudam conforme o município (Rio Branco tem
  // fonte própria, mais detalhada; os demais vêm do IBGE).
  function atualizarTextoMapaBairros() {
    const titulo = document.getElementById('mapaBairrosTitulo');
    const dica = document.querySelector('#mapaBairrosSecao .mapa-esquematico-dica');
    const nomeMun = nomes.get(selecionado) || '';
    if (titulo) titulo.textContent = 'Cobertura por bairro — ' + nomeMun;
    const containerEl = document.getElementById('mapaBairros');
    if (containerEl) containerEl.setAttribute('aria-label', 'Mapa de satélite dos bairros de ' + nomeMun + ', com pin verde nos bairros com fiscal cadastrado');
    if (dica) {
      dica.textContent = selecionado === '1200401'
        ? 'Bairros oficiais da Prefeitura de Rio Branco (SEFIN). Passe o mouse para ver a cobertura de cada um.'
        : 'Bairros oficializados pelo IBGE (Censo Demográfico 2022). Passe o mouse para ver a cobertura de cada um.';
    }
  }
  // Um pin verde por bairro que tenha ao menos um fiscal cadastrado.
  function atualizarPinsBairros() {
    if (!camadaPinsLeaflet) return;
    camadaPinsLeaflet.clearLayers();
    centroidesBairro.forEach((centro, nome) => {
      const acc = porBairroAtual.get(nome);
      if (acc && acc.comFiscal > 0) {
        L.circleMarker(centro, { radius: 8, color: '#fff', weight: 2, fillColor: '#1f9d55', fillOpacity: 1 })
          .bindTooltip(nome + ' — tem fiscal cadastrado', { direction: 'top' })
          .addTo(camadaPinsLeaflet);
      }
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
  // bairros oficiais do mapa desse município (dadosBairrosDoMunicipio) —
  // só existe pra quem tem bairro oficializado (Rio Branco + os 8 do IBGE).
  // Devolve null nos demais, pra manter "Bairro" como texto livre.
  function bairrosDoMunicipio() {
    const dados = dadosBairrosDoMunicipio(selecionado);
    if (!dados || !window.LOCAIS_COORDENADAS) return null;
    const oficiais = new Set(dados.features.map(f => f.properties.bairro));
    const dasSecoes = new Set();
    doMunicipio().forEach(l => {
      const coord = window.LOCAIS_COORDENADAS[l.id];
      if (coord && coord.bairro && oficiais.has(coord.bairro)) dasSecoes.add(coord.bairro);
    });
    return [...dasSecoes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  // Troca o campo "Bairro" do formulário entre texto livre (padrão) e uma
  // lista fechada, conforme bairrosDoMunicipio(). Mantém o mesmo id/name
  // pra form.elements.bairro continuar funcionando igual.
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
    // Força reenquadrar o mapa de bairros (mesmo se for o mesmo município de
    // antes) — equivalente a "resetar zoom" de quando era um SVG com
    // transform; agora é o fitBounds do Leaflet, refeito em
    // renderizarMapaBairros() sempre que este id difere do último desenhado.
    bairroMapaDesenhado = null;
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
