-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de mecanizacao-lancamentos.sql. Pode ser executado de novo.
--
-- Destoca deixa de ser "implemento" e passa a ser um serviço da Mecanização (como a piscicultura é da Açudagem): o
-- formulário pergunta, ao lançar uma Mecanização, se é para destoca. O dado fica na coluna "destoca". Os lançamentos que
-- traziam "Destoca" na lista de implementos são migrados: marcam destoca = true e a palavra sai da lista de implementos.
-- Depois deste arquivo, reaplique mecanizacao-painel-rpc.sql e mecanizacao-desempenho.sql (levam o campo ao painel).
begin;

alter table public.mecanizacao_lancamentos add column if not exists destoca boolean not null default false;

update public.mecanizacao_lancamentos
   set destoca = true,
       implementos = array_remove(implementos, 'Destoca')
 where 'Destoca' = any(implementos);

commit;
