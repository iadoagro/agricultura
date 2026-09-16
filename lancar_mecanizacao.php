<?php
declare(strict_types=1);

/* Aba "Lançamento" do painel de mecanização: digitação de uma vistoria por
 * vez (a partir da ficha em papel, com ou sem PDF anexado) direto no banco
 * Supabase — mecanizacao_lancamentos (ver database/mecanizacao-lancamentos.sql).
 *
 * Usa a MESMA senha de administrador de salvar_mecanizacao.php (ver
 * admin_senha.php) e a MESMA chave service_role de admin_usuarios.php (ver
 * admin_config.php) — nunca a chave publicável do navegador. O navegador
 * nunca recebe a service_role: toda gravação passa por aqui.
 *
 * Ações (multipart/form-data, campo "acao"):
 *   salvar   — grava um lançamento (e o PDF, se enviado, no Storage).
 *   listar   — devolve os últimos lançamentos, para conferência na tela; só os
 *              da própria pessoa (por e-mail), exceto root@root.com, que vê
 *              todo mundo.
 *
 * A leitura/pré-preenchimento do PDF NÃO passa por aqui: acontece inteira no
 * navegador (ver js/lancamento-extrair-pdf.js), então funciona mesmo se este
 * servidor não tiver Python.
 *
 * "quem lançou" nunca vem só do que o navegador afirma: tanto salvar quanto
 * listar recebem o campo "token" (a sessão do login do site, admin-auth.js) e
 * confirmam o e-mail de verdade direto no Supabase — o mesmo cuidado de
 * admin_usuarios.php.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
date_default_timezone_set('America/Rio_Branco');

require __DIR__ . '/admin_senha.php';

const RESPONSAVEL_EMAIL = 'root@root.com';

function responder(int $status, array $corpo): void
{
    http_response_code($status);
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(405, ['ok' => false, 'erro' => 'Método não permitido.']);
}

$acao = (string) ($_POST['acao'] ?? '');
$senha = (string) ($_POST['senha'] ?? '');
if (!senha_confere($senha)) {
    responder(403, ['ok' => false, 'erro' => 'Senha de administrador incorreta.']);
}

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

/** Chama a API REST/Storage do Supabase com a service_role. $corpo pode ser
 *  um array (vira JSON) ou uma string crua (upload binário no Storage). */
function chamarSupabase(string $url, string $serviceRole, string $metodo, string $caminho, $corpo = null, array $headersExtra = []): array
{
    $headers = array_merge([
        'apikey: ' . $serviceRole,
        'Authorization: Bearer ' . $serviceRole,
    ], $headersExtra);
    $ch = curl_init($url . $caminho);
    $opcoes = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_TIMEOUT => 25,
    ];
    if (is_array($corpo)) {
        $opcoes[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
        $opcoes[CURLOPT_POSTFIELDS] = json_encode($corpo, JSON_UNESCAPED_UNICODE);
    } elseif (is_string($corpo)) {
        $opcoes[CURLOPT_POSTFIELDS] = $corpo;
    }
    curl_setopt_array($ch, $opcoes);
    $resposta = curl_exec($ch);
    $erroCurl = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resposta === false) {
        return [0, ['msg' => $erroCurl]];
    }
    $json = json_decode((string) $resposta, true);
    return [$status, is_array($json) ? $json : ['_bruto' => $resposta]];
}

/** Confirma no próprio Supabase quem é o dono do token de sessão do site
 *  (mandado pelo navegador no campo "token") e devolve o e-mail de verdade —
 *  nunca o que o navegador afirma sozinho. null quando não dá pra confirmar
 *  (sem token, token vencido, etc.). */
function emailAutenticado(string $supabaseUrl, string $serviceRole): ?string
{
    $token = (string) ($_POST['token'] ?? '');
    if ($token === '') {
        return null;
    }
    $ch = curl_init($supabaseUrl . '/auth/v1/user');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['apikey: ' . $serviceRole, 'Authorization: Bearer ' . $token],
        CURLOPT_TIMEOUT => 15,
    ]);
    $resposta = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $usuario = json_decode((string) $resposta, true);
    if ($status !== 200 || !is_array($usuario) || empty($usuario['email'])) {
        return null;
    }
    return strtolower((string) $usuario['email']);
}

/** Confere se o upload é mesmo um PDF (extensão + assinatura %PDF), não só
 *  o Content-Type que o navegador mandou (fácil de forjar). */
function arquivoPdfValido(array $arquivo): ?string
{
    if (($arquivo['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($arquivo['error'] !== UPLOAD_ERR_OK) {
        responder(400, ['ok' => false, 'erro' => 'Falha no envio do arquivo (código ' . $arquivo['error'] . ').']);
    }
    if ($arquivo['size'] > 20 * 1024 * 1024) {
        responder(413, ['ok' => false, 'erro' => 'O PDF enviado passa de 20 MB.']);
    }
    $assinatura = @file_get_contents($arquivo['tmp_name'], false, null, 0, 5);
    if ($assinatura === false || strncmp($assinatura, '%PDF-', 5) !== 0) {
        responder(400, ['ok' => false, 'erro' => 'O arquivo enviado não parece ser um PDF.']);
    }
    return $arquivo['tmp_name'];
}

/* A leitura do PDF (antiga ação "extrair") agora acontece inteira no
 * navegador — ver js/lancamento-extrair-pdf.js — sem chamar este arquivo:
 * não depende mais de Python/pypdf estar instalado no servidor. O script
 * tools/extrair_relatorio_mecanizacao.py continua no repositório como
 * referência (a mesma lógica de reconhecimento, só que em Python), mas não é
 * mais chamado por nada daqui.
 */

/* =============================================================== salvar === */
if ($acao === 'salvar') {
    $txt = function (string $chave) { $v = trim((string) ($_POST[$chave] ?? '')); return $v === '' ? null : $v; };
    $num = function (string $chave) {
        $v = trim((string) ($_POST[$chave] ?? ''));
        if ($v === '') return null;
        $v = str_replace(',', '.', $v);
        return is_numeric($v) ? (float) $v : null;
    };
    $inteiro = function (string $chave) {
        $v = trim((string) ($_POST[$chave] ?? ''));
        return $v === '' || !is_numeric($v) ? null : (int) $v;
    };
    $bool = function (string $chave) { return in_array($_POST[$chave] ?? '', ['1', 'true', 'on'], true); };
    $data = function (string $chave) {
        $v = trim((string) ($_POST[$chave] ?? ''));
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : null;
    };
    $json = function (string $chave, $padrao) {
        $v = (string) ($_POST[$chave] ?? '');
        if ($v === '') return $padrao;
        $decodificado = json_decode($v, true);
        return json_last_error() === JSON_ERROR_NONE ? $decodificado : $padrao;
    };
    $lista = function (string $chave) {
        $v = (string) ($_POST[$chave] ?? '');
        if ($v === '') return [];
        $decodificado = json_decode($v, true);
        return is_array($decodificado) ? array_values(array_map('strval', $decodificado)) : [];
    };

    $nomeBeneficiario = $txt('nome_beneficiario');
    if ($nomeBeneficiario === null) {
        responder(400, ['ok' => false, 'erro' => 'Informe o nome do beneficiário.']);
    }

    // O e-mail confirmado no Supabase manda; o campo criado_por_email do
    // formulário só serve de fallback se por algum motivo a sessão do site
    // não vier junto (não devia acontecer, já que a página exige login).
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);

    $registro = [
        'criado_por_email' => $emailConfirmado ?? $txt('criado_por_email'),
        'tipo_servico' => $txt('tipo_servico'),
        'data_vistoria' => $data('data_vistoria'),
        'escritorio_local' => $txt('escritorio_local'),
        'responsavel_tecnico' => $txt('responsavel_tecnico'),
        'ponto_controle' => $txt('ponto_controle'),
        'nome_beneficiario' => $nomeBeneficiario,
        'cpf' => $txt('cpf'),
        'data_nascimento' => $data('data_nascimento'),
        'estado_civil' => $txt('estado_civil'),
        'sexo' => $txt('sexo'),
        'indigena' => $bool('indigena'),
        'etnia' => $txt('etnia'),
        'possui_dap' => $txt('possui_dap'),
        'associacao_cooperativa' => $txt('associacao_cooperativa'),
        'telefone' => $txt('telefone'),
        'endereco' => $txt('endereco'),
        'nome_propriedade' => $txt('nome_propriedade'),
        'municipio' => $txt('municipio'),
        'culturas' => $json('culturas', []),
        'area_total_ha' => $num('area_total_ha'),
        'horas_maquina' => $num('horas_maquina'),
        'quantidade_acudes' => $inteiro('quantidade_acudes'),
        'pontos_geo' => $json('pontos_geo', []),
        'tipo_trator' => $txt('tipo_trator'),
        'maquinas' => $lista('maquinas'),
        'implementos' => $lista('implementos'),
        'tipo_uso' => $txt('tipo_uso'),
        'num_identificacao_patrimonio' => $txt('num_identificacao_patrimonio'),
        'daes' => (function () use ($json) {
            $v = $json('daes', []);
            return array_slice(is_array($v) ? $v : [], 0, 10);
        })(),
        'beneficiario_assinou' => $bool('beneficiario_assinou'),
        'responsavel_assinou' => $bool('responsavel_assinou'),
        'observacao' => $txt('observacao'),
        'pdf_extraido_automatico' => $bool('pdf_extraido_automatico'),
    ];

    // Mesma regra do formulário no navegador, conferida de novo aqui: quem
    // manda a requisição direto (sem passar pela tela) não engana a validação.
    if ($registro['tipo_servico'] === 'Mecanização' && count($registro['culturas']) < 1) {
        responder(400, ['ok' => false, 'erro' => 'Adicione pelo menos uma cultura para um lançamento de Mecanização.']);
    }
    if ($registro['tipo_servico'] === 'Açudagem' && (int) ($registro['quantidade_acudes'] ?? 0) < 1) {
        responder(400, ['ok' => false, 'erro' => 'Informe pelo menos 1 tanque/açude para um lançamento de Açudagem.']);
    }

    $tmp = arquivoPdfValido($_FILES['arquivo'] ?? ['error' => UPLOAD_ERR_NO_FILE]);
    if ($tmp !== null) {
        $ano = $registro['data_vistoria'] ? substr($registro['data_vistoria'], 0, 4) : date('Y');
        $nomeArquivo = $ano . '/' . bin2hex(random_bytes(8)) . '.pdf';
        $bytes = file_get_contents($tmp);
        [$statusUp] = chamarSupabase(
            $supabaseUrl, $serviceRole, 'POST',
            '/storage/v1/object/mecanizacao-formularios/' . $nomeArquivo,
            $bytes, ['Content-Type: application/pdf']
        );
        if ($statusUp >= 200 && $statusUp < 300) {
            $registro['pdf_arquivo'] = $nomeArquivo;
        }
        // Falha no upload do PDF não impede salvar o lançamento — só fica
        // sem o anexo original; a pessoa pode reenviar depois se precisar.
    }

    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'POST', '/rest/v1/mecanizacao_lancamentos',
        $registro, ['Prefer: return=representation']
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'registro' => $corpo[0] ?? $registro]);
    }
    responder(502, ['ok' => false, 'erro' => (string) ($corpo['message'] ?? $corpo['msg'] ?? 'O banco não aceitou o lançamento.')]);
}

/* =============================================================== listar === */
if ($acao === 'listar') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }

    $limite = max(1, min(100, (int) ($_POST['limite'] ?? 20)));
    $filtro = $emailConfirmado === RESPONSAVEL_EMAIL ? '' : '&criado_por_email=eq.' . urlencode($emailConfirmado);
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        '/rest/v1/mecanizacao_lancamentos?select=id,criado_em,criado_por_email,tipo_servico,nome_beneficiario,' .
        'municipio,escritorio_local,data_vistoria,area_total_ha,horas_maquina,quantidade_acudes,pdf_arquivo' .
        $filtro . '&order=criado_em.desc&limit=' . $limite
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'lancamentos' => $corpo, 'vendo_de_todos' => $emailConfirmado === RESPONSAVEL_EMAIL]);
    }
    responder(502, ['ok' => false, 'erro' => 'Não foi possível carregar os lançamentos recentes.']);
}

responder(400, ['ok' => false, 'erro' => 'Ação desconhecida.']);
