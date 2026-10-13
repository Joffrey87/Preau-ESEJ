-- Événement : Carnet d'adresses restreint (fournisseurs et contacts événements) et facturation fournisseurs.
-- Les fournisseurs sont des lignes de `contacts` (catégorie « vendeur » ou « evenement »). Le profil Événement ne lit
-- jamais la table `contacts` : il passe par la vue `contacts_evenement` (sans IBAN ni données chiffrées) et par
-- `enregistrer_contact_evenement`. Le RIB reste dans le Carnet du bureau (champ iban, coffre « carnet »).

-- ─── Carnet restreint ───────────────────────────────────────────────────────────────────────────────────────────
-- Un contact n'est visible que si TOUTES ses catégories sont « vendeur » / « evenement » (un fournisseur également
-- donateur ou parent reste invisible), et s'il n'est pas supprimé.
create or replace view public.contacts_evenement with (security_barrier = true) as
  select c.id, c.est_personne_morale, c.nom, c.prenom, c.raison_sociale, c.categories, c.courriel, c.telephone,
         c.adresse, c.cp_ville, c.notes, (coalesce(c.iban, '') <> '') as rib_renseigne
    from public.contacts c
   where public.voit_evenements()
     and c.supprime_le is null
     and cardinality(c.categories) > 0
     and c.categories <@ array['vendeur','evenement']::text[];
revoke all on public.contacts_evenement from public, anon;
grant select on public.contacts_evenement to authenticated;

create or replace function public.enregistrer_contact_evenement(
  p_id uuid, p_categorie text, p_personne_morale boolean, p_nom text, p_prenom text, p_raison_sociale text,
  p_courriel text, p_telephone text, p_adresse text, p_cp_ville text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := p_id;
begin
  if not (public.est_evenement() or public.est_tresorier()) then raise exception 'Accès refusé.'; end if;
  if p_categorie not in ('vendeur','evenement') then raise exception 'Catégorie non autorisée.'; end if;
  if coalesce(trim(p_nom),'') = '' and coalesce(trim(p_raison_sociale),'') = '' then
    raise exception 'Indiquez un nom ou une raison sociale.'; end if;
  if v is null then
    insert into contacts (est_personne_morale, nom, prenom, raison_sociale, categories, courriel, telephone, adresse, cp_ville, notes)
    values (coalesce(p_personne_morale,false), coalesce(nullif(trim(p_nom),''), trim(p_raison_sociale)), nullif(trim(p_prenom),''),
            nullif(trim(p_raison_sociale),''), array[p_categorie], nullif(trim(p_courriel),''), nullif(trim(p_telephone),''),
            nullif(trim(p_adresse),''), nullif(trim(p_cp_ville),''), nullif(trim(p_notes),''))
    returning id into v;
  else
    -- Seuls les contacts visibles du carnet restreint sont modifiables ici.
    if not exists (select 1 from contacts where id = v and supprime_le is null and categories <@ array['vendeur','evenement']::text[]) then
      raise exception 'Contact introuvable.'; end if;
    update contacts set est_personne_morale = coalesce(p_personne_morale,false),
           nom = coalesce(nullif(trim(p_nom),''), trim(p_raison_sociale)), prenom = nullif(trim(p_prenom),''),
           raison_sociale = nullif(trim(p_raison_sociale),''), categories = array[p_categorie],
           courriel = nullif(trim(p_courriel),''), telephone = nullif(trim(p_telephone),''),
           adresse = nullif(trim(p_adresse),''), cp_ville = nullif(trim(p_cp_ville),''), notes = nullif(trim(p_notes),''),
           updated_at = now()
     where id = v;
  end if;
  return v;
end;
$$;
revoke all on function public.enregistrer_contact_evenement(uuid,text,boolean,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.enregistrer_contact_evenement(uuid,text,boolean,text,text,text,text,text,text,text,text) to authenticated;

-- ─── Factures fournisseurs ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.factures_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null references public.contacts(id) on delete restrict,
  montant numeric(10,2) not null check (montant > 0),
  date date not null,
  numero text,
  evenement_id uuid references public.evenements_caisse(id) on delete set null,
  fichier text,                                   -- chemin dans le bucket privé « factures-fournisseurs »
  statut text not null default 'pas_importee' check (statut in ('pas_importee','recue_a_payer','payee')),
  operation_id uuid references public.operations(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists factures_fournisseurs_fournisseur on public.factures_fournisseurs (fournisseur_id);
alter table public.factures_fournisseurs enable row level security;
grant select, insert, update, delete on public.factures_fournisseurs to authenticated;
create policy factures_fournisseurs_lecture on public.factures_fournisseurs for select to authenticated
  using (public.voit_evenements());
create policy factures_fournisseurs_ecriture on public.factures_fournisseurs for all to authenticated
  using (public.est_evenement() or public.est_tresorier())
  with check (public.est_evenement() or public.est_tresorier());

-- Statut : « Payée » dès qu'une opération bancaire est liée (et seulement le Trésorier lie une opération) ;
-- le lien retiré, la facture revient à « Reçue, à payer ». Un fichier joint fait passer « Pas importée » → « Reçue ».
create or replace function public.factures_fournisseurs_statut() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.operation_id is distinct from (case when tg_op = 'UPDATE' then old.operation_id end) then
    if not public.est_tresorier() then raise exception 'Seul le Trésorier relie une opération bancaire.'; end if;
  end if;
  if new.operation_id is not null then new.statut := 'payee';
  elsif tg_op = 'UPDATE' and old.operation_id is not null then new.statut := 'recue_a_payer';
  elsif new.statut = 'payee' then
    raise exception 'Le statut « Payée » vient du rapprochement avec une opération bancaire.';
  elsif new.fichier is not null and new.statut = 'pas_importee' then new.statut := 'recue_a_payer';
  end if;
  return new;
end;
$$;
drop trigger if exists factures_fournisseurs_statut on public.factures_fournisseurs;
create trigger factures_fournisseurs_statut before insert or update on public.factures_fournisseurs
  for each row execute function public.factures_fournisseurs_statut();

-- Trésorier : opérations de débit candidates pour une facture (même montant, ±45 jours).
create or replace function public.operations_candidates_facture(p_facture uuid)
returns table (id uuid, date_operation date, libelle text, montant numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.date_operation, o.libelle, o.montant
    from factures_fournisseurs f join operations o
      on abs(o.montant) = f.montant and o.montant < 0 and abs(o.date_operation - f.date) <= 45
   where f.id = p_facture and public.est_tresorier()
     and not exists (select 1 from factures_fournisseurs x where x.operation_id = o.id and x.id <> f.id)
   order by abs(o.date_operation - f.date);
$$;
revoke all on function public.operations_candidates_facture(uuid) from public, anon;
grant execute on function public.operations_candidates_facture(uuid) to authenticated;

-- ─── Fichiers ───────────────────────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('factures-fournisseurs', 'factures-fournisseurs', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
drop policy if exists factures_fournisseurs_fichiers_lecture on storage.objects;
create policy factures_fournisseurs_fichiers_lecture on storage.objects for select to authenticated
  using (bucket_id = 'factures-fournisseurs' and public.voit_evenements());
drop policy if exists factures_fournisseurs_fichiers_ecriture on storage.objects;
create policy factures_fournisseurs_fichiers_ecriture on storage.objects for insert to authenticated
  with check (bucket_id = 'factures-fournisseurs' and (public.est_evenement() or public.est_tresorier()));
drop policy if exists factures_fournisseurs_fichiers_suppression on storage.objects;
create policy factures_fournisseurs_fichiers_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'factures-fournisseurs' and (public.est_evenement() or public.est_tresorier()));
