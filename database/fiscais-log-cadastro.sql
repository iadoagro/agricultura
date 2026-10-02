-- Executar no SQL Editor depois de fiscais-acesso.sql e log-eventos.sql.
-- Idempotente.
--
-- Tela de Fiscais: ao clicar num fiscal, mostra quem cadastrou e quando
-- (data e hora), cruzando o cadastro (eleicoes_cadastros) com o log do
-- sistema (log_eventos, módulo "fiscais", ação "criar"). Só o responsável lê
-- log_eventos direto; esta função devolve apenas esses dados do cadastro pra
-- qualquer conta aprovada.
--
-- Cadastros novos gravam detalhes.fiscal_id no log (casamento exato). Os
-- antigos casam pelo mesmo usuário + texto da descrição + horário próximo
-- (até 5 minutos do cadastro); se não achar, a tela mostra só o que o
-- próprio cadastro guarda (criado_em / criado_por).
begin;

create or replace function public.fiscal_log_cadastro(p_id text)
returns table(criado_em timestamptz, criado_por_login text, log_em timestamptz, log_login text)
language sql
stable
security definer
set search_path = public
as $$
  select c.criado_em,
    case
      when u.id is null then null
      when lower(u.email) = 'root@root.com' then 'root'
      when u.email ilike '%@sistema.local' then left(u.email, length(u.email) - length('@sistema.local'))
      else u.email
    end,
    l.criado_em,
    case
      when l.usuario_email is null then null
      when lower(l.usuario_email) = 'root@root.com' then 'root'
      when l.usuario_email ilike '%@sistema.local' then left(l.usuario_email, length(l.usuario_email) - length('@sistema.local'))
      else l.usuario_email
    end
  from public.eleicoes_cadastros c
  left join auth.users u on u.id = c.criado_por
  left join lateral (
    select e.criado_em, e.usuario_email
    from public.log_eventos e
    where e.modulo = 'fiscais' and e.acao = 'criar'
      and (
        e.detalhes->>'fiscal_id' = c.id
        or (
          e.detalhes->>'fiscal_id' is null
          and e.usuario_id = c.criado_por
          and e.descricao = 'Cadastrou o fiscal "' || coalesce(c.dados->>'nome', '') || '" (' || coalesce(c.dados->>'municipio', '') || ')'
          and abs(extract(epoch from (e.criado_em - c.criado_em))) <= 300
        )
      )
    order by (e.detalhes->>'fiscal_id' = c.id) desc nulls last,
             abs(extract(epoch from (e.criado_em - c.criado_em)))
    limit 1
  ) l on true
  where c.id = p_id and public.eh_root_ou_aprovado();
$$;

revoke all on function public.fiscal_log_cadastro(text) from public;
grant execute on function public.fiscal_log_cadastro(text) to authenticated;

commit;
