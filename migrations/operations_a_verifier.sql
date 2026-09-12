-- Marqueur « à vérifier » sur une opération : le texte est la question à
-- trancher (ex. « frais de dossier ou vente ? »). Null = rien à vérifier.
-- La liste des opérations affiche ces lignes en ambre et propose un filtre.

alter table operations add column if not exists a_verifier text;

comment on column operations.a_verifier is
  'Question ouverte sur cette opération (affichée en ambre, filtrable). Null si rien à vérifier.';
