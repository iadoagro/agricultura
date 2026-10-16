-- Agendamento dos relatórios do painel de Mecanização (pg_cron, horário de Brasília/UTC):
--   semanal: toda segunda-feira, 08:00 em Rio Branco (13:00 UTC), relatório da semana anterior
--   mensal : dia 1 de cada mês, 08:00 em Rio Branco, relatório do mês anterior
-- Os relatórios ficam em public.mecanizacao_relatorios e aparecem na aba "Relatórios" do painel.
-- Idempotente: reagendar com o mesmo nome substitui o anterior.
create extension if not exists pg_cron;

select cron.schedule('mecanizacao-relatorio-semanal', '0 13 * * 1',
  $$select public.mecanizacao_gerar_relatorio('semanal')$$);
select cron.schedule('mecanizacao-relatorio-mensal', '0 13 1 * *',
  $$select public.mecanizacao_gerar_relatorio('mensal')$$);
