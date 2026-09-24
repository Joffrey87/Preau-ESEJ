-- Agrégats pour le tableau de bord Mécénat, calculés en base (léger côté app).
-- security invoker → respecte la RLS (utilisateur authentifié voit tout).
create or replace function public.mecenat_stats()
returns json
language sql
stable
security invoker
as $$
  with ops as (
    select o.montant, o.type, o.date_operation, o.exercice_id, c.nom as cat_nom
    from public.operations o
    left join public.categories c on c.id = o.categorie_id
  ),
  par_ex as (
    select e.id, e.libelle, e.date_debut, e.date_fin,
      coalesce(sum(o.montant) filter (where o.cat_nom = 'Don' and o.type = 'recette'), 0) as dons,
      coalesce(sum(o.montant) filter (where o.cat_nom in ('Ventes diverses au profit de l''école', 'Ventes diverses') and o.type = 'recette'), 0) as ventes_brut,
      coalesce(sum(o.montant) filter (where o.cat_nom = 'Fournitures pour ventes diverses' and o.type = 'depense'), 0) as ventes_fournitures,
      coalesce(sum(o.montant) filter (where o.type = 'recette'), 0) as total_recettes,
      coalesce(sum(o.montant) filter (where o.type = 'depense'), 0) as total_depenses
    from public.exercices e
    left join ops o on o.exercice_id = e.id
    group by e.id, e.libelle, e.date_debut, e.date_fin
  ),
  saison as (
    select extract(month from date_operation)::int as mois,
           coalesce(sum(montant), 0) as dons,
           count(*) as nb
    from ops
    where cat_nom = 'Don' and type = 'recette'
    group by 1
  )
  select json_build_object(
    'exercices', (select coalesce(json_agg(row_to_json(par_ex) order by par_ex.date_debut), '[]') from par_ex),
    'saisonnalite', (select coalesce(json_agg(row_to_json(saison) order by saison.mois), '[]') from saison)
  );
$$;

grant execute on function public.mecenat_stats() to authenticated;
