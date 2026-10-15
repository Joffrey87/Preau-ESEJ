-- 15/10/2026 — Saisie des notes : enregistrement automatique au fil de la frappe, bouton « Enregistrer et revenir au
-- relevé », « + » au survol des cases. Fiche d'aide « Créer une évaluation et saisir les notes » mise à jour.
update public.fiches_aide
   set etapes = '["Notes & Bulletins › onglet « Relevés de notes » : choisissez la classe et la période.", "Cliquez sur le nom de la matière, ou sur une case (un « + » apparaît au survol) : la saisie s''ouvre au-dessus du tableau.", "« + Évaluation » : titre, date, coefficient et barème (noté sur 20, sur 10…), puis « Créer ».", "Tapez chaque note : elle s''enregistre d''elle-même, au fil de la frappe.", "En bas : « Enregistrer et revenir au relevé »."]'::jsonb,
       points_attention = 'Saisie possible : un nombre (virgule acceptée), abs (absent), disp (dispensé), nr (non rendu) — ces trois-là ne comptent pas dans la moyenne. Même sans cliquer sur « Enregistrer », la saisie est enregistrée (coupure, retour en arrière).',
       modifie_le = now()
 where titre = 'Créer une évaluation et saisir les notes' and supprime_le is null;
