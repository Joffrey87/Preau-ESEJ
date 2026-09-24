ALTER TABLE budget_lignes
  ADD CONSTRAINT budget_lignes_exercice_categorie_key
  UNIQUE (exercice_id, categorie_id);
