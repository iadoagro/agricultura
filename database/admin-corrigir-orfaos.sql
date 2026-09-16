-- Executar no SQL Editor do mesmo projeto Supabase do admin.sql, sempre que
-- alguém aparecer em Authentication > Users mas não aparecer na tela
-- Usuários do site, ou que cadastrar essa pessoa de novo disser "já existe
-- uma conta com esse login" mesmo sem ela aparecer na lista.
--
-- Causa: o gatilho ao_criar_usuario_admin (ver admin.sql) só cria a linha em
-- admin_solicitacoes quando a conta nasce DEPOIS dele existir. Conta criada
-- direto em Authentication > Users, importada, ou criada antes de rodar
-- admin.sql pela primeira vez, fica sem linha correspondente — por isso não
-- aparece na lista (que só lê admin_solicitacoes) e trava ao tentar
-- recriar (o Supabase Auth já não aceita o e-mail de novo).
--
-- Idempotente: pode rodar de novo sem problema, só preenche quem estiver
-- faltando. Depois de rodar, dê um F5 na tela Usuários — quem faltava
-- aparece como "Pendente"; aprove normalmente.
insert into public.admin_solicitacoes (id, email)
select u.id, u.email
from auth.users u
left join public.admin_solicitacoes s on s.id = u.id
where s.id is null;
