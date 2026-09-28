-- 28/09/2026 — décisions du trésorier (données, pas de schéma).
--
-- 1. Exercice actif : 2026-2027 (septembre 2026 → août 2027).
-- 2. Les trois catégories de scolarité deviennent une seule famille
--    « Frais de scolarité », précisée par sa caractéristique (mensualités, mois
--    d'avance, frais de dossier). Le Bilan les regroupe comme « Frais de
--    personnel : … ». La nature d'affectation reste déduite de la catégorie.
-- 3. Amitié Sainte Anne : ce ne sont pas des dons mais des frais de scolarité
--    payés pour des familles ; répartition proposée à l'import.
-- 4. Remise de chèques : plusieurs chèques, plusieurs objets → ventilation.
--
-- Retour arrière : voir le bloc en fin de fichier.

begin;

update exercices set actif = (libelle = 'Exercice 2026-2027');

update categories set nom = 'Frais de scolarité : Mensualités'   where nom = 'Paiement frais de scolarité';
update categories set nom = 'Frais de scolarité : Mois d''avance' where nom = 'Mois d''avance (dépôts)';
update categories set nom = 'Frais de scolarité : Frais de dossier' where nom = 'Frais de dossier';

update correspondances
   set categorie_id = (select id from categories where nom = 'Frais de scolarité : Mensualités'),
       libelle_modele = 'Frais de scolarité — Amitié Sainte Anne — {mois} {annee}',
       alerte_message = 'Amitié Sainte Anne : frais de scolarité payés pour une ou plusieurs familles. Vérifier la répartition proposée.',
       notes = 'Pas un don : répartition par famille proposée à l''import d''après le dernier versement.'
 where motif = 'amitie sainte anne';

update correspondances
   set alerte_message = 'Remise de chèques : détailler chaque chèque (tireur, objet) en sous-écritures.'
 where motif = 'rem chq';

-- La reconnaissance de la famille et de la nature est désormais automatique à l'import.
update correspondances
   set alerte = null, alerte_message = null,
       notes = 'Famille et nature reconnues automatiquement à l''import (alerte ambre en cas de doute).'
 where motif = 'scolarit';

commit;

-- Retour arrière :
-- update exercices set actif = (libelle = 'Exercice 2025-2026');
-- update categories set nom = 'Paiement frais de scolarité' where nom = 'Frais de scolarité : Mensualités';
-- update categories set nom = 'Mois d''avance (dépôts)'      where nom = 'Frais de scolarité : Mois d''avance';
-- update categories set nom = 'Frais de dossier'              where nom = 'Frais de scolarité : Frais de dossier';
-- update correspondances set categorie_id = (select id from categories where nom = 'Don d''Association'),
--   libelle_modele = 'Don Amitié Sainte Anne — {mois} {annee}',
--   alerte_message = 'ASA : don d''association. Une part peut être affectée aux frais de scolarité d''une famille lors de la ventilation.',
--   notes = 'Écriture typiquement à scinder.' where motif = 'amitie sainte anne';
-- update correspondances set alerte_message = 'Remise de chèque : déterminer s''il s''agit d''un don ou d''une vente au profit de l''école.' where motif = 'rem chq';
-- update correspondances set alerte = 'ambre', alerte_message = 'Rattacher à la famille concernée (carnet d''adresses), et préciser s''il s''agit d''un mois d''avance.',
--   notes = 'Le rapprochement automatique avec le carnet reste à faire.' where motif = 'scolarit';
