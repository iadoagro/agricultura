-- Diretorias dpa e dptec e tudo abaixo delas: texto do título (cabeçalho da caixa) em branco.
with recursive efetivo as (
  select s.id, coalesce(a.parent_id, s.parent_id) as pai
    from public.organograma_setores s left join public.organograma_ajustes a on a.id = s.id
  union
  select a.id, a.parent_id from public.organograma_ajustes a
   where a.novo and not a.removido and a.id not in (select id from public.organograma_setores)
), sub as (
  select id from efetivo where id in ('dpa','dptec')
  union
  select e.id from efetivo e join sub on e.pai = sub.id
)
insert into public.organograma_ajustes (id, cor_titulo)
select id, '#ffffff' from sub
on conflict (id) do update set cor_titulo = '#ffffff', atualizado_em = now();
