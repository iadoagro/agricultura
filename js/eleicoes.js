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
  let locaisMapaAtual = [];
  let coberturaMapaCarregada = false;
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
    if (!coberturaMapaCarregada) return '<strong>' + escBairro(nome) + '</strong><br>Cobertura de fiscais ainda não disponível.';
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
  // vez de só a forma do polígono. Fábrica compartilhada com a aba
  // Resultados — ver js/mapa-bairros-leaflet.js.
  let bairroMapaDesenhado = null;
  const mapaBairros = window.criarMapaBairrosLeaflet ? window.criarMapaBairrosLeaflet({
    containerId: 'mapaBairros',
    btnZoomMaisId: 'mapaBairrosZoomMais',
    btnZoomMenosId: 'mapaBairrosZoomMenos',
    btnZoomResetId: 'mapaBairrosZoomReset',
    zoomValorId: 'mapaBairrosZoomValor',
    btnTelaCheiaId: 'mapaBairrosTelaCheia',
    secaoId: 'mapaBairrosSecao',
    corContorno: '#ffe066',
    obterDica: htmlDicaBairro
  }) : null;
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

    // O mapa e os bairros são dados públicos locais; não dependem do banco de fiscais.
    if (mapaBairros && bairroMapaDesenhado !== selecionado) {
      mapaBairros.desenhar(dadosBairros.features);
      bairroMapaDesenhado = selecionado;
    }
    if (mapaBairros) mapaBairros.invalidar();
    atualizarTextoMapaBairros();
    let registros;
    try { registros = ler(); }
    catch (e) {
      coberturaMapaCarregada = false;
      locaisMapaAtual = [];
      porBairroAtual = new Map();
      if (mapaBairros) mapaBairros.atualizarPontos([]);
      document.getElementById('mapaFiscaisResumo').textContent = 'Mapa carregado. A cobertura será exibida quando os cadastros estiverem disponíveis. ' + (document.getElementById('banco-mensagem').textContent || e.message);
      return;
    }
    coberturaMapaCarregada = true;
    locaisMapaAtual = window.CoberturaLocaisMapa(selecionado, registros, locais, window.DADOS_VOTACAO_SCHAFER || {});
    porBairroAtual = new Map();
    locaisMapaAtual.forEach(item => {
      const coord = window.LOCAIS_COORDENADAS[item.local.id];
      if (!coord || !coord.bairro) return;
      const acc = porBairroAtual.get(coord.bairro) || {oficiais: 0, comFiscal: 0};
      acc.oficiais += item.secoes.length;
      acc.comFiscal += item.secoes.filter(s => s.comFiscal).length;
      porBairroAtual.set(coord.bairro, acc);
    });


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
    if (containerEl) containerEl.setAttribute('aria-label', 'Mapa dos locais de votação de ' + nomeMun + ': vermelho com seções sem fiscal, verde com cobertura completa');
    if (dica) dica.textContent = 'Clique em um local para consultar as seções, os votos de 2022 e a cobertura de fiscais.';
  }
  function atualizarPinsBairros() {
    if (!mapaBairros || !coberturaMapaCarregada) return;
    const filtro = document.getElementById('mapaFiscaisHistorico').value;
    const soPendentes = document.getElementById('mapaFiscaisPendentes').checked;
    const dados = dadosBairrosDoMunicipio(selecionado);
    const bairros = new Set((dados ? dados.features : []).map(f => f.properties.bairro));
    const pontos = [];
    let semMapa = 0, pendentes = 0, identificadas = 0;
    locaisMapaAtual.forEach(item => {
      const secoes = item.secoes.filter(s => (!soPendentes || !s.comFiscal) &&
        (!filtro || (filtro === 'com' && s.votos > 0) || (filtro === 'sem' && s.votos === 0)));
      if (!secoes.length) return;
      const coord = window.LOCAIS_COORDENADAS[item.local.id];
      if (!coord || !bairros.has(coord.bairro) || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) {
        semMapa += secoes.length; return;
      }
      const faltam = item.secoes.filter(s => !s.comFiscal).length;
      pendentes += secoes.filter(s => !s.comFiscal).length;
      identificadas += secoes.length;
      pontos.push({lat: coord.lat, lon: coord.lon, cor: faltam ? '#dc3545' : '#1f9d55', html:
        '<strong>' + escBairro(item.local.nome) + '</strong><br>' + escBairro(coord.bairro) +
        '<br>Zona ' + escBairro(item.local.zona) + ' · ' + faltam + ' de ' + item.secoes.length + ' seções sem fiscal' +
        '<table class="fiscais-mapa-secoes"><thead><tr><th>Seção</th><th>Votos 2022</th><th>Fiscal</th></tr></thead><tbody>' +
        secoes.map(s => '<tr><td>' + escBairro(s.numero) + '</td><td>' + (s.votos === null ? 'Sem dado' : s.votos) +
          '</td><td class="' + (s.comFiscal ? 'fiscal-presente' : 'fiscal-ausente') + '">' +
          (s.comFiscal ? 'Cadastrado' : 'Pendente') + '</td></tr>').join('') + '</tbody></table>'});
    });
    mapaBairros.atualizarPontos(pontos);
    document.getElementById('mapaFiscaisResumo').textContent = pontos.length + ' locais no mapa · ' + identificadas +
      ' seções no filtro · ' + pendentes + ' sem fiscal. ' + semMapa + ' seções do filtro sem bairro/coordenada no mapa.';
  }
  document.getElementById('mapaFiscaisHistorico').addEventListener('change', atualizarPinsBairros);
  document.getElementById('mapaFiscaisPendentes').addEventListener('change', atualizarPinsBairros);
  document.getElementById('anterior').onclick = () => { pagina--; listar(); };
  document.getElementById('proximo').onclick = () => { pagina++; listar(); };
  let redimensionandoListaTimer = null;
  window.addEventListener('resize', () => {
    if (!selecionado) return;
    clearTimeout(redimensionandoListaTimer);
    redimensionandoListaTimer = setTimeout(listar, 150);
  });
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
  function criarBotoesAcao(r) {
    const acoes = document.createElement('div');
    acoes.className = 'acoes-cadastro';
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button'; btnEditar.className = 'editar-cadastro'; btnEditar.textContent = 'Editar cadastro';
    btnEditar.onclick = () => iniciarEdicao(r);
    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button'; btnExcluir.className = 'excluir-cadastro'; btnExcluir.textContent = 'Excluir cadastro';
    btnExcluir.onclick = () => excluirRegistro(r);
    acoes.append(btnEditar, btnExcluir);
    return acoes;
  }
  const dialogoAcoes = document.getElementById('cadastro-acoes-dialogo');
  const tituloAcoes = document.getElementById('cadastro-acoes-titulo');
  const botoesAcoes = document.getElementById('cadastro-acoes-botoes');
  document.getElementById('cadastro-acoes-cancelar').onclick = () => dialogoAcoes.close();
  function abrirPopupAcoes(r) {
    tituloAcoes.textContent = r.nome || 'Cadastro';
    botoesAcoes.replaceChildren();
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button'; btnEditar.className = 'editar-cadastro'; btnEditar.textContent = 'Editar cadastro';
    btnEditar.onclick = () => { dialogoAcoes.close(); iniciarEdicao(r); };
    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button'; btnExcluir.className = 'excluir-cadastro'; btnExcluir.textContent = 'Excluir cadastro';
    btnExcluir.onclick = () => { dialogoAcoes.close(); excluirRegistro(r); };
    botoesAcoes.append(btnEditar, btnExcluir);
    dialogoAcoes.showModal();
  }
  function criarTelefoneWhatsApp(r) {
    const item = document.createElement('span');
    item.className = 'cadastro-telefone';
    item.textContent = r.telefone || 'Não informado';
    const digitos = (r.telefone || '').replace(/\D/g, '');
    const internacional = digitos.length === 10 || digitos.length === 11 ? '55' + digitos : digitos;
    if (/^\d{10,15}$/.test(internacional)) {
      const link = document.createElement('a');
      link.href = 'https://wa.me/' + internacional;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = r.telefone + ' — WhatsApp';
      link.setAttribute('aria-label', 'Conversar com ' + r.nome + ' no WhatsApp');
      item.replaceChildren(link);
    }
    return item;
  }
  // Versão compacta do link de WhatsApp: só o ícone e a palavra "WhatsApp",
  // sem mostrar o número — usada ao lado do nome na barra lateral.
  function criarWhatsAppCompacto(r) {
    const digitos = (r.telefone || '').replace(/\D/g, '');
    const internacional = digitos.length === 10 || digitos.length === 11 ? '55' + digitos : digitos;
    if (!/^\d{10,15}$/.test(internacional)) {
      const semTelefone = document.createElement('span');
      semTelefone.className = 'cadastro-whatsapp-compacto sem-telefone';
      semTelefone.textContent = 'Sem telefone';
      return semTelefone;
    }
    const link = document.createElement('a');
    link.className = 'cadastro-whatsapp-compacto';
    link.href = 'https://wa.me/' + internacional;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.innerHTML = '<span aria-hidden="true">💬</span> WhatsApp';
    link.setAttribute('aria-label', 'Conversar com ' + r.nome + ' no WhatsApp');
    link.onclick = e => e.stopPropagation();
    return link;
  }
  // compacto: usado na barra lateral (vários cadastros empilhados) — só nome,
  // WhatsApp (sem o número) e zona/seção, sem os demais campos nem a data de
  // cadastro; clicar no nome abre um popup com editar/excluir.
  function construirCartaoCadastro(r, compacto) {
    const li = document.createElement('li');
    if (compacto) {
      li.className = 'cadastro-compacto';
      const cabecalho = document.createElement('div');
      cabecalho.className = 'cadastro-cabecalho';
      cabecalho.tabIndex = 0;
      cabecalho.setAttribute('role', 'button');
      cabecalho.setAttribute('aria-label', 'Ações do cadastro de ' + (r.nome || ''));
      const nome = document.createElement('strong');
      nome.textContent = r.nome || 'Não informado';
      cabecalho.append(nome, criarWhatsAppCompacto(r));
      cabecalho.onclick = () => abrirPopupAcoes(r);
      cabecalho.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPopupAcoes(r); } };
      const zonaSecao = document.createElement('span');
      zonaSecao.className = 'cadastro-info-compacta';
      zonaSecao.textContent = 'Zona ' + (r.zona || '—') + ' · Seção ' + (r.secao || '—');
      li.append(cabecalho, zonaSecao);
      return li;
    }
    const titulos = {regional:'Regional', bairro:'Bairro', secao:'Seção eleitoral', zona:'Zona eleitoral'};
    ['nome', 'regional', 'bairro', 'secao', 'zona'].forEach(k => {
      const item = document.createElement(k === 'nome' ? 'strong' : 'span');
      item.textContent = (titulos[k] ? titulos[k] + ': ' : '') + (r[k] || 'Não informado');
      li.append(item);
    });
    li.append(criarTelefoneWhatsApp(r));
    if (r._criadoEm) {
      const auditoria = document.createElement('span');
      auditoria.className = 'cadastro-auditoria';
      auditoria.textContent = 'Cadastrado em ' + new Date(r._criadoEm).toLocaleDateString('pt-BR');
      li.append(auditoria);
    }
    li.append(criarBotoesAcao(r));
    return li;
  }
  function listar() {
    const lista = document.getElementById('cadastros');
    lista.replaceChildren();
    try {
      const registros = registrosFiltrados();
      document.getElementById('lista-titulo').textContent = 'Cadastros do município (' + registros.length + ')';
      if (!registros.length) {
        lista.textContent = 'Nenhum cadastro neste município.';
        document.getElementById('paginacao').hidden = true;
        listarAbaixoDoMapa();
        renderizarMapaBairros();
        return;
      }
      // Em vez de um cadastro por vez, empilha quantos couberem até a borda
      // visível do painel e só então pagina os demais.
      const primeiroCard = construirCartaoCadastro(registros[0], true);
      lista.append(primeiroCard);
      const alturaCard = primeiroCard.offsetHeight || 1;
      const espacoDisponivel = window.innerHeight - lista.getBoundingClientRect().top - 70;
      const porPagina = Math.max(1, Math.floor(espacoDisponivel / alturaCard));
      const totalPaginas = Math.ceil(registros.length / porPagina);
      pagina = Math.max(0, Math.min(pagina, totalPaginas - 1));
      const inicio = pagina * porPagina;
      lista.replaceChildren();
      registros.slice(inicio, inicio + porPagina).forEach(r => lista.append(construirCartaoCadastro(r, true)));
      document.getElementById('paginacao').hidden = totalPaginas < 2;
      document.getElementById('pagina-atual').textContent = (pagina+1) + ' de ' + totalPaginas;
      document.getElementById('anterior').disabled = pagina === 0;
      document.getElementById('proximo').disabled = pagina >= totalPaginas-1;
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
    // Agora que a lista lateral pode empilhar vários cadastros, o formulário
    // (no topo do painel) pode ficar fora da área visível quando se clica
    // num cadastro mais abaixo — rola até ele sempre, não só no mobile.
    form.scrollIntoView({behavior:'smooth', block:'start'});
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
