-- Executar no SQL Editor depois de eleicoes.sql e admin.sql (idempotente,
-- pode rodar de novo sem problema).
--
-- Troca a autorização dos cadastros de Fiscais (antes "Eleições"): em vez
-- da lista separada eleicoes_admins — que só era editada manualmente por
-- SQL — passa a usar a aprovação e a página "eleicoes" liberada em
-- admin_solicitacoes, a mesma tela "Acessos" que já controla as outras
-- páginas. luansobraldourado5@gmail.com sempre tem acesso, com ou sem
-- "eleicoes" marcada. A tabela eleicoes_admins continua existindo, só não
-- é mais consultada — pode ficar ou ser apagada, como preferir.
begin;

drop policy if exists "Administradores leem cadastros" on public.eleicoes_cadastros;
drop policy if exists "Administradores adicionam cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados com Fiscais leem cadastros" on public.eleicoes_cadastros;
drop policy if exists "Aprovados com Fiscais adicionam cadastros" on public.eleicoes_cadastros;

create policy "Aprovados com Fiscais leem cadastros" on public.eleicoes_cadastros
  for select to authenticated using (
    (select auth.jwt() ->> 'email') = 'luansobraldourado5@gmail.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = (select auth.uid())
        and s.status = 'aprovado'
        and 'eleicoes' = any(s.paginas)
    )
  );

create policy "Aprovados com Fiscais adicionam cadastros" on public.eleicoes_cadastros
  for insert to authenticated with check (
    criado_por = (select auth.uid())
    and (
      (select auth.jwt() ->> 'email') = 'luansobraldourado5@gmail.com'
      or exists (
        select 1 from public.admin_solicitacoes s
        where s.id = (select auth.uid())
          and s.status = 'aprovado'
          and 'eleicoes' = any(s.paginas)
      )
    )
  );

commit;
