<?php
// Liga/desliga o link público do painel de Mecanização (mecanizacao-publico.html
// e dashboard.html?publico=1). GET é livre — o próprio link público precisa
// consultar isto, sem senha, para saber se ainda pode se mostrar. POST exige a
// mesma senha de administrador de salvar_mecanizacao.php (ver admin_senha.php).
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

date_default_timezone_set('America/Rio_Branco');

require __DIR__ . '/admin_senha.php';

$destino = __DIR__ . '/data/config-publico.json';
$metodo  = $_SERVER['REQUEST_METHOD'];

function erro($codigo, $msg){
  http_response_code($codigo);
  echo json_encode(['ok' => false, 'erro' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}

function ler_config($destino){
  if(!file_exists($destino)) return ['ativo' => true];
  $j = json_decode(file_get_contents($destino), true);
  if(!is_array($j) || !array_key_exists('ativo', $j)) return ['ativo' => true];
  return $j;
}

if($metodo === 'GET'){
  // sem arquivo = nunca foi revogado = link ativo (estado padrão)
  echo json_encode(ler_config($destino), JSON_UNESCAPED_UNICODE);
  exit;
}

if($metodo !== 'POST') erro(405, 'Método não permitido.');

$raw = file_get_contents('php://input');
$entrada = json_decode($raw, true);
if(!is_array($entrada)) erro(400, 'Corpo da requisição não é JSON válido.');

$senha = isset($entrada['senha']) ? $entrada['senha'] : null;
if(!senha_confere($senha)) erro(403, 'Senha de administrador incorreta.');

if(!array_key_exists('ativo', $entrada) || !is_bool($entrada['ativo'])){
  erro(400, 'Falta o campo "ativo" (verdadeiro ou falso).');
}

if(!is_dir(__DIR__ . '/data')){
  if(!mkdir(__DIR__ . '/data', 0775, true)) erro(500, 'Não foi possível criar a pasta data/.');
}

$config = ['ativo' => $entrada['ativo'], 'alterado_em' => date('d/m/Y H:i')];
$json = json_encode($config, JSON_UNESCAPED_UNICODE);
if($json === false) erro(500, 'Falha ao serializar a configuração.');

if(file_put_contents($destino, $json, LOCK_EX) === false){
  erro(500, 'Falha ao gravar data/config-publico.json (verifique a permissão de escrita).');
}

echo json_encode(['ok' => true, 'ativo' => $config['ativo'], 'alterado_em' => $config['alterado_em']], JSON_UNESCAPED_UNICODE);
