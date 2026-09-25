-- Executar no SQL Editor do mesmo projeto Supabase usado em eleicoes.sql / admin.sql.
-- Pode ser executado de novo sem problema (idempotente).
--
-- Guarda os lançamentos individuais da "Ficha de Vistoria" (Programa de
-- Recuperação de Áreas Degradadas - Mecanização) digitados a partir do
-- formulário em papel, um por vistoria. É a fonte "crua" (com CPF e data de
-- nascimento) — diferente de data/mecanizacao.json, que é o pacote agregado
-- e sem dado pessoal sensível que o painel público lê (ver salvar_mecanizacao.php
-- e js/importar.js). Só o servidor (lancar_mecanizacao.php, com a chave
-- service_role) lê e grava aqui; por isso não há política de RLS liberando
-- anon/authenticated — a service_role sempre ignora RLS.
begin;

create table if not exists public.mecanizacao_lancamentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por_email text,

  -- 0. Serviço e vistoria
  tipo_servico text check (tipo_servico in ('Mecanização','Açudagem')),
  data_vistoria date,
  escritorio_local text,
  responsavel_tecnico text,
  ponto_controle text,

  -- 1.0 Informações gerais (beneficiário)
  nome_beneficiario text not null,
  cpf text,
  data_nascimento date,
  estado_civil text,
  sexo text,
  indigena boolean,
  etnia text,
  possui_dap text check (possui_dap in ('Sim','Não','Vencida')),
  associacao_cooperativa text,
  telefone text,

  -- 2.0 Unidade produtiva
  endereco text,
  nome_propriedade text,
  municipio text,

  -- 3.0 Área mecanizada / cultivo
  culturas jsonb not null default '[]',   -- [{cultura, area_ha, sistema_cultivo}, ...] até 4
  area_total_ha numeric(10,2),
  horas_maquina numeric(10,2),
  quantidade_acudes integer,
  pontos_geo jsonb not null default '[]', -- [{ponto, x, y, zona}, ...] até 3

  -- 3.2 Maquinário
  tipo_trator text,
  maquinas text[] not null default '{}',
  implementos text[] not null default '{}',
  tipo_uso text check (tipo_uso in ('Agrícola','Não agrícola')),
  num_identificacao_patrimonio text,

  -- 3.3 DAE (até 10, como no formulário original em planilha)
  daes jsonb not null default '[]',       -- [{numero, valor}, ...] até 10

  -- Assinaturas (confirmação de que a ficha impressa foi assinada)
  beneficiario_assinou boolean not null default false,
  responsavel_assinou boolean not null default false,

  -- Extras
  observacao text,
  pdf_arquivo text,          -- caminho no bucket de Storage "mecanizacao-formularios"
  pdf_extraido_automatico boolean not null default false,

  constraint mecanizacao_lancamentos_ha_check check (area_total_ha is null or area_total_ha >= 0),
  constraint mecanizacao_lancamentos_hrs_check check (horas_maquina is null or horas_maquina >= 0),
  constraint mecanizacao_lancamentos_ac_check check (quantidade_acudes is null or quantidade_acudes >= 0),
  constraint mecanizacao_lancamentos_daes_check check (jsonb_typeof(daes) = 'array' and jsonb_array_length(daes) <= 10)
);

-- Se a tabela já existia de uma versão anterior deste arquivo (com poligono,
-- link_formulario e num_dae/valor_dae em colunas separadas), atualiza sem
-- perder o resto dos dados já lançados.
alter table public.mecanizacao_lancamentos drop column if exists poligono;
alter table public.mecanizacao_lancamentos drop column if exists link_formulario;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mecanizacao_lancamentos' and column_name = 'num_dae') then
    alter table public.mecanizacao_lancamentos add column if not exists daes jsonb not null default '[]';
    update public.mecanizacao_lancamentos
      set daes = case when num_dae is null and valor_dae is null then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object('numero', num_dae, 'valor', valor_dae)) end
      where daes = '[]'::jsonb;
    alter table public.mecanizacao_lancamentos drop column num_dae;
    alter table public.mecanizacao_lancamentos drop column valor_dae;
  end if;
end $$;

-- Fichas importadas da planilha do Google Forms (tools/importar_planilha_lancamentos.py):
-- origem = 'planilha', link do formulário digitalizado no Drive e uma chave
-- que deixa a importação ser executada de novo sem duplicar linhas.
alter table public.mecanizacao_lancamentos add column if not exists origem text not null default 'sistema';
alter table public.mecanizacao_lancamentos add column if not exists formulario_url text;
alter table public.mecanizacao_lancamentos add column if not exists chave_importacao text;
create unique index if not exists mecanizacao_lancamentos_chave_importacao
  on public.mecanizacao_lancamentos (chave_importacao);
create index if not exists mecanizacao_lancamentos_criado_por on public.mecanizacao_lancamentos (criado_por_email);

create index if not exists mecanizacao_lancamentos_data_vistoria on public.mecanizacao_lancamentos (data_vistoria);
create index if not exists mecanizacao_lancamentos_municipio on public.mecanizacao_lancamentos (municipio);
create index if not exists mecanizacao_lancamentos_escritorio on public.mecanizacao_lancamentos (escritorio_local);
create index if not exists mecanizacao_lancamentos_criado_em on public.mecanizacao_lancamentos (criado_em desc);

alter table public.mecanizacao_lancamentos enable row level security;
revoke all on public.mecanizacao_lancamentos from anon, authenticated;
-- Nenhuma policy: só a service_role (usada por lancar_mecanizacao.php) acessa.
-- Se um dia o painel passar a ler estes dados direto do navegador, crie aqui
-- uma policy "for select to authenticated" como em eleicoes.sql.
--
-- service_role contorna as políticas de RLS acima, mas ainda precisa desse
-- grant básico do Postgres pra poder ler/gravar a tabela — sem isso, tanto
-- salvar quanto listar em lancar_mecanizacao.php recebem "permission denied
-- for table mecanizacao_lancamentos" (mesmo bug já visto em admin.sql).
grant select, insert, update, delete on public.mecanizacao_lancamentos to service_role;

-- Bucket de Storage para guardar o PDF da ficha original enviada (opcional:
-- se a linha não tiver pdf_arquivo, o lançamento foi digitado sem anexo).
insert into storage.buckets (id, name, public)
values ('mecanizacao-formularios', 'mecanizacao-formularios', false)
on conflict (id) do nothing;

commit;
