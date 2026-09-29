-- Deux coffres : 1 = dons, 2 = carnet d'adresses (prénoms des élèves, fiches).
-- La contrainte d'origine n'autorisait que le coffre des dons, ce qui empêchait
-- de créer celui du carnet (« violates check constraint coffre_singleton »).
-- Appliquée le 29/09/2026.

alter table public.coffre drop constraint if exists coffre_singleton;
alter table public.coffre add constraint coffre_singleton check (id in (1, 2));
