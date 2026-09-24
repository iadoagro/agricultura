/* Busca global de Fiscais (por nome/telefone, município, regional e zona) e
   exportação em PDF da lista filtrada (impressão do navegador → "Salvar como
   PDF", mesmo caminho do Relatório), para o time de campo. Independente do
   painel de cadastro por município de js/eleicoes.js — não lê nem altera o
   estado dele, só window.BANCO_ELEICOES.ler(). Mostra os fiscais com o mesmo
   cartão da lista do município (window.CARTAO_FISCAL), que abre o município
   e destaca a seção no mapa ao clicar. */
(function () {
  'use strict';
  var campoTexto = document.getElementById('buscaGlobalTexto');
  var selRegional = document.getElementById('buscaGlobalRegional');
  var selMunicipio = document.getElementById('buscaGlobalMunicipio');
  var selZona = document.getElementById('buscaGlobalZona');
  var btnExportar = document.getElementById('buscaGlobalExportar');
  var status = document.getElementById('buscaGlobalStatus');
  var lista = document.getElementById('buscaGlobalLista');
  if (!lista || !window.BANCO_ELEICOES) return;

  var LIMITE_EXIBICAO = 300;   // "Todos": teto pra não travar a página
  // Forma de ver a lista: cartões (N por linha, padrão 6) ou lista (um por
  // linha), e quantos por vez (com páginas) — escolhas guardadas no navegador.
  var selVisao = document.getElementById('buscaGlobalVisao');
  var selPorLinha = document.getElementById('buscaGlobalPorLinha');
  var selPorVez = document.getElementById('buscaGlobalPorVez');
  var paginas = document.getElementById('buscaGlobalPaginas');
  var CHAVE_VISAO = 'fiscais-busca-visao';
  var pagina = 0;
  try {
    var salvo = JSON.parse(localStorage.getItem(CHAVE_VISAO) || 'null');
    if (salvo) {
      if (salvo.visao) selVisao.value = salvo.visao;
      if (salvo.porLinha) selPorLinha.value = salvo.porLinha;
      if (salvo.porVez != null) selPorVez.value = salvo.porVez;
    }
  } catch (e) { /* modo privado */ }
  function aplicarVisao() {
    var lista_ = selVisao.value === 'lista';
    lista.classList.toggle('modo-lista', lista_);
    lista.style.setProperty('--por-linha', selPorLinha.value);
    document.getElementById('buscaGlobalPorLinhaRotulo').hidden = lista_;
    try { localStorage.setItem(CHAVE_VISAO, JSON.stringify({ visao: selVisao.value, porLinha: selPorLinha.value, porVez: selPorVez.value })); } catch (e) { /* idem */ }
  }
  var canonico = function (n) { return String(n || '').replace(/^0+/, '') || ''; };

  var nomesMun = new Map((window.MAPA_ACRE ? window.MAPA_ACRE.localidades : [])
    .map(function (m) { return [String(m.id), m.nome]; }));

  (window.REGIONAIS || []).forEach(function (r) { selRegional.add(new Option(r, r)); });
  (window.MAPA_ACRE ? window.MAPA_ACRE.localidades.slice() : [])
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
    .forEach(function (m) { selMunicipio.add(new Option(m.nome, String(m.id))); });
  var zonas = [...new Set((window.LOCAIS_VOTACAO ? window.LOCAIS_VOTACAO.locais : []).map(function (l) { return l.zona; }))]
    .sort(function (a, b) { return Number(a) - Number(b); });
  zonas.forEach(function (z) { selZona.add(new Option('Zona ' + z, z)); });

  function filtrados() {
    var texto = campoTexto.value.trim().toLowerCase();
    var textoDigitos = texto.replace(/\D/g, '');
    return window.BANCO_ELEICOES.ler().filter(function (r) {
      if (selRegional.value && window.REGIONAIS_MUNICIPIOS[r.municipio] !== selRegional.value) return false;
      if (selMunicipio.value && r.municipio !== selMunicipio.value) return false;
      if (selZona.value && canonico(r.zona) !== canonico(selZona.value)) return false;
      if (!texto) return true;
      var nomeBate = (r.nome || '').toLowerCase().indexOf(texto) !== -1;
      var telBate = textoDigitos && (r.telefone || '').replace(/\D/g, '').indexOf(textoDigitos) !== -1;
      return nomeBate || telBate;
    });
  }

  // Mesmo cartão da lista do município (window.CARTAO_FISCAL, de
  // js/eleicoes.js), com o município do fiscal: clicar abre o município e
  // destaca a seção no mapa; "⋯" edita/exclui.
  function renderizar() {
    // No modo online, window.BANCO_ELEICOES.ler() lança enquanto o banco
    // ainda está buscando os cadastros na 1ª carga da página — tenta de novo
    // quando o evento "banco-atualizado" avisar que terminou.
    var registros;
    try { registros = filtrados(); } catch (e) { status.textContent = e.message; lista.replaceChildren(); return; }
    registros.sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'); });
    var porVez = Number(selPorVez.value) || 0;
    var total = registros.length;
    var nPaginas = porVez ? Math.max(1, Math.ceil(total / porVez)) : 1;
    if (pagina >= nPaginas) pagina = nPaginas - 1;
    var inicio = porVez ? pagina * porVez : 0;
    var fim = porVez ? Math.min(total, inicio + porVez) : Math.min(total, LIMITE_EXIBICAO);
    status.textContent = total + (total === 1 ? ' fiscal encontrado.' : ' fiscais encontrados.') +
      (!porVez && total > LIMITE_EXIBICAO ? ' Mostrando os primeiros ' + LIMITE_EXIBICAO + '; refine a busca ou mostre por páginas.' : '');
    paginas.hidden = !porVez || nPaginas < 2;
    document.getElementById('buscaGlobalPagina').textContent = (inicio + 1) + '–' + fim + ' de ' + total + ' · página ' + (pagina + 1) + ' de ' + nPaginas;
    document.getElementById('buscaGlobalAnterior').disabled = pagina === 0;
    document.getElementById('buscaGlobalProxima').disabled = pagina >= nPaginas - 1;
    if (!total) {
      var vazio = document.createElement('li');
      vazio.className = 'vazio-linha';
      vazio.textContent = 'Nenhum fiscal encontrado com esses filtros.';
      lista.replaceChildren(vazio);
      return;
    }
    lista.replaceChildren.apply(lista, registros.slice(inicio, fim).map(function (r) {
      if (window.CARTAO_FISCAL) return window.CARTAO_FISCAL(r);
      var li = document.createElement('li');
      li.textContent = (r.nome || '') + ' — ' + (nomesMun.get(r.municipio) || r.municipio);
      return li;
    }));
  }

  // PDF: monta uma tabela só pra impressão (todos os filtrados, sem as
  // páginas da tela) e abre a impressão — lá a pessoa escolhe "Salvar como
  // PDF". O CSS de body.imprimindo-busca esconde todo o resto da página.
  function exportarPDF() {
    var registros;
    try { registros = filtrados(); } catch (e) { status.textContent = e.message; return; }
    if (!registros.length) { status.textContent = 'Nenhum fiscal nesses filtros para exportar.'; return; }
    registros.sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'); });
    var filtrosUsados = [
      campoTexto.value.trim() && 'Busca: "' + campoTexto.value.trim() + '"',
      selRegional.value && 'Regional: ' + selRegional.value,
      selMunicipio.value && 'Município: ' + (nomesMun.get(selMunicipio.value) || selMunicipio.value),
      selZona.value && 'Zona ' + selZona.value
    ].filter(Boolean).join(' · ') || 'Todos os municípios';
    var folha = document.createElement('section');
    folha.id = 'buscaGlobalImpressao';
    var titulo = document.createElement('h1'); titulo.textContent = 'Fiscais cadastrados';
    var sub = document.createElement('p');
    sub.textContent = filtrosUsados + ' · ' + registros.length + (registros.length === 1 ? ' fiscal' : ' fiscais') +
      ' · gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    var tabela = document.createElement('table');
    var cab = ['Nome', 'Telefone', 'Município', 'Regional', 'Bairro', 'Zona', 'Seção', 'Local de votação'];
    tabela.innerHTML = '<thead><tr>' + cab.map(function () { return '<th></th>'; }).join('') + '</tr></thead><tbody></tbody>';
    tabela.querySelectorAll('th').forEach(function (th, i) { th.textContent = cab[i]; });
    var corpo = tabela.querySelector('tbody');
    registros.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.nome, r.telefone, nomesMun.get(r.municipio) || r.municipio, window.REGIONAIS_MUNICIPIOS[r.municipio] || '',
        r.bairro, r.zona, r.secao, r.localVotacao].forEach(function (v) {
        var td = document.createElement('td'); td.textContent = v == null ? '' : v; tr.appendChild(td);
      });
      corpo.appendChild(tr);
    });
    folha.append(titulo, sub, tabela);
    document.body.appendChild(folha);
    document.body.classList.add('imprimindo-busca');
    var sair = function () {
      document.body.classList.remove('imprimindo-busca');
      folha.remove();
      window.removeEventListener('afterprint', sair);
    };
    window.addEventListener('afterprint', sair);
    window.print();
  }

  // filtro novo volta pra 1ª página
  function refiltrar() { pagina = 0; renderizar(); }
  [campoTexto, selRegional, selMunicipio, selZona].forEach(function (el) {
    el.addEventListener('input', refiltrar);
    el.addEventListener('change', refiltrar);
  });
  [selVisao, selPorLinha, selPorVez].forEach(function (el) {
    el.addEventListener('change', function () { aplicarVisao(); refiltrar(); });
  });
  document.getElementById('buscaGlobalAnterior').addEventListener('click', function () { pagina--; renderizar(); });
  document.getElementById('buscaGlobalProxima').addEventListener('click', function () { pagina++; renderizar(); });
  aplicarVisao();
  btnExportar.addEventListener('click', exportarPDF);
  window.addEventListener('banco-atualizado', renderizar);
  window.addEventListener('municipios-carregados', renderizar);
  renderizar();
})();
