/* Aba "Resultados" de eleicoes.html: mapa por município da votação de José
   Luís Schafer (2022, js/dados-votacao-schafer.js, gerado por
   tools/gerar_votacao_candidato.py) e detalhe por zona/seção ao clicar,
   incluindo as seções sem nenhum voto para ele — cruzado com
   window.LOCAIS_VOTACAO, que tem a lista oficial de seções por município. */
(function () {
  'use strict';
  var svg = document.getElementById('mapaResultados');
  var status = document.getElementById('resultadosStatus');
  var detalhe = document.getElementById('resultadosDetalhe');
  if (!svg) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  if (!window.MapaMunicipios || !window.MAPA_ACRE || !window.DADOS_VOTACAO_SCHAFER || !window.LOCAIS_VOTACAO) {
    if (status) status.textContent = 'Não foi possível carregar os dados de resultado.';
    return;
  }

  // Sub-abas por ano: 2022 com a votação real; 2026 com a mesma estrutura e
  // tudo zerado (eleição ainda não apurada) — todas as seções oficiais de
  // 2026 (window.LOCAIS_VOTACAO, incluindo agregadas) entram como "sem voto".
  // Quando houver o resultado de 2026, basta trocar DADOS_2026 pelo arquivo
  // gerado por tools/gerar_votacao_candidato.py.
  var D2022 = window.DADOS_VOTACAO_SCHAFER;
  function dadosZerados(base, ano) {
    var semVotos = [];
    window.LOCAIS_VOTACAO.locais.forEach(function (l) {
      l.secoes.forEach(function (s) {
        [s.numero].concat(s.agregadas || []).forEach(function (n) {
          semVotos.push({ municipio: l.municipio, zona: l.zona, secao: n, local: l.nome });
        });
      });
    });
    return { candidato: base.candidato, numero: base.numero, cargo: base.cargo, ano: ano, porMunicipio: [], porSecao: [], semVotos: semVotos };
  }
  var ANOS = { '2022': D2022, '2026': window.DADOS_VOTACAO_SCHAFER_2026 || dadosZerados(D2022, 2026) };

  var DADOS, votosPorMun, maxVotos, totalVotosEstado, porSecaoPorMun, semVotosPorMun;
  function usarDados(d) {
    DADOS = d;
    votosPorMun = new Map(DADOS.porMunicipio.map(function (r) { return [r.municipio, r.votos]; }));
    maxVotos = DADOS.porMunicipio.reduce(function (a, r) { return Math.max(a, r.votos); }, 1);
    totalVotosEstado = DADOS.porMunicipio.reduce(function (a, r) { return a + r.votos; }, 0);
    porSecaoPorMun = new Map();
    DADOS.porSecao.forEach(function (r) {
      if (!porSecaoPorMun.has(r.municipio)) porSecaoPorMun.set(r.municipio, []);
      porSecaoPorMun.get(r.municipio).push(r);
    });
    semVotosPorMun = new Map();
    DADOS.semVotos.forEach(function (r) {
      if (!semVotosPorMun.has(r.municipio)) semVotosPorMun.set(r.municipio, []);
      semVotosPorMun.get(r.municipio).push(r);
    });
  }
  usarDados(D2022);

  function ordemZonaSecao(a, b) {
    return Number(a.zona) - Number(b.zona) || String(a.secao).localeCompare(String(b.secao));
  }

  function corMunicipio(id) {
    var v = votosPorMun.get(id);
    if (!v) return '#e2e6ec';
    var l = Math.round(85 - (v / maxVotos) * 58);   // mais votos, azul mais escuro
    return 'hsl(215 42% ' + l + '%)';
  }

  // Dica ao passar o mouse (ou focar pelo teclado): resumo rápido do
  // município, sem precisar clicar para abrir o detalhe completo ao lado.
  var dica = document.getElementById('mapaResultadosDica');
  function mostrarDica(id) {
    if (!dica) return;
    var nome = mapa.nomes.get(id) || id;
    var votos = votosPorMun.get(id) || 0;
    var comVoto = (porSecaoPorMun.get(id) || []).length;
    var semVoto = (semVotosPorMun.get(id) || []).length;
    var totalSecoesMun = comVoto + semVoto;
    var pct = totalVotosEstado ? (votos / totalVotosEstado * 100) : 0;
    var pctCom = totalSecoesMun ? (comVoto / totalSecoesMun * 100) : 0;
    var pctSem = totalSecoesMun ? (semVoto / totalSecoesMun * 100) : 0;
    dica.innerHTML = '<strong>' + esc(nome) + '</strong>' +
      '<div class="linha"><span>Votos</span><span>' + votos + ' (' + pct.toFixed(1).replace('.', ',') + '% do total)</span></div>' +
      '<div class="linha com"><span>Urnas com voto</span><span>' + comVoto + ' (' + pctCom.toFixed(1).replace('.', ',') + '%)</span></div>' +
      '<div class="linha sem"><span>Seções sem voto</span><span>' + semVoto + ' (' + pctSem.toFixed(1).replace('.', ',') + '%)</span></div>';
    dica.hidden = false;
  }
  function esconderDica() { if (dica) dica.hidden = true; }
  if (dica) {
    svg.addEventListener('mousemove', function (e) {
      if (dica.hidden) return;
      var margem = 16;
      var x = e.clientX + margem, y = e.clientY + margem;
      // não deixa a dica sair da tela do lado direito/inferior
      if (x + 250 > window.innerWidth) x = e.clientX - 250 - margem;
      if (y + 110 > window.innerHeight) y = e.clientY - 110 - margem;
      dica.style.left = x + 'px';
      dica.style.top = y + 'px';
    });
  }

  var mapa = window.MapaMunicipios.desenhar(svg, {
    aoClicar: mostrarDetalhe,
    aoPassarMouse: mostrarDica,
    aoTirarMouse: esconderDica
  });
  if (!mapa) {
    if (status) status.textContent = 'Não foi possível carregar o mapa.';
    return;
  }
  status.hidden = true;
  mapa.pintar(corMunicipio);

  var secaoBairros = document.getElementById('resultadosBairrosSecao');
  var tituloBairros = document.getElementById('resultadosBairrosTitulo');
  var resumoBairros = document.getElementById('resultadosBairrosResumo');
  var voltarBairros = document.getElementById('resultadosBairrosVoltar');
  var votosBairros = new Map();
  function dicaVotosBairro(nome) {
    var b = votosBairros.get(nome);
    return '<strong>' + esc(nome) + '</strong>' + (!b ? '<br>Sem seção identificada nos dados disponíveis.' :
      '<br>' + b.votos + ' votos para o candidato<br>' + b.secoes.length + ' seções identificadas<br>' +
      b.secoes.map(function (r) { return 'Zona ' + esc(r.zona) + ' · Seção ' + esc(r.secao) + ': ' + r.votos + ' votos'; }).join('<br>'));
  }
  var mapaBairros = window.criarMapaBairrosLeaflet && secaoBairros
    ? window.criarMapaBairrosLeaflet({containerId: 'resultadosBairrosMapa', corContorno: '#ffe066',
        secaoId: 'resultadosBairrosSecao', btnZoomMaisId: 'resultadosZoomMais', btnZoomMenosId: 'resultadosZoomMenos',
        btnZoomResetId: 'resultadosZoomReset', btnTelaCheiaId: 'resultadosTelaCheia', zoomValorId: 'resultadosZoomValor',
        obterDica: dicaVotosBairro}) : null;
  function dadosBairros(id) {
    return id === '1200401' ? window.MAPA_BAIRROS_RIO_BRANCO
      : window.MAPA_BAIRROS_MUNICIPIOS && window.MAPA_BAIRROS_MUNICIPIOS[id];
  }
  function chaveSecaoVoto(zona, secao) {
    return String(Number(zona)) + '|' + String(Number(secao));
  }
  function mostrarMapaBairros(id, nome, comVoto) {
    var dados = dadosBairros(id);
    if (!dados || !dados.features || !dados.features.length || !mapaBairros) {
      secaoBairros.hidden = true;
      svg.removeAttribute('hidden');
      return;
    }
    var bairros = new Set(dados.features.map(function (f) { return f.properties.bairro; }));
    var votosSecao = new Map(comVoto.map(function (r) { return [chaveSecaoVoto(r.zona, r.secao), r]; }));
    var semVoto = new Set((semVotosPorMun.get(id) || []).map(function (r) { return chaveSecaoVoto(r.zona, r.secao); }));
    var vistas = new Set();
    votosBairros = new Map();
    window.LOCAIS_VOTACAO.locais.forEach(function (local) {
      if (local.municipio !== id) return;
      var coord = window.LOCAIS_COORDENADAS && window.LOCAIS_COORDENADAS[local.id];
      if (!coord || !bairros.has(coord.bairro)) return;
      local.secoes.forEach(function (s) {
        [s.numero].concat(s.agregadas || []).forEach(function (numero) {
          var chave = chaveSecaoVoto(local.zona, numero);
          if (vistas.has(chave) || (!votosSecao.has(chave) && !semVoto.has(chave))) return;
          vistas.add(chave);
          var r = votosSecao.get(chave) || {zona: local.zona, secao: numero, votos: 0};
          var b = votosBairros.get(coord.bairro) || {votos: 0, secoes: []};
          b.votos += Number(r.votos);
          b.secoes.push(r);
          votosBairros.set(coord.bairro, b);
        });
      });
    });
    svg.setAttribute('hidden', '');
    secaoBairros.hidden = false;
    tituloBairros.textContent = 'Votação nos bairros — ' + nome;
    resumoBairros.textContent = votosBairros.size + ' bairros com seções identificadas. Cores conforme os votos para ' + DADOS.candidato + '.';
    mapaBairros.desenhar(dados.features);
    var marcadores = new Map();
    votosBairros.forEach(function (b, bairro) {
      marcadores.set(bairro, {cor: b.votos > 0 ? '#1f9d55' : '#dc3545', html: dicaVotosBairro(bairro)});
    });
    mapaBairros.atualizarPinsPorBairro(marcadores);
    mapaBairros.invalidar();
  }
  if (voltarBairros) voltarBairros.addEventListener('click', function () {
    secaoBairros.hidden = true;
    svg.removeAttribute('hidden');
    mapa.destacar(null);
    if (elRanking) elRanking.querySelectorAll('button').forEach(function (b) { b.classList.remove('selecionado'); });
    mostrarResumoGeral();
  });

  // Lista à esquerda com todos os municípios, do maior para o menor número
  // de votos — mesma ação de clicar no mapa, só que em ordem de prioridade
  // em vez de posição geográfica.
  var elRanking = document.getElementById('resultadosRanking');
  function montarRanking() {
    if (!elRanking) return;
    var itensRanking = Array.from(mapa.nomes.entries()).map(function (par) {
      return { id: par[0], nome: par[1], votos: votosPorMun.get(par[0]) || 0 };
    }).sort(function (a, b) { return b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'); });
    elRanking.innerHTML = itensRanking.map(function (it) {
      return '<button type="button" data-id="' + esc(it.id) + '">' +
        '<span class="ranking-nome">' + esc(it.nome) + '</span><span class="ranking-votos">' + it.votos + '</span></button>';
    }).join('');
    elRanking.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () { mostrarDetalhe(btn.dataset.id); });
    });
  }
  montarRanking();

  // Antes de clicar em qualquer município, o painel à direita mostra o
  // resumo geral do estado em vez de só um convite pra clicar — mesmas
  // métricas do detalhe por município (js/eleicoes-resultados.js), só que
  // somadas pra todo o Acre.
  function mostrarResumoGeral() {
    if (!detalhe) return;
    var totalSecoesEstado = DADOS.porSecao.length + DADOS.semVotos.length;
    var comVotoEstado = DADOS.porSecao.length;
    var semVotoEstado = DADOS.semVotos.length;
    var pctCom = totalSecoesEstado ? (comVotoEstado / totalSecoesEstado * 100) : 0;
    var pctSem = totalSecoesEstado ? (semVotoEstado / totalSecoesEstado * 100) : 0;
    var municipiosComVoto = DADOS.porMunicipio.length;
    var totalMunicipios = mapa.nomes.size;

    detalhe.innerHTML = '<h3>Acre — todos os municípios</h3>' +
      '<p class="resultados-total">' + totalVotosEstado + ' votos para ' + esc(DADOS.candidato) + '</p>' +
      '<div class="indicadores-grade resultados-detalhe-stats">' +
        '<div class="indicador"><span class="indicador-rot">Seções no estado</span><span class="indicador-val">' + totalSecoesEstado + '</span></div>' +
        '<div class="indicador"><span class="indicador-rot">Urnas com voto</span><span class="indicador-val">' + comVotoEstado + '<small> (' + pctCom.toFixed(1).replace('.', ',') + '%)</small></span></div>' +
        '<div class="indicador"><span class="indicador-rot">Seções sem voto</span><span class="indicador-val">' + semVotoEstado + '<small> (' + pctSem.toFixed(1).replace('.', ',') + '%)</small></span></div>' +
        '<div class="indicador"><span class="indicador-rot">Municípios com voto</span><span class="indicador-val">' + municipiosComVoto + '<small> de ' + totalMunicipios + '</small></span></div>' +
      '</div>' +
      '<p class="resultados-dica">Clique num município no mapa (ou na lista à esquerda) para ver o detalhe por zona e seção.</p>';
  }
  mostrarResumoGeral();

  // Troca de ano: recalcula tudo com os dados do ano e volta pra visão do
  // estado (fecha o município/bairros abertos).
  var tituloResultados = document.getElementById('resultados-titulo');
  var avisoAno = document.getElementById('resultadosAvisoAno');
  var botoesAno = document.querySelectorAll('.anos-resultados .ano-res');
  function trocarAno(ano) {
    if (!ANOS[ano]) return;
    usarDados(ANOS[ano]);
    botoesAno.forEach(function (b) {
      var on = b.dataset.ano === ano;
      b.classList.toggle('ativa', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (tituloResultados) tituloResultados.textContent = 'Votação por seção — José Luís Schafer (' + ano + ')';
    svg.setAttribute('aria-label', 'Mapa de votos por município para José Luís Schafer em ' + ano);
    if (avisoAno) avisoAno.hidden = DADOS.porMunicipio.length > 0;
    if (secaoBairros) secaoBairros.hidden = true;
    svg.removeAttribute('hidden');
    mapa.destacar(null);
    mapa.pintar(corMunicipio);
    montarRanking();
    mostrarResumoGeral();
  }
  botoesAno.forEach(function (b) { b.addEventListener('click', function () { trocarAno(b.dataset.ano); }); });

  function mostrarDetalhe(id) {
    mapa.destacar(id);
    if (elRanking) elRanking.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('selecionado', b.dataset.id === id);
    });
    var nome = mapa.nomes.get(id) || id;
    var comVoto = (porSecaoPorMun.get(id) || []).slice().sort(ordemZonaSecao);
    var semVoto = (semVotosPorMun.get(id) || []).slice().sort(ordemZonaSecao);
    var total = votosPorMun.get(id) || 0;
    var totalSecoes = comVoto.length + semVoto.length;
    var pctTotal = totalVotosEstado ? (total / totalVotosEstado * 100) : 0;
    var pctCom = totalSecoes ? (comVoto.length / totalSecoes * 100) : 0;
    var pctSem = totalSecoes ? (semVoto.length / totalSecoes * 100) : 0;

    var html = '<h3>' + esc(nome) + '</h3>' +
      '<p class="resultados-total">' + total + ' votos para ' + esc(DADOS.candidato) + '</p>' +
      '<div class="indicadores-grade resultados-detalhe-stats">' +
        '<div class="indicador"><span class="indicador-rot">Seções no município</span><span class="indicador-val">' + totalSecoes + '</span></div>' +
        '<div class="indicador"><span class="indicador-rot">Urnas com voto</span><span class="indicador-val">' + comVoto.length + '<small> (' + pctCom.toFixed(1).replace('.', ',') + '%)</small></span></div>' +
        '<div class="indicador"><span class="indicador-rot">Seções sem voto</span><span class="indicador-val">' + semVoto.length + '<small> (' + pctSem.toFixed(1).replace('.', ',') + '%)</small></span></div>' +
        '<div class="indicador"><span class="indicador-rot">% do total de votos</span><span class="indicador-val">' + pctTotal.toFixed(1).replace('.', ',') + '%</span></div>' +
      '</div>' +
      '<h4>Seções com voto (' + comVoto.length + ')</h4>' +
      (comVoto.length
        ? '<ul class="resultados-lista">' + comVoto.map(function (r) {
            return '<li><span>Zona ' + esc(r.zona) + ' · Seção ' + esc(r.secao) + '</span>' +
              '<span class="votos">' + r.votos + '</span></li>';
          }).join('') + '</ul>'
        : '<p class="resultados-vazio">Nenhuma seção com voto neste município.</p>') +
      '<h4>Seções sem voto para o candidato (' + semVoto.length + ')</h4>' +
      (semVoto.length
        ? '<ul class="resultados-lista resultados-lista-vazia">' + semVoto.map(function (r) {
            return '<li><span>Zona ' + esc(r.zona) + ' · Seção ' + esc(r.secao) + '</span>' +
              '<span class="local">' + esc(r.local) + '</span></li>';
          }).join('') + '</ul>'
        : '<p class="resultados-vazio">Todas as seções tiveram ao menos um voto para o candidato.</p>');

    detalhe.innerHTML = html;
    mostrarMapaBairros(id, nome, comVoto);
  }

  /* -------------------------------------------- comparação com instantâneo
     Não existe base da eleição anterior (ver database/eleicoes-instantaneos.sql):
     a comparação parte de uma "foto" marcada manualmente na própria página,
     e mostra dali em diante quem ganhou ou perdeu fiscal. Chaveado sempre
     por (município, zona, seção) inteiro — nunca só zona+seção, que se
     repetem entre municípios (ver js/eleicoes.js). */
  var btnMarcar = document.getElementById('instantaneo-marcar');
  var instStatus = document.getElementById('instantaneo-status');
  var instResultado = document.getElementById('instantaneo-resultado');
  var selEscolher = document.getElementById('instantaneo-escolher');
  var rotEscolher = document.getElementById('instantaneo-escolher-rotulo');
  var blocoTendencia = document.getElementById('instantaneo-tendencia-bloco');
  var elTendencia = document.getElementById('instantaneo-tendencia');
  if (btnMarcar && window.BANCO_ELEICOES) {
    btnMarcar.hidden = false;

    var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : [])
      .map(function (m) { return [String(m.id), m.nome]; }));
    var chaveSecao = function (r) { return r.municipio + '|' + r.zona + '|' + r.secao; };
    var snapshots = []; // mais recente primeiro, igual devolvido por snapshotListar

    function listaInstantaneo(titulo, classe, itens) {
      if (!itens.length) return '';
      return '<h4>' + esc(titulo) + ' (' + itens.length + ')</h4>' +
        '<ul class="instantaneo-lista ' + classe + '">' + itens.map(function (r) {
          return '<li>' + esc(nomesMun.get(r.municipio) || r.municipio) +
            ' · Zona ' + esc(r.zona) + ' · Seção ' + esc(r.secao) + '</li>';
        }).join('') + '</ul>';
    }

    // % de cobertura geral de um instantâneo (ou da situação atual), contando
    // só seções que existem oficialmente — ver js/eleicoes-cobertura.js.
    function pctCobertura(secoes) {
      if (!window.CoberturaFiscais) return null;
      var oficiais = window.CoberturaFiscais.oficiais();
      var vistas = new Set();
      secoes.forEach(function (r) { var k = chaveSecao(r); if (oficiais.has(k)) vistas.add(k); });
      return oficiais.size ? vistas.size / oficiais.size * 100 : 0;
    }

    function renderizarTendencia() {
      if (!blocoTendencia || !elTendencia || !window.G || !snapshots.length) { if (blocoTendencia) blocoTendencia.hidden = true; return; }
      var registrosAtuais;
      try { registrosAtuais = window.BANCO_ELEICOES.ler(); }
      catch (e) { blocoTendencia.hidden = true; return; } // banco online ainda carregando; tenta de novo no próximo banco-atualizado
      var pontos = snapshots.slice().reverse().map(function (s) {
        return { rot: new Date(s.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), val: Math.round((pctCobertura(s.secoes) || 0) * 10) / 10 };
      });
      var agora = registrosAtuais.filter(function (r) { return r.municipio && r.zona && r.secao; });
      pontos.push({ rot: 'Agora', val: Math.round((pctCobertura(agora) || 0) * 10) / 10 });
      blocoTendencia.hidden = false;
      window.G.colunas(elTendencia, pontos, { unidade: '%', dec: 1, cor: '#153e75' });
    }

    async function carregarSnapshots() {
      try { snapshots = await window.BANCO_ELEICOES.snapshotListar(20); } catch (e) { snapshots = []; }
      if (selEscolher) {
        var atual = selEscolher.value;
        selEscolher.replaceChildren();
        snapshots.forEach(function (s, i) {
          selEscolher.add(new Option(new Date(s.criado_em).toLocaleString('pt-BR'), String(i)));
        });
        if (atual && snapshots[+atual]) selEscolher.value = atual;
        if (rotEscolher) rotEscolher.hidden = snapshots.length < 2;
      }
      renderizarTendencia();
    }

    async function comparar() {
      instStatus.textContent = 'Carregando…';
      instResultado.innerHTML = '';
      try {
        await carregarSnapshots();
        var indice = selEscolher && selEscolher.value ? +selEscolher.value : 0;
        var snap = snapshots[indice];
        if (!snap) { instStatus.textContent = 'Nenhum instantâneo marcado ainda.'; return; }
        var antes = new Set(snap.secoes.map(chaveSecao));
        var agora = new Map();
        window.BANCO_ELEICOES.ler().forEach(function (r) {
          if (!r.municipio || !r.zona || !r.secao) return;
          agora.set(chaveSecao(r), { municipio: r.municipio, zona: r.zona, secao: r.secao });
        });
        var ganharam = [], perderam = [];
        agora.forEach(function (r, k) { if (!antes.has(k)) ganharam.push(r); });
        antes.forEach(function (k) {
          if (!agora.has(k)) {
            var p = k.split('|');
            perderam.push({ municipio: p[0], zona: p[1], secao: p[2] });
          }
        });
        instStatus.textContent = 'Comparando com o instantâneo de ' + new Date(snap.criado_em).toLocaleString('pt-BR') + '.';
        var html = listaInstantaneo('Ganharam fiscal desde então', 'ganhou', ganharam) +
          listaInstantaneo('Perderam fiscal desde então', 'perdeu', perderam);
        instResultado.innerHTML = html || '<p class="resultados-vazio">Nenhuma mudança desde o instantâneo.</p>';
      } catch (e) { instStatus.textContent = e.message; }
    }

    btnMarcar.addEventListener('click', async function () {
      btnMarcar.disabled = true;
      instStatus.textContent = 'Marcando…';
      try {
        var n = await window.BANCO_ELEICOES.snapshotCriar();
        instStatus.textContent = 'Instantâneo marcado com ' + n + ' seções com fiscal.';
        await comparar();
      } catch (e) { instStatus.textContent = e.message; }
      finally { btnMarcar.disabled = false; }
    });

    if (selEscolher) selEscolher.addEventListener('change', comparar);
    window.addEventListener('banco-atualizado', comparar);
    comparar();
  }
})();
