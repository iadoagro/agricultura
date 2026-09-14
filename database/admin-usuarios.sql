-- Executar no SQL Editor depois de admin.sql (idempotente).
-- Adiciona um interruptor "ativo" independente do status de aprovação: dá
-- pra desativar o acesso de alguém já aprovado sem perder a aprovação nem
-- as páginas liberadas, e reativar depois sem precisar aprovar de novo.
alter table public.admin_solicitacoes add column if not exists ativo boolean not null default true;
