-- Executar no SQL Editor (idempotente).
-- Conta nova não tem acesso a nenhuma página (nem Fiscais): o responsável
-- libera cada uma em Usuários. Não mexe nas contas já existentes.
alter table public.admin_solicitacoes alter column paginas set default '{}'::text[];
