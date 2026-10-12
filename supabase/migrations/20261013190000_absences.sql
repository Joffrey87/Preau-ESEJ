-- 13/10/2026 — ABSENCES : appel par demi-journée, absences et retards, total sur le bulletin, onglet « Absences » de
-- l'Espace famille. Reprise d'École Futée (2025-2026 et début 2026-2027) par un import séparé.
--
-- Droits : la titulaire fait l'appel de sa classe ; la Directrice corrige et justifie ; les intervenants d'une classe
-- lisent ; une famille lit les absences de ses enfants.

-- ─── Appels (une classe, une demi-journée) ──────────────────────────────────────────────────────────────────────
create table if not exists public.appels (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  date date not null,
  demi_journee text not null check (demi_journee in ('matin', 'apres_midi')),
  fait_par uuid default auth.uid(),
  fait_le timestamptz not null default now(),
  unique (classe_id, date, demi_journee)
);

-- ─── Absences et retards (un élève, une demi-journée) ──────────────────────────────────────────────────────────
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  date date not null,
  demi_journee text not null check (demi_journee in ('matin', 'apres_midi')),
  type text not null check (type in ('absence_injustifiee', 'absence_justifiee', 'rdv_medical', 'imperatif_familial', 'retard', 'retard_excuse')),
  remarque text,
  source text,
  saisi_par uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (eleve_id, date, demi_journee)
);
create index if not exists absences_date_idx on public.absences (date);

-- L'élève est-il dans une classe que je titularise (écriture) ou où j'enseigne (lecture) ?
create or replace function public.eleve_de_ma_classe(p_eleve uuid, p_ecriture boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classe_eleves ce
                  where ce.eleve_id = p_eleve
                    and (case when p_ecriture then public.est_titulaire(ce.classe_id) else public.enseigne_dans(ce.classe_id) end));
$$;
revoke all on function public.eleve_de_ma_classe(uuid, boolean) from public, anon;
grant execute on function public.eleve_de_ma_classe(uuid, boolean) to authenticated;

alter table public.appels enable row level security;
alter table public.absences enable row level security;

drop policy if exists appels_lecture on public.appels;
create policy appels_lecture on public.appels for select using (public.est_directrice() or public.enseigne_dans(classe_id));
drop policy if exists appels_ecriture on public.appels;
create policy appels_ecriture on public.appels for all
  using (public.est_directrice() or public.est_titulaire(classe_id))
  with check (public.est_directrice() or public.est_titulaire(classe_id));

drop policy if exists absences_lecture on public.absences;
create policy absences_lecture on public.absences for select using (
  public.est_directrice() or public.eleve_de_ma_classe(eleve_id, false)
  or exists (select 1 from eleves e where e.id = eleve_id and e.famille_id = public.ma_famille()));
drop policy if exists absences_ecriture on public.absences;
create policy absences_ecriture on public.absences for all
  using (public.est_directrice() or public.eleve_de_ma_classe(eleve_id, true))
  with check (public.est_directrice() or public.eleve_de_ma_classe(eleve_id, true));

create or replace function public.absences_maj() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists absences_maj on public.absences;
create trigger absences_maj before update on public.absences for each row execute function public.absences_maj();

-- ─── Exception à la règle du CM2 ─────────────────────────────────────────────────────────────────────────────────
-- Juin reste dû pour cet élève malgré sa dernière année (décision du trésorier, 13/10/2026 : Hadrien Letellier et
-- Stanislas Picard, enregistrés pour leurs bulletins 2025-2026).
alter table public.eleves add column if not exists juin_du boolean not null default false;

-- L'Espace famille reçoit l'exception avec les élèves.
do $$
declare d text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'contenu_espace_famille' and pronamespace = 'public'::regnamespace;
  if d is not null and position('juin_du' in d) = 0 then
    execute replace(d, '''sorti_le'', e.sorti_le)', '''sorti_le'', e.sorti_le, ''juin_du'', e.juin_du)');
  end if;
end $$;
