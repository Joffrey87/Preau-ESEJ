-- Facturation fournisseurs : domaine (École / Événement), moyen et date de paiement, « Payée » à la main ou par
-- mouvement de caisse, fournisseur suggéré « à vérifier », IBAN / BIC du fournisseur (masqué hors Trésorier). Additif.
-- Fournisseurs : contacts du Carnet, catégorie « vendeur » (affichée « Fournisseur »), inchangée en base.

alter table public.contacts add column if not exists bic text;

alter table public.factures_fournisseurs
  add column if not exists domaine text not null default 'evenement' check (domaine in ('ecole', 'evenement')),
  add column if not exists mode_paiement text check (mode_paiement in ('virement', 'cheque', 'especes', 'carte', 'prelevement')),
  add column if not exists paye_le date,
  add column if not exists paye_par text,
  add column if not exists caisse_mouvement_id uuid references public.caisse_mouvements(id) on delete set null,
  add column if not exists fournisseur_a_verifier boolean not null default false,
  add column if not exists fournisseur_lu text;

-- Gestion par domaine : Trésorier (et profils déjà autorisés : Président, Administrateur) partout ; Événement sur
-- l'Événement ; École pour les bénévoles « Responsable des Ventes diverses côté École » (acces_domaines_ventes_personnes).
create or replace function public.facture_domaine_gerable(p_domaine text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_tresorier()
      or (public.est_evenement() and (p_domaine = 'evenement'
          or (p_domaine = 'ecole' and public.ma_vue_webmestre() is null and exists (
                select 1 from acces_domaines_ventes_personnes a where a.user_id = auth.uid() and 'ecole' = any(a.domaines)))));
$$;
revoke execute on function public.facture_domaine_gerable(text) from public, anon;
grant execute on function public.facture_domaine_gerable(text) to authenticated;

-- Lecture : Président / Directrice gardent la lecture de tout (comme avant) ; Événement selon ses domaines.
drop policy if exists factures_fournisseurs_lecture on public.factures_fournisseurs;
create policy factures_fournisseurs_lecture on public.factures_fournisseurs for select to authenticated
  using (public.voit_evenements() and (public.mon_role() in ('tresorier', 'president', 'directrice', 'administrateur')
                                       or public.facture_domaine_gerable(domaine)));
drop policy if exists factures_fournisseurs_ecriture on public.factures_fournisseurs;
create policy factures_fournisseurs_ecriture on public.factures_fournisseurs for all to authenticated
  using (public.facture_domaine_gerable(domaine)) with check (public.facture_domaine_gerable(domaine));

-- Statut : opération bancaire ou mouvement de caisse liés → Payée ; Payée à la main avec un moyen de paiement ;
-- retour « à payer » possible. Seul le Trésorier relie une opération bancaire (inchangé).
create or replace function public.factures_fournisseurs_statut() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_qui text;
begin
  if new.operation_id is distinct from (case when tg_op = 'UPDATE' then old.operation_id end) then
    if not public.est_tresorier() then raise exception 'Seul le Trésorier relie une opération bancaire.'; end if;
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

-- Trésorier : débits candidats pour une facture (même montant, ±45 jours ; montants positifs, type « depense »).
create or replace function public.operations_candidates_facture(p_facture uuid)
returns table (id uuid, date_operation date, libelle text, montant numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.date_operation, o.libelle, o.montant
    from factures_fournisseurs f join operations o
      on abs(o.montant) = f.montant and (o.type = 'depense' or o.montant < 0) and abs(o.date_operation - f.date) <= 45
   where f.id = p_facture and public.est_tresorier()
     and not exists (select 1 from factures_fournisseurs x where x.operation_id = o.id and x.id <> f.id)
   order by abs(o.date_operation - f.date);
$$;

-- Carnet restreint : IBAN masqué (4 derniers caractères) et BIC, ajoutés en fin de vue.
create or replace view public.contacts_evenement with (security_barrier = true) as
  select c.id, c.est_personne_morale, c.nom, c.prenom, c.raison_sociale, c.categories, c.courriel, c.telephone,
         c.adresse, c.cp_ville, c.notes, (coalesce(c.iban, '') <> '') as rib_renseigne,
         case when coalesce(c.iban, '') = '' then null
              else upper(left(regexp_replace(c.iban, '\s', '', 'g'), 4)) || ' •••• ' || right(regexp_replace(c.iban, '\s', '', 'g'), 4) end as iban_masque,
         c.bic
    from public.contacts c
   where public.voit_evenements()
     and c.supprime_le is null
     and cardinality(c.categories) > 0
     and c.categories <@ array['vendeur','evenement']::text[];

-- IBAN complet : Trésorier seulement.
create or replace function public.fournisseur_iban(p_contact uuid) returns text
language sql stable security definer set search_path = public as $$
  select iban from contacts where id = p_contact and public.est_tresorier_strict();
$$;
revoke execute on function public.fournisseur_iban(uuid) from public, anon;
grant execute on function public.fournisseur_iban(uuid) to authenticated;

-- Saisie / remplacement de l'IBAN d'un fournisseur : Trésorier, ou Événement (écriture seule) sur le carnet restreint.
create or replace function public.fournisseur_iban_definir(p_contact uuid, p_iban text, p_bic text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
begin
  if not (public.est_evenement() or public.est_tresorier()) then raise exception 'Accès refusé.'; end if;
  if not public.est_tresorier() and not exists (
       select 1 from contacts where id = p_contact and supprime_le is null
          and cardinality(categories) > 0 and categories <@ array['vendeur','evenement']::text[]) then
    raise exception 'Fournisseur introuvable.'; end if;
  if v <> '' and v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then raise exception 'IBAN invalide.'; end if;
  update contacts set iban = nullif(trim(regexp_replace(v, '(.{4})', '\1 ', 'g')), ''),
                      bic = nullif(upper(trim(coalesce(p_bic, ''))), ''), updated_at = now()
   where id = p_contact;
end $$;
revoke execute on function public.fournisseur_iban_definir(uuid, text, text) from public, anon;
grant execute on function public.fournisseur_iban_definir(uuid, text, text) to authenticated;
