-- Executar no SQL Editor de um projeto Supabase novo.
begin;
create table public.eleicoes_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.eleicoes_admins enable row level security;
revoke all on public.eleicoes_admins from anon, authenticated;
grant select on public.eleicoes_admins to authenticated;
create policy "Consultar propria autorizacao" on public.eleicoes_admins
  for select to authenticated using (user_id = (select auth.uid()));

create table public.eleicoes_cadastros (
  id text primary key check (length(id) between 1 and 100),
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  criado_por uuid not null default auth.uid() references auth.users(id),
  constraint dados_obrigatorios check (
    jsonb_typeof(dados) = 'object'
    and dados ?& array['municipio','nome','telefone','regional']
    and jsonb_typeof(dados->'municipio') = 'string'
    and jsonb_typeof(dados->'nome') = 'string'
    and jsonb_typeof(dados->'telefone') = 'string'
    and jsonb_typeof(dados->'regional') = 'string'
    and dados->>'municipio' in ('1200013','1200054','1200104','1200138','1200179','1200203','1200252','1200302','1200328','1200336','1200344','1200351','1200385','1200401','1200427','1200435','1200450','1200500','1200609','1200708','1200807','1200393')
    and length(btrim(dados->>'nome')) between 1 and 160
    and length(dados->>'telefone') <= 30
    and length(dados->>'regional') <= 100
    and octet_length(dados::text) <= 5000
  )
);
create index eleicoes_municipio on public.eleicoes_cadastros ((dados->>'municipio'));
alter table public.eleicoes_cadastros enable row level security;
revoke all on public.eleicoes_cadastros from anon, authenticated;
grant select, insert on public.eleicoes_cadastros to authenticated;
create policy "Administradores leem cadastros" on public.eleicoes_cadastros
  for select to authenticated using (exists (
    select 1 from public.eleicoes_admins where user_id = (select auth.uid())
  ));
create policy "Administradores adicionam cadastros" on public.eleicoes_cadastros
  for insert to authenticated with check (
    criado_por = (select auth.uid()) and exists (
      select 1 from public.eleicoes_admins where user_id = (select auth.uid())
    )
  );
commit;
-- Depois de criar a conta em Authentication > Users, autorize seu UUID:
-- insert into public.eleicoes_admins (user_id) values ('UUID-DA-CONTA');
