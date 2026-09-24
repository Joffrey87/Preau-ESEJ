CREATE TABLE organisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  denomination text,               -- ex. « ARIL - Association Rémoise pour l'Instruction Libre »
  adresse text,
  code_postal text,
  ville text,
  objet text,                      -- objet de l'association (figure sur le reçu)
  type_organisme text,             -- ex. « Association d'intérêt général à caractère éducatif »
  article_cgi text,                -- ex. « 200 » (dons des particuliers) / « 238 bis »
  signataire_nom text,
  signataire_qualite text,         -- ex. « Trésorier »
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organisation ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_all ON organisation
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Une seule ligne de configuration, créée vide (à compléter dans Paramètres).
INSERT INTO organisation (denomination) VALUES (NULL);
