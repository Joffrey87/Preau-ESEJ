-- Barème mensuel par nombre d'enfants et par année scolaire.
CREATE TABLE scolarite_bareme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annee_scolaire text NOT NULL,          -- « 2026-2027 »
  nb_enfants int NOT NULL,
  montant_mensuel numeric NOT NULL CHECK (montant_mensuel >= 0),
  UNIQUE (annee_scolaire, nb_enfants)
);

-- Inscription = une famille pour une année scolaire, avec ses paiements.
-- Total dû = montant_mensuel × 10 (Sept→Juin). Réglé = avance + Σ mois.
CREATE TABLE scolarite_inscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annee_scolaire text NOT NULL,
  famille_nom text NOT NULL,
  nb_enfants int,
  emails text,
  montant_mensuel numeric NOT NULL DEFAULT 0,
  avance numeric,
  m_sept numeric, m_oct numeric, m_nov numeric, m_dec numeric, m_jan numeric,
  m_fev numeric, m_mars numeric, m_avr numeric, m_mai numeric, m_juin numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scolarite_bareme ENABLE ROW LEVEL SECURITY;
ALTER TABLE scolarite_inscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all ON scolarite_bareme FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all ON scolarite_inscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX scolarite_inscriptions_annee_idx ON scolarite_inscriptions (annee_scolaire);
