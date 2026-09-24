-- Le nom du donateur passe en chiffré (pii_chiffre) → la colonne en clair doit
-- pouvoir être vidée après migration.
alter table public.dons alter column donateur_nom drop not null;
