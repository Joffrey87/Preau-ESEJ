-- Relevé maternelle : la titulaire (ex. PS/MS) rédige elle-même la ligne « Catéchisme » de sa classe.
-- Retour à la politique d'origine (titulaire et Directrice) ; le Directeur spirituel garde la main sur le Catéchisme
-- des relevés de notes et bulletins (peut_apprecier), pas sur le relevé maternelle.
drop policy if exists releve_lignes_ecriture on public.releve_maternelle_lignes;
create policy releve_lignes_ecriture on public.releve_maternelle_lignes for all to authenticated
  using (public.releve_maternelle_modifiable(releve_id)) with check (public.releve_maternelle_modifiable(releve_id));
drop function if exists public.releve_maternelle_ligne_modifiable(uuid, uuid);
