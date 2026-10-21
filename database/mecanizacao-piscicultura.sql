-- Executar no SQL Editor do mesmo projeto Supabase, DEPOIS de mecanizacao-lancamentos.sql. Pode ser executado de novo.
--
-- Piscicultura deixa de ser "implemento" e passa a ser um serviço da Açudagem: o formulário pergunta, ao lançar uma
-- Açudagem, se é piscicultura. O dado fica na coluna "piscicultura". Os lançamentos que traziam "Piscicultura" na lista
-- de implementos (planilha importada e fichas antigas) são migrados: marcam piscicultura = true e a palavra sai da
-- lista de implementos. Depois deste arquivo, reaplique mecanizacao-painel-rpc.sql e mecanizacao-desempenho.sql, que
-- passam a levar o campo ao painel.
begin;

alter table public.mecanizacao_lancamentos add column if not exists piscicultura boolean not null default false;

update public.mecanizacao_lancamentos
   set piscicultura = true,
       implementos = array_remove(implementos, 'Piscicultura')
 where 'Piscicultura' = any(implementos);

commit;
