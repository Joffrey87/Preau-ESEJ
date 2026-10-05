-- 05/10/2026 — Les familles renseignent elles-mêmes leurs coordonnées (espace famille) et les revalident chaque année
-- (1er août → 30 septembre).
--  - familles : adresse + une fiche par parent (prénom, nom, téléphone, courriel) ;
--  - familles.revalide_annee : année de la dernière revalidation complète (campagne de l'été de cette année) ;
--  - familles_modifications : journal des modifications faites par les familles (ancienne / nouvelle valeur) ;
--    appliquées tout de suite, elles restent « à valider » (alerte ambre) jusqu'à ce que le bureau les marque « vues »
--    ou les annule (l'ancienne valeur est alors restaurée).

alter table public.familles
  add column if not exists parent1_prenom text,
  add column if not exists parent1_nom text,
  add column if not exists parent1_telephone text,
  add column if not exists parent1_courriel text,
  add column if not exists parent2_prenom text,
  add column if not exists parent2_nom text,
  add column if not exists parent2_telephone text,
  add column if not exists parent2_courriel text,
  add column if not exists revalide_annee integer,
  add column if not exists revalide_le timestamptz;

-- Reprise de l'existant : le téléphone et les courriels de la famille sont rattachés aux parents 1 et 2,
-- en attendant que la famille les corrige.
update public.familles f set
  parent1_telephone = coalesce(f.parent1_telephone, nullif(trim(f.telephone), '')),
  parent1_courriel = coalesce(f.parent1_courriel, nullif((regexp_split_to_array(coalesce(f.courriels, ''), '[,;\s]+'))[1], '')),
  parent2_courriel = coalesce(f.parent2_courriel, nullif((regexp_split_to_array(coalesce(f.courriels, ''), '[,;\s]+'))[2], ''));

create table if not exists public.familles_modifications (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references public.familles(id) on delete cascade,
  champ text not null,
  ancien text,
  nouveau text,
  modifie_le timestamptz not null default now(),
  vu_le timestamptz,
  vu_par text,
  annule boolean not null default false
);
create index if not exists familles_modifications_a_valider_idx on public.familles_modifications (vu_le) where vu_le is null;

alter table public.familles_modifications enable row level security;

/** Rôles qui valident les modifications des familles. */
create or replace function public.valide_familles() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('president', 'tresorier', 'secretaire', 'administrateur');
$$;

create policy familles_modifications_lecture on public.familles_modifications for select to authenticated
  using (public.valide_familles() or public.mon_role() = 'directrice');
grant select on public.familles_modifications to authenticated;

/** Année de la campagne de revalidation en cours (août et septembre), sinon null. */
create or replace function public.annee_revalidation() returns integer
language sql stable as $$
  select case when extract(month from (now() at time zone 'Europe/Paris')) in (8, 9)
              then extract(year from (now() at time zone 'Europe/Paris'))::integer end;
$$;

/**
 * Enregistrement par la famille de ses coordonnées. Appliqué tout de suite ; chaque champ modifié est journalisé
 * (alerte « à valider » côté bureau). `p_revalide` : la famille confirme que tout est à jour (campagne annuelle).
 */
create or replace function public.famille_enregistrer(p_infos jsonb, p_revalide boolean default false)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  fam uuid := public.ma_famille();
  cur public.familles%rowtype;
  champs text[] := array['adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                         'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel'];
  c text;
  ancien text;
  nouveau text;
  n integer := 0;
begin
  if fam is null then raise exception 'Accès refusé'; end if;
  select * into cur from public.familles where id = fam;
  foreach c in array champs loop
    if not (p_infos ? c) then continue; end if;
    nouveau := nullif(trim(p_infos ->> c), '');
    execute format('select %I from public.familles where id = $1', c) into ancien using fam;
    if ancien is not distinct from nouveau then continue; end if;
    execute format('update public.familles set %I = $1 where id = $2', c) using nouveau, fam;
    insert into public.familles_modifications (famille_id, champ, ancien, nouveau) values (fam, c, ancien, nouveau);
    n := n + 1;
  end loop;
  -- Anciens champs regroupés : tenus à jour pour les écrans qui les lisent encore.
  update public.familles f set
    telephone = nullif(concat_ws(' / ', f.parent1_telephone, f.parent2_telephone), ''),
    courriels = nullif(concat_ws(', ', f.parent1_courriel, f.parent2_courriel), ''),
    parent1 = nullif(trim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), ''),
    parent2 = nullif(trim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '')
  where f.id = fam;
  if p_revalide and public.annee_revalidation() is not null then
    update public.familles set revalide_annee = public.annee_revalidation(), revalide_le = now() where id = fam;
  end if;
  return n;
end;
$$;
revoke all on function public.famille_enregistrer(jsonb, boolean) from public, anon;
grant execute on function public.famille_enregistrer(jsonb, boolean) to authenticated;

/** Le bureau marque des modifications comme « vues ». */
create or replace function public.famille_modifications_vues(p_ids uuid[])
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.valide_familles() then raise exception 'Accès refusé'; end if;
  update public.familles_modifications set vu_le = now(), vu_par = public.mon_role()
   where id = any (p_ids) and vu_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.famille_modifications_vues(uuid[]) from public, anon;
grant execute on function public.famille_modifications_vues(uuid[]) to authenticated;

/** Le bureau annule une modification : l'ancienne valeur est restaurée. */
create or replace function public.famille_modification_annuler(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare m public.familles_modifications%rowtype;
begin
  if not public.valide_familles() then raise exception 'Accès refusé'; end if;
  select * into m from public.familles_modifications where id = p_id and vu_le is null;
  if not found then return; end if;
  if m.champ not in ('adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                     'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel') then
    raise exception 'Champ inconnu';
  end if;
  execute format('update public.familles set %I = $1 where id = $2', m.champ) using m.ancien, m.famille_id;
  update public.familles_modifications set annule = true, vu_le = now(), vu_par = public.mon_role() where id = p_id;
  update public.familles f set
    telephone = nullif(concat_ws(' / ', f.parent1_telephone, f.parent2_telephone), ''),
    courriels = nullif(concat_ws(', ', f.parent1_courriel, f.parent2_courriel), ''),
    parent1 = nullif(trim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), ''),
    parent2 = nullif(trim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '')
  where f.id = m.famille_id;
end;
$$;
revoke all on function public.famille_modification_annuler(uuid) from public, anon;
grant execute on function public.famille_modification_annuler(uuid) to authenticated;
