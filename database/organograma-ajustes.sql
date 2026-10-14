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

-- Data da última troca de responsável (nome/portaria). Mover caixa NÃO atualiza
-- esta coluna: é ela que vai no nome do arquivo e no rodapé do PDF baixado.
begin;
alter table public.organograma_ajustes add column if not exists holder_atualizado_em timestamptz;
update public.organograma_ajustes set holder_atualizado_em = atualizado_em
  where holder is not null and holder_atualizado_em is null;
commit;

-- Estrutura personalizável: nome/sigla/cor/tipo do setor, hierarquia (parent_id),
-- caixas novas (novo = true) e removidas (removido = true).
begin;
alter table public.organograma_ajustes
  add column if not exists parent_id text,
  add column if not exists titulo text,
  add column if not exists sigla text,
  add column if not exists cor text,          -- chave (purple|yellow|blue|green|orange) ou #rrggbb
  add column if not exists tipo text,         -- secretaria, diretoria, departamento, divisao, nucleo...
  add column if not exists removido boolean not null default false,
  add column if not exists novo boolean not null default false;
commit;

-- ============================================================================
-- Histórico de versões do organograma: desfazer e restaurar versões anteriores.
-- Cada alteração feita pelo modo Admin guarda antes um retrato (snapshot) da
-- tabela organograma_ajustes; só a conta responsável lê e usa.
-- ============================================================================
begin;

create table if not exists public.organograma_versoes (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  criado_por text,
  descricao text,
  snapshot jsonb not null            -- linhas de organograma_ajustes naquele momento
);

alter table public.organograma_versoes enable row level security;
drop policy if exists organograma_versoes_leitura on public.organograma_versoes;
create policy organograma_versoes_leitura on public.organograma_versoes
  for select to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com');
grant select on public.organograma_versoes to authenticated;
grant all on public.organograma_versoes to service_role;

create or replace function public.organograma_so_responsavel() returns void
language plpgsql stable as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'root@root.com' then
    raise exception 'Só a conta do responsável pode alterar o organograma.' using errcode = '42501';
  end if;
end $$;

-- guarda o estado atual como uma versão (chamado antes de cada alteração)
create or replace function public.organograma_salvar_versao(p_descricao text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare novo bigint;
begin
  perform public.organograma_so_responsavel();
  insert into public.organograma_versoes (criado_por, descricao, snapshot)
  values (lower(coalesce(auth.jwt() ->> 'email', '')), left(coalesce(p_descricao, 'Alteração'), 200),
          coalesce((select jsonb_agg(to_jsonb(a)) from public.organograma_ajustes a), '[]'::jsonb))
  returning id into novo;
  -- mantém só as 80 mais recentes
  delete from public.organograma_versoes
   where id not in (select id from public.organograma_versoes order by id desc limit 80);
  return novo;
end $$;

-- troca o conteúdo atual pelo da versão (uso interno)
create or replace function public.organograma_aplicar(p_snapshot jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.organograma_ajustes;
  insert into public.organograma_ajustes
    select * from jsonb_populate_recordset(null::public.organograma_ajustes, p_snapshot);
end $$;
revoke all on function public.organograma_aplicar(jsonb) from public, anon, authenticated;

-- desfaz a última alteração: volta ao estado guardado mais recente e descarta essa versão
create or replace function public.organograma_desfazer() returns bigint
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  perform public.organograma_so_responsavel();
  select * into v from public.organograma_versoes order by id desc limit 1;
  if v.id is null then
    raise exception 'Não há nada para desfazer.' using errcode = 'P0001';
  end if;
  perform public.organograma_aplicar(v.snapshot);
  delete from public.organograma_versoes where id = v.id;
  return v.id;
end $$;

-- volta a uma versão escolhida (o estado de agora vira uma versão antes, para poder voltar)
create or replace function public.organograma_restaurar(p_versao bigint) returns void
language plpgsql security definer set search_path = public as $$
declare snap jsonb;
begin
  perform public.organograma_so_responsavel();
  select snapshot into snap from public.organograma_versoes where id = p_versao;
  if snap is null then
    raise exception 'Versão não encontrada.' using errcode = 'P0001';
  end if;
  perform public.organograma_salvar_versao('Antes de restaurar a versão #' || p_versao);
  perform public.organograma_aplicar(snap);
end $$;

revoke all on function public.organograma_salvar_versao(text) from public, anon;
revoke all on function public.organograma_desfazer() from public, anon;
revoke all on function public.organograma_restaurar(bigint) from public, anon;
grant execute on function public.organograma_salvar_versao(text) to authenticated;
grant execute on function public.organograma_desfazer() to authenticated;
grant execute on function public.organograma_restaurar(bigint) to authenticated;

commit;

-- Cor do texto do título e do corpo da caixa (null = automático)
begin;
alter table public.organograma_ajustes
  add column if not exists cor_titulo text,
  add column if not exists cor_texto text;
commit;
