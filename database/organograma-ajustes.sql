-- Executar no SQL Editor do mesmo projeto Supabase. Pode ser executado de novo.
--
-- Ajustes feitos no organograma (pages/organograma.html, modo Admin):
-- responsável da caixa, matrícula, telefone e posição (deslocamento em relação
-- ao desenho automático). Todo mundo lê; só a conta responsável grava.
begin;

create table if not exists public.organograma_ajustes (
  id text primary key,            -- id da caixa no organograma (ex.: "dem", "el-rbo")
  holder text,                    -- "Nome\nPortaria Nº 1/2026"; null = sem ajuste, '' = vazio de propósito
  matricula text,
  telefone text,
  dx numeric,                     -- deslocamento em px do canvas (null = posição automática)
  dy numeric,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

alter table public.organograma_ajustes enable row level security;

drop policy if exists organograma_ajustes_leitura on public.organograma_ajustes;
create policy organograma_ajustes_leitura on public.organograma_ajustes
  for select to anon, authenticated using (true);

drop policy if exists organograma_ajustes_gravacao on public.organograma_ajustes;
create policy organograma_ajustes_gravacao on public.organograma_ajustes
  for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com');

grant select on public.organograma_ajustes to anon, authenticated;
grant insert, update, delete on public.organograma_ajustes to authenticated;
grant all on public.organograma_ajustes to service_role;

commit;
