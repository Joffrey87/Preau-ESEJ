-- 15/10/2026 — Fiches d'aide Professeurs : niveaux d'une évaluation, barre d'élèves des Bulletins, Catéchisme réservé
-- au Directeur spirituel.
update public.fiches_aide
   set etapes = '["Notes & Bulletins › onglet « Relevés de notes » : choisissez la classe et la période.", "Cliquez sur le nom de la matière, ou sur une case (un « + » apparaît au survol) : la saisie s''ouvre au-dessus du tableau.", "« + Évaluation » : titre, date, coefficient, barème (noté sur 20, sur 10…) et, dans une classe à plusieurs niveaux, le ou les niveaux concernés (CE1, CE2… à cocher), puis « Créer ».", "Tapez chaque note : elle s''enregistre d''elle-même, au fil de la frappe. Les cases des élèves d''un autre niveau sont grisées.", "En bas : « Enregistrer et revenir au relevé »."]'::jsonb,
       modifie_le = now()
 where titre = 'Créer une évaluation et saisir les notes' and supprime_le is null;

update public.fiches_aide
   set etapes = '["Notes & Bulletins › onglet « Bulletins » : choisissez la classe et une période du trimestre.", "Choisissez l''élève dans la barre du haut : un bouton par élève, regroupés par niveau ; ‹ › pour passer au suivant, « Tous » pour la liste complète.", "Les moyennes sont calculées seules (moyenne simple sur 20 de toutes les notes du trimestre).", "Chaque matière a son appréciation, face à sa moyenne : écrivez celle de vos matières (la titulaire peut les écrire toutes).", "Titulaire : rédigez l''« Appréciation du trimestre » de chaque élève, puis « Marquer prêt »."]'::jsonb,
       modifie_le = now()
 where titre = 'Bulletin du trimestre : appréciations' and supprime_le is null;

update public.fiches_aide
   set points_attention = 'Pas de note ni de moyenne en Catéchisme : il n''entre pas dans la moyenne générale. L''appréciation est rédigée par le Directeur spirituel seul.',
       modifie_le = now()
 where titre = 'Catéchisme : appréciation seule' and supprime_le is null;
