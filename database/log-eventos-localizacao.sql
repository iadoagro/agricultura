-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de log-eventos-ip.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Cidade, estado e provedor de cada IP do registro de auditoria. Quem
-- consulta é o próprio banco (extensão http), no ip-api.com — o navegador
-- de quem usa o sistema não fala com serviço de fora nenhum. Cada IP é
-- consultado uma vez e guardado em ip_localizacao (de novo só depois de 30
-- dias); só a página de logs pede, e só pelos IPs que está mostrando.
-- É aproximado: IP de celular (4G) costuma sair na cidade da operadora.
-- lat/lon (centro aproximado da cidade do IP) alimentam o mapa da página de logs.
begin;

create extension if not exists http with schema extensions;

create table if not exists public.ip_localizacao (
  ip text primary key,
  cidade text,
  uf text,
  estado text,
  pais text,
  provedor text,
  movel boolean,      -- rede de celular (dados móveis)
  proxy boolean,      -- VPN, proxy ou Tor
  datacenter boolean, -- servidor/hospedagem, não uma casa ou empresa
  lat double precision,
  lon double precision,
  consultado_em timestamptz not null default now()
);

alter table public.ip_localizacao add column if not exists lat double precision;
alter table public.ip_localizacao add column if not exists lon double precision;

alter table public.ip_localizacao enable row level security;
revoke all on public.ip_localizacao from anon, authenticated;
grant select on public.ip_localizacao to authenticated;

drop policy if exists "Responsavel le localizacao dos IPs" on public.ip_localizacao;
create policy "Responsavel le localizacao dos IPs" on public.ip_localizacao
  for select to authenticated using ((select auth.jwt() ->> 'email') = 'root@root.com');

-- Devolve a localização dos IPs pedidos, consultando antes os que ainda não
-- estão guardados (até 100 por vez — o limite do lote do ip-api.com).
-- SECURITY DEFINER para poder gravar na tabela; por isso confere o root.
create or replace function public.ip_localizar(p_ips text[])
returns setof public.ip_localizacao
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  faltando text[];
  resposta extensions.http_response;
  item json;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'root@root.com' then
    raise exception 'Somente o responsável consulta a localização dos IPs';
  end if;

  select array_agg(distinct x) into faltando
  from unnest(p_ips) as x
  where x ~ '^[0-9a-fA-F.:]+$'
    and not exists (select 1 from ip_localizacao l
                    where l.ip = x and l.consultado_em > now() - interval '30 days' and l.lat is not null);
  faltando := faltando[1:100];

  if faltando is not null and array_length(faltando, 1) > 0 then
    begin
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '6000');
      resposta := extensions.http_post(
        'http://ip-api.com/batch?lang=pt-BR&fields=status,query,country,region,regionName,city,lat,lon,isp,mobile,proxy,hosting',
        array_to_json(faltando)::text, 'application/json');
      if resposta.status = 200 then
        for item in select * from json_array_elements(resposta.content::json) loop
          if item ->> 'status' = 'success' then
            insert into ip_localizacao (ip, cidade, uf, estado, pais, provedor, movel, proxy, datacenter, lat, lon, consultado_em)
            values (item ->> 'query', item ->> 'city', item ->> 'region', item ->> 'regionName', item ->> 'country',
                    item ->> 'isp', (item ->> 'mobile')::boolean, (item ->> 'proxy')::boolean, (item ->> 'hosting')::boolean,
                    (item ->> 'lat')::double precision, (item ->> 'lon')::double precision, now())
            on conflict (ip) do update set
              cidade = excluded.cidade, uf = excluded.uf, estado = excluded.estado, pais = excluded.pais,
              provedor = excluded.provedor, movel = excluded.movel, proxy = excluded.proxy,
              datacenter = excluded.datacenter, lat = excluded.lat, lon = excluded.lon,
              consultado_em = excluded.consultado_em;
          end if;
        end loop;
      end if;
    exception when others then
      -- serviço fora do ar ou lento: a página de logs segue sem a localização
      raise warning 'ip_localizar: %', sqlerrm;
    end;
  end if;

  return query select * from ip_localizacao where ip = any (p_ips);
end;
$$;

revoke all on function public.ip_localizar(text[]) from public, anon;
grant execute on function public.ip_localizar(text[]) to authenticated;

commit;
