-- Executar no SQL Editor do mesmo projeto Supabase usado em admin.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Registro de auditoria: guarda todo evento importante do sistema (login,
-- logout, cadastro, edição, exclusão, aprovação...) para o responsável
-- conferir depois quem fez o quê e quando. É só um histórico: ninguém
-- (nem o responsável) pode alterar ou apagar uma linha já gravada, só
-- inserir novas e ler.
begin;

create table if not exists public.log_eventos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_email text,
  acao text not null,
  modulo text not null,
  descricao text not null,
  detalhes jsonb
);

create index if not exists log_eventos_criado_em_idx on public.log_eventos (criado_em desc);
create index if not exists log_eventos_modulo_idx on public.log_eventos (modulo);

alter table public.log_eventos enable row level security;
revoke all on public.log_eventos from anon, authenticated;
grant select, insert on public.log_eventos to authenticated;
grant select, insert on public.log_eventos to service_role;
grant usage, select on sequence public.log_eventos_id_seq to authenticated, service_role;

-- Qualquer pessoa autenticada pode registrar um evento (a própria ação dela),
-- mas só como ela mesma — não dá pra gravar um evento em nome de outra conta.
drop policy if exists "Usuario registra seu proprio evento" on public.log_eventos;
create policy "Usuario registra seu proprio evento" on public.log_eventos
  for insert to authenticated with check (usuario_id = (select auth.uid()));

-- Só o responsável enxerga o histórico completo.
drop policy if exists "Responsavel le todos os eventos" on public.log_eventos;
create policy "Responsavel le todos os eventos" on public.log_eventos
  for select to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com');

commit;
