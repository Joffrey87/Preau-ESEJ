-- Recettes manuelles d'un événement (chèque, carte, autre), validées ensuite par lien avec une opération bancaire.
create table if not exists public.evenement_recettes (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements_caisse(id) on delete cascade,
  mode text not null check (mode in ('cheque','carte','autre')),
  montant numeric(10,2) not null check (montant > 0),
  date date not null default current_date,
  libelle text,
  operation_id uuid references public.operations(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists evenement_recettes_evenement on public.evenement_recettes (evenement_id);
create index if not exists evenement_recettes_operation on public.evenement_recettes (operation_id);

alter table public.evenement_recettes enable row level security;
grant select, insert, update, delete on public.evenement_recettes to authenticated;
create policy evenement_recettes_tout on public.evenement_recettes for all to authenticated
  using (public.est_evenement() or public.est_tresorier())
  with check (public.est_evenement() or public.est_tresorier());

-- Seul le Trésorier valide (lie / délie) une recette ; une recette validée n'est plus modifiable par les membres.
create or replace function public.evenement_recettes_garde() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.est_tresorier() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.operation_id is not null then raise exception 'Seul le Trésorier valide une recette.'; end if;
    return new;
  end if;
  if old.operation_id is not null then raise exception 'Recette validée : seul le Trésorier peut la modifier.'; end if;
  if tg_op = 'UPDATE' and new.operation_id is not null then raise exception 'Seul le Trésorier valide une recette.'; end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists evenement_recettes_garde on public.evenement_recettes;
create trigger evenement_recettes_garde before insert or update or delete on public.evenement_recettes
  for each row execute function public.evenement_recettes_garde();
