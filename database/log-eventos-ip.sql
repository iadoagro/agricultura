-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de log-eventos.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- IP de quem gerou cada evento do registro de auditoria. O navegador não
-- sabe o próprio IP público, então quem grava é o banco: antes de inserir,
-- o gatilho lê o cabeçalho da requisição que o PostgREST repassa
-- (request.headers) e preenche a coluna "ip" — por cima de qualquer valor
-- que o cliente tenha mandado, para ninguém gravar um IP inventado.
-- Navegador, sistema e resolução da tela vêm em "detalhes"
-- (js/ambiente-cliente.js). Eventos antigos ficam com ip vazio.
begin;

alter table public.log_eventos add column if not exists ip text;

create or replace function public.log_eventos_preencher_ip()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  -- cf-connecting-ip: posto pelo Cloudflare na frente do Supabase, o cliente
  -- não consegue forjar; x-forwarded-for fica de reserva (1º = o cliente).
  new.ip := coalesce(
    nullif(h ->> 'cf-connecting-ip', ''),
    nullif(h ->> 'x-real-ip', ''),
    nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), '')
  );
  return new;
end;
$$;

drop trigger if exists log_eventos_ip on public.log_eventos;
create trigger log_eventos_ip
  before insert on public.log_eventos
  for each row execute function public.log_eventos_preencher_ip();

commit;
