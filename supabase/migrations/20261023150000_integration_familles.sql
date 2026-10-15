-- 23/10/2026 — Intégration des familles 2026-2027 (fichier familles + liste d'élèves).
--  - eleves_ine : INE de l'élève, lisible et modifiable par la Directrice seulement (jamais sur bulletins / PDF) ;
--  - import_conflits : anciennes valeurs remplacées par un import (instantané avant écriture), lisibles par la Directrice
--    et le bureau « sensible » ;
--  - contacts.famille_parent : la fiche du Carnet d'adresses est celle du parent 1 (Monsieur) ou 2 (Madame) ;
--  - Carnet : les fiches « parent » sont visibles de tous les profils du bureau ;
--  - trombinoscope() : le titulaire voit les coordonnées des parents (sans adresse ni INE) ; la Directrice voit tout ;
--  - famille_naissance_enfant : la famille corrige la date de naissance de ses enfants (alerte à la Directrice) ;
--  - la Directrice marque « vues » / annule les modifications des familles ;
--  - famille_coordonnees_modifier / eleve_ine_definir : la Directrice modifie coordonnées, adresse et INE.

create table if not exists public.eleves_ine (
  eleve_id uuid primary key references public.eleves(id) on delete cascade,
  ine text not null,
  updated_at timestamptz not null default now()
);
alter table public.eleves_ine enable row level security;
drop policy if exists eleves_ine_directrice on public.eleves_ine;
create policy eleves_ine_directrice on public.eleves_ine for all to authenticated
  using (public.est_directrice()) with check (public.est_directrice());
grant select, insert, update, delete on public.eleves_ine to authenticated;

create table if not exists public.import_conflits (
  id uuid primary key default gen_random_uuid(),
  lot text not null,
  cible text not null,           -- 'famille' | 'eleve' | 'contact'
  cible_id uuid,
  libelle text,                  -- « Famille Boucher », « Côme Picard »…
  champ text not null,
  ancien text,
  nouveau text,
  conflit boolean not null default true, -- false : champ vide simplement rempli
  cree_le timestamptz not null default now(),
  vu_le timestamptz
);
alter table public.import_conflits enable row level security;
drop policy if exists import_conflits_lecture on public.import_conflits;
create policy import_conflits_lecture on public.import_conflits for select to authenticated
  using (public.est_directrice() or public.peut_voir_sensible());
grant select on public.import_conflits to authenticated;

alter table public.contacts add column if not exists famille_parent smallint check (famille_parent in (1, 2));

drop policy if exists contacts_lecture_parents_bureau on public.contacts;
create policy contacts_lecture_parents_bureau on public.contacts for select to authenticated
  using (public.est_bureau() and categories && array['parent'::text]);

-- Trombinoscope / liste : coordonnées des parents pour la Directrice et le titulaire ; adresse et INE : Directrice.
drop function if exists public.trombinoscope(uuid);
create function public.trombinoscope(p_classe uuid)
returns table (id uuid, prenom text, nom text, classe_entree text, annee_entree text, decalage integer, sorti_le date,
               date_naissance date, photo_path text, famille text, famille_id uuid, parent1 text, parent1_telephone text,
               parent1_courriel text, parent2 text, parent2_telephone text, parent2_courriel text, adresse text, ine text)
language sql stable security definer set search_path = public as $$
  with droits as (select public.est_directrice() as dir, (public.est_directrice() or public.est_titulaire(p_classe)) as coord)
  select e.id, coalesce(e.prenom, e.initiale), coalesce(e.nom_usage, f.nom), e.classe_entree, e.annee_entree, e.decalage, e.sorti_le,
         e.date_naissance, e.photo_path, f.nom, case when d.dir then f.id end,
         case when d.coord then nullif(btrim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), '') end,
         case when d.coord then f.parent1_telephone end,
         case when d.coord then f.parent1_courriel end,
         case when d.coord then nullif(btrim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '') end,
         case when d.coord then f.parent2_telephone end,
         case when d.coord then f.parent2_courriel end,
         case when d.dir then nullif(btrim(concat_ws(', ', f.adresse, f.cp_ville)), '') end,
         case when d.dir then (select i.ine from eleves_ine i where i.eleve_id = e.id) end
    from classe_eleves ce join eleves e on e.id = ce.eleve_id join familles f on f.id = e.famille_id cross join droits d
   where ce.classe_id = p_classe and public.enseigne_dans(p_classe)
   order by coalesce(e.nom_usage, f.nom), e.prenom;
$$;
revoke all on function public.trombinoscope(uuid) from public, anon;
grant execute on function public.trombinoscope(uuid) to authenticated;

-- Directrice : INE d'un élève (chaîne vide = effacer).
create or replace function public.eleve_ine_definir(p_eleve uuid, p_ine text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  if nullif(btrim(coalesce(p_ine, '')), '') is null then
    delete from eleves_ine where eleve_id = p_eleve;
  else
    insert into eleves_ine (eleve_id, ine) values (p_eleve, upper(btrim(p_ine)))
    on conflict (eleve_id) do update set ine = excluded.ine, updated_at = now();
  end if;
end;
$$;
revoke all on function public.eleve_ine_definir(uuid, text) from public, anon;
grant execute on function public.eleve_ine_definir(uuid, text) to authenticated;

-- Fiches du Carnet des parents d'une famille, alignées sur la fiche famille (usage interne).
create or replace function public.famille_carnet_synchroniser(p_famille uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare f familles%rowtype; n smallint;
begin
  select * into f from familles where id = p_famille;
  if f.id is null then return; end if;
  for n in 1..2 loop
    update contacts c set
      prenom = case n when 1 then f.parent1_prenom else f.parent2_prenom end,
      nom = coalesce(case n when 1 then f.parent1_nom else f.parent2_nom end, c.nom),
      courriel = case n when 1 then f.parent1_courriel else f.parent2_courriel end,
      telephone = case n when 1 then f.parent1_telephone else f.parent2_telephone end,
      adresse = f.adresse, cp_ville = f.cp_ville, updated_at = now()
    where c.famille_id = p_famille and c.famille_parent = n and c.supprime_le is null;
  end loop;
end;
$$;
revoke all on function public.famille_carnet_synchroniser(uuid) from public, anon, authenticated;

-- Directrice (et gestion de la scolarité) : coordonnées et adresse d'une famille.
create or replace function public.famille_coordonnees_modifier(p_famille uuid, p_infos jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  champs text[] := array['adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                         'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel'];
  c text;
begin
  if not public.gere_scolarite() then raise exception 'Accès refusé'; end if;
  foreach c in array champs loop
    if p_infos ? c then
      execute format('update public.familles set %I = $1 where id = $2', c) using nullif(btrim(p_infos ->> c), ''), p_famille;
    end if;
  end loop;
  update familles f set
    telephone = nullif(concat_ws(' / ', f.parent1_telephone, f.parent2_telephone), ''),
    courriels = nullif(concat_ws(', ', f.parent1_courriel, f.parent2_courriel), ''),
    parent1 = nullif(trim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), ''),
    parent2 = nullif(trim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '')
  where f.id = p_famille;
  perform public.famille_carnet_synchroniser(p_famille);
end;
$$;
revoke all on function public.famille_coordonnees_modifier(uuid, jsonb) from public, anon;
grant execute on function public.famille_coordonnees_modifier(uuid, jsonb) to authenticated;

-- Famille : date de naissance d'un de ses enfants. Appliquée tout de suite, journalisée (alerte « à valider »).
create or replace function public.famille_naissance_enfant(p_eleve uuid, p_naissance date) returns void
language plpgsql volatile security definer set search_path = public as $$
declare fam uuid := public.ma_famille(); e eleves%rowtype;
begin
  if fam is null then raise exception 'Accès refusé'; end if;
  select * into e from eleves where id = p_eleve and famille_id = fam;
  if e.id is null then raise exception 'Accès refusé'; end if;
  if p_naissance is not null and (p_naissance < date '2000-01-01' or p_naissance > current_date) then
    raise exception 'Date de naissance invalide';
  end if;
  if e.date_naissance is not distinct from p_naissance then return; end if;
  update eleves set date_naissance = p_naissance where id = p_eleve;
  insert into familles_modifications (famille_id, champ, ancien, nouveau)
  values (fam, 'date_naissance:' || p_eleve, e.date_naissance::text, p_naissance::text);
end;
$$;
revoke all on function public.famille_naissance_enfant(uuid, date) from public, anon;
grant execute on function public.famille_naissance_enfant(uuid, date) to authenticated;

-- Les coordonnées modifiées par une famille sont reportées sur ses fiches parents du Carnet.
create or replace function public.familles_modif_carnet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.champ not like 'date_naissance:%' then perform public.famille_carnet_synchroniser(new.famille_id); end if;
  return new;
end;
$$;
drop trigger if exists familles_modif_carnet on public.familles_modifications;
create trigger familles_modif_carnet after insert on public.familles_modifications
  for each row execute function public.familles_modif_carnet();

-- La Directrice valide (« Vu ») ou annule aussi les modifications des familles.
create or replace function public.famille_modifications_vues(p_ids uuid[])
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not (public.valide_familles() or public.est_directrice()) then raise exception 'Accès refusé'; end if;
  update public.familles_modifications set vu_le = now(), vu_par = public.mon_role()
   where id = any (p_ids) and vu_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.famille_modifications_vues(uuid[]) from public, anon;
grant execute on function public.famille_modifications_vues(uuid[]) to authenticated;

create or replace function public.famille_modification_annuler(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare m public.familles_modifications%rowtype;
begin
  if not (public.valide_familles() or public.est_directrice()) then raise exception 'Accès refusé'; end if;
  select * into m from public.familles_modifications where id = p_id and vu_le is null;
  if not found then return; end if;
  if m.champ like 'date_naissance:%' then
    update public.eleves set date_naissance = m.ancien::date
     where id = substring(m.champ from 16)::uuid and famille_id = m.famille_id;
  elsif m.champ in ('adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                    'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel') then
    execute format('update public.familles set %I = $1 where id = $2', m.champ) using m.ancien, m.famille_id;
    update public.familles f set
      telephone = nullif(concat_ws(' / ', f.parent1_telephone, f.parent2_telephone), ''),
      courriels = nullif(concat_ws(', ', f.parent1_courriel, f.parent2_courriel), ''),
      parent1 = nullif(trim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), ''),
      parent2 = nullif(trim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '')
    where f.id = m.famille_id;
    perform public.famille_carnet_synchroniser(m.famille_id);
  else
    raise exception 'Champ inconnu';
  end if;
  update public.familles_modifications set annule = true, vu_le = now(), vu_par = public.mon_role() where id = p_id;
end;
$$;
revoke all on function public.famille_modification_annuler(uuid) from public, anon;
grant execute on function public.famille_modification_annuler(uuid) to authenticated;
