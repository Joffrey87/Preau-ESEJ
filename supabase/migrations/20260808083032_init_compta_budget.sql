-- ============================================================
-- Trésorier ESEJ — Schéma V1 : Comptabilité + Budget
-- ============================================================

-- Exercices comptables (années de trésorerie)
create table public.exercices (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  date_debut date not null,
  date_fin date not null,
  actif boolean not null default false,
  created_at timestamptz not null default now()
);

-- Comptes (bancaires / caisse)
create table public.comptes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text not null default 'courant' check (type in ('courant','epargne','especes','autre')),
  solde_initial numeric(12,2) not null default 0,
  ordre int not null default 0,
  archive boolean not null default false,
  created_at timestamptz not null default now()
);

-- Catégories de recettes / dépenses
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text not null check (type in ('recette','depense')),
  ordre int not null default 0,
  archive boolean not null default false,
  created_at timestamptz not null default now(),
  unique (nom, type)
);

-- Opérations (recettes / dépenses)
create table public.operations (
  id uuid primary key default gen_random_uuid(),
  date_operation date not null default current_date,
  libelle text not null,
  montant numeric(12,2) not null check (montant >= 0),
  type text not null check (type in ('recette','depense')),
  categorie_id uuid references public.categories(id) on delete set null,
  compte_id uuid references public.comptes(id) on delete set null,
  exercice_id uuid references public.exercices(id) on delete set null,
  mode_paiement text check (mode_paiement in ('virement','cheque','especes','carte','prelevement','autre')),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index operations_date_idx on public.operations (date_operation desc);
create index operations_categorie_idx on public.operations (categorie_id);
create index operations_exercice_idx on public.operations (exercice_id);

-- Lignes de budget prévisionnel (par catégorie et par exercice)
create table public.budget_lignes (
  id uuid primary key default gen_random_uuid(),
  exercice_id uuid not null references public.exercices(id) on delete cascade,
  categorie_id uuid not null references public.categories(id) on delete cascade,
  montant_prevu numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (exercice_id, categorie_id)
);

-- ============================================================
-- Sécurité : RLS. Tout utilisateur authentifié (membre du bureau)
-- a accès complet ; l'anonyme (non connecté) n'a aucun accès.
-- ============================================================
alter table public.exercices     enable row level security;
alter table public.comptes        enable row level security;
alter table public.categories     enable row level security;
alter table public.operations     enable row level security;
alter table public.budget_lignes  enable row level security;

create policy "auth_all" on public.exercices    for all to authenticated using (true) with check (true);
create policy "auth_all" on public.comptes       for all to authenticated using (true) with check (true);
create policy "auth_all" on public.categories    for all to authenticated using (true) with check (true);
create policy "auth_all" on public.operations    for all to authenticated using (true) with check (true);
create policy "auth_all" on public.budget_lignes for all to authenticated using (true) with check (true);

-- ============================================================
-- Données de départ
-- ============================================================

-- Exercice courant (année scolaire sept→août — À AJUSTER si l'ARIL
-- fonctionne en année civile).
insert into public.exercices (libelle, date_debut, date_fin, actif)
values ('Exercice 2025-2026', '2025-09-01', '2026-08-31', true);

-- Compte par défaut
insert into public.comptes (nom, type, ordre)
values ('Compte courant', 'courant', 0);

-- Catégories de recettes
insert into public.categories (nom, type, ordre) values
  ('Frais de scolarité', 'recette', 1),
  ('Dons',               'recette', 2),
  ('Subventions',        'recette', 3),
  ('Cotisations',        'recette', 4),
  ('Événements',         'recette', 5),
  ('Autres recettes',    'recette', 9);

-- Catégories de dépenses
insert into public.categories (nom, type, ordre) values
  ('Salaires & charges',    'depense', 1),
  ('Loyer & charges',       'depense', 2),
  ('Fournitures scolaires', 'depense', 3),
  ('Entretien & travaux',   'depense', 4),
  ('Assurances',            'depense', 5),
  ('Frais bancaires',       'depense', 6),
  ('Événements',            'depense', 7),
  ('Autres dépenses',       'depense', 9);
