create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  civilite text,
  est_personne_morale boolean not null default false,
  nom text not null,
  prenom text,
  raison_sociale text,
  categories text[] not null default '{}',
  courriel text,
  telephone text,
  adresse text,
  cp_ville text,
  iban text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contacts enable row level security;

drop policy if exists contacts_auth_all on contacts;
create policy contacts_auth_all on contacts
  for all to authenticated using (true) with check (true);

create index if not exists contacts_categories_idx on contacts using gin (categories);
create index if not exists contacts_nom_idx on contacts (lower(nom));
