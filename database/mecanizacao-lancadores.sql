-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de
-- mecanizacao-lancamentos.sql. Pode ser executado de novo sem problema.
--
-- Pessoas que lançaram fichas de mecanização. As fichas importadas da
-- planilha do Google Forms guardam o e-mail usado no formulário
-- (ex.: antoniopintodelima90@gmail.com), que não é o login do sistema
-- (nome.sobrenome@sistema.local). Aqui o responsável (root@root.com) dá o
-- nome de exibição de cada e-mail ("Antonio Pinto de Lima") e pode ligar o
-- e-mail a um login do sistema — assim a pessoa, ao entrar, vê em "Meus
-- lançamentos" também o que lançou pela planilha (ver lancar_mecanizacao.php).
--
-- Como nas outras tabelas de mecanização, só a service_role lê e grava.
begin;

create table if not exists public.mecanizacao_lancadores (
  email text primary key,           -- criado_por_email das fichas (minúsculo)
  nome text,                        -- nome de exibição
  usuario_email text,               -- login do sistema ligado a este e-mail
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists mecanizacao_lancadores_usuario on public.mecanizacao_lancadores (usuario_email);

-- Todos os e-mails que já lançaram, com quantidade e o nome/login definidos.
-- "tecnico" = responsável técnico que mais aparece nas fichas do e-mail:
-- ajuda o responsável a descobrir quem usa contas genéricas (seagri.xxx@…).
create or replace view public.mecanizacao_lancadores_resumo as
select l.criado_por_email as email,
       count(*)::int as total,
       max(l.criado_em) as ultimo,
       p.nome,
       p.usuario_email,
       mode() within group (order by l.responsavel_tecnico) as tecnico
from public.mecanizacao_lancamentos l
left join public.mecanizacao_lancadores p on p.email = l.criado_por_email
where l.criado_por_email is not null
group by l.criado_por_email, p.nome, p.usuario_email;

alter table public.mecanizacao_lancadores enable row level security;
revoke all on public.mecanizacao_lancadores from anon, authenticated;
revoke all on public.mecanizacao_lancadores_resumo from anon, authenticated;
grant select, insert, update, delete on public.mecanizacao_lancadores to service_role;
grant select on public.mecanizacao_lancadores_resumo to service_role;

commit;
