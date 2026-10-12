-- Ajout d'un élève depuis les Paramètres des bulletins : toujours rattaché à une famille existante (celle de la
-- scolarité et de l'Espace famille), inscrit dans une classe s'il y en a une. Son niveau de l'année donne sa classe
-- d'entrée (la classe des années suivantes s'en déduit, comme pour les autres élèves).
create or replace function public.eleve_ajouter(
  p_famille uuid, p_prenom text, p_nom text, p_niveau text, p_annee text, p_classe uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
  v_nom_famille text;
  v_prenom text := btrim(coalesce(p_prenom, ''));
begin
  if not (public.est_directrice() or public.gere_scolarite()) then raise exception 'Accès refusé'; end if;
  select nom into v_nom_famille from familles where id = p_famille;
  if v_nom_famille is null then raise exception 'Famille introuvable'; end if;
  if v_prenom = '' then raise exception 'Le prénom est obligatoire'; end if;
  if p_niveau not in ('PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2') then raise exception 'Niveau inconnu : %', p_niveau; end if;
  if p_annee !~ '^\d{4}-\d{4}$' then raise exception 'Année scolaire au format 2026-2027'; end if;
  if exists (select 1 from eleves where famille_id = p_famille and lower(btrim(coalesce(prenom, ''))) = lower(v_prenom)) then
    raise exception '% est déjà enregistré(e) dans la famille %', v_prenom, v_nom_famille;
  end if;
  if p_classe is not null and not exists (select 1 from classes where id = p_classe and annee_scolaire = p_annee) then
    raise exception 'Classe introuvable pour %', p_annee;
  end if;

  insert into eleves (famille_id, prenom, initiale, classe_entree, annee_entree, decalage, nom_usage)
  values (p_famille, v_prenom, upper(left(v_prenom, 1)), p_niveau, p_annee, 0,
          -- Nom d'usage seulement s'il diffère du nom de la famille.
          case when lower(btrim(coalesce(p_nom, ''))) in ('', lower(v_nom_famille)) then null else btrim(p_nom) end)
  returning id into v_id;

  if p_classe is not null then
    insert into classe_eleves (classe_id, eleve_id) values (p_classe, v_id) on conflict do nothing;
  end if;
  return v_id;
end;
$$;
revoke all on function public.eleve_ajouter(uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.eleve_ajouter(uuid, text, text, text, text, uuid) to authenticated;
