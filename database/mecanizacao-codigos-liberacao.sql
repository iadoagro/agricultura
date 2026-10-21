-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de
-- mecanizacao-solicitacoes.sql. Pode ser executado de novo sem problema.
--
-- Códigos de liberação do lançamento de mecanização. Quem tem pedido de
-- EDIÇÃO pendente de um dia anterior não lança nada novo até digitar um código
-- gerado pelo sistema (ver lancar_mecanizacao.php e a Edge Function
-- lancar-mecanizacao, ações "bloqueio", "salvar", "liberar" e "codigos").
-- O código é aleatório e nunca se repete: a coluna "codigo" é única e as
-- linhas nunca são apagadas, nem depois de usadas. Quando a pessoa digita o
-- código, "usado_em" guarda a data e a hora — é o que a conta responsável vê
-- na aba de solicitações do relatório de mecanização.
--
-- Como nas outras tabelas de mecanização, só a service_role (servidor) lê e grava.
begin;

create table if not exists public.mecanizacao_codigos_liberacao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  usuario_email text not null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz,
  constraint mecanizacao_codigos_liberacao_codigo_unico unique (codigo)
);

create index if not exists mecanizacao_codigos_liberacao_usuario
  on public.mecanizacao_codigos_liberacao (usuario_email, usado_em);
create index if not exists mecanizacao_codigos_liberacao_criado
  on public.mecanizacao_codigos_liberacao (criado_em desc);

alter table public.mecanizacao_codigos_liberacao enable row level security;
revoke all on public.mecanizacao_codigos_liberacao from anon, authenticated;
grant select, insert, update on public.mecanizacao_codigos_liberacao to service_role;

commit;
