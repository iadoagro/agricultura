-- Executar no SQL Editor depois de eleicoes.sql e fiscais-acesso.sql
-- (idempotente, pode rodar de novo sem problema).
--
-- Cadastro auxiliar de Bairros usado no formulário de Fiscais
-- (pages/eleicoes.html). Tela de manutenção: pages/cadastros-fiscais.html.
--
-- A lista do campo "Bairro" passa a vir desta tabela (só os ativos do
-- município). Qualquer bairro novo informado num cadastro de fiscal entra
-- aqui sozinho (gatilho fiscais_bairros_do_cadastro), então aparece na
-- lista das próximas vezes sem ninguém precisar cadastrar à mão.
begin;

create table if not exists public.fiscais_bairros (
  id uuid primary key default gen_random_uuid(),
  municipio text not null check (municipio ~ '^\d{7}$'),
  nome text not null check (length(btrim(nome)) between 1 and 120),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null
);
-- Um bairro por município, sem diferenciar maiúsculas/espaços nas pontas.
create unique index if not exists fiscais_bairros_unico
  on public.fiscais_bairros (municipio, lower(btrim(nome)));

alter table public.fiscais_bairros enable row level security;
revoke all on public.fiscais_bairros from anon, authenticated;
grant select, insert, update, delete on public.fiscais_bairros to authenticated;

drop policy if exists "Aprovados leem bairros" on public.fiscais_bairros;
drop policy if exists "Aprovados adicionam bairros" on public.fiscais_bairros;
drop policy if exists "Aprovados editam bairros" on public.fiscais_bairros;
drop policy if exists "Aprovados excluem bairros" on public.fiscais_bairros;
create policy "Aprovados leem bairros" on public.fiscais_bairros
  for select to authenticated using (public.eh_root_ou_aprovado());
create policy "Aprovados adicionam bairros" on public.fiscais_bairros
  for insert to authenticated with check (public.eh_root_ou_aprovado());
create policy "Aprovados editam bairros" on public.fiscais_bairros
  for update to authenticated using (public.eh_root_ou_aprovado())
  with check (public.eh_root_ou_aprovado());
create policy "Aprovados excluem bairros" on public.fiscais_bairros
  for delete to authenticated using (public.eh_root_ou_aprovado());

-- Bairro novo digitado num cadastro de fiscal → entra no cadastro auxiliar.
-- Só aceita texto com pelo menos uma letra (evita telefone digitado no
-- campo errado virar "bairro"). security definer: roda mesmo que a policy
-- de quem salvou o fiscal não cubra essa tabela.
create or replace function public.fiscais_bairros_do_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b text := btrim(coalesce(new.dados->>'bairro', ''));
begin
  if b <> '' and b ~ '[[:alpha:]]' and length(b) <= 120 then
    insert into public.fiscais_bairros (municipio, nome)
    values (new.dados->>'municipio', b)
    on conflict (municipio, lower(btrim(nome))) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists fiscais_bairros_do_cadastro on public.eleicoes_cadastros;
create trigger fiscais_bairros_do_cadastro
  after insert or update of dados on public.eleicoes_cadastros
  for each row execute function public.fiscais_bairros_do_cadastro();

-- Carga inicial 1: os bairros que o formulário já listava (bairros
-- oficiais do mapa que têm local de votação — Rio Branco + 8 municípios
-- com bairro do IBGE).
insert into public.fiscais_bairros (municipio, nome) values
  ('1200054', 'Cascata'),
  ('1200054', 'Centro'),
  ('1200054', 'Plácido de Castro'),
  ('1200104', 'Alberto Castro'),
  ('1200104', 'Centro'),
  ('1200104', 'Eldorado'),
  ('1200104', 'Ferreira Silva'),
  ('1200104', 'Leonardo Barbosa'),
  ('1200104', 'Raimundo Chaar'),
  ('1200252', 'Aeroporto'),
  ('1200252', 'Beira Rio'),
  ('1200252', 'José Hassem'),
  ('1200252', 'Liberdade'),
  ('1200252', 'Satel'),
  ('1200302', 'Centro'),
  ('1200302', 'Cidade Nova'),
  ('1200302', 'Esperança'),
  ('1200302', 'Nair Araújo'),
  ('1200401', 'ABRAAO ALAB'),
  ('1200401', 'AEROPORTO VELHO'),
  ('1200401', 'ALTO ALEGRE'),
  ('1200401', 'AMAPA'),
  ('1200401', 'APOLONIO SALES'),
  ('1200401', 'AVIARIO'),
  ('1200401', 'AYRTON SENA'),
  ('1200401', 'BAHIA'),
  ('1200401', 'BAIXA DA COLINA'),
  ('1200401', 'BASE'),
  ('1200401', 'BELO JARDIM'),
  ('1200401', 'BOA UNIAO'),
  ('1200401', 'BOSQUE'),
  ('1200401', 'CAMPUS UFAC'),
  ('1200401', 'CENTRO'),
  ('1200401', 'CERAMICA'),
  ('1200401', 'CHICO MENDES'),
  ('1200401', 'CIDADE DO POVO'),
  ('1200401', 'CIDADE NOVA'),
  ('1200401', 'COMARA'),
  ('1200401', 'CONQUISTA'),
  ('1200401', 'CUSTODIO FREIRE'),
  ('1200401', 'DISTRITO INDUSTRIAL'),
  ('1200401', 'ELDORADO'),
  ('1200401', 'ESPERANCA'),
  ('1200401', 'ESTACAO EXPERIMENTAL'),
  ('1200401', 'FLORESTA SUL'),
  ('1200401', 'GUIOMARD SANTOS'),
  ('1200401', 'IOLANDA'),
  ('1200401', 'ISAURA PARENTE'),
  ('1200401', 'ITUCUMA'),
  ('1200401', 'JARDIM PRIMAVERA'),
  ('1200401', 'JOAO EDUARDO'),
  ('1200401', 'JORGE LAVOCAT'),
  ('1200401', 'MANOEL JULIAO'),
  ('1200401', 'MORADA DO SOL'),
  ('1200401', 'NOVA ESTACAO'),
  ('1200401', 'PALHEIRAL'),
  ('1200401', 'PREVENTORIO'),
  ('1200401', 'QUINZE'),
  ('1200401', 'RECANTO DOS BURITIS'),
  ('1200401', 'RUI LINO'),
  ('1200401', 'SANTA INES'),
  ('1200401', 'SANTO AFONSO'),
  ('1200401', 'SAO FRANCISCO'),
  ('1200401', 'SEIS DE AGOSTO'),
  ('1200401', 'SOBRAL'),
  ('1200401', 'TANCREDO NEVES'),
  ('1200401', 'TAQUARI'),
  ('1200401', 'TRIANGULO'),
  ('1200401', 'UNIVERSITARIO'),
  ('1200401', 'VILA BETEL'),
  ('1200401', 'VILA IVONETE'),
  ('1200401', 'VITORIA'),
  ('1200401', 'XAVIER MAIA'),
  ('1200427', 'Centro'),
  ('1200427', 'Roberto Leite'),
  ('1200500', 'Bom Sucesso'),
  ('1200500', 'Cafezal'),
  ('1200500', 'Centro'),
  ('1200500', 'Centro Social Urbano'),
  ('1200500', 'Cidade Nova'),
  ('1200500', 'Cohab'),
  ('1200500', 'Cristo Libertador'),
  ('1200500', 'Da Pista'),
  ('1200500', 'Do Bosque'),
  ('1200500', 'Jorge Alves Júnior'),
  ('1200500', 'José Nogueira Sobrinho'),
  ('1200500', 'Niterói'),
  ('1200609', 'Centro'),
  ('1200609', 'Copacabana'),
  ('1200609', 'Praia'),
  ('1200609', 'Triângulo'),
  ('1200708', 'Bolívia'),
  ('1200708', 'Centro'),
  ('1200708', 'Cerâmica'),
  ('1200708', 'Constantino'),
  ('1200708', 'Sibéria')
on conflict (municipio, lower(btrim(nome))) do nothing;

-- Carga inicial 2: bairros já digitados em cadastros de fiscais existentes.
insert into public.fiscais_bairros (municipio, nome)
select distinct on (dados->>'municipio', lower(btrim(dados->>'bairro')))
       dados->>'municipio', btrim(dados->>'bairro')
from public.eleicoes_cadastros
where btrim(coalesce(dados->>'bairro', '')) ~ '[[:alpha:]]'
  and length(btrim(dados->>'bairro')) <= 120
on conflict (municipio, lower(btrim(nome))) do nothing;

commit;
