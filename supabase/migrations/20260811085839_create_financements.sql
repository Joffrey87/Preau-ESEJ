create table if not exists public.financements (
  id uuid primary key default gen_random_uuid(),
  intitule text not null,
  axe text not null default 'autre',           -- entreprise | fondation | subvention | evenement | legs | autre
  organisme text,
  montant_vise numeric,
  montant_obtenu numeric not null default 0,
  echeance date,                                -- date de dépôt / décision
  statut text not null default 'piste',         -- piste | contact | dossier | depose | obtenu | refuse
  responsable text,
  contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  supprime_le timestamptz,
  supprime_par text
);

alter table public.financements enable row level security;

create policy financements_auth_all on public.financements
  for all to authenticated using (true) with check (true);
