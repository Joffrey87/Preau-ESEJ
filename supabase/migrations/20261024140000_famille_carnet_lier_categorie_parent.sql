-- 15/10/2026 — Correctif : « malformed array literal: "parent" » à l'ajout d'un élève dans une famille dont la fiche
-- du Carnet d'adresses existe déjà sans la catégorie « parent » (text[] || 'parent' interprétait 'parent' comme un tableau).
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
      categories = case when 'parent' = any(coalesce(categories, '{}')) then categories else array_append(coalesce(categories, '{}'), 'parent') end
    where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.famille_carnet_lier(uuid) from public, anon, authenticated;
