<?php
declare(strict_types=1);

/* Aba "Lançamento" do painel de mecanização: digitação de uma vistoria por
 * vez, a partir da ficha em papel, direto no banco Supabase —
 * mecanizacao_lancamentos (ver database/mecanizacao-lancamentos.sql).
 *
 * Usa a MESMA chave service_role de admin_usuarios.php (ver admin_config.php)
 * — nunca a chave publicável do navegador. O navegador nunca recebe a
 * service_role: toda gravação passa por aqui.
 *
 * Ações (multipart/form-data, campo "acao"):
 *   salvar   — grava um lançamento novo.
 *   listar   — uma página de lançamentos, com filtros (campos "f_*"). Por
 *              padrão só os da própria pessoa (login + e-mails da planilha
 *              ligados a ele); "Lançado por" mostra os de outras pessoas.
 *   tecnicos — técnicos já relacionados a cada município/escritório (conta nos lançamentos).
 *   pdf      — link temporário do PDF anexado a um lançamento.
 *   carregar — devolve UM lançamento completo, para abrir na edição/visualização.
 *   editar   — root@root.com grava as alterações direto; qualquer outra
 *              pessoa (dona do lançamento) gera um PEDIDO de edição, com
 *              motivo, que só vale depois de aprovado.
 *   excluir  — root@root.com apaga direto; os demais geram um PEDIDO de
 *              exclusão, com motivo.
 *   lancadores   — pessoas (e-mails) que já lançaram, com nome de exibição.
 *   salvar_lancador — (só root) define o nome/login de um e-mail.
 *   solicitacoes — (só root) pedidos pendentes de aprovação.
 *   resolver     — (só root) aprova ou recusa um pedido.
 *
 * Pedidos ficam em mecanizacao_solicitacoes (database/mecanizacao-solicitacoes.sql).
 *
 * Nenhuma dessas ações pede senha de administrador: quem chega até aqui já
 * passou pelo login do site (admin-gate.js), e é esse login — não uma senha
 * extra — que autoriza ler e gravar. "quem lançou" nunca vem só do que o
 * navegador afirma: todas recebem o campo "token" (a sessão do login do
 * site, admin-auth.js) e confirmam o e-mail de verdade direto no Supabase
 * (ver emailAutenticado()) — o mesmo cuidado de admin_usuarios.php.
 *
 * "carregar" e "editar" ainda conferem que quem está pedindo é o dono do
 * lançamento (criado_por_email) ou root@root.com — sem isso, bastaria
 * adivinhar/ver o id de um lançamento de outra pessoa pra editá-lo.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
date_default_timezone_set('America/Rio_Branco');

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
    $headersResposta = [];
    $opcoes = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_TIMEOUT => 25,
        // guardados pro "Content-Range" (total da contagem na paginação)
        CURLOPT_HEADERFUNCTION => function ($c, $linha) use (&$headersResposta) {
            $partes = explode(':', $linha, 2);
            if (count($partes) === 2) {
                $headersResposta[strtolower(trim($partes[0]))] = trim($partes[1]);
            }
            return strlen($linha);
        },
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
    return [$status, is_array($json) ? $json : ['_bruto' => $resposta], $headersResposta];
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
    // banco fora do ar / limite de requisições: não é sessão vencida — 503
    // faz o navegador esperar e tentar de novo em vez de pedir novo login
    if ($status === 0 || $status === 429 || $status >= 500) {
        responder(503, ['ok' => false, 'erro' => 'Não foi possível confirmar sua sessão agora (o banco não respondeu). Tente novamente em instantes.']);
    }
    $usuario = json_decode((string) $resposta, true);
    if ($status !== 200 || !is_array($usuario) || empty($usuario['email'])) {
        return null;
    }
    return strtolower((string) $usuario['email']);
}

/** Lê e valida os campos do formulário (POST), iguais em "salvar" e
 *  "editar" — só muda o método/URL da chamada ao Supabase depois. Chama
 *  responder() direto (e portanto encerra a requisição) quando algo
 *  obrigatório falta ou é inconsistente. */
function lerRegistroDoPost(string $emailConfirmado): array
{
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
    // data da vistoria e de nascimento não podem ser futuras (UTC: nunca recusa o "hoje" de quem digita no Acre)
    $hojeUtc = gmdate('Y-m-d');
    foreach (['data_vistoria' => 'A data da vistoria', 'data_nascimento' => 'A data de nascimento'] as $campoData => $rotuloData) {
        $valorData = $data($campoData);
        if ($valorData !== null && $valorData > $hojeUtc) {
            responder(400, ['ok' => false, 'erro' => $rotuloData . ' não pode ser futura.']);
        }
    }

    $registro = [
        'criado_por_email' => $emailConfirmado,
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
        'indigena' => $txt('indigena') === 'Sim',
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
        // Piscicultura é um serviço da Açudagem (não um implemento): o formulário pergunta "Sim"/"Não"
        'piscicultura' => $txt('tipo_servico') === 'Açudagem' && $txt('piscicultura') === 'Sim',
        // Destoca é um serviço da Mecanização (não um implemento): o formulário pergunta "Sim"/"Não"
        'destoca' => $txt('tipo_servico') === 'Mecanização' && $txt('destoca') === 'Sim',
        'pontos_geo' => $json('pontos_geo', []),
        'maquinas' => $lista('maquinas'),
        'implementos' => $lista('implementos'),
        'tipo_uso' => $txt('tipo_uso'),
        'num_identificacao_patrimonio' => $txt('num_identificacao_patrimonio'),
        'daes' => (function () use ($json) {
            $v = $json('daes', []);
            return array_slice(is_array($v) ? $v : [], 0, 10);
        })(),
        'observacao' => $txt('observacao'),
    ];

    // Mesma regra do formulário no navegador, conferida de novo aqui: quem
    // manda a requisição direto (sem passar pela tela) não engana a validação.
    if ($registro['tipo_servico'] === 'Mecanização' && count($registro['culturas']) < 1) {
        responder(400, ['ok' => false, 'erro' => 'Adicione pelo menos uma cultura para um lançamento de Mecanização.']);
    }
    if ($registro['tipo_servico'] === 'Açudagem' && (int) ($registro['quantidade_acudes'] ?? 0) < 1) {
        responder(400, ['ok' => false, 'erro' => 'Informe pelo menos 1 tanque/açude para um lançamento de Açudagem.']);
    }
    if ($registro['tipo_servico'] === 'Mecanização' && !in_array($txt('destoca'), ['Sim', 'Não'], true)) {
        responder(400, ['ok' => false, 'erro' => 'Informe se a Mecanização é para destoca (Sim ou Não).']);
    }
    if ($registro['tipo_servico'] === 'Açudagem' && !in_array($txt('piscicultura'), ['Sim', 'Não'], true)) {
        responder(400, ['ok' => false, 'erro' => 'Informe se a Açudagem é de piscicultura (Sim ou Não).']);
    }
    if ($registro['tipo_servico'] === 'Açudagem' && (float) ($registro['horas_maquina'] ?? 0) <= 0) {
        responder(400, ['ok' => false, 'erro' => 'Informe as horas de máquina para um lançamento de Açudagem.']);
    }
    if (in_array($registro['tipo_servico'], ['Mecanização', 'Açudagem'], true) && count($registro['maquinas']) < 1) {
        responder(400, ['ok' => false, 'erro' => 'Marque pelo menos uma máquina utilizada.']);
    }

    return $registro;
}

const BUCKET_PDF = 'mecanizacao-formularios';
const PDF_MAX_BYTES = 3 * 1024 * 1024;

/** Lê e valida o PDF anexado (campo "pdf"): no máximo 1 arquivo, só PDF, até
 *  3 MB. Devolve o conteúdo ou null quando nada foi anexado. Confere o
 *  começo do arquivo ("%PDF-"), não só a extensão que o navegador mandou. */
function lerPdfDoPost(): ?string
{
    if (!isset($_FILES['pdf']) || !is_array($_FILES['pdf']) || is_array($_FILES['pdf']['error'])) {
        return null;
    }
    $f = $_FILES['pdf'];
    if ($f['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || (int) $f['size'] > PDF_MAX_BYTES) {
        responder(400, ['ok' => false, 'erro' => 'O PDF deve ter no máximo 3 MB.']);
    }
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        responder(400, ['ok' => false, 'erro' => 'Não foi possível receber o PDF. Tente anexar de novo.']);
    }
    $conteudo = (string) file_get_contents($f['tmp_name']);
    if (strncmp($conteudo, '%PDF-', 5) !== 0) {
        responder(400, ['ok' => false, 'erro' => 'Anexe somente arquivo PDF.']);
    }
    return $conteudo;
}

/** Envia o PDF para o Storage e devolve o caminho gravado (ano/uuid.pdf). */
function enviarPdf(string $supabaseUrl, string $serviceRole, string $conteudo): string
{
    $caminho = date('Y') . '/' . bin2hex(random_bytes(16)) . '.pdf';
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'POST',
        '/storage/v1/object/' . BUCKET_PDF . '/' . $caminho,
        $conteudo, ['Content-Type: application/pdf']
    );
    if ($status < 200 || $status >= 300) {
        responder(502, ['ok' => false, 'erro' => 'Não foi possível guardar o PDF: ' . (string) ($corpo['message'] ?? $corpo['error'] ?? 'erro no armazenamento') . '.']);
    }
    return $caminho;
}

/** Já existe lançamento do mesmo CPF, do mesmo serviço e na mesma data de
 *  vistoria? Um produtor pode ter vários lançamentos de Mecanização ou
 *  Açudagem; só é repetido quando os três coincidem. $idIgnorar é o próprio
 *  lançamento, na edição. Devolve o lançamento encontrado ou null. */
function lancamentoIgual(string $supabaseUrl, string $serviceRole, string $cpf, string $tipo, string $data, string $idIgnorar = ''): ?array
{
    $digitos = preg_replace('/\D/', '', $cpf);
    $formatado = strlen($digitos) === 11
        ? substr($digitos, 0, 3) . '.' . substr($digitos, 3, 3) . '.' . substr($digitos, 6, 3) . '-' . substr($digitos, 9, 2)
        : $cpf;
    $caminho = '/rest/v1/mecanizacao_lancamentos?select=id,tipo_servico,data_vistoria,nome_beneficiario' .
        '&cpf=in.(' . urlencode('"' . $formatado . '","' . $digitos . '"') . ')' .
        '&tipo_servico=eq.' . urlencode($tipo) . '&data_vistoria=eq.' . urlencode($data) . '&limit=1';
    if ($idIgnorar !== '') {
        $caminho .= '&id=neq.' . urlencode($idIgnorar);
    }
    [$st, $corpo] = chamarSupabase($supabaseUrl, $serviceRole, 'GET', $caminho);
    return ($st >= 200 && $st < 300 && is_array($corpo) && count($corpo)) ? $corpo[0] : null;
}

/** Barra o lançamento repetido (mesmo CPF + serviço + data da vistoria). */
function recusarSeRepetido(string $supabaseUrl, string $serviceRole, array $registro, string $idIgnorar = ''): void
{
    $cpf = (string) ($registro['cpf'] ?? '');
    $tipo = (string) ($registro['tipo_servico'] ?? '');
    $data = (string) ($registro['data_vistoria'] ?? '');
    if ($cpf === '' || $tipo === '' || $data === '') {
        return;
    }
    if (lancamentoIgual($supabaseUrl, $serviceRole, $cpf, $tipo, $data, $idIgnorar) !== null) {
        responder(409, ['ok' => false, 'erro' => 'Já existe um lançamento de ' . $tipo . ' deste CPF com a mesma data de vistoria (' .
            date('d/m/Y', strtotime($data)) . '). Confira para não duplicar.']);
    }
}

/** Confere se quem está confirmado (por emailAutenticado) pode ler/editar o
 *  lançamento de dono "$criadoPorEmail": ou é a própria pessoa, ou é
 *  root@root.com. */
function podeAcessarLancamento(string $emailConfirmado, ?string $criadoPorEmail): bool
{
    return $emailConfirmado === RESPONSAVEL_EMAIL
        || in_array(strtolower((string) $criadoPorEmail), emailsDoUsuario($emailConfirmado), true);
}

/** E-mails que contam como "da pessoa logada": o próprio login mais os
 *  e-mails da planilha que o responsável ligou a esse login
 *  (mecanizacao_lancadores.usuario_email — database/mecanizacao-lancadores.sql). */
function emailsDoUsuario(string $login): array
{
    global $supabaseUrl, $serviceRole;
    static $cache = [];
    if (!isset($cache[$login])) {
        $emails = [$login];
        [$status, $corpo] = chamarSupabase(
            $supabaseUrl, $serviceRole, 'GET',
            '/rest/v1/mecanizacao_lancadores?select=email&usuario_email=eq.' . urlencode($login)
        );
        if ($status >= 200 && $status < 300 && is_array($corpo)) {
            foreach ($corpo as $l) {
                if (!empty($l['email'])) $emails[] = strtolower((string) $l['email']);
            }
        }
        $cache[$login] = array_values(array_unique($emails));
    }
    return $cache[$login];
}

/** Filtro PostgREST "criado_por_email=in.(...)" com e-mails validados. */
function filtroEmails(array $emails): string
{
    $validos = array_values(array_filter($emails, fn($e) => (bool) preg_match('/^[^\s,()"@]+@[^\s,()"@]+$/', $e)));
    if (!$validos) {
        return '&criado_por_email=eq.__nenhum__';
    }
    return '&criado_por_email=in.(' . implode(',', array_map(fn($e) => urlencode('"' . $e . '"'), $validos)) . ')';
}

/** Busca um lançamento pelo id; encerra com 404 se não existir. */
function buscarLancamento(string $supabaseUrl, string $serviceRole, string $id, string $select = '*'): array
{
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        '/rest/v1/mecanizacao_lancamentos?id=eq.' . urlencode($id) . '&select=' . $select
    );
    if ($status < 200 || $status >= 300 || !is_array($corpo) || !count($corpo)) {
        responder(404, ['ok' => false, 'erro' => 'Lançamento não encontrado.']);
    }
    return $corpo[0];
}

const TABELA_SOLICITACOES = '/rest/v1/mecanizacao_solicitacoes';

/** Motivo obrigatório dos pedidos de exclusão/edição. */
function lerMotivo(): string
{
    $motivo = trim((string) ($_POST['motivo'] ?? ''));
    if ($motivo === '') {
        responder(400, ['ok' => false, 'erro' => 'Informe o motivo da solicitação.']);
    }
    return mb_substr($motivo, 0, 1000);
}

/** Pedido pendente de um lançamento (ou null). */
function solicitacaoPendente(string $supabaseUrl, string $serviceRole, string $lancamentoId): ?array
{
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_SOLICITACOES . '?select=id,tipo,motivo,solicitado_por_email,criado_em,dados&status=eq.pendente&lancamento_id=eq.' . urlencode($lancamentoId)
    );
    return ($status >= 200 && $status < 300 && is_array($corpo) && count($corpo)) ? $corpo[0] : null;
}

/** Quantos pedidos de EDIÇÃO desta pessoa estão pendentes desde um dia anterior ao de hoje (fuso do Acre).
 *  Enquanto o responsável não aprovar/recusar, ela não lança nada novo: o pedido do dia anterior precisa
 *  ser resolvido antes. Pedidos feitos hoje não bloqueiam. O responsável nunca é bloqueado. */
function pendenciasDeDiaAnterior(string $supabaseUrl, string $serviceRole, string $email): int
{
    if ($email === RESPONSAVEL_EMAIL) {
        return 0;
    }
    $inicioHoje = (new DateTimeImmutable('today', new DateTimeZone('America/Rio_Branco')))
        ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_SOLICITACOES . '?select=id&status=eq.pendente&tipo=eq.editar&solicitado_por_email=eq.' . urlencode($email)
            . '&criado_em=lt.' . urlencode($inicioHoje)
    );
    return ($status >= 200 && $status < 300 && is_array($corpo)) ? count($corpo) : 0;
}

const MSG_BLOQUEIO_PENDENCIA = 'Você tem solicitação de alteração pendente de um dia anterior. Para fazer novos lançamentos, digite o código de liberação que o administrador vai te passar.';

/* ------------------------------------------- código de liberação (pendência) --
 * Com pedido de edição pendente de um dia anterior, a pessoa só lança depois de
 * digitar um código gerado pelo sistema (database/mecanizacao-codigos-liberacao.sql).
 * O código é aleatório e único para sempre (coluna "codigo" única, linhas nunca
 * apagadas); quem digita fica registrado com data e hora (usado_em) e a conta
 * responsável vê isso na aba de solicitações. Código usado vale pelo resto do dia
 * (Acre); no dia seguinte, se a pendência continuar, pede outro. */
const TABELA_CODIGOS = '/rest/v1/mecanizacao_codigos_liberacao';
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O/1/I: não confunde ao ler ou digitar

function normalizarCodigo($v): string
{
    return preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $v));
}

function gerarCodigo(): string
{
    $c = '';
    for ($i = 0; $i < 8; $i++) {
        $c .= ALFABETO_CODIGO[random_int(0, strlen(ALFABETO_CODIGO) - 1)];
    }
    return $c;
}

/** Já digitou um código hoje? Então a pendência não bloqueia até a virada do dia. */
function liberadoHoje(string $supabaseUrl, string $serviceRole, string $email): bool
{
    $inicioHoje = (new DateTimeImmutable('today', new DateTimeZone('America/Rio_Branco')))
        ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_CODIGOS . '?select=id&usuario_email=eq.' . urlencode($email) . '&usado_em=gte.' . urlencode($inicioHoje) . '&limit=1'
    );
    return $status >= 200 && $status < 300 && is_array($corpo) && count($corpo) > 0;
}

/** Garante que a pessoa bloqueada tenha um código aguardando ser digitado e o devolve (aparece na janela dela
 *  e na aba de solicitações do responsável). */
function garantirCodigoAberto(string $supabaseUrl, string $serviceRole, string $email): string
{
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_CODIGOS . '?select=codigo&usuario_email=eq.' . urlencode($email) . '&usado_em=is.null&limit=1'
    );
    if ($status >= 200 && $status < 300 && is_array($corpo) && count($corpo)) {
        return (string) $corpo[0]['codigo'];
    }
    for ($i = 0; $i < 5; $i++) {   // 409 = código já existiu (nunca repete): sorteia outro
        $codigo = gerarCodigo();
        [$s2] = chamarSupabase(
            $supabaseUrl, $serviceRole, 'POST', TABELA_CODIGOS,
            ['codigo' => $codigo, 'usuario_email' => $email], ['Prefer: return=minimal']
        );
        if ($s2 >= 200 && $s2 < 300) {
            return $codigo;
        }
        if ($s2 !== 409) {
            return '';
        }
    }
    return '';
}

/* Cada pendência de dia anterior dá direito a no máximo 3 códigos (3 dias). Passou disso, só o responsável
 * destrava: aprovando ou recusando os pedidos pendentes da pessoa. */
const MAX_CODIGOS = 3;
const MSG_TRAVADO = 'Você já usou os 3 códigos de liberação e ainda tem solicitação de alteração pendente. Você só volta a fazer lançamentos quando o administrador aprovar ou recusar as alterações pendentes.';

/** Situação de quem tem pedido de edição pendente de dia anterior: livre, codigo (digitar o código mostrado)
 *  ou travado (já gastou os 3 códigos). */
function situacaoBloqueio(string $supabaseUrl, string $serviceRole, string $email): array
{
    if ($email === RESPONSAVEL_EMAIL) {
        return ['estado' => 'livre'];
    }
    $inicioHoje = (new DateTimeImmutable('today', new DateTimeZone('America/Rio_Branco')))
        ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_SOLICITACOES . '?select=criado_em&status=eq.pendente&tipo=eq.editar&solicitado_por_email=' . urlencode($email)
            . '&criado_em=lt.' . urlencode($inicioHoje) . '&order=criado_em.asc&limit=1'
    );
    if (!($status >= 200 && $status < 300 && is_array($corpo) && count($corpo))) {
        return ['estado' => 'livre'];
    }
    if (liberadoHoje($supabaseUrl, $serviceRole, $email)) {
        return ['estado' => 'livre'];
    }
    [$s2, $usados] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_CODIGOS . '?select=codigo,usado_em&usuario_email=eq.' . urlencode($email)
            . '&usado_em=gte.' . urlencode((string) $corpo[0]['criado_em']) . '&order=usado_em.asc'
    );
    $n = ($s2 >= 200 && $s2 < 300 && is_array($usados)) ? count($usados) : 0;
    if ($n >= MAX_CODIGOS) {
        return ['estado' => 'travado'];
    }
    return ['estado' => 'codigo', 'codigo' => garantirCodigoAberto($supabaseUrl, $serviceRole, $email), 'restantes' => MAX_CODIGOS - $n];
}

/** Campos que o "bloqueio" responde e o "salvar" repete no erro. */
function corpoBloqueio(array $s): array
{
    $e = $s['estado'];
    return [
        'bloqueado' => $e !== 'livre', 'exige_codigo' => $e === 'codigo', 'travado' => $e === 'travado',
        'codigo' => $s['codigo'] ?? '', 'restantes' => $s['restantes'] ?? 0,
        'erro' => $e === 'travado' ? MSG_TRAVADO : ($e === 'codigo' ? MSG_BLOQUEIO_PENDENCIA : ''),
    ];
}

/** Grava um pedido de exclusão/edição pendente e encerra a requisição. */
function criarSolicitacao(string $supabaseUrl, string $serviceRole, array $lancamento, string $tipo, string $motivo, string $email, ?array $dados): void
{
    if (solicitacaoPendente($supabaseUrl, $serviceRole, (string) $lancamento['id']) !== null) {
        responder(409, ['ok' => false, 'erro' => 'Este lançamento já tem uma solicitação aguardando aprovação.']);
    }
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'POST', TABELA_SOLICITACOES,
        [
            'lancamento_id' => $lancamento['id'],
            'nome_beneficiario' => $lancamento['nome_beneficiario'] ?? null,
            'tipo' => $tipo,
            'motivo' => $motivo,
            'dados' => $dados,
            'solicitado_por_email' => $email,
        ],
        ['Prefer: return=minimal']
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'pendente' => true]);
    }
    responder(502, ['ok' => false, 'erro' => (string) ($corpo['message'] ?? $corpo['msg'] ?? 'Não foi possível registrar a solicitação.')]);
}

/** Intervalos [início, fim) de criado_em (dia do Acre, UTC-5) que batem com ano/mês/dia (0 = qualquer).
 *  Sem ano, vale cada ano desde 2023 — o PostgREST não filtra "dia/mês" de uma data sozinho. */
function intervalosDeData(int $ano, int $mes, int $dia): array
{
    $fmt = fn(int $t) => gmdate('Y-m-d\TH:i:s\Z', $t);
    $anoAtual = (int) (new DateTimeImmutable('now', new DateTimeZone('America/Rio_Branco')))->format('Y');
    $anos = $ano > 0 ? [$ano] : range(2023, max(2023, $anoAtual));
    $meses = $mes > 0 ? [$mes] : range(1, 12);
    $lista = [];
    foreach ($anos as $a) {
        foreach ($meses as $m) {
            if ($dia > 0) {
                if (!checkdate($m, $dia, $a)) continue;   // ex.: 31/02
                $ini = gmmktime(5, 0, 0, $m, $dia, $a);
                $lista[] = [$fmt($ini), $fmt($ini + 86400)];
            } else {
                $lista[] = [$fmt(gmmktime(5, 0, 0, $m, 1, $a)), $fmt(gmmktime(5, 0, 0, $m + 1, 1, $a))];
            }
        }
    }
    return $lista;
}

/** Filtro "só com alteração pendente": lançamentos que têm pedido de EDIÇÃO aguardando aprovação. */
function filtroSoPendentes(string $supabaseUrl, string $serviceRole): string
{
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_SOLICITACOES . '?select=lancamento_id&status=eq.pendente&tipo=eq.editar&lancamento_id=not.is.null&limit=1000'
    );
    $ids = [];
    if ($status >= 200 && $status < 300 && is_array($corpo)) {
        foreach ($corpo as $p) {
            if (!empty($p['lancamento_id'])) $ids[] = (string) $p['lancamento_id'];
        }
    }
    return $ids ? '&id=in.(' . implode(',', array_map('urlencode', $ids)) . ')' : '&id=eq.00000000-0000-0000-0000-000000000000';
}

/** Filtros da lista (campos "f_*" do POST) no formato de query do
 *  PostgREST. Texto livre perde os caracteres que o PostgREST usa como
 *  sintaxe (vírgula, parênteses, asterisco) antes de entrar no filtro. */
function filtrosDaLista(array $emailsDoLogin, bool $veTodos = false): string
{
    $f = function (string $c) { return trim((string) ($_POST[$c] ?? '')); };
    $livre = function (string $v) { return trim(preg_replace('/[,()*:"\\\\]/u', ' ', $v)); };
    $q = '';
    if (($busca = $livre($f('f_busca'))) !== '') {
        $termo = urlencode('*' . $busca . '*');
        $q .= '&or=(nome_beneficiario.ilike.' . $termo . ',cpf.ilike.' . $termo . ')';
    }
    foreach (['f_tipo_servico' => 'tipo_servico', 'f_municipio' => 'municipio', 'f_escritorio' => 'escritorio_local'] as $campo => $coluna) {
        if (($v = $f($campo)) !== '') {
            $q .= '&' . $coluna . '=eq.' . urlencode($v);
        }
    }
    if (preg_match('/^\d{4}$/', $f('f_ano'))) {
        $ano = (int) $f('f_ano');
        $q .= '&criado_em=gte.' . urlencode($ano . '-01-01T00:00:00-05:00') . '&criado_em=lt.' . urlencode(($ano + 1) . '-01-01T00:00:00-05:00');
    }
    // Dia e/ou mês da inserção (junto com o ano, se escolhido)
    $mes = (int) $f('f_mes');
    $dia = (int) $f('f_dia');
    $mes = ($mes >= 1 && $mes <= 12) ? $mes : 0;
    $dia = ($dia >= 1 && $dia <= 31) ? $dia : 0;
    if ($mes > 0 || $dia > 0) {
        $ints = intervalosDeData(preg_match('/^\d{4}$/', $f('f_ano')) ? (int) $f('f_ano') : 0, $mes, $dia);
        if (!$ints) {
            $q .= '&id=eq.00000000-0000-0000-0000-000000000000';   // data inexistente: nada bate
        } else {
            $q .= '&and=(or(' . implode(',', array_map(
                fn($i) => 'and(criado_em.gte.' . urlencode($i[0]) . ',criado_em.lt.' . urlencode($i[1]) . ')', $ints
            )) . '))';
        }
    }
    // "Lançado por": só o responsável (root) escolhe "todos" ou outra pessoa
    // (vários e-mails podem ter o mesmo nome). Todos os demais veem apenas os
    // próprios lançamentos, seja qual for o valor enviado.
    $pessoa = $veTodos ? $f('f_pessoa') : '';
    if ($pessoa === '') {
        $q .= filtroEmails($emailsDoLogin);
    } elseif ($pessoa !== 'todos') {
        $q .= filtroEmails(array_map('strtolower', array_map('trim', explode(',', $pessoa))));
    }
    return $q;
}


/* ============================================================== painel === */
/* O painel da mecanização lê os lançamentos direto daqui (mesma regra da ação
 * "painel" da Edge Function). Formato idêntico ao de data/mecanizacao.json, só
 * com o que os gráficos usam — sem CPF, telefone ou nascimento. Não exige login:
 * é o que a versão pública do painel também lê. */
if ($acao === 'painel') {
    $NI = 'Não informado';
    // endereço e link do formulário digitalizado: só para quem está logado
    $logado = emailAutenticado($supabaseUrl, $serviceRole) !== null;
    $ou = function ($v, string $padrao = 'Não informado') {
        return is_string($v) && trim($v) !== '' ? trim($v) : $padrao;
    };
    $numero = function ($v) { return is_numeric($v) ? (float) $v : 0.0; };
    $listaTxt = function ($v) {
        return is_array($v) ? array_values(array_filter(array_map('strval', $v), function ($x) { return $x !== ''; })) : [];
    };

    $nomes = [];
    [$stN, $ln] = chamarSupabase($supabaseUrl, $serviceRole, 'GET', '/rest/v1/mecanizacao_lancadores?select=email,nome');
    if ($stN >= 200 && $stN < 300 && is_array($ln)) {
        foreach ($ln as $x) {
            $e = strtolower(trim((string) ($x['email'] ?? '')));
            $n = trim((string) ($x['nome'] ?? ''));
            if ($e !== '' && $n !== '') $nomes[$e] = $n;
        }
    }
    $sugerido = function (string $email) {
        $u = preg_replace('/\d+/', ' ', explode('@', $email)[0]);
        $u = trim(preg_replace('/[._-]+/', ' ', $u));
        return $u === '' ? $email : implode(' ', array_map(function ($p) { return mb_strtoupper(mb_substr($p, 0, 1)) . mb_substr($p, 1); }, preg_split('/\s+/', $u)));
    };

    $campos = 'id,criado_em,criado_por_email,tipo_servico,data_vistoria,escritorio_local,responsavel_tecnico,' .
        'nome_beneficiario,sexo,estado_civil,possui_dap,associacao_cooperativa,endereco,nome_propriedade,municipio,' .
        'culturas,area_total_ha,horas_maquina,quantidade_acudes,pontos_geo,tipo_uso,maquinas,implementos,daes,' .
        'observacao,formulario_url,piscicultura,destoca';
    $registros = [];
    $semGeo = $semForm = $outroAno = 0;
    $produtores = [];
    $tam = 1000;
    for ($pagina = 0; $pagina < 100; $pagina++) {
        [$st, $corpo] = chamarSupabase($supabaseUrl, $serviceRole, 'GET',
            '/rest/v1/mecanizacao_lancamentos?select=' . $campos .
            '&order=criado_em.asc,id.asc&limit=' . $tam . '&offset=' . ($pagina * $tam));
        if ($st < 200 || $st >= 300 || !is_array($corpo)) {
            responder(502, ['ok' => false, 'erro' => 'Não foi possível ler os lançamentos.']);
        }
        foreach ($corpo as $l) {
            $criado = strtotime((string) ($l['criado_em'] ?? ''));
            $d = gmdate('Y-m-d', ($criado ?: time()) - 5 * 3600);   // Rio Branco: UTC-5, sem horário de verão
            $email = strtolower(trim((string) ($l['criado_por_email'] ?? '')));
            $sexo = (string) ($l['sexo'] ?? '');
            $cult = [];
            foreach ((is_array($l['culturas'] ?? null) ? $l['culturas'] : []) as $c) {
                $nome = trim((string) ($c['cultura'] ?? ''));
                if ($nome !== '') $cult[] = [$nome, $numero($c['area_ha'] ?? 0), trim((string) ($c['sistema_cultivo'] ?? ''))];
            }
            $dae = 0.0;
            foreach ((is_array($l['daes'] ?? null) ? $l['daes'] : []) as $x) $dae += $numero($x['valor'] ?? 0);
            $dv = is_string($l['data_vistoria'] ?? null) ? $l['data_vistoria'] : '';
            $prod = $ou($l['nome_beneficiario'] ?? null);
            $form = $logado && is_string($l['formulario_url'] ?? null) ? $l['formulario_url'] : '';
            if (empty($l['pontos_geo'])) $semGeo++;
            // coordenadas (UTM WGS84) só para quem está logado: é a localização da propriedade
            $geo = [];
            if ($logado && is_array($l['pontos_geo'] ?? null)) {
                foreach ($l['pontos_geo'] as $pt) {
                    if (!is_array($pt)) continue;
                    $gx = $numero($pt['x'] ?? 0); $gy = $numero($pt['y'] ?? 0); $gz = (int) $numero($pt['zona'] ?? 0);
                    if ($gx > 0 && $gy > 0) $geo[] = [$gx, $gy, $gz];
                }
            }
            if ($form === '' && $logado) $semForm++;
            if ($dv !== '' && substr($dv, 0, 4) !== substr($d, 0, 4)) $outroAno++;
            $produtores[mb_strtolower(preg_replace('/\s+/', ' ', trim($prod)))] = true;
            $registros[] = [
                'd' => $d, 'h' => gmdate('H:i', ($criado ?: time()) - 5 * 3600), 'ex' => substr($d, 0, 4), 'dv' => $dv,
                'pc' => $ou($l['tipo_servico'] ?? null), 'mun' => $ou($l['municipio'] ?? null),
                'esc' => $ou($l['escritorio_local'] ?? null), 'rt' => $ou($l['responsavel_tecnico'] ?? null),
                'alim' => $email !== '' ? ($nomes[$email] ?? $sugerido($email)) : $NI,
                'prod' => $prod,
                'sexo' => preg_match('/^f/i', $sexo) ? 'Feminino' : (preg_match('/^m/i', $sexo) ? 'Masculino' : $NI),
                'ec' => $ou($l['estado_civil'] ?? null), 'dap' => $ou($l['possui_dap'] ?? null),
                'assoc' => $ou($l['associacao_cooperativa'] ?? null),
                'loc' => $logado ? $ou($l['endereco'] ?? null, '') : '', 'propr' => $ou($l['nome_propriedade'] ?? null, ''),
                'cult' => $cult,
                'ha' => $numero($l['area_total_ha'] ?? 0), 'hrs' => $numero($l['horas_maquina'] ?? 0),
                'ac' => (int) $numero($l['quantidade_acudes'] ?? 0),
                'pisc' => ($l['piscicultura'] ?? false) === true,
                'dest' => ($l['destoca'] ?? false) === true,
                'tt' => $ou($l['tipo_uso'] ?? null),
                'maq' => $listaTxt($l['maquinas'] ?? null), 'impl' => $listaTxt($l['implementos'] ?? null),
                'dae' => $dae, 'form' => $form, 'obs' => $ou($l['observacao'] ?? null, ''),
            ] + ($geo ? ['geo' => $geo] : []) + ($logado && !empty($l['id']) ? ['id' => (string) $l['id']] : []);
        }
        if (count($corpo) < $tam) break;
    }
    $n = count($registros);
    responder(200, [
        'ok' => true,
        'meta' => [
            'fonte' => 'lancamentos', 'arquivo' => 'lançamentos do sistema', 'aba' => 'mecanizacao_lancamentos',
            'gerado_em' => date('d/m/Y H:i'), 'registros' => $n, 'produtores' => count($produtores),
            'periodo' => $n ? [$registros[0]['d'], $registros[$n - 1]['d']] : ['', ''],
            'qualidade' => ['sem_data_valida' => 0, 'vistoria_outro_ano' => $outroAno, 'sem_geo' => $semGeo,
                'sem_formulario' => $semForm, 'acudes_texto' => 0],
        ],
        'registros' => $registros,
    ]);
}

/* ============================================================== bloqueio === */
/* A tela consulta antes de abrir o formulário, para avisar já no botão "Novo relatório". */
if ($acao === 'bloqueio') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    responder(200, ['ok' => true] + corpoBloqueio(situacaoBloqueio($supabaseUrl, $serviceRole, $emailConfirmado)));
}

/* ================================================================ liberar === */
/* A pessoa digita o código de liberação: vale uma vez só e fica registrado com a hora. */
if ($acao === 'liberar') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    $codigo = normalizarCodigo($_POST['codigo'] ?? '');
    if ($codigo === '') {
        responder(400, ['ok' => false, 'erro' => 'Digite o código de liberação.']);
    }
    if (situacaoBloqueio($supabaseUrl, $serviceRole, $emailConfirmado)['estado'] === 'travado') {
        responder(403, ['ok' => false, 'travado' => true, 'erro' => MSG_TRAVADO]);
    }
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'PATCH',
        TABELA_CODIGOS . '?codigo=eq.' . urlencode($codigo) . '&usuario_email=eq.' . urlencode($emailConfirmado) . '&usado_em=is.null',
        ['usado_em' => gmdate('Y-m-d\TH:i:s\Z')], ['Prefer: return=representation']
    );
    if ($status >= 200 && $status < 300 && is_array($corpo) && count($corpo)) {
        responder(200, ['ok' => true]);
    }
    responder(403, ['ok' => false, 'erro' => 'Código inválido ou já utilizado.']);
}

/* ================================================================ codigos === */
/* Só a conta responsável: códigos gerados e quem já digitou (e quando). */
if ($acao === 'codigos') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    if ($emailConfirmado !== RESPONSAVEL_EMAIL) {
        responder(403, ['ok' => false, 'erro' => 'Só a conta responsável vê os códigos de liberação.']);
    }
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_CODIGOS . '?select=codigo,usuario_email,criado_em,usado_em&order=criado_em.desc&limit=200'
    );
    if ($status >= 200 && $status < 300 && is_array($corpo)) {
        // quem já gastou os 3 códigos e continua com pedido pendente: o responsável precisa aprovar/recusar
        $inicioHoje = (new DateTimeImmutable('today', new DateTimeZone('America/Rio_Branco')))
            ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
        [$sp, $pend] = chamarSupabase(
            $supabaseUrl, $serviceRole, 'GET',
            TABELA_SOLICITACOES . '?select=solicitado_por_email,criado_em&status=eq.pendente&tipo=eq.editar&criado_em=lt.'
                . urlencode($inicioHoje) . '&order=criado_em.asc'
        );
        $desde = [];
        if ($sp >= 200 && $sp < 300 && is_array($pend)) {
            foreach ($pend as $p) {
                $e = strtolower((string) ($p['solicitado_por_email'] ?? ''));
                if ($e !== '' && !isset($desde[$e])) {
                    $desde[$e] = (string) $p['criado_em'];
                }
            }
        }
        $travados = [];
        foreach ($desde as $e => $d) {
            $n = 0;
            foreach ($corpo as $x) {
                if (strtolower((string) $x['usuario_email']) === $e && !empty($x['usado_em']) && (string) $x['usado_em'] >= $d) {
                    $n++;
                }
            }
            if ($n >= MAX_CODIGOS) {
                $travados[] = ['usuario_email' => $e, 'desde' => $d, 'usos' => $n];
            }
        }
        responder(200, ['ok' => true, 'codigos' => $corpo, 'travados' => $travados]);
    }
    responder(502, ['ok' => false, 'erro' => 'Não foi possível carregar os códigos. Confira se database/mecanizacao-codigos-liberacao.sql já foi executado.']);
}

/* =============================================================== salvar === */
if ($acao === 'salvar') {
    // Sem senha de administrador para gravar, o login do site é a única
    // barreira que resta — por isso aqui ele é obrigatório (diferente do
    // e-mail confirmado ser só "o que manda quando existe" como antes).
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }

    $situacao = situacaoBloqueio($supabaseUrl, $serviceRole, $emailConfirmado);
    if ($situacao['estado'] !== 'livre') {
        responder(403, ['ok' => false] + corpoBloqueio($situacao));
    }

    $registro = lerRegistroDoPost($emailConfirmado);
    recusarSeRepetido($supabaseUrl, $serviceRole, $registro);

    // PDF opcional da ficha: validado antes de gravar o lançamento.
    $pdf = lerPdfDoPost();
    if ($pdf !== null) {
        $registro['pdf_arquivo'] = enviarPdf($supabaseUrl, $serviceRole, $pdf);
    }

    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'POST', '/rest/v1/mecanizacao_lancamentos',
        $registro, ['Prefer: return=representation']
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'registro' => $corpo[0] ?? $registro]);
    }
    // o lançamento não entrou: não deixa o PDF órfão no Storage
    if (isset($registro['pdf_arquivo'])) {
        chamarSupabase($supabaseUrl, $serviceRole, 'DELETE', '/storage/v1/object/' . BUCKET_PDF . '/' . $registro['pdf_arquivo']);
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
    $pagina = max(1, (int) ($_POST['pagina'] ?? 1));
    // Cada pessoa vê apenas os lançamentos que ela mesma fez; só o
    // responsável (root) enxerga os dos outros.
    $meusEmails = emailsDoUsuario($emailConfirmado);
    $filtro = filtrosDaLista($meusEmails, $emailConfirmado === RESPONSAVEL_EMAIL);
    if (trim((string) ($_POST['f_pendente'] ?? '')) === '1') {
        $filtro .= filtroSoPendentes($supabaseUrl, $serviceRole);
    }
    // Padrão: mais recente primeiro. A tela pode ordenar por outra coluna (só as da lista abaixo).
    $colunasOrdenaveis = ['criado_em', 'tipo_servico', 'nome_beneficiario', 'municipio', 'escritorio_local', 'data_vistoria',
        'area_total_ha', 'horas_maquina', 'quantidade_acudes', 'criado_por_email'];
    $colunaOrdem = in_array((string) ($_POST['ordem'] ?? ''), $colunasOrdenaveis, true) ? (string) $_POST['ordem'] : 'criado_em';
    $sentidoOrdem = (string) ($_POST['dir'] ?? '') === 'asc' ? 'asc' : 'desc';
    [$status, $corpo, $headersResp] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        '/rest/v1/mecanizacao_lancamentos?select=id,criado_em,criado_por_email,tipo_servico,nome_beneficiario,' .
        'municipio,escritorio_local,data_vistoria,area_total_ha,horas_maquina,quantidade_acudes' .
        $filtro . '&order=' . $colunaOrdem . '.' . $sentidoOrdem . '.nullslast,id.desc&limit=' . $limite . '&offset=' . (($pagina - 1) * $limite),
        null, ['Prefer: count=exact']
    );
    // 416 = página além do fim (o filtro encolheu ou a última linha da
    // página foi excluída): lista vazia com o total, e a tela volta pra
    // última página que existe.
    if ($status === 416) {
        $status = 200;
        $corpo = [];
    }
    if ($status >= 200 && $status < 300) {
        // "Content-Range: 0-19/3616" → total de linhas que batem com o filtro
        $total = preg_match('#/(\d+)$#', (string) ($headersResp['content-range'] ?? ''), $m) ? (int) $m[1] : count($corpo);
        // Pedidos pendentes das linhas listadas (lancamento_id → tipo), pra
        // tela mostrar "aguardando aprovação" e não deixar pedir de novo.
        // Se a tabela de pedidos ainda não existir, a lista sai sem isso.
        $pendencias = [];
        $ids = array_filter(array_map(fn($l) => (string) ($l['id'] ?? ''), is_array($corpo) ? $corpo : []));
        if ($ids) {
            [$stPend, $pend] = chamarSupabase(
                $supabaseUrl, $serviceRole, 'GET',
                TABELA_SOLICITACOES . '?select=lancamento_id,tipo&status=eq.pendente&lancamento_id=in.(' . implode(',', array_map('urlencode', $ids)) . ')'
            );
            if ($stPend >= 200 && $stPend < 300 && is_array($pend)) {
                foreach ($pend as $p) {
                    if (isset($p['lancamento_id'])) $pendencias[(string) $p['lancamento_id']] = $p['tipo'];
                }
            }
        }
        responder(200, [
            'ok' => true, 'lancamentos' => $corpo, 'pendencias' => (object) $pendencias,
            'total' => $total, 'pagina' => $pagina, 'limite' => $limite, 'meus_emails' => $meusEmails,
            'vendo_de_todos' => $emailConfirmado === RESPONSAVEL_EMAIL,
        ]);
    }
    responder(502, ['ok' => false, 'erro' => 'Não foi possível carregar os lançamentos recentes.']);
}

/* =========================================================== duplicado === */
if ($acao === 'duplicado') {
    if (emailAutenticado($supabaseUrl, $serviceRole) === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    $cpf = trim((string) ($_POST['cpf'] ?? ''));
    $tipo = trim((string) ($_POST['tipo_servico'] ?? ''));
    $data = trim((string) ($_POST['data_vistoria'] ?? ''));
    if (!preg_match('/^\d{3}\.\d{3}\.\d{3}-\d{2}$/', $cpf) || $tipo === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) {
        responder(400, ['ok' => false, 'erro' => 'Informe CPF, serviço e data da vistoria.']);
    }
    $igual = lancamentoIgual($supabaseUrl, $serviceRole, $cpf, $tipo, $data, (string) ($_POST['id'] ?? ''));
    responder(200, ['ok' => true, 'itens' => $igual === null ? [] : [$igual]]);
}

/* ============================================================ tecnicos === */
if ($acao === 'tecnicos') {
    if (emailAutenticado($supabaseUrl, $serviceRole) === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    // técnico x município x escritório, contados nos lançamentos do banco
    $contagem = [];
    $maquinas = $implementos = [];   // nome => quantos lançamentos usaram
    // cultura => sistema de cultivo => quantos lançamentos usaram essa combinação
    // (sugere o sistema de cultivo sozinho quando a pessoa escolhe a cultura)
    $culturas = [];
    // máquina => uso (Agrícola/Não agrícola) => quantos lançamentos com essa
    // máquina marcaram esse uso (sugere o uso sozinho ao marcar a máquina)
    $usoMaquinas = [];
    $tam = 1000;
    for ($pagina = 0; $pagina < 100; $pagina++) {
        [$st, $corpo] = chamarSupabase($supabaseUrl, $serviceRole, 'GET',
            '/rest/v1/mecanizacao_lancamentos?select=municipio,escritorio_local,responsavel_tecnico,maquinas,implementos,culturas,tipo_uso' .
            '&order=id.asc&limit=' . $tam . '&offset=' . ($pagina * $tam));
        if ($st < 200 || $st >= 300 || !is_array($corpo)) {
            responder(502, ['ok' => false, 'erro' => 'Não foi possível ler os técnicos.']);
        }
        foreach ($corpo as $l) {
            foreach (['maquinas' => &$maquinas, 'implementos' => &$implementos] as $campo => &$destino) {
                foreach ((is_array($l[$campo] ?? null) ? $l[$campo] : []) as $nome) {
                    $nome = trim((string) $nome);
                    if ($nome !== '') $destino[$nome] = ($destino[$nome] ?? 0) + 1;
                }
            }
            unset($destino);
            foreach ((is_array($l['culturas'] ?? null) ? $l['culturas'] : []) as $c) {
                $nome = trim((string) ($c['cultura'] ?? ''));
                $sistema = trim((string) ($c['sistema_cultivo'] ?? ''));
                if ($nome === '' || $sistema === '') continue;
                if (!isset($culturas[$nome])) $culturas[$nome] = [];
                $culturas[$nome][$sistema] = ($culturas[$nome][$sistema] ?? 0) + 1;
            }
            $uso = trim((string) ($l['tipo_uso'] ?? ''));
            if ($uso !== '') {
                foreach ((is_array($l['maquinas'] ?? null) ? $l['maquinas'] : []) as $nomeMaq) {
                    $nomeMaq = trim((string) $nomeMaq);
                    if ($nomeMaq === '') continue;
                    if (!isset($usoMaquinas[$nomeMaq])) $usoMaquinas[$nomeMaq] = [];
                    $usoMaquinas[$nomeMaq][$uso] = ($usoMaquinas[$nomeMaq][$uso] ?? 0) + 1;
                }
            }
            $m = trim((string) ($l['municipio'] ?? ''));
            $e = trim((string) ($l['escritorio_local'] ?? ''));
            $t = trim(preg_replace('/\s+/', ' ', (string) ($l['responsavel_tecnico'] ?? '')));
            if ($m === '' || $t === '') continue;
            $k = $m . "\x1f" . $e . "\x1f" . $t;
            $contagem[$k] = ($contagem[$k] ?? 0) + 1;
        }
        if (count($corpo) < $tam) break;
    }
    $itens = [];
    foreach ($contagem as $k => $n) {
        [$m, $e, $t] = explode("\x1f", $k);
        $itens[] = ['m' => $m, 'e' => $e, 't' => $t, 'n' => $n];
    }
    responder(200, ['ok' => true, 'itens' => $itens, 'maquinas' => $maquinas, 'implementos' => $implementos, 'culturas' => $culturas, 'uso_maquinas' => $usoMaquinas]);
}

/* ================================================================== pdf === */
if ($acao === 'pdf') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    $id = (string) ($_POST['id'] ?? '');
    if ($id === '') {
        responder(400, ['ok' => false, 'erro' => 'Informe o lançamento.']);
    }
    $linha = buscarLancamento($supabaseUrl, $serviceRole, $id, 'id,pdf_arquivo');
    $arquivo = (string) ($linha['pdf_arquivo'] ?? '');
    if ($arquivo === '') {
        responder(404, ['ok' => false, 'erro' => 'Este lançamento não tem PDF anexado.']);
    }
    // link temporário (5 min): o bucket é privado
    [$st, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'POST',
        '/storage/v1/object/sign/' . BUCKET_PDF . '/' . $arquivo, ['expiresIn' => 300]
    );
    $assinado = (string) ($corpo['signedURL'] ?? $corpo['signedUrl'] ?? '');
    if ($st < 200 || $st >= 300 || $assinado === '') {
        responder(502, ['ok' => false, 'erro' => 'Não foi possível abrir o PDF.']);
    }
    responder(200, ['ok' => true, 'url' => $supabaseUrl . '/storage/v1' . $assinado]);
}

/* ============================================================= carregar === */
if ($acao === 'carregar') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    $id = (string) ($_POST['id'] ?? '');
    if ($id === '') {
        responder(400, ['ok' => false, 'erro' => 'Informe o lançamento a abrir.']);
    }
    // Ver e editar: só o dono ou o responsável.
    $linha = buscarLancamento($supabaseUrl, $serviceRole, $id);
    if (!podeAcessarLancamento($emailConfirmado, $linha['criado_por_email'] ?? null)) {
        responder(403, ['ok' => false, 'erro' => 'Você só pode ver os lançamentos que você mesmo fez.']);
    }
    responder(200, [
        'ok' => true, 'lancamento' => $linha,
        'eh_responsavel' => $emailConfirmado === RESPONSAVEL_EMAIL,
        'pode_editar' => podeAcessarLancamento($emailConfirmado, $linha['criado_por_email'] ?? null),
        'pendente' => solicitacaoPendente($supabaseUrl, $serviceRole, $id),
    ]);
}

/* =============================================================== editar === */
if ($acao === 'editar') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    $id = (string) ($_POST['id'] ?? '');
    if ($id === '') {
        responder(400, ['ok' => false, 'erro' => 'Informe o lançamento a editar.']);
    }
    $atual = buscarLancamento($supabaseUrl, $serviceRole, $id, 'id,criado_por_email,nome_beneficiario');
    if (!podeAcessarLancamento($emailConfirmado, $atual['criado_por_email'] ?? null)) {
        responder(403, ['ok' => false, 'erro' => 'Você só pode editar os lançamentos que você mesmo fez.']);
    }

    // Edição não troca quem lançou originalmente — o e-mail confirmado aqui
    // só serve pra validar o acesso acima, lerRegistroDoPost recebe o dono
    // de antes.
    $registro = lerRegistroDoPost((string) $atual['criado_por_email']);
    recusarSeRepetido($supabaseUrl, $serviceRole, $registro, $id);

    // Quem não é o responsável não grava direto: vira pedido pendente.
    if ($emailConfirmado !== RESPONSAVEL_EMAIL) {
        criarSolicitacao($supabaseUrl, $serviceRole, $atual, 'editar', lerMotivo(), $emailConfirmado, $registro);
    }

    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'PATCH', '/rest/v1/mecanizacao_lancamentos?id=eq.' . urlencode($id),
        $registro, ['Prefer: return=representation']
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'registro' => $corpo[0] ?? $registro]);
    }
    responder(502, ['ok' => false, 'erro' => (string) ($corpo['message'] ?? $corpo['msg'] ?? 'O banco não aceitou a edição.')]);
}

/* ============================================================== excluir === */
if ($acao === 'excluir') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    $id = (string) ($_POST['id'] ?? '');
    if ($id === '') {
        responder(400, ['ok' => false, 'erro' => 'Informe o lançamento a excluir.']);
    }
    // Só a conta responsável exclui direto — os demais (donos do lançamento)
    // abrem um pedido de exclusão com motivo.
    if ($emailConfirmado !== RESPONSAVEL_EMAIL) {
        $atual = buscarLancamento($supabaseUrl, $serviceRole, $id, 'id,criado_por_email,nome_beneficiario');
        if (!podeAcessarLancamento($emailConfirmado, $atual['criado_por_email'] ?? null)) {
            responder(403, ['ok' => false, 'erro' => 'Você só pode solicitar a exclusão dos lançamentos que você mesmo fez.']);
        }
        criarSolicitacao($supabaseUrl, $serviceRole, $atual, 'excluir', lerMotivo(), $emailConfirmado, null);
    }
    [$status] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'DELETE', '/rest/v1/mecanizacao_lancamentos?id=eq.' . urlencode($id)
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true]);
    }
    responder(502, ['ok' => false, 'erro' => 'Não foi possível excluir.']);
}

/* ========================================================= solicitacoes === */
if ($acao === 'solicitacoes') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    if ($emailConfirmado !== RESPONSAVEL_EMAIL) {
        responder(403, ['ok' => false, 'erro' => 'Só a conta responsável vê as solicitações.']);
    }
    // lancamento:... embute o registro atual (FK lancamento_id), pra tela
    // comparar com os dados propostos num pedido de edição.
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_SOLICITACOES . '?select=*,lancamento:mecanizacao_lancamentos(*)&status=eq.pendente&order=criado_em.asc'
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true, 'solicitacoes' => $corpo]);
    }
    responder(502, ['ok' => false, 'erro' => 'Não foi possível carregar as solicitações. Confira se database/mecanizacao-solicitacoes.sql já foi executado.']);
}

/* ============================================================ lancadores === */
/* Todas as pessoas (e-mails) que já lançaram, com o nome de exibição e o
 * login ligado. Qualquer pessoa logada recebe (é o filtro "Lançado por");
 * só o responsável recebe também a lista de logins do sistema, para ligar. */
if ($acao === 'lancadores') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        '/rest/v1/mecanizacao_lancadores_resumo?select=email,total,ultimo,nome,usuario_email,tecnico,municipio,municipios,municipio_definido&order=email.asc'
    );
    if ($status < 200 || $status >= 300) {
        responder(502, ['ok' => false, 'erro' => 'Não foi possível carregar as pessoas. Confira se database/mecanizacao-lancadores.sql já foi executado.']);
    }
    $resposta = ['ok' => true, 'lancadores' => $corpo, 'meus_emails' => emailsDoUsuario($emailConfirmado)];
    if ($emailConfirmado === RESPONSAVEL_EMAIL) {
        [$stU, $usuarios] = chamarSupabase($supabaseUrl, $serviceRole, 'GET', '/auth/v1/admin/users?per_page=1000');
        $resposta['usuarios'] = $stU >= 200 && $stU < 300
            ? array_values(array_map(fn($u) => strtolower((string) ($u['email'] ?? '')), $usuarios['users'] ?? []))
            : [];
    }
    responder(200, $resposta);
}

/* ======================================================= salvar_lancador === */
if ($acao === 'salvar_lancador') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    if ($emailConfirmado !== RESPONSAVEL_EMAIL) {
        responder(403, ['ok' => false, 'erro' => 'Só a conta responsável define os nomes.']);
    }
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    if ($email === '') {
        responder(400, ['ok' => false, 'erro' => 'Informe o e-mail.']);
    }
    $nome = trim((string) ($_POST['nome'] ?? ''));
    $usuario = strtolower(trim((string) ($_POST['usuario_email'] ?? '')));
    $registro = [
        'email' => $email,
        'nome' => $nome === '' ? null : mb_substr($nome, 0, 120),
        'usuario_email' => $usuario === '' ? null : $usuario,
        'atualizado_em' => gmdate('c'),
        'atualizado_por' => $emailConfirmado,
    ];
    // município só muda quando vem no pedido (vazio = volta ao automático)
    if (array_key_exists('municipio', $_POST)) {
        $municipio = trim((string) $_POST['municipio']);
        $registro['municipio'] = $municipio === '' ? null : mb_substr($municipio, 0, 80);
    }
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'POST', '/rest/v1/mecanizacao_lancadores?on_conflict=email',
        $registro,
        ['Prefer: resolution=merge-duplicates,return=minimal']
    );
    if ($status < 200 || $status >= 300) {
        responder(502, ['ok' => false, 'erro' => (string) ($corpo['message'] ?? 'Não foi possível salvar.')]);
    }
    // Município definido vale também para TODAS as fichas desse e-mail
    // (vazio desfaz, devolvendo o município original de cada ficha) —
    // mecanizacao_definir_municipio em database/mecanizacao-lancadores.sql.
    $fichas = null;
    if (array_key_exists('municipio', $registro)) {
        [$stM, $corpoM] = chamarSupabase(
            $supabaseUrl, $serviceRole, 'POST', '/rest/v1/rpc/mecanizacao_definir_municipio',
            ['p_email' => $email, 'p_municipio' => $registro['municipio']]
        );
        if ($stM < 200 || $stM >= 300) {
            responder(502, ['ok' => false, 'erro' => 'O nome foi salvo, mas não foi possível mudar o município das fichas.']);
        }
        $fichas = is_numeric($corpoM['_bruto'] ?? null) ? (int) $corpoM['_bruto'] : (is_int($corpoM) ? $corpoM : null);
    }
    responder(200, ['ok' => true, 'fichas_alteradas' => $fichas]);
}

/* ============================================================= resolver === */
if ($acao === 'resolver') {
    $emailConfirmado = emailAutenticado($supabaseUrl, $serviceRole);
    if ($emailConfirmado === null) {
        responder(401, ['ok' => false, 'erro' => 'Sua sessão do site expirou. Recarregue a página e entre de novo.']);
    }
    if ($emailConfirmado !== RESPONSAVEL_EMAIL) {
        responder(403, ['ok' => false, 'erro' => 'Só a conta responsável aprova solicitações.']);
    }
    $id = (string) ($_POST['id'] ?? '');
    $decisao = (string) ($_POST['decisao'] ?? '');
    if ($id === '' || !in_array($decisao, ['aprovar', 'recusar'], true)) {
        responder(400, ['ok' => false, 'erro' => 'Solicitação ou decisão inválida.']);
    }
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        TABELA_SOLICITACOES . '?select=*&status=eq.pendente&id=eq.' . urlencode($id)
    );
    if ($status < 200 || $status >= 300 || !is_array($corpo) || !count($corpo)) {
        responder(404, ['ok' => false, 'erro' => 'Solicitação não encontrada ou já resolvida.']);
    }
    $sol = $corpo[0];

    // Aprovar aplica o pedido no lançamento (apaga ou grava os dados
    // propostos); recusar só marca o pedido. Lançamento já apagado
    // (lancamento_id nulo) não tem o que aplicar.
    if ($decisao === 'aprovar' && !empty($sol['lancamento_id'])) {
        $alvo = '/rest/v1/mecanizacao_lancamentos?id=eq.' . urlencode((string) $sol['lancamento_id']);
        if ($sol['tipo'] === 'excluir') {
            [$st] = chamarSupabase($supabaseUrl, $serviceRole, 'DELETE', $alvo);
        } else {
            [$st] = chamarSupabase($supabaseUrl, $serviceRole, 'PATCH', $alvo, (array) $sol['dados'], ['Prefer: return=minimal']);
        }
        if ($st < 200 || $st >= 300) {
            responder(502, ['ok' => false, 'erro' => 'Não foi possível aplicar a solicitação no lançamento.']);
        }
    }

    [$st] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'PATCH', TABELA_SOLICITACOES . '?id=eq.' . urlencode($id),
        [
            'status' => $decisao === 'aprovar' ? 'aprovada' : 'recusada',
            'resolvido_por_email' => $emailConfirmado,
            'resolvido_em' => gmdate('c'),
        ],
        ['Prefer: return=minimal']
    );
    if ($st >= 200 && $st < 300) {
        responder(200, ['ok' => true]);
    }
    responder(502, ['ok' => false, 'erro' => 'Não foi possível registrar a decisão.']);
}

responder(400, ['ok' => false, 'erro' => 'Ação desconhecida.']);
