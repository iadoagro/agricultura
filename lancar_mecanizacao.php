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

    return $registro;
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
        TABELA_SOLICITACOES . '?select=id,tipo,motivo,solicitado_por_email,criado_em&status=eq.pendente&lancamento_id=eq.' . urlencode($lancamentoId)
    );
    return ($status >= 200 && $status < 300 && is_array($corpo) && count($corpo)) ? $corpo[0] : null;
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

/** Filtros da lista (campos "f_*" do POST) no formato de query do
 *  PostgREST. Texto livre perde os caracteres que o PostgREST usa como
 *  sintaxe (vírgula, parênteses, asterisco) antes de entrar no filtro. */
function filtrosDaLista(array $emailsDoLogin): string
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
    // "Lançado por": vazio = só os meus (padrão); "todos"; ou a lista de
    // e-mails de uma pessoa (vários e-mails podem ter o mesmo nome).
    $pessoa = $f('f_pessoa');
    if ($pessoa === '') {
        $q .= filtroEmails($emailsDoLogin);
    } elseif ($pessoa !== 'todos') {
        $q .= filtroEmails(array_map('strtolower', array_map('trim', explode(',', $pessoa))));
    }
    return $q;
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

    $registro = lerRegistroDoPost($emailConfirmado);

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
    $pagina = max(1, (int) ($_POST['pagina'] ?? 1));
    // Qualquer pessoa logada pode ver os lançamentos dos outros escolhendo
    // no filtro "Lançado por"; editar/excluir continua só do dono (ou root).
    $meusEmails = emailsDoUsuario($emailConfirmado);
    $filtro = filtrosDaLista($meusEmails);
    // Mais recente primeiro (2026 no topo); o primeiro lançado fica por último.
    [$status, $corpo, $headersResp] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'GET',
        '/rest/v1/mecanizacao_lancamentos?select=id,criado_em,criado_por_email,tipo_servico,nome_beneficiario,' .
        'municipio,escritorio_local,data_vistoria,area_total_ha,horas_maquina,quantidade_acudes' .
        $filtro . '&order=criado_em.desc,id.desc&limit=' . $limite . '&offset=' . (($pagina - 1) * $limite),
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
    // Ver: qualquer pessoa logada (a lista também mostra os dos outros).
    // Editar: só o dono ou o responsável — "pode_editar" avisa a tela.
    $linha = buscarLancamento($supabaseUrl, $serviceRole, $id);
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
        '/rest/v1/mecanizacao_lancadores_resumo?select=email,total,ultimo,nome,usuario_email,tecnico&order=email.asc'
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
    [$status, $corpo] = chamarSupabase(
        $supabaseUrl, $serviceRole, 'POST', '/rest/v1/mecanizacao_lancadores?on_conflict=email',
        [
            'email' => $email,
            'nome' => $nome === '' ? null : mb_substr($nome, 0, 120),
            'usuario_email' => $usuario === '' ? null : $usuario,
            'atualizado_em' => gmdate('c'),
            'atualizado_por' => $emailConfirmado,
        ],
        ['Prefer: resolution=merge-duplicates,return=minimal']
    );
    if ($status >= 200 && $status < 300) {
        responder(200, ['ok' => true]);
    }
    responder(502, ['ok' => false, 'erro' => (string) ($corpo['message'] ?? 'Não foi possível salvar.')]);
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
