-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de log-eventos.sql
-- e ANTES de log-eventos-navegacao.sql (o resumo filtra por estas colunas).
-- Pode ser executado de novo sem problema (idempotente).
--
-- Origem de cada evento, lida no SERVIDOR pelos cabeçalhos da requisição
-- (o que o cliente mandar nestas colunas é descartado): IP, país
-- (cf-ipcountry), user-agent e, a partir dele, navegador, sistema e
-- dispositivo. Vale até para quem não tem o js/ambiente-cliente.js
-- carregado; o detalhamento maior (modelo, Windows 11, tela, aparelho,
-- conexão, fuso) vem do navegador em log_eventos.detalhes.
-- Este arquivo reproduz o que foi criado direto no banco em 2026-09-23.
begin;

alter table public.log_eventos add column if not exists ip text;
alter table public.log_eventos add column if not exists pais text;
alter table public.log_eventos add column if not exists user_agent text;
alter table public.log_eventos add column if not exists navegador text;
alter table public.log_eventos add column if not exists sistema text;
alter table public.log_eventos add column if not exists dispositivo text;
create index if not exists log_eventos_ip_idx on public.log_eventos (ip);

create or replace function public.log_ler_user_agent(ua text, OUT navegador text, OUT sistema text, OUT dispositivo text)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v text;
begin
  ua := coalesce(ua, '');
  if ua = '' then return; end if;

  if ua ~ 'Edg[AeiOS]*/' then navegador := 'Edge ' || coalesce(substring(ua from 'Edg[AeiOS]*/([0-9]+)'), '');
  elsif ua ~ '(OPR|Opera)/' then navegador := 'Opera ' || coalesce(substring(ua from '(?:OPR|Opera)/([0-9]+)'), '');
  elsif ua ~ 'SamsungBrowser/' then navegador := 'Samsung Internet ' || coalesce(substring(ua from 'SamsungBrowser/([0-9]+)'), '');
  elsif ua ~ '(Firefox|FxiOS)/' then navegador := 'Firefox ' || coalesce(substring(ua from '(?:Firefox|FxiOS)/([0-9]+)'), '');
  elsif ua ~ '(Chrome|CriOS)/' then navegador := 'Chrome ' || coalesce(substring(ua from '(?:Chrome|CriOS)/([0-9]+)'), '');
  elsif ua ~ 'Safari/' and ua ~ 'Version/' then navegador := 'Safari ' || coalesce(substring(ua from 'Version/([0-9]+)'), '');
  else navegador := 'Outro';
  end if;
  navegador := trim(navegador);

  if ua ~ 'Windows NT 10' then sistema := 'Windows 10/11';
  elsif ua ~ 'Windows NT 6\.3' then sistema := 'Windows 8.1';
  elsif ua ~ 'Windows NT 6\.1' then sistema := 'Windows 7';
  elsif ua ~ 'Windows' then sistema := 'Windows';
  elsif ua ~ 'Android' then
    v := substring(ua from 'Android ([0-9]+)');
    sistema := 'Android' || coalesce(' ' || v, '');
  elsif ua ~ '(iPhone|iPad|iPod)' then
    v := substring(ua from 'OS ([0-9]+)_');
    sistema := 'iOS' || coalesce(' ' || v, '');
  elsif ua ~ 'CrOS' then sistema := 'ChromeOS';
  elsif ua ~ 'Mac OS X' then sistema := 'macOS';
  elsif ua ~ 'Linux' then sistema := 'Linux';
  else sistema := 'Outro';
  end if;

  if ua ~ '(iPad|Tablet)' or (ua ~ 'Android' and ua !~ 'Mobile') then dispositivo := 'Tablet';
  elsif ua ~ '(Mobi|iPhone|iPod)' then dispositivo := 'Celular';
  else dispositivo := 'Computador';
  end if;
end;
$function$;

create or replace function public.log_eventos_origem()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  cab json;
  ua record;
begin
  begin
    cab := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    cab := null;   -- inserÃ§Ã£o fora da API (SQL Editor, migraÃ§Ã£o): sem cabeÃ§alhos
  end;
  -- sempre do servidor: o que vier no INSERT Ã© descartado
  new.ip := null; new.pais := null; new.user_agent := null;
  new.navegador := null; new.sistema := null; new.dispositivo := null;
  if cab is null then return new; end if;

  new.ip := coalesce(
    nullif(cab ->> 'cf-connecting-ip', ''),
    nullif(trim(split_part(cab ->> 'x-forwarded-for', ',', 1)), ''),
    nullif(cab ->> 'x-real-ip', '')
  );
  new.pais := nullif(cab ->> 'cf-ipcountry', '');
  new.user_agent := left(nullif(cab ->> 'user-agent', ''), 500);
  select * into ua from public.log_ler_user_agent(new.user_agent);
  new.navegador := ua.navegador;
  new.sistema := ua.sistema;
  new.dispositivo := ua.dispositivo;
  return new;
end;
$function$;

drop trigger if exists log_eventos_origem on public.log_eventos;
create trigger log_eventos_origem
  before insert on public.log_eventos
  for each row execute function public.log_eventos_origem();

commit;
