-- Diretoria de Produção e Agronegócio (dpa) e tudo abaixo dela na cor verde (#2f855a).
-- Atualiza a base (organograma_setores) e remove cor própria dos ajustes dessas caixas. Pode rodar de novo.
with recursive sub as (
  select id from public.organograma_setores where id = 'dpa'
  union
  select s.id from public.organograma_setores s join sub on s.parent_id = sub.id
)
update public.organograma_setores set cor = '#2f855a' where id in (select id from sub);

with recursive sub as (
  select id from public.organograma_setores where id = 'dpa'
  union
  select s.id from public.organograma_setores s join sub on s.parent_id = sub.id
)
update public.organograma_ajustes set cor = null where id in (select id from sub) and cor is not null;
