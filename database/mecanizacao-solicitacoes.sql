-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de
-- mecanizacao-lancamentos.sql. Pode ser executado de novo sem problema.
--
-- Pedidos de exclusão/edição de lançamentos de mecanização que aguardam
-- aprovação da conta responsável (root@root.com). Quem não é o responsável
-- não exclui nem edita direto: o botão "Excluir" abre um pedido com motivo, e
-- a edição, ao salvar, vira um pedido com os dados novos em "dados" — o
-- lançamento só muda quando o responsável aprova (ver lancar_mecanizacao.php,
-- ações "excluir", "editar", "solicitacoes" e "resolver").
--
-- Como em mecanizacao_lancamentos, só a service_role (servidor) lê e grava.
begin;

create table if not exists public.mecanizacao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  -- "set null" (não cascade): aprovar uma exclusão apaga o lançamento, mas o
  -- pedido fica guardado como histórico de quem pediu, por quê e quem aprovou.
  lancamento_id uuid references public.mecanizacao_lancamentos(id) on delete set null,
  nome_beneficiario text,             -- cópia para exibir mesmo depois de excluído
  tipo text not null check (tipo in ('excluir','editar')),
  motivo text not null,
  dados jsonb,                        -- só em "editar": o registro novo proposto
  solicitado_por_email text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  resolvido_por_email text,
  resolvido_em timestamptz
);

-- No máximo um pedido pendente por lançamento.
create unique index if not exists mecanizacao_solicitacoes_um_pendente
  on public.mecanizacao_solicitacoes (lancamento_id) where status = 'pendente';
create index if not exists mecanizacao_solicitacoes_status
  on public.mecanizacao_solicitacoes (status, criado_em desc);

alter table public.mecanizacao_solicitacoes enable row level security;
revoke all on public.mecanizacao_solicitacoes from anon, authenticated;
grant select, insert, update, delete on public.mecanizacao_solicitacoes to service_role;

commit;
