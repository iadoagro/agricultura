-- Configuração do link público do painel de Mecanização: quais abas aparecem e senha opcional.
-- A senha é um CONTROLE LEVE de acesso (a página confere pelo banco antes de abrir); os dados públicos
-- do painel continuam sendo os de sempre. Só o responsável (root) grava. Idempotente.
begin;

create table if not exists public.mecanizacao_publico_config (
  id int primary key default 1 check (id = 1),
  abas text[],                 -- null = todas as abas públicas
  senha_hash text,             -- sha256('seagri-mec-publico:' || senha); vazio = sem senha
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
insert into public.mecanizacao_publico_config (id) values (1) on conflict do nothing;

alter table public.mecanizacao_publico_config enable row level security;
revoke all on public.mecanizacao_publico_config from anon, authenticated;
grant select, insert, update on public.mecanizacao_publico_config to authenticated;

drop policy if exists mecanizacao_publico_config_root on public.mecanizacao_publico_config;
create policy mecanizacao_publico_config_root on public.mecanizacao_publico_config for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'root@root.com');

-- o que a página pública pode saber: abas liberadas e se pede senha (nunca o hash)
create or replace function public.mecanizacao_publico_config_publica()
returns json language sql security definer set search_path = public as $$
  select json_build_object('abas', c.abas, 'exige_senha', coalesce(c.senha_hash, '') <> '')
    from public.mecanizacao_publico_config c where c.id = 1;
$$;
revoke all on function public.mecanizacao_publico_config_publica() from public;
grant execute on function public.mecanizacao_publico_config_publica() to anon, authenticated;

create or replace function public.mecanizacao_publico_verificar(p_senha text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(c.senha_hash, '') = ''
      or c.senha_hash = encode(sha256(convert_to('seagri-mec-publico:' || coalesce(p_senha, ''), 'utf8')), 'hex')
    from public.mecanizacao_publico_config c where c.id = 1;
$$;
revoke all on function public.mecanizacao_publico_verificar(text) from public;
grant execute on function public.mecanizacao_publico_verificar(text) to anon, authenticated;

-- só o responsável: p_senha null = manter a atual; '' = remover a senha
create or replace function public.mecanizacao_publico_salvar(p_abas text[], p_senha text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'root@root.com' then
    raise exception 'Somente o responsável pode configurar o link público.' using errcode = '42501';
  end if;
  update public.mecanizacao_publico_config set
    abas = case when p_abas is null or array_length(p_abas, 1) is null then null else p_abas end,
    senha_hash = case
      when p_senha is null then senha_hash
      when p_senha = '' then null
      else encode(sha256(convert_to('seagri-mec-publico:' || p_senha, 'utf8')), 'hex') end,
    atualizado_em = now(),
    atualizado_por = auth.jwt() ->> 'email'
  where id = 1;
end;
$$;
revoke all on function public.mecanizacao_publico_salvar(text[], text) from public, anon;
grant execute on function public.mecanizacao_publico_salvar(text[], text) to authenticated;

commit;
