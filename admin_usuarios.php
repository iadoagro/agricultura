<?php
declare(strict_types=1);

/* Ações administrativas que exigem a chave service_role do Supabase (criar,
   editar e-mail, excluir contas de verdade em Authentication > Users) —
   por isso rodam aqui no servidor, nunca no navegador. Só aceita pedidos de
   quem está autenticado no Supabase como luansobraldourado5@gmail.com; a
   sessão é a mesma do login do site (admin-auth.js), enviada no cabeçalho
   Authorization. Configuração real em admin_config.php (fora do git — veja
   admin_config.example.php e database/CONFIGURAR-ADMIN.md). */

header('Content-Type: application/json; charset=utf-8');

function responder(int $status, array $corpo): void
{
    http_response_code($status);
    echo json_encode($corpo);
    exit;
}

const RESPONSAVEL_EMAIL = 'luansobraldourado5@gmail.com';

$configPath = __DIR__ . '/admin_config.php';
if (!file_exists($configPath)) {
    responder(500, ['ok' => false, 'erro' => 'Configuração do servidor ausente (admin_config.php). Veja database/CONFIGURAR-ADMIN.md.']);
}
$config = require $configPath;
$supabaseUrl = rtrim((string) ($config['url'] ?? ''), '/');
$serviceRole = (string) ($config['service_role'] ?? '');
if ($supabaseUrl === '' || $serviceRole === '') {
    responder(500, ['ok' => false, 'erro' => 'admin_config.php está incompleto (url ou service_role em branco).']);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(405, ['ok' => false, 'erro' => 'Método não permitido.']);
}

/** Chama a API do Supabase com a service_role (acesso total — nunca expor). */
function chamarSupabase(string $url, string $serviceRole, string $metodo, string $caminho, ?array $corpo = null): array
{
    $ch = curl_init($url . $caminho);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['apikey: ' . $serviceRole, 'Authorization: Bearer ' . $serviceRole, 'Content-Type: application/json'],
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_POSTFIELDS => $corpo !== null ? json_encode($corpo) : null,
    ]);
    $resposta = curl_exec($ch);
    $erroCurl = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resposta === false) {
        return [0, ['msg' => $erroCurl]];
    }
    $json = json_decode((string) $resposta, true);
    return [$status, is_array($json) ? $json : []];
}

$entrada = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($entrada)) {
    $entrada = [];
}
$acao = (string) ($entrada['acao'] ?? '');

// Autocadastro (tela de login, aba "Cadastrar"): quem ainda não tem conta
// nenhuma, então não há sessão pra conferir aqui. Em vez de exigir login,
// só aceita e-mails no formato nome.sobrenome@sistema.local — o mesmo
// domínio fixo que o app usa pra login por usuário — o que já limita bem
// o que essa rota consegue fazer. A conta nasce pendente (o gatilho do
// banco cuida disso) e só funciona de verdade depois que o responsável
// aprovar em Usuários.
if ($acao === 'autocadastro') {
    $email = (string) ($entrada['email'] ?? '');
    $senha = (string) ($entrada['senha'] ?? '');
    if (!preg_match('/^[a-z0-9-]+\.[a-z0-9-]+@sistema\.local$/', $email)) {
        responder(400, ['ok' => false, 'erro' => 'Login inválido.']);
    }
    if (strlen($senha) < 6) {
        responder(400, ['ok' => false, 'erro' => 'A senha precisa ter pelo menos 6 caracteres.']);
    }
    [$status, $corpo] = chamarSupabase($supabaseUrl, $serviceRole, 'POST', '/auth/v1/admin/users', ['email' => $email, 'password' => $senha, 'email_confirm' => true]);
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'id' => $corpo['id'] ?? null]);
    }
    responder(502, ['ok' => false, 'erro' => (is_string($corpo['msg'] ?? null) && stripos($corpo['msg'], 'already') !== false) ? 'Já existe uma conta com esse login.' : ($corpo['msg'] ?? 'O Supabase não concluiu o cadastro.')]);
}

$cabecalhos = function_exists('getallheaders') ? getallheaders() : [];
$authHeader = $cabecalhos['Authorization'] ?? $cabecalhos['authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer\s+(.+)$/i', (string) $authHeader, $m)) {
    responder(401, ['ok' => false, 'erro' => 'Sem sessão.']);
}
$token = $m[1];

// Confirma, direto no Supabase, quem é o dono desse token — nunca confia
// em nada que venha só do navegador para essa checagem.
$ch = curl_init($supabaseUrl . '/auth/v1/user');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['apikey: ' . $serviceRole, 'Authorization: Bearer ' . $token],
    CURLOPT_TIMEOUT => 15,
]);
$respostaUsuario = curl_exec($ch);
$statusUsuario = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$usuario = json_decode((string) $respostaUsuario, true);

if ($statusUsuario !== 200 || !is_array($usuario) || strtolower((string) ($usuario['email'] ?? '')) !== RESPONSAVEL_EMAIL) {
    responder(403, ['ok' => false, 'erro' => 'Esta conta não tem autorização.']);
}

if ($acao === 'criar_usuario') {
    $email = (string) ($entrada['email'] ?? '');
    $senha = (string) ($entrada['senha'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        responder(400, ['ok' => false, 'erro' => 'Login inválido.']);
    }
    if (strlen($senha) < 6) {
        responder(400, ['ok' => false, 'erro' => 'A senha precisa ter pelo menos 6 caracteres.']);
    }
    [$status, $corpo] = chamarSupabase($supabaseUrl, $serviceRole, 'POST', '/auth/v1/admin/users', ['email' => $email, 'password' => $senha, 'email_confirm' => true]);
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'id' => $corpo['id'] ?? null]);
    }
    responder(502, ['ok' => false, 'erro' => (is_string($corpo['msg'] ?? null) && stripos($corpo['msg'], 'already')  !== false) ? 'Já existe uma conta com esse login.' : ($corpo['msg'] ?? 'O Supabase não concluiu o cadastro.')]);
}

$id = (string) ($entrada['id'] ?? '');
if (!preg_match('/^[0-9a-f-]{36}$/i', $id)) {
    responder(400, ['ok' => false, 'erro' => 'Identificador inválido.']);
}

if ($acao === 'excluir') {
    [$status, $corpo] = chamarSupabase($supabaseUrl, $serviceRole, 'DELETE', '/auth/v1/admin/users/' . $id);
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true]);
    }
    responder(502, ['ok' => false, 'erro' => $corpo['msg'] ?? 'O Supabase não concluiu a exclusão.']);
}

if ($acao === 'editar_email') {
    $novoEmail = (string) ($entrada['email'] ?? '');
    if (!filter_var($novoEmail, FILTER_VALIDATE_EMAIL)) {
        responder(400, ['ok' => false, 'erro' => 'E-mail inválido.']);
    }
    [$status, $corpo] = chamarSupabase($supabaseUrl, $serviceRole, 'PUT', '/auth/v1/admin/users/' . $id, ['email' => $novoEmail, 'email_confirm' => true]);
    if ($status >= 200 && $status < 300) {
        chamarSupabase($supabaseUrl, $serviceRole, 'PATCH', '/rest/v1/admin_solicitacoes?id=eq.' . $id, ['email' => $novoEmail]);
        responder(200, ['ok' => true]);
    }
    responder(502, ['ok' => false, 'erro' => $corpo['msg'] ?? 'O Supabase não concluiu a alteração.']);
}

responder(400, ['ok' => false, 'erro' => 'Ação desconhecida.']);
