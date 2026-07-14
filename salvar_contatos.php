<?php
// Endpoint para ler e salvar os telefones dos servidores num arquivo JSON.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$file = __DIR__ . '/contatos.json';
$method = $_SERVER['REQUEST_METHOD'];

function carregar($file){
  if(!file_exists($file)) return [];
  $conteudo = file_get_contents($file);
  $data = json_decode($conteudo, true);
  return is_array($data) ? $data : [];
}

if($method === 'GET'){
  echo json_encode((object)carregar($file), JSON_UNESCAPED_UNICODE);
  exit;
}

if($method === 'POST'){
  $raw = file_get_contents('php://input');
  $input = json_decode($raw, true);
  if(!is_array($input) || !isset($input['id']) || $input['id'] === ''){
    http_response_code(400);
    echo json_encode(['ok' => false, 'erro' => 'Dados invalidos']);
    exit;
  }

  $id = (string)$input['id'];
  $telefone = isset($input['telefone']) ? preg_replace('/\D/', '', $input['telefone']) : '';

  $data = carregar($file);
  if($telefone === ''){
    unset($data[$id]);
  }else{
    $data[$id] = $telefone;
  }

  $ok = file_put_contents(
    $file,
    json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
    LOCK_EX
  );

  if($ok === false){
    http_response_code(500);
    echo json_encode(['ok' => false, 'erro' => 'Falha ao gravar o arquivo']);
    exit;
  }

  echo json_encode(['ok' => true, 'telefone' => $telefone]);
  exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'erro' => 'Metodo nao permitido']);
