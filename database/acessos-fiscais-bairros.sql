-- Executar no SQL Editor depois de fiscais-bairros-normalizar.sql
-- (idempotente, pode rodar de novo sem problema).
--
-- 1) Fiscais liberado para todo mundo: o código (admin-auth.js) já trata
--    "eleicoes" como sempre liberado para contas aprovadas e ativas; aqui só
--    deixa os dados coerentes, incluindo a página em quem estava sem ela.
-- 2) Tela de cadastro de Bairros (cadastros-fiscais.html) só para o
--    administrador (root@root.com): incluir, alterar e excluir direto na
--    tabela passa a ser só dele. Quem cadastra fiscal continua podendo
--    digitar bairro novo — ele entra pela função garantir_bairro() e pelo
--    gatilho do cadastro, que rodam como security definer.
begin;

alter table public.admin_solicitacoes alter column paginas set default array['eleicoes']::text[];   -- conta nova: só Fiscais
update public.admin_solicitacoes
  set paginas = array_append(coalesce(paginas, '{}'::text[]), 'eleicoes')
  where not coalesce('eleicoes' = any(paginas), false);

create or replace function public.eh_root()
returns boolean
language sql
stable
as $$
  select lower(trim(coalesce((select auth.jwt() ->> 'email'), ''))) = 'root@root.com';
$$;

drop policy if exists "Aprovados adicionam bairros" on public.fiscais_bairros;
drop policy if exists "Aprovados editam bairros" on public.fiscais_bairros;
drop policy if exists "Aprovados excluem bairros" on public.fiscais_bairros;
drop policy if exists "Administrador adiciona bairros" on public.fiscais_bairros;
drop policy if exists "Administrador edita bairros" on public.fiscais_bairros;
drop policy if exists "Administrador exclui bairros" on public.fiscais_bairros;
create policy "Administrador adiciona bairros" on public.fiscais_bairros
  for insert to authenticated with check (public.eh_root());
create policy "Administrador edita bairros" on public.fiscais_bairros
  for update to authenticated using (public.eh_root()) with check (public.eh_root());
create policy "Administrador exclui bairros" on public.fiscais_bairros
  for delete to authenticated using (public.eh_root());

commit;
