<?php
// Senha de administrador compartilhada pelos endpoints que publicam dados do
// painel de mecanização (salvar_mecanizacao.php, lancar_mecanizacao.php) e
// pelo link público (config_publico.php).
//
// A senha é a do próprio login root@root.com no Supabase: não há hash neste
// arquivo. Trocar a senha do root no Supabase já troca a de administrador.
const ADMIN_EMAIL = 'root@root.com';

/** Url e chave publishable do projeto: as mesmas que o navegador usa
    (js/banco-config.js). A chave publishable é pública por definição. */
function config_banco(){
  $f = __DIR__ . '/js/banco-config.js';
  $t = is_file($f) ? file_get_contents($f) : '';
  if(!preg_match("~url:\s*'([^']+)'~", $t, $u) || !preg_match("~chavePublica:\s*'([^']+)'~", $t, $k)) return null;
  return [rtrim($u[1], '/'), $k[1]];
}

/** Confere a senha tentando entrar no Supabase como root. O atraso freia a
    tentativa em massa: sem ele dá para testar milhares de senhas por minuto
    contra o endpoint que chamar isto. */
function senha_confere($senha){
  $ok = false;
  $cfg = config_banco();
  if(is_string($senha) && $senha !== '' && $cfg){
    $ch = curl_init($cfg[0] . '/auth/v1/token?grant_type=password');
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_POST => true,
      CURLOPT_HTTPHEADER => ['apikey: ' . $cfg[1], 'Content-Type: application/json'],
      CURLOPT_POSTFIELDS => json_encode(['email' => ADMIN_EMAIL, 'password' => $senha]),
      CURLOPT_TIMEOUT => 15,
    ]);
    $resp = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $j = $resp === false ? null : json_decode($resp, true);
    $ok = $status === 200 && is_array($j) && !empty($j['access_token']);
  }
  if(!$ok) usleep(700000);   // 0,7 s por tentativa errada
  return $ok;
}
