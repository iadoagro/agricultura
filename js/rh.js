/* Módulo RH (pages/rh.html).
   Os setores, a hierarquia e o responsável de cada setor vêm do organograma (js/contatos-organograma.js lê organograma_setores
   e organograma_ajustes): trocar um nome ou criar um setor lá muda aqui sozinho. O RH só acrescenta as pessoas de cada setor
   (tabela rh_pessoas, database/rh.sql), por funções do banco que exigem a página "rh" liberada em Acessos. */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var auth = window.ADMIN_AUTH;
  var base = String(cfg.url || '').replace(/\/$/, '');
  var ICONE_BUSCA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ROTULO_VINCULO = { efetivo: 'Efetivo', comissionado: 'Comissionado', terceirizado: 'Terceirizado', cedido: 'Cedido', estagiario: 'Estagiário', outro: 'Outro' };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function fone(t) {
    var d = String(t || '').replace(/\D/g, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return String(t || '');
  }

  var ORG = { nos: [], grupos: [] };
  var PESSOAS = [];                 // rh_pessoas
  var TEL_CONTATOS = {};            // telefones da página Contatos (id do setor -> dígitos)
  var filtroSit = 'todos';
  var editando = null;              // id da pessoa em edição
  var carregouPessoas = false;
  var abertos = {};                 // setores recolhidos pela pessoa (id -> true)

  /* ------------------------------------------------------------- banco */
  function sessao() { return auth && auth.sessaoAtual && auth.sessaoAtual(); }
  function cab(extra) {
    var s = sessao();
    var h = { apikey: cfg.chavePublica, Authorization: 'Bearer ' + ((s && s.access_token) || cfg.chavePublica) };
    Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  async function rpc(nome, corpo) {
    var r = await fetch(base + '/rest/v1/rpc/' + nome, { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify(corpo) });
    var c = null;
    try { c = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) {
      if (r.status === 404 || (c && c.code === 'PGRST202')) throw new Error('O módulo RH ainda não foi ativado no banco. Rode database/rh.sql.');
      throw new Error((c && c.message && r.status === 400) ? c.message : 'Não foi possível concluir (' + r.status + ').');
    }
    return c;
  }
  function aviso(html, tipo) {
    el('rhAviso').innerHTML = html ? '<p class="ch-erro-msg" style="' + (tipo === 'ok' ? 'color:#15803d' : '') + '" role="alert">' + html + '</p>' : '';
  }

  async function carregarPessoas() {
    var r;
    try { r = await fetch(base + '/rest/v1/rh_pessoas?select=*&order=nome.asc&limit=5000', { headers: cab(), cache: 'no-store' }); }
    catch (e) { aviso('Sem conexão com o servidor. Tente de novo.'); return; }
    if (r.status === 404 || r.status === 400) { aviso('O módulo RH ainda não foi ativado no banco. Rode <code>database/rh.sql</code>.'); return; }
    if (!r.ok) { aviso('Você não tem acesso às pessoas do RH (' + r.status + ').'); return; }
    PESSOAS = await r.json();
    carregouPessoas = true;
    aviso('');
  }
  async function carregarTelefones() {
    try {
      var r = await fetch(base + '/rest/v1/contatos_telefones?select=id,telefone', { headers: { apikey: cfg.chavePublica }, cache: 'no-store' });
      if (!r.ok) return;
      TEL_CONTATOS = {};
      (await r.json()).forEach(function (x) { TEL_CONTATOS[x.id] = x.telefone; });
    } catch (e) { /* telefones da página Contatos são um extra */ }
  }
  async function carregarOrganograma() {
    var cache = window.OrgContatos && OrgContatos.doCache();
    if (cache) { ORG = cache; desenhar(); }
    try {
      var r = await OrgContatos.carregar();
      ORG = r.dados;
    } catch (e) {
      if (!cache) { el('rhSetores').innerHTML = '<p class="rh-vazio">Não foi possível carregar o organograma. Verifique a conexão e recarregue a página.</p>'; return; }
    }
  }

  /* --------------------------------------------------- árvore dos setores */
  function arvore() {
    var porPai = {}, mapa = {};
    ORG.nos.forEach(function (n) { mapa[n.id] = n; });
    ORG.nos.forEach(function (n) {
      var pai = n.parent && mapa[n.parent] ? n.parent : '';
      (porPai[pai] = porPai[pai] || []).push(n);
    });
    Object.keys(porPai).forEach(function (k) { porPai[k].sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); }); });
    var lista = [];
    (function descer(pai, nivel) {
      (porPai[pai] || []).forEach(function (n) {
        lista.push({ no: n, nivel: nivel });
        descer(n.id, nivel + 1);
      });
    }('', 0));
    return lista;
  }
  function nomeDoNo(n) { return String(n.holder || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
  function rotuloSetor(n) { return n.title || n.sigla || n.id; }

  /* ------------------------------------------------------------- desenho */
  function pessoasDoSetor(id) { return PESSOAS.filter(function (p) { return p.setor_id === id; }); }

  function desenhar() {
    var lista = arvore();
    var termo = semAcento(el('rhBusca').value.trim());
    var setorFiltro = el('rhFiltroSetor').value;
    var htmlSetores = '', totalOrg = 0, totalRh = 0, setoresMostrados = 0;

    // descendentes de cada setor (para o filtro por setor e para manter os ancestrais de uma busca)
    var idsFiltro = null;
    if (setorFiltro) {
      idsFiltro = {};
      var entrou = false, nivelBase = 0;
      lista.forEach(function (it) {
        if (it.no.id === setorFiltro) { entrou = true; nivelBase = it.nivel; idsFiltro[it.no.id] = true; return; }
        if (entrou && it.nivel > nivelBase) idsFiltro[it.no.id] = true; else entrou = false;
      });
    }

    var linhas = lista.map(function (it) {
      var n = it.no, resp = nomeDoNo(n), extras = pessoasDoSetor(n.id);
      var tel = n.telefone || TEL_CONTATOS[n.id] || '';
      var org = resp.length ? [{ nome: resp[0], ato: resp.slice(1).join('\n'), matricula: n.matricula || '', tel: tel }] : [];
      var rh = extras.filter(function (p) { return filtroSit === 'todos' || (filtroSit === 'ativos' ? p.ativo : !p.ativo); });
      var casaSetor = !termo || semAcento(rotuloSetor(n) + ' ' + n.sigla).indexOf(termo) >= 0;
      function casaPessoa(t) { return !termo || semAcento(t).indexOf(termo) >= 0; }
      if (!casaSetor) {
        org = org.filter(function (o) { return casaPessoa(o.nome + ' ' + o.matricula); });
        rh = rh.filter(function (p) { return casaPessoa([p.nome, p.cargo, p.matricula, p.email].join(' ')); });
      }
      return { it: it, org: org, rh: rh, casaSetor: casaSetor, total: org.length + rh.length };
    });

    // com busca, um setor também aparece se algum setor abaixo dele tiver resultado (mantém o caminho no organograma)
    var visivel = linhas.map(function (l, i) {
      if (idsFiltro && !idsFiltro[l.it.no.id]) return false;
      if (!termo && filtroSit === 'todos') return true;
      if (l.total > 0 || (termo && l.casaSetor)) return true;
      for (var j = i + 1; j < linhas.length && linhas[j].it.nivel > l.it.nivel; j++) {
        if (linhas[j].total > 0 || (termo && linhas[j].casaSetor)) return true;
      }
      return false;
    });

    linhas.forEach(function (l, i) {
      if (!visivel[i]) return;
      setoresMostrados++;
      totalOrg += l.org.length; totalRh += l.rh.length;
      var n = l.it.no, cor = window.OrgContatos ? OrgContatos.corDaCaixa(n) : { bg: '#4472c4', fg: '#fff' };
      var corpo = '';
      if (l.org.length || l.rh.length) {
        corpo = '<div class="ch-tabela-rolagem"><table class="ch-tabela"><thead><tr><th>Pessoa</th><th>Cargo / função</th><th>Matrícula</th><th>Vínculo</th><th>Contato</th><th>Origem</th><th></th></tr></thead><tbody>' +
          l.org.map(function (o) {
            return '<tr><td class="nome rh-nome">' + esc(o.nome) + (o.ato ? '<small>' + esc(o.ato) + '</small>' : '') + '</td>' +
              '<td class="sub">Responsável do setor</td><td class="sub">' + esc(o.matricula || '—') + '</td><td class="sub">—</td>' +
              '<td class="sub">' + esc(o.tel ? fone(o.tel) : '—') + '</td>' +
              '<td><span class="rh-origem">Organograma</span></td>' +
              '<td><div class="rh-acoes"><a class="ch-btn pequeno" href="organograma.html">Organograma</a></div></td></tr>';
          }).join('') +
          l.rh.map(function (p) {
            return '<tr class="' + (p.ativo ? '' : 'rh-inativo') + '"><td class="nome rh-nome">' + esc(p.nome) + (p.observacao ? '<small>' + esc(p.observacao) + '</small>' : '') + '</td>' +
              '<td class="sub">' + esc(p.cargo || '—') + '</td><td class="sub">' + esc(p.matricula || '—') + '</td>' +
              '<td class="sub">' + esc(ROTULO_VINCULO[p.vinculo] || '—') + '</td>' +
              '<td class="sub">' + esc(p.telefone ? fone(p.telefone) : '') + (p.telefone && p.email ? '<br>' : '') + esc(p.email || '') + (!p.telefone && !p.email ? '—' : '') + '</td>' +
              '<td><span class="ch-pilula cor-' + (p.ativo ? 'verde' : 'cinza') + '"><i class="ch-ponto"></i>' + (p.ativo ? 'Ativo' : 'Inativo') + '</span></td>' +
              '<td><div class="rh-acoes">' +
                '<button type="button" class="ch-btn pequeno" data-ed="' + esc(p.id) + '">Editar</button>' +
                '<button type="button" class="ch-btn pequeno" data-sit="' + esc(p.id) + '">' + (p.ativo ? 'Desativar' : 'Ativar') + '</button>' +
                '<button type="button" class="ch-btn pequeno perigo" data-ex="' + esc(p.id) + '">Excluir</button>' +
              '</div></td></tr>';
          }).join('') + '</tbody></table></div>';
      } else {
        corpo = '<p class="rh-vazio">Nenhuma pessoa neste setor ainda.</p>';
      }
      var aberto = !abertos[n.id] || termo;
      htmlSetores += '<details class="rh-setor rh-nivel n' + Math.min(l.it.nivel, 6) + '" data-setor="' + esc(n.id) + '"' + (aberto ? ' open' : '') + '>' +
        '<summary><span class="rh-chip" style="background:' + esc(cor.bg) + ';color:' + esc(cor.fg) + '">' + esc(n.sigla || n.id) + '</span>' +
        '<span class="rh-titulo">' + esc(rotuloSetor(n)) + '</span>' +
        '<span class="rh-conta">' + (l.org.length + extrasDoSetor(n.id)) + '</span>' +
        '<button type="button" class="rh-add" data-add="' + esc(n.id) + '">+ Pessoa</button></summary>' +
        '<div class="rh-corpo">' + corpo + '</div></details>';
    });
    function extrasDoSetor(id) { return pessoasDoSetor(id).length; }

    el('rhSetores').innerHTML = htmlSetores || '<p class="rh-vazio">Nenhum setor encontrado.</p>';
    var totalGeral = totalOrg + totalRh;
    el('rhContagem').textContent = setoresMostrados + ' setor' + (setoresMostrados === 1 ? '' : 'es') + ' · ' + totalGeral + ' pessoa' + (totalGeral === 1 ? '' : 's') +
      ' (' + totalOrg + ' do organograma, ' + totalRh + ' adicionada' + (totalRh === 1 ? '' : 's') + ' pelo RH)';
    var todasOrg = ORG.nos.filter(function (n) { return nomeDoNo(n).length; }).length;
    el('rhResumo').textContent = ORG.nos.length ? '· ' + ORG.nos.length + ' setores · ' + (todasOrg + PESSOAS.length) + ' pessoas' : '';
  }

  function montarSetores() {
    var lista = arvore();
    var opcoes = lista.map(function (it) {
      return '<option value="' + esc(it.no.id) + '">' + new Array(it.nivel + 1).join('— ') + esc(rotuloSetor(it.no)) + '</option>';
    }).join('');
    var atual = el('rhSetor').value, filtro = el('rhFiltroSetor').value;
    el('rhSetor').innerHTML = '<option value="">Escolha o setor…</option>' + opcoes;
    el('rhFiltroSetor').innerHTML = '<option value="">Todos os setores</option>' + opcoes;
    if (atual) el('rhSetor').value = atual;
    if (filtro) el('rhFiltroSetor').value = filtro;
    if (window.SelectApp && SelectApp.atualizar) { try { SelectApp.atualizar(); } catch (e) { /* enfeite */ } }
  }

  /* --------------------------------------------------------------- form */
  function limparForm() {
    editando = null;
    ['rhNome', 'rhCargo', 'rhMatricula', 'rhTelefone', 'rhEmail', 'rhObs'].forEach(function (i) { el(i).value = ''; });
    el('rhVinculo').value = '';
    el('rhTituloForm').textContent = 'Nova pessoa';
    el('rhSalvar').textContent = 'Adicionar';
    el('rhCancelar').hidden = true;
    el('rhErro').textContent = '';
  }
  function editar(id) {
    var p = PESSOAS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    editando = id;
    el('rhSetor').value = p.setor_id;
    el('rhNome').value = p.nome || ''; el('rhCargo').value = p.cargo || ''; el('rhMatricula').value = p.matricula || '';
    el('rhVinculo').value = p.vinculo || ''; el('rhTelefone').value = p.telefone ? fone(p.telefone) : ''; el('rhEmail').value = p.email || '';
    el('rhObs').value = p.observacao || '';
    el('rhTituloForm').textContent = 'Editar pessoa';
    el('rhSalvar').textContent = 'Salvar';
    el('rhCancelar').hidden = false;
    el('rhErro').textContent = '';
    el('rhNome').focus();
    el('rhNome').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function salvar(ev) {
    ev.preventDefault();
    var setor = el('rhSetor').value, nome = el('rhNome').value.trim();
    if (!setor) { el('rhErro').textContent = 'Escolha o setor.'; return; }
    if (nome.length < 3) { el('rhErro').textContent = 'Informe o nome completo.'; return; }
    var botao = el('rhSalvar'), texto = botao.textContent;
    botao.disabled = true; botao.textContent = 'Salvando…'; el('rhErro').textContent = '';
    try {
      await rpc('rh_salvar_pessoa', { p: {
        id: editando || '', setor_id: setor, nome: nome, cargo: el('rhCargo').value, matricula: el('rhMatricula').value, vinculo: el('rhVinculo').value,
        telefone: el('rhTelefone').value, email: el('rhEmail').value, observacao: el('rhObs').value } });
      var foiEdicao = Boolean(editando);
      await carregarPessoas();
      limparForm();
      el('rhSetor').value = setor;   // quem cadastra várias pessoas do mesmo setor não precisa escolher de novo
      desenhar();
      aviso(foiEdicao ? 'Pessoa atualizada.' : 'Pessoa adicionada.', 'ok');
      setTimeout(function () { aviso(''); }, 3500);
    } catch (e) {
      el('rhErro').textContent = e.message || 'Não foi possível salvar.';
    } finally { botao.disabled = false; if (!editando) botao.textContent = 'Adicionar'; else botao.textContent = texto; }
  }

  async function alternar(id) {
    var p = PESSOAS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    try { await rpc('rh_situacao_pessoa', { p_id: id, p_ativo: !p.ativo }); await carregarPessoas(); desenhar(); }
    catch (e) { aviso(esc(e.message)); }
  }
  function excluir(id) {
    var p = PESSOAS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    window.Modal.confirmar({ titulo: 'Excluir pessoa', mensagem: 'Excluir ' + p.nome + ' do RH? Não tem como desfazer.', confirmar: 'Excluir', cancelar: 'Cancelar', perigo: true })
      .then(function (sim) {
        if (!sim) return;
        return rpc('rh_excluir_pessoa', { p_id: id }).then(function () { if (editando === id) limparForm(); return carregarPessoas(); }).then(desenhar)
          .catch(function (e) { aviso(esc(e.message)); });
      });
  }

  /* ---------------------------------------------------------------- liga */
  function ligar() {
    el('rhIcoBusca').innerHTML = ICONE_BUSCA;
    el('rhForm').addEventListener('submit', salvar);
    el('rhCancelar').addEventListener('click', limparForm);
    el('rhBusca').addEventListener('input', desenhar);
    el('rhFiltroSetor').addEventListener('change', desenhar);
    el('rhSeg').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-v]');
      if (!b) return;
      filtroSit = b.getAttribute('data-v');
      Array.prototype.forEach.call(el('rhSeg').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
      desenhar();
    });
    el('rhSetores').addEventListener('click', function (ev) {
      var add = ev.target.closest('[data-add]');
      if (add) {
        ev.preventDefault();   // não recolhe o setor
        limparForm();
        el('rhSetor').value = add.getAttribute('data-add');
        el('rhNome').focus();
        el('rhNome').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      var ed = ev.target.closest('[data-ed]'); if (ed) { editar(ed.getAttribute('data-ed')); return; }
      var sit = ev.target.closest('[data-sit]'); if (sit) { alternar(sit.getAttribute('data-sit')); return; }
      var ex = ev.target.closest('[data-ex]'); if (ex) { excluir(ex.getAttribute('data-ex')); }
    });
    el('rhSetores').addEventListener('toggle', function (ev) {
      var d = ev.target;
      if (d && d.matches && d.matches('details[data-setor]') && !el('rhBusca').value.trim()) abertos[d.getAttribute('data-setor')] = !d.open;
    }, true);
    // quem troca um nome no organograma e volta para esta aba vê a mudança sem recarregar
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      carregarOrganograma().then(function () { montarSetores(); desenhar(); });
    });
  }

  async function iniciar() {
    ligar();
    el('rhSetores').innerHTML = '<p class="rh-vazio">Carregando setores…</p>';
    await Promise.all([carregarOrganograma(), carregarPessoas(), carregarTelefones()]);
    montarSetores();
    desenhar();
  }
  iniciar();
})();
