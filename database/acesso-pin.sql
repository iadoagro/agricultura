-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de admin.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Convite pra cadastrar PIN depois do login (js/admin-login.js): quem entra
-- com senha normal é perguntado se quer trocar por um PIN de 6 números —
-- em todo login, até cadastrar o PIN ou marcar "Não perguntar de novo".
-- Uma linha por conta (inclusive o root, que não tem linha em
-- admin_solicitacoes); sem linha = ainda não respondeu, então pergunta.
--   usa_pin       — a senha atual é um PIN (gravado pela função
--                   admin-usuarios ao trocar a senha ou no autocadastro);
--   nao_perguntar — a pessoa marcou "Não perguntar de novo".
begin;

create table if not exists public.acesso_pin (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  usa_pin boolean not null default false,
  nao_perguntar boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- A entrada por biometria (passkey) foi testada e retirada do sistema: sai o
-- que ela tinha criado aqui.
drop function if exists public.biometria_nao_perguntar();
alter table public.acesso_pin drop column if exists biometria_nao_perguntar;

alter table public.acesso_pin enable row level security;
revoke all on public.acesso_pin from anon, authenticated;
grant select on public.acesso_pin to authenticated;
-- a Edge Function admin-usuarios grava usa_pin com a service_role (sem isso o upsert falhava calado)
grant select, insert, update on public.acesso_pin to service_role;

-- Cada conta lê só a própria linha; quem escreve é a função abaixo (o
-- "não perguntar") e a Edge Function admin-usuarios (usa_pin, com service_role).
drop policy if exists "Conta le o proprio acesso_pin" on public.acesso_pin;
create policy "Conta le o proprio acesso_pin" on public.acesso_pin
  for select to authenticated using (usuario_id = (select auth.uid()));

-- "Não perguntar de novo": só mexe na linha de quem chama.
create or replace function public.pin_nao_perguntar()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.acesso_pin (usuario_id, nao_perguntar, atualizado_em)
  values (auth.uid(), true, now())
  on conflict (usuario_id) do update set nao_perguntar = true, atualizado_em = now();
end;
$$;

revoke all on function public.pin_nao_perguntar() from public, anon;
grant execute on function public.pin_nao_perguntar() to authenticated;

commit;
