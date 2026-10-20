-- Liga/desliga o link público do painel de Mecanização. O estado fica no banco
-- (e não em arquivo no servidor PHP) porque o link da internet é servido pelo
-- GitHub Pages, que não roda PHP. Qualquer um lê o estado; só o responsável
-- (root) altera. Idempotente.
begin;

alter table public.mecanizacao_publico_config
  add column if not exists link_ativo boolean not null default true;

create or replace function public.mecanizacao_publico_config_publica()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'abas', coalesce(c.itens_publico, c.abas),
    'itens_publico', coalesce(c.itens_publico, c.abas),
    'itens_logado', c.itens_logado,
    'exige_senha', coalesce(c.senha_hash, '') <> '',
    'ativo', c.link_ativo)
    from public.mecanizacao_publico_config c where c.id = 1;
$$;
revoke all on function public.mecanizacao_publico_config_publica() from public;
grant execute on function public.mecanizacao_publico_config_publica() to anon, authenticated;

create or replace function public.mecanizacao_link_ativo_definir(p_ativo boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'root@root.com' then
    raise exception 'Somente o responsável pode ativar ou desativar o link público.' using errcode = '42501';
  end if;
  update public.mecanizacao_publico_config set
    link_ativo = coalesce(p_ativo, true),
    atualizado_em = now(),
    atualizado_por = auth.jwt() ->> 'email'
  where id = 1;
  return coalesce(p_ativo, true);
end;
$$;
revoke all on function public.mecanizacao_link_ativo_definir(boolean) from public, anon;
grant execute on function public.mecanizacao_link_ativo_definir(boolean) to authenticated;

commit;
