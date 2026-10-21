/* Página de edição de um lançamento já salvo (pages/lancamento-editar.html)
   — aberta a partir do botão "Editar" na lista da aba "Lançamento"
   (js/lancamento-mecanizacao.js). O comportamento do formulário em si é o
   mesmo da aba (ver js/lancamento-campos.js); aqui só entra o que é
   específico da edição: carregar o registro existente, preencher os
   campos com ele, e gravar por cima (PATCH) em vez de inserir. */
(function () {
  'use strict';

  // Mesmos 22 municípios do Acre que dashboard.js monta pra aba (ali fica
  // agrupado por regional, que a edição não precisa — só a lista plana).
  var REGIONAIS_MUNS = [
    ['Assis Brasil', 'Brasiléia', 'Epitaciolândia', 'Xapuri'],
    ['Acrelândia', 'Bujari', 'Capixaba', 'Plácido de Castro', 'Porto Acre', 'Rio Branco', 'Senador Guiomard'],
    ['Manoel Urbano', 'Santa Rosa do Purus', 'Sena Madureira'],
    ['Feijó', 'Jordão', 'Tarauacá'],
    ['Cruzeiro do Sul', 'Mâncio Lima', 'Marechal Thaumaturgo', 'Porto Walter', 'Rodrigues Alves']
  ];
  var MUNICIPIOS = [].concat.apply([], REGIONAIS_MUNS).sort();

  // Campos com o mesmo nome na tabela e no <input>/<select> — cópia direta,
  // sem regra especial (essa fica com tipo_servico, município/escritório,
  // indígena/etnia, associação e georreferenciamento, tratados à parte).
  var CAMPOS_DIRETOS = [
    'data_vistoria', 'responsavel_tecnico', 'nome_beneficiario', 'cpf', 'data_nascimento',
    'estado_civil', 'sexo', 'possui_dap', 'telefone', 'endereco', 'nome_propriedade',
    'num_identificacao_patrimonio', 'tipo_uso', 'observacao',
    'horas_maquina', 'quantidade_acudes', 'area_total_ha'
  ];

  function el(id) { return document.getElementById(id); }
  var esc = window.LANCAMENTO_CAMPOS.esc;
  function aviso(alvoId, classe, html) {
    el(alvoId).innerHTML = html ? '<p class="aviso ' + classe + '">' + html + '</p>' : '';
  }
  function idDaUrl() {
    var m = /[?&]id=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function sessaoSite() {
    try {
      var auth = window.ADMIN_AUTH;
      return (auth && auth.sessaoAtual && auth.sessaoAtual()) || null;
    } catch (e) { return null; }
  }

  var form = el('lancForm'), ajuda, id = idDaUrl(), registroOriginal = null;
  // "?modo=ver": o botão de visualizar da lista abre esta mesma página, com
  // o formulário todo travado e sem salvar.
  var modoVer = /[?&]modo=ver(&|$)/.test(location.search);
  var chaveMotivo = 'lanc_motivo_' + id;

  /** Visualização: em vez do formulário travado, uma ficha formatada com os dados. */
  function somenteLeitura() {
    form.hidden = true;
    montarFicha(registroOriginal || {});
  }

  /* ---- Ficha de visualização (só leitura) ---- */
  function fIcone(n) { return window.ICONES_AGRO && !fVazio(n) ? window.ICONES_AGRO.rotulado(n) : fTexto(n); }
  function fVazio(v) { return v === null || v === undefined || String(v).trim() === ''; }
  function fTexto(v) { return fVazio(v) ? '<span class="ficha-vazio">Não informado</span>' : esc(String(v)); }
  function fNum(v, casas) {
    var n = Number(v);
    return fVazio(v) || !isFinite(n) ? '<span class="ficha-vazio">—</span>'
      : n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas == null ? 2 : casas });
  }
  function fData(v) { return fVazio(v) ? '<span class="ficha-vazio">Não informado</span>' : esc(window.DATA_BR.isoParaBr(String(v).slice(0, 10))); }
  function fCampo(rotulo, html, larga) {
    return '<div class="ficha-campo' + (larga ? ' ficha-larga' : '') + '"><dt>' + esc(rotulo) + '</dt><dd>' + html + '</dd></div>';
  }
  /* posição de cada seção na grade da ficha (4 colunas; ver .ficha-a-* no CSS) */
  var FICHA_AREAS = { 'Beneficiário': 'ben', 'Unidade produtiva': 'uni', 'Georreferenciamento (UTM WGS84)': 'geo', 'Serviço e vistoria': 'srv',
    'Açudagem': 'cul', 'Área mecanizada / cultivo': 'cul', 'Maquinário': 'maq', 'Mapa da propriedade': 'mapa',
    'Documentos de Arrecadação Estadual (DAE)': 'dae', 'Observações': 'obs' };
  function fSecao(titulo, corpo) {
    return '<section class="ficha-secao ficha-a-' + (FICHA_AREAS[titulo] || 'obs') + '"><h3>' + esc(titulo) + '</h3>' + corpo + '</section>';
  }

  /* ---- Mapa da propriedade (Leaflet, satélite) a partir do ponto UTM WGS84 do georreferenciamento ---- */
  /** UTM (hemisfério sul, WGS84) -> [lat, lng] (mesma conversão de js/painel-calculos.js). */
  function utmParaLatLng(x, y, zona) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    var xr = x - 500000, yr = y - 10000000;
    var M = yr / k0;
    var mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
      (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var sn = Math.sin(phi1), cs = Math.cos(phi1), tn = Math.tan(phi1);
    var N1 = a / Math.sqrt(1 - e2 * sn * sn), T1 = tn * tn, C1 = ep2 * cs * cs;
    var R1 = a * (1 - e2) / Math.pow(1 - e2 * sn * sn, 1.5), D = xr / (N1 * k0);
    var lat = phi1 - (N1 * tn / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
    var lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cs;
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
  }
  function carregarLeaflet() {
    return new Promise(function (ok, falha) {
      if (window.L && window.L.map) { ok(); return; }
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = function () { falha(new Error('mapa indisponível')); };
      document.head.appendChild(s);
    });
  }
  /** Contorno do município (malha do IBGE, js/mapa-acre.js) ou null. */
  function contornoDoMunicipio(nome) {
    var M = window.MAPA_ACRE;
    if (!M || !M.geo || !nome) return null;
    var chave = function (t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
    var loc = (M.localidades || []).filter(function (l) { return chave(l.nome) === chave(nome); })[0];
    if (!loc) return null;
    return M.geo.features.filter(function (ft) { return String(ft.properties && ft.properties.codarea) === String(loc.id); })[0] || null;
  }
  function montarMapa(ponto, municipio) {
    var caixa = el('lancFichaMapa');
    if (!caixa) return;
    var x = Number(String(ponto.x == null ? '' : ponto.x).replace(',', '.')), y = Number(String(ponto.y == null ? '' : ponto.y).replace(',', '.'));
    var zona = parseInt(ponto.zona, 10) || 19;
    var pos = x > 0 && y > 0 ? utmParaLatLng(x, y, zona) : null;
    var noAcre = pos && pos[0] > -11.3 && pos[0] < -6.9 && pos[1] > -74.1 && pos[1] < -66.4;   // caixa do Acre
    function msg(texto) {
      var m = document.createElement('div');
      m.className = 'ficha-mapa-msg'; m.textContent = texto;
      caixa.appendChild(m);
    }
    carregarLeaflet().then(function () {
      var mapa = L.map(caixa, { zoomControl: true, attributionControl: true }).setView(noAcre ? pos : [-9.0, -70.5], noAcre ? 15 : 6);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, attribution: 'Imagens © Esri'
      }).addTo(mapa);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 }).addTo(mapa);
      if (noAcre) {
        L.marker(pos).addTo(mapa);
      } else {
        // sem ponto (ou ponto fora do Acre): delimita a área do município e enquadra o mapa nela
        var contorno = contornoDoMunicipio(municipio);
        if (contorno) {
          var camada = L.geoJSON(contorno, { style: { color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: 0.12 } }).addTo(mapa);
          mapa.fitBounds(camada.getBounds(), { padding: [12, 12] });
        } else {
          msg('Município não localizado no mapa.');
        }
      }
      setTimeout(function () { mapa.invalidateSize(); if (!noAcre && typeof camada !== 'undefined') mapa.fitBounds(camada.getBounds(), { padding: [12, 12] }); }, 250);
    }).catch(function () {
      caixa.classList.add('ficha-mapa-off');
      msg(noAcre ? 'Não foi possível carregar o mapa.' : 'Sem ponto de georreferenciamento.');
    });
  }
  function fChips(lista) {
    return Array.isArray(lista) && lista.length
      ? '<div class="ficha-chips">' + lista.map(function (x) { return '<span class="ficha-chip">' + (window.ICONES_AGRO ? window.ICONES_AGRO.rotulado(String(x), { cor: false }) : esc(String(x))) + '</span>'; }).join('') + '</div>'
      : '<span class="ficha-vazio">Nenhum marcado</span>';
  }

  var ICONE_SERVICO = {
    mec: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="17" r="3"/><circle cx="18" cy="17" r="2"/><path d="M4 14V7h6l2 5h6v5"/></svg>',
    acu: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c3 4 5 6.5 5 9a5 5 0 01-10 0c0-2.5 2-5 5-9z"/></svg>'
  };
  function montarFicha(r) {
    var raiz = el('lancFicha');
    if (!raiz) return;
    var acudagem = r.tipo_servico === 'Açudagem';
    var sexo = r.sexo === 'F' ? 'Feminino' : r.sexo === 'M' ? 'Masculino' : r.sexo;
    var indigena = r.indigena === true ? 'Sim' + (r.etnia ? ' — etnia ' + r.etnia : '') : r.indigena === false ? 'Não' : '';
    var assoc = r.associacao_cooperativa ? r.associacao_cooperativa : 'Não participa';
    var cult = Array.isArray(r.culturas) ? r.culturas : [];
    var daes = Array.isArray(r.daes) ? r.daes : [];
    var ponto = (Array.isArray(r.pontos_geo) && r.pontos_geo[0]) || {};
    var totalDae = daes.reduce(function (a, d) { return a + (Number(d.valor) || 0); }, 0);

    var resumo = [];
    if (acudagem) {
      resumo.push(['Tanques/açudes', fNum(r.quantidade_acudes, 0)], ['Horas de máquina', fNum(r.horas_maquina)]);
    } else {
      resumo.push(['Área total', fNum(r.area_total_ha) + ' ha'], ['Culturas', fNum(cult.length, 0)]);
    }
    if (daes.length) resumo.push(['DAEs', fNum(totalDae).replace(/^/, 'R$ ')]);

    var html =
      '<div class="ficha-topo ' + (acudagem ? 'ficha-topo-acu' : r.tipo_servico ? 'ficha-topo-mec' : '') + '">' +
        '<div class="ficha-topo-id">' +
          '<a class="ficha-seta" href="dashboard.html#lancamento" title="Voltar" aria-label="Voltar">&larr;</a><div class="ficha-topo-info">' +
          '<h2 class="ficha-nome"><span class="ficha-nome-txt">' + esc(r.nome_beneficiario || '—') + '</span>' + '<span class="ficha-servico ' + (acudagem ? 'ficha-servico-acu' : r.tipo_servico ? 'ficha-servico-mec' : 'ficha-servico-nd') + '">' + ICONE_SERVICO[acudagem ? 'acu' : 'mec'] + esc(r.tipo_servico || 'Serviço não informado') + '</span>' + '</h2>' +
          '<p>' + [r.municipio, r.nome_propriedade].filter(Boolean).map(esc).join(' · ') + '</p>' +
          '<p class="ficha-lancou">Lançado por <b>' + esc(nomeDoEmail(r.criado_por_email) || 'não informado') + '</b>' +
            (r.criado_em ? ' em <b>' + esc(window.DATA_BR.dataHoraBr(r.criado_em).replace(' ', ' às ')) + '</b>' : '') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="ficha-topo-dir">' +
          '<div class="ficha-resumo">' + resumo.map(function (x) { return '<div><b>' + x[1] + '</b><span>' + esc(x[0]) + '</span></div>'; }).join('') + '</div>' +
          '<div class="ficha-acoes" id="lancFichaAcoes"></div>' +
        '</div>' +
      '</div>' +

      '<div class="ficha-grade">' +
      fSecao('Beneficiário', '<dl class="ficha-campos">' +
        fCampo('Nome', fTexto(r.nome_beneficiario), true) +
        fCampo('CPF', fTexto(window.LANCAMENTO_CAMPOS.formatarCpf(r.cpf))) + fCampo('Data de nascimento', fData(r.data_nascimento)) +
        fCampo('Telefone', fTexto(r.telefone)) + fCampo('Estado civil', fTexto(r.estado_civil)) +
        fCampo('Sexo', fTexto(sexo)) + fCampo('Possui CAF', fTexto(r.possui_dap)) +
        fCampo('Indígena', fTexto(indigena)) + fCampo('Associação/Cooperativa', fTexto(assoc)) + '</dl>') +

      fSecao('Serviço e vistoria', '<dl class="ficha-campos">' +
        fCampo('Data da vistoria', fData(r.data_vistoria)) + fCampo('Município', fTexto(r.municipio)) +
        fCampo('Escritório local', fTexto(r.escritorio_local)) + fCampo('Responsável técnico', fTexto(r.responsavel_tecnico)) + '</dl>') +

      fSecao('Unidade produtiva', '<dl class="ficha-campos">' +
        fCampo('Propriedade', fTexto(r.nome_propriedade)) + fCampo('Endereço', fTexto(r.endereco)) + '</dl>') +

      (acudagem
        ? fSecao('Açudagem', '<dl class="ficha-campos">' + fCampo('Tanques/açudes', fNum(r.quantidade_acudes, 0)) + fCampo('Horas de máquina', fNum(r.horas_maquina)) + fCampo('Piscicultura', r.piscicultura ? 'Sim' : 'Não') + '</dl>')
        : fSecao('Área mecanizada / cultivo', (cult.length
            ? '<table class="ficha-tabela"><thead><tr><th>Cultura</th><th>Sistema de cultivo</th><th class="num">Área (ha)</th></tr></thead><tbody>' +
              cult.map(function (c) { return '<tr><td>' + fIcone(c.cultura) + '</td><td>' + fTexto(c.sistema_cultivo) + '</td><td class="num">' + fNum(c.area_ha) + '</td></tr>'; }).join('') +
              '</tbody><tfoot><tr><td colspan="2">Área total</td><td class="num">' + fNum(r.area_total_ha) + '</td></tr></tfoot></table>'
            : '<p class="ficha-vazio">Nenhuma cultura informada.</p>') + '<dl class="ficha-campos" style="margin-top:10px">' + fCampo('Destoca', r.destoca ? 'Sim' : 'Não') + '</dl>')) +

      fSecao('Georreferenciamento (UTM WGS84)', '<dl class="ficha-campos">' +
        fCampo('X', fTexto(ponto.x)) + fCampo('Y', fTexto(ponto.y)) + fCampo('Zona', fTexto(ponto.zona)) + '</dl>') +

      fSecao('Mapa da propriedade', '<div id="lancFichaMapa" class="ficha-mapa"></div>') +

      fSecao('Maquinário', '<dl class="ficha-campos">' +
        fCampo('Nº de identificação/patrimônio', fTexto(r.num_identificacao_patrimonio)) + fCampo('Uso', fTexto(r.tipo_uso)) + '</dl>' +
        '<h4>Máquinas utilizadas</h4>' + fChips(r.maquinas) + '<h4>Implementos</h4>' + fChips(r.implementos)) +

      (daes.length
        ? fSecao('Documentos de Arrecadação Estadual (DAE)',
            '<table class="ficha-tabela"><thead><tr><th>Número</th><th class="num">Valor</th></tr></thead><tbody>' +
            daes.map(function (d) { return '<tr><td>' + fTexto(d.numero) + '</td><td class="num">R$ ' + fNum(d.valor) + '</td></tr>'; }).join('') +
            '</tbody><tfoot><tr><td>Total</td><td class="num">R$ ' + fNum(totalDae) + '</td></tr></tfoot></table>')
        : '') +

      (fVazio(r.observacao) ? '' : fSecao('Observações', '<p class="ficha-obs">' + esc(r.observacao) + '</p>')) +
      '</div>';
    raiz.innerHTML = html;
    raiz.hidden = false;
    // botão de PDF vai para o topo da ficha; o cabeçalho antigo (título e contexto) some
    var acoes = el('lancFichaAcoes');
    el('lancExportarPdf').classList.add('ficha-pdf');
    acoes.appendChild(el('lancExportarPdf'));
    el('lancExportarPdf').hidden = false;
    el('lancCabecalhoTit').hidden = true;
    montarMapa(ponto, r.municipio);
  }

  /** Responsável (root@root.com) edita direto. Os demais: a edição vira um
      pedido de aprovação, com motivo obrigatório (vindo do pop-up da lista,
      em sessionStorage, mas editável aqui) — e se já houver um pedido
      pendente para este lançamento, só dá pra ver. */
  function prepararModo(ehResponsavel, pendente, podeEditar) {
    var descPendente = pendente
      ? 'Este lançamento tem uma solicitação de <b>' + (pendente.tipo === 'excluir' ? 'exclusão' : 'edição') +
        '</b> aguardando aprovação' + (pendente.motivo ? ' (motivo: ' + esc(pendente.motivo) + ')' : '') + '.'
      : '';
    if (modoVer) {
      el('lancEditarTitulo').textContent = 'Visualizando lançamento';
      document.title = 'Ver lançamento';
      somenteLeitura();
      if (pendente) aviso('lancEditarAviso', 'carregando', descPendente);
      return;
    }
    if (ehResponsavel) return;
    if (!podeEditar) {
      el('lancEditarTitulo').textContent = 'Visualizando lançamento';
      somenteLeitura();
      aviso('lancEditarAviso', 'erro', 'Este lançamento é de outra pessoa — você só pode visualizar.');
      return;
    }
    if (pendente) {
      el('lancEditarTitulo').textContent = 'Visualizando lançamento';
      somenteLeitura();
      aviso('lancEditarAviso', 'erro', descPendente + ' Não é possível pedir outra alteração até ela ser resolvida.');
      return;
    }
    var campoMotivo = el('lancMotivoEdicao');
    el('lancMotivoSec').hidden = false;
    campoMotivo.required = true;
    try { campoMotivo.value = sessionStorage.getItem(chaveMotivo) || ''; } catch (e) { /* modo privado */ }
    el('lancSalvar').textContent = 'Enviar para aprovação';
    aviso('lancEditarAviso', 'carregando', 'As alterações que você salvar aqui ficam <b>pendentes</b> até a conta responsável aprovar.');
  }

  /* Exporta para PDF o lançamento como foi salvo (não o que está digitado agora). */
  el('lancExportarPdf').addEventListener('click', function () {
    var btn = el('lancExportarPdf');
    if (!registroOriginal || btn.disabled) return;
    btn.disabled = true;
    var rotulo = btn.textContent;
    btn.textContent = 'Gerando PDF…';
    window.LANCAMENTO_PDF.ficha(registroOriginal, {})
      .catch(function (e) { aviso('lancEditarAviso', 'erro', esc((e && e.message) || 'Não foi possível gerar o PDF.')); })
      .then(function () { btn.disabled = false; btn.textContent = rotulo; });
  });

  /* ---- Pedido de edição pendente: "como estava" x "como querem que fique" ---- */
  var ROTULOS = {
    tipo_servico: 'Serviço', data_vistoria: 'Data da vistoria', escritorio_local: 'Escritório local',
    responsavel_tecnico: 'Responsável técnico', ponto_controle: 'Ponto de controle',
    nome_beneficiario: 'Beneficiário', cpf: 'CPF', data_nascimento: 'Data de nascimento',
    estado_civil: 'Estado civil', sexo: 'Sexo', indigena: 'Indígena', etnia: 'Etnia', possui_dap: 'Possui CAF',
    associacao_cooperativa: 'Associação/Cooperativa', telefone: 'Telefone', endereco: 'Endereço',
    nome_propriedade: 'Propriedade', municipio: 'Município', culturas: 'Culturas', area_total_ha: 'Área total (ha)',
    horas_maquina: 'Horas-máquina', quantidade_acudes: 'Açudes', pontos_geo: 'Georreferenciamento',
    tipo_trator: 'Tipo de trator', maquinas: 'Máquinas', implementos: 'Implementos', tipo_uso: 'Tipo de uso',
    num_identificacao_patrimonio: 'Nº patrimônio', daes: 'DAEs', observacao: 'Observação'
  };
  function valorLegivel(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (v === true) return 'Sim';
    if (v === false) return 'Não';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(8) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4);
    if (Array.isArray(v)) {
      if (!v.length) return '—';
      return v.map(function (item) {
        return item && typeof item === 'object'
          ? Object.keys(item).map(function (k) { return item[k]; }).filter(function (x) { return x !== null && x !== ''; }).join(' / ')
          : String(item);
      }).join('; ');
    }
    return String(v);
  }
  function mesmoValor(a, b) {
    var norm = function (x) {
      if (x === '' || x === undefined) return null;
      if (x !== null && typeof x === 'object') return JSON.stringify(x, function (k, v) { return k && v !== null && typeof v !== 'object' ? norm(v) : v; });
      return x !== null && x !== true && x !== false && isFinite(Number(x)) ? String(Number(x)) : x;
    };
    return norm(a) === norm(b);
  }
  function nomeDoEmail(email) {
    var u = String(email || '').split('@')[0].replace(/\d+/g, ' ').replace(/[._-]+/g, ' ').trim();
    return u.replace(/\S+/g, function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }) || String(email || '');
  }

  function mostrarAlteracoesSolicitadas(pendente, atual) {
    var sec = el('lancAlteracoesSec');
    if (!sec || !pendente || pendente.tipo !== 'editar') return;
    var novo = pendente.dados;
    var por = nomeDoEmail(pendente.solicitado_por_email);
    var quando = pendente.criado_em ? ' em ' + window.DATA_BR.dataHoraBr(pendente.criado_em) : '';
    el('lancAlteracoesSub').innerHTML = 'Pedido de <b>' + esc(por) + '</b>' + quando +
      (pendente.motivo ? ' — motivo: ' + esc(pendente.motivo) : '') + '.';
    if (!novo || typeof novo !== 'object') {
      el('lancAlteracoesCorpo').innerHTML = '<p class="nota">Os campos propostos não vieram do servidor. ' +
        'Atualize a função do Supabase (lancar-mecanizacao) para ver o comparativo aqui.</p>';
      sec.hidden = false;
      return;
    }
    var campos = Object.keys(ROTULOS).filter(function (c) { return c in novo && !mesmoValor(atual[c], novo[c]); });
    el('lancAlteracoesCorpo').innerHTML = campos.length
      ? '<div class="tabela-scroll"><table class="lanc-tabela"><thead><tr><th>Campo</th>' +
        '<th class="lanc-diff-antes">Como estava</th><th class="lanc-diff-depois">Como querem que fique</th></tr></thead><tbody>' +
        campos.map(function (c) {
          return '<tr><td>' + esc(ROTULOS[c]) + '</td><td class="lanc-diff-antes">' + esc(valorLegivel(atual[c])) + '</td>' +
            '<td class="lanc-diff-depois">' + esc(valorLegivel(novo[c])) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="nota">Nenhum campo diferente do lançamento atual.</p>';
    sec.hidden = false;
  }

  function preencherFormulario(dados) {
    CAMPOS_DIRETOS.forEach(function (campo) {
      if (!form.elements[campo]) return;
      var v = dados[campo] != null ? dados[campo] : '';
      // datas vêm ISO do banco; o campo mostra dd/mm/aaaa (js/data-br.js)
      form.elements[campo].value = campo.indexOf('data_') === 0 ? window.DATA_BR.isoParaBr(v) : v;
    });

    if (dados.responsavel_tecnico) ajuda.garantirTecnico(dados.responsavel_tecnico);
    if (form.elements['cpf']) form.elements['cpf'].value = window.LANCAMENTO_CAMPOS.formatarCpf(dados.cpf);
    if (dados.tipo_servico) form.elements['tipo_servico'].value = dados.tipo_servico;
    // piscicultura é um serviço da Açudagem (Sim/Não); em Mecanização não se aplica
    if (form.elements['destoca']) form.elements['destoca'].value = dados.tipo_servico === 'Mecanização' ? (dados.destoca ? 'Sim' : 'Não') : '';
    if (form.elements['piscicultura']) form.elements['piscicultura'].value = dados.tipo_servico === 'Açudagem' ? (dados.piscicultura ? 'Sim' : 'Não') : '';
    ajuda.alternarSecoesServico();

    form.elements['municipio'].value = dados.municipio || '';
    ajuda.sincronizarEscritorioPorMunicipio();
    // sincronizar já cobre os 21 municípios de escritório único; em Rio
    // Branco (o único caso destravado) o valor salvo manda, seja ele qual
    // for dos dois.
    if (dados.escritorio_local) form.elements['escritorio_local'].value = dados.escritorio_local;

    form.elements['indigena'].value = dados.indigena === true ? 'Sim' : dados.indigena === false ? 'Não' : '';
    ajuda.alternarEtnia();
    if (form.elements['etnia']) form.elements['etnia'].value = dados.etnia || '';

    el('lancPossuiAssociacao').value = dados.associacao_cooperativa ? 'Sim' : (dados.associacao_cooperativa === '' ? 'Não' : '');
    ajuda.alternarAssociacao();
    if (form.elements['associacao_cooperativa']) form.elements['associacao_cooperativa'].value = dados.associacao_cooperativa || '';

    var ponto = (dados.pontos_geo && dados.pontos_geo[0]) || {};
    form.elements['geo_x'].value = ponto.x || '';
    form.elements['geo_y'].value = ponto.y || '';
    form.elements['geo_zona'].value = ponto.zona || '';

    ajuda.preencherDinamicos(dados);
  }

  function salvar(e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (!ajuda.validarServico()) return;

    var fd = new FormData(form);
    fd.set('acao', 'editar');
    // campos de data estão em dd/mm/aaaa (js/data-br.js); o banco guarda ISO
    ['data_vistoria', 'data_nascimento'].forEach(function (c) { fd.set(c, window.DATA_BR.brParaIso(form.elements[c].value)); });
    fd.set('id', id);
    fd.set('escritorio_local', form.elements['escritorio_local'].value);
    fd.set('culturas', JSON.stringify(ajuda.culturasAtuais()));
    fd.set('daes', JSON.stringify(ajuda.daesAtuais()));
    var geoX = form.elements['geo_x'].value, geoY = form.elements['geo_y'].value, geoZona = form.elements['geo_zona'].value;
    fd.set('pontos_geo', JSON.stringify((geoX || geoY) ? [{ ponto: 1, x: geoX, y: geoY, zona: geoZona }] : []));
    fd.set('maquinas', JSON.stringify(ajuda.marcadosDe(el('lancMaquinas'))));
    fd.set('implementos', JSON.stringify(ajuda.marcadosDe(el('lancImplementos'))));
    var sessao = sessaoSite();
    fd.set('token', (sessao && sessao.access_token) || '');
    fd.delete('geo_x'); fd.delete('geo_y'); fd.delete('geo_zona');

    var botao = el('lancSalvar');
    botao.disabled = true;
    aviso('lancSalvarStatus', 'carregando', 'Salvando…');
    window.LANCAMENTO_CAMPOS.enviar(fd)
      .then(function (res) {
        botao.disabled = false;
        if (!res.corpo.ok) { aviso('lancSalvarStatus', 'erro', esc(res.corpo.erro || 'Não foi possível salvar.')); return; }
        var nome = form.elements['nome_beneficiario'].value;
        if (res.corpo.pendente) {
          try { sessionStorage.removeItem(chaveMotivo); } catch (e) { /* modo privado */ }
          window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('solicitar', 'mecanizacao', 'Solicitou a edição do lançamento de mecanização de "' + nome + '"', { motivo: el('lancMotivoEdicao').value });
          botao.disabled = true;
          aviso('lancSalvarStatus', 'ok', 'Alterações enviadas para aprovação. Voltando para a lista…');
          setTimeout(function () { location.href = 'dashboard.html#lancamento'; }, 1400);
          return;
        }
        window.ADMIN_AUTH && window.ADMIN_AUTH.registrarEvento('editar', 'mecanizacao', 'Editou o lançamento de mecanização de "' + nome + '"');
        aviso('lancSalvarStatus', 'ok', 'Alterações salvas. Voltando para a lista…');
        setTimeout(function () { location.href = 'dashboard.html#lancamento'; }, 900);
      })
      .catch(function () {
        botao.disabled = false;
        aviso('lancSalvarStatus', 'erro', 'Sem conexão com o servidor. Tente novamente.');
      });
  }

  function carregar() {
    if (!id) {
      aviso('lancEditarAviso', 'erro', 'Nenhum lançamento informado na URL.');
      el('lancEditarContexto').textContent = 'Não foi possível abrir a edição.';
      return;
    }
    var sessao = sessaoSite();
    var fd = new FormData();
    fd.append('acao', 'carregar');
    fd.append('token', (sessao && sessao.access_token) || '');
    fd.append('id', id);
    window.LANCAMENTO_CAMPOS.enviar(fd)
      .then(function (res) {
        if (!res.corpo.ok) {
          el('lancEditarContexto').textContent = 'Não foi possível abrir este lançamento.';
          aviso('lancEditarAviso', 'erro', esc(res.corpo.erro || 'Não foi possível carregar o lançamento.'));
          return;
        }
        registroOriginal = res.corpo.lancamento;
        el('lancEditarContexto').textContent = 'Ficha de ' + registroOriginal.nome_beneficiario +
          ' — salva em ' + window.DATA_BR.dataHoraBr(registroOriginal.criado_em) + '.';
        if (registroOriginal.pdf_arquivo) {
          var b = document.createElement('a');
          b.href = '#'; b.textContent = ' Abrir PDF anexado ↗';
          b.addEventListener('click', function (ev) {
            ev.preventDefault();
            var f = new FormData();
            f.append('acao', 'pdf'); f.append('token', (sessaoSite() || {}).access_token || ''); f.append('id', id);
            window.LANCAMENTO_CAMPOS.enviar(f).then(function (r) {
              if (r.corpo.ok && r.corpo.url) window.open(r.corpo.url, '_blank', 'noopener');
              else aviso('lancEditarAviso', 'erro', esc(r.corpo.erro || 'Não foi possível abrir o PDF.'));
            });
          });
          el('lancEditarContexto').appendChild(b);
        }
        mostrarAlteracoesSolicitadas(res.corpo.pendente, registroOriginal);
        preencherFormulario(registroOriginal);
        el('lancExportarPdf').hidden = false;
        form.hidden = false;
        prepararModo(!!res.corpo.eh_responsavel, res.corpo.pendente, res.corpo.pode_editar !== false);
        // na ficha, o painel de cima só fica quando há um aviso (pedido pendente, lançamento de outra pessoa)
        if (!el('lancFicha').hidden) el('lancCabecalho').hidden = !el('lancEditarAviso').innerHTML;
      })
      .catch(function () {
        el('lancEditarContexto').textContent = 'Não foi possível abrir a edição.';
        aviso('lancEditarAviso', 'erro', 'Sem conexão com o servidor.');
      });
  }

  /* mesmo botão/ícone de tema do painel (js/dashboard.js), só que sem os
     gráficos pra redesenhar depois de trocar. */
  function pintarBotaoTema() {
    var escuro = document.documentElement.getAttribute('data-tema') === 'escuro';
    el('temaBtn').innerHTML = (escuro
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>') +
      '<span>' + (escuro ? 'Tema claro' : 'Tema escuro') + '</span>';
  }
  function ligarTema() {
    pintarBotaoTema();
    el('temaBtn').addEventListener('click', function () {
      var novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
      document.documentElement.setAttribute('data-tema', novo);
      try { localStorage.setItem('seagri_tema', novo); } catch (e) { /* modo privado */ }
      pintarBotaoTema();
    });
  }

  function montar() {
    ligarTema();
    ajuda = window.LANCAMENTO_CAMPOS.criar(form);
    ajuda.montarMunicipios(MUNICIPIOS);
    ajuda.montarCaixasVazias();
    ajuda.preencherDinamicos();   // uma linha vazia de cultura/DAE até o carregamento chegar
    ajuda.ligarEventosComuns();
    if (window.LANCAMENTO_UX) window.LANCAMENTO_UX.ligar(form, {});
    form.addEventListener('submit', salvar);
    carregar();
  }

  montar();
})();
