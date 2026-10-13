-- 14/10/2026 — Appréciation par matière (bulletin_lignes.commentaire) : 250 caractères au plus.
-- Environ quatre lignes dans la colonne Commentaire du PDF : le bulletin tient sur une page. Même limite côté écran
-- (grille des notes, saisie élève par élève, fiche du bulletin). Les droits restent ceux de lignes_ecriture
-- (matière enseignée ou titulaire / Directrice, bulletin encore modifiable).
alter table public.bulletin_lignes drop constraint if exists bulletin_lignes_commentaire_longueur;
alter table public.bulletin_lignes add constraint bulletin_lignes_commentaire_longueur
  check (commentaire is null or char_length(commentaire) <= 250);
