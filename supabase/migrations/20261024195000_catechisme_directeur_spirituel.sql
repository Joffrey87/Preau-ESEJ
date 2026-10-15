-- 15/10/2026 — L'appréciation du Catéchisme (relevé, bulletin trimestriel, bulletin de période) n'est saisissable et
-- modifiable que par le Directeur spirituel ; les autres matières gardent la règle peut_noter.
create or replace function public.peut_apprecier(p_matiere uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from matieres m where m.id = p_matiere
                  and translate(lower(btrim(m.nom)), 'éèêë', 'eeee') = 'catechisme')
      then public.mon_role() = 'directeur-spirituel'
    else public.peut_noter(p_matiere)
  end;
$$;
revoke all on function public.peut_apprecier(uuid) from public, anon;
grant execute on function public.peut_apprecier(uuid) to authenticated;

drop policy if exists rn_appreciations_ecriture on public.releves_notes_appreciations;
create policy rn_appreciations_ecriture on public.releves_notes_appreciations for all to authenticated
  using (public.peut_apprecier(matiere_id) and public.releve_modifiable(releve_id))
  with check (public.peut_apprecier(matiere_id) and public.releve_modifiable(releve_id));

drop policy if exists bt_appreciations_ecriture on public.bulletins_trimestre_appreciations;
create policy bt_appreciations_ecriture on public.bulletins_trimestre_appreciations for all to authenticated
  using (public.peut_apprecier(matiere_id) and public.bulletin_trimestre_modifiable(bulletin_id))
  with check (public.peut_apprecier(matiere_id) and public.bulletin_trimestre_modifiable(bulletin_id));

drop policy if exists lignes_ecriture on public.bulletin_lignes;
create policy lignes_ecriture on public.bulletin_lignes for all to authenticated
  using (public.peut_apprecier(matiere_id) and public.bulletin_modifiable(bulletin_id))
  with check (public.peut_apprecier(matiere_id) and public.bulletin_modifiable(bulletin_id));
