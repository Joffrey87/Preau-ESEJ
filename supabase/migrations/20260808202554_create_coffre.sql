-- Coffre de chiffrement (métadonnées non secrètes) : sels + DEK emballée par la
-- phrase ET par le code de secours + canari. AUCUN secret en clair ici : la
-- phrase/le code ne sont jamais stockés ; sans eux, dek_* est indéchiffrable.
create table if not exists public.coffre (
  id int primary key default 1,
  sel_phrase text not null,
  sel_secours text not null,
  dek_phrase text not null,   -- DEK chiffrée par la clé dérivée de la phrase
  dek_secours text not null,  -- DEK chiffrée par la clé dérivée du code de secours
  canari text not null,       -- témoin chiffré par la DEK (vérifie l'ouverture)
  cree_le timestamptz not null default now(),
  constraint coffre_singleton check (id = 1)
);

alter table public.coffre enable row level security;
create policy coffre_auth_all on public.coffre
  for all to authenticated using (true) with check (true);

-- Blob chiffré des données personnelles du donateur (nom, prénom, raison,
-- adresse, cp_ville, courriel) ; les colonnes en clair seront vidées après migration.
alter table public.dons add column if not exists pii_chiffre text;
