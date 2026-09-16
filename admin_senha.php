<?php
// Senha de administrador compartilhada pelos endpoints que publicam dados do
// painel de mecanização (salvar_mecanizacao.php e lancar_mecanizacao.php).
// Um hash só, num arquivo só: trocar a senha aqui vale para os dois.
//
// Para trocar a senha, gere um hash novo e substitua a constante abaixo:
//   php -r 'echo password_hash("NOVA-SENHA", PASSWORD_DEFAULT), PHP_EOL;'
const HASH_ADMIN = '$2y$10$023QXmJJwoDtbR4ZvyA3juTySoICQQB3sUBjGFJyLW9EUW3gQGBxi';

/** Confere a senha. O atraso freia a tentativa em massa: sem ele dá para
    testar milhares de senhas por minuto contra o endpoint que chamar isto. */
function senha_confere($senha){
  $ok = is_string($senha) && password_verify($senha, HASH_ADMIN);
  if(!$ok) usleep(700000);   // 0,7 s por tentativa errada
  return $ok;
}
