-- 04/11/2026 — Catéchisme : deux appréciations distinctes, sur le relevé comme sur le bulletin trimestriel.
--  - texte : celle du Directeur spirituel (inchangée, règle peut_apprecier) ;
--  - texte_professeur : celle du professeur de la matière (règle peut_noter).
-- Ajouts seulement : colonnes, fonction, politiques d'insertion et de mise à jour, garde par colonne.

alter table public.releves_notes_appreciations add column if not exists texte_professeur text;
alter table public.bulletins_trimestre_appreciations add column if not exists texte_professeur text;

create or replace function public.peut_apprecier_professeur(p_matiere uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matieres m where m.id = p_matiere
                  and translate(lower(btrim(m.nom)), 'éèêë', 'eeee') = 'catechisme')
     and public.peut_noter(p_matiere);
$$;
revoke all on function public.peut_apprecier_professeur(uuid) from public, anon;
grant execute on function public.peut_apprecier_professeur(uuid) to authenticated;

-- Le professeur peut créer ou modifier la ligne (pas la supprimer : la suppression reste à peut_apprecier).
drop policy if exists rn_appreciations_professeur_ins on public.releves_notes_appreciations;
create policy rn_appreciations_professeur_ins on public.releves_notes_appreciations for insert to authenticated
  with check (public.peut_apprecier_professeur(matiere_id) and public.releve_modifiable(releve_id));
drop policy if exists rn_appreciations_professeur_maj on public.releves_notes_appreciations;
create policy rn_appreciations_professeur_maj on public.releves_notes_appreciations for update to authenticated
  using (public.peut_apprecier_professeur(matiere_id) and public.releve_modifiable(releve_id))
  with check (public.peut_apprecier_professeur(matiere_id) and public.releve_modifiable(releve_id));

drop policy if exists bt_appreciations_professeur_ins on public.bulletins_trimestre_appreciations;
create policy bt_appreciations_professeur_ins on public.bulletins_trimestre_appreciations for insert to authenticated
  with check (public.peut_apprecier_professeur(matiere_id) and public.bulletin_trimestre_modifiable(bulletin_id));
drop policy if exists bt_appreciations_professeur_maj on public.bulletins_trimestre_appreciations;
create policy bt_appreciations_professeur_maj on public.bulletins_trimestre_appreciations for update to authenticated
  using (public.peut_apprecier_professeur(matiere_id) and public.bulletin_trimestre_modifiable(bulletin_id))
  with check (public.peut_apprecier_professeur(matiere_id) and public.bulletin_trimestre_modifiable(bulletin_id));

-- Garde par colonne : chacun ne modifie que son appréciation (hors session utilisateur : maintenance).
create or replace function public.appreciations_garde_colonnes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (tg_op = 'INSERT' and new.texte is not null) or (tg_op = 'UPDATE' and new.texte is distinct from old.texte) then
    if not public.peut_apprecier(new.matiere_id) then
      raise exception 'Appréciation réservée au Directeur spirituel' using errcode = '42501';
    end if;
  end if;
  if (tg_op = 'INSERT' and new.texte_professeur is not null) or (tg_op = 'UPDATE' and new.texte_professeur is distinct from old.texte_professeur) then
    if not public.peut_apprecier_professeur(new.matiere_id) then
      raise exception 'Appréciation réservée au professeur de la matière' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists rn_appreciations_garde on public.releves_notes_appreciations;
create trigger rn_appreciations_garde before insert or update on public.releves_notes_appreciations
  for each row execute function public.appreciations_garde_colonnes();
drop trigger if exists bt_appreciations_garde on public.bulletins_trimestre_appreciations;
create trigger bt_appreciations_garde before insert or update on public.bulletins_trimestre_appreciations
  for each row execute function public.appreciations_garde_colonnes();
