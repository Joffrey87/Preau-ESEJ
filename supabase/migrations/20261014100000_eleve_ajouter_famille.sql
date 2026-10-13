-- 14/10/2026 — Ajout d'un élève sans contrainte sur la famille.
-- Depuis les Paramètres des bulletins, on rattache l'élève à une famille existante OU on en crée une à la volée
-- (fenêtre « Nouvelle famille » : aucune information n'est obligatoire). Conséquences de l'ajout :
--  - l'élève apparaît dans l'Espace famille de sa famille (eleves.famille_id) ;
--  - une famille créée ici est une vraie famille de Préau : fiche familles + inscription de l'année dans les
--    Frais de scolarité (montant du barème, à ajuster), donc proposée partout où l'on choisit une famille ;
--  - la fiche du Carnet d'adresses de la famille est liée (contacts.famille_id), ou créée si elle n'existe pas.

-- Lien fiche du carnet -> famille de l'école.
alter table public.contacts add column if not exists famille_id uuid references public.familles(id) on delete set null;
create index if not exists contacts_famille_id on public.contacts (famille_id) where famille_id is not null;

-- Lie (ou crée) la fiche du Carnet d'adresses d'une famille. Usage interne (appelée par eleve_ajouter).
create or replace function public.famille_carnet_lier(p_famille uuid) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  f familles%rowtype;
  v_id uuid;
begin
  select * into f from familles where id = p_famille;
  if f.id is null then return null; end if;
  select id into v_id from contacts where famille_id = p_famille and supprime_le is null order by created_at limit 1;
  if v_id is null then
    -- Fiche existante au même nom (particulier, pas encore liée) : on la rattache si elle est la seule.
    select min(id::text)::uuid into v_id from contacts
      where famille_id is null and supprime_le is null and not est_personne_morale
        and lower(btrim(nom)) = lower(btrim(f.nom))
      having count(*) = 1;
  end if;
  if v_id is null then
    insert into contacts (est_personne_morale, nom, prenom, categories, courriel, telephone, adresse, cp_ville, famille_statut, famille_id)
    values (false, f.nom,
            nullif(concat_ws(' et ', nullif(btrim(coalesce(f.parent1_prenom, '')), ''), nullif(btrim(coalesce(f.parent2_prenom, '')), '')), ''),
            array['parent'],
            coalesce(nullif(btrim(coalesce(f.parent1_courriel, '')), ''), nullif(btrim(coalesce(f.parent2_courriel, '')), ''), nullif(btrim(coalesce(f.courriels, '')), '')),
            coalesce(nullif(btrim(coalesce(f.parent1_telephone, '')), ''), nullif(btrim(coalesce(f.parent2_telephone, '')), ''), nullif(btrim(coalesce(f.telephone, '')), '')),
            nullif(btrim(coalesce(f.adresse, '')), ''), nullif(btrim(coalesce(f.cp_ville, '')), ''),
            'actuelle', p_famille)
    returning id into v_id;
  else
    update contacts set famille_id = p_famille,
      famille_statut = 'actuelle',
      categories = case when 'parent' = any(coalesce(categories, '{}')) then categories else coalesce(categories, '{}') || 'parent' end
    where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.famille_carnet_lier(uuid) from public, anon, authenticated;

-- Nouvelle signature : la famille devient facultative (p_famille null = nouvelle famille décrite par p_famille_infos).
drop function if exists public.eleve_ajouter(uuid, text, text, text, text, uuid);
create or replace function public.eleve_ajouter(
  p_famille uuid, p_prenom text, p_nom text, p_niveau text, p_annee text, p_classe uuid default null,
  p_famille_infos jsonb default null
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
  v_famille uuid := p_famille;
  v_nom_famille text;
  v_prenom text := btrim(coalesce(p_prenom, ''));
  i jsonb := coalesce(p_famille_infos, '{}'::jsonb);
  v_base text;
  n int := 1;
begin
  if not (public.est_directrice() or public.gere_scolarite()) then raise exception 'Accès refusé'; end if;
  if v_prenom = '' then raise exception 'Le prénom est obligatoire'; end if;
  if p_niveau not in ('PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2') then raise exception 'Niveau inconnu : %', p_niveau; end if;
  if p_annee !~ '^\d{4}-\d{4}$' then raise exception 'Année scolaire au format 2026-2027'; end if;
  if p_classe is not null and not exists (select 1 from classes where id = p_classe and annee_scolaire = p_annee) then
    raise exception 'Classe introuvable pour %', p_annee;
  end if;

  if v_famille is null then
    -- Nouvelle famille : son nom, sinon celui de l'élève, sinon « Famille de <prénom> » ; rendu unique au besoin.
    v_base := coalesce(nullif(btrim(coalesce(i->>'nom', '')), ''), nullif(btrim(coalesce(p_nom, '')), ''), 'Famille de ' || v_prenom);
    v_nom_famille := v_base;
    while exists (select 1 from familles where lower(nom) = lower(v_nom_famille)) loop
      n := n + 1;
      v_nom_famille := v_base || ' (' || n || ')';
    end loop;
    insert into familles (nom, parent1_prenom, parent1_nom, parent1_telephone, parent1_courriel,
                          parent2_prenom, parent2_nom, parent2_telephone, parent2_courriel, adresse, cp_ville)
    values (v_nom_famille,
            nullif(btrim(coalesce(i->>'parent1_prenom', '')), ''), nullif(btrim(coalesce(i->>'parent1_nom', '')), ''),
            nullif(btrim(coalesce(i->>'parent1_telephone', '')), ''), nullif(btrim(coalesce(i->>'parent1_courriel', '')), ''),
            nullif(btrim(coalesce(i->>'parent2_prenom', '')), ''), nullif(btrim(coalesce(i->>'parent2_nom', '')), ''),
            nullif(btrim(coalesce(i->>'parent2_telephone', '')), ''), nullif(btrim(coalesce(i->>'parent2_courriel', '')), ''),
            nullif(btrim(coalesce(i->>'adresse', '')), ''), nullif(btrim(coalesce(i->>'cp_ville', '')), ''))
    returning id into v_famille;
    -- Inscription de l'année dans les Frais de scolarité (montant du barème pour 1 enfant, 0 à défaut).
    insert into scolarite_inscriptions (annee_scolaire, famille_nom, famille_id, nb_enfants, emails, montant_mensuel)
    values (p_annee, v_nom_famille, v_famille, 1,
            nullif(concat_ws(', ', nullif(btrim(coalesce(i->>'parent1_courriel', '')), ''), nullif(btrim(coalesce(i->>'parent2_courriel', '')), '')), ''),
            coalesce((select montant_mensuel from scolarite_bareme where annee_scolaire = p_annee and nb_enfants = 1 limit 1), 0));
  else
    select nom into v_nom_famille from familles where id = v_famille;
    if v_nom_famille is null then raise exception 'Famille introuvable'; end if;
    if exists (select 1 from eleves where famille_id = v_famille and lower(btrim(coalesce(prenom, ''))) = lower(v_prenom)) then
      raise exception '% est déjà enregistré(e) dans la famille %', v_prenom, v_nom_famille;
    end if;
  end if;

  insert into eleves (famille_id, prenom, initiale, classe_entree, annee_entree, decalage, nom_usage)
  values (v_famille, v_prenom, upper(left(v_prenom, 1)), p_niveau, p_annee, 0,
          -- Nom d'usage seulement s'il diffère du nom de la famille.
          case when lower(btrim(coalesce(p_nom, ''))) in ('', lower(v_nom_famille)) then null else btrim(p_nom) end)
  returning id into v_id;

  if p_classe is not null then
    insert into classe_eleves (classe_id, eleve_id) values (p_classe, v_id) on conflict do nothing;
  end if;
  -- Fiche du Carnet d'adresses liée à la famille (créée si besoin).
  perform public.famille_carnet_lier(v_famille);
  return v_id;
end;
$$;
revoke all on function public.eleve_ajouter(uuid, text, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.eleve_ajouter(uuid, text, text, text, text, uuid, jsonb) to authenticated;
