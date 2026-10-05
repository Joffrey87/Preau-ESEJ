-- 05/10/2026 — Prospects : le montant « Obtenu » n'est plus saisi, il est tiré des écritures comptables liées
-- (écriture mère ou fille de Comptabilité). Le lien est fait par le Trésorier (ou le Président / l'administrateur).
--  - prospects_ecritures : une ligne par écriture liée (une écriture ne sert qu'à un prospect) ;
--  - prospects_obtenus() : total lié par prospect, lisible aussi par les profils qui voient le pipeline sans lire la comptabilité.

create table if not exists public.prospects_ecritures (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  lie_le timestamptz not null default now(),
  lie_par text,
  unique (operation_id)
);
create index if not exists prospects_ecritures_prospect_idx on public.prospects_ecritures (prospect_id);

alter table public.prospects_ecritures enable row level security;

create policy prospects_ecritures_lecture on public.prospects_ecritures for select to authenticated
  using (public.mon_role() in ('president', 'tresorier', 'administrateur'));
create policy prospects_ecritures_ecriture on public.prospects_ecritures for all to authenticated
  using (public.mon_role() in ('president', 'tresorier', 'administrateur'))
  with check (public.mon_role() in ('president', 'tresorier', 'administrateur'));
grant select, insert, update, delete on public.prospects_ecritures to authenticated;

create or replace function public.prospects_obtenus()
returns table (prospect_id uuid, montant numeric, nb integer)
language sql stable security definer set search_path = public as $$
  select l.prospect_id, coalesce(sum(o.montant), 0)::numeric, count(*)::integer
    from public.prospects_ecritures l
    join public.operations o on o.id = l.operation_id
   where public.peut_voir_pipeline()
   group by l.prospect_id;
$$;
revoke all on function public.prospects_obtenus() from public, anon;
grant execute on function public.prospects_obtenus() to authenticated;
