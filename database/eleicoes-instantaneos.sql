-- Executar no SQL Editor depois de eleicoes.sql e fiscais-acesso.sql
-- (idempotente, pode rodar de novo sem problema).
--
-- Guarda "fotos" da situação dos cadastros de Fiscais: a lista de
-- (município, zona, seção) que tinham pelo menos um fiscal no momento em
-- que alguém marcou a referência. Não existe base pronta da eleição
-- anterior, então a comparação "ganhou/perdeu fiscal" parte de um
-- instantâneo marcado manualmente, não de um histórico já existente.
-- Mesma autorização dos cadastros (ver fiscais-acesso.sql): root@root.com
-- ou qualquer conta aprovada no módulo Usuários.
begin;

create table if not exists public.eleicoes_instantaneos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid not null default auth.uid() references auth.users(id),
  secoes jsonb not null,
  constraint secoes_e_lista check (jsonb_typeof(secoes) = 'array')
);
create index if not exists eleicoes_instantaneos_criado_em on public.eleicoes_instantaneos (criado_em desc);
alter table public.eleicoes_instantaneos enable row level security;
revoke all on public.eleicoes_instantaneos from anon, authenticated;
grant select, insert on public.eleicoes_instantaneos to authenticated;

drop policy if exists "Aprovados leem instantaneos" on public.eleicoes_instantaneos;
create policy "Aprovados leem instantaneos" on public.eleicoes_instantaneos
  for select to authenticated using (
    (select auth.jwt() ->> 'email') = 'root@root.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = (select auth.uid())
        and s.status = 'aprovado'
        and coalesce(s.ativo, true) = true
    )
  );

drop policy if exists "Aprovados criam instantaneos" on public.eleicoes_instantaneos;
create policy "Aprovados criam instantaneos" on public.eleicoes_instantaneos
  for insert to authenticated with check (
    criado_por = (select auth.uid())
    and (
      (select auth.jwt() ->> 'email') = 'root@root.com'
      or exists (
        select 1 from public.admin_solicitacoes s
        where s.id = (select auth.uid())
          and s.status = 'aprovado'
          and coalesce(s.ativo, true) = true
      )
    )
  );

commit;
-- Sem policy de update/delete de propósito: um instantâneo é histórico e
-- não deve ser editado depois de marcado.
