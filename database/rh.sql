-- Executar no SQL Editor do mesmo projeto Supabase (depois de admin.sql e organograma-ajustes.sql). Pode ser executado de novo.
--
-- Módulo RH (pages/rh.html): os setores e quem é o responsável de cada um vêm sozinhos do organograma
-- (organograma_setores + organograma_ajustes). Aqui ficam só as PESSOAS ADICIONADAS DENTRO DOS SETORES pelo RH.
-- Lê e grava quem tem a página "rh" liberada em Acessos, ou a conta responsável (root).
-- Dado pessoal: ninguém lê a tabela direto, só pela sessão de quem tem acesso (policy abaixo); a escrita é só por função.
begin;

create table if not exists public.rh_pessoas (
  id uuid primary key default gen_random_uuid(),
  setor_id text not null,                 -- id da caixa no organograma (ex.: "dem", "el-rbo")
  nome text not null check (char_length(btrim(nome)) between 3 and 120),
  cargo text,
  matricula text,
  vinculo text check (vinculo is null or vinculo in ('efetivo','comissionado','terceirizado','cedido','estagiario','outro')),
  telefone text,
  email text,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists rh_pessoas_setor_idx on public.rh_pessoas (setor_id);

create or replace function public.pode_rh()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(trim(coalesce((select auth.jwt() ->> 'email'), ''))) = 'root@root.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = auth.uid()
        and s.status = 'aprovado'
        and coalesce(s.ativo, true) = true
        and 'rh' = any (s.paginas)
    );
$$;
grant execute on function public.pode_rh() to authenticated;

alter table public.rh_pessoas enable row level security;
revoke all on public.rh_pessoas from anon, authenticated;
grant select on public.rh_pessoas to authenticated;
grant all on public.rh_pessoas to service_role;
drop policy if exists "RH le pessoas" on public.rh_pessoas;
create policy "RH le pessoas" on public.rh_pessoas for select to authenticated using (public.pode_rh());

-- Cria (sem id) ou atualiza (com id) uma pessoa de um setor. Devolve o id.
create or replace function public.rh_salvar_pessoa(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_setor text := btrim(coalesce(p->>'setor_id', ''));
  v_nome text := regexp_replace(btrim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_tel text := regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g');
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_vinculo text := nullif(lower(btrim(coalesce(p->>'vinculo', ''))), '');
  v_por text := initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' '));
begin
  if not public.pode_rh() then raise exception 'Sem autorização.'; end if;
  if v_setor = '' or char_length(v_setor) > 80 then raise exception 'Escolha o setor.'; end if;
  if char_length(v_nome) < 3 or char_length(v_nome) > 120 then raise exception 'Informe o nome completo.'; end if;
  if v_vinculo is not null and v_vinculo not in ('efetivo','comissionado','terceirizado','cedido','estagiario','outro') then raise exception 'Vínculo inválido.'; end if;
  if v_tel <> '' and v_tel !~ '^[0-9]{8,15}$' then raise exception 'Telefone inválido.'; end if;
  if v_email <> '' and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 160) then raise exception 'E-mail inválido.'; end if;
  if v_id is null then
    insert into public.rh_pessoas (setor_id, nome, cargo, matricula, vinculo, telefone, email, observacao, criado_por, atualizado_por)
    values (v_setor, v_nome, nullif(left(btrim(coalesce(p->>'cargo', '')), 120), ''), nullif(left(btrim(coalesce(p->>'matricula', '')), 30), ''),
            v_vinculo, nullif(v_tel, ''), nullif(v_email, ''), nullif(left(btrim(coalesce(p->>'observacao', '')), 500), ''), v_por, v_por)
    returning id into v_id;
  else
    update public.rh_pessoas
       set setor_id = v_setor, nome = v_nome, cargo = nullif(left(btrim(coalesce(p->>'cargo', '')), 120), ''),
           matricula = nullif(left(btrim(coalesce(p->>'matricula', '')), 30), ''), vinculo = v_vinculo,
           telefone = nullif(v_tel, ''), email = nullif(v_email, ''), observacao = nullif(left(btrim(coalesce(p->>'observacao', '')), 500), ''),
           atualizado_em = now(), atualizado_por = v_por
     where id = v_id;
    if not found then raise exception 'Pessoa não encontrada.'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.rh_salvar_pessoa(jsonb) from public;
grant execute on function public.rh_salvar_pessoa(jsonb) to authenticated;

create or replace function public.rh_situacao_pessoa(p_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_rh() then raise exception 'Sem autorização.'; end if;
  update public.rh_pessoas set ativo = coalesce(p_ativo, true), atualizado_em = now(),
         atualizado_por = initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' '))
   where id = p_id;
end;
$$;
revoke all on function public.rh_situacao_pessoa(uuid, boolean) from public;
grant execute on function public.rh_situacao_pessoa(uuid, boolean) to authenticated;

create or replace function public.rh_excluir_pessoa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_rh() then raise exception 'Sem autorização.'; end if;
  delete from public.rh_pessoas where id = p_id;
end;
$$;
revoke all on function public.rh_excluir_pessoa(uuid) from public;
grant execute on function public.rh_excluir_pessoa(uuid) to authenticated;

commit;
