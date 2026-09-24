alter table public.dons
  add column if not exists supprime_le  timestamptz,
  add column if not exists supprime_par text;

alter table public.contacts
  add column if not exists supprime_le  timestamptz,
  add column if not exists supprime_par text;
