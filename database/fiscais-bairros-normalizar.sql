-- Executar no SQL Editor depois de fiscais-bairros.sql (idempotente, pode
-- rodar de novo sem problema).
--
-- Bairro digitado no cadastro de fiscais: se já existe no município —
-- comparando sem diferenciar maiúsculas, acentos e espaços ("sao francisco"
-- = "São  Francisco") — descarta o digitado e usa o nome do banco; se não
-- existe, inclui. Vale tanto pela função garantir_bairro() (chamada pelo
-- site ao salvar) quanto pelo gatilho em eleicoes_cadastros (rede de
-- segurança para qualquer outro caminho de gravação).
begin;

-- Sem depender da extensão unaccent: translate() é imutável, então pode
-- ser usado no índice único.
create or replace function public.normalizar_bairro(t text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(lower(translate(btrim(coalesce(t, '')),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g');
$$;

drop index if exists public.fiscais_bairros_unico;
create unique index if not exists fiscais_bairros_unico_norm
  on public.fiscais_bairros (municipio, public.normalizar_bairro(nome));

-- Limpa espaços do nome em qualquer gravação direta na tabela.
create or replace function public.fiscais_bairros_limpar_nome()
returns trigger
language plpgsql
as $$
begin
  new.nome := regexp_replace(btrim(new.nome), '\s+', ' ', 'g');
  return new;
end;
$$;
drop trigger if exists fiscais_bairros_limpar_nome on public.fiscais_bairros;
create trigger fiscais_bairros_limpar_nome
  before insert or update of nome on public.fiscais_bairros
  for each row execute function public.fiscais_bairros_limpar_nome();

-- Devolve o nome do bairro como está no banco; se não existe, cadastra e
-- devolve o nome digitado (já com espaços limpos). Texto sem nenhuma letra
-- (ex.: telefone digitado no campo errado) não é cadastrado — volta null.
create or replace function public.garantir_bairro(p_municipio text, p_nome text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  limpo text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  existente text;
begin
  if not public.eh_root_ou_aprovado() then
    raise exception 'Esta conta não tem autorização.' using errcode = '42501';
  end if;
  if limpo = '' or limpo !~ '[[:alpha:]]' or length(limpo) > 120 or coalesce(p_municipio, '') !~ '^\d{7}$' then
    return null;
  end if;
  select nome into existente from public.fiscais_bairros
    where municipio = p_municipio and public.normalizar_bairro(nome) = public.normalizar_bairro(limpo)
    limit 1;
  if existente is not null then
    return existente;
  end if;
  insert into public.fiscais_bairros (municipio, nome, criado_por)
    values (p_municipio, limpo, auth.uid())
    on conflict (municipio, public.normalizar_bairro(nome)) do nothing;
  -- Relê: se outra pessoa cadastrou o mesmo bairro no mesmo instante, vale o dela.
  select nome into existente from public.fiscais_bairros
    where municipio = p_municipio and public.normalizar_bairro(nome) = public.normalizar_bairro(limpo)
    limit 1;
  return existente;
end;
$$;
revoke all on function public.garantir_bairro(text, text) from public, anon;
grant execute on function public.garantir_bairro(text, text) to authenticated;

-- Gatilho do cadastro de fiscais passa a rodar ANTES de gravar: troca o
-- bairro digitado pelo nome do banco (ou cadastra, se é novo).
drop trigger if exists fiscais_bairros_do_cadastro on public.eleicoes_cadastros;
create or replace function public.fiscais_bairros_do_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limpo text := regexp_replace(btrim(coalesce(new.dados->>'bairro', '')), '\s+', ' ', 'g');
  existente text;
begin
  if limpo = '' or limpo !~ '[[:alpha:]]' or length(limpo) > 120 then
    return new;
  end if;
  select nome into existente from public.fiscais_bairros
    where municipio = new.dados->>'municipio' and public.normalizar_bairro(nome) = public.normalizar_bairro(limpo)
    limit 1;
  if existente is null then
    insert into public.fiscais_bairros (municipio, nome)
      values (new.dados->>'municipio', limpo)
      on conflict (municipio, public.normalizar_bairro(nome)) do nothing;
    existente := limpo;
  end if;
  new.dados := jsonb_set(new.dados, '{bairro}', to_jsonb(existente));
  return new;
end;
$$;
create trigger fiscais_bairros_do_cadastro
  before insert or update of dados on public.eleicoes_cadastros
  for each row execute function public.fiscais_bairros_do_cadastro();

commit;
