-- La jauge des dons (RPC dons_exercice_courant) est aussi servie au Directeur spirituel (onglet Dons).
create or replace function public.dons_exercice_courant()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when not (public.peut_voir_pipeline() or public.mon_role() = 'directeur-spirituel') then null else (
    select jsonb_build_object(
      'exercice', e.libelle,
      'debut', e.date_debut,
      'fin', e.date_fin,
      'dons', coalesce((
        select jsonb_agg(jsonb_build_object('date', o.date_operation, 'montant', o.montant) order by o.date_operation)
          from operations o join categories c on c.id = o.categorie_id
         where o.exercice_id = e.id and c.nom = 'Don' and o.type = 'recette'
           and not coalesce(o.est_ventilee, false)
           and not exists (select 1 from operations f where f.parent_id = o.id)
           and not exists (select 1 from dons d where d.operation_id = o.id and d.don_boursier and d.supprime_le is null)
      ), '[]'::jsonb))
    from exercices e
    where (now() at time zone 'Europe/Paris')::date between e.date_debut and e.date_fin
    limit 1)
  end
$function$;
