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
-- Município da pessoa definido pelo responsável; vazio = o que mais aparece
-- nas fichas (coluna "municipio" da view abaixo).
alter table public.mecanizacao_lancadores add column if not exists municipio text;

-- Todos os e-mails que já lançaram, com quantidade e o nome/login definidos.
-- "tecnico" = responsável técnico que mais aparece nas fichas do e-mail:
-- ajuda o responsável a descobrir quem usa contas genéricas (seagri.xxx@…).
create or replace view public.mecanizacao_lancadores_resumo as
select l.criado_por_email as email,
       count(*)::int as total,
       max(l.criado_em) as ultimo,
       p.nome,
       p.usuario_email,
       mode() within group (order by l.responsavel_tecnico) as tecnico,
       -- município que mais aparece nas fichas do e-mail, e todos eles
       mode() within group (order by l.municipio) as municipio,
       string_agg(distinct l.municipio, ', ' order by l.municipio) as municipios,
       p.municipio as municipio_definido
from public.mecanizacao_lancamentos l
left join public.mecanizacao_lancadores p on p.email = l.criado_por_email
where l.criado_por_email is not null
group by l.criado_por_email, p.nome, p.usuario_email, p.municipio;

alter table public.mecanizacao_lancadores enable row level security;
revoke all on public.mecanizacao_lancadores from anon, authenticated;
revoke all on public.mecanizacao_lancadores_resumo from anon, authenticated;
grant select, insert, update, delete on public.mecanizacao_lancadores to service_role;
grant select on public.mecanizacao_lancadores_resumo to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Município da pessoa → fichas. Quando o responsável define o município de
-- uma pessoa na tela "Pessoas", TODAS as fichas lançadas pelos e-mails dela
-- passam a ter esse município (tenham município ou não). O valor que cada
-- ficha tinha antes fica guardado em municipio_original (só na primeira
-- troca), e voltar pra "Automático" desfaz: cada ficha recebe de volta o
-- município original.
begin;

alter table public.mecanizacao_lancamentos add column if not exists municipio_alterado boolean not null default false;
alter table public.mecanizacao_lancamentos add column if not exists municipio_original text;

create or replace function public.mecanizacao_definir_municipio(p_email text, p_municipio text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  if p_municipio is null or btrim(p_municipio) = '' then
    -- desfaz: volta o município que cada ficha tinha antes
    update public.mecanizacao_lancamentos
       set municipio = municipio_original, municipio_original = null, municipio_alterado = false
     where criado_por_email = lower(p_email) and municipio_alterado;
  else
    update public.mecanizacao_lancamentos
       set municipio_original = case when municipio_alterado then municipio_original else municipio end,
           municipio_alterado = true,
           municipio = btrim(p_municipio)
     where criado_por_email = lower(p_email);
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.mecanizacao_definir_municipio(text, text) from public, anon, authenticated;
grant execute on function public.mecanizacao_definir_municipio(text, text) to service_role;

commit;
