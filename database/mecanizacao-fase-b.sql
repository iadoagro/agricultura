-- Fase B do painel de Mecanização: alertas configuráveis, metas granulares e relatórios periódicos.
-- Pode rodar de novo (idempotente). Só o responsável (root) grava; quem está logado lê os relatórios.
begin;

-- ---------------------------------------------------------------- alertas ---
create table if not exists public.mecanizacao_alertas_config (
  id int primary key default 1 check (id = 1),
  limite_pct int not null default 70 check (limite_pct between 10 and 100),        -- abaixo de X% da média = alerta
  janela_dias int not null default 90 check (janela_dias between 7 and 365),       -- período analisado
  dias_sem_atendimento int not null default 45 check (dias_sem_atendimento between 7 and 365),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
insert into public.mecanizacao_alertas_config (id) values (1) on conflict do nothing;
alter table public.mecanizacao_alertas_config enable row level security;
grant select on public.mecanizacao_alertas_config to anon, authenticated;
grant insert, update on public.mecanizacao_alertas_config to authenticated;
drop policy if exists mac_leitura on public.mecanizacao_alertas_config;
create policy mac_leitura on public.mecanizacao_alertas_config for select using (true);
drop policy if exists mac_gravacao on public.mecanizacao_alertas_config;
create policy mac_gravacao on public.mecanizacao_alertas_config for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com');

-- ----------------------------------------------------------- metas granulares ---
alter table public.mecanizacao_metas
  add column if not exists escritorio text not null default '',
  add column if not exists tecnico text not null default '',
  add column if not exists mes text not null default '';
alter table public.mecanizacao_metas drop constraint if exists mecanizacao_metas_mes_check;
alter table public.mecanizacao_metas add constraint mecanizacao_metas_mes_check
  check (mes in ('', '01','02','03','04','05','06','07','08','09','10','11','12'));
alter table public.mecanizacao_metas drop constraint if exists mecanizacao_metas_ano_metrica_municipio_key;
alter table public.mecanizacao_metas drop constraint if exists mecanizacao_metas_unica;
alter table public.mecanizacao_metas add constraint mecanizacao_metas_unica
  unique (ano, metrica, municipio, escritorio, tecnico, mes);

-- ------------------------------------------------------ relatórios periódicos ---
create table if not exists public.mecanizacao_relatorios (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('semanal', 'mensal')),
  inicio date not null,
  fim date not null,
  criado_em timestamptz not null default now(),
  resumo jsonb not null,
  unique (tipo, inicio)
);
alter table public.mecanizacao_relatorios enable row level security;
revoke all on public.mecanizacao_relatorios from anon;
grant select on public.mecanizacao_relatorios to authenticated;
drop policy if exists mr_leitura on public.mecanizacao_relatorios;
create policy mr_leitura on public.mecanizacao_relatorios for select to authenticated using (true);

-- agregados de um intervalo (data de lançamento, horário de Rio Branco)
create or replace function public.mecanizacao_resumo_periodo(p_ini date, p_fim date)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select *, (criado_em at time zone 'America/Rio_Branco')::date as dia
      from public.mecanizacao_lancamentos
     where (criado_em at time zone 'America/Rio_Branco')::date between p_ini and p_fim
  ), tot as (
    select count(*) atend,
           coalesce(sum(area_total_ha) filter (where tipo_servico ilike 'mecan%'), 0) ha,
           coalesce(sum(horas_maquina), 0) horas,
           coalesce(sum(quantidade_acudes), 0) tanques,
           count(distinct lower(btrim(nome_beneficiario))) produtores,
           count(distinct municipio) municipios
      from b
  )
  select jsonb_build_object(
    'totais', (select to_jsonb(tot) from tot),
    'por_municipio', coalesce((select jsonb_agg(x order by x.atend desc, x.mun) from (
        select municipio mun, count(*) atend,
               coalesce(sum(area_total_ha) filter (where tipo_servico ilike 'mecan%'), 0) ha,
               coalesce(sum(horas_maquina), 0) horas
          from b group by municipio order by count(*) desc limit 12) x), '[]'::jsonb),
    'por_escritorio', coalesce((select jsonb_agg(x order by x.atend desc, x.esc) from (
        select escritorio_local esc, count(*) atend from b group by escritorio_local order by count(*) desc limit 12) x), '[]'::jsonb),
    'por_tecnico', coalesce((select jsonb_agg(x order by x.atend desc, x.tec) from (
        select responsavel_tecnico tec, count(*) atend from b group by responsavel_tecnico order by count(*) desc limit 12) x), '[]'::jsonb),
    'por_servico', coalesce((select jsonb_agg(x order by x.atend desc) from (
        select tipo_servico servico, count(*) atend from b group by tipo_servico) x), '[]'::jsonb)
  );
$$;

-- gera (ou refaz) o relatório da semana ou do mês anterior a p_ref (hoje, se omitido)
create or replace function public.mecanizacao_gerar_relatorio(p_tipo text, p_ref date default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  ref date := coalesce(p_ref, (now() at time zone 'America/Rio_Branco')::date);
  ini date; fim date; ant_ini date; ant_fim date; v jsonb; novo bigint;
begin
  -- chamada de uma pessoa logada: só o responsável. O agendador (sem JWT) passa direto.
  if auth.jwt() is not null and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'root@root.com' then
    raise exception 'Somente o responsável pode gerar relatórios.' using errcode = '42501';
  end if;
  if p_tipo = 'semanal' then
    fim := date_trunc('week', ref)::date - 1;          -- domingo anterior
    ini := fim - 6;                                    -- segunda anterior
    ant_fim := ini - 1; ant_ini := ant_fim - 6;
  elsif p_tipo = 'mensal' then
    ini := (date_trunc('month', ref) - interval '1 month')::date;
    fim := date_trunc('month', ref)::date - 1;
    ant_ini := (date_trunc('month', ini) - interval '1 month')::date; ant_fim := ini - 1;
  else
    raise exception 'Tipo inválido (use semanal ou mensal).' using errcode = '22023';
  end if;
  v := public.mecanizacao_resumo_periodo(ini, fim)
       || jsonb_build_object('anterior', public.mecanizacao_resumo_periodo(ant_ini, ant_fim) -> 'totais',
                             'periodo', jsonb_build_object('inicio', ini, 'fim', fim),
                             'periodo_anterior', jsonb_build_object('inicio', ant_ini, 'fim', ant_fim));
  insert into public.mecanizacao_relatorios (tipo, inicio, fim, resumo) values (p_tipo, ini, fim, v)
  on conflict (tipo, inicio) do update set fim = excluded.fim, resumo = excluded.resumo, criado_em = now()
  returning id into novo;
  return novo;
end;
$$;
revoke all on function public.mecanizacao_resumo_periodo(date, date) from public, anon, authenticated;
revoke all on function public.mecanizacao_gerar_relatorio(text, date) from public, anon;
grant execute on function public.mecanizacao_gerar_relatorio(text, date) to authenticated;

commit;
