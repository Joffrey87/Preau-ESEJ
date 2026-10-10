-- 06/10/2026 — Envoi d'un reçu par un « autre » moyen : précision libre (ex. « Transmis à JF »), conservée au registre
-- et reprise dans « Reçu – état » du don (« Envoyé le 06/10/2026 - Transmis à JF »).
alter table public.recus add column if not exists envoi_precision text;
comment on column public.recus.envoi_precision is 'Précision libre quand le moyen d''envoi est « autre » (ex. « Transmis à JF »).';
