-- 04/10/2026 — « Ne veut pas de reçu fiscal » devient une valeur de la préférence d'envoi
-- portée par la fiche donateur (dons.envoi_prefere : courriel [vide], courrier, aucun).
alter table public.dons drop constraint if exists dons_envoi_prefere_check;
alter table public.dons
  add constraint dons_envoi_prefere_check
  check (envoi_prefere is null or envoi_prefere in ('courriel', 'courrier', 'aucun'));
