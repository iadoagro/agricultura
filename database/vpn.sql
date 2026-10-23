-- Executar no SQL Editor do mesmo projeto Supabase do admin.sql (idempotente: pode rodar de novo).
--
-- Módulo VPN: qualquer pessoa, SEM login, preenche o formulário público (pages/vpn-formulario.html)
-- com nome, CPF, RG, data de nascimento, e-mail funcional, matrícula, setor e a foto/PDF do
-- documento de identificação. Quem tem "vpn" liberado em Acessos (ou root@root.com) vê as
-- solicitações na página VPN do menu e abre o documento.
--
-- Dados pessoais: a tabela e o bucket de documentos ficam fechados para o público (anon só envia,
-- nunca lê). O envio é feito pela função enviar_vpn_solicitacao; a equipe lê pelas policies abaixo.
begin;

create table if not exists public.vpn_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  nome text not null,
  cpf text not null,
  rg text not null,
  data_nascimento date not null,
  email_funcional text not null,
  matricula text not null,
  setor text not null,
  documento_path text not null,
  documento_nome text,
  status text not null default 'pendente' check (status in ('pendente','atendida','recusada')),
  atualizado_por text,
  atualizado_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.vpn_solicitacoes add column if not exists whatsapp text;
alter table public.vpn_solicitacoes add column if not exists observacoes text;
alter table public.vpn_solicitacoes add column if not exists visto_em timestamptz;   -- null = "Novo" (ninguém da equipe abriu ainda)
alter table public.vpn_solicitacoes add column if not exists visto_por text;
alter table public.vpn_solicitacoes add column if not exists cargo text;   -- cargo/função: só para efetivo (os demais saem como CAS no termo)
alter table public.vpn_solicitacoes add column if not exists termo_path text;   -- termo preenchido (PDF) para a pessoa baixar, no bucket vpn-termos
alter table public.vpn_solicitacoes add column if not exists vinculo text;
alter table public.vpn_solicitacoes drop constraint if exists vpn_solicitacoes_vinculo_check;
alter table public.vpn_solicitacoes add constraint vpn_solicitacoes_vinculo_check
  check (vinculo is null or vinculo in ('efetivo','comissionado','terceirizado'));
alter table public.vpn_solicitacoes alter column matricula drop not null;
create index if not exists vpn_solicitacoes_status_idx on public.vpn_solicitacoes (status, criado_em desc);
create index if not exists vpn_solicitacoes_cpf_idx on public.vpn_solicitacoes (cpf);

alter table public.vpn_solicitacoes enable row level security;
revoke all on public.vpn_solicitacoes from anon, authenticated;
grant select on public.vpn_solicitacoes to authenticated;

-- ------------------------------------------------------------ quem é da equipe
create or replace function public.pode_vpn()
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
        and 'vpn' = any (s.paginas)
    );
$$;
grant execute on function public.pode_vpn() to authenticated;

drop policy if exists "Equipe le vpn" on public.vpn_solicitacoes;
create policy "Equipe le vpn" on public.vpn_solicitacoes
  for select to authenticated using (public.pode_vpn());

-- ------------------------------------------------------------------ documentos
-- Bucket privado: 3 MB por arquivo, só imagem ou PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vpn-documentos', 'vpn-documentos', false, 3145728,
        array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

-- O público só ENVIA (insert); não lista nem baixa. A equipe lê.
drop policy if exists "Equipe le documento vpn" on storage.objects;
create policy "Equipe le documento vpn" on storage.objects
  for select to authenticated using (bucket_id = 'vpn-documentos' and public.pode_vpn());

-- ------------------------------------------------ nome próprio e duplicidade
-- Nome sempre com iniciais maiúsculas (nunca tudo maiúsculo); de/da/do/das/dos/e ficam minúsculas.
create or replace function public.vpn_nome_proprio(n text)
returns text
language plpgsql
immutable
as $$
declare
  r text := '';
  w text;
  i int := 0;
begin
  foreach w in array regexp_split_to_array(btrim(coalesce(n, '')), '\s+') loop
    i := i + 1;
    w := initcap(lower(w));
    if i > 1 and lower(w) in ('de','da','do','das','dos','e') then w := lower(w); end if;
    r := r || case when i > 1 then ' ' else '' end || w;
  end loop;
  return r;
end;
$$;

-- Chave para comparar nomes sem diferença de maiúscula, acento ou espaço duplo.
create or replace function public.vpn_chave_nome(n text)
returns text
language sql
immutable
as $$
  select translate(lower(regexp_replace(btrim(coalesce(n, '')), '\s+', ' ', 'g')),
                   'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
$$;

-- O formulário consulta antes de enviar o documento: já existe cadastro com este CPF e/ou nome?
create or replace function public.vpn_verificar_duplicado(p_cpf text, p_nome text, p_ignorar uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cpf', exists (select 1 from public.vpn_solicitacoes
                    where cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') and (p_ignorar is null or id <> p_ignorar)),
    'nome', exists (select 1 from public.vpn_solicitacoes
                     where public.vpn_chave_nome(nome) = public.vpn_chave_nome(p_nome) and (p_ignorar is null or id <> p_ignorar))
  );
$$;
revoke all on function public.vpn_verificar_duplicado(text, text, uuid) from public;
grant execute on function public.vpn_verificar_duplicado(text, text, uuid) to anon, authenticated;

-- Corrige os nomes já gravados (ex.: JOÃO PAULO -> João Paulo)
update public.vpn_solicitacoes set nome = public.vpn_nome_proprio(nome) where nome <> public.vpn_nome_proprio(nome);

-- ------------------------------------------------------ configuração do link público
-- Uma linha só: link ativo/desativado e senha de acesso opcional (liga/desliga na página VPN, só o root).
create table if not exists public.vpn_config (
  id int primary key default 1 check (id = 1),
  link_ativo boolean not null default true,
  senha_ativa boolean not null default false,
  senha text not null default '221830',
  atualizado_em timestamptz,
  atualizado_por text
);
insert into public.vpn_config (id) values (1) on conflict (id) do nothing;
alter table public.vpn_config enable row level security;
revoke all on public.vpn_config from anon, authenticated;

create or replace function public.vpn_link_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select link_ativo from public.vpn_config where id = 1), true);
$$;
grant execute on function public.vpn_link_ativo() to anon, authenticated;

-- O formulário pergunta: o link está ativo? exige senha?
create or replace function public.vpn_config_publica()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ativo', link_ativo, 'senha', senha_ativa) from public.vpn_config where id = 1;
$$;
grant execute on function public.vpn_config_publica() to anon, authenticated;

create or replace function public.vpn_verificar_senha(p_senha text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.vpn_config
                  where id = 1 and link_ativo and (not senha_ativa or senha = coalesce(p_senha, '')));
$$;
grant execute on function public.vpn_verificar_senha(text) to anon, authenticated;

create or replace function public.vpn_config_ler()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  return (select jsonb_build_object('link_ativo', link_ativo, 'senha_ativa', senha_ativa) from public.vpn_config where id = 1);
end;
$$;
revoke all on function public.vpn_config_ler() from public;
grant execute on function public.vpn_config_ler() to authenticated;

create or replace function public.vpn_config_salvar(p_link_ativo boolean, p_senha_ativa boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce((select auth.jwt() ->> 'email'), ''))) <> 'root@root.com' then raise exception 'Só o responsável altera isto.'; end if;
  update public.vpn_config
     set link_ativo = coalesce(p_link_ativo, link_ativo), senha_ativa = coalesce(p_senha_ativa, senha_ativa),
         atualizado_em = now(),
         atualizado_por = initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' '))
   where id = 1;
end;
$$;
revoke all on function public.vpn_config_salvar(boolean, boolean) from public;
grant execute on function public.vpn_config_salvar(boolean, boolean) to authenticated;

-- Com o link desativado, ninguém envia documento nem solicitação.
drop policy if exists "Publico envia documento vpn" on storage.objects;
create policy "Publico envia documento vpn" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'vpn-documentos' and public.vpn_link_ativo());

-- -------------------------------------------------------------- função pública
create or replace function public.enviar_vpn_solicitacao(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := public.vpn_nome_proprio(p->>'nome');
  v_cpf text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_rg text := btrim(coalesce(p->>'rg', ''));
  v_email text := lower(btrim(coalesce(p->>'email_funcional', '')));
  v_mat text := btrim(coalesce(p->>'matricula', ''));
  v_cargo text := btrim(coalesce(p->>'cargo', ''));
  v_setor text := btrim(coalesce(p->>'setor', ''));
  v_zap text := regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g');
  v_vinculo text := lower(btrim(coalesce(p->>'vinculo', '')));
  v_doc text := coalesce(p->>'documento', '');
  v_nasc date;
  v_id uuid;
  v_num bigint;
begin
  if not public.vpn_link_ativo() then raise exception 'Este formulário está desativado.'; end if;
  if exists (select 1 from public.vpn_config where id = 1 and senha_ativa and senha <> coalesce(p->>'senha', '')) then
    raise exception 'Senha incorreta.';
  end if;
  begin
    v_nasc := (p->>'data_nascimento')::date;
  exception when others then
    raise exception 'Data de nascimento inválida.';
  end;
  if char_length(v_nome) < 5 or char_length(v_nome) > 120 then raise exception 'Informe o nome completo.'; end if;
  if char_length(v_cpf) <> 11 or v_cpf ~ '^(\d)\1{10}$' then raise exception 'CPF inválido.'; end if;
  if exists (select 1 from public.vpn_solicitacoes where cpf = v_cpf) then raise exception 'Já existe um cadastro com este CPF.'; end if;
  if exists (select 1 from public.vpn_solicitacoes where public.vpn_chave_nome(nome) = public.vpn_chave_nome(v_nome)) then raise exception 'Já existe um cadastro com este nome.'; end if;
  if char_length(v_rg) < 3 or char_length(v_rg) > 30 then raise exception 'Informe o RG.'; end if;
  if v_nasc is null or v_nasc > current_date - interval '14 years' or v_nasc < date '1900-01-01' then
    raise exception 'Data de nascimento inválida.';
  end if;
  if v_email !~ '^[^@\s]+@ac\.gov\.br$' or char_length(v_email) > 160 then raise exception 'Use o e-mail funcional, que termina com @ac.gov.br.'; end if;
  if v_zap !~ '^\d{2}9?\d{8}$' then raise exception 'Informe o WhatsApp com DDD.'; end if;
  if v_vinculo not in ('efetivo','comissionado','terceirizado') then raise exception 'Informe se é efetivo, comissionado ou terceirizado.'; end if;
  if char_length(v_mat) > 30 or (v_vinculo in ('efetivo','comissionado') and char_length(v_mat) < 1) then raise exception 'Informe a matrícula.'; end if;
  if v_vinculo = 'efetivo' and (char_length(v_cargo) < 2 or char_length(v_cargo) > 120) then raise exception 'Informe o cargo.'; end if;
  if char_length(v_setor) < 2 or char_length(v_setor) > 120 then raise exception 'Informe o setor.'; end if;
  if not (v_doc ~ '^drive:[A-Za-z0-9_-]{10,}$' or exists (select 1 from storage.objects where bucket_id = 'vpn-documentos' and name = v_doc)) then
    raise exception 'Envie o documento de identificação com foto.';
  end if;
  if exists (select 1 from public.vpn_solicitacoes where documento_path = v_doc) then
    raise exception 'Este envio já foi registrado.';
  end if;

  insert into public.vpn_solicitacoes (nome, cpf, rg, data_nascimento, email_funcional, whatsapp, vinculo, matricula, cargo, setor, documento_path, documento_nome)
  values (v_nome, v_cpf, v_rg, v_nasc, v_email, v_zap, v_vinculo, v_mat, case when v_vinculo = 'efetivo' then v_cargo end, v_setor, v_doc, nullif(left(btrim(coalesce(p->>'documento_nome', '')), 160), ''))
  returning id, numero into v_id, v_num;
  return jsonb_build_object('numero', v_num);
end;
$$;
revoke all on function public.enviar_vpn_solicitacao(jsonb) from public;
grant execute on function public.enviar_vpn_solicitacao(jsonb) to anon, authenticated;

-- -------------------------------------------------------------- função da equipe
create or replace function public.vpn_atualizar_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  if p_status not in ('pendente','atendida','recusada') then raise exception 'Situação inválida.'; end if;
  update public.vpn_solicitacoes
     set status = p_status,
         atualizado_por = initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' ')),
         atualizado_em = now()
   where id = p_id;
end;
$$;
revoke all on function public.vpn_atualizar_status(uuid, text) from public;
grant execute on function public.vpn_atualizar_status(uuid, text) to authenticated;

-- ----------------------------------------------- edição pela equipe (dados + observações)
create or replace function public.vpn_editar(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := public.vpn_nome_proprio(p->>'nome');
  v_cpf text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_rg text := btrim(coalesce(p->>'rg', ''));
  v_email text := lower(btrim(coalesce(p->>'email_funcional', '')));
  v_zap text := regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g');
  v_mat text := btrim(coalesce(p->>'matricula', ''));
  v_cargo text := btrim(coalesce(p->>'cargo', ''));
  v_setor text := btrim(coalesce(p->>'setor', ''));
  v_vinculo text := lower(btrim(coalesce(p->>'vinculo', '')));
  v_obs text := nullif(left(btrim(coalesce(p->>'observacoes', '')), 2000), '');
  v_nasc date;
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  begin
    v_nasc := (p->>'data_nascimento')::date;
  exception when others then
    raise exception 'Data de nascimento inválida.';
  end;
  if char_length(v_nome) < 5 or char_length(v_nome) > 120 then raise exception 'Informe o nome completo.'; end if;
  if char_length(v_cpf) <> 11 or v_cpf ~ '^(\d)\1{10}$' then raise exception 'CPF inválido.'; end if;
  if exists (select 1 from public.vpn_solicitacoes where cpf = v_cpf and id <> p_id) then raise exception 'Já existe outro cadastro com este CPF.'; end if;
  if exists (select 1 from public.vpn_solicitacoes where public.vpn_chave_nome(nome) = public.vpn_chave_nome(v_nome) and id <> p_id) then raise exception 'Já existe outro cadastro com este nome.'; end if;
  if char_length(v_rg) < 3 or char_length(v_rg) > 30 then raise exception 'Informe o RG.'; end if;
  if v_nasc is null or v_nasc < date '1900-01-01' or v_nasc > current_date then raise exception 'Data de nascimento inválida.'; end if;
  if v_email !~ '^[^@\s]+@ac\.gov\.br$' or char_length(v_email) > 160 then raise exception 'Use o e-mail funcional, que termina com @ac.gov.br.'; end if;
  if v_zap !~ '^\d{2}9?\d{8}$' then raise exception 'Informe o WhatsApp com DDD.'; end if;
  if v_vinculo not in ('efetivo','comissionado','terceirizado') then raise exception 'Informe o vínculo.'; end if;
  if v_vinculo in ('efetivo','comissionado') and char_length(v_mat) < 1 then raise exception 'Informe a matrícula.'; end if;
  if char_length(v_mat) > 30 then raise exception 'Matrícula muito longa.'; end if;
  if v_vinculo = 'efetivo' and (char_length(v_cargo) < 2 or char_length(v_cargo) > 120) then raise exception 'Informe o cargo.'; end if;
  if char_length(v_setor) < 2 or char_length(v_setor) > 120 then raise exception 'Informe o setor.'; end if;
  update public.vpn_solicitacoes
     set nome = v_nome, cpf = v_cpf, rg = v_rg, data_nascimento = v_nasc, email_funcional = v_email,
         whatsapp = v_zap, vinculo = v_vinculo, matricula = v_mat, cargo = case when v_vinculo = 'efetivo' then v_cargo end, setor = v_setor, observacoes = v_obs,
         atualizado_por = initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' ')),
         atualizado_em = now()
   where id = p_id;
end;
$$;
revoke all on function public.vpn_editar(uuid, jsonb) from public;
grant execute on function public.vpn_editar(uuid, jsonb) to authenticated;

-- ------------------------------------------- arquivos enviados depois do cadastro
-- Quem já se cadastrou volta ao link, se identifica (CPF + data de nascimento) e envia outro arquivo.
create table if not exists public.vpn_anexos (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.vpn_solicitacoes (id) on delete cascade,
  arquivo_path text not null,
  arquivo_nome text,
  criado_em timestamptz not null default now()
);
alter table public.vpn_anexos add column if not exists assinado_servidor boolean;
alter table public.vpn_anexos add column if not exists assinado_secretaria boolean;
alter table public.vpn_anexos add column if not exists origem text not null default 'publico';   -- 'publico' = a pessoa enviou pelo link; 'equipe' = o operador anexou (recebeu por fora)
alter table public.vpn_anexos add column if not exists enviado_por text;   -- quem da equipe anexou (origem 'equipe')
alter table public.vpn_anexos drop constraint if exists vpn_anexos_origem_check;
alter table public.vpn_anexos add constraint vpn_anexos_origem_check check (origem in ('publico','equipe'));
create index if not exists vpn_anexos_solicitacao_idx on public.vpn_anexos (solicitacao_id, criado_em);
alter table public.vpn_anexos enable row level security;
revoke all on public.vpn_anexos from anon, authenticated;
grant select on public.vpn_anexos to authenticated;
drop policy if exists "Equipe le anexos vpn" on public.vpn_anexos;
create policy "Equipe le anexos vpn" on public.vpn_anexos for select to authenticated using (public.pode_vpn());

-- Termos preenchidos (PDF): bucket PRIVADO. Só o responsável (root) baixa, pela página VPN (link assinado).
-- Quem grava os arquivos é a equipe técnica, com a chave de serviço.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vpn-termos', 'vpn-termos', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];
drop policy if exists "Root le termos vpn" on storage.objects;
create policy "Root le termos vpn" on storage.objects
  for select to authenticated
  using (bucket_id = 'vpn-termos' and lower(trim(coalesce((select auth.jwt() ->> 'email'), ''))) = 'root@root.com');

-- link ativo e senha (quando exigida) valem para toda chamada pública
create or replace function public.vpn_exige_acesso(p_senha text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.vpn_link_ativo() then raise exception 'Este formulário está desativado.'; end if;
  if exists (select 1 from public.vpn_config where id = 1 and senha_ativa and senha <> coalesce(p_senha, '')) then
    raise exception 'Senha incorreta.';
  end if;
end;
$$;

-- "Quem é você?": CPF + data de nascimento. Devolve só o primeiro nome (nenhum outro dado).
create or replace function public.vpn_identificar(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cpf text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_nasc date;
  v_nome text;
begin
  perform public.vpn_exige_acesso(p->>'senha');
  begin
    v_nasc := (p->>'data_nascimento')::date;
  exception when others then
    return jsonb_build_object('encontrado', false);
  end;
  select split_part(nome, ' ', 1) into v_nome from public.vpn_solicitacoes
   where cpf = v_cpf and data_nascimento = v_nasc order by criado_em limit 1;
  if v_nome is null then return jsonb_build_object('encontrado', false); end if;
  -- 'bloqueado': a equipe já anexou o termo assinado (recebido por fora); a pessoa não precisa enviar de novo
  return jsonb_build_object('encontrado', true, 'nome', v_nome,
    'bloqueado', exists (select 1 from public.vpn_anexos x join public.vpn_solicitacoes q on q.id = x.solicitacao_id
                          where q.cpf = v_cpf and q.data_nascimento = v_nasc and x.origem = 'equipe'));
end;
$$;
revoke all on function public.vpn_identificar(jsonb) from public;
grant execute on function public.vpn_identificar(jsonb) to anon, authenticated;

create or replace function public.vpn_enviar_anexo(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_doc text := coalesce(p->>'arquivo', '');
  v_nasc date;
  v_id uuid;
begin
  perform public.vpn_exige_acesso(p->>'senha');
  begin
    v_nasc := (p->>'data_nascimento')::date;
  exception when others then
    raise exception 'Não encontramos cadastro com estes dados.';
  end;
  select id into v_id from public.vpn_solicitacoes where cpf = v_cpf and data_nascimento = v_nasc order by criado_em limit 1;
  if v_id is null then raise exception 'Não encontramos cadastro com estes dados.'; end if;
  if exists (select 1 from public.vpn_anexos where solicitacao_id = v_id and origem = 'equipe') then
    raise exception 'O termo assinado já foi recebido pela equipe. Não é preciso enviar de novo.';
  end if;
  if coalesce(p->>'assinado_servidor', '') <> 'true' or coalesce(p->>'assinado_secretaria', '') <> 'true' then
    raise exception 'O termo precisa estar assinado pelo servidor e pela secretaria.';
  end if;
  if not (v_doc ~ '^drive:[A-Za-z0-9_-]{10,}$' or exists (select 1 from storage.objects where bucket_id = 'vpn-documentos' and name = v_doc)) then
    raise exception 'Envie o arquivo.';
  end if;
  if exists (select 1 from public.vpn_anexos where arquivo_path = v_doc) or exists (select 1 from public.vpn_solicitacoes where documento_path = v_doc) then
    raise exception 'Este envio já foi registrado.';
  end if;
  insert into public.vpn_anexos (solicitacao_id, arquivo_path, arquivo_nome, assinado_servidor, assinado_secretaria)
  values (v_id, v_doc, nullif(left(btrim(coalesce(p->>'arquivo_nome', '')), 160), ''), true, true);
  update public.vpn_solicitacoes set visto_em = null, visto_por = null where id = v_id;   -- volta a aparecer como "Novo"
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.vpn_enviar_anexo(jsonb) from public;
grant execute on function public.vpn_enviar_anexo(jsonb) to anon, authenticated;

-- Só o responsável (root) apaga um arquivo enviado na segunda fase; o arquivo em si sai pela API de Storage.
create or replace function public.vpn_excluir_anexo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if lower(trim(coalesce((select auth.jwt() ->> 'email'), ''))) <> 'root@root.com' then raise exception 'Só o responsável apaga arquivos enviados.'; end if;
  delete from public.vpn_anexos where id = p_id returning arquivo_path into v_path;
  return v_path;
end;
$$;
revoke all on function public.vpn_excluir_anexo(uuid) from public;
grant execute on function public.vpn_excluir_anexo(uuid) to authenticated;

-- ------------------------------------------------------------ "Novo" até alguém da equipe ver
create or replace function public.vpn_marcar_visto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  update public.vpn_solicitacoes
     set visto_em = now(),
         visto_por = initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' '))
   where id = p_id and visto_em is null;
end;
$$;
revoke all on function public.vpn_marcar_visto(uuid) from public;
grant execute on function public.vpn_marcar_visto(uuid) to authenticated;

-- ------------------------------------------------------------ exclusão pela equipe
-- O arquivo do documento é apagado pela API de Storage (policy abaixo); aqui sai o registro.
drop policy if exists "Equipe exclui documento vpn" on storage.objects;
create policy "Equipe exclui documento vpn" on storage.objects
  for delete to authenticated using (bucket_id = 'vpn-documentos' and public.pode_vpn());

create or replace function public.vpn_excluir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  delete from public.vpn_solicitacoes where id = p_id;
end;
$$;
revoke all on function public.vpn_excluir(uuid) from public;
grant execute on function public.vpn_excluir(uuid) to authenticated;

-- ------------------------------------------------ documento de abertura de chamado
-- Qualquer pessoa com "vpn" liberado em Acessos (pode_vpn) anexa, troca ou remove o PDF do chamado
-- (até 2 MB) na solicitação de uma pessoa. Um documento por solicitação; um novo substitui o anterior.
alter table public.vpn_solicitacoes add column if not exists chamado_path text;
alter table public.vpn_solicitacoes add column if not exists chamado_nome text;
alter table public.vpn_solicitacoes add column if not exists chamado_em timestamptz;
alter table public.vpn_solicitacoes add column if not exists chamado_por text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vpn-chamados', 'vpn-chamados', false, 2097152, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['application/pdf'];

drop policy if exists "Equipe le chamado vpn" on storage.objects;
create policy "Equipe le chamado vpn" on storage.objects
  for select to authenticated using (bucket_id = 'vpn-chamados' and public.pode_vpn());
drop policy if exists "Equipe envia chamado vpn" on storage.objects;
create policy "Equipe envia chamado vpn" on storage.objects
  for insert to authenticated with check (bucket_id = 'vpn-chamados' and public.pode_vpn());
drop policy if exists "Equipe exclui chamado vpn" on storage.objects;
create policy "Equipe exclui chamado vpn" on storage.objects
  for delete to authenticated using (bucket_id = 'vpn-chamados' and public.pode_vpn());

-- Registra o arquivo já enviado ao bucket; devolve o caminho do anterior (a página apaga o arquivo antigo).
create or replace function public.vpn_registrar_chamado(p_id uuid, p_path text, p_nome text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antigo text;
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  if not exists (select 1 from public.vpn_solicitacoes where id = p_id) then raise exception 'Solicitação não encontrada.'; end if;
  if coalesce(p_path, '') !~ ('^(' || p_id::text || '/|drive:[A-Za-z0-9_-]{10,}$)') then raise exception 'Arquivo inválido.'; end if;   -- 'drive:<id>' = arquivo na pasta do Drive
  if not (p_path ~ '^drive:' or exists (select 1 from storage.objects where bucket_id = 'vpn-chamados' and name = p_path)) then
    raise exception 'Envie o arquivo do chamado.';
  end if;
  select chamado_path into v_antigo from public.vpn_solicitacoes where id = p_id;
  update public.vpn_solicitacoes
     set chamado_path = p_path, chamado_nome = nullif(left(btrim(coalesce(p_nome, '')), 160), ''),
         chamado_em = now(),
         chamado_por = initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' '))
   where id = p_id;
  return case when v_antigo is distinct from p_path then v_antigo end;
end;
$$;
revoke all on function public.vpn_registrar_chamado(uuid, text, text) from public;
grant execute on function public.vpn_registrar_chamado(uuid, text, text) to authenticated;

-- Remove o vínculo; devolve o caminho para a página apagar o arquivo.
create or replace function public.vpn_remover_chamado(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antigo text;
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  select chamado_path into v_antigo from public.vpn_solicitacoes where id = p_id;
  update public.vpn_solicitacoes set chamado_path = null, chamado_nome = null, chamado_em = null, chamado_por = null where id = p_id;
  return v_antigo;
end;
$$;
revoke all on function public.vpn_remover_chamado(uuid) from public;
grant execute on function public.vpn_remover_chamado(uuid) to authenticated;

-- ------------------------------------------------ termo assinado anexado pela equipe
-- O operador recebeu o termo assinado por fora do sistema (e-mail, WhatsApp, papel) e anexa na solicitação.
-- Depois disso a pessoa não consegue mais enviar pelo link público (ver vpn_identificar / vpn_enviar_anexo).
drop policy if exists "Equipe envia documento vpn" on storage.objects;
create policy "Equipe envia documento vpn" on storage.objects
  for insert to authenticated with check (bucket_id = 'vpn-documentos' and public.pode_vpn());

create or replace function public.vpn_anexar_termo_equipe(p_id uuid, p_path text, p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  if not exists (select 1 from public.vpn_solicitacoes where id = p_id) then raise exception 'Solicitação não encontrada.'; end if;
  if not (coalesce(p_path, '') ~ '^drive:[A-Za-z0-9_-]{10,}$' or exists (select 1 from storage.objects where bucket_id = 'vpn-documentos' and name = p_path)) then
    raise exception 'Envie o arquivo.';
  end if;
  if exists (select 1 from public.vpn_anexos where arquivo_path = p_path) or exists (select 1 from public.vpn_solicitacoes where documento_path = p_path) then
    raise exception 'Este envio já foi registrado.';
  end if;
  insert into public.vpn_anexos (solicitacao_id, arquivo_path, arquivo_nome, assinado_servidor, assinado_secretaria, origem, enviado_por)
  values (p_id, p_path, nullif(left(btrim(coalesce(p_nome, '')), 160), ''), true, true, 'equipe',
          initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' ')));
end;
$$;
revoke all on function public.vpn_anexar_termo_equipe(uuid, text, text) from public;
grant execute on function public.vpn_anexar_termo_equipe(uuid, text, text) to authenticated;

-- ------------------------------------------------ downloads do termo para assinatura
-- Cada vez que alguém da equipe baixa o termo (individual ou em lote), grava quem, quando e como.
create table if not exists public.vpn_termo_downloads (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.vpn_solicitacoes (id) on delete cascade,
  baixado_por text,
  baixado_em timestamptz not null default now(),
  forma text not null default 'individual' check (forma in ('individual','lote'))
);
create index if not exists vpn_termo_downloads_idx on public.vpn_termo_downloads (solicitacao_id, baixado_em desc);
alter table public.vpn_termo_downloads enable row level security;
revoke all on public.vpn_termo_downloads from anon, authenticated;
grant select on public.vpn_termo_downloads to authenticated;
drop policy if exists "Equipe le downloads de termo vpn" on public.vpn_termo_downloads;
create policy "Equipe le downloads de termo vpn" on public.vpn_termo_downloads for select to authenticated using (public.pode_vpn());

create or replace function public.vpn_registrar_download_termo(p_ids uuid[], p_forma text default 'individual')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_por text := initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' '));
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  insert into public.vpn_termo_downloads (solicitacao_id, baixado_por, forma)
  select s.id, v_por, case when p_forma = 'lote' then 'lote' else 'individual' end
    from public.vpn_solicitacoes s where s.id = any (coalesce(p_ids, '{}'));
end;
$$;
revoke all on function public.vpn_registrar_download_termo(uuid[], text) from public;
grant execute on function public.vpn_registrar_download_termo(uuid[], text) to authenticated;

-- ------------------------------------------------ quem chamou no WhatsApp
-- O clique no número do WhatsApp (página VPN) assume o atendimento: grava quem foi e quando (ver a regra dos 3 minutos abaixo).
alter table public.vpn_solicitacoes add column if not exists whatsapp_por text;
alter table public.vpn_solicitacoes add column if not exists whatsapp_em timestamptz;

alter table public.vpn_solicitacoes add column if not exists whatsapp_email text;   -- quem está com o atendimento (para comparar com quem clica)

-- (DESLIGADO por enquanto: v_exclusivo = false abaixo; o último operador a clicar/baixar fica como atendente.)
-- Um atendente de cada vez: o primeiro que clica no número assume o atendimento por 3 minutos.
-- Outro operador só consegue assumir depois desse prazo sem o primeiro atender; quem já é o atendente renova o prazo.
-- Devolve {ok, por, em, restante}: ok=false quando outra pessoa está com o atendimento (restante = segundos até liberar).
drop function if exists public.vpn_registrar_whatsapp(uuid);
create or replace function public.vpn_registrar_whatsapp(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce((select auth.jwt() ->> 'email'), '')));
  v_por text := initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' '));
  v_exclusivo constant boolean := false;   -- false = regra de um atendente por vez DESLIGADA (qualquer operador assume; vale o último); true = bloqueia por 3 minutos
  r record;
begin
  if not public.pode_vpn() then raise exception 'Sem autorização.'; end if;
  select whatsapp_email, whatsapp_por, whatsapp_em into r from public.vpn_solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_exclusivo and r.whatsapp_em is not null and r.whatsapp_por is not null
     and r.whatsapp_em > now() - interval '3 minutes'
     and coalesce(r.whatsapp_email, '') <> v_email then
    return jsonb_build_object('ok', false, 'por', r.whatsapp_por, 'em', r.whatsapp_em,
      'restante', greatest(1, ceil(extract(epoch from (r.whatsapp_em + interval '3 minutes' - now())))::int));
  end if;
  update public.vpn_solicitacoes set whatsapp_por = v_por, whatsapp_em = now(), whatsapp_email = v_email where id = p_id;
  return jsonb_build_object('ok', true, 'por', v_por, 'em', now());
end;
$$;
revoke all on function public.vpn_registrar_whatsapp(uuid) from public;
grant execute on function public.vpn_registrar_whatsapp(uuid) to authenticated;

commit;

-- ------------------------------------------------ arquivos na pasta do Drive
-- Os caminhos guardados (documento_path, chamado_path, termo_path, vpn_anexos.arquivo_path) passam a aceitar
-- "drive:<id>" (arquivo na pasta do Drive, ver drive/CONFIGURAR.md); caminhos antigos seguem no Storage.
-- tools/migrar_para_drive.cjs (chave de serviço) troca os caminhos antigos pelos do Drive.
grant select, update on public.vpn_solicitacoes to service_role;
grant select, update on public.vpn_anexos to service_role;
