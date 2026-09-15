-- Executar no SQL Editor depois de admin.sql (idempotente).
-- Quando o responsável cadastra alguém direto em Usuários, a senha padrão
-- é 123456 e essa coluna marca que a pessoa precisa trocar no primeiro
-- login. A função abaixo deixa o próprio usuário confirmar a troca (limpar
-- a marca) sem depender das políticas de update, que hoje só valem pra
-- root@root.com — ela roda com os privilégios de quem criou
-- a função, mas só mexe na linha do próprio usuário autenticado.
alter table public.admin_solicitacoes add column if not exists deve_trocar_senha boolean not null default false;

create or replace function public.confirmar_troca_senha()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_solicitacoes set deve_trocar_senha = false where id = auth.uid();
end;
$$;

grant execute on function public.confirmar_troca_senha() to authenticated;
