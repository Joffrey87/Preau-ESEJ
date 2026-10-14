-- 14/10/2026 — JOURNAL D'APPEL : calendrier des jours sans école (vacances de la zone B — académie de Reims —, ponts,
-- jours exceptionnels). Les jours fériés, mercredis, samedis et dimanches sont calculés par l'application.
-- Le taux de présentiel ne compte que les demi-journées où l'appel a été fait (tables appels / absences existantes) ;
-- l'appel « journée entière » enregistre simplement le matin et l'après-midi.
--
-- Migration strictement additive : une nouvelle table, aucune table existante modifiée.
-- Droits : tout compte connecté lit ; seule la Directrice modifie.

create table if not exists public.calendrier_scolaire (
  id uuid primary key default gen_random_uuid(),
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  debut date not null,
  fin date not null check (fin >= debut),
  libelle text not null,
  type text not null default 'vacances' check (type in ('vacances', 'pont', 'sans_ecole')),
  created_at timestamptz not null default now()
);
create index if not exists calendrier_scolaire_dates on public.calendrier_scolaire (debut, fin);

alter table public.calendrier_scolaire enable row level security;
drop policy if exists calendrier_lecture on public.calendrier_scolaire;
create policy calendrier_lecture on public.calendrier_scolaire for select to authenticated using (true);
drop policy if exists calendrier_ecriture on public.calendrier_scolaire;
create policy calendrier_ecriture on public.calendrier_scolaire for all to authenticated
  using (public.est_directrice()) with check (public.est_directrice());

-- Dates officielles zone B (premier et dernier jour sans classe).
insert into public.calendrier_scolaire (annee_scolaire, debut, fin, libelle, type)
select a, d::date, f::date, l, t from (values
  ('2025-2026', '2025-10-18', '2025-11-02', 'Vacances de la Toussaint', 'vacances'),
  ('2025-2026', '2025-12-20', '2026-01-04', 'Vacances de Noël', 'vacances'),
  ('2025-2026', '2026-02-14', '2026-03-01', 'Vacances d''hiver (zone B)', 'vacances'),
  ('2025-2026', '2026-04-11', '2026-04-26', 'Vacances de printemps (zone B)', 'vacances'),
  ('2025-2026', '2026-05-15', '2026-05-15', 'Pont de l''Ascension', 'pont'),
  ('2025-2026', '2026-07-04', '2026-08-31', 'Vacances d''été', 'vacances'),
  ('2026-2027', '2026-10-17', '2026-11-01', 'Vacances de la Toussaint', 'vacances'),
  ('2026-2027', '2026-12-19', '2027-01-03', 'Vacances de Noël', 'vacances'),
  ('2026-2027', '2027-02-20', '2027-03-07', 'Vacances d''hiver (zone B)', 'vacances'),
  ('2026-2027', '2027-04-17', '2027-05-02', 'Vacances de printemps (zone B)', 'vacances'),
  ('2026-2027', '2027-05-07', '2027-05-07', 'Pont de l''Ascension', 'pont'),
  ('2026-2027', '2027-07-03', '2027-08-31', 'Vacances d''été', 'vacances')) v(a, d, f, l, t)
where not exists (select 1 from public.calendrier_scolaire c where c.annee_scolaire = v.a);
