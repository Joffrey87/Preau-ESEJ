-- 04/11/2026 — Notes & Bulletins :
--  1. Un compte peut tenir le rôle d'un enseignant en plus de son compte nominatif (table enseignants_comptes) :
--     mon_enseignant() le reconnaît, avec les mêmes droits (peut_noter, enseigne_dans…). Utilisé pour le compte
--     Trésorier, lié à l'enseignant « Joffrey Lenoble » (professeur d'Anglais).
--  2. Les affectations de données (matières, enseignants) sont faites à part, par des instructions de données
--     appliquées sur la base (voir le compte rendu de la branche notes-eulalie) : rien de nominatif dans ce fichier.

create table if not exists public.enseignants_comptes (
  enseignant_id uuid not null references public.enseignants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (enseignant_id, user_id)
);
alter table public.enseignants_comptes enable row level security;
revoke all on public.enseignants_comptes from anon;
drop policy if exists enseignants_comptes_lecture on public.enseignants_comptes;
create policy enseignants_comptes_lecture on public.enseignants_comptes for select to authenticated
  using (user_id = auth.uid() or public.est_directrice());

create or replace function public.mon_enseignant() returns uuid
language sql stable security definer set search_path = public as $$
  select e.id from enseignants e
   where e.actif and (e.user_id = auth.uid()
         or exists (select 1 from enseignants_comptes c where c.enseignant_id = e.id and c.user_id = auth.uid()))
   order by (e.user_id = auth.uid()) desc nulls last
   limit 1;
$$;
