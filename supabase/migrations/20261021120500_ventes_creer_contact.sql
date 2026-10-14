-- Ventes diverses : créer une personne dans le Carnet depuis l'onglet (Directrice, Événement, Trésorier).
-- Événement : catégorie « evenement » (visible de son carnet restreint) ; École : catégorie « parent ».
create or replace function public.ventes_creer_contact(
  p_domaine text, p_nom text, p_prenom text, p_courriel text, p_telephone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if p_domaine not in ('ecole', 'evenement') or not public.domaine_ventes_ok(p_domaine) then
    raise exception 'Accès refusé.';
  end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'Le nom est obligatoire.'; end if;
  insert into contacts (est_personne_morale, nom, prenom, categories, courriel, telephone)
  values (false, trim(p_nom), nullif(trim(p_prenom), ''),
          array[case when p_domaine = 'evenement' then 'evenement' else 'parent' end],
          nullif(trim(p_courriel), ''), nullif(trim(p_telephone), ''))
  returning id into v;
  return v;
end;
$$;
revoke all on function public.ventes_creer_contact(text, text, text, text, text) from public, anon;
grant execute on function public.ventes_creer_contact(text, text, text, text, text) to authenticated;
