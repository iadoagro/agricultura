-- Executar no mesmo projeto Supabase de admin.sql. Pode rodar de novo sem problema (idempotente).
--
-- Link público da apuração do 2º turno (aba Eleições > 2º Turno): o responsável (root@root.com) gera UM link
-- com código curto; quem abre o link NÃO faz login e só enxerga a página pages/apuracao-publica.html.
-- O token não dá nenhuma permissão no banco: a única coisa que o público consegue chamar é a função
-- apuracao_link_valido(token), que responde true/false. A tabela em si só é lida/alterada pelo responsável.
begin;

create table if not exists public.apuracao_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (length(token) >= 32),
  rotulo text not null default '',
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  expira_em timestamptz,
  revogado_em timestamptz,
  acessos integer not null default 0,
  ultimo_acesso timestamptz
);

alter table public.apuracao_links enable row level security;
revoke all on public.apuracao_links from anon, authenticated;
grant select, insert, update on public.apuracao_links to authenticated;
grant select, insert, update, delete on public.apuracao_links to service_role;

drop policy if exists "Responsavel le links da apuracao" on public.apuracao_links;
create policy "Responsavel le links da apuracao" on public.apuracao_links
  for select to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com');

drop policy if exists "Responsavel cria links da apuracao" on public.apuracao_links;
create policy "Responsavel cria links da apuracao" on public.apuracao_links
  for insert to authenticated with check ((select auth.jwt() ->> 'email') = 'root@root.com');

drop policy if exists "Responsavel altera links da apuracao" on public.apuracao_links;
create policy "Responsavel altera links da apuracao" on public.apuracao_links
  for update to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com')
  with check ((select auth.jwt() ->> 'email') = 'root@root.com');

-- Um único link ativo por vez, com código curto e fácil de falar (ex.: kamiruse47). Códigos antigos (longos) continuam valendo
-- até serem revogados.
alter table public.apuracao_links drop constraint if exists apuracao_links_token_check;
alter table public.apuracao_links add constraint apuracao_links_token_check check (length(token) >= 6);
create unique index if not exists apuracao_links_um_ativo on public.apuracao_links ((true)) where revogado_em is null;

-- Única porta aberta ao público: confere o código (e conta o acesso). Não devolve nenhum dado do link.
create or replace function public.apuracao_link_valido(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := lower(btrim(coalesce(p_token, '')));
  achou uuid;
begin
  if length(t) < 6 or length(t) > 128 then
    return false;
  end if;
  select id into achou from public.apuracao_links
   where token = t and revogado_em is null and (expira_em is null or expira_em > now());
  if achou is null then
    return false;
  end if;
  update public.apuracao_links set acessos = acessos + 1, ultimo_acesso = now() where id = achou;
  return true;
end;
$$;

revoke all on function public.apuracao_link_valido(text) from public;
grant execute on function public.apuracao_link_valido(text) to anon, authenticated;

-- Só o responsável: gera o link (revogando o anterior, se houver) e revoga o link ativo.
create or replace function public.apuracao_link_gerar(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := lower(btrim(coalesce(p_token, '')));
begin
  if (select auth.jwt() ->> 'email') is distinct from 'root@root.com' then
    raise exception 'Somente o responsável pode gerar o link.' using errcode = '42501';
  end if;
  if t !~ '^[a-z0-9]{6,64}$' then
    raise exception 'Código inválido.' using errcode = '22023';
  end if;
  update public.apuracao_links set revogado_em = now() where revogado_em is null;
  insert into public.apuracao_links (token, rotulo) values (t, 'Link público da apuração');
  return t;
end;
$$;

create or replace function public.apuracao_link_revogar()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.jwt() ->> 'email') is distinct from 'root@root.com' then
    raise exception 'Somente o responsável pode revogar o link.' using errcode = '42501';
  end if;
  update public.apuracao_links set revogado_em = now() where revogado_em is null;
end;
$$;

revoke all on function public.apuracao_link_gerar(text) from public, anon;
revoke all on function public.apuracao_link_revogar() from public, anon;
grant execute on function public.apuracao_link_gerar(text) to authenticated;
grant execute on function public.apuracao_link_revogar() to authenticated;

commit;

-- Link fixo "…/pages/publico": a página pública não usa mais código na URL. Ela só pergunta se o link está ATIVO
-- (existe um registro não revogado). Gerar = ativar; Revogar = desativar. Os códigos antigos continuam existindo no banco.
begin;

create or replace function public.apuracao_publica_ativa()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  achou uuid;
begin
  select id into achou from public.apuracao_links
   where revogado_em is null and (expira_em is null or expira_em > now())
   order by criado_em desc limit 1;
  if achou is null then
    return false;
  end if;
  update public.apuracao_links set acessos = acessos + 1, ultimo_acesso = now() where id = achou;
  return true;
end;
$$;

revoke all on function public.apuracao_publica_ativa() from public;
grant execute on function public.apuracao_publica_ativa() to anon, authenticated;

commit;
