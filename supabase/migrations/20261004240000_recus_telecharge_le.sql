-- 04/10/2026 — Suivi du téléchargement des reçus : recus.telecharge_le = date à laquelle le reçu a
-- été enregistré (ZIP ou « Télécharger ») ; vide = « à télécharger ».
-- Les reçus édités avant le 03/10/2026 sont considérés comme déjà téléchargés.
alter table public.recus add column if not exists telecharge_le timestamptz;
update public.recus set telecharge_le = now() where date_edition < '2026-10-03' and telecharge_le is null;
