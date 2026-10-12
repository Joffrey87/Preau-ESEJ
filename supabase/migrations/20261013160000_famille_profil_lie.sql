-- 13/10/2026 — Famille rattachée à un profil d'Administration (ex. : le Président, parent d'un ancien élève) :
-- ses pages d'Espace famille (Paiements, Ma famille) figurent dans le menu de ce profil, en lecture.
-- Aucun droit nouveau : le bureau lit déjà l'espace d'une famille (`espace_famille_apercu`).

alter table public.familles add column if not exists profil_lie text;
create unique index if not exists familles_profil_lie on public.familles (profil_lie) where profil_lie is not null;
