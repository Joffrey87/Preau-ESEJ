-- Tâches personnelles par rôle (matrice d'Eisenhower) + événements partagés par groupe.

create table if not exists public.taches (
  id uuid primary key default gen_random_uuid(),
  role text not null,                 -- slug du rôle propriétaire (lib/roles.ts)
  titre text not null,
  description text,
  urgent boolean,                     -- null = non classé (cadran « À trier »)
  important boolean,                  -- null = non classé
  date_echeance date,
  fait boolean not null default false,
  ordre integer not null default 0,   -- ordre dans le cadran
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.taches enable row level security;
create policy taches_auth_all on public.taches for all to authenticated using (true) with check (true);
create index if not exists taches_role_idx on public.taches(role);

create table if not exists public.evenements (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  description text,
  groupe text not null,               -- 'ca' | 'ecole' | 'tous' (lib/evenements.ts)
  date_debut date not null,
  date_fin date,                      -- null = événement d'un seul jour
  heure text,                         -- ex. « 18h30 » (facultatif)
  lieu text,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.evenements enable row level security;
create policy evenements_auth_all on public.evenements for all to authenticated using (true) with check (true);
create index if not exists evenements_groupe_idx on public.evenements(groupe);
create index if not exists evenements_date_idx on public.evenements(date_debut);
