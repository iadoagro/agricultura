-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de
-- log-eventos-origem.sql (usa a coluna ip) — os aparelhos vêm de
-- js/ambiente-cliente.js (detalhes.aparelho_id).
-- Pode ser executado de novo sem problema (idempotente).
--
-- Alertas de segurança do registro de auditoria, gerados pelo próprio banco
-- a cada evento gravado (a página de logs só lê):
--   aparelho_novo — a conta apareceu num aparelho que nunca tinha usado
--                   (o primeiro aparelho de cada conta não gera alerta);
--   ip_novo       — a conta usou um IP que nunca tinha usado, no mesmo
--                   aparelho de sempre (celular no 4G troca de IP com
--                   frequência — por isso é o alerta de menor peso);
--   simultaneo    — a mesma conta em dois aparelhos com IPs diferentes em
--                   menos de 10 minutos: senha compartilhada ou roubada.
-- Cada situação gera um alerta só (o mesmo aparelho/IP não alerta de novo;
-- o simultâneo, no máximo um por hora por conta).
begin;

create table if not exists public.log_alertas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  usuario_email text not null,
  tipo text not null check (tipo in ('aparelho_novo', 'ip_novo', 'simultaneo')),
  gravidade text not null check (gravidade in ('baixa', 'media', 'alta')),
  descricao text not null,
  ip text,
  aparelho_id text,
  aparelho_desc text,
  detalhes jsonb,
  evento_id bigint,
  visto boolean not null default false
);

create index if not exists log_alertas_criado_em_idx on public.log_alertas (criado_em desc);
create index if not exists log_alertas_usuario_tipo_idx on public.log_alertas (usuario_email, tipo);
-- buscas do gatilho por aparelho e IP já usados pela conta
create index if not exists log_eventos_usuario_aparelho_idx on public.log_eventos (usuario_email, (detalhes ->> 'aparelho_id'));
create index if not exists log_eventos_usuario_ip_idx on public.log_eventos (usuario_email, ip);

alter table public.log_alertas enable row level security;
revoke all on public.log_alertas from anon, authenticated;
grant select on public.log_alertas to authenticated;
grant update (visto) on public.log_alertas to authenticated;

drop policy if exists "Responsavel le alertas" on public.log_alertas;
create policy "Responsavel le alertas" on public.log_alertas
  for select to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com');
drop policy if exists "Responsavel marca alerta visto" on public.log_alertas;
create policy "Responsavel marca alerta visto" on public.log_alertas
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'root@root.com')
  with check ((select auth.jwt() ->> 'email') = 'root@root.com');

-- AFTER INSERT: roda depois de log_eventos_origem já ter posto o IP.
-- "Antes" = criado_em menor: os eventos chegam em lote (js/rastreio.js) e
-- todos do mesmo lote têm o mesmo criado_em — senão um evento do lote
-- contaria como uso anterior do aparelho pelos outros do mesmo lote.
-- SECURITY DEFINER: grava em log_alertas, que ninguém mais pode inserir.
create or replace function public.log_eventos_alertar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ap text := nullif(new.detalhes ->> 'aparelho_id', '');
  ap_desc text := nullif(new.detalhes ->> 'aparelho_desc', '');
  login text := split_part(coalesce(new.usuario_email, ''), '@', 1);
  aparelho_novo boolean := false;
  outro record;
begin
  if new.usuario_email is null then return null; end if;

  -- aparelho novo (só depois que a conta já tem algum aparelho conhecido)
  if ap is not null
     and not exists (select 1 from log_alertas a
                     where a.usuario_email = new.usuario_email and a.tipo = 'aparelho_novo' and a.aparelho_id = ap)
     and not exists (select 1 from log_eventos e
                     where e.usuario_email = new.usuario_email and e.detalhes ->> 'aparelho_id' = ap
                       and e.criado_em < new.criado_em)
     and exists (select 1 from log_eventos e
                 where e.usuario_email = new.usuario_email and e.detalhes ->> 'aparelho_id' is not null
                   and e.detalhes ->> 'aparelho_id' <> ap and e.criado_em < new.criado_em)
  then
    aparelho_novo := true;
    insert into log_alertas (usuario_email, tipo, gravidade, descricao, ip, aparelho_id, aparelho_desc, evento_id)
    values (new.usuario_email, 'aparelho_novo', 'media',
            login || ' entrou de um aparelho novo' || coalesce(': ' || ap_desc, ''),
            new.ip, ap, ap_desc, new.id);
  end if;

  -- IP novo no mesmo aparelho (aparelho novo já alertou acima)
  if new.ip is not null and not aparelho_novo
     and not exists (select 1 from log_alertas a
                     where a.usuario_email = new.usuario_email and a.tipo in ('ip_novo', 'aparelho_novo') and a.ip = new.ip)
     and not exists (select 1 from log_eventos e
                     where e.usuario_email = new.usuario_email and e.ip = new.ip and e.criado_em < new.criado_em)
     and exists (select 1 from log_eventos e
                 where e.usuario_email = new.usuario_email and e.ip is not null and e.ip <> new.ip
                   and e.criado_em < new.criado_em)
  then
    insert into log_alertas (usuario_email, tipo, gravidade, descricao, ip, aparelho_id, aparelho_desc, evento_id)
    values (new.usuario_email, 'ip_novo', 'baixa',
            login || ' acessou de um IP novo (' || new.ip || ')',
            new.ip, ap, ap_desc, new.id);
  end if;

  -- mesma conta em dois aparelhos e dois IPs em menos de 10 minutos
  if ap is not null and new.ip is not null
     and not exists (select 1 from log_alertas a
                     where a.usuario_email = new.usuario_email and a.tipo = 'simultaneo'
                       and a.criado_em > now() - interval '1 hour')
  then
    select e.ip, e.detalhes ->> 'aparelho_id' as aparelho_id, e.detalhes ->> 'aparelho_desc' as aparelho_desc, e.criado_em
      into outro
    from log_eventos e
    where e.usuario_email = new.usuario_email
      and e.criado_em > new.criado_em - interval '10 minutes' and e.criado_em < new.criado_em
      and e.detalhes ->> 'aparelho_id' is not null and e.detalhes ->> 'aparelho_id' <> ap
      and e.ip is not null and e.ip <> new.ip
    order by e.criado_em desc
    limit 1;
    if found then
      insert into log_alertas (usuario_email, tipo, gravidade, descricao, ip, aparelho_id, aparelho_desc, detalhes, evento_id)
      values (new.usuario_email, 'simultaneo', 'alta',
              login || ' usou a conta em dois aparelhos ao mesmo tempo, com IPs diferentes',
              new.ip, ap, ap_desc,
              jsonb_build_object('outro_ip', outro.ip, 'outro_aparelho_id', outro.aparelho_id,
                                 'outro_aparelho_desc', outro.aparelho_desc, 'outro_em', outro.criado_em),
              new.id);
    end if;
  end if;

  return null;
exception when others then
  -- alerta nunca pode impedir o registro do evento
  raise warning 'log_eventos_alertar: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.log_eventos_alertar() from public, anon, authenticated;

drop trigger if exists log_eventos_alertar on public.log_eventos;
create trigger log_eventos_alertar
  after insert on public.log_eventos
  for each row execute function public.log_eventos_alertar();

commit;
