-- 15/10/2026 — Carnet d'adresses de la Directrice.
--  - La Directrice lit les fiches du Carnet de ses catégories (parents, enseignants, bureau, autres).
--  - Elle modifie les coordonnées des familles : appliqué tout de suite pour une ancienne famille ; pour une famille
--    de l'année en cours, la modification est PROPOSÉE à la famille, qui l'accepte ou la refuse dans son Espace famille.
--  - Les autres profils qui gèrent la scolarité (gere_scolarite) modifient directement, comme avant.

drop policy if exists contacts_lecture on public.contacts;
create policy contacts_lecture on public.contacts for select to authenticated
  using (
    public.peut_voir_sensible()
    or (public.mon_role() = 'directeur-spirituel' and categories && array['bureau', 'enseignant', 'autre'])
    or (public.mon_role() = 'directrice' and categories && array['parent', 'enseignant', 'bureau', 'autre'])
  );

/** Famille de l'année scolaire en cours : au moins un enfant à l'école cette année (entré, pas encore sorti). */
create or replace function public.famille_actuelle(p_famille uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with a as (
    select case when extract(month from (now() at time zone 'Europe/Paris')) >= 9
                then extract(year from (now() at time zone 'Europe/Paris'))::int
                else extract(year from (now() at time zone 'Europe/Paris'))::int - 1 end as debut
  )
  select exists (
    select 1 from eleves e, a
     where e.famille_id = p_famille
       and split_part(e.annee_entree, '-', 1)::int <= a.debut
       and (e.sorti_le is null or e.sorti_le >= make_date(a.debut, 9, 1))
  );
$$;
revoke all on function public.famille_actuelle(uuid) from public, anon;
grant execute on function public.famille_actuelle(uuid) to authenticated;

create table if not exists public.familles_propositions (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references public.familles(id) on delete cascade,
  champ text not null check (champ in ('adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                                       'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel')),
  ancien text,
  nouveau text,
  propose_par text not null,
  propose_le timestamptz not null default now(),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'acceptee', 'refusee', 'remplacee')),
  decide_le timestamptz
);
create index if not exists familles_propositions_attente on public.familles_propositions (famille_id) where statut = 'en_attente';
alter table public.familles_propositions enable row level security;
drop policy if exists familles_propositions_lecture on public.familles_propositions;
create policy familles_propositions_lecture on public.familles_propositions for select to authenticated
  using (famille_id = public.ma_famille() or public.est_bureau());
grant select on public.familles_propositions to authenticated;

/** Anciens champs regroupés de la famille, tenus à jour pour les écrans qui les lisent encore. */
create or replace function public.famille_regrouper(p_famille uuid) returns void
language sql volatile security definer set search_path = public as $$
  update familles f set
    telephone = nullif(concat_ws(' / ', f.parent1_telephone, f.parent2_telephone), ''),
    courriels = nullif(concat_ws(', ', f.parent1_courriel, f.parent2_courriel), ''),
    parent1 = nullif(trim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), ''),
    parent2 = nullif(trim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '')
  where f.id = p_famille;
$$;
revoke all on function public.famille_regrouper(uuid) from public, anon;

/**
 * Modification des coordonnées d'une famille depuis le Carnet. Directrice + famille de l'année : proposition à la
 * famille (une seule en attente par champ, la nouvelle remplace l'ancienne). Sinon : appliqué tout de suite.
 * Renvoie 'propose', 'applique' ou 'rien'.
 */
create or replace function public.famille_modifier_bureau(p_famille uuid, p_infos jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  champs text[] := array['adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                         'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel'];
  c text; ancien text; nouveau text; n int := 0;
  v_proposer boolean;
begin
  if not (public.est_directrice() or public.gere_scolarite()) then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from familles where id = p_famille) then raise exception 'Famille introuvable'; end if;
  v_proposer := public.est_directrice() and public.famille_actuelle(p_famille);
  foreach c in array champs loop
    if not (p_infos ? c) then continue; end if;
    nouveau := nullif(trim(p_infos ->> c), '');
    execute format('select %I from familles where id = $1', c) into ancien using p_famille;
    if ancien is not distinct from nouveau then continue; end if;
    n := n + 1;
    if v_proposer then
      update familles_propositions set statut = 'remplacee', decide_le = now() where famille_id = p_famille and champ = c and statut = 'en_attente';
      insert into familles_propositions (famille_id, champ, ancien, nouveau, propose_par) values (p_famille, c, ancien, nouveau, public.mon_role());
    else
      execute format('update familles set %I = $1 where id = $2', c) using nouveau, p_famille;
    end if;
  end loop;
  if n = 0 then return 'rien'; end if;
  if not v_proposer then perform public.famille_regrouper(p_famille); return 'applique'; end if;
  return 'propose';
end;
$$;
revoke all on function public.famille_modifier_bureau(uuid, jsonb) from public, anon;
grant execute on function public.famille_modifier_bureau(uuid, jsonb) to authenticated;

/** La famille accepte (la valeur proposée s'applique) ou refuse une proposition. */
create or replace function public.famille_proposition_decider(p_id uuid, p_accepter boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare p familles_propositions%rowtype;
begin
  select * into p from familles_propositions where id = p_id and statut = 'en_attente';
  if not found then raise exception 'Proposition introuvable ou déjà traitée'; end if;
  if p.famille_id is distinct from public.ma_famille() then raise exception 'Accès refusé'; end if;
  if p_accepter then
    execute format('update familles set %I = $1 where id = $2', p.champ) using p.nouveau, p.famille_id;
    perform public.famille_regrouper(p.famille_id);
  end if;
  update familles_propositions set statut = case when p_accepter then 'acceptee' else 'refusee' end, decide_le = now() where id = p_id;
end;
$$;
revoke all on function public.famille_proposition_decider(uuid, boolean) from public, anon;
grant execute on function public.famille_proposition_decider(uuid, boolean) to authenticated;
