-- Executar no SQL Editor do mesmo projeto Supabase. Pode ser executado de novo.
--
-- Telefones da página Contatos (pages/contatos.html). Antes ficavam em data/contatos.json, gravado por
-- salvar_contatos.php (só funcionava no XAMPP). Agora ficam aqui: todo mundo lê (como o arquivo era público);
-- grava quem tem a página "contatos" liberada em Acessos, ou a conta responsável.
begin;

create table if not exists public.contatos_telefones (
  id text primary key,                 -- id da caixa no organograma (ex.: "dem", "el-rbo")
  telefone text not null check (telefone ~ '^[0-9]{8,15}$'),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

alter table public.contatos_telefones enable row level security;
revoke all on public.contatos_telefones from anon, authenticated;
grant select on public.contatos_telefones to anon, authenticated;
grant all on public.contatos_telefones to service_role;

drop policy if exists contatos_telefones_leitura on public.contatos_telefones;
create policy contatos_telefones_leitura on public.contatos_telefones
  for select to anon, authenticated using (true);

create or replace function public.pode_contatos()
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
        and 'contatos' = any (s.paginas)
    );
$$;
grant execute on function public.pode_contatos() to authenticated;

-- Telefone vazio remove o registro. Devolve só os dígitos gravados.
create or replace function public.contatos_salvar_telefone(p_id text, p_telefone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := btrim(coalesce(p_id, ''));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if not public.pode_contatos() then raise exception 'Sem autorização.'; end if;
  if v_id = '' or char_length(v_id) > 80 then raise exception 'Contato inválido.'; end if;
  if v_tel = '' then
    delete from public.contatos_telefones where id = v_id;
    return '';
  end if;
  if v_tel !~ '^[0-9]{8,15}$' then raise exception 'Telefone inválido.'; end if;
  insert into public.contatos_telefones (id, telefone, atualizado_por)
  values (v_id, v_tel, initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' ')))
  on conflict (id) do update
    set telefone = excluded.telefone, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  return v_tel;
end;
$$;
revoke all on function public.contatos_salvar_telefone(text, text) from public;
grant execute on function public.contatos_salvar_telefone(text, text) to authenticated;

commit;
