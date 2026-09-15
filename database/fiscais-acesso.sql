-- Executar no SQL Editor depois de eleicoes.sql e admin.sql (idempotente,
-- pode rodar de novo sem problema).
--
-- Troca a autorização dos cadastros de Fiscais (antes "Eleições"): em vez
-- da lista separada eleicoes_admins — que só era editada manualmente por
-- SQL — passa a usar o login do site: root@root.com sempre
-- tem acesso, e qualquer conta aprovada (ver módulo Usuários) também, sem
-- depender de "eleicoes" estar marcada em Acessos — isso só controla se a
-- página aparece pra ela, não se os dados ficam liberados quando abre.
-- A tabela eleicoes_admins continua existindo, só não é mais consultada —
-- pode ficar ou ser apagada, como preferir.
--
-- Também libera editar e excluir (não só ler e adicionar) os cadastros já
-- existentes.
--
-- Define a função public.eh_root_ou_aprovado(), reaproveitada também pelas
-- policies de database/eleicoes-instantaneos.sql — rode este arquivo antes
-- daquele.
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

-- lower()+trim() no e-mail: se a conta root foi criada com espaço ou
-- maiúscula sobrando, a comparação exata ('=') falhava e bloqueava até o
-- root — visto em produção (ver conversa de 2026-09-15). auth.uid() já é
-- estável (não precisa de trim), então fica só no e-mail.
create or replace function public.eh_root_ou_aprovado()
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
    );
$$;

create policy "Aprovados leem cadastros" on public.eleicoes_cadastros
  for select to authenticated using (public.eh_root_ou_aprovado());

create policy "Aprovados adicionam cadastros" on public.eleicoes_cadastros
  for insert to authenticated with check (
    criado_por = (select auth.uid()) and public.eh_root_ou_aprovado()
  );

create policy "Aprovados editam cadastros" on public.eleicoes_cadastros
  for update to authenticated using (public.eh_root_ou_aprovado())
  with check (public.eh_root_ou_aprovado());

create policy "Aprovados excluem cadastros" on public.eleicoes_cadastros
  for delete to authenticated using (public.eh_root_ou_aprovado());

commit;

-- Se depois de rodar isso o root@root.com (ou uma conta com status =
-- 'aprovado' e ativo = true) continuar recebendo "não tem autorização",
-- confira estes dois pontos no SQL Editor do Supabase (não dá pra checar
-- isso por aqui, precisa ser você direto no painel):
--
-- 1) Este script realmente rodou nesse projeto? (não só foi escrito no
--    repositório) Rode de novo — é idempotente, pode repetir sem problema.
-- 2) O e-mail do root está exatamente como 'root@root.com' (sem espaço,
--    maiúscula ou domínio diferente)? Confirme com:
--      select id, email from auth.users where lower(email) like '%root%';
--    E, para uma conta aprovada específica, confira o status/ativo com:
--      select id, email, status, ativo from public.admin_solicitacoes;
