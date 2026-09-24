-- Conserver le libellé bancaire brut (moche) tout en affichant un libellé propre.
alter table public.operations add column if not exists libelle_origine text;
