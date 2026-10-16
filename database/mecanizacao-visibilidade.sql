-- O que aparece no painel de Mecanização para (a) o público sem login e (b) usuários logados que NÃO são
-- o responsável (root). O responsável sempre vê tudo. Cada lista guarda as chaves das abas e das visões
-- de "Mostrar mais"; NULL = comportamento padrão. Só o responsável grava. Idempotente.
begin;

alter table public.mecanizacao_publico_config
  add column if not exists itens_publico text[],
  add column if not exists itens_logado text[];

-- a lista antiga de abas do link público vira a lista de itens do público
update public.mecanizacao_publico_config set itens_publico = abas
 where itens_publico is null and abas is not null;

create or replace function public.mecanizacao_publico_config_publica()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'abas', coalesce(c.itens_publico, c.abas),
    'itens_publico', coalesce(c.itens_publico, c.abas),
    'itens_logado', c.itens_logado,
    'exige_senha', coalesce(c.senha_hash, '') <> '')
    from public.mecanizacao_publico_config c where c.id = 1;
$$;
revoke all on function public.mecanizacao_publico_config_publica() from public;
grant execute on function public.mecanizacao_publico_config_publica() to anon, authenticated;

-- só o responsável. p_senha: null = manter, '' = remover a senha, texto = definir.
create or replace function public.mecanizacao_visibilidade_salvar(p_publico text[], p_logado text[], p_senha text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'root@root.com' then
    raise exception 'Somente o responsável pode configurar a visibilidade.' using errcode = '42501';
  end if;
  update public.mecanizacao_publico_config set
    itens_publico = p_publico,
    abas = p_publico,
    itens_logado = p_logado,
    senha_hash = case
      when p_senha is null then senha_hash
      when p_senha = '' then null
      else encode(sha256(convert_to('seagri-mec-publico:' || p_senha, 'utf8')), 'hex') end,
    atualizado_em = now(),
    atualizado_por = auth.jwt() ->> 'email'
  where id = 1;
end;
$$;
revoke all on function public.mecanizacao_visibilidade_salvar(text[], text[], text) from public, anon;
grant execute on function public.mecanizacao_visibilidade_salvar(text[], text[], text) to authenticated;

commit;
