alter table operations add column if not exists a_verifier text;
comment on column operations.a_verifier is 'Question ouverte sur cette opération (affichée en ambre, filtrable). Null si rien à vérifier.';
