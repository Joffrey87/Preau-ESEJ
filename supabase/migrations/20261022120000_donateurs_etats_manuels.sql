-- Donateurs : états manuels (Remercié, Sans réponse, à relancer, Ne plus solliciter) portés par les lignes du Suivi ;
-- « Aucun » retire l'état manuel. Additif : contrainte élargie, aucune donnée modifiée.
alter table public.suivi_actions drop constraint if exists suivi_actions_etat_check;
alter table public.suivi_actions add constraint suivi_actions_etat_check
  check (etat is null or etat in ('À contacter', 'Contacté', 'En réflexion', 'Promesse de don', 'Don reçu', 'À relancer',
    'Refus', 'Ne plus solliciter', 'Pas contacté', 'Promesse', 'Donateur', 'En pause', 'Perdu',
    'Sans réponse, à relancer', 'Pas intéressé', 'Remercié', 'Aucun'));
