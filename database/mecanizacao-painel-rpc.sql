-- Leitura do painel de Mecanização DIRETO no banco, com cache. Depende de mecanizacao-desempenho.sql (contador de versão).
-- Nenhum dado é apagado ou alterado: só funções e uma tabela de cache nova. Idempotente.
--
-- Antes: navegador -> função de borda (arranque a frio, checagem de sessão, 5 consultas REST em sequência,
--        transformação em JavaScript) -> ~3,5 s. Agora: navegador -> mecanizacao_painel() -> uma consulta, e o
--        resultado já pronto fica guardado em mecanizacao_painel_cache até a base mudar (versão).
-- As regras de montagem são as MESMAS de supabase/functions/lancar-mecanizacao (paraRegistroPainel), portadas
-- para SQL e conferidas registro a registro (tools/conferir_painel_sql.cjs).
begin;

-- ------------------------------------------------------------------ auxiliares (iguais ao trim/Number do JS)
create or replace function public.mec_ou(v text, padrao text default 'Não informado')
returns text language sql immutable set search_path = public as $$
  select coalesce(nullif(btrim(v, E' \t\n\r\f\v                 　﻿'), ''), padrao);
$$;

-- Number(v) do JavaScript para um valor JSON: número finito, ou NULL quando seria NaN (ausente/texto não numérico)
create or replace function public.mec_num(j jsonb)
returns numeric language sql immutable set search_path = public as $$
  select case jsonb_typeof(j)
    when 'number' then (j #>> '{}')::numeric
    when 'string' then case
      when btrim(j #>> '{}', E' \t\n\r\f\v   ﻿') = '' then 0
      when btrim(j #>> '{}', E' \t\n\r\f\v   ﻿') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$'
        then btrim(j #>> '{}', E' \t\n\r\f\v   ﻿')::numeric
      else null end
    when 'boolean' then case when (j #>> '{}') = 'true' then 1 else 0 end
    when 'null' then 0
    else null end;
$$;

create or replace function public.mec_nome_sugerido(email text)
returns text language sql immutable set search_path = public as $$
  with u as (
    select btrim(regexp_replace(regexp_replace(split_part(email, '@', 1), '[0-9]+', ' ', 'g'), '[._-]+', ' ', 'g'),
                 E' \t\n\r\f\v   ﻿') as v
  )
  select coalesce(nullif((
    select string_agg(case when t.m[1] ~ '^\s' then t.m[1] else upper(left(t.m[1], 1)) || substr(t.m[1], 2) end, '' order by t.o)
      from regexp_matches((select v from u), '(\s+|\S+)', 'g') with ordinality as t(m, o)
  ), ''), email);
$$;

-- ------------------------------------------------------------------ cache
create table if not exists public.mecanizacao_painel_cache (
  chave text primary key check (chave in ('p', 'i')),       -- p = público, i = logado
  versao bigint not null,
  registros json not null,
  meta jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.mecanizacao_painel_cache enable row level security;   -- sem política: só as funções abaixo
revoke all on public.mecanizacao_painel_cache from anon, authenticated;
grant all on public.mecanizacao_painel_cache to service_role;

-- ------------------------------------------------------------------ montagem (mesma regra do painel)
create or replace function public.mecanizacao_painel_montar(p_logado boolean)
returns table (registros json, meta jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  with nomes as (
    select lower(btrim(x.email, E' \t\n\r\f\v   ﻿')) as e, public.mec_ou(x.nome, '') as n
      from public.mecanizacao_lancadores x
     where x.email is not null and x.nome is not null
  ), b as (
    select
      l.id, l.criado_em,
      to_char(l.criado_em at time zone 'America/Rio_Branco', 'YYYY-MM-DD') as d,
      to_char(l.criado_em at time zone 'America/Rio_Branco', 'HH24:MI') as h,
      to_char(l.criado_em at time zone 'America/Rio_Branco', 'YYYY') as ex,
      coalesce(to_char(l.data_vistoria, 'YYYY-MM-DD'), '') as dv,
      public.mec_ou(l.tipo_servico) as pc,
      public.mec_ou(l.municipio) as mun,
      public.mec_ou(l.escritorio_local) as esc,
      public.mec_ou(l.responsavel_tecnico) as rt,
      case
        when lower(btrim(coalesce(l.criado_por_email, ''), E' \t\n\r\f\v   ﻿')) = '' then 'Não informado'
        else coalesce(
               (select n.n from nomes n where n.e = lower(btrim(l.criado_por_email, E' \t\n\r\f\v   ﻿')) and n.n <> '' limit 1),
               public.mec_nome_sugerido(lower(btrim(l.criado_por_email, E' \t\n\r\f\v   ﻿'))))
      end as alim,
      public.mec_ou(l.nome_beneficiario) as prod,
      case when coalesce(l.sexo, '') ~* '^f' then 'Feminino' when coalesce(l.sexo, '') ~* '^m' then 'Masculino' else 'Não informado' end as sexo,
      public.mec_ou(l.estado_civil) as ec,
      public.mec_ou(l.possui_dap) as dap,
      public.mec_ou(l.associacao_cooperativa) as assoc,
      case when p_logado then public.mec_ou(l.endereco, '') else '' end as loc,
      public.mec_ou(l.nome_propriedade, '') as propr,
      coalesce((
        select json_agg(json_build_array(x.nome, x.area::float8, x.sis) order by x.o)
          from (
            select t.o, public.mec_ou(t.c ->> 'cultura', '') as nome, coalesce(public.mec_num(t.c -> 'area_ha'), 0) as area,
                   public.mec_ou(t.c ->> 'sistema_cultivo', '') as sis
              from jsonb_array_elements(case when jsonb_typeof(l.culturas) = 'array' then l.culturas else '[]'::jsonb end) with ordinality as t(c, o)
          ) x
         where x.nome <> ''
      ), '[]'::json) as cult,
      coalesce(l.area_total_ha, 0)::float8 as ha,
      coalesce(l.horas_maquina, 0)::float8 as hrs,
      coalesce(l.quantidade_acudes, 0) as ac,
      coalesce(l.piscicultura, false) as pisc,
      coalesce(l.destoca, false) as dest,
      public.mec_ou(l.tipo_uso) as tt,
      coalesce(to_json(array(select m from unnest(l.maquinas) m where m <> '')), '[]'::json) as maq,
      coalesce(to_json(array(select m from unnest(l.implementos) m where m <> '')), '[]'::json) as impl,
      coalesce((
        select sum(coalesce(public.mec_num(t.v -> 'valor'), 0))
          from jsonb_array_elements(case when jsonb_typeof(l.daes) = 'array' then l.daes else '[]'::jsonb end) as t(v)
      ), 0)::float8 as dae,
      case when p_logado and l.formulario_url is not null then l.formulario_url else '' end as form,
      public.mec_ou(l.observacao, '') as obs,
      (jsonb_typeof(l.pontos_geo) = 'array' and jsonb_array_length(l.pontos_geo) > 0) as tem_geo,
      case when p_logado then (
        select json_agg(json_build_array(g.x::float8, g.y::float8, g.z) order by g.o)
          from (
            select t.o, public.mec_num(t.p -> 'x') as x, public.mec_num(t.p -> 'y') as y,
                   coalesce(trunc(public.mec_num(t.p -> 'zona')), 0)::float8 as z
              from jsonb_array_elements(case when jsonb_typeof(l.pontos_geo) = 'array' then l.pontos_geo else '[]'::jsonb end) with ordinality as t(p, o)
          ) g
         where g.x is not null and g.y is not null and g.x > 0 and g.y > 0
      ) end as geo
    from public.mecanizacao_lancamentos l
  ), agg as (
    select
      coalesce(json_agg(
        case when p_logado then json_strip_nulls(json_build_object(   -- strip: sem pontos, a chave "geo" nem aparece
          'd', b.d, 'h', b.h, 'ex', b.ex, 'dv', b.dv, 'pc', b.pc, 'mun', b.mun, 'esc', b.esc, 'rt', b.rt, 'alim', b.alim,
          'prod', b.prod, 'sexo', b.sexo, 'ec', b.ec, 'dap', b.dap, 'assoc', b.assoc, 'loc', b.loc, 'propr', b.propr,
          'cult', b.cult, 'ha', b.ha, 'hrs', b.hrs, 'ac', b.ac, 'pisc', b.pisc, 'dest', b.dest, 'tt', b.tt, 'maq', b.maq, 'impl', b.impl, 'dae', b.dae,
          'form', b.form, 'obs', b.obs, 'geo', b.geo, 'id', b.id))
        else json_build_object(
          'd', b.d, 'h', b.h, 'ex', b.ex, 'dv', b.dv, 'pc', b.pc, 'mun', b.mun, 'esc', b.esc, 'rt', b.rt, 'alim', b.alim,
          'prod', b.prod, 'sexo', b.sexo, 'ec', b.ec, 'dap', b.dap, 'assoc', b.assoc, 'loc', b.loc, 'propr', b.propr,
          'cult', b.cult, 'ha', b.ha, 'hrs', b.hrs, 'ac', b.ac, 'pisc', b.pisc, 'dest', b.dest, 'tt', b.tt, 'maq', b.maq, 'impl', b.impl, 'dae', b.dae,
          'form', b.form, 'obs', b.obs) end
        order by b.criado_em, b.id), '[]'::json) as regs,
      count(*) as n,
      count(*) filter (where b.dv <> '' and left(b.dv, 4) <> left(b.d, 4)) as outro_ano,
      count(*) filter (where not b.tem_geo) as sem_geo,
      count(*) filter (where p_logado and b.form = '') as sem_form,
      count(distinct btrim(regexp_replace(lower(translate(b.prod,
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g'))) as produtores,
      (array_agg(b.d order by b.criado_em, b.id))[1] as primeiro,
      (array_agg(b.d order by b.criado_em desc, b.id desc))[1] as ultimo
    from b
  )
  select agg.regs,
         jsonb_build_object(
           'fonte', 'lancamentos', 'arquivo', 'lançamentos do sistema', 'aba', 'mecanizacao_lancamentos',
           'registros', agg.n, 'produtores', agg.produtores,
           'periodo', jsonb_build_array(coalesce(agg.primeiro, ''), coalesce(agg.ultimo, '')),
           'qualidade', jsonb_build_object('sem_data_valida', 0, 'vistoria_outro_ano', agg.outro_ano, 'sem_geo', agg.sem_geo,
                                           'sem_formulario', agg.sem_form, 'acudes_texto', 0))
    from agg;
end;
$$;
revoke all on function public.mecanizacao_painel_montar(boolean) from public, anon, authenticated;
grant execute on function public.mecanizacao_painel_montar(boolean) to service_role;

-- ------------------------------------------------------------------ leitura (com cache e versão)
-- p_versao: a versão que o navegador já tem; igual à atual => responde só { igual: true }.
create or replace function public.mecanizacao_painel(p_versao text default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  v_n bigint;
  v_logado boolean := false;
  v_chave text;
  v_ver text;
  v_registros json;
  v_meta jsonb;
  v_gerado text;
begin
  -- "logado" = JWT válido de um usuário que ainda existe e não está bloqueado (a função de borda fazia o mesmo via /auth/v1/user)
  if coalesce(auth.jwt() ->> 'email', '') <> '' then
    v_logado := exists (select 1 from auth.users u
                         where u.id = auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()));
  end if;
  v_chave := case when v_logado then 'i' else 'p' end;
  select ver.n into v_n from public.mecanizacao_versao ver where ver.id = 1;
  v_ver := v_n::text || '-' || v_chave;
  if p_versao is not null and p_versao = v_ver then
    return json_build_object('ok', true, 'igual', true, 'versao', v_ver);
  end if;
  select k.registros, k.meta into v_registros, v_meta
    from public.mecanizacao_painel_cache k where k.chave = v_chave and k.versao = v_n;
  if not found then
    select m.registros, m.meta into v_registros, v_meta from public.mecanizacao_painel_montar(v_logado) m;
    insert into public.mecanizacao_painel_cache as k (chave, versao, registros, meta)
      values (v_chave, v_n, v_registros, v_meta)
      on conflict (chave) do update
        set versao = excluded.versao, registros = excluded.registros, meta = excluded.meta, atualizado_em = now()
        where k.versao <= excluded.versao;
  end if;
  v_gerado := to_char(now() at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI');
  return json_build_object('ok', true, 'meta', v_meta || jsonb_build_object('gerado_em', v_gerado), 'registros', v_registros, 'versao', v_ver);
end;
$$;
revoke all on function public.mecanizacao_painel(text) from public;
grant execute on function public.mecanizacao_painel(text) to anon, authenticated, service_role;

-- O cache é só um derivado dos lançamentos (nenhum dado original): ao reaplicar este arquivo, descarta-se o que foi
-- montado com a regra antiga; a próxima leitura o refaz sozinha (~40 ms).
delete from public.mecanizacao_painel_cache;

commit;
