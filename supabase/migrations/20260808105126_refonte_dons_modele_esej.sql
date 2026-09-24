DROP TABLE IF EXISTS dons CASCADE;

CREATE TABLE dons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercice_id uuid REFERENCES exercices(id),
  origine text,                       -- « Origine donateur » (qui a amené le don)
  categorie_donateur text,            -- Particulier / Association / Entreprise / Professionnel / Communauté religieuse
  est_personne_morale boolean NOT NULL DEFAULT false,
  donateur_titre text,                -- texte libre : « Monsieur », « M et Mme », « Oeuvre Salésienne »…
  donateur_nom text NOT NULL,
  donateur_prenom text,
  raison_sociale text,                -- personne morale (<<RAISON>>)
  adresse text,
  cp_ville text,                      -- « 51100 Reims » (correspond au champ <<CP>> du modèle)
  courriel text,
  montant numeric NOT NULL CHECK (montant > 0),
  date_don date NOT NULL DEFAULT CURRENT_DATE,   -- date d'encaissement
  mode_paiement text,                 -- Virement / Chèque / Carte bancaire / Espèces / Nature…
  recu_numero text,                   -- « RE_000149_20250106 » — NON unique (regroupe des versements)
  recu_etat text,                     -- texte libre : « Envoyé - Courriel », « À envoyer »…
  recu_emis_le date,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dons ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_all ON dons
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX dons_date_idx ON dons (date_don DESC);
CREATE INDEX dons_recu_numero_idx ON dons (recu_numero);
