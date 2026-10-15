-- 15/10/2026 — Une évaluation ne concerne que les élèves d'un ou de plusieurs niveaux de la classe (classe à plusieurs
-- niveaux : CE1 / CE2 / CM1). Vide = toute la classe (évaluations existantes).
alter table public.evaluations add column if not exists niveaux text[] not null default '{}';
