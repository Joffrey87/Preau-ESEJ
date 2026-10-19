-- Import du RIB d'un fournisseur (lu automatiquement, vérifié par l'utilisateur). Additif.
-- Anti-fraude : un IBAN différent de l'IBAN actif reste « à confirmer » jusqu'à validation du Trésorier.

-- Clé de contrôle IBAN (ISO 13616, modulo 97).
create or replace function public.iban_valide(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare v text := upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')); r text; ch text; reste int := 0; i int;
begin
  if v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then return false; end if;
  r := substr(v, 5) || substr(v, 1, 4);
  for i in 1..length(r) loop
    ch := substr(r, i, 1);
    if ch ~ '[A-Z]' then ch := (ascii(ch) - 55)::text; end if;
    reste := ((reste::text || ch)::bigint % 97)::int;
  end loop;
  return reste = 1;
end $$;

-- Qui peut importer un RIB : Trésorier / Administrateur, Événementiel, Directrice.
create or replace function public.peut_importer_rib() returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_evenement() or public.est_tresorier_factures() or public.mon_role() = 'directrice';
$$;
revoke execute on function public.peut_importer_rib() from public, anon;
grant execute on function public.peut_importer_rib() to authenticated;

create table if not exists public.ribs_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  iban text not null,
  bic text,
  titulaire text,
  fichier text,                 -- chemin dans le bucket privé « ribs-fournisseurs »
  statut text not null default 'a_confirmer' check (statut in ('actif', 'a_confirmer', 'remplace', 'rejete')),
  titulaire_different boolean not null default false,
  cree_par uuid default auth.uid(),
  cree_le timestamptz not null default now(),
  traite_par uuid,
  traite_le timestamptz
);
create index if not exists ribs_fournisseurs_contact on public.ribs_fournisseurs (contact_id, statut);
alter table public.ribs_fournisseurs enable row level security;
-- Lecture directe : Trésorier seulement (IBAN complet). Écriture : uniquement par les fonctions ci-dessous.
drop policy if exists ribs_fournisseurs_lecture on public.ribs_fournisseurs;
create policy ribs_fournisseurs_lecture on public.ribs_fournisseurs for select to authenticated using (public.est_tresorier_strict());
revoke insert, update, delete on public.ribs_fournisseurs from anon, authenticated;

-- Format d'affichage par groupes de 4.
create or replace function public.iban_formate(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(trim(regexp_replace(upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')), '(.{4})', '\1 ', 'g')), '');
$$;

-- Minuscules sans accents (comparaison titulaire / fournisseur).
create or replace function public.texte_simple(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(coalesce(p, ''), 'ÀÂÄÁÃÇÉÈÊËÎÏÍÌÔÖÓÒÕÙÛÜÚŸàâäáãçéèêëîïíìôöóòõùûüúÿ', 'AAAAACEEEEIIIIOOOOOUUUUYaaaaaceeeeiiiiooooouuuuy'));
$$;

/** Enregistre un RIB : actif s'il n'y en avait pas (ou identique), sinon « à confirmer ». Renvoie 'actif' | 'a_confirmer' | 'identique'. */
create or replace function public.fournisseur_rib_importer(p_contact uuid, p_iban text, p_bic text, p_titulaire text, p_fichier text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v text := upper(regexp_replace(coalesce(p_iban, ''), '[\s-]', '', 'g'));
  actuel text; nom_c text; diff boolean := false; t text := nullif(trim(coalesce(p_titulaire, '')), '');
  b text := nullif(upper(regexp_replace(coalesce(p_bic, ''), '\s', '', 'g')), '');
begin
  if not public.peut_importer_rib() then raise exception 'Accès refusé.'; end if;
  select upper(regexp_replace(coalesce(iban, ''), '\s', '', 'g')),
         lower(coalesce(raison_sociale, '') || ' ' || coalesce(prenom, '') || ' ' || coalesce(nom, ''))
    into actuel, nom_c
    from contacts where id = p_contact and supprime_le is null
     and (public.est_tresorier_factures()
          or (cardinality(categories) > 0 and categories <@ array['vendeur','evenement']::text[]));
  if not found then raise exception 'Fournisseur introuvable.'; end if;
  if not public.iban_valide(v) then raise exception 'IBAN invalide (clé de contrôle incorrecte).'; end if;
  if b is not null and b !~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$' then raise exception 'BIC invalide.'; end if;
  if p_fichier is not null and p_fichier !~ ('^' || p_contact::text || '/') then raise exception 'Fichier invalide.'; end if;
  -- Titulaire : au moins un mot significatif (4 lettres et plus) en commun avec le nom du fournisseur.
  if t is not null then
    diff := not exists (
      select 1 from regexp_split_to_table(texte_simple(t), '[^a-z0-9]+') w
       where length(w) >= 4 and position(w in texte_simple(nom_c)) > 0);
  end if;
  if actuel = v then
    update contacts set bic = coalesce(b, bic), updated_at = now() where id = p_contact;
    insert into ribs_fournisseurs (contact_id, iban, bic, titulaire, fichier, statut, titulaire_different, traite_le)
      values (p_contact, iban_formate(v), b, t, p_fichier, 'actif', diff, now());
    return 'identique';
  elsif coalesce(actuel, '') = '' or public.est_tresorier_strict() then
    update ribs_fournisseurs set statut = 'remplace', traite_par = auth.uid(), traite_le = now()
     where contact_id = p_contact and statut = 'actif';
    update contacts set iban = iban_formate(v), bic = b, updated_at = now() where id = p_contact;
    insert into ribs_fournisseurs (contact_id, iban, bic, titulaire, fichier, statut, titulaire_different, traite_par, traite_le)
      values (p_contact, iban_formate(v), b, t, p_fichier, 'actif', diff, auth.uid(), now());
    return 'actif';
  else
    insert into ribs_fournisseurs (contact_id, iban, bic, titulaire, fichier, statut, titulaire_different)
      values (p_contact, iban_formate(v), b, t, p_fichier, 'a_confirmer', diff);
    return 'a_confirmer';
  end if;
end $$;
revoke execute on function public.fournisseur_rib_importer(uuid, text, text, text, text) from public, anon;
grant execute on function public.fournisseur_rib_importer(uuid, text, text, text, text) to authenticated;

-- Validation (ou rejet) par le Trésorier d'un IBAN « à confirmer ».
create or replace function public.fournisseur_rib_traiter(p_rib uuid, p_accepter boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r ribs_fournisseurs;
begin
  if not public.est_tresorier_strict() then raise exception 'Réservé au Trésorier.'; end if;
  select * into r from ribs_fournisseurs where id = p_rib and statut = 'a_confirmer' for update;
  if not found then raise exception 'RIB introuvable ou déjà traité.'; end if;
  if p_accepter then
    update ribs_fournisseurs set statut = 'remplace', traite_par = auth.uid(), traite_le = now()
     where contact_id = r.contact_id and statut = 'actif';
    update contacts set iban = r.iban, bic = r.bic, updated_at = now() where id = r.contact_id;
  end if;
  update ribs_fournisseurs set statut = case when p_accepter then 'actif' else 'rejete' end,
         traite_par = auth.uid(), traite_le = now() where id = p_rib;
end $$;
revoke execute on function public.fournisseur_rib_traiter(uuid, boolean) from public, anon;
grant execute on function public.fournisseur_rib_traiter(uuid, boolean) to authenticated;

-- Liste des RIB à confirmer (Trésorier) avec l'IBAN actif pour comparaison.
create or replace function public.ribs_a_confirmer()
returns table (id uuid, contact_id uuid, fournisseur text, telephone text, iban_actuel text, iban text, bic text,
               titulaire text, titulaire_different boolean, fichier text, cree_le timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.contact_id, coalesce(nullif(c.raison_sociale, ''), trim(coalesce(c.prenom, '') || ' ' || c.nom)), c.telephone,
         c.iban, r.iban, r.bic, r.titulaire, r.titulaire_different, r.fichier, r.cree_le
    from ribs_fournisseurs r join contacts c on c.id = r.contact_id
   where r.statut = 'a_confirmer' and public.est_tresorier_strict()
   order by r.cree_le;
$$;
revoke execute on function public.ribs_a_confirmer() from public, anon;
grant execute on function public.ribs_a_confirmer() to authenticated;

-- Indicateur « nouvel IBAN à confirmer » pour tous ceux qui voient le carnet restreint (sans IBAN).
create or replace function public.fournisseurs_rib_en_attente() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct contact_id from ribs_fournisseurs where statut = 'a_confirmer' and public.voit_evenements();
$$;
revoke execute on function public.fournisseurs_rib_en_attente() from public, anon;
grant execute on function public.fournisseurs_rib_en_attente() to authenticated;

-- La saisie manuelle passe par la même règle anti-fraude (plus de remplacement direct hors Trésorier).
create or replace function public.fournisseur_iban_definir(p_contact uuid, p_iban text, p_bic text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(regexp_replace(p_iban, '\s', '', 'g'), '') = '' then
    if not public.est_tresorier_strict() then raise exception 'Seul le Trésorier peut effacer un IBAN.'; end if;
    update contacts set iban = null, bic = null, updated_at = now() where id = p_contact;
    return;
  end if;
  perform public.fournisseur_rib_importer(p_contact, p_iban, p_bic, null, null);
end $$;

-- Bucket privé des RIB : dépôt par ceux qui importent, lecture Trésorier seulement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ribs-fournisseurs', 'ribs-fournisseurs', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do nothing;
drop policy if exists ribs_fournisseurs_depot on storage.objects;
create policy ribs_fournisseurs_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'ribs-fournisseurs' and public.peut_importer_rib());
drop policy if exists ribs_fournisseurs_lecture_fichier on storage.objects;
create policy ribs_fournisseurs_lecture_fichier on storage.objects for select to authenticated
  using (bucket_id = 'ribs-fournisseurs' and public.est_tresorier_strict());
