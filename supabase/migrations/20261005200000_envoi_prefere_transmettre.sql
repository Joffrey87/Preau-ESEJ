-- 05/10/2026 — Nouvelle préférence d'envoi des reçus : « À transmettre » (le reçu est remis à une
-- personne de contact ou à un courriel indiqué dans la fiche, chiffré avec elle).
-- dons.envoi_prefere : courriel [vide], courrier, aucun, transmettre.
alter table public.dons drop constraint if exists dons_envoi_prefere_check;
alter table public.dons
  add constraint dons_envoi_prefere_check
  check (envoi_prefere is null or envoi_prefere in ('courriel', 'courrier', 'aucun', 'transmettre'));
