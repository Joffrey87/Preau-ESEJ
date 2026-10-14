-- Prospects : nouveaux types (Particulier, Pro, Association, Communauté, Autre + précision libre) et nouveaux
-- libellés d'état. Additif : les anciennes valeurs restent permises et ne sont pas converties.

alter table public.prospects add column if not exists type_autre text;

alter table public.prospects drop constraint if exists prospects_segment_check;
alter table public.prospects add constraint prospects_segment_check
  check (segment in ('cercle_interieur', 'particulier', 'grand_donateur', 'entreprise', 'fondation', 'reseau_catho', 'autre',
    'pro', 'association', 'communaute'));

alter table public.prospects drop constraint if exists prospects_etat_unifie_check;
alter table public.prospects add constraint prospects_etat_unifie_check
  check (etat_unifie is null or etat_unifie in ('Pas contacté', 'Contacté', 'Promesse', 'Donateur', 'En pause', 'Perdu',
    'Sans réponse, à relancer', 'Pas intéressé'));

alter table public.suivi_actions drop constraint if exists suivi_actions_etat_check;
alter table public.suivi_actions add constraint suivi_actions_etat_check
  check (etat is null or etat in ('À contacter', 'Contacté', 'En réflexion', 'Promesse de don', 'Don reçu', 'À relancer',
    'Refus', 'Ne plus solliciter', 'Pas contacté', 'Promesse', 'Donateur', 'En pause', 'Perdu',
    'Sans réponse, à relancer', 'Pas intéressé'));
