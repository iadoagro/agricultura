-- Executar no SQL Editor depois de fiscais-acesso.sql (usa a função
-- public.eh_root_ou_aprovado() definida lá). Idempotente.
--
-- eleicoes_cadastros já guarda quem cadastrou cada fiscal na coluna
-- "criado_por" (uuid de auth.users), só que ninguém aprovado consegue ler
-- auth.users direto (nem devia, tem e-mail/senha de todo mundo). Esta
-- função devolve só o login de exibição (sem @sistema.local) de uma lista
-- de uuids, pra tela de Fiscais mostrar "Cadastrado por fulano.sobrenome".
-- Cadastros antigos ou de uma conta já excluída não aparecem aqui — a tela
-- então mostra "Sistema" no lugar.
begin;

create or replace function public.fiscais_criadores(p_ids uuid[])
returns table(id uuid, login text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
    case
      when lower(u.email) = 'root@root.com' then 'root'
      when u.email ilike '%@sistema.local' then left(u.email, length(u.email) - length('@sistema.local'))
      else u.email
    end as login
  from auth.users u
  where u.id = any(p_ids) and public.eh_root_ou_aprovado();
$$;

revoke all on function public.fiscais_criadores(uuid[]) from public;
grant execute on function public.fiscais_criadores(uuid[]) to authenticated;

commit;
