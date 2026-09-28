-- Traçabilité des imports de relevés bancaires, pour pouvoir annuler un import.
-- Chaque opération (ligne bancaire et sous-écritures) et chaque don créés par
-- un import portent l'identifiant du lot. L'annulation supprime les opérations
-- du lot (sous-écritures et rattachements aux familles suivent par cascade) et
-- les dons qu'il a créés ; un don existant simplement relié retrouve son état
-- (operation_id remis à null par la contrainte ON DELETE SET NULL).

create table if not exists public.imports_releve (
  id uuid primary key default gen_random_uuid(),
  fichier text,
  compte_id uuid references public.comptes(id) on delete set null,
  nb_operations integer not null default 0,
  total_recettes numeric not null default 0,
  total_depenses numeric not null default 0,
  -- Contrôle du solde au moment de l'import (null si le relevé n'en porte pas).
  solde_banque numeric,
  solde_date date,
  solde_preau numeric,
  cree_le timestamptz not null default now(),
  cree_par uuid default auth.uid(),
  annule_le timestamptz,
  annule_par uuid
);

alter table public.imports_releve enable row level security;
drop policy if exists imports_releve_auth_all on public.imports_releve;
create policy imports_releve_auth_all on public.imports_releve
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.imports_releve to authenticated, service_role;

alter table public.operations add column if not exists import_id uuid
  references public.imports_releve(id) on delete set null;
alter table public.dons add column if not exists import_id uuid
  references public.imports_releve(id) on delete set null;
create index if not exists operations_import_id_idx on public.operations(import_id);
create index if not exists dons_import_id_idx on public.dons(import_id);

comment on table public.imports_releve is 'Lots d''import de relevés bancaires (annulables).';
comment on column public.operations.import_id is 'Lot d''import de relevé qui a créé cette opération.';
comment on column public.dons.import_id is 'Lot d''import de relevé qui a créé ce don.';
