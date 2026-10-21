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
alter table public.vpn_solicitacoes add column if not exists vinculo text;
alter table public.vpn_solicitacoes drop constraint if exists vpn_solicitacoes_vinculo_check;
alter table public.vpn_solicitacoes add constraint vpn_solicitacoes_vinculo_check
  check (vinculo is null or vinculo in ('comissionado','terceirizado'));
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
-- Bucket privado: 5 MB por arquivo, só imagem ou PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vpn-documentos', 'vpn-documentos', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- O público só ENVIA (insert); não lista nem baixa. A equipe lê.
drop policy if exists "Publico envia documento vpn" on storage.objects;
create policy "Publico envia documento vpn" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'vpn-documentos');
drop policy if exists "Equipe le documento vpn" on storage.objects;
create policy "Equipe le documento vpn" on storage.objects
  for select to authenticated using (bucket_id = 'vpn-documentos' and public.pode_vpn());

-- -------------------------------------------------------------- função pública
create or replace function public.enviar_vpn_solicitacao(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := btrim(coalesce(p->>'nome', ''));
  v_cpf text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_rg text := btrim(coalesce(p->>'rg', ''));
  v_email text := lower(btrim(coalesce(p->>'email_funcional', '')));
  v_mat text := btrim(coalesce(p->>'matricula', ''));
  v_setor text := btrim(coalesce(p->>'setor', ''));
  v_zap text := regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g');
  v_vinculo text := lower(btrim(coalesce(p->>'vinculo', '')));
  v_doc text := coalesce(p->>'documento', '');
  v_nasc date;
  v_id uuid;
  v_num bigint;
begin
  begin
    v_nasc := (p->>'data_nascimento')::date;
  exception when others then
    raise exception 'Data de nascimento inválida.';
  end;
  if char_length(v_nome) < 5 or char_length(v_nome) > 120 then raise exception 'Informe o nome completo.'; end if;
  if char_length(v_cpf) <> 11 or v_cpf ~ '^(\d)\1{10}$' then raise exception 'CPF inválido.'; end if;
  if char_length(v_rg) < 3 or char_length(v_rg) > 30 then raise exception 'Informe o RG.'; end if;
  if v_nasc is null or v_nasc > current_date - interval '14 years' or v_nasc < date '1900-01-01' then
    raise exception 'Data de nascimento inválida.';
  end if;
  if v_email !~ '^[^@\s]+@ac\.gov\.br$' or char_length(v_email) > 160 then raise exception 'Use o e-mail funcional, que termina com @ac.gov.br.'; end if;
  if v_zap !~ '^\d{2}9?\d{8}$' then raise exception 'Informe o WhatsApp com DDD.'; end if;
  if v_vinculo not in ('comissionado','terceirizado') then raise exception 'Informe se é comissionado ou terceirizado.'; end if;
  if char_length(v_mat) > 30 or (v_vinculo = 'comissionado' and char_length(v_mat) < 1) then raise exception 'Informe a matrícula.'; end if;
  if char_length(v_setor) < 2 or char_length(v_setor) > 120 then raise exception 'Informe o setor.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'vpn-documentos' and name = v_doc) then
    raise exception 'Envie o documento de identificação com foto.';
  end if;
  if exists (select 1 from public.vpn_solicitacoes where documento_path = v_doc) then
    raise exception 'Este envio já foi registrado.';
  end if;

  insert into public.vpn_solicitacoes (nome, cpf, rg, data_nascimento, email_funcional, whatsapp, vinculo, matricula, setor, documento_path, documento_nome)
  values (v_nome, v_cpf, v_rg, v_nasc, v_email, v_zap, v_vinculo, v_mat, v_setor, v_doc, nullif(left(btrim(coalesce(p->>'documento_nome', '')), 160), ''))
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
  v_nome text := btrim(coalesce(p->>'nome', ''));
  v_cpf text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_rg text := btrim(coalesce(p->>'rg', ''));
  v_email text := lower(btrim(coalesce(p->>'email_funcional', '')));
  v_zap text := regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g');
  v_mat text := btrim(coalesce(p->>'matricula', ''));
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
  if char_length(v_rg) < 3 or char_length(v_rg) > 30 then raise exception 'Informe o RG.'; end if;
  if v_nasc is null or v_nasc < date '1900-01-01' or v_nasc > current_date then raise exception 'Data de nascimento inválida.'; end if;
  if v_email !~ '^[^@\s]+@ac\.gov\.br$' or char_length(v_email) > 160 then raise exception 'Use o e-mail funcional, que termina com @ac.gov.br.'; end if;
  if v_zap !~ '^\d{2}9?\d{8}$' then raise exception 'Informe o WhatsApp com DDD.'; end if;
  if v_vinculo not in ('comissionado','terceirizado') then raise exception 'Informe o vínculo.'; end if;
  if char_length(v_mat) > 30 then raise exception 'Matrícula muito longa.'; end if;
  if char_length(v_setor) < 2 or char_length(v_setor) > 120 then raise exception 'Informe o setor.'; end if;
  update public.vpn_solicitacoes
     set nome = v_nome, cpf = v_cpf, rg = v_rg, data_nascimento = v_nasc, email_funcional = v_email,
         whatsapp = v_zap, vinculo = v_vinculo, matricula = v_mat, setor = v_setor, observacoes = v_obs,
         atualizado_por = initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), ''), '@', 1), '.', ' ')),
         atualizado_em = now()
   where id = p_id;
end;
$$;
revoke all on function public.vpn_editar(uuid, jsonb) from public;
grant execute on function public.vpn_editar(uuid, jsonb) to authenticated;

commit;
