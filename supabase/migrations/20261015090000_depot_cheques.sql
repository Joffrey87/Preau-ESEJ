-- 15/10/2026 — DÉPÔT DE CHÈQUES (Trésorier, Président, Directrice) : photo d'une remise (plusieurs chèques ou
-- bordereau), saisie de chaque chèque (montant, émetteur, date, motif), lien avec la Comptabilité.
-- Une remise ↔ une opération bancaire (crédit du total) ; un chèque ↔ un don ou une inscription de scolarité.
-- `lien_*` : « auto » (posé par Préau quand le rapprochement est évident) ou « manuel » (confirmé par le Trésorier).

create or replace function public.peut_deposer_cheques()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.mon_role() in ('tresorier', 'president', 'directrice');
$$;
revoke all on function public.peut_deposer_cheques() from public, anon;
grant execute on function public.peut_deposer_cheques() to authenticated;

create table if not exists public.remises_cheques (
  id uuid primary key default gen_random_uuid(),
  date_remise date not null default ((now() at time zone 'Europe/Paris')::date),
  photo_path text,
  notes text,
  operation_id uuid references public.operations(id) on delete set null,
  lien_operation text check (lien_operation in ('auto', 'manuel')),
  cree_par uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.cheques_remis (
  id uuid primary key default gen_random_uuid(),
  remise_id uuid not null references public.remises_cheques(id) on delete cascade,
  montant numeric(12, 2) not null check (montant > 0),
  emetteur text not null default '',
  date_cheque date,
  motif text not null default 'don' check (motif in ('don', 'frais_scolarite', 'frais_dossier', 'evenement', 'autre')),
  don_id uuid references public.dons(id) on delete set null,
  inscription_id uuid references public.scolarite_inscriptions(id) on delete set null,
  lien text check (lien in ('auto', 'manuel')),
  created_at timestamptz not null default now()
);
create index if not exists cheques_remis_remise_idx on public.cheques_remis (remise_id);

alter table public.remises_cheques enable row level security;
alter table public.cheques_remis enable row level security;

drop policy if exists remises_cheques_acces on public.remises_cheques;
create policy remises_cheques_acces on public.remises_cheques for all to authenticated
  using (public.peut_deposer_cheques()) with check (public.peut_deposer_cheques());
drop policy if exists cheques_remis_acces on public.cheques_remis;
create policy cheques_remis_acces on public.cheques_remis for all to authenticated
  using (public.peut_deposer_cheques()) with check (public.peut_deposer_cheques());

-- Photos des remises : bucket PRIVÉ (lecture par URL signée seulement).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cheques', 'cheques', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists cheques_lecture on storage.objects;
drop policy if exists cheques_ecriture on storage.objects;
create policy cheques_lecture on storage.objects for select to authenticated
  using (bucket_id = 'cheques' and public.peut_deposer_cheques());
create policy cheques_ecriture on storage.objects for all to authenticated
  using (bucket_id = 'cheques' and public.peut_deposer_cheques())
  with check (bucket_id = 'cheques' and public.peut_deposer_cheques());

notify pgrst, 'reload schema';
