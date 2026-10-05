-- 05/10/2026 — Prospects : coordonnées personnelles chiffrées (comme les fiches donateur) et étiquette de liste.
--  - prospects.pii_chiffre : JSON chiffré par le coffre {titre, nom, prenom, adresse, cp_ville}. Quand il est présent,
--    la colonne `nom` ne porte qu'un libellé neutre (le vrai nom n'est lisible qu'avec le coffre ouvert).
--  - prospects.liste       : origine de la liste d'où vient le prospect (ex. « Liste Axel »), filtrable.

alter table public.prospects add column if not exists pii_chiffre text;
alter table public.prospects add column if not exists liste text;
create index if not exists prospects_liste_idx on public.prospects (liste);
