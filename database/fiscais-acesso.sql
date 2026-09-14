-- Executar no SQL Editor depois de eleicoes.sql e admin.sql (idempotente,
-- pode rodar de novo sem problema).
--
-- Troca a autorização dos cadastros de Fiscais (antes "Eleições"): em vez
-- da lista separada eleicoes_admins — que só era editada manualmente por
-- SQL — passa a usar o login do site: luansobraldourado5@gmail.com sempre
-- tem acesso, e qualquer conta aprovada (ver módulo Usuários) também, sem
-- depender de "eleicoes" estar marcada em Acessos — isso só controla se a
-- página aparece pra ela, não se os dados ficam liberados quando abre.
-- A tabela eleicoes_admins continua existindo, só não é mais consultada —
-- pode ficar ou ser apagada, como preferir.
--
-- Também libera editar e excluir (não só ler e adicionar) os cadastros já
-- existentes.
begin;

drop policy if exists "Administradores leem cadastros" on public.eleicoes_cadastros;
drop policy if exists "Administradores adicionam cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados com Fiscais leem cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados com Fiscais adicionam cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados com Fiscais editam cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados leem cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados adicionam cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados editam cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados excluem cadastros" on public.eleicoes_cadastros;

grant update, delete on public.eleicoes_cadastros to authenticated;

create policy "Aprovados leem cadastros" on public.eleicoes_cadastros
  for select to authenticated using (
    (select auth.jwt() ->> 'email') = 'luansobraldourado5@gmail.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = (select auth.uid())
        and s.status = 'aprovado'
        and coalesce(s.ativo, true) = true
    )
  );

create policy "Aprovados adicionam cadastros" on public.eleicoes_cadastros
  for insert to authenticated with check (
    criado_por = (select auth.uid())
    and (
      (select auth.jwt() ->> 'email') = 'luansobraldourado5@gmail.com'
      or exists (
        select 1 from public.admin_solicitacoes s
        where s.id = (select auth.uid())
          and s.status = 'aprovado'
          and coalesce(s.ativo, true) = true
      )
    )
  );

create policy "Aprovados editam cadastros" on public.eleicoes_cadastros
  for update to authenticated using (
    (select auth.jwt() ->> 'email') = 'luansobraldourado5@gmail.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = (select auth.uid())
        and s.status = 'aprovado'
        and coalesce(s.ativo, true) = true
    )
  ) with check (
    (select auth.jwt() ->> 'email') = 'luansobraldourado5@gmail.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = (select auth.uid())
        and s.status = 'aprovado'
        and coalesce(s.ativo, true) = true
    )
  );

create policy "Aprovados excluem cadastros" on public.eleicoes_cadastros
  for delete to authenticated using (
    (select auth.jwt() ->> 'email') = 'luansobraldourado5@gmail.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = (select auth.uid())
        and s.status = 'aprovado'
        and coalesce(s.ativo, true) = true
    )
  );

commit;
