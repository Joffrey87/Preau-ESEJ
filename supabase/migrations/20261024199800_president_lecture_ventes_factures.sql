-- 1. Facturation fournisseurs : plus d'écriture pour le Président (lecture conservée). Administrateur inchangé.
-- 2. Ventes diverses : Président en lecture seule, côtés École et Événement. Additif.

create or replace function public.facture_domaine_gerable(p_domaine text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('tresorier', 'administrateur')
      or (public.est_evenement() and (p_domaine = 'evenement'
          or (p_domaine = 'ecole' and public.ma_vue_webmestre() is null and exists (
                select 1 from acces_domaines_ventes_personnes a where a.user_id = auth.uid() and 'ecole' = any(a.domaines)))));
$$;

-- Lien d'une opération bancaire / IBAN : Trésorier et Administrateur (plus le Président).
create or replace function public.est_tresorier_factures() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('tresorier', 'administrateur');
$$;
revoke execute on function public.est_tresorier_factures() from public, anon;
grant execute on function public.est_tresorier_factures() to authenticated;

create or replace function public.factures_fournisseurs_statut() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_qui text;
begin
  if new.operation_id is distinct from (case when tg_op = 'UPDATE' then old.operation_id end) then
    if not public.est_tresorier_factures() then raise exception 'Seul le Trésorier relie une opération bancaire.'; end if;
  end if;
  v_qui := coalesce((select libelle from evenement_membres where user_id = auth.uid() limit 1),
                    (select case role when 'tresorier' then 'Trésorier' else role end from profils where id = auth.uid()),
                    'Préau');
  if new.operation_id is not null then
    new.statut := 'payee';
    if tg_op = 'INSERT' or old.operation_id is distinct from new.operation_id then
      new.paye_le := coalesce((select date_operation from operations where id = new.operation_id), current_date);
      new.paye_par := 'Rapprochement bancaire';
    end if;
  elsif new.caisse_mouvement_id is not null then
    new.statut := 'payee';
    new.mode_paiement := 'especes';
    if tg_op = 'INSERT' or old.caisse_mouvement_id is distinct from new.caisse_mouvement_id then
      new.paye_le := coalesce((select date from caisse_mouvements where id = new.caisse_mouvement_id), current_date);
      new.paye_par := v_qui;
    end if;
  elsif new.statut = 'payee' then
    if new.mode_paiement is null then raise exception 'Indiquez le moyen de paiement pour marquer la facture payée.'; end if;
    if tg_op = 'INSERT' or old.statut <> 'payee' or old.operation_id is not null or old.caisse_mouvement_id is not null then
      new.paye_le := coalesce(new.paye_le, current_date);
      new.paye_par := v_qui;
    end if;
  else
    if tg_op = 'UPDATE' and old.statut = 'payee' then new.paye_le := null; new.paye_par := null; end if;
    if new.statut = 'pas_importee' and (new.fichier is not null or new.mode_paiement in ('cheque', 'especes')) then
      new.statut := 'recue_a_payer';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fournisseur_iban_definir(p_contact uuid, p_iban text, p_bic text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
begin
  if not (public.est_evenement() or public.est_tresorier_factures()) then raise exception 'Accès refusé.'; end if;
  if not public.est_tresorier_factures() and not exists (
       select 1 from contacts where id = p_contact and supprime_le is null
          and cardinality(categories) > 0 and categories <@ array['vendeur','evenement']::text[]) then
    raise exception 'Fournisseur introuvable.'; end if;
  if v <> '' and v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then raise exception 'IBAN invalide.'; end if;
  update contacts set iban = nullif(trim(regexp_replace(v, '(.{4})', '\1 ', 'g')), ''),
                      bic = nullif(upper(trim(coalesce(p_bic, ''))), ''), updated_at = now()
   where id = p_contact;
end $$;

-- Fichiers des factures : écriture sans le Président.
drop policy if exists factures_fournisseurs_fichiers_ecriture on storage.objects;
create policy factures_fournisseurs_fichiers_ecriture on storage.objects for insert to authenticated
  with check (bucket_id = 'factures-fournisseurs' and (public.est_evenement() or public.est_tresorier_factures()));
drop policy if exists factures_fournisseurs_fichiers_suppression on storage.objects;
create policy factures_fournisseurs_fichiers_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'factures-fournisseurs' and (public.est_evenement() or public.est_tresorier_factures()));

-- ─── Ventes diverses : Président en lecture ───────────────────────────────────────────────────────────────────
insert into public.acces_domaines_ventes (profil, domaines) values ('president', array['ecole','evenement'])
on conflict (profil) do update set domaines = excluded.domaines;
update public.acces_profils set niveau = 'lecture' where profil = 'president' and page = '/ventes-diverses';

-- Lecture : domaines du profil. Écriture (domaine_ventes_ok, utilisée par les politiques d'écriture, les caisses et
-- les fonctions qui modifient) : jamais pour le Président.
create or replace function public.domaine_ventes_lecture_ok(p_domaine text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_domaine = any(public.mes_domaines_ventes());
$$;
revoke execute on function public.domaine_ventes_lecture_ok(text) from public, anon;
grant execute on function public.domaine_ventes_lecture_ok(text) to authenticated;

create or replace function public.domaine_ventes_ok(p_domaine text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_domaine = any(public.mes_domaines_ventes()) and public.mon_role() <> 'president';
$$;

drop policy if exists ventes_dues_lecture on public.ventes_dues;
create policy ventes_dues_lecture on public.ventes_dues for select to authenticated using (public.domaine_ventes_lecture_ok(domaine));
drop policy if exists ventes_paiements_lecture on public.ventes_paiements;
create policy ventes_paiements_lecture on public.ventes_paiements for select to authenticated
  using (exists (select 1 from public.ventes_dues d where d.id = ventes_paiements.vente_due_id and public.domaine_ventes_lecture_ok(d.domaine)));
drop policy if exists ventes_sous_cat_lecture on public.ventes_sous_categories;
create policy ventes_sous_cat_lecture on public.ventes_sous_categories for select to authenticated using (public.domaine_ventes_lecture_ok(domaine));
drop policy if exists ventes_ventilations_lecture on public.ventes_ventilations;
create policy ventes_ventilations_lecture on public.ventes_ventilations for select to authenticated
  using (exists (select 1 from public.ventes_sous_categories s where s.id = ventes_ventilations.sous_categorie_id and public.domaine_ventes_lecture_ok(s.domaine)));

CREATE OR REPLACE FUNCTION public.liste_payeurs_ventes(p_domaine text)
 RETURNS TABLE(kind text, id uuid, libelle text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
    select 'famille'::text as kind, f.id, f.nom as libelle
      from familles f
     where public.domaine_ventes_lecture_ok(p_domaine)
    union all
    select 'contact'::text as kind, c.id,
           case when c.est_personne_morale then coalesce(c.raison_sociale, c.nom)
                else trim(coalesce(c.prenom, '') || ' ' || c.nom) end as libelle
      from contacts c
     where public.domaine_ventes_lecture_ok(p_domaine)
       and c.supprime_le is null
       and (
         public.mon_role() in ('tresorier', 'president')
         or (public.mon_role() = 'directrice' and c.categories && array['parent','enseignant','bureau','autre','evenement']::text[])
         or (public.est_evenement() and c.categories <@ array['vendeur','evenement']::text[])
       )
  ) x
  order by libelle;
$function$

;
CREATE OR REPLACE FUNCTION public.ventes_detail_payeur(p_famille uuid, p_contact uuid)
 RETURNS TABLE(id uuid, exercice_id uuid, date_vente date, domaine text, objet text, quantite integer, montant numeric, paye numeric, mode text, notes text, saisi_par text, operations jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   where public.domaine_ventes_lecture_ok(d.domaine)
     and ((p_famille is not null and d.famille_id = p_famille) or (p_contact is not null and d.contact_id = p_contact))
   order by d.created_at desc;
$function$
;

