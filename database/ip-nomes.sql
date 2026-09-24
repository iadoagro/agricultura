-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de log-eventos.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Locais conhecidos: o responsável dá nome a um IP fixo (a internet de um
-- escritório, por exemplo) e a página de logs passa a mostrar esse nome no
-- lugar de só "Rio Branco/AC" — nos eventos, nos alertas e no mapa.
-- O IP da localização aproximada (ip_localizacao) só diz a cidade; o nome
-- é o que diz de qual prédio veio o acesso.
begin;

create table if not exists public.ip_nomes (
  ip text primary key check (ip ~ '^[0-9a-fA-F.:]+$'),
  nome text not null check (length(trim(nome)) between 1 and 80),
  atualizado_em timestamptz not null default now(),
  atualizado_por text default (auth.jwt() ->> 'email')
);

alter table public.ip_nomes enable row level security;
revoke all on public.ip_nomes from anon, authenticated;
grant select, insert, update, delete on public.ip_nomes to authenticated;

drop policy if exists "Responsavel gerencia nomes de IP" on public.ip_nomes;
create policy "Responsavel gerencia nomes de IP" on public.ip_nomes
  for all to authenticated
  using ((select auth.jwt() ->> 'email') = 'root@root.com')
  with check ((select auth.jwt() ->> 'email') = 'root@root.com');

commit;
