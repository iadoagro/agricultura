-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de admin.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Bloqueio por tentativas na tela de login (js/admin-login.js):
--   * a cada senha/PIN errado a tela chama login_falhou(); na 3ª falha seguida a conta é BLOQUEADA
--     de verdade (auth.users.banned_until daqui a 100 anos: o Supabase Auth recusa o login até alguém liberar,
--     mesmo com a senha certa) e nasce um pedido de redefinição de senha (reset_pendente);
--   * o pedido aparece para o root em Usuários (e no Início); ao aprovar, o sistema redefine a senha para
--     123456 (ação redefinir_senha da função admin-usuarios, que também obriga a trocar no próximo acesso)
--     e chama login_liberar(), que tira o bloqueio;
--   * entrar com sucesso zera a contagem de erros (login_sucesso).
-- O root (root@root.com) nunca é bloqueado: não há outra conta para aprovar o reset dele.
-- Limite conhecido: a contagem é feita pela tela de login; quem chama a API do Supabase Auth direto
-- (sem passar pela tela) não é contado — o bloqueio, uma vez aplicado, vale para qualquer caminho.
begin;

create table if not exists public.senha_bloqueios (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  falhas integer not null default 0,
  ultima_falha timestamptz,
  bloqueado boolean not null default false,
  bloqueado_em timestamptz,
  reset_pendente boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.senha_bloqueios enable row level security;
revoke all on public.senha_bloqueios from anon, authenticated;
grant select on public.senha_bloqueios to authenticated;

-- Só o root lê (lista de pedidos em Usuários / alerta no Início). Quem escreve são as funções abaixo.
drop policy if exists "Root le senha_bloqueios" on public.senha_bloqueios;
create policy "Root le senha_bloqueios" on public.senha_bloqueios
  for select to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com');

-- A tela de login (sem sessão) pergunta se a conta digitada já está bloqueada.
-- Resposta igual para login que não existe, pra não revelar contas.
--   { bloqueado: bool }
create or replace function public.login_status(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b boolean;
begin
  select s.bloqueado into b
    from public.senha_bloqueios s
    join auth.users u on u.id = s.usuario_id
   where lower(u.email) = lower(trim(coalesce(p_email, '')));
  return jsonb_build_object('bloqueado', coalesce(b, false));
end;
$$;

-- Registra uma senha errada. Na 3ª bloqueia a conta e abre o pedido de reset.
--   { existe: bool, bloqueado: bool, restantes: int }   (login inexistente e root: existe=false)
create or replace function public.login_falhou(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
  v_falhas integer;
  v_bloq boolean;
  c_limite constant integer := 3;
begin
  if v_email = '' or v_email = 'root@root.com' then
    return jsonb_build_object('existe', false, 'bloqueado', false, 'restantes', c_limite);
  end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    return jsonb_build_object('existe', false, 'bloqueado', false, 'restantes', c_limite);
  end if;

  insert into public.senha_bloqueios (usuario_id, email, falhas, ultima_falha)
  values (v_id, v_email, 1, now())
  on conflict (usuario_id) do update
    set falhas = case when public.senha_bloqueios.bloqueado then public.senha_bloqueios.falhas else public.senha_bloqueios.falhas + 1 end,
        ultima_falha = now(), atualizado_em = now()
  returning falhas, bloqueado into v_falhas, v_bloq;

  if not v_bloq and v_falhas >= c_limite then
    update public.senha_bloqueios
       set bloqueado = true, bloqueado_em = now(), reset_pendente = true, atualizado_em = now()
     where usuario_id = v_id;
    -- data distante e finita: com 'infinity' o Supabase Auth falha ao ler o usuário ("Database error querying schema")
    update auth.users set banned_until = now() + interval '100 years' where id = v_id;
    v_bloq := true;
  end if;
  return jsonb_build_object('existe', true, 'bloqueado', v_bloq, 'restantes', greatest(c_limite - v_falhas, 0));
end;
$$;

-- Login deu certo: zera a contagem de erros de quem entrou (se ainda não estiver bloqueada).
create or replace function public.login_sucesso()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.senha_bloqueios
     set falhas = 0, atualizado_em = now()
   where usuario_id = auth.uid() and not bloqueado;
end;
$$;

-- Só o root: tira o bloqueio e fecha o pedido (chamada depois que a senha foi redefinida).
create or replace function public.login_liberar(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.jwt() ->> 'email') is distinct from 'root@root.com' then
    raise exception 'Apenas o responsável pode liberar contas.' using errcode = '42501';
  end if;
  if exists (select 1 from public.senha_bloqueios where usuario_id = p_usuario and bloqueado) then
    update auth.users set banned_until = null where id = p_usuario;
  end if;
  update public.senha_bloqueios
     set falhas = 0, bloqueado = false, reset_pendente = false, atualizado_em = now()
   where usuario_id = p_usuario;
end;
$$;

revoke all on function public.login_status(text) from public;
revoke all on function public.login_falhou(text) from public;
revoke all on function public.login_sucesso() from public;
revoke all on function public.login_liberar(uuid) from public;
grant execute on function public.login_status(text) to anon, authenticated;
grant execute on function public.login_falhou(text) to anon, authenticated;
grant execute on function public.login_sucesso() to authenticated;
grant execute on function public.login_liberar(uuid) to authenticated;

commit;
