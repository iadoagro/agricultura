-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de log-eventos.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Navegação no registro de auditoria: js/rastreio.js passa a gravar em
-- log_eventos (módulo "navegacao") cada página aberta, o tempo que a pessoa
-- ficou nela (acao "saida", detalhes.duracao_seg), abas, cliques, filtros,
-- formulários enviados e erros de JavaScript. A tabela não muda — tudo cabe
-- em "detalhes" —, aqui entram só os índices e o resumo agrupado que a
-- página de logs usa para "Agrupar por pessoa / ação / página".
begin;

create index if not exists log_eventos_usuario_email_idx on public.log_eventos (usuario_email, criado_em desc);
create index if not exists log_eventos_acao_idx on public.log_eventos (acao);

-- Resumo agrupado. SECURITY INVOKER de propósito: roda com a política de
-- log_eventos de quem chama, então só root@root.com (que é quem lê a tabela)
-- recebe alguma linha — os demais recebem o resumo vazio.
-- As páginas saem pelo nome do arquivo (detalhes.pagina); a tela troca pelo nome legível.
-- p_sem_usuario: deixa uma conta de fora (a aba "Equipe" da página de logs tira o root).
--   p_agrupar: 'pessoa' | 'acao' | 'modulo' | 'pagina' | 'pessoa_acao' | 'pessoa_pagina'
drop function if exists public.log_eventos_resumo(text, timestamptz, timestamptz, text, text, text);
drop function if exists public.log_eventos_resumo(text, timestamptz, timestamptz, text, text, text, text);
drop function if exists public.log_eventos_resumo(text, timestamptz, timestamptz, text, text, text, text, text);
create function public.log_eventos_resumo(
  p_agrupar text,
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_modulo text default null,
  p_acao text default null,
  p_usuario text default null,
  p_pagina text default null,
  p_sem_usuario text default null
)
returns table (chave text, subchave text, eventos bigint, tempo_seg bigint, pessoas bigint, primeiro timestamptz, ultimo timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select e.*, e.detalhes ->> 'pagina' as pagina
    from public.log_eventos e
    where (p_desde is null or e.criado_em >= p_desde)
      and (p_ate is null or e.criado_em <= p_ate)
      and (p_modulo is null or e.modulo = p_modulo)
      and (p_acao is null or e.acao = p_acao)
      and (p_usuario is null or e.usuario_email = p_usuario)
      and (p_pagina is null or e.detalhes ->> 'pagina' = p_pagina)
      and (p_sem_usuario is null or e.usuario_email is distinct from p_sem_usuario)
  )
  select
    case p_agrupar
      when 'acao' then b.acao
      when 'modulo' then b.modulo
      when 'pagina' then coalesce(b.pagina, '(sem página)')
      else coalesce(b.usuario_email, '(sem usuário)')
    end as chave,
    case p_agrupar
      when 'pessoa_acao' then b.acao
      when 'pessoa_pagina' then coalesce(b.pagina, '(sem página)')
      else null
    end as subchave,
    count(*) as eventos,
    coalesce(sum(case when b.acao = 'saida' and (b.detalhes ->> 'duracao_seg') ~ '^[0-9]+(\.[0-9]+)?$'
                      then (b.detalhes ->> 'duracao_seg')::numeric end), 0)::bigint as tempo_seg,
    count(distinct b.usuario_email) as pessoas,
    min(b.criado_em) as primeiro,
    max(b.criado_em) as ultimo
  from base b
  group by 1, 2
  order by 1, 3 desc
$$;

revoke all on function public.log_eventos_resumo(text, timestamptz, timestamptz, text, text, text, text, text) from public, anon;
grant execute on function public.log_eventos_resumo(text, timestamptz, timestamptz, text, text, text, text, text) to authenticated;

commit;
