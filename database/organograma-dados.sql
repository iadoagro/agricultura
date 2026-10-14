-- Dados do organograma (setores, responsáveis, portarias e histórico) que antes ficavam
-- escritos dentro de pages/organograma.html e js/dados-seagri.js. A página lê daqui.
-- Executar no SQL Editor do mesmo projeto Supabase; pode ser executado de novo (atualiza os dados).
begin;

create table if not exists public.organograma_setores (
  id text primary key,
  parent_id text,                 -- id do setor acima (null = raiz)
  tipo text not null,             -- secretaria, diretoria, departamento, divisao, nucleo...
  cor text not null,              -- purple|yellow|blue|green|orange ou #rrggbb
  titulo text not null,
  holder text not null default '',     -- "Nome, quebra de linha, Portaria Nº 1/2026"
  matricula text not null default '',
  x bigint not null, y bigint not null, w bigint not null,   -- posição/tamanho do desenho original (EMU)
  hh bigint not null, bh bigint not null,
  ordem int not null default 0
);

create table if not exists public.organograma_portarias (
  chave text primary key,         -- "216/2026"
  pdf text not null               -- caminho do PDF da portaria
);

create table if not exists public.organograma_historico (
  id bigint generated always as identity primary key,
  setor_id text not null,
  nome text not null,
  portaria text,
  ano int,
  ordem int not null default 0     -- 0 = mais recente
);
create index if not exists organograma_historico_setor on public.organograma_historico (setor_id, ordem);

do $$
declare t text;
begin
  foreach t in array array['organograma_setores','organograma_portarias','organograma_historico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_leitura', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t||'_leitura', t);
    execute format('drop policy if exists %I on public.%I', t||'_gravacao', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (lower(coalesce(auth.jwt() ->> 'email','')) = 'root@root.com')
      with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'root@root.com')$p$, t||'_gravacao', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ===== setores =====
delete from public.organograma_setores;
insert into public.organograma_setores (id,parent_id,tipo,cor,titulo,holder,matricula,x,y,w,hh,bh,ordem) values
('sec',null,'secretaria','purple','Secretária','Temyllis Lima da Silva
Decreto Nº 12.457-P/2026','',4685896,156319,531692,107821,118927,0),
('gab','sec','assessoria','yellow','Gabinete da Secretária','Francisco Diego
Portaria Nº 25/2026','9610286-3',4076554,487016,531692,108000,108000,1),
('secad','sec','secretaria-adjunta','yellow','Secretário Adjunto','Edivan Maciel
Decreto Nº 1.307-P/2023','',5269338,489807,531692,107821,107821,2),
('gabsecad','secad','assessoria','yellow','Gabinete do Secretário Adjunto','Josilda Lima
Portaria Nº 214/2023','9592083-2',5943414,489025,531693,107756,107756,3),
('ci','sec','assessoria','yellow','Controle Interno','Lilian Vitoria
Portaria Nº 285/2024','9557385-3',4080840,796098,531692,108000,108000,4),
('conjur','sec','assessoria','yellow','Consultoria Jurídica','Thais Ferreira
Portaria Nº 35/2023','9595716-2',5266558,806357,531692,108000,108000,5),
('ascom','sec','assessoria','yellow','Assessoria de Comunicação','Dionisio Neto
Portaria Nº 192/2026','9206370-3',4078314,1095317,531692,108000,108000,6),
('ouvid','sec','assessoria','yellow','Ouvidoria','Maria Socorro
Portaria Nº 110/2023','9507540-2',5256916,1100835,531692,108000,108000,7),
('pecafes','sec','comissao','yellow','Comissão do Programa Estadual de Compras Governamentais da Agricultura Familiar e Economia Solidária no Estado do Acre','','',4078314,1396231,531692,108000,108000,8),
('cppas','sec','comissao','yellow','Comissão Permanente de Processo Administrativo Sancionador','Marina Farias
Portaria Nº 226/2025','9329650-1',5274297,1405574,531692,108000,108000,9),
('daf','sec','diretoria','blue','Diretoria de Administração e Finanças','Nivia Cristina
Decreto Nº 12.182-P/2026','',1849751,1848197,531692,108000,108000,10),
('dpa','sec','diretoria','#2f855a','Diretoria de Produção e Agronegócio','Cláudio Malveira
Decreto Nº 1.855-P/2023','',4679298,1835765,529087,108000,108000,11),
('dptec','sec','diretoria','orange','Diretoria de Pesquisa, Tecnologia e Inovação do Agronegócio','Thiago de Almeida
Decreto Nº 2.525-P/2023','',7137044,1837112,531692,108000,108000,12),
('del','daf','departamento','blue','Departamento de Escritórios Locais','Jorge Ney Pontes
Portaria Nº 45/2023','9470700-3',400566,2169841,531692,108000,108000,13),
('deg','daf','departamento','blue','Departamento de Gestão','Mayssa Diniz
Portaria Nº 83/2026','9608990-1',1324530,2171404,531692,108000,108000,14),
('deplan','daf','departamento','blue','Departamento de Planejamento','Natalia Cristina
Portaria Nº 60/2025','9095012-5',2625520,2169036,531692,108000,108000,15),
('deof','daf','departamento','blue','Departamento de Orçamento e Finanças','Heloneyda Marques
Portaria Nº 193/2026','9072837-11',3283570,2172608,531692,108000,108000,16),
('disg','deg','divisao','blue','Divisão de Serviços Gerais','Renata Carvalho
Portaria Nº 151/2025','9610944-2',727949,2547403,232615,162000,189000,17),
('dipm','deg','divisao','blue','Divisão de Patrimônio e Materiais','Rosimeire Cavalcante
Portaria Nº 06/2023','73725-1',974619,2547485,232615,162000,189000,18),
('diarp','deg','divisao','blue','Divisão de Arquivo e Protocolo','Maria do Socorro
Portaria Nº 07/2023','',1223778,2547992,232615,162000,189000,19),
('dirh','deg','divisao','blue','Divisão de Recursos Humanos','Marcleide Tavares
Portaria Nº 04/2023','212598-1',1471454,2546320,232615,162000,189000,20),
('dit','deg','divisao','blue','Divisão de Transporte','Pedro Alencar
Portaria Nº 173/2026','',1715870,2546212,232621,162000,189000,21),
('dimt','deg','divisao','blue','Divisão de Modernização Tecnológica','Luan Dourado
Portaria Nº 216/2026','9617973-2',1965521,2545129,232615,162000,189000,22),
('dicompras','deg','divisao','blue','Divisão de Licitações, Compras e Contratos','João Paulo
Portaria Nº 30/2026','9128123-5',2212029,2545724,232615,162000,189000,23),
('dicon','deplan','divisao','blue','Divisão de Convênios','Pâmela Galvão
Portaria Nº 19/2025','9572350-4',2523199,2545651,232616,162000,189000,24),
('dipro','deplan','divisao','blue','Divisão de Programas','Marcos Santana
Portaria Nº 217/2026','9683477-1',2773177,2545325,232615,162000,189000,25),
('dimon','deplan','divisao','blue','Divisão de Monitoramento','Éllen Abud
Portaria Nº 97/2023','9332154-1',3020592,2545586,232615,162000,189000,26),
('dif','deof','divisao','blue','Divisão de Finanças','Karin Gomes
Portaria Nº 194/2026','9612114-4',3309023,2546080,232615,162000,189000,27),
('dic','deof','divisao','blue','Divisão de Contabilidade','Camila Arruda
Portaria Nº 195/2026','9572350-4',3558646,2546080,232615,162000,189000,28),
('desan','dpa','departamento','#2f855a','Departamento Socioprodutivo e Segurança Alimentar','Igor Honorato
Portaria Nº 196/2026','9348476-1',3861852,2175010,531692,108000,108000,29),
('deagro','dpa','departamento','#2f855a','Departamento de Agronegócio','Jalceyr Pessoa
Portaria Nº 94/2023','9353720-1',4589190,2176531,531692,108000,108000,30),
('deprof','dpa','departamento','#2f855a','Departamento de Produção Familiar','Josicley Azevedo
Portaria Nº 244/2026','9094393-3',5466975,2174568,531692,108000,108000,31),
('dem','dpa','departamento','#2f855a','Departamento de Mecanização','Richarler Aguiar
Portaria Nº 124/2024','9610499-3',6354393,2171352,531692,108000,108000,32),
('diis','desan','divisao','#2f855a','Divisão de Inclusão Socioprodutiva','Ariane Gadelha
Portaria Nº 197/2026','9508643-3',3906561,2541713,232615,162000,232615,33),
('disan','desan','divisao','#2f855a','Divisão de Segurança Alimentar','Marcela
Portaria Nº 201/2026','9310690-2',4157364,2542010,232615,162000,232615,34),
('dia','deagro','divisao','#2f855a','Divisão de Agricultura','Nilton Cesar
Portaria Nº 207/2026','9249362-2',4472136,2548414,232614,162000,189000,35),
('dipec','deagro','divisao','#2f855a','Divisão de Pecuária','Willian Junis
Portaria Nº 227/2025','',4737977,2546962,232615,162000,189000,36),
('divpi','deprof','divisao','#2f855a','Divisão de Produção Indígena','Adriano Dias
Portaria Nº 107/2023','',5370596,2553577,232615,162000,189000,37),
('divpf','deprof','divisao','#2f855a','Divisão de Produção Familiar','Wally Stanley
Portaria Nº 245/2026','9109595-4',5617138,2553577,232616,162000,189000,38),
('disbio','deprof','divisao','#2f855a','Divisão de Sociobiodiversidade','Eneide Thaumaturgo
Portaria Nº 246/2026','9182152-3',5871698,2554074,232598,158307,228600,39),
('divrsa','deprof','divisao','#2f855a','Divisão de Remuneração de Serviços Ambientais','','',6124000,2554074,232615,162000,189000,40),
('divma','dem','divisao','#2f855a','Divisão de Manutenção de Equipamentos','','',6380930,2557225,232615,162000,189000,41),
('diveo','dem','divisao','#2f855a','Divisão de Escoamento e Operações','','',6627248,2558014,232615,162000,189000,42),
('nap','diis','nucleo','#2f855a','Núcleo de Apoio Logístico','Antônio José
Portaria Nº 198/2026','201278-1',2804203,3181082,235004,162000,232615,43),
('ncaf','diis','nucleo','#2f855a','Núcleo de Cadastro da Agricultura Familiar','Conceição
Portaria Nº 199/2026','291978-1',3070058,3179892,209474,162000,232615,44),
('npolo','diis','nucleo','#2f855a','Núcleo de Polos Agroflorestais','Carlos Antonio
Portaria Nº 200/2026','150304-1',3309070,3180487,210784,162000,232615,45),
('npaa','disan','nucleo','#2f855a','Núcleo do Programa de Aquisição de Alimentos','Claiton
Portaria Nº 202/2026','9353674-1',3552641,3176514,204606,162000,206939,46),
('npaai','disan','nucleo','#2f855a','Núcleo do Programa de Aquisição de Alimentos Indígena','José Paulo
Portaria Nº 204/2026','9111476-2',3785082,3172719,218348,162000,218661,47),
('npaaex','disan','nucleo','#2f855a','Núcleo do Programa de Aquisição de Alimentos Extrativista','Yanná
Portaria Nº 205/2026','9626867-2',4020124,3169674,238284,162000,236244,48),
('nucaf','dia','nucleo','#2f855a','Núcleo do Café','Michelma Silva
Portaria Nº 206/2026','9312480-2',4315725,3171362,221106,162000,214800,49),
('nuars','dia','nucleo','#2f855a','Núcleo de Armazenamento e Silos','Nilton César
Portaria Nº 207/2026','9249362-2',4556966,3171962,236405,164462,242100,50),
('nuapes','dipec','nucleo','#2f855a','Núcleo de Aquicultura e Pesca','Wallace Santos
Portaria Nº 208/2026','9213317-1',4829669,3180425,232522,162000,270000,51),
('nuav','dipec','nucleo','#2f855a','Núcleo da Avicultura','Bruna Diogo
Portaria Nº 209/2026','9626816-1',5086898,3179830,250056,162000,251700,52),
('nuspi','divpi','nucleo','#2f855a','Núcleo Socioprodutivo Indígena','Hidelk Farias
Portaria Nº 210/2026','9098879-9',5370007,3189006,232621,146788,154090,53),
('nucac','divpf','nucleo','#2f855a','Núcleo do Cacau','Marcos Rocha
Portaria Nº 211/2026','9628576-1',5617613,3193305,232621,146709,154066,54),
('numel','divpf','nucleo','#2f855a','Núcleo do Mel','Rubia Mara
Portaria Nº 212/2026','9086870-6',5867281,3191461,232621,152061,156085,55),
('numan','divpf','nucleo','#2f855a','Núcleo da Mandioca','Murilo Matos
Portaria Nº 213/2026','265101-2',6119530,3189962,217088,156821,146801,56),
('nuole','divpf','nucleo','#2f855a','Núcleo da Olericultura','Adriana Melo
Portaria Nº 214/2026','9610936-3',6363736,3189938,226170,149650,156085,57),
('nuex','disbio','nucleo','#2f855a','Núcleo de Extrativismo','Angelina Lima
Portaria Nº 215/2026','71153-1',6609502,3187763,208771,147370,215100,58),
('det','dptec','departamento','orange','Departamento de Tecnologia','Luan Sobral
Portaria Nº 216/2026','9617973-2',7137442,2166671,528369,108000,108000,59),
('depi','dptec','departamento','orange','Departamento de Pesquisa e Inovação','Roger Recco
Portaria Nº 53/2025','9213880-1',7878132,2165653,528369,108000,108000,60),
('diap','det','divisao','orange','Divisão de Agricultura de Precisão','','',7110285,2550506,232615,162000,232200,61),
('dida','det','divisao','orange','Divisão de Dados Estatísticos','','',7360919,2550503,232615,162000,232200,62),
('digt','det','divisao','orange','Divisão de Geoprocessamento e Telemetria','Izaura Cardoso
Portaria Nº 218/2026','9189599-9',7614507,2550238,232615,162000,232500,63),
('disoft','det','divisao','orange','Divisão de Sistema de Informação','Gabriane Vaz
Portaria Nº 219/2026','9617230-1',7863537,2551049,232500,162000,234000,64),
('ditt','depi','divisao','orange','Divisão de Transferência de Tecnologia','Ediu Carlos
Portaria Nº 220/2026','9683836-1',8133783,2550082,232615,162000,232200,65),
('dipa','depi','divisao','orange','Divisão de Pesquisa Agropecuária','Marcos Vinicius
Portaria Nº 217/2026','9683477-1',8384132,2550082,232500,162000,232076,66),
('dicp','depi','divisao','orange','Divisão de Certificação de Produtos','Yanná Thaumaturgo
Portaria Nº 205/2026','9626867-2',8635267,2550082,232615,162000,231806,67),
('el-acld','del','escritorio','blue','Escritório Local de Acrelândia','Max Teodoro
Portaria Nº 298/2025','9407456-4',598233,3960995,481846,135000,135000,68),
('el-abl','del','escritorio','blue','Escritório Local de Assis Brasil','Wilker Nazareno
Portaria Nº 187/2023','',1133241,3958613,481846,135000,135000,69),
('el-bxvd','del','escritorio','blue','Escritório Local da Baixa Verde','','',1661181,3959438,481846,135000,135000,70),
('el-bli','del','escritorio','blue','Escritório Local de Brasiléia','Antônio Francisco
Portaria Nº 153/2023','',2192857,3958613,481846,135000,135000,71),
('el-bjri','del','escritorio','blue','Escritório Local de Bujari','Luciano Queiroz
Portaria Nº 86/2025','9624643-2',2727865,3958613,481846,135000,135000,72),
('el-camp','del','escritorio','blue','Escritório Local de Campinas','','',3270725,3958021,481846,135000,135000,73),
('el-cpxb','del','escritorio','blue','Escritório Local de Capixaba','Kemy Fernandes
Portaria Nº 329/2024','',3829038,3954677,481846,135000,135000,74),
('el-czs','del','escritorio','blue','Escritório Local de Cruzeiro do Sul','Marcos Pereira
Portaria Nº 136/2023','189391-2',4348696,3952068,481846,135000,135000,75),
('el-ept','del','escritorio','blue','Escritório Local de Epitaciolândia','Jose Menezes
Portaria Nº 138/2023','263176-3',4887684,3949687,481846,135000,135000,76),
('el-fjo','del','escritorio','blue','Escritório Local de Feijó','João Paulo
Portaria Nº 134/2023','9304762-2',5431484,3949687,481846,135000,135000,77),
('el-pdht','del','escritorio','blue','Escritório Local do Humaitá','Wilson Brito
Portaria Nº 30/2025','9102337-8',5972342,3948723,481846,135000,135000,78),
('el-joao','del','escritorio','blue','Escritório Local de Jordão','Cintia Araujo
Portaria Nº 127/2026','9470271-3',6511338,3950278,481846,135000,135000,79),
('el-mli','del','escritorio','blue','Escritório Local de Mâncio Lima','Magno Corrêa
Portaria Nº 177/2024','',7055590,3948634,481846,135000,135000,80),
('el-mlu','del','escritorio','blue','Escritório Local de Manoel Urbano','Denes Bruno
Portaria Nº 175/2023','9334947-3',593952,4436651,481846,135000,135000,81),
('el-mlto','del','escritorio','blue','Escritório Local de Marechal Thaumaturgo','Laires Azevedo
Portaria Nº 290/2025','9334866-2',1129199,4436653,481846,135000,135000,82),
('el-poac','del','escritorio','blue','Escritório Local de Porto Acre','Wilson de Brito
Portaria Nº 191/2023','9102337-8',1655254,4435697,481846,135000,135000,83),
('el-pcy','del','escritorio','blue','Escritório Local de Plácido de Castro','Antonio Pinto
Portaria Nº 101/2025','9235701-5',2186106,4435697,481846,135000,135000,84),
('el-pwtr','del','escritorio','blue','Escritório Local de Porto Walter','Eriânio Melo
Portaria Nº 255/2024','',2724717,4435697,481846,135000,135000,85),
('el-rbo','del','escritorio','blue','Escritório Local de Rio Branco','Risomar Freire
Portaria Nº 179/2023','',3267150,4435697,481846,135000,135000,86),
('el-rgas','del','escritorio','blue','Escritório Local de Rodrigues Alves','','',3809115,4437699,481846,135000,135000,87),
('el-srju','del','escritorio','blue','Escritório Local de Santa Rosa do Purus','Lugma Fernanda
Portaria Nº 181/2026','',4345032,4435689,481846,135000,135000,88),
('el-smd','del','escritorio','blue','Escritório Local de Sena Madureira','Adoneyson Campos
Portaria Nº 118/2024','9437509-3',4880087,4436118,481846,135000,135000,89),
('el-swd','del','escritorio','blue','Escritório Local de Senador Guiomard','Carlos Casas
Portaria Nº 269/2025','',5418759,4433904,481846,135000,135000,90),
('el-tau','del','escritorio','blue','Escritório Local de Tarauacá','Leocélia Monteiro
Portaria Nº 141/2026','',5960149,4433904,481846,135000,135000,91),
('el-trcr','del','escritorio','blue','Escritório Local da Transacreana','Lucas Paiva
Portaria Nº 180/2023','',6514497,4430333,481846,135000,135000,92),
('el-xpi','del','escritorio','blue','Escritório Local de Xapuri','Antonio Alves
Portaria Nº 32/2025','',7053032,4430333,481846,135000,135000,93);

-- ===== portarias (número/ano -> PDF) =====
delete from public.organograma_portarias;
insert into public.organograma_portarias (chave,pdf) values
('04/2023','portarias/portarias 2023/[015]-5958327_Publicacao.pdf'),
('06/2023','portarias/portarias 2023/[015]-5958327_Publicacao.pdf'),
('07/2023','portarias/portarias 2023/[015]-5958327_Publicacao.pdf'),
('35/2023','portarias/portarias 2023/[066]-6025855_Publicacao.pdf'),
('45/2023','portarias/portarias 2023/[082]-6065080_Publicacao.pdf'),
('94/2023','portarias/portarias 2023/[149]-6204238_Publicacao.pdf'),
('97/2023','portarias/portarias 2023/[149]-6204238_Publicacao.pdf'),
('107/2023','portarias/portarias 2023/[159]-6204795_Publicacao.pdf'),
('110/2023','portarias/portarias 2023/[127]-6188760_Publicacao.pdf'),
('134/2023','portarias/portarias 2023/[199]-6355713_Publicacao.pdf'),
('136/2023','portarias/portarias 2023/[199]-6355713_Publicacao.pdf'),
('138/2023','portarias/portarias 2023/[199]-6355713_Publicacao.pdf'),
('153/2023','portarias/portarias 2023/[218]-6444113_Publicacao.pdf'),
('175/2023','portarias/portarias 2023/[252]-6499223_Publicacao.pdf'),
('179/2023','portarias/portarias 2023/[259]-6501228_Publicacao.pdf'),
('180/2023','portarias/portarias 2023/[259]-6501228_Publicacao.pdf'),
('187/2023','portarias/portarias 2023/[264]-6501405_Publicacao.pdf'),
('191/2023','portarias/portarias 2023/[266]-6508343_Publicacao.pdf'),
('213/2023','portarias/portarias 2023/[272]-6736012_Publicacao.pdf'),
('214/2023','portarias/portarias 2023/[274]-6751629_Publicacao.pdf'),
('118/2024','portarias/portarias 2024/[094]-0011286402_Publicacao.pdf'),
('124/2024','portarias/portarias 2024/[100]-0011304172_Publicacao.pdf'),
('177/2024','portarias/portarias 2024/[110]-0011990282_Publicacao.pdf'),
('255/2024','portarias/portarias 2024/[144]-0012930490_Publicacao.pdf'),
('280/2024','portarias/portarias 2024/[158]-0013209229_Publicacao.pdf'),
('285/2024','portarias/portarias 2024/[161]-0013278709_Publicacao_Portaria_285___Republicado___Chefe.pdf'),
('329/2024','portarias/portarias 2024/[217]-0013616259_Publicacao.pdf'),
('19/2025','portarias/portarias 2025/[023]-0013959607_Publicacao.pdf'),
('30/2025','portarias/portarias 2025/[029]-0014215576_Publicacao.pdf'),
('32/2025','portarias/portarias 2025/[033]-0014231639_Publicacao.pdf'),
('53/2025','portarias/portarias 2025/[043]-0014601644_Publicacao_da_Portaria_n._53_2025___Chefia_do_Dep._de.pdf'),
('60/2025','portarias/portarias 2025/[051]-0014721879_Publicacao_da_Portaria_60_2025__.pdf'),
('86/2025','portarias/portarias 2025/[071]-0015089859_Publicacao.pdf'),
('101/2025','portarias/portarias 2025/[087]-0015406227_Publicacao.pdf'),
('102/2025','portarias/portarias 2025/[089]-0015466098_Publicacao.pdf'),
('132/2025','portarias/portarias 2025/[113]-0016096089_Publicacao.pdf'),
('151/2025','portarias/portarias 2025/[129]-0017061525_Publicacao.pdf'),
('227/2025','portarias/portarias 2025/[129]-0017061525_Publicacao.pdf'),
('269/2025','portarias/portarias 2025/[143]-0018040909_Publicacao.pdf'),
('290/2025','portarias/portarias 2025/[145]-0018081245_Publicacao.pdf'),
('298/2025','portarias/portarias 2025/[151]-0018170345_Publicacao.pdf'),
('25/2026','portarias/portarias 2026/Portaria 25 - Francisco Diego Soares de Messias.pdf'),
('83/2026','portarias/portarias 2026/Portaria 83 - Mayssa Jhully Oliveira de Souza Diniz.pdf'),
('173/2026','portarias/portarias 2026/Portaria 173 - Pedro de Alencar Pedrosa Matos.pdf'),
('181/2026','portarias/portarias 2026/Portaria 181 - Lugma Fernanda Pinheiro de Moura.pdf'),
('192/2026','portarias/portarias 2026/Portaria 192 - Dionisio Ferreira do Vale Neto.pdf'),
('193/2026','portarias/portarias 2026/Portaria 193 - Heloneyda Marques de Oliveira.pdf'),
('194/2026','portarias/portarias 2026/Portaria 194 - Karin Gomes Barlatti.pdf'),
('195/2026','portarias/portarias 2026/Portaria 195 - Camila de Melo Pires Arruda Oliveira.pdf'),
('196/2026','portarias/portarias 2026/Portaria 196 - Igor Honorato Leduino da Silva.pdf'),
('197/2026','portarias/portarias 2026/Portaria 197 - Ariane Gadelha dos Santos.pdf'),
('198/2026','portarias/portarias 2026/Portaria 198 - Antonio Jose Pereira da Silva.pdf'),
('199/2026','portarias/portarias 2026/Portaria 199 - Maria da Conceicao Almeida.pdf'),
('200/2026','portarias/portarias 2026/Portaria 200 - Carlos Antonio Pinheiro da Silva.pdf'),
('201/2026','portarias/portarias 2026/Portaria 201 - Marcela Rocha da Silva.pdf'),
('202/2026','portarias/portarias 2026/Portaria 202 - Claiton Roniere Oliveira.pdf'),
('204/2026','portarias/portarias 2026/Portaria 204 - Jose Paulo dos Santos Silva.pdf'),
('205/2026','portarias/portarias 2026/Portaria 205 - Yanna Thaumaturgo Motta.pdf'),
('206/2026','portarias/portarias 2026/Portaria 206 - Michelma Neves de Lima.pdf'),
('207/2026','portarias/portarias 2026/Portaria 207 - Nilton Cesar de Souza.pdf'),
('208/2026','portarias/portarias 2026/Portaria 208 - Wallace Santos Batista.pdf'),
('209/2026','portarias/portarias 2026/Portaria 209 - Bruna da Silva Diogo.pdf'),
('210/2026','portarias/portarias 2026/Portaria 210 - Hidelk Dinarte Farias de Albuquerque.pdf'),
('211/2026','portarias/portarias 2026/Portaria 211 - Marcos Rocha da Silva.pdf'),
('212/2026','portarias/portarias 2026/Portaria 212 - Rubia Mara Pessoa da Costa Lima.pdf'),
('213/2026','portarias/portarias 2026/Portaria 213 - Murilo de Araujo Matos Filho.pdf'),
('214/2026','portarias/portarias 2026/Portaria 214 - Adriana da Silva Melo.pdf'),
('215/2026','portarias/portarias 2026/Portaria 215 - Angelina Frota de Lima.pdf'),
('216/2026','portarias/portarias 2026/Portaria 216 - Luan Sobral Dourado.pdf'),
('217/2026','portarias/portarias 2026/Portaria 217 - Marcos Vinicius Rodrigues Santana.pdf'),
('218/2026','portarias/portarias 2026/Portaria 218 - Izaura Maria Cardoso Barros de Sa.pdf'),
('219/2026','portarias/portarias 2026/Portaria 219 - Gabriane Morais Vaz.pdf'),
('220/2026','portarias/portarias 2026/Portaria 220 - Ediu Carlos da Silva Junior.pdf'),
('244/2026','portarias/portarias 2026/Portaria 244-246 - Josicley, Wally, Eneide.pdf'),
('245/2026','portarias/portarias 2026/Portaria 244-246 - Josicley, Wally, Eneide.pdf'),
('246/2026','portarias/portarias 2026/Portaria 244-246 - Josicley, Wally, Eneide.pdf');

-- ===== histórico de responsáveis por setor =====
delete from public.organograma_historico;
insert into public.organograma_historico (setor_id,nome,portaria,ano,ordem) values
('cppas','Marina Farias de Albuquerque','226/2025',2025,0),
('gab','Francisco Diego','25/2026',2026,0),
('gabsecad','Josilda Lima','214/2023',2023,0),
('conjur','Thais Ferreira','35/2023',2023,0),
('ascom','Dionisio Neto','192/2026',2026,0),
('deg','Mayssa Diniz','83/2026',2026,0),
('deplan','Natalia Cristina','60/2025',2025,0),
('deof','Heloneyda Marques','193/2026',2026,0),
('disg','Renata Carvalho','151/2025',2025,0),
('dimt','Luan Dourado','216/2026',2026,0),
('dicompras','João Paulo','30/2026',2026,0),
('dicon','Pâmela Galvão','19/2025',2025,0),
('dipro','Marcos Santana','217/2026',2026,0),
('dif','Karin Gomes','194/2026',2026,0),
('dic','Camila Arruda','195/2026',2026,0),
('desan','Igor Honorato','196/2026',2026,0),
('deagro','Jalceyr Pessoa','94/2023',2023,0),
('deprof','Josicley Azevedo','244/2026',2026,0),
('dem','Richarler Aguiar','124/2024',2024,0),
('diis','Ariane Gadelha','197/2026',2026,0),
('disan','Marcela','201/2026',2026,0),
('dia','Nilton Cesar','207/2026',2026,0),
('det','Luan Sobral','216/2026',2026,0),
('depi','Roger Recco','53/2025',2025,0),
('digt','Izaura Cardoso','218/2026',2026,0),
('disoft','Gabriane Vaz','219/2026',2026,0),
('ditt','Ediu Carlos','220/2026',2026,0),
('dipa','Marcos Vinicius','217/2026',2026,0),
('dicp','Yanná Thaumaturgo','205/2026',2026,0),
('el-acld','Max Teodoro','298/2025',2025,0),
('el-bjri','Luciano Queiroz','86/2025',2025,0),
('el-czs','Marcos Pereira','136/2023',2023,0),
('el-ept','Jose Menezes','138/2023',2023,0),
('el-fjo','João Paulo','134/2023',2023,0),
('el-pdht','Wilson Brito','30/2025',2025,0),
('el-mlu','Denes Bruno','175/2023',2023,0),
('el-mlto','Laires Azevedo','290/2025',2025,0),
('el-pcy','Antonio Pinto','101/2025',2025,0),
('el-srju','Lugma Fernanda','181/2026',2026,0),
('el-smd','Adoneyson Campos','118/2024',2024,0),
('el-swd','Carlos Casas','269/2025',2025,0),
('el-tau','Leocélia Monteiro','141/2026',2026,0),
('el-trcr','Lucas Paiva','180/2023',2023,0),
('el-xpi','Antonio Alves','32/2025',2025,0),
('el-mli','Magno Corrêa','177/2024',2024,0),
('el-pwtr','Eriânio Melo','255/2024',2024,0),
('el-cpxb','Kemy Fernandes','329/2024',2024,0),
('el-poac','Wilson de Brito','191/2023',2023,0),
('el-abl','Wilker Nazareno','187/2023',2023,0),
('el-joao','Cintia Araujo','127/2026',2026,0),
('el-bli','Antônio Francisco','153/2023',2023,0);

commit;

-- ===== portarias acrescentadas depois de conferir a pasta portarias/ (2023 a 2026) =====
begin;
insert into public.organograma_portarias (chave, pdf) values
  ('30/2026',  'portarias/portarias 2026/[035]-0019737965_Publicacao.pdf'),
  ('127/2026', 'portarias/portarias 2026/[061]-0020559364_Publicacao.pdf')
on conflict (chave) do update set pdf = excluded.pdf;
commit;
