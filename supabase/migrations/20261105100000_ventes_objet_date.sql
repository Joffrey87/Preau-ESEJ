-- Ventes diverses : date modifiable d'un objet de vente (événement).
-- Vide = on affiche la date de création. Retour arrière : alter table public.ventes_sous_categories drop column date_evenement;
alter table public.ventes_sous_categories add column if not exists date_evenement date;
