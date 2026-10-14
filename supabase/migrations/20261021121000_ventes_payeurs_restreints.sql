-- Ventes diverses : la Directrice ne voit dans la liste des payeurs que les contacts « école »
-- (parent, enseignant, bureau, autre, événement), jamais les fiches purement donateurs.
create or replace function public.liste_payeurs_ventes(p_domaine text)
returns table (kind text, id uuid, libelle text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'famille'::text as kind, f.id, f.nom as libelle
      from familles f
     where public.domaine_ventes_ok(p_domaine)
    union all
    select 'contact'::text as kind, c.id,
           case when c.est_personne_morale then coalesce(c.raison_sociale, c.nom)
                else trim(coalesce(c.prenom, '') || ' ' || c.nom) end as libelle
      from contacts c
     where public.domaine_ventes_ok(p_domaine)
       and c.supprime_le is null
       and (
         public.mon_role() = 'tresorier'
         or (public.mon_role() = 'directrice' and c.categories && array['parent','enseignant','bureau','autre','evenement']::text[])
         or (public.est_evenement() and c.categories <@ array['vendeur','evenement']::text[])
       )
  ) x
  order by libelle;
$$;
