-- Pipeline grands donateurs & prospects (CRM léger) — phases 3/5/8/9 du plan V2.
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  segment text not null default 'particulier'
    check (segment in ('cercle_interieur','particulier','grand_donateur','entreprise','fondation','reseau_catho','autre')),
  etape text not null default 'identifie'
    check (etape in ('identifie','qualifie','contacte','rencontre','sollicite','don_recu','remercie','fidelise','perdu')),
  capacite text check (capacite in ('A','B','C')),
  montant_cible numeric,
  montant_obtenu numeric not null default 0,
  responsable text,
  prochaine_action text,
  prochaine_action_date date,
  contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prospects enable row level security;

create policy prospects_auth_all on public.prospects
  for all to authenticated using (true) with check (true);

create index if not exists prospects_etape_idx on public.prospects (etape);
create index if not exists prospects_segment_idx on public.prospects (segment);
