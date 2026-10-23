/* Anexos no Google Drive (pasta privada). O navegador nunca fala direto com o Drive: tudo passa pela ponte
   drive/upload-drive.gs (URL em BANCO_CONFIG.driveUrl), que confere quem está pedindo. No banco, o caminho do
   arquivo vira "drive:<id>". Caminhos antigos (sem esse prefixo) seguem no Storage do Supabase até serem migrados.
   Sem driveUrl configurado, ativo() é falso e as telas continuam usando o Storage como antes. */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var PREFIXO = 'drive:';

  function ativo() { return /^https:\/\/script\.google\.com\//.test(String(cfg.driveUrl || '')); }
  function ehDrive(ref) { return String(ref || '').indexOf(PREFIXO) === 0; }
  function idDe(ref) { return String(ref).slice(PREFIXO.length); }

  function paraBase64(arquivo) {
    return new Promise(function (ok, erro) {
      var leitor = new FileReader();
      leitor.onload = function () { ok(String(leitor.result).split(',')[1] || ''); };
      leitor.onerror = function () { erro(new Error('Não foi possível ler o arquivo.')); };
      leitor.readAsDataURL(arquivo);
    });
  }

  // text/plain evita a pré-checagem CORS, que o Apps Script não responde
  async function chamar(corpo) {
    var r;
    try {
      r = await fetch(cfg.driveUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) });
    } catch (e) { throw new Error('Não foi possível falar com o Google Drive. Verifique a conexão e tente de novo.'); }
    var c = null;
    try { c = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok || !c) throw new Error('O Google Drive não respondeu (' + r.status + ').');
    if (!c.ok) throw new Error(c.erro || 'O Google Drive recusou o pedido.');
    return c;
  }

  // Envia um File/Blob para a subpasta e devolve "drive:<id>".
  // opcoes.token = sessão da equipe logada; opcoes.senha = senha do formulário público (quando houver).
  async function enviar(arquivo, nome, pasta, opcoes) {
    opcoes = opcoes || {};
    var c = await chamar({ acao: 'enviar', nome: nome || arquivo.name || 'arquivo', pasta: pasta || '', base64: await paraBase64(arquivo), token: opcoes.token, senha: opcoes.senha });
    return PREFIXO + c.id;
  }

  // Manda para a lixeira do Drive. Só funciona logado (token da sessão do sistema).
  async function excluir(ref, token) {
    if (!ehDrive(ref)) return;
    esquecer(idDe(ref));
    try { await chamar({ acao: 'excluir', id: idDe(ref), token: token }); } catch (e) { /* não trava a exclusão do registro */ }
  }

  // Arquivos já buscados nesta aba (só na memória; nada fica gravado no navegador). Guarda a promessa, então
  // dois pedidos do mesmo arquivo (ex.: passar o mouse e clicar) viram uma busca só. Limite de 40 MB, o mais antigo sai primeiro.
  var memoria = new Map(), bytesMemoria = 0, LIMITE = 40 * 1048576;
  function esquecer(id) {
    var e = memoria.get(id);
    if (e) { bytesMemoria -= e.bytes || 0; memoria.delete(id); }
  }
  function buscar(ref, token) {
    var id = idDe(ref), e = memoria.get(id);
    if (e) { memoria.delete(id); memoria.set(id, e); return e.promessa; }   // renova a posição
    e = { bytes: 0 };
    e.promessa = chamar({ acao: 'ler', id: id, token: token }).then(function (c) {
      // 'data:' decodifica o base64 por dentro do navegador, bem mais rápido que um laço em JavaScript
      return fetch('data:' + (c.tipo || 'application/octet-stream') + ';base64,' + c.base64).then(function (r) { return r.blob(); }).then(function (blob) {
        e.bytes = blob.size; bytesMemoria += blob.size;
        memoria.forEach(function (v, k) { if (bytesMemoria > LIMITE && k !== id) esquecer(k); });
        return { blob: blob, nome: c.nome };
      });
    });
    e.promessa.catch(function () { esquecer(id); });
    memoria.set(id, e);
    return e.promessa;
  }

  // Começa a buscar antes do clique (passar o mouse / encostar o dedo): na hora de abrir o arquivo já está aqui.
  // Com "atraso", só o último arquivo em que o mouse parou é buscado (passar o mouse pela tabela não dispara tudo).
  var esperaPre = null;
  function preaquecer(ref, token, atraso) {
    if (!ehDrive(ref) || !ativo()) return;
    clearTimeout(esperaPre);
    function ir() { buscar(ref, token).catch(function () { /* o erro aparece se a pessoa de fato abrir */ }); }
    if (atraso) esperaPre = setTimeout(ir, atraso); else ir();
  }

  // Acorda a ponte do Google (a primeira chamada depois de um tempo parada é a mais lenta).
  var acordada = false;
  function aquecer() {
    if (acordada || !ativo()) return;
    acordada = true;
    fetch(cfg.driveUrl, { method: 'GET', mode: 'no-cors' }).catch(function () { acordada = false; });
  }

  // Abre o arquivo na janela dada, ou baixa quando vier "baixarComo" (ou sem janela).
  async function abrir(ref, opcoes) {
    opcoes = opcoes || {};
    var a = await buscar(ref, opcoes.token);
    var url = URL.createObjectURL(a.blob);
    if (opcoes.baixarComo || !opcoes.janela) {
      var ancora = document.createElement('a');
      ancora.href = url; ancora.download = opcoes.baixarComo || a.nome || 'arquivo';
      document.body.appendChild(ancora); ancora.click(); ancora.remove();
    } else {
      opcoes.janela.location.href = url;
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  }

  // Tira da memória (arquivo excluído ou trocado).
  function esquecerArquivo(ref) { if (ehDrive(ref)) esquecer(idDe(ref)); }

  window.AgroDrive = { ativo: ativo, ehDrive: ehDrive, enviar: enviar, excluir: excluir, abrir: abrir, preaquecer: preaquecer, aquecer: aquecer, esquecer: esquecerArquivo };
}());
