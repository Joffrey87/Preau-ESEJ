-- 06/11/2026 — Sémantique de date_don (déjà présente, NOT NULL).
-- Date du don = date fiscale affichée sur le reçu.
-- Distincte de operations.date_operation (= date de versement bancaire),
-- souvent postérieure pour les virements HelloAsso groupés.
-- Pas de nouvelle colonne : date_don existe depuis create_dons.

comment on column public.dons.date_don is
  'Date du don (reçu fiscal). Distincte de la date de versement bancaire (operations.date_operation), souvent postérieure pour HelloAsso.';
