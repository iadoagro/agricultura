/* Ponte entre o sistema e a pasta PRIVADA do Google Drive.
   A pasta fica restrita ao dono; este script roda como o dono e só mexe nos arquivos quando o pedido vem do sistema:
     - servidor (PHP / função do Supabase): manda o SEGREDO;
     - equipe logada: manda o token de sessão do sistema (conferido no Supabase; pastas "vpn-*" exigem permissão de VPN);
     - formulário público da VPN: só envia, e só enquanto o link está ativo (e com a senha, se houver).
   Passo a passo: drive/CONFIGURAR.md. Não publique o SEGREDO: o arquivo com ele é drive/upload-drive.local.gs. */

var SEGREDO = 'TROCAR_PELO_SEGREDO';
var PASTA_ID = '1RZP4ymMBFmjdtk5yE92Z1R5MPlx3ott_';
var MAX_BYTES = 5 * 1024 * 1024;                              // 5 MB por arquivo
var SUPABASE_URL = 'https://nivbogsrfirumtbqpqff.supabase.co';
var SUPABASE_CHAVE = 'sb_publishable_pIOxGXnNyz8XMewhn40HBQ_d_Lxi4zJ';   // chave publicável (a mesma de js/banco-config.js)
var TIPOS = { 'application/pdf': 1, 'image/jpeg': 1, 'image/png': 1 };

// Rode UMA vez no editor (menu "Executar" > configurar): tira o compartilhamento público da pasta.
function configurar() {
  var pasta = DriveApp.getFolderById(PASTA_ID);
  pasta.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  Logger.log('Pasta "' + pasta.getName() + '" agora está: ' + pasta.getSharingAccess());
}

function doGet() {
  return resposta({ ok: true, servico: 'upload-drive' });
}

function doPost(e) {
  try {
    if (!SEGREDO || SEGREDO.length < 30) return resposta({ ok: false, erro: 'Ponte sem segredo configurado.' });
    var d = JSON.parse(e.postData.contents);
    if (d.acao === 'enviar') return resposta(enviar(d));
    if (d.acao === 'ler') return resposta(ler(d));
    if (d.acao === 'excluir') return resposta(excluir(d));
    return resposta({ ok: false, erro: 'Ação inválida.' });
  } catch (err) {
    return resposta({ ok: false, erro: 'Pedido inválido.' });
  }
}

function resposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function supabase(caminho, token, corpo) {
  var r = UrlFetchApp.fetch(SUPABASE_URL + caminho, {
    method: corpo ? 'post' : 'get', contentType: 'application/json', payload: corpo ? JSON.stringify(corpo) : null,
    headers: { apikey: SUPABASE_CHAVE, Authorization: 'Bearer ' + (token || SUPABASE_CHAVE) }, muteHttpExceptions: true
  });
  return { status: r.getResponseCode(), texto: r.getContentText() };
}

// Cache de 5 min por sessão: cada conferência no Supabase custa ~0,3 s, e abrir vários arquivos seguidos repete o mesmo token.
var CACHE = CacheService.getScriptCache();
function chaveToken(prefixo, token) {
  return prefixo + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
}
// Confere a sessão (e, se pedido, a permissão de VPN). As duas consultas que faltarem vão em paralelo.
function tokenAutorizado(token, precisaVpn) {
  if (!token) return false;
  var kS = chaveToken('s:', token), kV = chaveToken('v:', token);
  var temS = CACHE.get(kS) === '1', temV = !precisaVpn || CACHE.get(kV) === '1';
  if (temS && temV) return true;
  var pedidos = [];
  var cab = { apikey: SUPABASE_CHAVE, Authorization: 'Bearer ' + token };
  if (!temS) pedidos.push({ url: SUPABASE_URL + '/auth/v1/user', method: 'get', headers: cab, muteHttpExceptions: true });
  if (!temV) pedidos.push({ url: SUPABASE_URL + '/rest/v1/rpc/pode_vpn', method: 'post', contentType: 'application/json', payload: '{}', headers: cab, muteHttpExceptions: true });
  var rs = UrlFetchApp.fetchAll(pedidos), i = 0;
  if (!temS) {
    if (rs[i++].getResponseCode() !== 200) return false;
    CACHE.put(kS, '1', 300);
  }
  if (!temV) {
    var v = rs[i];
    if (v.getResponseCode() !== 200 || v.getContentText().trim() !== 'true') return false;
    CACHE.put(kV, '1', 300);
  }
  return true;
}

// Quem pode mexer em arquivos da área "area" (primeira pasta dentro da raiz IADOAGRO, ex.: VPN). modo: 'enviar' | 'ler' | 'excluir'
// pasta = caminho completo pedido no envio (ex.: VPN/Documentos); só o envio usa.
function autorizado(d, area, modo, pasta) {
  if (d.segredo && d.segredo === SEGREDO) return true;
  var vpn = area === 'VPN';
  if (d.token) {
    if (!vpn && modo === 'excluir') return false;
    return tokenAutorizado(d.token, vpn);
  }
  // formulário público: só envia documento e termo da VPN, com o link ativo e a senha certa
  if (modo === 'enviar' && (pasta === 'VPN/Documentos' || pasta === 'VPN/Termos assinados')) {
    return supabase('/rest/v1/rpc/vpn_exige_acesso', null, { p_senha: String(d.senha || '') }).status < 300;
  }
  return false;
}

// confere o começo do arquivo, não só o tipo que o navegador declarou
function tipoDoConteudo(b) {
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b.length > 3 && (b[0] & 255) === 0xFF && (b[1] & 255) === 0xD8 && (b[2] & 255) === 0xFF) return 'image/jpeg';
  if (b.length > 4 && (b[0] & 255) === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  return '';
}

// a própria pasta IADOAGRO do Drive; cada parte do sistema tem a sua dentro dela (VPN, Mecanização...)
function raiz() {
  return DriveApp.getFolderById(PASTA_ID);
}

// "VPN/Documentos" -> IADOAGRO/VPN/Documentos (cria o que faltar). Sem caminho, grava na raiz.
function subpasta(caminho) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var atual = raiz();
    if (!caminho) return atual;
    var partes = String(caminho).split('/');
    for (var i = 0; i < partes.length; i++) {
      if (!/^[A-Za-z0-9\u00C0-\u00FF][A-Za-z0-9\u00C0-\u00FF _.-]{0,59}$/.test(partes[i]) || partes[i] === '..') throw new Error('Pasta inválida.');
      var it = atual.getFoldersByName(partes[i]);
      atual = it.hasNext() ? it.next() : atual.createFolder(partes[i]);
    }
    return atual;
  } finally { lock.releaseLock(); }
}

// Área (primeira pasta dentro da raiz) de um arquivo dentro de IADOAGRO; null se estiver fora.
// A resposta fica 6 h no cache: subir a árvore de pastas custa várias chamadas ao Drive.
function areaDoArquivo(arquivo) {
  var id = arquivo.getId();
  var guardada = CACHE.get('a:' + id);
  if (guardada !== null) return guardada === '-' ? '' : guardada;
  var raizId = PASTA_ID;
  function subir(pasta, cadeia, nivel) {
    if (pasta.getId() === raizId) return cadeia;
    if (nivel > 6) return null;
    var pais = pasta.getParents();
    while (pais.hasNext()) {
      var r = subir(pais.next(), cadeia.concat(pasta.getName()), nivel + 1);
      if (r) return r;
    }
    return null;
  }
  var pais = arquivo.getParents();
  while (pais.hasNext()) {
    var cadeia = subir(pais.next(), [], 0);
    if (cadeia) {
      var area = cadeia.length ? cadeia[cadeia.length - 1] : '';
      CACHE.put('a:' + id, area || '-', 21600);
      return area;
    }
  }
  return null;
}

function arquivoPorId(id) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(String(id))) return null;
  try { return DriveApp.getFileById(id); } catch (e) { return null; }
}

function enviar(d) {
  var pasta = String(d.pasta || '');
  if (!autorizado(d, pasta.split('/')[0], 'enviar', pasta)) return { ok: false, erro: 'Envio não autorizado.' };
  var nome = String(d.nome || 'arquivo').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 150);
  var bytes = Utilities.base64Decode(String(d.base64 || ''));
  if (!bytes.length) return { ok: false, erro: 'O arquivo está vazio.' };
  if (bytes.length > MAX_BYTES) return { ok: false, erro: 'O arquivo passa de 5 MB.' };
  var tipo = tipoDoConteudo(bytes);
  if (!tipo || !TIPOS[tipo]) return { ok: false, erro: 'Use um arquivo PDF, JPG ou PNG.' };
  var arquivo = subpasta(pasta).createFile(Utilities.newBlob(bytes, tipo, nome));
  var area = pasta.split('/')[0];
  CACHE.put('a:' + arquivo.getId(), area || '-', 21600);
  return { ok: true, id: arquivo.getId() };
}

function ler(d) {
  var arquivo = arquivoPorId(d.id);
  var area = arquivo ? areaDoArquivo(arquivo) : null;
  if (area === null) return { ok: false, erro: 'Arquivo não encontrado.' };
  if (!autorizado(d, area, 'ler')) return { ok: false, erro: 'Acesso negado.' };
  var blob = arquivo.getBlob();
  var bytes = blob.getBytes();
  return { ok: true, nome: arquivo.getName(), tipo: blob.getContentType(), tamanho: bytes.length, base64: Utilities.base64Encode(bytes) };
}

// vai para a lixeira do Drive (recuperável por 30 dias)
function excluir(d) {
  var arquivo = arquivoPorId(d.id);
  var area = arquivo ? areaDoArquivo(arquivo) : null;
  if (area === null) return { ok: true, ausente: true };
  if (!autorizado(d, area, 'excluir')) return { ok: false, erro: 'Acesso negado.' };
  arquivo.setTrashed(true);
  CACHE.remove('a:' + d.id);
  return { ok: true };
}
