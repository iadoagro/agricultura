-- Metas anuais do painel de Mecanização (aba "Metas"). Todos leem; só o responsável (root) grava.
-- metrica: ha (hectares mecanizados) | horas (horas de máquina na açudagem) | tanques | atendimentos
-- municipio vazio ('') = meta do Acre inteiro. Pode rodar de novo (idempotente).
begin;

create table if not exists public.mecanizacao_metas (
  id bigint generated always as identity primary key,
  ano text not null,
  metrica text not null check (metrica in ('ha','horas','tanques','atendimentos')),
  municipio text not null default '',
  valor numeric not null check (valor >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  unique (ano, metrica, municipio)
);

alter table public.mecanizacao_metas enable row level security;
grant select on public.mecanizacao_metas to anon, authenticated;
grant insert, update, delete on public.mecanizacao_metas to authenticated;

drop policy if exists mecanizacao_metas_leitura on public.mecanizacao_metas;
create policy mecanizacao_metas_leitura on public.mecanizacao_metas for select using (true);

drop policy if exists mecanizacao_metas_gravacao on public.mecanizacao_metas;
create policy mecanizacao_metas_gravacao on public.mecanizacao_metas for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com');

commit;
