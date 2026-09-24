-- Module « En cours » : factures/dettes ponctuelles et échéances récurrentes,
-- à payer (dettes fournisseurs) ou à recevoir (créances hors scolarité).
create table if not exists public.echeances (
  id uuid primary key default gen_random_uuid(),
  sens text not null check (sens in ('a_payer', 'a_recevoir')),
  libelle text not null,
  tiers text,
  montant numeric not null,
  date_echeance date,                 -- nullable : dette qui traîne sans date précise
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'regle', 'annule')),
  recurrence text check (recurrence in ('mensuel', 'trimestriel', 'annuel')),
  categorie_id uuid references public.categories(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  regle_le date,                      -- date effective du règlement/encaissement
  created_at timestamptz not null default now()
);

alter table public.echeances enable row level security;

create policy echeances_auth_all on public.echeances
  for all to authenticated using (true) with check (true);

create index if not exists echeances_statut_idx on public.echeances (statut);
create index if not exists echeances_sens_idx on public.echeances (sens);
