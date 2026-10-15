-- 15/10/2026 — Fiches d'aide (ampoule) pour les Professeurs : lecture des fiches publiées cochées « professeur »,
-- et une fiche par tâche (Notes & Bulletins), visibles aussi de la Directrice.

drop policy if exists fiches_aide_professeur_lecture on public.fiches_aide;
create policy fiches_aide_professeur_lecture on public.fiches_aide for select to authenticated
  using (public.mon_role() = 'professeur' and statut = 'publiee' and supprime_le is null and 'professeur' = any (profils));

insert into public.fiches_aide (titre, onglets, profils, tags, declencheur, etapes, points_attention, liens, periodicite, statut, cree_par_role, modifie_par_role)
select v.titre, array['/bulletins'], array['professeur', 'directrice'], v.tags, v.declencheur, v.etapes, v.attention,
       '[{"libelle": "Guide Professeurs", "href": "/guide-professeurs"}]'::jsonb, v.periodicite, 'publiee', 'tresorier', 'tresorier'
from (values
  ('Créer une évaluation et saisir les notes',
   array['notes', 'évaluation', 'devoir', 'saisie', 'barème', 'coefficient'],
   'Un devoir a été corrigé.',
   '["Notes & Bulletins › onglet « Relevés de notes » : choisissez la classe et la période.", "Cliquez sur le nom de la matière (ou une case) : la saisie s''ouvre au-dessus du tableau.", "« + Évaluation » : titre, date, coefficient et barème (noté sur 20, sur 10…).", "Tapez chaque note ; Entrée ou flèche vers le bas pour passer à l''élève suivant.", "« Retour Relevés de notes » pour revenir au tableau."]'::jsonb,
   'Saisie possible : un nombre (virgule acceptée), abs (absent), disp (dispensé), nr (non rendu) — ces trois-là ne comptent pas dans la moyenne. Tout s''enregistre en quittant la case.',
   'ponctuelle'),
  ('Rédiger l''appréciation générale du relevé',
   array['appréciation', 'relevé', 'période', 'titulaire'],
   'Fin de période : les relevés de notes sont à compléter.',
   '["Onglet « Relevés de notes » : choisissez la classe et la période.", "Cliquez sur le nom de l''élève : sa ligne s''ouvre.", "Rédigez l''appréciation générale ; elle s''enregistre quand vous quittez le champ.", "Passez à l''élève suivant."]'::jsonb,
   'Réservé à la titulaire de la classe (et à la Directrice). Le relevé reprend les notes de la période, sans moyenne.',
   'trimestrielle'),
  ('Marquer les relevés « Prêt »',
   array['prêt', 'validation', 'publication', 'relevé', 'bulletin'],
   'Les notes et appréciations de la classe sont complètes.',
   '["Vérifiez les notes et les appréciations de la classe.", "Cochez des élèves pour n''agir que sur eux, ou aucun pour toute la classe.", "Cliquez « Marquer prêt ».", "La Directrice valide, puis publie aux familles."]'::jsonb,
   'Après validation, seule la Directrice peut modifier. « Repasser en cours » rouvre un relevé marqué prêt par erreur. Un relevé publié verrouille les notes de l''élève pour la période.',
   'trimestrielle'),
  ('Bulletin du trimestre : appréciations',
   array['bulletin', 'trimestre', 'moyenne', 'appréciation', 'intervenant'],
   'Fin de trimestre : les bulletins sont à compléter.',
   '["Notes & Bulletins › onglet « Bulletins » : choisissez la classe et une période du trimestre.", "Les moyennes sont calculées seules (moyenne simple sur 20 de toutes les notes du trimestre).", "Professeur intervenant : écrivez l''appréciation de votre matière, face à sa moyenne.", "Titulaire : rédigez l''« Appréciation du trimestre » de chaque élève.", "Puis « Marquer prêt »."]'::jsonb,
   'Les appréciations des relevés ne sont pas reprises : le bulletin a la sienne. Le bulletin porte la date de naissance de l''élève et un encart pour la signature des parents.',
   'trimestrielle'),
  ('Catéchisme : appréciation seule',
   array['catéchisme', 'appréciation', 'sans note'],
   'Le Catéchisme est à évaluer sur un relevé ou un bulletin.',
   '["Relevé : cliquez sur la case Catéchisme de l''élève (ou sur son nom) et rédigez l''appréciation.", "Bulletin : écrivez l''appréciation sur la ligne Catéchisme."]'::jsonb,
   'Pas de note ni de moyenne en Catéchisme : il n''entre pas dans la moyenne générale.',
   'trimestrielle'),
  ('Faire l''appel',
   array['appel', 'absence', 'retard', 'présence'],
   'Début de demi-journée.',
   '["Menu « Appel & absences » : choisissez la classe ; la date du jour est proposée.", "Au besoin, cochez « Préciser par demi-journée » et choisissez matin ou après-midi.", "Pour chaque élève : Présent, Absent ou Retard ; précisez le type et une remarque si besoin.", "« Enregistrer l''appel » (ou « Mettre à jour l''appel » pour corriger)."]'::jsonb,
   'L''appel est fait par la titulaire de la classe ou la Directrice. Le récapitulatif de la période est repris sur le bulletin.',
   'ponctuelle'),
  ('Télécharger un relevé ou un bulletin en PDF',
   array['pdf', 'imprimer', 'télécharger', 'relevé', 'bulletin'],
   'Besoin d''une version papier.',
   '["Onglet « Relevés de notes » ou « Bulletins » : choisissez la classe et la période.", "« PDF » sur la ligne d''un élève : son document seul.", "« PDF de la classe » : tous les documents (ou ceux des élèves cochés)."]'::jsonb,
   null,
   'ponctuelle')
) as v(titre, tags, declencheur, etapes, attention, periodicite)
where not exists (select 1 from public.fiches_aide f where f.titre = v.titre and f.supprime_le is null);
