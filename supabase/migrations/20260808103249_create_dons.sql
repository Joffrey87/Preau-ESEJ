CREATE TABLE dons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercice_id uuid REFERENCES exercices(id),
  date_don date NOT NULL DEFAULT CURRENT_DATE,
  -- Donateur
  donateur_civilite text,                 -- 'M.', 'Mme', 'M. et Mme', '' (personne morale)
  donateur_nom text NOT NULL,             -- nom complet ou raison sociale
  donateur_adresse text,
  donateur_code_postal text,
  donateur_ville text,
  donateur_email text,
  est_personne_morale boolean NOT NULL DEFAULT false,
  -- Don
  montant numeric NOT NULL CHECK (montant > 0),
  forme text NOT NULL DEFAULT 'numeraire'
    CHECK (forme = ANY (ARRAY['numeraire','titres','autre'])),
  mode_versement text
    CHECK (mode_versement = ANY (ARRAY['especes','cheque','virement','carte','prelevement','autre'])),
  nature text,                            -- description si don en nature
  -- Reçu fiscal CERFA 11580
  recu_numero text UNIQUE,                -- numéro d'ordre du reçu, une fois émis
  recu_emis_le date,
  recu_envoye boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dons ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_all ON dons
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX dons_date_idx ON dons (date_don DESC);
CREATE INDEX dons_exercice_idx ON dons (exercice_id);
