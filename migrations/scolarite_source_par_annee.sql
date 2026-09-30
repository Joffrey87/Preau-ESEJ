-- Appliquée en base le 30/09/2026 (migration « scolarite_source_par_annee »).
--
-- Source des règlements de scolarité, année par année : la Comptabilité
-- (rattachements des écritures bancaires) ou le classeur (saisie à la main).
-- Objectif : toutes les années en « compta » une fois les rapprochements faits.
create table if not exists public.scolarite_annees (
  annee_scolaire text primary key,
  source text not null default 'classeur' check (source in ('compta', 'classeur')),
  modifie_le timestamptz not null default now()
);
alter table public.scolarite_annees enable row level security;
create policy scolarite_annees_lecture on public.scolarite_annees for select using (est_bureau());
create policy scolarite_annees_ecriture on public.scolarite_annees for all using (est_tresorier()) with check (est_tresorier());
insert into public.scolarite_annees (annee_scolaire, source) values
  ('2026-2027', 'compta'), ('2025-2026', 'classeur')
on conflict (annee_scolaire) do nothing;

comment on column public.scolarite_inscriptions.avance is
  'REPORT : crédit (ou dette si négatif) reporté de l''année précédente, saisi à la main ; compte dans le réglé. Ce n''est PAS le mois d''avance (dépôt), suivi par les affectations de nature mois_avance.';

-- Date jusqu'à laquelle les relevés bancaires sont intégrés (dernière écriture bancaire).
create or replace function public.date_maj_comptes()
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select max(date_operation) from operations
   where libelle_origine is not null or libelle_origine_chiffre is not null or import_id is not null
$$;
revoke all on function public.date_maj_comptes() from public, anon;
grant execute on function public.date_maj_comptes() to authenticated;

-- contenu_espace_famille(f) : réécrite à l'identique, avec deux clés de plus :
--   'sources' : { "2026-2027": "compta", … }  (select jsonb_object_agg(annee_scolaire, source) from scolarite_annees)
--   'maj'     : public.date_maj_comptes()
-- Voir la définition en base (pg_get_functiondef) pour le texte complet.
