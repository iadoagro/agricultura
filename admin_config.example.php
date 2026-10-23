<?php
/* Copie este arquivo para admin_config.php (mesma pasta) e preencha com os
   dados reais do seu projeto Supabase. admin_config.php NUNCA deve ir pro
   git — já está no .gitignore.

   A "service_role" fica em Project Settings > API do seu projeto Supabase.
   É a chave de acesso TOTAL ao banco, sem nenhuma das proteções da chave
   publishable — só entra aqui, nunca em js/banco-config.js, nunca no
   navegador, nunca em nenhum commit. */
return [
    'url' => 'https://SEU-PROJETO.supabase.co',
    'service_role' => 'COLE_AQUI_A_CHAVE_SERVICE_ROLE',
    // PIN pedido pelo cadeado da tela de usuários (admin-usuarios.html)
    'pin_ver_senha' => '',
    // URL (termina em /exec) do web app drive/upload-drive.gs. Em branco = PDFs seguem no Storage do Supabase
    'drive_url' => '',
    // mesmo SEGREDO de drive/upload-drive.local.gs (a ponte só aceita o servidor com ele)
    'drive_segredo' => '',
];
