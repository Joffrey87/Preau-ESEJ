-- Relation (« Origine donateur », texte libre) modifiable depuis le tableau et la fiche donateur par la Recherche de
-- fonds, le Trésorier et le Président (mêmes profils que dons_modifier_contact_donateur), sans toucher aux autres
-- infos de contact. Hors Trésorier, le changement est signalé au Trésorier (dons_alertes_donateur). Additif.
create or replace function public.dons_modifier_relation(p_dons uuid[], p_valeur text, p_prenom text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_role text := public.mon_role();
begin
  if v_role not in ('recherche-fonds', 'tresorier', 'president') then
    raise exception 'Profil non autorisé.';
  end if;
  if coalesce(array_length(p_dons, 1), 0) = 0 then raise exception 'Aucun don.'; end if;
  if length(btrim(coalesce(p_valeur, ''))) > 120 then raise exception 'Relation trop longue (120 caractères au plus).'; end if;
  if v_role <> 'tresorier' then
    insert into dons_alertes_donateur (don_id, changements, par, par_role)
    select id, jsonb_build_array(jsonb_build_object('champ', 'Relation', 'avant', origine, 'apres', nullif(btrim(coalesce(p_valeur, '')), ''))),
           nullif(btrim(coalesce(p_prenom, '')), ''), v_role
    from dons where id = any(p_dons) and supprime_le is null
      and origine is distinct from nullif(btrim(coalesce(p_valeur, '')), '');
  end if;
  update dons set origine = nullif(btrim(coalesce(p_valeur, '')), '')
  where id = any(p_dons) and supprime_le is null;
end;
$$;
revoke all on function public.dons_modifier_relation(uuid[], text, text) from public, anon;
grant execute on function public.dons_modifier_relation(uuid[], text, text) to authenticated;
