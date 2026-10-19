-- Ventes diverses : panneau de détail par famille / personne, Directrice sur les deux côtés, responsables École
-- désignés par le Webmestre, onglet « Achats divers » de l'Espace famille, coordonnées de paiement. Additif.

-- 1. Quantité d'une vente (facultative).
alter table public.ventes_dues add column if not exists quantite integer check (quantite is null or quantite > 0);

-- 2. Directrice : côtés École et Événement.
update public.acces_domaines_ventes set domaines = array['ecole','evenement'] where profil = 'directrice';

-- 3. Coordonnées de paiement affichées aux familles (renseignées par le Trésorier, vides au départ).
create table if not exists public.coordonnees_paiement (
  id smallint primary key default 1 check (id = 1),
  ordre_cheque text,
  titulaire text,
  iban text,
  bic text,
  updated_at timestamptz not null default now()
);
insert into public.coordonnees_paiement (id) values (1) on conflict (id) do nothing;
alter table public.coordonnees_paiement enable row level security;
create policy coordonnees_paiement_lecture on public.coordonnees_paiement for select to authenticated
  using (public.ma_famille() is not null or public.est_bureau() or public.voit_ventes_diverses());
create policy coordonnees_paiement_ecriture on public.coordonnees_paiement for update to authenticated
  using (public.est_tresorier_strict()) with check (public.est_tresorier_strict());

-- 4. Détail des ventes d'une famille ou d'une personne (panneau latéral), limité aux côtés du profil.
create or replace function public.ventes_detail_payeur(p_famille uuid, p_contact uuid)
returns table (
  id uuid, exercice_id uuid, date_vente date, domaine text, objet text, quantite integer, montant numeric,
  paye numeric, mode text, notes text, saisi_par text, operations jsonb
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
                     from ventes_paiements p join operations o on o.id = p.operation_id where p.vente_due_id = d.id), '[]'::jsonb)
    from ventes_dues d join ventes_sous_categories s on s.id = d.sous_categorie_id
   where public.domaine_ventes_ok(d.domaine)
     and ((p_famille is not null and d.famille_id = p_famille) or (p_contact is not null and d.contact_id = p_contact))
   order by d.created_at desc;
$$;
revoke execute on function public.ventes_detail_payeur(uuid, uuid) from public, anon;
grant execute on function public.ventes_detail_payeur(uuid, uuid) to authenticated;

-- 5. Espace famille : achats divers de SA famille (aperçu : bureau). Sans libellé bancaire, note ni auteur.
create or replace function public.achats_divers_famille(p_famille uuid default null)
returns table (id uuid, exercice_id uuid, exercice text, date_vente date, domaine text, objet text,
               quantite integer, montant numeric, paye numeric, mode text)
language plpgsql stable security definer set search_path = public as $$
declare f uuid := public.ma_famille();
begin
  if p_famille is not null and (f is null or f <> p_famille) then
    if not public.est_bureau() then raise exception 'Accès refusé.'; end if;
    f := p_famille;
  end if;
  if f is null then raise exception 'Espace réservé aux comptes famille.'; end if;
  return query
    select d.id, d.exercice_id, e.libelle, d.created_at::date, d.domaine, s.nom, d.quantite, d.montant_attendu,
           coalesce((select sum(p.montant) from ventes_paiements p where p.vente_due_id = d.id), 0), d.mode_attendu
      from ventes_dues d
      join ventes_sous_categories s on s.id = d.sous_categorie_id
      join exercices e on e.id = d.exercice_id
     where d.famille_id = f
     order by d.created_at desc;
end $$;
revoke execute on function public.achats_divers_famille(uuid) from public, anon;
grant execute on function public.achats_divers_famille(uuid) to authenticated;

-- 6. Webmestre : « Responsable des Ventes diverses côté École » par bénévole Événement.
create or replace function public.webmestre_responsables_ventes_ecole()
returns table (user_id uuid, libelle text, prenom text, nom text, responsable boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre.'; end if;
  return query
    select m.user_id, m.libelle, m.prenom, m.nom,
           coalesce('ecole' = any(a.domaines), false)
      from evenement_membres m left join acces_domaines_ventes_personnes a on a.user_id = m.user_id
     where m.actif and m.user_id is not null
     order by m.ordre nulls last, m.libelle;
end $$;
revoke execute on function public.webmestre_responsables_ventes_ecole() from public, anon;
grant execute on function public.webmestre_responsables_ventes_ecole() to authenticated;

create or replace function public.webmestre_definir_responsable_ventes_ecole(p_user uuid, p_responsable boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre.'; end if;
  if not exists (select 1 from evenement_membres where user_id = p_user and actif) then
    raise exception 'Bénévole Événement introuvable.'; end if;
  if p_responsable then
    insert into acces_domaines_ventes_personnes (user_id, domaines, note)
    values (p_user, array['ecole'], 'Responsable des Ventes diverses côté École')
    on conflict (user_id) do update
      set domaines = (select array(select distinct x from unnest(acces_domaines_ventes_personnes.domaines || array['ecole']) x));
  else
    update acces_domaines_ventes_personnes set domaines = array_remove(domaines, 'ecole') where user_id = p_user;
  end if;
  insert into acces_historique (auteur, action, detail)
  values (coalesce(public.mon_role_reel(), 'webmestre'), 'ventes',
          case when p_responsable then 'Responsable des Ventes diverses côté École : ajout' else 'Responsable des Ventes diverses côté École : retrait' end
          || ' (' || (select libelle from evenement_membres where user_id = p_user limit 1) || ')');
end $$;
revoke execute on function public.webmestre_definir_responsable_ventes_ecole(uuid, boolean) from public, anon;
grant execute on function public.webmestre_definir_responsable_ventes_ecole(uuid, boolean) to authenticated;
