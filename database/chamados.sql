-- Executar no SQL Editor do mesmo projeto Supabase do admin.sql (idempotente:
-- pode rodar de novo sem problema).
--
-- Módulo Chamados (suporte de TI):
--   * qualquer pessoa, SEM login, abre um chamado (não vê nem digita código: o
--     código CH-XXXXX-XXXXX existe só como chave secreta guardada no navegador de
--     quem abriu, para responder/avaliar); a tela pública lista todos os chamados;
--   * a equipe de TI (root@root.com ou conta aprovada e ativa com "chamados"
--     liberado em Acessos) vê a fila, assume, muda status, responde e anota;
--   * a tela pública só enxerga o que a função consultar_chamado devolve:
--     nunca e-mail, telefone nem notas internas.
--
-- As tabelas ficam com RLS ligado. chamados e chamados_eventos não têm acesso
-- direto do anon (só chamados_aux, as listas de seleção, é legível). O
-- público entra só pelas funções abrir_chamado / consultar_chamado /
-- responder_chamado / avaliar_chamado; a equipe lê pelas policies abaixo e
-- escreve só pela função chamado_atualizar, que também grava o histórico.
begin;

-- ---------------------------------------------------------------- tabelas
create table if not exists public.chamados (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  codigo text not null unique,
  solicitante_nome text not null,
  solicitante_email text,
  solicitante_telefone text,
  setor text not null,
  local text,
  categoria text not null check (categoria in ('hardware','software','rede','acesso','impressora','email','telefonia','outro')),
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  assunto text not null,
  descricao text not null,
  status text not null default 'aberto' check (status in ('aberto','em_atendimento','aguardando_usuario','resolvido','fechado','cancelado')),
  responsavel_id uuid references auth.users(id) on delete set null,
  responsavel_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  prazo_em timestamptz,
  resolvido_em timestamptz,
  avaliacao_nota smallint check (avaliacao_nota between 1 and 5),
  avaliacao_comentario text
);

create table if not exists public.chamados_eventos (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  tipo text not null check (tipo in ('abertura','status','prioridade','atribuicao','resposta','nota','solicitante','avaliacao')),
  publico boolean not null default true,
  autor text not null,
  texto text,
  de_valor text,
  para_valor text,
  criado_em timestamptz not null default now()
);

-- Cadastros auxiliares (mantidos pela equipe em "Cadastros auxiliares"):
-- diretoria > departamento > setor, e a lista de problemas. Uma tabela só,
-- com pai_id para a hierarquia. O chamado guarda o NOME escolhido (cópia),
-- então renomear ou excluir um cadastro nunca altera chamados antigos.
create table if not exists public.chamados_aux (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('diretoria','departamento','setor','problema')),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  pai_id uuid references public.chamados_aux(id) on delete restrict,
  categoria text check (categoria in ('hardware','software','rede','acesso','impressora','email','telefonia','outro')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint chamados_aux_pai_chk check (tipo in ('departamento','setor') or pai_id is null),
  constraint chamados_aux_categoria_chk check (tipo <> 'problema' or categoria is not null)
);
create unique index if not exists chamados_aux_unico
  on public.chamados_aux (tipo, coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nome)));
create index if not exists chamados_aux_pai_idx on public.chamados_aux (pai_id);

alter table public.chamados add column if not exists diretoria text;
alter table public.chamados add column if not exists departamento text;
alter table public.chamados add column if not exists problema text;
alter table public.chamados add column if not exists problema_id uuid references public.chamados_aux(id) on delete set null;

create index if not exists chamados_status_idx on public.chamados (status, criado_em desc);
create index if not exists chamados_email_idx on public.chamados (lower(solicitante_email));
create index if not exists chamados_eventos_chamado_idx on public.chamados_eventos (chamado_id, criado_em);

alter table public.chamados enable row level security;
alter table public.chamados_eventos enable row level security;
alter table public.chamados_aux enable row level security;
revoke all on public.chamados from anon, authenticated;
revoke all on public.chamados_eventos from anon, authenticated;
revoke all on public.chamados_aux from anon, authenticated;
grant select on public.chamados to authenticated;
grant select on public.chamados_eventos to authenticated;
-- Os cadastros não são sigilosos: o formulário público lê os ativos para
-- montar as listas de seleção; só a equipe altera.
grant select on public.chamados_aux to anon, authenticated;
grant insert, update, delete on public.chamados_aux to authenticated;

-- --------------------------------------------------------- quem é da equipe
create or replace function public.pode_chamados()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(trim(coalesce((select auth.jwt() ->> 'email'), ''))) = 'root@root.com'
    or exists (
      select 1 from public.admin_solicitacoes s
      where s.id = auth.uid()
        and s.status = 'aprovado'
        and coalesce(s.ativo, true) = true
        and 'chamados' = any (s.paginas)
    );
$$;
grant execute on function public.pode_chamados() to authenticated;

drop policy if exists "Equipe le chamados" on public.chamados;
create policy "Equipe le chamados" on public.chamados
  for select to authenticated using (public.pode_chamados());

drop policy if exists "Equipe le eventos" on public.chamados_eventos;
create policy "Equipe le eventos" on public.chamados_eventos
  for select to authenticated using (public.pode_chamados());

drop policy if exists "Publico le cadastros ativos" on public.chamados_aux;
create policy "Publico le cadastros ativos" on public.chamados_aux
  for select to anon, authenticated using (ativo);
drop policy if exists "Equipe le todos os cadastros" on public.chamados_aux;
create policy "Equipe le todos os cadastros" on public.chamados_aux
  for select to authenticated using (public.pode_chamados());
drop policy if exists "Equipe cria cadastros" on public.chamados_aux;
create policy "Equipe cria cadastros" on public.chamados_aux
  for insert to authenticated with check (public.pode_chamados());
drop policy if exists "Equipe edita cadastros" on public.chamados_aux;
create policy "Equipe edita cadastros" on public.chamados_aux
  for update to authenticated using (public.pode_chamados()) with check (public.pode_chamados());
drop policy if exists "Equipe exclui cadastros" on public.chamados_aux;
create policy "Equipe exclui cadastros" on public.chamados_aux
  for delete to authenticated using (public.pode_chamados());

-- Lista inicial de problemas (só se ainda não existir nenhum). Diretorias,
-- departamentos e setores dependem da empresa: cadastre em "Cadastros auxiliares".
insert into public.chamados_aux (tipo, nome, categoria)
select 'problema', v.nome, v.categoria
from (values
  ('Computador não liga','hardware'),('Computador lento ou travando','hardware'),
  ('Tela, teclado ou mouse com defeito','hardware'),('Notebook sem bateria ou carregador','hardware'),
  ('Erro em sistema interno','software'),('Instalação ou atualização de programa','software'),
  ('Arquivos do Office não abrem','software'),('Alerta de vírus ou segurança','software'),
  ('Sem acesso à internet','rede'),('Wi-Fi instável ou sem sinal','rede'),
  ('VPN ou acesso remoto','rede'),('Pasta de rede inacessível','rede'),
  ('Esqueci a senha','acesso'),('Conta bloqueada','acesso'),
  ('Solicitar acesso a um sistema','acesso'),('Criar usuário para novo colaborador','acesso'),
  ('Impressora não imprime','impressora'),('Papel atolado ou qualidade ruim','impressora'),
  ('Scanner / digitalização','impressora'),
  ('Não envio ou não recebo e-mails','email'),('Caixa de e-mail cheia','email'),
  ('Configurar e-mail no celular','email'),
  ('Ramal sem funcionamento','telefonia'),('Configurar transferência de ramal','telefonia')
) as v(nome, categoria)
where not exists (select 1 from public.chamados_aux where tipo = 'problema');

-- ----------------------------------------------------------- utilitários
-- Prazo (SLA) em horas por prioridade.
create or replace function public.horas_sla(p text)
returns integer language sql immutable as $$
  select case p when 'critica' then 4 when 'alta' then 8 when 'baixa' then 72 else 24 end;
$$;

-- Código público difícil de adivinhar (40 bits aleatórios do uuid v4).
create or replace function public.gerar_codigo_chamado()
returns text
language plpgsql
as $$
declare
  hex text;
  novo text;
begin
  loop
    hex := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    novo := 'CH-' || substr(hex, 1, 5) || '-' || substr(hex, 6, 5);
    exit when not exists (select 1 from public.chamados where codigo = novo);
  end loop;
  return novo;
end;
$$;

-- "nome.sobrenome@sistema.local" -> "Nome Sobrenome"
create or replace function public.nome_da_equipe()
returns text
language sql
stable
as $$
  select initcap(replace(split_part(coalesce((select auth.jwt() ->> 'email'), 'equipe'), '@', 1), '.', ' '));
$$;

-- ---------------------------------------------------------- funções públicas
-- Assinatura antiga (9 parâmetros de texto), de uma versão anterior deste arquivo.
drop function if exists public.abrir_chamado(text,text,text,text,text,text,text,text,text);

-- Recebe um único json. Para cada nível (diretoria, departamento, setor,
-- problema) aceita o id do cadastro escolhido (o nome vem do banco, não do
-- navegador) OU um texto livre — usado quando a empresa ainda não cadastrou
-- aquele nível em "Cadastros auxiliares".
create or replace function public.abrir_chamado(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := left(btrim(coalesce(p->>'nome', '')), 100);
  v_email text := nullif(left(btrim(coalesce(p->>'email', '')), 150), '');
  v_tel text := nullif(left(btrim(coalesce(p->>'telefone', '')), 40), '');
  v_local text := nullif(left(btrim(coalesce(p->>'local', '')), 100), '');
  v_assunto text := left(btrim(coalesce(p->>'assunto', '')), 140);
  v_desc text := left(btrim(coalesce(p->>'descricao', '')), 4000);
  v_prio text := case when p->>'prioridade' in ('baixa','media','alta') then p->>'prioridade' else 'media' end;
  v_dir text := nullif(left(btrim(coalesce(p->>'diretoria', '')), 120), '');
  v_dep text := nullif(left(btrim(coalesce(p->>'departamento', '')), 120), '');
  v_set text := nullif(left(btrim(coalesce(p->>'setor', '')), 120), '');
  v_prob text := nullif(left(btrim(coalesce(p->>'problema', '')), 120), '');
  v_cat text := p->>'categoria';
  v_pid uuid;
  v_aux public.chamados_aux;
  v_codigo text;
  v_id uuid;
  v_num bigint;
begin
  -- Cadastros escolhidos: o nome oficial vem do banco.
  if nullif(p->>'diretoria_id', '') is not null then
    select * into v_aux from public.chamados_aux where id = (p->>'diretoria_id')::uuid and tipo = 'diretoria' and ativo;
    if not found then raise exception 'A diretoria escolhida não existe mais. Atualize a página.'; end if;
    v_dir := v_aux.nome;
  end if;
  if nullif(p->>'departamento_id', '') is not null then
    select * into v_aux from public.chamados_aux where id = (p->>'departamento_id')::uuid and tipo = 'departamento' and ativo;
    if not found then raise exception 'O departamento escolhido não existe mais. Atualize a página.'; end if;
    v_dep := v_aux.nome;
  end if;
  if nullif(p->>'setor_id', '') is not null then
    select * into v_aux from public.chamados_aux where id = (p->>'setor_id')::uuid and tipo = 'setor' and ativo;
    if not found then raise exception 'O setor escolhido não existe mais. Atualize a página.'; end if;
    v_set := v_aux.nome;
  end if;
  if nullif(p->>'problema_id', '') is not null then
    select * into v_aux from public.chamados_aux where id = (p->>'problema_id')::uuid and tipo = 'problema' and ativo;
    if not found then raise exception 'O problema escolhido não existe mais. Atualize a página.'; end if;
    v_prob := v_aux.nome; v_cat := v_aux.categoria; v_pid := v_aux.id;
  end if;

  -- Sem setor informado, usa o departamento (ou a diretoria) como local do chamado.
  v_set := coalesce(v_set, v_dep, v_dir);

  if char_length(v_nome) < 2 then raise exception 'Informe seu nome.'; end if;
  if v_set is null or char_length(v_set) < 2 then raise exception 'Informe seu setor.'; end if;
  if char_length(v_assunto) < 4 then raise exception 'Descreva o assunto em poucas palavras.'; end if;
  if char_length(v_desc) < 10 then raise exception 'Conte um pouco mais do problema (mínimo 10 caracteres).'; end if;
  if v_cat is null or v_cat not in ('hardware','software','rede','acesso','impressora','email','telefonia','outro') then
    v_cat := 'outro';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'O e-mail informado não parece válido.';
  end if;

  -- Freio simples contra abuso (não há login nesta tela).
  if (select count(*) from public.chamados
        where criado_em > now() - interval '1 hour'
          and lower(solicitante_nome) = lower(v_nome) and lower(setor) = lower(v_set)) >= 8
     or (select count(*) from public.chamados where criado_em > now() - interval '1 hour') >= 300 then
    raise exception 'Muitos chamados em pouco tempo. Aguarde alguns minutos e tente de novo.';
  end if;

  v_codigo := public.gerar_codigo_chamado();
  insert into public.chamados (codigo, solicitante_nome, solicitante_email, solicitante_telefone, diretoria, departamento, setor, local,
                               problema, problema_id, categoria, prioridade, assunto, descricao, prazo_em)
  values (v_codigo, v_nome, v_email, v_tel, v_dir, v_dep, v_set, v_local,
          v_prob, v_pid, v_cat, v_prio, v_assunto, v_desc,
          now() + make_interval(hours => public.horas_sla(v_prio)))
  returning id, numero into v_id, v_num;

  insert into public.chamados_eventos (chamado_id, tipo, publico, autor, texto)
  values (v_id, 'abertura', true, v_nome, 'Chamado aberto.');

  return json_build_object('codigo', v_codigo, 'numero', v_num);
end;
$$;

create or replace function public.consultar_chamado(p_codigo text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.chamados;
begin
  select * into c from public.chamados where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return null; end if;
  return json_build_object(
    'chamado', json_build_object(
      'codigo', c.codigo, 'numero', c.numero, 'assunto', c.assunto, 'descricao', c.descricao,
      'categoria', c.categoria, 'problema', c.problema, 'diretoria', c.diretoria, 'departamento', c.departamento,
      'setor', c.setor, 'local', c.local, 'prioridade', c.prioridade,
      'status', c.status, 'solicitante_nome', c.solicitante_nome, 'responsavel_nome', c.responsavel_nome,
      'criado_em', c.criado_em, 'atualizado_em', c.atualizado_em, 'prazo_em', c.prazo_em,
      'resolvido_em', c.resolvido_em, 'avaliacao_nota', c.avaliacao_nota
    ),
    'eventos', coalesce((
      select json_agg(json_build_object(
        'tipo', e.tipo, 'autor', e.autor, 'texto', e.texto,
        'de_valor', e.de_valor, 'para_valor', e.para_valor, 'criado_em', e.criado_em
      ) order by e.criado_em)
      from public.chamados_eventos e where e.chamado_id = c.id and e.publico
    ), '[]'::json)
  );
end;
$$;

-- A pessoa responde pelo código; se o chamado esperava por ela, volta pra fila.
create or replace function public.responder_chamado(p_codigo text, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chamados;
  v_texto text := left(btrim(coalesce(p_texto, '')), 2000);
begin
  if char_length(v_texto) < 2 then raise exception 'Escreva a mensagem.'; end if;
  select * into c from public.chamados where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if c.status in ('fechado','cancelado') then raise exception 'Este chamado já foi encerrado. Abra um novo se precisar.'; end if;
  insert into public.chamados_eventos (chamado_id, tipo, publico, autor, texto)
  values (c.id, 'solicitante', true, c.solicitante_nome, v_texto);
  update public.chamados set
    atualizado_em = now(),
    status = case when status in ('aguardando_usuario','resolvido') then 'em_atendimento' else status end,
    resolvido_em = case when status = 'resolvido' then null else resolvido_em end
  where id = c.id;
  if c.status in ('aguardando_usuario','resolvido') then
    insert into public.chamados_eventos (chamado_id, tipo, publico, autor, de_valor, para_valor)
    values (c.id, 'status', true, c.solicitante_nome, c.status, 'em_atendimento');
  end if;
end;
$$;

create or replace function public.avaliar_chamado(p_codigo text, p_nota integer, p_comentario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chamados;
  v_com text := nullif(left(btrim(coalesce(p_comentario, '')), 1000), '');
begin
  if p_nota is null or p_nota < 1 or p_nota > 5 then raise exception 'A nota vai de 1 a 5.'; end if;
  select * into c from public.chamados where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if c.status not in ('resolvido','fechado') then raise exception 'Você poderá avaliar quando o chamado for resolvido.'; end if;
  if c.avaliacao_nota is not null then raise exception 'Este chamado já foi avaliado. Obrigado!'; end if;
  update public.chamados set avaliacao_nota = p_nota, avaliacao_comentario = v_com, atualizado_em = now() where id = c.id;
  insert into public.chamados_eventos (chamado_id, tipo, publico, autor, texto, para_valor)
  values (c.id, 'avaliacao', true, c.solicitante_nome, v_com, p_nota::text);
end;
$$;

-- ----------------------------------------------------------- função da equipe
-- Um só ponto de escrita da equipe: valida, aplica as mudanças e grava um
-- evento para cada uma (o "autor" vem do login, não do navegador).
create or replace function public.chamado_atualizar(
  p_id uuid,
  p_status text default null,
  p_prioridade text default null,
  p_assumir boolean default false,
  p_responsavel text default null,
  p_texto text default null,
  p_publico boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chamados;
  v_autor text := public.nome_da_equipe();
  v_texto text := nullif(left(btrim(coalesce(p_texto, '')), 4000), '');
begin
  if not public.pode_chamados() then raise exception 'Sem autorização para atender chamados.'; end if;
  select * into c from public.chamados where id = p_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;

  if p_status is not null and p_status <> c.status then
    if p_status not in ('aberto','em_atendimento','aguardando_usuario','resolvido','fechado','cancelado') then
      raise exception 'Status inválido.';
    end if;
    update public.chamados set
      status = p_status,
      resolvido_em = case when p_status in ('resolvido','fechado') then coalesce(resolvido_em, now()) else null end
    where id = c.id;
    insert into public.chamados_eventos (chamado_id, tipo, publico, autor, de_valor, para_valor)
    values (c.id, 'status', true, v_autor, c.status, p_status);
  end if;

  if p_prioridade is not null and p_prioridade <> c.prioridade then
    if p_prioridade not in ('baixa','media','alta','critica') then raise exception 'Prioridade inválida.'; end if;
    update public.chamados set
      prioridade = p_prioridade,
      prazo_em = c.criado_em + make_interval(hours => public.horas_sla(p_prioridade))
    where id = c.id;
    insert into public.chamados_eventos (chamado_id, tipo, publico, autor, de_valor, para_valor)
    values (c.id, 'prioridade', true, v_autor, c.prioridade, p_prioridade);
  end if;

  if p_assumir then
    update public.chamados set responsavel_id = auth.uid(), responsavel_nome = v_autor,
      status = case when status = 'aberto' then 'em_atendimento' else status end where id = c.id;
    insert into public.chamados_eventos (chamado_id, tipo, publico, autor, de_valor, para_valor)
    values (c.id, 'atribuicao', true, v_autor, c.responsavel_nome, v_autor);
    if c.status = 'aberto' and (p_status is null or p_status = 'aberto') then
      insert into public.chamados_eventos (chamado_id, tipo, publico, autor, de_valor, para_valor)
      values (c.id, 'status', true, v_autor, 'aberto', 'em_atendimento');
    end if;
  elsif p_responsavel is not null and coalesce(p_responsavel, '') <> coalesce(c.responsavel_nome, '') then
    update public.chamados set responsavel_id = null, responsavel_nome = nullif(left(btrim(p_responsavel), 100), '') where id = c.id;
    insert into public.chamados_eventos (chamado_id, tipo, publico, autor, de_valor, para_valor)
    values (c.id, 'atribuicao', true, v_autor, c.responsavel_nome, nullif(left(btrim(p_responsavel), 100), ''));
  end if;

  if v_texto is not null then
    insert into public.chamados_eventos (chamado_id, tipo, publico, autor, texto)
    values (c.id, case when p_publico then 'resposta' else 'nota' end, p_publico, v_autor, v_texto);
  end if;

  update public.chamados set atualizado_em = now() where id = c.id;
end;
$$;

-- ------------------------------------------------- lista pública (somente leitura)
-- A tela "Acompanhar" mostra TODOS os chamados de todos os setores, sem login e
-- sem código. Por isso a lista e o detalhe devolvem só o que é seguro mostrar:
-- nome abreviado ("Paulo R."), estrutura, problema, descrição, status e o
-- histórico público. Nunca e-mail, telefone, nota interna nem o código secreto
-- do chamado (é ele que autoriza responder/avaliar, então não sai daqui).
create or replace function public.nome_curto(p_nome text)
returns text
language sql
immutable
as $$
  select case
    when position(' ' in btrim(coalesce(p_nome, ''))) > 0
      then split_part(btrim(p_nome), ' ', 1) || ' ' || upper(left((regexp_match(btrim(p_nome), '(\S+)$'))[1], 1)) || '.'
    else btrim(coalesce(p_nome, ''))
  end;
$$;

create or replace function public.listar_chamados_publico()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(t order by t.criado_em desc), '[]'::json) from (
    select c.numero, public.nome_curto(c.solicitante_nome) as solicitante, c.diretoria, c.departamento, c.setor,
           c.problema, c.categoria, c.status, c.prioridade, c.responsavel_nome,
           c.criado_em, c.atualizado_em, c.prazo_em, c.resolvido_em
    from public.chamados c
    order by c.criado_em desc
    limit 1000
  ) t;
$$;

create or replace function public.detalhe_chamado_publico(p_numero bigint)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.chamados;
begin
  select * into c from public.chamados where numero = p_numero;
  if not found then return null; end if;
  return json_build_object(
    'chamado', json_build_object(
      'numero', c.numero, 'assunto', c.assunto, 'descricao', c.descricao, 'categoria', c.categoria, 'problema', c.problema,
      'diretoria', c.diretoria, 'departamento', c.departamento, 'setor', c.setor, 'local', c.local,
      'prioridade', c.prioridade, 'status', c.status, 'solicitante_nome', public.nome_curto(c.solicitante_nome),
      'responsavel_nome', c.responsavel_nome, 'criado_em', c.criado_em, 'atualizado_em', c.atualizado_em,
      'prazo_em', c.prazo_em, 'resolvido_em', c.resolvido_em, 'avaliacao_nota', c.avaliacao_nota
    ),
    'eventos', coalesce((
      select json_agg(json_build_object(
        'tipo', e.tipo, 'autor', case when e.tipo in ('abertura','solicitante','avaliacao') then public.nome_curto(e.autor) else e.autor end,
        'texto', e.texto, 'de_valor', e.de_valor, 'para_valor', e.para_valor, 'criado_em', e.criado_em
      ) order by e.criado_em)
      from public.chamados_eventos e where e.chamado_id = c.id and e.publico
    ), '[]'::json)
  );
end;
$$;

-- ----------------------------------------------------------------- permissões
revoke all on function public.abrir_chamado(jsonb) from public;
revoke all on function public.listar_chamados_publico() from public;
revoke all on function public.detalhe_chamado_publico(bigint) from public;
revoke all on function public.consultar_chamado(text) from public;
revoke all on function public.responder_chamado(text,text) from public;
revoke all on function public.avaliar_chamado(text,integer,text) from public;
revoke all on function public.chamado_atualizar(uuid,text,text,boolean,text,text,boolean) from public;
grant execute on function public.abrir_chamado(jsonb) to anon, authenticated;
grant execute on function public.listar_chamados_publico() to anon, authenticated;
grant execute on function public.detalhe_chamado_publico(bigint) to anon, authenticated;
grant execute on function public.consultar_chamado(text) to anon, authenticated;
grant execute on function public.responder_chamado(text,text) to anon, authenticated;
grant execute on function public.avaliar_chamado(text,integer,text) to anon, authenticated;
grant execute on function public.chamado_atualizar(uuid,text,text,boolean,text,text,boolean) to authenticated;

commit;

-- Depois de rodar: confirme que o público NÃO lê a tabela direto (deve dar
-- lista vazia ou erro de permissão, nunca os chamados):
--   curl "$URL/rest/v1/chamados?select=*" -H "apikey: $CHAVE_PUBLISHABLE"
