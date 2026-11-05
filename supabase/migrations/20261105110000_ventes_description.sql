-- Ventes diverses : description synthétique de ce qui a été commandé + détail complet (affiché dans la fiche).
-- Additif. Retour arrière : alter table public.ventes_dues drop column description, drop column description_detail;
--   puis recréer ventes_detail_payeur depuis 20261024199600_ventes_detail_achats_famille.sql.
alter table public.ventes_dues add column if not exists description text;
alter table public.ventes_dues add column if not exists description_detail text;

drop function if exists public.ventes_detail_payeur(uuid, uuid);
create function public.ventes_detail_payeur(p_famille uuid, p_contact uuid)
returns table (
  id uuid, exercice_id uuid, date_vente date, domaine text, objet text, quantite integer, montant numeric,
  paye numeric, mode text, notes text, saisi_par text, operations jsonb, description text, description_detail text
)
language sql stable security definer set search_path = public as $$
  select d.id, d.exercice_id, d.created_at::date, d.domaine, s.nom, d.quantite, d.montant_attendu,
         coalesce((select sum(p.montant) from ventes_paiements p where p.vente_due_id = d.id), 0),
         d.mode_attendu, d.notes,
         coalesce((select coalesce(m.libelle, nullif(trim(coalesce(m.prenom, '') || ' ' || coalesce(m.nom, '')), ''))
                     from evenement_membres m where m.user_id = d.created_by limit 1),
                  (select nullif(trim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, '')), '') from profils pr where pr.id = d.created_by),
                  (select case pr.role when 'tresorier' then 'Trésorier' when 'directrice' then 'Directrice' else pr.role end
                     from profils pr where pr.id = d.created_by)),
         coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'date', o.date_operation, 'libelle', o.libelle,
                                                         'exercice_id', o.exercice_id) order by o.date_operation)
                     from ventes_paiements p join operations o on o.id = p.operation_id where p.vente_due_id = d.id), '[]'::jsonb),
         d.description, d.description_detail
    from ventes_dues d join ventes_sous_categories s on s.id = d.sous_categorie_id
   where public.domaine_ventes_ok(d.domaine)
     and ((p_famille is not null and d.famille_id = p_famille) or (p_contact is not null and d.contact_id = p_contact))
   order by d.created_at desc;
$$;
revoke execute on function public.ventes_detail_payeur(uuid, uuid) from public, anon;
grant execute on function public.ventes_detail_payeur(uuid, uuid) to authenticated;
