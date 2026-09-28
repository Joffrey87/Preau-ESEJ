-- Aperçu de l'espace d'une famille par le bureau : même contenu, sans compte famille.
-- Le corps commun reçoit l'identifiant de la famille ; il n'est pas exposé.
create or replace function public.contenu_espace_famille(f uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'famille', (select to_jsonb(x) from familles x where x.id = f),
    'eleves', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'initiale', e.initiale, 'classe_entree', e.classe_entree,
                  'annee_entree', e.annee_entree, 'decalage', e.decalage, 'sorti_le', e.sorti_le)
                  order by e.annee_entree, e.initiale), '[]'::jsonb)
                 from eleves e where e.famille_id = f),
    'inscriptions', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', i.id, 'annee_scolaire', i.annee_scolaire, 'nb_enfants', i.nb_enfants,
                        'montant_mensuel', i.montant_mensuel, 'avance', i.avance,
                        'm_sept', i.m_sept, 'm_oct', i.m_oct, 'm_nov', i.m_nov, 'm_dec', i.m_dec,
                        'm_jan', i.m_jan, 'm_fev', i.m_fev, 'm_mars', i.m_mars, 'm_avr', i.m_avr,
                        'm_mai', i.m_mai, 'm_juin', i.m_juin,
                        'avance_consommee', i.avance_consommee, 'depot_anterieur', i.depot_anterieur)
                        order by i.annee_scolaire desc), '[]'::jsonb)
                       from scolarite_inscriptions i where i.famille_id = f),
    'versements', (select coalesce(jsonb_agg(jsonb_build_object(
                      'inscription_id', a.inscription_id, 'nature', a.nature, 'montant', a.montant,
                      'date', o.date_operation, 'type', o.type, 'mode', o.mode_paiement,
                      'origine', case
                        when public.unaccent_simple(concat_ws(' ', o.libelle_origine, o.libelle, p.libelle_origine, p.libelle))
                             like '%amitie sainte anne%' then 'Amitié Sainte-Anne'
                        when c.nom = 'Don d''Association' then 'Association'
                        else 'Famille' end)
                      order by o.date_operation), '[]'::jsonb)
                     from affectations_scolarite a
                     join operations o on o.id = a.operation_id
                     left join operations p on p.id = o.parent_id
                     left join categories c on c.id = o.categorie_id
                    where a.inscription_id in (select id from scolarite_inscriptions where famille_id = f)),
    'activites', (select coalesce(jsonb_agg(jsonb_build_object(
                     'activite_id', ac.id, 'titre', ac.titre, 'date_activite', ac.date_activite,
                     'date_limite', ac.date_limite, 'annee_scolaire', ac.annee_scolaire,
                     'eleve_id', e.id, 'initiale', e.initiale, 'montant', pa.montant, 'paye_le', pa.paye_le)
                     order by ac.date_activite nulls last, e.initiale), '[]'::jsonb)
                    from activites_participations pa
                    join activites ac on ac.id = pa.activite_id
                    join eleves e on e.id = pa.eleve_id
                   where e.famille_id = f),
    'bareme', (select coalesce(jsonb_agg(jsonb_build_object('annee_scolaire', b.annee_scolaire,
                  'nb_enfants', b.nb_enfants, 'montant_mensuel', b.montant_mensuel)), '[]'::jsonb)
                 from scolarite_bareme b)
  )
$$;
revoke execute on function public.contenu_espace_famille(uuid) from public, anon, authenticated;

create or replace function public.espace_famille()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f uuid := public.ma_famille();
begin
  if f is null then raise exception 'Espace réservé aux comptes famille.'; end if;
  return public.contenu_espace_famille(f);
end $$;

create or replace function public.espace_famille_apercu(p_famille uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_bureau() then raise exception 'Aperçu réservé au bureau.'; end if;
  return public.contenu_espace_famille(p_famille);
end $$;
revoke execute on function public.espace_famille_apercu(uuid) from public, anon;
grant execute on function public.espace_famille_apercu(uuid) to authenticated;

create or replace function public.association_espace()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.ma_famille() is null and not public.est_bureau() then null else (
    select jsonb_build_object('adresse_rue', adresse_rue, 'adresse_cp_ville', adresse_cp_ville,
                              'tresorier_nom', tresorier_nom, 'courriel_contact', courriel_contact)
      from modele_recu where id = 1) end
$$;
