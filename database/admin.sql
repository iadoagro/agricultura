-- Executar no SQL Editor do mesmo projeto Supabase usado em eleicoes.sql.
-- Pode ser executado de novo sem problema, mesmo que já tenha rodado antes
-- (idempotente) — é a forma mais segura de corrigir uma configuração
-- incompleta ou de aplicar uma atualização deste arquivo.
--
-- Cria o cadastro de administradores com aprovação: qualquer pessoa pode se
-- cadastrar, mas só tem acesso depois que root@root.com
-- aprova, e só enxerga as páginas liberadas para ela em "paginas".
begin;

create table if not exists public.admin_solicitacoes (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  paginas text[] not null default array['eleicoes','dashboards'],
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid references auth.users(id)
);
-- Garante a coluna "paginas" mesmo se a tabela já existia de uma versão anterior.
alter table public.admin_solicitacoes add column if not exists paginas text[] not null default array['eleicoes','dashboards'];

alter table public.admin_solicitacoes enable row level security;
revoke all on public.admin_solicitacoes from anon, authenticated;
grant select, update on public.admin_solicitacoes to authenticated;

drop policy if exists "Usuario le a propria solicitacao" on public.admin_solicitacoes;
create policy "Usuario le a propria solicitacao" on public.admin_solicitacoes
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "Responsavel le todas as solicitacoes" on public.admin_solicitacoes;
create policy "Responsavel le todas as solicitacoes" on public.admin_solicitacoes
  for select to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com');

drop policy if exists "Responsavel aprova ou recusa" on public.admin_solicitacoes;
create policy "Responsavel aprova ou recusa" on public.admin_solicitacoes
  for update to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com')
  with check ((select auth.jwt() ->> 'email') = 'root@root.com');

-- Cria a solicitação (status pendente, paginas padrão) automaticamente a
-- cada cadastro novo, então o app nunca precisa gravar nessa tabela direto.
create or replace function public.lidar_novo_usuario_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_solicitacoes (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario_admin on auth.users;
create trigger ao_criar_usuario_admin
  after insert on auth.users
  for each row execute function public.lidar_novo_usuario_admin();

commit;
