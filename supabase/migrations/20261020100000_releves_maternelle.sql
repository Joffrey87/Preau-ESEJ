-- 14/10/2026 — RELEVÉ D'APPRÉCIATIONS MATERNELLE (PS, MS, GS).
-- Matières fixées une fois par classe ; pour chaque élève et chaque période (ou trimestre) : un niveau par matière
-- (Acquis / En cours d'acquisition / Non acquis) et un commentaire, plus une appréciation générale.
-- Circuit : Brouillon → Prêt (titulaire) → Validé (Directrice seule). Non validé : ni visible des familles ni imprimable.
--
-- Migration strictement additive : nouvelles tables, fonctions et politiques uniquement.

create table if not exists public.maternelle_matieres (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  nom text not null,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists maternelle_matieres_classe on public.maternelle_matieres (classe_id);

create table if not exists public.releves_maternelle (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  -- Exactement l'un des deux : une période, ou un trimestre.
  periode_id uuid references public.periodes(id) on delete cascade,
  trimestre smallint check (trimestre between 1 and 3),
  appreciation text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'pret', 'valide')),
  valide_le timestamptz,
  valide_par uuid,
  updated_at timestamptz not null default now(),
  check ((periode_id is null) <> (trimestre is null))
);
create unique index if not exists releves_maternelle_periode on public.releves_maternelle (eleve_id, periode_id) where periode_id is not null;
create unique index if not exists releves_maternelle_trimestre on public.releves_maternelle (eleve_id, annee_scolaire, trimestre) where trimestre is not null;

create table if not exists public.releve_maternelle_lignes (
  releve_id uuid not null references public.releves_maternelle(id) on delete cascade,
  matiere_id uuid not null references public.maternelle_matieres(id) on delete cascade,
  niveau text check (niveau in ('acquis', 'en_cours', 'non_acquis')),
  commentaire text,
  updated_at timestamptz not null default now(),
  primary key (releve_id, matiere_id)
);

alter table public.maternelle_matieres enable row level security;
alter table public.releves_maternelle enable row level security;
alter table public.releve_maternelle_lignes enable row level security;

-- Matières : lecture par les enseignants de la classe, écriture par la titulaire et la Directrice.
drop policy if exists mat_matieres_lecture on public.maternelle_matieres;
create policy mat_matieres_lecture on public.maternelle_matieres for select to authenticated using (public.enseigne_dans(classe_id));
drop policy if exists mat_matieres_ecriture on public.maternelle_matieres;
create policy mat_matieres_ecriture on public.maternelle_matieres for all to authenticated
  using (public.est_directrice() or public.est_titulaire(classe_id))
  with check (public.est_directrice() or public.est_titulaire(classe_id));

-- Relevés : enseignants de la classe ; la famille ne lit que les relevés validés de ses enfants.
drop policy if exists releves_mat_lecture on public.releves_maternelle;
create policy releves_mat_lecture on public.releves_maternelle for select to authenticated using (
  public.enseigne_dans(classe_id)
  or (statut = 'valide' and exists (select 1 from eleves e where e.id = eleve_id and e.famille_id = public.ma_famille())));
drop policy if exists releves_mat_creation on public.releves_maternelle;
create policy releves_mat_creation on public.releves_maternelle for insert to authenticated
  with check (public.est_directrice() or (public.est_titulaire(classe_id) and statut <> 'valide'));
drop policy if exists releves_mat_modif on public.releves_maternelle;
create policy releves_mat_modif on public.releves_maternelle for update to authenticated
  using (public.est_directrice() or (public.est_titulaire(classe_id) and statut <> 'valide'))
  with check (public.est_directrice() or public.est_titulaire(classe_id));
drop policy if exists releves_mat_suppr on public.releves_maternelle;
create policy releves_mat_suppr on public.releves_maternelle for delete to authenticated using (public.est_directrice());

create or replace function public.releve_maternelle_modifiable(p_releve uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from releves_maternelle r where r.id = p_releve
                  and (public.est_directrice() or (public.est_titulaire(r.classe_id) and r.statut <> 'valide')));
$$;
revoke all on function public.releve_maternelle_modifiable(uuid) from public, anon;
grant execute on function public.releve_maternelle_modifiable(uuid) to authenticated;

drop policy if exists releve_lignes_lecture on public.releve_maternelle_lignes;
create policy releve_lignes_lecture on public.releve_maternelle_lignes for select to authenticated
  using (exists (select 1 from releves_maternelle r where r.id = releve_id));
drop policy if exists releve_lignes_ecriture on public.releve_maternelle_lignes;
create policy releve_lignes_ecriture on public.releve_maternelle_lignes for all to authenticated
  using (public.releve_maternelle_modifiable(releve_id)) with check (public.releve_maternelle_modifiable(releve_id));

-- Garde : seule la Directrice valide (ou dévalide) ; date et auteur de validation intouchables pour les autres.
create or replace function public.releves_maternelle_garde() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null then return new; end if;
  if public.est_directrice() then
    if new.statut = 'valide' and (tg_op = 'INSERT' or old.statut <> 'valide') then
      new.valide_le := now(); new.valide_par := auth.uid();
    elsif new.statut <> 'valide' then
      new.valide_le := null; new.valide_par := null;
    end if;
    return new;
  end if;
  if new.statut = 'valide' then raise exception 'Seule la Directrice valide un relevé'; end if;
  if tg_op = 'UPDATE' then new.valide_le := old.valide_le; new.valide_par := old.valide_par;
  else new.valide_le := null; new.valide_par := null; end if;
  return new;
end;
$$;
drop trigger if exists releves_maternelle_garde on public.releves_maternelle;
create trigger releves_maternelle_garde before insert or update on public.releves_maternelle
  for each row execute function public.releves_maternelle_garde();
