-- Desempenho do painel de Mecanização. NADA é apagado nem alterado nos dados: só objetos novos
-- (contador de versão, função de leitura e um índice) e a reescrita de uma consulta de relatório.
-- Idempotente: pode rodar de novo.
--
--  1) mecanizacao_versao: um contador que sobe a cada gravação em lançamentos / lançadores (gatilho por
--     comando, não por linha). A função do servidor compara só esse número (1 leitura de 1 linha) para saber
--     se a base mudou, em vez de ler e comparar 3.680 registros a cada chamada.
--  2) mecanizacao_painel_bruto(): devolve TODOS os registros do painel em uma única consulta (jsonb), no lugar
--     de 4 páginas de 1.000 linhas lidas em sequência (cada página era uma ida e volta ao banco).
--  3) índice (criado_em, id): casa com a ordenação do painel e das listagens (sem ordenação extra).
--  4) mecanizacao_resumo_periodo(): filtra por intervalo de timestamp (usa índice) em vez de converter a
--     coluna inteira para data em cada linha.
begin;

-- ------------------------------------------------------------ 1) contador de versão
create table if not exists public.mecanizacao_versao (
  id int primary key default 1 check (id = 1),
  n bigint not null,
  atualizado_em timestamptz not null default now()
);
insert into public.mecanizacao_versao (id, n) values (1, extract(epoch from now())::bigint) on conflict (id) do nothing;
alter table public.mecanizacao_versao enable row level security;   -- sem política: só a service_role e as funções abaixo
revoke all on public.mecanizacao_versao from anon, authenticated;
grant select on public.mecanizacao_versao to service_role;   -- a função de borda lê o contador pela API REST

create or replace function public.mecanizacao_versao_subir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.mecanizacao_versao set n = n + 1, atualizado_em = now() where id = 1;
  return null;
end;
$$;
revoke all on function public.mecanizacao_versao_subir() from public, anon, authenticated;

drop trigger if exists mecanizacao_lancamentos_versao on public.mecanizacao_lancamentos;
create trigger mecanizacao_lancamentos_versao
  after insert or update or delete or truncate on public.mecanizacao_lancamentos
  for each statement execute function public.mecanizacao_versao_subir();

drop trigger if exists mecanizacao_lancadores_versao on public.mecanizacao_lancadores;
create trigger mecanizacao_lancadores_versao
  after insert or update or delete or truncate on public.mecanizacao_lancadores
  for each statement execute function public.mecanizacao_versao_subir();

-- ------------------------------------------------------------ 2) leitura única do painel
-- json (e não jsonb): não reprocessa os campos, ~3x mais rápido (38 ms contra 113 ms nos 3.680 registros)
drop function if exists public.mecanizacao_painel_bruto();
create or replace function public.mecanizacao_painel_bruto()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.criado_em, t.id), '[]'::json)
    from (
      select id, criado_em, criado_por_email, tipo_servico, data_vistoria, escritorio_local, responsavel_tecnico,
             nome_beneficiario, sexo, estado_civil, possui_dap, associacao_cooperativa, endereco, nome_propriedade,
             municipio, culturas, area_total_ha, horas_maquina, quantidade_acudes, pontos_geo, tipo_uso, maquinas,
             implementos, daes, observacao, formulario_url, piscicultura, destoca
        from public.mecanizacao_lancamentos
    ) t;
$$;
revoke all on function public.mecanizacao_painel_bruto() from public, anon, authenticated;
grant execute on function public.mecanizacao_painel_bruto() to service_role;

-- ------------------------------------------------------------ 3) índice da ordenação padrão
create index if not exists mecanizacao_lancamentos_criado_em_id
  on public.mecanizacao_lancamentos (criado_em, id);

-- ------------------------------------------------------------ 4) relatório: intervalo que usa índice
create or replace function public.mecanizacao_resumo_periodo(p_ini date, p_fim date)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select *
      from public.mecanizacao_lancamentos
     where criado_em >= (p_ini::timestamp at time zone 'America/Rio_Branco')
       and criado_em <  ((p_fim + 1)::timestamp at time zone 'America/Rio_Branco')
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
revoke all on function public.mecanizacao_resumo_periodo(date, date) from public, anon, authenticated;
-- Hoje só mecanizacao_gerar_relatorio() a chama (security definer: roda como dono, não precisa de permissão).
-- O grant fica explícito para quem usar a chave service_role (função de borda, script) não levar "permission denied",
-- como já é feito em mecanizacao_painel_bruto().
grant execute on function public.mecanizacao_resumo_periodo(date, date) to service_role;

commit;

-- estatísticas atualizadas para o planejador (fora da transação)
analyze public.mecanizacao_lancamentos;
