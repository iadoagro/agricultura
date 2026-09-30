-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de admin.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Convite pra cadastrar PIN depois do login (js/admin-login.js): o cadastro e
-- o 1º acesso (troca da senha temporária) são só com senha normal. A partir da
-- 2ª entrada quem usa senha normal é perguntado se quer trocar por um PIN de 6
-- números; a cada "Agora não" conta uma recusa e, na 5ª, o convite para de
-- aparecer. O root vê quem recusou 5 vezes (tela Usuários) e pode reexibir.
-- Uma linha por conta (inclusive o root, que não tem linha em
-- admin_solicitacoes); sem linha = ainda não respondeu, então pergunta.
--   usa_pin       — a senha atual é um PIN (gravado pela função
--                   admin-usuarios ao trocar a senha ou no autocadastro);
--   nao_perguntar — o convite parou de aparecer (5 recusas);
--   entradas      — quantos logins a conta já fez (o convite só vem da 2ª);
--   recusas       — quantas vezes recusou o convite.
begin;

create table if not exists public.acesso_pin (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  usa_pin boolean not null default false,
  nao_perguntar boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.acesso_pin add column if not exists entradas integer not null default 0;
alter table public.acesso_pin add column if not exists recusas integer not null default 0;
-- quem marcou o antigo "Não perguntar de novo" conta como quem recusou 5 vezes
update public.acesso_pin set recusas = 5 where nao_perguntar and recusas < 5;

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

-- O root lê a linha de todas as contas (sinalização na tela Usuários).
drop policy if exists "Root le acesso_pin" on public.acesso_pin;
create policy "Root le acesso_pin" on public.acesso_pin
  for select to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com');

-- Conta um login e devolve quantos já foram (só mexe na linha de quem chama).
create or replace function public.pin_registrar_entrada()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  insert into public.acesso_pin (usuario_id, entradas, atualizado_em)
  values (auth.uid(), 1, now())
  on conflict (usuario_id) do update set entradas = public.acesso_pin.entradas + 1, atualizado_em = now()
  returning entradas into n;
  return n;
end;
$$;

-- "Agora não": conta uma recusa; na 5ª o convite para de aparecer.
create or replace function public.pin_recusar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  insert into public.acesso_pin (usuario_id, recusas, nao_perguntar, atualizado_em)
  values (auth.uid(), 1, false, now())
  on conflict (usuario_id) do update
    set recusas = public.acesso_pin.recusas + 1,
        nao_perguntar = (public.acesso_pin.recusas + 1) >= 5,
        atualizado_em = now()
  returning recusas into n;
  return n;
end;
$$;

-- Só o root: zera as recusas de uma conta para o convite voltar a aparecer.
create or replace function public.pin_reexibir(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'root@root.com' then
    raise exception 'Sem permissão.';
  end if;
  update public.acesso_pin set recusas = 0, nao_perguntar = false, atualizado_em = now()
  where usuario_id = p_usuario;
end;
$$;

revoke all on function public.pin_registrar_entrada() from public, anon;
revoke all on function public.pin_recusar() from public, anon;
revoke all on function public.pin_reexibir(uuid) from public, anon;
grant execute on function public.pin_registrar_entrada() to authenticated;
grant execute on function public.pin_recusar() to authenticated;
grant execute on function public.pin_reexibir(uuid) to authenticated;

-- Tela de login (sem sessão): a conta digitada tem PIN? Devolve só o mínimo —
-- e a mesma resposta genérica para login que não existe, pra não revelar contas.
--   { tem_pin: bool, motivo: 'recusou' | 'poucos_acessos' | 'sem_pin' | null }
create or replace function public.pin_situacao(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.acesso_pin;
begin
  select a.* into r from public.acesso_pin a
    join auth.users u on u.id = a.usuario_id
   where lower(u.email) = lower(coalesce(p_email, ''));
  if not found then
    return jsonb_build_object('tem_pin', false, 'motivo', 'poucos_acessos');
  end if;
  if r.usa_pin then return jsonb_build_object('tem_pin', true, 'motivo', null); end if;
  if r.nao_perguntar or r.recusas >= 5 then return jsonb_build_object('tem_pin', false, 'motivo', 'recusou'); end if;
  if r.entradas < 2 then return jsonb_build_object('tem_pin', false, 'motivo', 'poucos_acessos'); end if;
  return jsonb_build_object('tem_pin', false, 'motivo', 'sem_pin');
end;
$$;

revoke all on function public.pin_situacao(text) from public;
grant execute on function public.pin_situacao(text) to anon, authenticated;

commit;
